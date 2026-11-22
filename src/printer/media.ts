import { MEDIA, type SkuInfo } from '@thermal-label/labelwriter-core';
import { TARGET_DEVICE } from './geometry';

/** Keys of the driver's media registry (not exported by the package entry point). */
export type MediaKey = keyof typeof MEDIA;

/** One label size the extension can lay pages out for. */
export interface LabelSize {
  key: MediaKey;
  name: string;
  /** Across the print head. */
  widthMm: number;
  /** Feed direction. */
  lengthMm: number;
  skus: readonly string[];
  media: (typeof MEDIA)[MediaKey];
}

export const DEFAULT_SIZE_KEY: MediaKey = 'MULTI_PURPOSE_SMALL'; // DYMO 30336, 1" × 2⅛"

/**
 * Rolls with two labels side by side. The driver registry describes one label of the pair, and
 * printing both lanes would need layout we don't do, so they are left out.
 */
const MULTI_LANE: readonly MediaKey[] = ['MULTI_PURPOSE_EXTRA_SMALL', 'PRICE_TAG_2UP'];

const TOLERANCE_MM = 1;

/** Single die-cut paper labels the target printer accepts, from the driver registry. */
export const LABEL_SIZES: readonly LabelSize[] = (() => {
  const compatible = new Set(TARGET_DEVICE.engines[0]?.mediaCompatibility ?? []);
  const sizes: LabelSize[] = [];
  for (const [key, media] of Object.entries(MEDIA) as [MediaKey, (typeof MEDIA)[MediaKey]][]) {
    const targets = (media as { targetModels?: readonly string[] }).targetModels ?? [];
    if (media.type !== 'die-cut' || media.heightMm === undefined) continue;
    if (!targets.some(t => compatible.has(t)) || MULTI_LANE.includes(key)) continue;
    sizes.push({
      key,
      name: media.name,
      widthMm: media.widthMm,
      lengthMm: media.heightMm,
      skus: (media as { skus?: readonly string[] }).skus ?? [],
      media,
    });
  }
  return sizes;
})();

export function sizeByKey(key: string): LabelSize | undefined {
  return LABEL_SIZES.find(s => s.key === key);
}

export const DEFAULT_SIZE: LabelSize = sizeByKey(DEFAULT_SIZE_KEY)!;

/** Match the roll's NFC tag to a known size: by DYMO part number first, then by dimensions. */
export function sizeForRoll(sku: SkuInfo | undefined): LabelSize | undefined {
  if (!sku) return undefined;
  const part = sku.sku.trim();
  if (part) {
    const bySku = LABEL_SIZES.find(s => s.skus.some(code => part.includes(code)));
    if (bySku) return bySku;
  }
  return LABEL_SIZES.find(
    s =>
      Math.abs(s.widthMm - sku.labelWidthMm) <= TOLERANCE_MM &&
      Math.abs(s.lengthMm - sku.labelLengthMm) <= TOLERANCE_MM,
  );
}

export type SizeSource = 'roll' | 'default' | 'manual';

export interface ResolvedSize {
  size: LabelSize;
  source: SizeSource;
  /** DYMO part number to show: the roll's own when it matches, else the size's first. */
  partNumber: string;
  /** What the printer says is loaded, for display. */
  rollDescription: string;
  /** True when a manual choice differs from a roll we could identify. */
  conflictsWithRoll: boolean;
}

/**
 * Pick the label size to lay pages out for.
 * - `auto`: the roll's NFC tag; if it can't be read or isn't a known single-label size, 30336.
 * - a size key: that size, flagged if it contradicts the loaded roll.
 */
export function resolveSize(setting: 'auto' | string, sku: SkuInfo | undefined): ResolvedSize {
  const fromRoll = sizeForRoll(sku);
  const rollDescription = describeRoll(sku, fromRoll);
  const result = (size: LabelSize, source: SizeSource, conflictsWithRoll: boolean): ResolvedSize => ({
    size,
    source,
    partNumber: partNumberFor(size, sku),
    rollDescription,
    conflictsWithRoll,
  });
  if (setting !== 'auto') {
    const manual = sizeByKey(setting);
    if (manual) return result(manual, 'manual', fromRoll !== undefined && fromRoll.key !== manual.key);
  }
  return fromRoll ? result(fromRoll, 'roll', false) : result(DEFAULT_SIZE, 'default', false);
}

function partNumberFor(size: LabelSize, sku: SkuInfo | undefined): string {
  const part = sku?.sku.trim() ?? '';
  return (part && size.skus.find(c => part.includes(c))) || size.skus[0] || '';
}

function describeRoll(sku: SkuInfo | undefined, size: LabelSize | undefined): string {
  if (!sku) return 'Unknown (could not read the roll)';
  const dims = `${formatMm(sku.labelWidthMm)} × ${formatMm(sku.labelLengthMm)} mm`;
  const part = sku.sku.trim();
  if (size) return `${partNumberFor(size, sku)} ${shortName(size)} · ${dims}`;
  return part ? `${part} · ${dims}` : dims;
}

/** "54×25mm Small" → "Small". */
export function shortName(size: LabelSize): string {
  return size.name.replace(/^[\d.×x]+\s*mm\s*/i, '');
}

/** e.g. `25 × 54 mm`. */
export function sizeLabel(size: LabelSize): string {
  return `${formatMm(size.widthMm)} × ${formatMm(size.lengthMm)} mm`;
}

function formatMm(mm: number): string {
  return Number.isInteger(mm) ? String(mm) : mm.toFixed(1);
}

/**
 * Does the PDF page look designed for this label? Compares page size to the label in either
 * orientation; a few mm of slack covers bleed and rounding.
 */
export function pageFitsSize(pageWidthPt: number, pageHeightPt: number, size: LabelSize): boolean {
  const toMm = (pt: number) => (pt / 72) * 25.4;
  const [a, b] = [toMm(pageWidthPt), toMm(pageHeightPt)].sort((x, y) => x - y) as [number, number];
  const [c, d] = [size.widthMm, size.lengthMm].sort((x, y) => x - y) as [number, number];
  const slack = 3;
  return Math.abs(a - c) <= slack && Math.abs(b - d) <= slack;
}
