import type { RawImageData } from '@thermal-label/labelwriter-core';
import { Batch, countLabels, type BatchSnapshot } from '../batch/batch';
import { LabelDocument, fingerprint } from '../pdf/label-document';
import { calibrationImage } from '../printer/calibration';
import { TARGET_DEVICE, labelGeometry, type LabelGeometry } from '../printer/geometry';
import { LabelPrinter, type PrinterInfo } from '../printer/label-printer';
import {
  LABEL_SIZES,
  pageFitsSize,
  resolveSize,
  shortName,
  sizeLabel,
  type ResolvedSize,
} from '../printer/media';
import { isOpenPdfMessage } from '../shared/messages';
import { log } from '../shared/log';
import {
  forgetBatch,
  loadBatch,
  loadSettings,
  saveBatch,
  saveSettings,
  type Settings,
} from '../shared/storage';
import { fetchSquarePdf } from '../square/fetch-pdf';

const printer = new LabelPrinter();

let settings: Settings;
let printerInfo: PrinterInfo | undefined;
let doc: LabelDocument | undefined;
let docFingerprint: string | undefined;
let batch: Batch<RawImageData> | undefined;
let snapshot: BatchSnapshot | undefined;
let previewIndex = 0;
let busy = false; // loading a PDF or printing a test label
/** Label size + printable area in use. Frozen while a batch is printing. */
let layout: { resolved: ResolvedSize; geo: LabelGeometry };
/** The PDF's page size doesn't match the label size in use. */
let pageMismatch: { widthMm: number; heightMm: number } | undefined;

// ── Elements ────────────────────────────────────────────────────────────

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}

const ui = {
  printerDot: el('printer-dot'),
  printerStatus: el('printer-status'),
  printerDetails: el('printer-details'),
  printerModel: el('printer-model'),
  printerMedia: el('printer-media'),
  printerProblem: el('printer-problem'),
  connect: el<HTMLButtonElement>('connect'),
  disconnect: el<HTMLButtonElement>('disconnect'),
  test: el<HTMLButtonElement>('test'),
  source: el('source'),
  sizeInfo: el('label-size-info'),
  sizeWarning: el('size-warning'),
  previewWrap: el('preview-wrap'),
  preview: el<HTMLCanvasElement>('preview'),
  previewLabel: el('preview-label'),
  prev: el<HTMLButtonElement>('prev'),
  next: el<HTMLButtonElement>('next'),
  file: el<HTMLInputElement>('file'),
  notice: el('notice'),
  decision: el('decision'),
  decisionText: el('decision-text'),
  didPrint: el<HTMLButtonElement>('did-print'),
  reprint: el<HTMLButtonElement>('reprint'),
  progressWrap: el('progress-wrap'),
  progress: el<HTMLProgressElement>('progress'),
  progressText: el('progress-text'),
  print: el<HTMLButtonElement>('print'),
  cancel: el<HTMLButtonElement>('cancel'),
  labelSize: el<HTMLSelectElement>('label-size'),
  fit: el<HTMLSelectElement>('fit'),
  rotate: el<HTMLSelectElement>('rotate'),
  density: el<HTMLSelectElement>('density'),
};

type NoticeKind = 'info' | 'success' | 'warning' | 'error';

function notify(text: string, kind: NoticeKind = 'info'): void {
  ui.notice.textContent = text;
  ui.notice.className = text ? kind : '';
}

const running = (): boolean => snapshot?.status === 'running';

// ── Printer ─────────────────────────────────────────────────────────────

let refreshing: Promise<void> | undefined;

/**
 * Re-read the printer. Calls made while a read is running share it (opening the tab and the
 * connect event both ask at once); it reads again only if the connection changed meanwhile.
 */
function refreshPrinter(): Promise<void> {
  refreshing ??= (async () => {
    try {
      let connected: boolean;
      do {
        connected = printer.connected;
        await readPrinter();
      } while (printer.connected !== connected);
    } finally {
      refreshing = undefined;
    }
  })();
  return refreshing;
}

