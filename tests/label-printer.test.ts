import type { RawImageData } from '@thermal-label/labelwriter-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { NotSentError } from '../src/batch/batch';
import { TARGET_MEDIA, labelGeometry } from '../src/printer/geometry';
import { LabelPrinter } from '../src/printer/label-printer';

/**
 * Runs our wrapper + the real thermal-label driver against a simulated LabelWriter 550 USB device
 * and inspects the bytes that would go over the wire.
 */

const ESC = 0x1b;

interface FakeDevice extends USBDevice {
  writes: Uint8Array[];
  openCount: number;
  bayStatus: number;
  failWrites: boolean;
}

function fakeLw550(): FakeDevice {
  let opened = false;
  const device = {
    vendorId: 0x0922,
    productId: 0x0028,
    writes: [] as Uint8Array[],
    openCount: 0,
    bayStatus: 8, // media present, ok
    failWrites: false,
    get opened() {
      return opened;
    },
    configuration: {
      configurationValue: 1,
      interfaces: [
        {
          interfaceNumber: 0,
          alternate: {
            endpoints: [
              { endpointNumber: 1, direction: 'out', packetSize: 64 },
              { endpointNumber: 2, direction: 'in', packetSize: 64 },
            ],
          },
        },
      ],
    },
    async open() {
      opened = true;
      device.openCount++;
    },
    async close() {
      opened = false;
    },
    async selectConfiguration() {},
    async claimInterface() {},
    async releaseInterface() {},
    async transferOut(_ep: number, data: BufferSource) {
      if (device.failWrites) throw new DOMException('The device was disconnected.', 'NotFoundError');
      const bytes = new Uint8Array(data instanceof ArrayBuffer ? data : (data as Uint8Array));
      device.writes.push(Uint8Array.from(bytes));
      return { bytesWritten: bytes.length, status: 'ok' };
    },
    async transferIn() {
      // Every request gets a 32-byte 550 status frame; byte 10 is the bay status.
      const status = new Uint8Array(32);
      status[10] = device.bayStatus;
      return { data: new DataView(status.buffer), status: 'ok' };
    },
  };
  return device as unknown as FakeDevice;
}

function installUsb(device: FakeDevice): void {
  Object.defineProperty(globalThis.navigator, 'usb', {
    configurable: true,
    value: {
      getDevices: async () => [device],
      requestDevice: async () => device,
      addEventListener: () => {},
    },
  });
}

function whiteLandscapeLabel(): RawImageData {
  const geo = labelGeometry();
  const data = new Uint8Array(geo.printableLengthDots * geo.widthDots * 4).fill(255);
  return { width: geo.printableLengthDots, height: geo.widthDots, data };
}

function allBytes(device: FakeDevice): number[] {
  return device.writes.flatMap(w => Array.from(w));
}

function indexOfSeq(haystack: number[], needle: number[]): number {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

function u32le(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
}

const settings = { rotate: 90 as const, density: 'normal' as const };

describe('LabelPrinter with a simulated LabelWriter 550', () => {
  let device: FakeDevice;
  let printer: LabelPrinter;

  beforeEach(() => {
    device = fakeLw550();
    installUsb(device);
    printer = new LabelPrinter();
  });

  it('reconnects to a previously paired printer and reports it healthy', async () => {
    expect(await printer.reconnect()).toBe(true);
    const info = await printer.info();
    expect(info.model).toBe('LabelWriter 550');
    expect(info.supported).toBe(true);
    expect(info.problems).toEqual([]);
  });

  it('sends one complete 550 job per label with the 30336 raster size', async () => {
    await printer.reconnect();
    device.writes = [];
    await printer.printLabel(whiteLandscapeLabel(), TARGET_MEDIA, settings);
    const bytes = allBytes(device);

    expect(indexOfSeq(bytes, [ESC, 0x73])).toBeGreaterThanOrEqual(0); // ESC s — job header
    // ESC D: bpp 1, bottom-aligned, 567 raster lines (feed), 672 dots per line (full head).
    const header = [ESC, 0x44, 1, 2, ...u32le(567), ...u32le(672)];
    expect(indexOfSeq(bytes, header)).toBeGreaterThanOrEqual(0);
    expect(bytes.slice(-4)).toEqual([ESC, 0x45, ESC, 0x51]); // ESC E feed to tear, ESC Q end job
  });

  it('refuses before sending any label data when the printer reports a problem', async () => {
    await printer.reconnect();
    device.bayStatus = 2; // no media present
    device.writes = [];
    const err = await printer.printLabel(whiteLandscapeLabel(), TARGET_MEDIA, settings).catch(e => e);
    expect(err).toBeInstanceOf(NotSentError);
    expect((err as Error).message).toMatch(/label roll/i);
    expect(indexOfSeq(allBytes(device), [ESC, 0x73])).toBe(-1); // no job started
  });

  it('treats a failure mid-job as uncertain and reopens the connection before the next label', async () => {
    await printer.reconnect();
    const opensBefore = device.openCount;
    const statusCheckThenFail = device.transferOut.bind(device);
    let writes = 0;
    device.transferOut = async (ep, data) => {
      writes++;
      if (writes === 3) throw new DOMException('A transfer error has occurred.', 'NetworkError');
      return statusCheckThenFail(ep, data);
    };
    const err = await printer.printLabel(whiteLandscapeLabel(), TARGET_MEDIA, settings).catch(e => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(NotSentError);

    device.transferOut = statusCheckThenFail;
    await printer.printLabel(whiteLandscapeLabel(), TARGET_MEDIA, settings);
    expect(device.openCount).toBe(opensBefore + 1);
  });

  it('reports "not connected" as not sent', async () => {
    const err = await printer.printLabel(whiteLandscapeLabel(), TARGET_MEDIA, settings).catch(e => e);
    expect(err).toBeInstanceOf(NotSentError);
  });
});
