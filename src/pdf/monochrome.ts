import type { RawImageData } from '@thermal-label/labelwriter-core';

export const MONOCHROME_THRESHOLD = 128;

/**
 * Hard-threshold RGBA pixels to pure black/white (BT.709 luminance). The driver always dithers;
 * feeding it only 0/255 pixels makes that dither a no-op, so barcode edges stay crisp.
 */
export function toMonochrome(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  threshold = MONOCHROME_THRESHOLD,
): RawImageData {
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < out.length; i += 4) {
    const r = rgba[i] ?? 255;
    const g = rgba[i + 1] ?? 255;
    const b = rgba[i + 2] ?? 255;
    const a = (rgba[i + 3] ?? 255) / 255;
    // Composite over white so transparent pixels print as blank paper.
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) * a + 255 * (1 - a);
    const v = lum < threshold ? 0 : 255;
    out[i] = v;
    out[i + 1] = v;
    out[i + 2] = v;
    out[i + 3] = 255;
  }
  return { width, height, data: out };
}
