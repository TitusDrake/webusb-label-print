/** Sent by the service worker to an already-open print window when the icon is clicked again. */
export interface OpenPdfMessage {
  type: 'open-pdf';
  url?: string;
  tabId?: number;
}

export function isOpenPdfMessage(value: unknown): value is OpenPdfMessage {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'open-pdf';
}

export const PRINT_PAGE = 'print.html';
