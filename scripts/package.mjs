// Zips dist/ into webusb-label-print-<version>.zip for copying to the Chromebook.
import { execFileSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const zip = `webusb-label-print-${version}.zip`;
await rm(zip, { force: true });
execFileSync('zip', ['-qr', `../${zip}`, '.', '-x', '*.map'], { cwd: 'dist', stdio: 'inherit' });
console.log(`Packaged ${zip}`);