async function readPrinter(): Promise<void> {
  printerInfo = undefined;
  if (printer.connected) {
    try {
      printerInfo = await printer.info();
    } catch (err) {
      log(`status read failed: ${errorText(err)}`);
    }
  }
  await updateLayout();
  renderPrinter();
  renderPrintControls();
}

function renderPrinter(): void {
  const connected = printer.connected;
  ui.printerDot.classList.toggle('ok', connected && (printerInfo?.problems.length ?? 0) === 0);
  ui.printerStatus.textContent = connected
    ? printerInfo?.problems.length
      ? 'Connected — needs attention'
      : 'Connected'
    : 'Not connected';
  ui.printerDetails.hidden = !connected || !printerInfo;
  if (printerInfo) {
    ui.printerModel.textContent = printerInfo.firmware
      ? `${printerInfo.model} (firmware ${printerInfo.firmware})`
      : printerInfo.model;
    ui.printerMedia.textContent = layout.resolved.rollDescription;
  }
  const problems: string[] = [...(printerInfo?.problems ?? [])];
  if (printerInfo && !printerInfo.supported) {
    problems.push(`This extension is set up for the LabelWriter 550; ${printerInfo.model} hasn't been tested.`);
  }
  ui.printerProblem.hidden = problems.length === 0;
  ui.printerProblem.textContent = problems.join(' ');
  ui.connect.hidden = connected;
  ui.disconnect.hidden = !connected;
  ui.test.hidden = !connected;
  ui.disconnect.disabled = running();
  ui.test.disabled = running() || busy;
}

ui.connect.addEventListener('click', () => {
  void (async () => {
    try {
      await printer.pair();
      notify('');
      await refreshPrinter();
    } catch (err) {
      // The user closing Chrome's picker is not an error worth shouting about.
      if (err instanceof DOMException && err.name === 'NotFoundError') {
        notify('No printer selected. Make sure the printer is plugged in and turned on, then try again.', 'warning');
      } else {
        notify(`Could not connect to the printer: ${errorText(err)}`, 'error');
      }
    }
  })();
});

ui.disconnect.addEventListener('click', () => {
  void printer.disconnect().then(refreshPrinter);
});

ui.test.addEventListener('click', () => {
  void (async () => {
    busy = true;
    renderAll();
    notify('Printing a test label…');
    try {
      await printer.printLabel(calibrationImage(layout.geo), layout.resolved.size.media, settings);
      notify(
        'Test label sent. Check that the border sits inside the label and the "F" reads normally.',
        'success',
      );
    } catch (err) {
      notify(`Test label did not print: ${errorText(err)}`, 'error');
    } finally {
      busy = false;
      await refreshPrinter();
    }
  })();
});

printer.onChange(() => {
  if (!printer.connected && running()) {
    notify('The printer was unplugged. Plug it back in and click Connect printer.', 'error');
  }
  void refreshPrinter();
});

// ── Loading a PDF ───────────────────────────────────────────────────────

async function loadFromSquare(url: string, tabId: number | undefined): Promise<void> {
  if (running()) {
    notify('Labels are printing. Wait for them to finish or stop them first.', 'warning');
    return;
  }
  busy = true;
  renderAll();
  notify('Getting your labels from Square…');
  try {
    const bytes = await fetchSquarePdf(url, tabId);
    await loadBytes(bytes, 'Square labels');
  } catch (err) {
    notify(`Could not get the labels from Square: ${errorText(err)}. Try clicking Print Labels in Square again.`, 'error');
  } finally {
    busy = false;
    renderAll();
  }
}

