import { describe, expect, it } from 'vitest';
import { MEDIA } from '@thermal-label/labelwriter-core';
import { labelGeometry, TARGET_DEVICE, TARGET_MEDIA } from '../src/printer/geometry';

describe('labelGeometry (from driver registry)', () => {
  it('targets the LabelWriter 550 and the 30336 label', () => {
    expect(TARGET_DEVICE.key).toBe('LW_550');
    expect(TARGET_DEVICE.transports.usb).toEqual({ vid: '0x0922', pid: '0x0028' });
    expect(TARGET_MEDIA.skus).toContain('30336');
    expect(TARGET_MEDIA.widthMm).toBe(25);
    expect(TARGET_MEDIA.heightMm).toBe(54);
  });

  it('matches the harness diagnostic canvas: 295 × 567 printable dots at 300 dpi', () => {
    expect(labelGeometry()).toEqual({
      dpi: 300,
      widthDots: 295,
      fullLengthDots: 638,
      leadingDots: 71,
      printableLengthDots: 567,
    });
  });

  it('derives other sizes from the registry, capped at the head width', () => {
    // 30334 Medium: 57 mm across, 32 mm feed.
    const medium = labelGeometry(TARGET_DEVICE, MEDIA.MULTI_PURPOSE_MEDIUM);
    expect(medium.widthDots).toBe(672); // 57 mm = 673 dots > 672-dot head
    expect(medium.printableLengthDots).toBe(medium.fullLengthDots - 71);
  });
});
