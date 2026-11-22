/** Hosts the extension has permission for. Keep in sync with manifest `host_permissions`. */
export function isSquareHost(hostname: string): boolean {
  return hostname === 'squareup.com' || hostname.endsWith('.squareup.com');
}

/** Square's generated label PDF, e.g. `/api/v2/inventory/labels/<generated>.pdf?print`. */
const LABEL_PDF_PATH = /^\/api\/v2\/inventory\/labels\/[^/]+\.pdf$/i;

export function isSquareLabelPdfUrl(url: string | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === 'https:' && isSquareHost(parsed.hostname) && LABEL_PDF_PATH.test(parsed.pathname)
  );
}
