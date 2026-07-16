export const SUPPORTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface HeicConversionRequest {
  blob: Blob;
  outputType: "image/jpeg";
  quality: number;
}

export type HeicConverter = (
  request: HeicConversionRequest,
) => Promise<Blob | readonly Blob[]>;

export type Heic2AnyCompatible = (options: {
  blob: Blob;
  toType: string;
  quality: number;
}) => Promise<Blob | Blob[]>;

export interface OptimizeImageOptions {
  maxInputBytes?: number;
  maxLongEdge?: number;
  maxOutputBytes?: number;
  quality?: number;
  thumbnailLongEdge?: number;
  thumbnailQuality?: number;
  outputType?: "image/jpeg" | "image/webp";
  jpegBackground?: string;
  heicConverter?: HeicConverter;
}

export interface OptimizedImage {
  image: File;
  thumbnail: File;
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
  sha256: string | null;
}

export class ImageProcessingError extends Error {
  constructor(
    public readonly code:
      | "UNSUPPORTED_TYPE"
      | "FILE_TOO_LARGE"
      | "HEIC_CONVERTER_REQUIRED"
      | "HEIC_CONVERSION_FAILED"
      | "DECODE_FAILED"
      | "ENCODE_FAILED",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ImageProcessingError";
  }
}

const DEFAULTS = {
  maxInputBytes: 30 * 1024 * 1024,
  maxLongEdge: 2400,
  maxOutputBytes: 3 * 1024 * 1024,
  quality: 0.86,
  thumbnailLongEdge: 480,
  thumbnailQuality: 0.72,
  outputType: "image/jpeg" as const,
  jpegBackground: "#ffffff",
};

type NamedImage = Pick<File, "name" | "type" | "size">;

export function isHeicImage(file: Pick<NamedImage, "name" | "type">): boolean {
  return (
    file.type.toLowerCase() === "image/heic" ||
    file.type.toLowerCase() === "image/heif" ||
    /\.(?:heic|heif)$/i.test(file.name)
  );
}

export function isSupportedImage(
  file: Pick<NamedImage, "name" | "type">,
): boolean {
  if (isHeicImage(file)) return true;
  return (
    file.type === "image/jpeg" ||
    file.type === "image/png" ||
    file.type === "image/webp" ||
    (/\.(?:jpe?g|png|webp)$/i.test(file.name) && file.type === "")
  );
}

export function validateImageFile(
  file: NamedImage,
  maxInputBytes = DEFAULTS.maxInputBytes,
): void {
  if (!isSupportedImage(file)) {
    throw new ImageProcessingError(
      "UNSUPPORTED_TYPE",
      "仅支持 JPEG、PNG、WebP、HEIC 或 HEIF 图片。",
    );
  }
  if (file.size > maxInputBytes) {
    throw new ImageProcessingError(
      "FILE_TOO_LARGE",
      `图片大小不能超过 ${Math.ceil(maxInputBytes / 1024 / 1024)} MB。`,
    );
  }
}

export function fitImageWithin(
  dimensions: ImageDimensions,
  maxLongEdge: number,
): ImageDimensions {
  if (
    dimensions.width <= 0 ||
    dimensions.height <= 0 ||
    maxLongEdge <= 0
  ) {
    throw new RangeError("Image dimensions and maxLongEdge must be positive.");
  }

  const scale = Math.min(
    1,
    maxLongEdge / Math.max(dimensions.width, dimensions.height),
  );
  return {
    width: Math.max(1, Math.round(dimensions.width * scale)),
    height: Math.max(1, Math.round(dimensions.height * scale)),
  };
}

export function replaceImageExtension(
  fileName: string,
  mimeType: "image/jpeg" | "image/webp",
  suffix = "",
): string {
  const base = fileName.replace(/\.[^.]+$/, "") || "image";
  return `${base}${suffix}.${mimeType === "image/webp" ? "webp" : "jpg"}`;
}

export function adaptHeic2Any(converter: Heic2AnyCompatible): HeicConverter {
  return ({ blob, outputType, quality }) =>
    converter({ blob, toType: outputType, quality });
}

async function convertHeicIfNeeded(
  file: File,
  converter: HeicConverter | undefined,
  quality: number,
): Promise<File> {
  if (!isHeicImage(file)) return file;
  if (!converter) {
    throw new ImageProcessingError(
      "HEIC_CONVERTER_REQUIRED",
      "此浏览器需要先加载 HEIC 转换器才能处理该图片。",
    );
  }

  try {
    const result = await converter({
      blob: file,
      outputType: "image/jpeg",
      quality,
    });
    const blob = Array.isArray(result) ? result[0] : result;
    if (!blob) throw new Error("HEIC converter returned no image.");
    return new File([blob], replaceImageExtension(file.name, "image/jpeg"), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch (error) {
    if (error instanceof ImageProcessingError) throw error;
    throw new ImageProcessingError(
      "HEIC_CONVERSION_FAILED",
      "HEIC 图片转换失败，请改用 JPEG 或 PNG 后重试。",
      { cause: error },
    );
  }
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
}

async function decodeImage(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: "from-image",
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        dispose: () => bitmap.close(),
      };
    } catch {
      // Fall through to the broadly supported HTMLImageElement path.
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.decoding = "async";
    image.onload = () =>
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        dispose: () => URL.revokeObjectURL(url),
      });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new ImageProcessingError(
          "DECODE_FAILED",
          "无法读取这张图片，请尝试重新拍照或转换格式。",
        ),
      );
    };
    image.src = url;
  });
}

