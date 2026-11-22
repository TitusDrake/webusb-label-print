import type { SkuInfo } from '@thermal-label/labelwriter-core';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIZE,
  LABEL_SIZES,
  pageFitsSize,
  resolveSize,
  sizeForRoll,
} from '../src/printer/media';

function roll(partial: Partial<SkuInfo>): SkuInfo {
  return { sku: '', labelWidthMm: 0, labelLengthMm: 0, ...partial } as SkuInfo;
}

describe('LABEL_SIZES', () => {
  it('lists single die-cut paper labels from the driver registry', () => {
    const keys = LABEL_SIZES.map(s => s.key);
    expect(keys).toContain('MULTI_PURPOSE_SMALL');
    expect(keys).toContain('ADDRESS_STANDARD');
    expect(keys).not.toContain('CONTINUOUS_57MM');
    expect(keys).not.toContain('MULTI_PURPOSE_EXTRA_SMALL'); // 2-up
    expect(keys).not.toContain('PRICE_TAG_2UP');
    expect(keys.some(k => k.startsWith('STANDARD_') || k.startsWith('RHINO_'))).toBe(false); // D1 tape
    expect(LABEL_SIZES.length).toBeGreaterThan(15);
  });

  it('defaults to DYMO 30336', () => {
    expect(DEFAULT_SIZE.key).toBe('MULTI_PURPOSE_SMALL');
    expect(DEFAULT_SIZE.skus).toContain('30336');
    expect([DEFAULT_SIZE.widthMm, DEFAULT_SIZE.lengthMm]).toEqual([25, 54]);
  });
});

describe('sizeForRoll', () => {
  it('matches by DYMO part number', () => {
    expect(sizeForRoll(roll({ sku: '30252', labelWidthMm: 28, labelLengthMm: 89 }))?.key).toBe('ADDRESS_STANDARD');
  });

  it('matches by size when the part number is unfamiliar', () => {
    expect(sizeForRoll(roll({ sku: 'S9999999', labelWidthMm: 25.4, labelLengthMm: 54 }))?.key).toBe(
      'MULTI_PURPOSE_SMALL',
    );
  });

  it('returns nothing for unknown rolls', () => {
    expect(sizeForRoll(undefined)).toBeUndefined();
    expect(sizeForRoll(roll({ sku: 'X', labelWidthMm: 40, labelLengthMm: 40 }))).toBeUndefined();
  });
});

describe('resolveSize', () => {
  const address = roll({ sku: '30252', labelWidthMm: 28, labelLengthMm: 89 });

  it('auto: uses the loaded roll', () => {
    const r = resolveSize('auto', address);
    expect(r.size.key).toBe('ADDRESS_STANDARD');
    expect(r.source).toBe('roll');
  });

  it('auto: falls back to 30336 when the roll cannot be read or identified', () => {
    expect(resolveSize('auto', undefined)).toMatchObject({ size: { key: 'MULTI_PURPOSE_SMALL' }, source: 'default' });
    expect(resolveSize('auto', roll({ sku: 'X', labelWidthMm: 40, labelLengthMm: 40 })).source).toBe('default');
  });

  it('manual: uses the chosen size and flags a conflicting roll', () => {
    const r = resolveSize('MULTI_PURPOSE_SMALL', address);
    expect(r.size.key).toBe('MULTI_PURPOSE_SMALL');
    expect(r.source).toBe('manual');
    expect(r.conflictsWithRoll).toBe(true);
    expect(resolveSize('ADDRESS_STANDARD', address).conflictsWithRoll).toBe(false);
    expect(resolveSize('MULTI_PURPOSE_SMALL', undefined).conflictsWithRoll).toBe(false);
  });

  it('ignores an unknown saved setting', () => {
    expect(resolveSize('NOT_A_SIZE', undefined).source).toBe('default');
  });

  it("shows the roll's own part number", () => {
    expect(resolveSize('auto', address).partNumber).toBe('30252');
    expect(resolveSize('auto', undefined).partNumber).toBe('30336');
  });

  it('describes the roll for display', () => {
    expect(resolveSize('auto', address).rollDescription).toBe('30252 Address · 28 × 89 mm');
    expect(resolveSize('auto', undefined).rollDescription).toMatch(/Unknown/);
  });
});

describe('pageFitsSize', () => {
  it("accepts Square's 2⅛\" × 1\" page for 30336 in either orientation", () => {
    expect(pageFitsSize(153, 72, DEFAULT_SIZE)).toBe(true);
    expect(pageFitsSize(72, 153, DEFAULT_SIZE)).toBe(true);
  });

  it('rejects a page made for a different label', () => {
    const address = LABEL_SIZES.find(s => s.key === 'ADDRESS_STANDARD')!;
    expect(pageFitsSize(153, 72, address)).toBe(false);
  });
});