async function loadBytes(bytes: Uint8Array, sourceName: string): Promise<void> {
  const next = await LabelDocument.open(bytes);
  if (next.pageCount === 0) {
    await next.destroy();
    throw new Error('The PDF has no pages');
  }
  await doc?.destroy();
  doc = next;
  docFingerprint = await fingerprint(bytes);
  previewIndex = 0;
  log(`loaded PDF with ${next.pageCount} page(s)`);

  const saved = await loadBatch(docFingerprint);
  const count = next.pageCount;
  if (saved && saved.labels.length === count && saved.labels.some(l => l.state !== 'pending')) {
    createBatch(saved.labels);
    const c = countLabels(saved.labels);
    const when = new Date(saved.updatedAt).toLocaleString();
    if (c.printed === c.total) {
      notify(`These ${count} labels were already printed (${when}). Click "Print again" only if you need another set.`, 'warning');
    } else {
      notify(`${c.printed} of ${count} of these labels were printed earlier (${when}). Printing continues from where it stopped.`, 'warning');
    }
  } else {
    createBatch(count);
    notify('');
  }
  ui.source.textContent = `${sourceName} · ${count} ${count === 1 ? 'label' : 'labels'}`;
  await checkPageSize();
  renderSize();
  await renderPreview();
}

function createBatch(labels: number | Parameters<typeof saveBatch>[1]): void {
  const fp = docFingerprint!;
  const d = doc!;
  batch = new Batch<RawImageData>(fp, labels, {
    render: i => d.renderLabel(i, layout.geo, settings),
    print: image => printer.printLabel(image, layout.resolved.size.media, settings),
    onChange: s => {
      snapshot = s;
      void saveBatch(fp, s.labels);
      renderAll();
    },
  });
  snapshot = batch.snapshot();
  renderAll();
}

ui.file.addEventListener('change', () => {
  const file = ui.file.files?.[0];
  ui.file.value = '';
  if (!file) return;
  if (running()) {
    notify('Labels are printing. Wait for them to finish or stop them first.', 'warning');
    return;
  }
  void (async () => {
    busy = true;
    renderAll();
    try {
      await loadBytes(new Uint8Array(await file.arrayBuffer()), 'PDF file');
    } catch (err) {
      notify(`Could not open that file: ${errorText(err)}`, 'error');
    } finally {
      busy = false;
      renderAll();
    }
  })();
});

chrome.runtime.onMessage.addListener(message => {
  if (!isOpenPdfMessage(message)) return;
  if (message.url) void loadFromSquare(message.url, message.tabId);
  else if (!doc) notify('Open your Square labels first: in Square click Print Labels, then click the extension icon on the PDF tab.', 'warning');
});

// ── Preview ─────────────────────────────────────────────────────────────

async function renderPreview(): Promise<void> {
  if (!doc) {
    ui.previewWrap.hidden = true;
    return;
  }
  const index = previewIndex;
  const image = await doc.renderLabel(index, layout.geo, settings);
  if (index !== previewIndex) return; // user moved on while rendering
  ui.preview.width = image.width;
  ui.preview.height = image.height;
  const ctx = ui.preview.getContext('2d');
  ctx?.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  ui.previewWrap.hidden = false;
  ui.previewLabel.textContent = `Label ${index + 1} of ${doc.pageCount}`;
  ui.prev.disabled = index === 0;
  ui.next.disabled = index >= doc.pageCount - 1;
}

ui.prev.addEventListener('click', () => {
  if (previewIndex > 0) {
    previewIndex--;
    void renderPreview();
  }
});

ui.next.addEventListener('click', () => {
  if (doc && previewIndex < doc.pageCount - 1) {
    previewIndex++;
    void renderPreview();
  }
});

// ── Printing ────────────────────────────────────────────────────────────

