import { describe, expect, it } from "vitest";

import {
  buildDataExportArchive,
  createZipBlob,
  crc32,
  sanitizeArchivePath,
} from "./export";

async function readStoredZip(blob: Blob): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const decoder = new TextDecoder();
  const files = new Map<string, Uint8Array>();
  let offset = 0;

  while (offset + 4 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const compressedSize = view.getUint32(offset + 18, true);
    const fileNameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + fileNameLength));
    files.set(name, bytes.slice(dataStart, dataStart + compressedSize));
    offset = dataStart + compressedSize;
  }

  return files;
}

describe("ZIP and export helpers", () => {
  it("calculates the standard CRC-32 vector", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("normalizes portable paths and rejects traversal", () => {
    expect(sanitizeArchivePath("\u6210\u7ee9\\2026:期中?.csv")).toBe(
      "\u6210\u7ee9/2026_期中_.csv",
    );
    expect(() => sanitizeArchivePath("../secret.txt")).toThrow(/Unsafe/);
  });

  it("creates a readable store-only ZIP with Unicode names", async () => {
    const blob = await createZipBlob([
      { path: "成绩.csv", data: "考试,成绩\r\n期中,580" },
      { path: "images/paper.jpg", data: new Uint8Array([1, 2, 3]) },
    ]);
    const files = await readStoredZip(blob);

    expect(blob.type).toBe("application/zip");
    expect(new TextDecoder().decode(files.get("成绩.csv"))).toContain("期中,580");
    expect([...files.get("images/paper.jpg")!]).toEqual([1, 2, 3]);
  });

  it("builds a complete versioned data archive", async () => {
    const result = await buildDataExportArchive({
      schemaVersion: 1,
      exportedAt: new Date("2026-07-16T08:00:00.000Z"),
      data: { exams: [{ id: "exam-1" }] },
      csvFiles: { exams: "id\r\nexam-1" },
      reflections: [
        {
          id: "note-1",
          examName: "期中考试",
          authorName: "小明",
          createdAt: "2026-07-15T12:00:00.000Z",
          content: "下次认真验算。",
        },
      ],
      attachmentManifest: [{ id: "image-1", path: "paper.jpg" }],
      attachments: [{ path: "paper.jpg", data: new Uint8Array([255, 216, 255]) }],
    });
    const files = await readStoredZip(result.blob);

    expect(result.fileName).toBe("grade-journal-export-2026-07-16.zip");
    expect([...files.keys()]).toEqual([
      "manifest.json",
      "data.json",
      "notes/reflections.md",
      "attachments/manifest.json",
      "csv/exams.csv",
      "attachments/files/paper.jpg",
    ]);
    expect(new TextDecoder().decode(files.get("manifest.json"))).toContain(
      '"schema_version": 1',
    );
    expect(new TextDecoder().decode(files.get("notes/reflections.md"))).toContain(
      "下次认真验算。",
    );
  });
});
