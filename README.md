# WebUSB Label Print

Chrome extension that prints Square Dashboard barcode labels directly to a DYMO LabelWriter 550 over USB. It skips the ChromeOS print system, which reports success but never makes this printer print.

Everything runs on the Chromebook. The label PDF is downloaded from Square using your existing login and is never sent anywhere else.

**Status:** prints real Square labels on a LabelWriter 550 from desktop Chrome; **not yet tested on the Chromebook.** Printing uses the open-source [thermal-label](https://github.com/thermal-label/labelwriter) LabelWriter driver.

## Printing labels

1. In Square: **Items & Services → Item Library**, select items and quantities, click **Print Labels**. Square opens the labels as a PDF in a new tab.
2. On that PDF tab, click the extension's icon (it shows a green ✓ on Square label tabs). Don't use Chrome's Print button.
3. A **Label Printer** tab opens next to it with the label count and a preview. Use ‹ › to check labels.
4. Click **Print _N_ labels**. Leave that tab open until it says all labels printed. **Stop after this label** stops cleanly.

If something goes wrong, printing pauses and says why (out of labels, cover open, unplugged…). Fix it, then click **Continue printing**; it picks up at the next unprinted label. If the extension can't tell whether a label printed, it asks you to check the printer before going on, so nothing is printed twice.

**Label size is detected automatically** from the roll in the printer (the 550 reads a chip on every genuine DYMO roll). The default is DYMO **30336** (1" × 2⅛"), used when the roll can't be identified. If the Square labels were made for a different size than the roll that's loaded, the Label Printer warns before printing; pick the matching size in Square or swap the roll. To force a size, use **Advanced settings → Label size**. Sizes other than 30336 haven't been tested on paper yet; two-across rolls and continuous rolls aren't supported.

The LabelWriter 550 only prints on genuine DYMO labels.

## Install on the Chromebook

No Linux and no ChromeOS Developer Mode needed.

1. Copy `webusb-label-print-<version>.zip` to the Chromebook (Google Drive, USB stick, or email).
2. In the **Files** app, open the zip and copy the `webusb-label-print` folder into **My files › Downloads**. Keep the folder there; Chrome loads the extension from it.
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
