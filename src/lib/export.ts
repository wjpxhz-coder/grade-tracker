export type ArchiveSource = string | Uint8Array | ArrayBuffer | Blob;

export interface ZipEntry {
  path: string;
  data: ArchiveSource;
  modifiedAt?: Date;
}

export interface ExportReflection {
  id: string;
  examName: string;
  authorName: string;
  createdAt: string;
  content: string;
}

export interface ExportAttachment {
  /** Relative path below attachments/files in the ZIP. */
  path: string;
  data: ArchiveSource;
  modifiedAt?: Date;
}

export interface DataExportInput<TData = unknown, TAttachmentManifest = unknown> {
  schemaVersion: string | number;
  data: TData;
  exportedAt?: Date;
  csvFiles?: Readonly<Record<string, string>>;
  reflections?: readonly ExportReflection[];
  attachmentManifest?: TAttachmentManifest;
  attachments?: readonly ExportAttachment[];
}

export interface DataExportManifest {
  schema_version: string | number;
  exported_at: string;
  format: "grade-journal-export";
  csv_file_count: number;
  reflection_count: number;
  attachment_count: number;
}

export interface DataExportArchive {
  blob: Blob;
  fileName: string;
  manifest: DataExportManifest;
}

const UTF8_FLAG = 0x0800;
const STORE_METHOD = 0;
let crcTable: Uint32Array | undefined;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    crcTable[index] = value >>> 0;
  }
  return crcTable;
}

export function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

function concatBytes(
  parts: readonly Uint8Array<ArrayBufferLike>[],
): Uint8Array<ArrayBuffer> {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

async function sourceToBytes(source: ArchiveSource): Promise<Uint8Array> {
  if (typeof source === "string") return new TextEncoder().encode(source);
  if (source instanceof Uint8Array) return source;
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  return new Uint8Array(await source.arrayBuffer());
}

function dosDateTime(date: Date): { date: number; time: number } {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
  };
}

/** Reject traversal and normalize names for portable extraction. */
export function sanitizeArchivePath(path: string): string {
  const pieces = path
    .replaceAll("\\", "/")
    .split("/")
    .filter((piece) => piece !== "" && piece !== ".");

  if (pieces.length === 0 || pieces.some((piece) => piece === "..")) {
    throw new Error(`Unsafe or empty archive path: ${path}`);
  }

  return pieces
    .map((piece) => piece.replace(/[\u0000-\u001f<>:"|?*]/g, "_"))
    .join("/");
}

/**
 * Creates a standards-compliant, UTF-8 ZIP using the STORE method. Grade
 * exports are already dominated by compressed images, so another dependency
 * and CPU-heavy deflate pass provide little benefit.
 */
export async function createZipBlob(entries: readonly ZipEntry[]): Promise<Blob> {
  const encoder = new TextEncoder();
  const seenPaths = new Set<string>();
  const localParts: BlobPart[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const path = sanitizeArchivePath(entry.path);
    if (seenPaths.has(path)) throw new Error(`Duplicate archive path: ${path}`);
    seenPaths.add(path);

    const fileName = encoder.encode(path);
    const data = await sourceToBytes(entry.data);
    const checksum = crc32(data);
    const timestamp = dosDateTime(entry.modifiedAt ?? new Date());

    const localHeader = new Uint8Array(30 + fileName.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, UTF8_FLAG);
    writeUint16(localView, 8, STORE_METHOD);
    writeUint16(localView, 10, timestamp.time);
    writeUint16(localView, 12, timestamp.date);
    writeUint32(localView, 14, checksum);
    writeUint32(localView, 18, data.length);
    writeUint32(localView, 22, data.length);
    writeUint16(localView, 26, fileName.length);
    writeUint16(localView, 28, 0);
    localHeader.set(fileName, 30);

    const centralHeader = new Uint8Array(46 + fileName.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, UTF8_FLAG);
    writeUint16(centralView, 10, STORE_METHOD);
    writeUint16(centralView, 12, timestamp.time);
    writeUint16(centralView, 14, timestamp.date);
    writeUint32(centralView, 16, checksum);
    writeUint32(centralView, 20, data.length);
    writeUint32(centralView, 24, data.length);
    writeUint16(centralView, 28, fileName.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, localOffset);
    centralHeader.set(fileName, 46);

    // Keep downloaded images as Blob references in the final archive instead
    // of retaining another full byte-array copy for every attachment.
    const storedData: BlobPart = entry.data instanceof Blob
      ? entry.data
      : new Uint8Array(data).buffer;
    localParts.push(localHeader.buffer, storedData);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + data.length;
  }

  const centralDirectory = concatBytes(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, entries.length);
  writeUint16(endView, 10, entries.length);
  writeUint32(endView, 12, centralDirectory.length);
  writeUint32(endView, 16, localOffset);
  writeUint16(endView, 20, 0);

  return new Blob([...localParts, centralDirectory.buffer, end.buffer], {
    type: "application/zip",
  });
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function reflectionsToMarkdown(reflections: readonly ExportReflection[]): string {
  if (reflections.length === 0) return "# 心得\n\n暂无心得。\n";
  return [
    "# 心得",
    "",
    ...reflections.flatMap((reflection) => [
      `## ${reflection.examName}`,
      "",
      `- 作者：${reflection.authorName}`,
      `- 时间：${reflection.createdAt}`,
      `- 记录 ID：${reflection.id}`,
      "",
      reflection.content,
      "",
    ]),
  ].join("\n");
}

function portableFilePart(value: string): string {
  const cleaned = value.replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/^_+|_+$/g, "");
  return cleaned || "data";
}

export async function buildDataExportArchive<TData, TAttachmentManifest = unknown>(
  input: DataExportInput<TData, TAttachmentManifest>,
): Promise<DataExportArchive> {
  const exportedAt = input.exportedAt ?? new Date();
  const csvFiles = Object.entries(input.csvFiles ?? {});
  const reflections = input.reflections ?? [];
  const attachments = input.attachments ?? [];
  const manifest: DataExportManifest = {
    schema_version: input.schemaVersion,
    exported_at: exportedAt.toISOString(),
    format: "grade-journal-export",
    csv_file_count: csvFiles.length,
    reflection_count: reflections.length,
    attachment_count: attachments.length,
  };

  const entries: ZipEntry[] = [
    { path: "manifest.json", data: json(manifest), modifiedAt: exportedAt },
    {
      path: "data.json",
      data: json({
        schema_version: input.schemaVersion,
        exported_at: exportedAt.toISOString(),
        data: input.data,
      }),
      modifiedAt: exportedAt,
    },
    {
      path: "notes/reflections.md",
      data: reflectionsToMarkdown(reflections),
      modifiedAt: exportedAt,
    },
    {
      path: "attachments/manifest.json",
      data: json(input.attachmentManifest ?? []),
      modifiedAt: exportedAt,
    },
  ];

  for (const [name, contents] of csvFiles) {
    const path = `csv/${portableFilePart(name.replace(/\.csv$/i, ""))}.csv`;
    entries.push({ path, data: contents, modifiedAt: exportedAt });
  }

  for (const attachment of attachments) {
    entries.push({
      path: `attachments/files/${sanitizeArchivePath(attachment.path)}`,
      data: attachment.data,
      modifiedAt: attachment.modifiedAt ?? exportedAt,
    });
  }

  const day = exportedAt.toISOString().slice(0, 10);
  return {
    blob: await createZipBlob(entries),
    fileName: `grade-journal-export-${day}.zip`,
    manifest,
  };
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
