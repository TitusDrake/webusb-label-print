import type { EngineVersion, MediaDescriptor, RawImageData, SkuInfo } from '@thermal-label/labelwriter-core';
import { DEFAULT_FILTERS, WebLabelWriterPrinter, fromUSBDevice } from '@thermal-label/labelwriter-web';
import { NotSentError } from '../batch/batch';
import { TARGET_DEVICE } from './geometry';
import { log } from '../shared/log';

export type Density = 'light' | 'medium' | 'normal' | 'high';

export interface PrintSettings {
  rotate: 90 | 270;
  density: Density;
}

export interface PrinterInfo {
  model: string;
  firmware?: string;
  /** The loaded roll's NFC tag, when the printer could read it. */
  roll?: SkuInfo;
  /** Plain-language problems the printer reports right now (cover open, no labels…). */
  problems: string[];
  supported: boolean;
}

/**
 * The only module that talks to USB. Wraps the thermal-label WebUSB driver.
 *
 * Connection: we call `navigator.usb.requestDevice` ourselves (instead of the driver's
 * `requestPrinters`) so we hold the `USBDevice` and can match unplug events. `fromUSBDevice` is
 * marked deprecated in 0.6.4 but is the driver's only no-picker path; the version is pinned.
 */
export class LabelPrinter {
  private adapter: WebLabelWriterPrinter | undefined;
  private usbDevice: USBDevice | undefined;
  /** Set after an uncertain transfer; the connection is reopened before the next command. */
  private needsReset = false;
  private readonly listeners = new Set<() => void>();

  constructor() {
    navigator.usb.addEventListener('disconnect', event => {
      if (event.device === this.usbDevice) {
        log('printer unplugged');
        this.adapter = undefined;
        this.usbDevice = undefined;
        this.notify();
      }
    });
  }

  get connected(): boolean {
    return this.adapter !== undefined;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Reconnect to a printer paired earlier on this computer. No picker, no user gesture. */
  async reconnect(): Promise<boolean> {
    const devices = await navigator.usb.getDevices();
    const device = devices.find(d =>
      DEFAULT_FILTERS.some(f => f.vendorId === d.vendorId && f.productId === d.productId),
    );
    if (!device) return false;
    await this.open(device);
    return true;
  }

  /** Show Chrome's USB picker. Must be called from a click handler. */
  async pair(): Promise<void> {
    const device = await navigator.usb.requestDevice({ filters: DEFAULT_FILTERS });
    await this.open(device);
  }

  async disconnect(): Promise<void> {
    const adapter = this.adapter;
    this.adapter = undefined;
    this.usbDevice = undefined;
    this.notify();
    if (adapter) await adapter.close().catch(() => {});
  }

  async info(): Promise<PrinterInfo> {
    const adapter = await this.ready();
    const supported = adapter.device.key === TARGET_DEVICE.key;
    let firmware: string | undefined;
    let sku: SkuInfo | undefined;
    if (adapter.engine.protocol === 'lw5-raster') {
      const version: EngineVersion | undefined = await adapter.getEngineVersion().catch(() => undefined);
      firmware = version ? `${version.fwMajor}.${version.fwMinor}` : undefined;
      sku = await this.readRoll(adapter);
    }
    const status = await adapter.getStatus();
    return {
      model: adapter.model,
      ...(firmware ? { firmware } : {}),
      ...(sku ? { roll: sku } : {}),
      problems: status.errors.map(e => e.message),
      supported,
    };
  }

  /**
   * ESC U, tried twice. The driver returns undefined for a short or unrecognised reply; log why so
   * a failed read on real hardware can be diagnosed (roll data only, no label content).
   */
  private async readRoll(adapter: WebLabelWriterPrinter): Promise<SkuInfo | undefined> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const sku = await quietPaddedReply(() => adapter.getMedia());
        if (sku) {
          log(`roll read (attempt ${attempt}): ${sku.sku} ${sku.labelWidthMm}×${sku.labelLengthMm} mm`);
          return sku;
        }
        log(`roll read (attempt ${attempt}): no valid reply`);
      } catch (err) {
        log(`roll read (attempt ${attempt}) failed: ${errorText(err)}`);
      }
    }
    return undefined;
  }

  /**
   * Print one label. Throws `NotSentError` when the printer refused before receiving anything
   * (safe to retry). Any other error means the label may or may not have printed.
   */
  async printLabel(image: RawImageData, media: MediaDescriptor, settings: PrintSettings): Promise<void> {
    let adapter: WebLabelWriterPrinter;
    try {
      adapter = await this.ready();
    } catch (err) {
      throw new NotSentError(errorText(err));
    }
    let status;
    try {
      status = await adapter.getStatus();
    } catch (err) {
      this.needsReset = true;
      throw new NotSentError(`The printer did not respond (${errorText(err)})`);
    }
    const problem = status.errors[0];
    if (problem) throw new NotSentError(problem.message);

    try {
      // Explicit media + rotation: the driver's NFC-derived media carries no orientation hint.
      await adapter.print(image, media, { rotate: settings.rotate, density: settings.density });
    } catch (err) {
      const message = errorText(err);
      // The driver's own pre-send checks (print lock, status errors) throw these before any raster bytes.
      if (message.startsWith('Cannot print on') || message.startsWith('Print lock on')) {
        throw new NotSentError(message);
      }
      this.needsReset = true;
      throw err;
    }
  }

  private async open(device: USBDevice): Promise<void> {
    await this.disconnect();
    if (device.opened) await device.close().catch(() => {});
    const adapter = await fromUSBDevice(device);
    this.adapter = adapter;
    this.usbDevice = device;
    this.needsReset = false;
    log(`connected ${adapter.device.key}`);
    this.notify();
  }

  /**
   * The WebUSB transport doesn't cancel a timed-out read, so a late reply could be taken as the
   * answer to the next command. After any uncertain transfer, reopen the device first.
   */
  private async ready(): Promise<WebLabelWriterPrinter> {
    if (this.needsReset && this.usbDevice) {
      log('reopening connection after an interrupted transfer');
      const device = this.usbDevice;
      await this.adapter?.close().catch(() => {});
      await this.open(device);
    }
    if (!this.adapter) throw new Error('Printer is not connected');
    return this.adapter;
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * The 550 answers ESC U with a full 64-byte packet; the driver asks for 63, reads 64 and keeps 63.
 * The transport flags any read that fills its buffer ("read filled exactly 64 bytes … may have more
 * data queued"), which Chrome lists on the extension's Errors page. Verified on hardware
 * (2026-11-22): nothing else is queued — the next status read parses correctly. Hide only that
 * one message, only while the roll is being read; every other warning still goes through.
 */
async function quietPaddedReply<T>(read: () => Promise<T>): Promise<T> {
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === 'string' && first.includes('read filled exactly 64 bytes')) return;
    warn.apply(console, args);
  };
  try {
    return await read();
  } finally {
    console.warn = warn;
  }
}
