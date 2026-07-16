import { describe, expect, it, vi } from "vitest";

import {
  ImageProcessingError,
  adaptHeic2Any,
  fitImageWithin,
  isHeicImage,
  isSupportedImage,
  replaceImageExtension,
  validateImageFile,
} from "./image";

describe("image helpers", () => {
  it("recognizes regular and HEIC images from MIME or extension", () => {
    expect(isHeicImage({ name: "答题卡.HEIC", type: "" })).toBe(true);
    expect(isHeicImage({ name: "answer.bin", type: "image/heif" })).toBe(true);
    expect(isSupportedImage({ name: "试卷.webp", type: "image/webp" })).toBe(true);
    expect(isSupportedImage({ name: "notes.pdf", type: "application/pdf" })).toBe(
      false,
    );
  });

  it("rejects unsupported or oversized input before decoding", () => {
    expect(() =>
      validateImageFile({ name: "paper.pdf", type: "application/pdf", size: 10 }),
    ).toThrowError(ImageProcessingError);
    expect(() =>
      validateImageFile({ name: "paper.jpg", type: "image/jpeg", size: 101 }, 100),
    ).toThrow(/1 MB/);
  });

  it("fits landscape and portrait images without upscaling", () => {
    expect(fitImageWithin({ width: 4000, height: 3000 }, 2400)).toEqual({
      width: 2400,
      height: 1800,
    });
    expect(fitImageWithin({ width: 800, height: 1200 }, 2400)).toEqual({
      width: 800,
      height: 1200,
    });
  });

  it("creates safe output names", () => {
    expect(replaceImageExtension("答题卡.HEIC", "image/jpeg")).toBe("答题卡.jpg");
    expect(replaceImageExtension("paper.png", "image/webp", "-thumb")).toBe(
      "paper-thumb.webp",
    );
  });

  it("adapts heic2any without making it a hard dependency", async () => {
    const output = new Blob(["jpeg"], { type: "image/jpeg" });
    const compatible = vi.fn(async () => output);
    const converter = adaptHeic2Any(compatible);
    const input = new Blob(["heic"], { type: "image/heic" });

    await expect(
      converter({ blob: input, outputType: "image/jpeg", quality: 0.86 }),
    ).resolves.toBe(output);
    expect(compatible).toHaveBeenCalledWith({
      blob: input,
      toType: "image/jpeg",
      quality: 0.86,
    });
  });
});
