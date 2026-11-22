import type { RawImageData } from '@thermal-label/labelwriter-core';
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from 'pdfjs-dist';
import type { LabelGeometry } from '../printer/geometry';
import { toMonochrome } from './monochrome';
import { placePage, type FitMode, type Rotation } from './placement';

GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdfjs/pdf.worker.min.mjs');

export interface RenderSettings {
  fit: FitMode;
  rotate: Rotation;
}

/** A loaded label PDF. Pages are rendered one at a time, never the whole document at once. */
export class LabelDocument {
  private constructor(
    private readonly task: PDFDocumentLoadingTask,
    private readonly doc: PDFDocumentProxy,
  ) {}

  static async open(bytes: Uint8Array): Promise<LabelDocument> {
    if (!isPdf(bytes)) throw new Error('This file is not a PDF');
    const task = getDocument({
      // pdf.js may transfer the buffer to its worker; give it a copy so the caller's bytes stay usable.
      data: bytes.slice(),
      standardFontDataUrl: chrome.runtime.getURL('pdfjs/standard_fonts/'),
      cMapUrl: chrome.runtime.getURL('pdfjs/cmaps/'),
      wasmUrl: chrome.runtime.getURL('pdfjs/wasm/'),
      enableXfa: false,
    });
    return new LabelDocument(task, await task.promise);
  }

  get pageCount(): number {
    return this.doc.numPages;
  }

  /** Page size in PDF points (1/72"), with the page's own rotation applied. */
  async pageSize(index: number): Promise<{ width: number; height: number }> {
    const page = await this.doc.getPage(index + 1);
    const { width, height } = page.getViewport({ scale: 1 });
    return { width, height };
  }

  /** Render page `index` (0-based) to a black/white image sized for the label's printable area. */
  async renderLabel(index: number, geo: LabelGeometry, settings: RenderSettings): Promise<RawImageData> {
    const page = await this.doc.getPage(index + 1);
    try {
      const natural = page.getViewport({ scale: 1 });
      const p = placePage(natural.width, natural.height, geo, settings.fit, settings.rotate);
      const viewport = page.getViewport({
        scale: p.scale,
        rotation: (page.rotate + (p.rotatePage ? 90 : 0)) % 360,
        offsetX: p.offsetX,
        offsetY: p.offsetY,
      });
      const canvas = document.createElement('canvas');
      canvas.width = p.canvasWidth;
      canvas.height = p.canvasHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas is not available');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, viewport, intent: 'print', background: '#ffffff' }).promise;
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return toMonochrome(pixels.data, canvas.width, canvas.height);
    } finally {
      page.cleanup();
    }
  }

  async destroy(): Promise<void> {
    // pdf.js 6 tears down the document and its worker through the loading task.
    await this.task.destroy();
  }
}

export function isPdf(bytes: Uint8Array): boolean {
  // "%PDF-" may be preceded by a little junk; the spec allows it within the first 1024 bytes.
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  return head.includes('%PDF-');
}

/** SHA-256 of the PDF bytes, used to recognise a PDF that was already printed. */
export async function fingerprint(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