function renderPrintControls(): void {
  const s = snapshot;
  const counts = s ? countLabels(s.labels) : undefined;
  const isRunning = running();

  ui.progressWrap.hidden = !counts || (s?.status === 'ready' && counts.printed === 0);
  if (counts) {
    ui.progress.max = counts.total;
    ui.progress.value = counts.printed;
    const parts = [`Printed ${counts.printed} of ${counts.total}`];
    if (counts.printing) parts.push(`printing label ${counts.printed + 1}…`);
    if (counts.failed) parts.push(`${counts.failed} not printed`);
    if (counts.unknown) parts.push(`${counts.unknown} to check`);
    ui.progressText.textContent = parts.join(' · ');
  }

  const unknown = batch?.firstUnknown;
  ui.decision.hidden = unknown === undefined || isRunning;
  if (unknown !== undefined) {
    ui.decisionText.textContent = `Look at the printer: did label ${unknown + 1} come out correctly?`;
  }

  ui.cancel.hidden = !isRunning;
  const remaining = counts ? counts.total - counts.printed : 0;
  if (!counts) {
    ui.print.textContent = 'Print';
  } else if (s?.status === 'done') {
    ui.print.textContent = 'Print again';
  } else if (counts.printed > 0) {
    ui.print.textContent = `Continue printing (${remaining} left)`;
  } else {
    ui.print.textContent = `Print ${counts.total} ${counts.total === 1 ? 'label' : 'labels'}`;
  }
  if (isRunning) ui.print.textContent = 'Printing…';
  ui.print.disabled =
    isRunning || busy || !batch || !printer.connected || unknown !== undefined;

  for (const select of [ui.labelSize, ui.fit, ui.rotate, ui.density]) select.disabled = isRunning;
}

ui.print.addEventListener('click', () => {
  void startPrinting();
});

async function startPrinting(): Promise<void> {
  if (!batch || !doc || running()) return;
  if (!printer.connected) {
    notify('Connect the printer first.', 'warning');
    return;
  }
  // Re-read the roll so a swapped roll is noticed before printing.
  await refreshPrinter();
  if (!printer.connected) {
    notify('The printer is not responding. Check the cable and click Connect printer.', 'error');
    return;
  }
  const warning = sizeWarnings().join(' ');
  if (warning && !confirm(`${warning}\n\nPrint anyway?`)) return;
  if (snapshot?.status === 'done') {
    // Deliberate reprint of a finished set.
    if (!confirm(`Print all ${doc.pageCount} labels again?`)) return;
    await forgetBatch(batch.id);
    createBatch(doc.pageCount);
  }
  notify('');
  log(`printing ${batch.counts.pending + batch.counts.failed} label(s)`);
  const result = await batch.run();
  if (result.status === 'done') {
    notify(`All ${result.labels.length} labels printed.`, 'success');
  } else if (result.status === 'cancelled') {
    notify('Printing stopped. Click Continue printing to print the rest.', 'info');
  } else if (result.message) {
    notify(`${result.message}`, 'error');
  }
  await refreshPrinter();
}

ui.cancel.addEventListener('click', () => {
  batch?.cancel();
  ui.cancel.disabled = true;
  ui.cancel.textContent = 'Stopping…';
});

ui.didPrint.addEventListener('click', () => {
  const i = batch?.firstUnknown;
  if (batch && i !== undefined) batch.resolveUnknown(i, true);
  notify('');
});

ui.reprint.addEventListener('click', () => {
  const i = batch?.firstUnknown;
  if (batch && i !== undefined) batch.resolveUnknown(i, false);
  notify('');
});

window.addEventListener('beforeunload', event => {
  if (running()) event.preventDefault();
});

// ── Settings ────────────────────────────────────────────────────────────

function readSettings(): Settings {
  const size = ui.labelSize.value;
  return {
    labelSize: size === 'auto' || !LABEL_SIZES.some(s => s.key === size) ? 'auto' : (size as Settings['labelSize']),
    fit: ui.fit.value === 'trim-leading' ? 'trim-leading' : 'shrink',
    rotate: ui.rotate.value === '270' ? 270 : 90,
    density: ui.density.value as Settings['density'],
  };
}

