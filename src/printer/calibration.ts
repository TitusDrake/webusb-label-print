import type { RawImageData } from '@thermal-label/labelwriter-core';
import { toMonochrome } from '../pdf/monochrome';
import type { LabelGeometry } from './geometry';

/**
 * Asymmetric test label (landscape, printable-area sized) for checking on real hardware:
 * - the border should sit fully inside the label (cross-feed alignment, leading band),
 * - "F" and the text should read normally (rotation direction),
 * - LEFT/RIGHT tell which end lost the unprintable band.
 */
export function calibrationImage(geo: LabelGeometry): RawImageData {
  const w = geo.printableLengthDots;
  const h = geo.widthDots;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is not available');
  const dotsPerMm = geo.dpi / 25.4;

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';

  // 3-dot border on the very edge of the printable area.
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, w - 3, h - 3);

  // 1 mm ruler along the top, longer tick every 5 mm.
  ctx.lineWidth = 2;
  for (let mm = 0; mm * dotsPerMm < w; mm++) {
    const x = Math.round(mm * dotsPerMm);
    const len = mm % 5 === 0 ? 24 : 12;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, len);
    ctx.stroke();
  }

  ctx.textBaseline = 'middle';
  ctx.font = 'bold 150px sans-serif';
  ctx.fillText('F', 30, h / 2 + 10);

  ctx.font = 'bold 34px sans-serif';
  ctx.fillText('TEST ↑ TOP', 150, h / 2 - 40);
  ctx.font = '26px sans-serif';
  ctx.fillText('30336 · 25 × 54 mm', 150, h / 2 + 10);
  ctx.fillText(`${w} × ${h} dots`, 150, h / 2 + 50);

  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('LEFT', 10, h - 24);
  const right = 'RIGHT';
  ctx.fillText(right, w - 10 - ctx.measureText(right).width, h - 24);

  const pixels = ctx.getImageData(0, 0, w, h);
  return toMonochrome(pixels.data, w, h);
}
