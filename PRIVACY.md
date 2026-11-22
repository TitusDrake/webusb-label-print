# Privacy Policy — WebUSB Label Print

_Last updated: 22 November 2026_

WebUSB Label Print is a Chrome extension that prints Square Dashboard label PDFs on a USB label printer. Everything it does happens on your own computer.

## What the extension reads

- **Square label PDFs.** When you click the extension's icon on a Square label-PDF tab, it downloads that PDF from Square (`squareup.com`), using the Square login already in your browser. The PDF contains what Square prints on the labels: item names, prices, SKUs and barcodes.
- **Printer and label-roll details** from the USB printer you connect: model, firmware version, printer status, and the label roll's part number and size.

## What it stores

Only on your computer, in Chrome's extension storage:

- Your print settings (label size, fit, rotation, darkness).
- Print progress for recent batches (which labels printed), so an interrupted batch can continue without reprinting. Each batch is identified by a fingerprint (a SHA-256 hash) of the PDF, not by its contents. The 50 most recent batches are kept.

The PDF itself and the label contents are not saved.

## What it sends

- Label images go **only to the printer, over USB**.
- The extension sends **no data to the developer or to any other service**. It has no analytics, tracking, ads or remote servers. Its only network requests are to Square, to download the PDF you asked to print.

## Sharing and sale

No data is sold, shared or transferred to anyone.

## Removing data

Uninstalling the extension deletes everything it stored.

## Contact

Questions: open an issue at https://github.com/TitusDrake/webusb-label-print/issues
