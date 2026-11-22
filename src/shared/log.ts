/** Console logging. Never pass item names, prices, SKUs or PDF contents here. */
export function log(message: string): void {
  console.info(`[label-print] ${message}`);
}
