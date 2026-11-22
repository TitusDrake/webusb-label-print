import { describe, expect, it } from 'vitest';
import { isSquareLabelPdfUrl } from '../src/square/url';

describe('isSquareLabelPdfUrl', () => {
  it.each([
    'https://squareup.com/api/v2/inventory/labels/abc123.pdf?print',
    'https://app.squareup.com/api/v2/inventory/labels/Labels-2026-11-21.pdf',
    'https://squareup.com/api/v2/inventory/labels/x.PDF',
  ])('accepts %s', url => {
    expect(isSquareLabelPdfUrl(url)).toBe(true);
  });

  it.each([
    undefined,
    '',
    'not a url',
    'http://squareup.com/api/v2/inventory/labels/abc.pdf',
    'https://squareup.com.evil.example/api/v2/inventory/labels/abc.pdf',
    'https://evilsquareup.com/api/v2/inventory/labels/abc.pdf',
    'https://squareup.com/dashboard/items/library',
    'https://squareup.com/api/v2/inventory/labels/abc.pdf/extra',
    'https://squareup.com/api/v2/inventory/labels/abc.png',
    'blob:https://squareup.com/5b7e1c2a',
  ])('rejects %s', url => {
    expect(isSquareLabelPdfUrl(url)).toBe(false);
  });
});
