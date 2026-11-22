import {
  DEVICES,
  MEDIA,
  getPrintableCanvasDots,
  type MediaDescriptor,
} from '@thermal-label/labelwriter-core';

/** A label as the driver registry describes it. */
export type LabelMedia = MediaDescriptor & { lengthDots?: number };

/** The printer this extension targets, and its default label (DYMO 30336). From the driver registry. */
export const TARGET_DEVICE = DEVICES.LW_550;
export const TARGET_MEDIA = MEDIA.MULTI_PURPOSE_SMALL;

export interface LabelGeometry {
  dpi: number;
  /** Across the print head (label width). */
  widthDots: number;
  /** Full label length in the feed direction. */
  fullLengthDots: number;
  /** Unreachable band at the label's leading edge. */
  leadingDots: number;
  /** Feed-direction length the head can actually print. */
  printableLengthDots: number;
}

/**
 * Printable canvas for a device + media, derived from the driver's registry the same way the
 * thermal-label harness sizes its diagnostic label.
 */
export function labelGeometry(
  device: typeof TARGET_DEVICE = TARGET_DEVICE,
  media: LabelMedia = TARGET_MEDIA,
): LabelGeometry {
  const engine = device.engines[0];
  if (!engine) throw new Error(`${device.key} has no print engine`);
  const canvas = getPrintableCanvasDots(engine, media);
  const dpi = engine.dpi;
  const widthDots = Math.min(Math.round((media.widthMm * dpi) / 25.4), canvas.widthDots);
  const fullLengthDots = media.lengthDots ?? Math.round(((media.heightMm ?? 0) * dpi) / 25.4);
  return {
    dpi,
    widthDots,
    fullLengthDots,
    leadingDots: canvas.leadingDots,
    printableLengthDots: fullLengthDots - canvas.leadingDots - canvas.trailingDots,
  };
}
