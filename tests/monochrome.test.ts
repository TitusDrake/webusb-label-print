import { renderImage } from '@thermal-label/labelwriter-core';
import { describe, expect, it } from 'vitest';
import { toMonochrome } from '../src/pdf/monochrome';

function rgba(pixels: [number, number, number, number][]): Uint8Array {
  return new Uint8Array(pixels.flat());
}

describe('toMonochrome', () => {
  it('maps dark to black, light to white, and transparent to white', () => {
    const img = toMonochrome(
      rgba([
        [0, 0, 0, 255],
        [255, 255, 255, 255],
        [100, 100, 100, 255],
        [0, 0, 0, 0],
      ]),
      4,
      1,
    );
    expect(Array.from(img.data)).toEqual([
      0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255,
    ]);
  });

  it("makes the driver's forced dithering a no-op (barcode bars stay exact)", () => {
    // Barcode-like pattern: bars of 1–4 dots with anti-aliased grey edges.
    const width = 64;
    const height = 8;
    const src = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = x % 7 < 3 ? 0 : x % 7 === 3 ? 120 : x % 7 === 6 ? 200 : 255;
        src.set([v, v, v, 255], (y * width + x) * 4);
      }
    }
    const mono = toMonochrome(src, width, height);
    const dithered = renderImage(mono, { dither: true });
    const thresholded = renderImage(mono, { dither: false });
    expect(Array.from(dithered.data)).toEqual(Array.from(thresholded.data));
  });
});