for (const select of [ui.labelSize, ui.fit, ui.rotate, ui.density]) {
  select.addEventListener('change', () => {
    settings = readSettings();
    void saveSettings(settings);
    void (async () => {
      await updateLayout();
      renderAll();
      await renderPreview();
    })();
  });
}

// ── Label size ──────────────────────────────────────────────────────────

/** Recompute the label size from the setting + loaded roll. Never changes mid-batch. */
async function updateLayout(): Promise<void> {
  if (running() && layout) return;
  const resolved = resolveSize(settings.labelSize, printerInfo?.roll);
  layout = { resolved, geo: labelGeometry(TARGET_DEVICE, resolved.size.media) };
  await checkPageSize();
  renderSize();
}

async function checkPageSize(): Promise<void> {
  pageMismatch = undefined;
  if (!doc || !layout) return;
  const { width, height } = await doc.pageSize(0);
  if (!pageFitsSize(width, height, layout.resolved.size)) {
    pageMismatch = { widthMm: (width / 72) * 25.4, heightMm: (height / 72) * 25.4 };
  }
}

function sizeWarnings(): string[] {
  const { resolved } = layout;
  const warnings: string[] = [];
  if (resolved.conflictsWithRoll) {
    warnings.push(`The printer has ${resolved.rollDescription} labels loaded, but Advanced settings say ${sizeName(resolved)}.`);
  }
  if (printer.connected && printerInfo?.roll && resolved.source === 'default') {
    warnings.push(`The loaded labels (${resolved.rollDescription}) aren't a size this extension knows; using the ${sizeName(resolved)} layout.`);
  }
  if (pageMismatch) {
    const page = `${pageMismatch.widthMm.toFixed(0)} × ${pageMismatch.heightMm.toFixed(0)} mm`;
    warnings.push(`These labels were made for a different size (${page}) than ${sizeName(resolved)}. In Square, pick the label size that matches the roll.`);
  }
  return warnings;
}

function sizeName(resolved: ResolvedSize): string {
  const s = resolved.size;
  return `${resolved.partNumber} ${shortName(s)} (${sizeLabel(s)})`.trim();
}

function renderSize(): void {
  if (!layout) return;
  const source = {
    roll: 'from the roll',
    default: printer.connected ? 'default — could not identify the roll' : 'default',
    manual: 'set in Advanced settings',
  }[layout.resolved.source];
  ui.sizeInfo.textContent = `Label size: ${sizeName(layout.resolved)} · ${source}`;
  const warnings = sizeWarnings();
  ui.sizeWarning.hidden = warnings.length === 0;
  ui.sizeWarning.textContent = warnings.join(' ');
}

function populateSizes(): void {
  for (const size of LABEL_SIZES) {
    const option = document.createElement('option');
    option.value = size.key;
    option.textContent = `${size.skus[0] ?? ''} ${shortName(size)} · ${sizeLabel(size)}`.trim();
    ui.labelSize.append(option);
  }
}

// ── Startup ─────────────────────────────────────────────────────────────

function renderAll(): void {
  renderPrinter();
  renderPrintControls();
  if (!running()) {
    ui.cancel.disabled = false;
    ui.cancel.textContent = 'Stop after this label';
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function start(): Promise<void> {
  settings = await loadSettings();
  populateSizes();
  ui.labelSize.value = settings.labelSize;
  if (ui.labelSize.value !== settings.labelSize) settings.labelSize = 'auto';
  await updateLayout();
  ui.fit.value = settings.fit;
  ui.rotate.value = String(settings.rotate);
  ui.density.value = settings.density;
  renderAll();

  try {
    await printer.reconnect();
  } catch (err) {
    log(`reconnect failed: ${errorText(err)}`);
  }
  await refreshPrinter();

  const params = new URLSearchParams(location.search);
  const src = params.get('src');
  const tab = params.get('tab');
  if (src) await loadFromSquare(src, tab ? Number(tab) : undefined);
  else notify('Open your Square labels first: in Square click Print Labels, then click the extension icon on the PDF tab.', 'info');
}

void start();
