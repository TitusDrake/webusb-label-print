import { isSquareLabelPdfUrl } from './url';
import { log } from '../shared/log';

const MAX_PDF_BYTES = 50 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Download the label PDF with the user's Square session. The bytes stay in this window; they are
 * never sent anywhere else.
 *
 * 1. Fetch from the extension page (host permission for squareup.com, cookies included).
 * 2. If that is rejected (e.g. session cookies not attached), fetch from inside the Square tab,
 *    which is same-origin with the PDF.
 */
export async function fetchSquarePdf(url: string, tabId: number | undefined): Promise<Uint8Array> {
  if (!isSquareLabelPdfUrl(url)) throw new Error('This is not a Square label PDF');
  try {
    return await fetchDirect(url);
  } catch (err) {
    log(`direct download failed (${err instanceof Error ? err.message : String(err)})`);
    if (tabId === undefined) throw err;
    log('retrying download from inside the Square tab');
    return fetchInTab(url, tabId);
  }
}

async function fetchDirect(url: string): Promise<Uint8Array> {
  const response = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Square returned ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return checkSize(bytes);
}

async function fetchInTab(url: string, tabId: number): Promise<Uint8Array> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [url, FETCH_TIMEOUT_MS],
    func: async (pdfUrl: string, timeoutMs: number) => {
      // Runs in the Square tab. Must be self-contained.
      const response = await fetch(pdfUrl, {
        credentials: 'include',
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) return { error: `Square returned ${response.status}` };
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      return { base64: btoa(binary) };
    },
  });
  const value = result?.result as { base64?: string; error?: string } | undefined;
  if (!value?.base64) throw new Error(value?.error ?? 'Could not read the PDF from the Square tab');
  const binary = atob(value.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return checkSize(bytes);
}

function checkSize(bytes: Uint8Array): Uint8Array {
  if (bytes.length > MAX_PDF_BYTES) throw new Error('The PDF is too large');
  return bytes;
}
