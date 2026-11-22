import type { LabelGeometry } from '../printer/geometry';

/**
 * How a Square page maps onto the printable area.
 * - `shrink`: scale the whole page uniformly to fit the printable area. Never clips.
 * - `trim-leading`: lay the page on the full label, then drop whatever falls in the
 *   unprintable leading band. Keeps scale closer to 1:1 but clips that band.
 */
export type FitMode = 'shrink' | 'trim-leading';

/** Rotation the driver applies to our image. 90 = clockwise (driver default). */
export type Rotation = 90 | 270;

export interface Placement {
  /** Output canvas: printable length (feed) × label width (across the head). */
  canvasWidth: number;
  canvasHeight: number;
  /** Output dots per PDF point (uniform on both axes — never stretched). */
  scale: number;
  offsetX: number;
  offsetY: number;
  /** True when the page must be turned 90° so its long side matches the canvas's. */
  rotatePage: boolean;
}

/**
 * The driver rotates our image by `rotation`. With 90° (clockwise) the left edge of our
 * image becomes the first raster row, i.e. the label's leading edge; with 270° it is the right edge.
 */
export function placePage(
  pageWidthPt: number,
  pageHeightPt: number,
  geo: LabelGeometry,
  mode: FitMode,
  rotation: Rotation,
): Placement {
  const canvasWidth = geo.printableLengthDots;
  const canvasHeight = geo.widthDots;
  // Turn the page so its long side lines up with the canvas's long side.
  const rotatePage = pageWidthPt >= pageHeightPt !== canvasWidth >= canvasHeight;
  const longPt = rotatePage ? pageHeightPt : pageWidthPt; // extent along the canvas x axis (feed)
  const shortPt = rotatePage ? pageWidthPt : pageHeightPt;

  let scale: number;
  let offsetX: number;
  if (mode === 'shrink') {
    scale = Math.min(canvasWidth / longPt, canvasHeight / shortPt);
    offsetX = (canvasWidth - longPt * scale) / 2;
  } else {
    scale = Math.min(geo.fullLengthDots / longPt, canvasHeight / shortPt);
    const onLabelX = (geo.fullLengthDots - longPt * scale) / 2;
    offsetX = rotation === 90 ? onLabelX - geo.leadingDots : onLabelX;
  }
  const offsetY = (canvasHeight - shortPt * scale) / 2;
  return { canvasWidth, canvasHeight, scale, offsetX, offsetY, rotatePage };
}
