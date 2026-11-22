import { describe, expect, it } from 'vitest';
import { placePage } from '../src/pdf/placement';
import type { LabelGeometry } from '../src/printer/geometry';

const geo: LabelGeometry = {
  dpi: 300,
  widthDots: 295,
  fullLengthDots: 638,
  leadingDots: 71,
  printableLengthDots: 567,
};
// Square's label page: 2.125" × 1" in PDF points.
const W = 2.125 * 72;
const H = 1 * 72;

describe('placePage', () => {
  it('shrink: fits the whole page inside the printable area with a uniform scale', () => {
    const p = placePage(W, H, geo, 'shrink', 90);
    expect(p.canvasWidth).toBe(567);
    expect(p.canvasHeight).toBe(295);
    expect(p.rotatePage).toBe(false);
    expect(W * p.scale).toBeLessThanOrEqual(567 + 1e-9);
    expect(H * p.scale).toBeLessThanOrEqual(295 + 1e-9);
    // Length is the binding dimension; it fills edge to edge and is centered across.
    expect(W * p.scale).toBeCloseTo(567);
    expect(p.offsetX).toBeCloseTo(0);
    expect(p.offsetY).toBeCloseTo((295 - H * p.scale) / 2);
  });

  it('trim-leading: keeps a larger scale and shifts the leading band off the canvas (90°)', () => {
    const shrink = placePage(W, H, geo, 'shrink', 90);
    const trim = placePage(W, H, geo, 'trim-leading', 90);
    expect(trim.scale).toBeGreaterThan(shrink.scale);
    expect(H * trim.scale).toBeLessThanOrEqual(295 + 1e-9);
    const onLabelX = (638 - W * trim.scale) / 2;
    expect(trim.offsetX).toBeCloseTo(onLabelX - 71);
  });

  it('trim-leading at 270° clips the right side instead of the left', () => {
    const trim = placePage(W, H, geo, 'trim-leading', 270);
    expect(trim.offsetX).toBeCloseTo((638 - W * trim.scale) / 2);
  });

  it('turns portrait pages to landscape without changing the result', () => {
    const landscape = placePage(W, H, geo, 'shrink', 90);
    const portrait = placePage(H, W, geo, 'shrink', 90);
    expect(portrait.rotatePage).toBe(true);
    expect(portrait.scale).toBeCloseTo(landscape.scale);
  });

  it('never stretches: one scale for both axes', () => {
    for (const [w, h] of [
      [W, H],
      [300, 50],
      [100, 100],
    ] as const) {
      const p = placePage(w, h, geo, 'shrink', 90);
      expect(Math.max(w, h) * p.scale).toBeLessThanOrEqual(567 + 1e-9);
      expect(Math.min(w, h) * p.scale).toBeLessThanOrEqual(295 + 1e-9);
    }
  });
});

describe('placePage on a label wider than it is long', () => {
  // 30334 Medium: 57 mm across the head, 32 mm feed → portrait canvas.
  const medium: LabelGeometry = {
    dpi: 300,
    widthDots: 672,
    fullLengthDots: 378,
    leadingDots: 71,
    printableLengthDots: 307,
  };

  it('turns a landscape page so its long side runs across the head', () => {
    const p = placePage(2.25 * 72, 1.25 * 72, medium, 'shrink', 90);
    expect(p.rotatePage).toBe(true);
    expect(2.25 * 72 * p.scale).toBeLessThanOrEqual(672 + 1e-9);
    expect(1.25 * 72 * p.scale).toBeLessThanOrEqual(307 + 1e-9);
  });
});
