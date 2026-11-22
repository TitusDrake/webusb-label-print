# WebUSB Label Print

Chrome extension that prints Square Dashboard barcode labels directly to a DYMO LabelWriter 550 over USB. It skips the ChromeOS print system, which reports success but never makes this printer print.

Everything runs on the Chromebook. The label PDF is downloaded from Square using your existing login and is never sent anywhere else.

**Status:** prints real Square labels on a LabelWriter 550 from desktop Chrome and a Chromebook. Printing uses the open-source [thermal-label](https://github.com/thermal-label/labelwriter) LabelWriter driver.

## Printing labels

1. In Square: **Items & Services → Item Library**, select items and quantities, click **Print Labels**. Square opens the labels as a PDF in a new tab.
2. On that PDF tab, click the extension's icon (it shows a green ✓ on Square label tabs). Don't use Chrome's Print button.
3. A **Label Printer** tab opens next to it with the label count and a preview. Use ‹ › to check labels.
4. Click **Print _N_ labels**. Leave that tab open until it says all labels printed. **Stop after this label** stops cleanly.

If something goes wrong, printing pauses and says why (out of labels, cover open, unplugged…). Fix it, then click **Continue printing**; it picks up at the next unprinted label. If the extension can't tell whether a label printed, it asks you to check the printer before going on, so nothing is printed twice.

**Label size is detected automatically** from the roll in the printer (the 550 reads a chip on every genuine DYMO roll). The default is DYMO **30336** (1" × 2⅛"), used when the roll can't be identified. If the Square labels were made for a different size than the roll that's loaded, the Label Printer warns before printing; pick the matching size in Square or swap the roll. To force a size, use **Advanced settings → Label size**. Sizes other than 30336 haven't been tested on paper yet; two-across rolls and continuous rolls aren't supported.

The LabelWriter 550 only prints on genuine DYMO labels.

## Compatibility

**Printer:** DYMO LabelWriter 550, connected by USB. This is the only model it has been tested with.

**Labels:** genuine DYMO single die-cut paper labels in these sizes, detected automatically from the roll. **Tested on paper: 30336.** The others are supported by the driver but untested.

| DYMO part number | Label | Size (W × L) |
|---|---|---|
| **30336**, 1976411 | Small Multipurpose (default) | 25 × 54 mm (1" × 2⅛") |
| 30330, 30578 | Return Address | 19 × 51 mm |
| 30251, 30252, 30254, 30320, 30340 | Address | 28 × 89 mm |
| 30321 | Large Address | 36 × 89 mm |
| 30323 | Shipping | 54 × 102 mm |
| 30256, 1763982, 1933088 | Large Shipping | 59 × 102 mm |
| 1933087, 99019 | Lever Arch / Confirmation | 59 × 190 mm |
| 30327 | File Folder | 14 × 87 mm |
| 30332, 1933083 | Square | 25 × 25 mm |
| 30334, 1933084 | Medium | 57 × 32 mm |
| 11354, S0722540 | Removable Multi-Purpose | 57 × 32 mm |
| 30324 | Large | 54 × 70 mm |
| 30326 | Video Top | 46 × 79 mm |
| 30370 | Removable | 51 × 59 mm |
| 1933081 | Shelving | 25 × 89 mm |
| 30374 | Appointment / Business Card | 51 × 89 mm |
| 30347 | Book Spine | 25 × 38 mm |
| 1933085 | Barcode / DYMO File | 19 × 64 mm |
| 30857, 30911 | Name Badge | 57 × 102 mm |
| 30856 | Name Badge, non-adhesive | 62 × 106 mm |
| 30373 | Price Tag | 24 × 22 mm |

Not supported: two-across rolls (e.g. 30333, 30299), continuous rolls, D1 tape, and non-DYMO labels.

## Install on the Chromebook

No Linux and no ChromeOS Developer Mode needed.

1. On the Chromebook, download `webusb-label-print-<version>.zip` from the latest [GitHub release](https://github.com/TitusDrake/webusb-label-print/releases/latest) (or copy it over by Google Drive or USB stick).
2. In the **Files** app, make a new folder `webusb-label-print` in **My files › Downloads**. Double-click the zip to open it, select everything inside (Ctrl+A), copy (Ctrl+C), and paste (Ctrl+V) into the new folder. Keep the folder there; Chrome loads the extension from it.
3. Go to `chrome://extensions`, turn on **Developer mode** (top right), click **Load unpacked**, and pick that folder.
4. Click the puzzle-piece icon in Chrome's toolbar and **pin** WebUSB Label Print.

If **Developer mode** is greyed out, the Chromebook is managed by an organization that blocks unpacked extensions; the admin has to allow it.

## Connect the printer (once)

1. Plug the LabelWriter 550 in by USB, turn it on, load 30336 labels.
2. Click the extension icon, then **Connect printer**. In Chrome's list, pick **LabelWriter 550** and click **Connect**.
3. Click **Print test label**. Check that the border sits inside the label and the "F" reads normally. If it prints upside down, open **Advanced settings → Rotation → Upside down**.

Chrome remembers the printer; after this it connects automatically. This must be done on the Chromebook itself, not on another computer.

## Update

1. Replace the contents of the same `webusb-label-print` folder with the new version's files. Using the same folder keeps the printer pairing and saved progress.
2. Go to `chrome://extensions` and click the reload ↻ button on WebUSB Label Print.

## Development (macOS)

Requires Node.js 22+.

```bash
npm install
npm test            # unit tests (incl. a simulated LabelWriter 550)
npm run typecheck
npm run build       # → dist/ (load unpacked in Chrome for testing)
npm run watch       # rebuild on change
npm run package     # → webusb-label-print-<version>.zip
```

Bump `version` in `package.json` before packaging a release.

Project layout:

```
manifest.json        extension manifest (version filled in at build)
src/background/      service worker: icon click → print tab
src/ui/              print page (HTML, CSS, controller)
src/printer/         USB printer wrapper, label geometry, test label
src/pdf/             PDF.js rendering, page placement, black/white conversion
src/square/          Square URL check and PDF download
src/batch/           per-label print state machine
tests/               Vitest unit tests
scripts/             build and package scripts
```

Put real Square PDFs for testing in `fixtures/` (git-ignored). Never commit them.

## License

Not yet chosen. Bundled third-party licenses are copied to `dist/licenses/` at build.