function createCanvas(dimensions: ImageDimensions): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  return canvas;
}

function drawResized(
  source: CanvasImageSource,
  dimensions: ImageDimensions,
  outputType: "image/jpeg" | "image/webp",
  jpegBackground: string,
): HTMLCanvasElement {
  const canvas = createCanvas(dimensions);
  const context = canvas.getContext("2d", { alpha: outputType !== "image/jpeg" });
  if (!context) {
    throw new ImageProcessingError("ENCODE_FAILED", "浏览器无法创建图片画布。");
  }
  if (outputType === "image/jpeg") {
    context.fillStyle = jpegBackground;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: "image/jpeg" | "image/webp",
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else
          reject(
            new ImageProcessingError("ENCODE_FAILED", "浏览器无法压缩图片。"),
          );
      },
      type,
      quality,
    );
  });
}

async function encodeBelowLimit(
  canvas: HTMLCanvasElement,
  type: "image/jpeg" | "image/webp",
  initialQuality: number,
  maxBytes: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  if (maxBytes <= 0) throw new RangeError("maxOutputBytes must be positive.");

  let workingCanvas = canvas;
  while (true) {
    let quality = Math.min(0.95, Math.max(0.45, initialQuality));
    let blob = await canvasToBlob(workingCanvas, type, quality);
    while (blob.size > maxBytes && quality > 0.5) {
      quality = Math.max(0.5, quality - 0.08);
      blob = await canvasToBlob(workingCanvas, type, quality);
    }

    if (blob.size <= maxBytes) {
      return {
        blob,
        width: workingCanvas.width,
        height: workingCanvas.height,
      };
    }

    if (workingCanvas.width === 1 && workingCanvas.height === 1) {
      throw new ImageProcessingError(
        "ENCODE_FAILED",
        "无法将图片压缩到指定大小，请提高文件大小上限。",
      );
    }

    const nextSize = {
      width: Math.max(1, Math.floor(workingCanvas.width * 0.82)),
      height: Math.max(1, Math.floor(workingCanvas.height * 0.82)),
    };
    const nextCanvas = createCanvas(nextSize);
    const context = nextCanvas.getContext("2d");
    if (!context) {
      throw new ImageProcessingError("ENCODE_FAILED", "浏览器无法创建图片画布。");
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      workingCanvas,
      0,
      0,
      nextCanvas.width,
      nextCanvas.height,
    );
    workingCanvas = nextCanvas;
  }
}

export async function sha256Hex(blob: Blob): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Re-encodes through Canvas, which applies the decoded orientation and drops
 * EXIF/GPS metadata. Both returned files are ready for private Storage upload.
 */
export async function optimizeImage(
  file: File,
  options: OptimizeImageOptions = {},
): Promise<OptimizedImage> {
  const settings = { ...DEFAULTS, ...options };
  validateImageFile(file, settings.maxInputBytes);

  const sourceFile = await convertHeicIfNeeded(
    file,
    settings.heicConverter,
    settings.quality,
  );
  const decoded = await decodeImage(sourceFile);
  try {
    const original = { width: decoded.width, height: decoded.height };
    const fullSize = fitImageWithin(original, settings.maxLongEdge);
    const thumbnailSize = fitImageWithin(original, settings.thumbnailLongEdge);
    const fullCanvas = drawResized(
      decoded.source,
      fullSize,
      settings.outputType,
      settings.jpegBackground,
    );
    const thumbnailCanvas = drawResized(
      decoded.source,
      thumbnailSize,
      settings.outputType,
      settings.jpegBackground,
    );

    const [fullResult, thumbnailBlob] = await Promise.all([
      encodeBelowLimit(
        fullCanvas,
        settings.outputType,
        settings.quality,
        settings.maxOutputBytes,
      ),
      canvasToBlob(
        thumbnailCanvas,
        settings.outputType,
        settings.thumbnailQuality,
      ),
    ]);
    const fullName = replaceImageExtension(file.name, settings.outputType);
    const thumbnailName = replaceImageExtension(
      file.name,
      settings.outputType,
      "-thumb",
    );

    return {
      image: new File([fullResult.blob], fullName, {
        type: settings.outputType,
        lastModified: Date.now(),
      }),
      thumbnail: new File([thumbnailBlob], thumbnailName, {
        type: settings.outputType,
        lastModified: Date.now(),
      }),
      originalWidth: original.width,
      originalHeight: original.height,
      width: fullResult.width,
      height: fullResult.height,
      sha256: await sha256Hex(fullResult.blob),
    };
  } finally {
    decoded.dispose();
  }
}
