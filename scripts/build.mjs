// Bundles the extension into dist/. `--watch` rebuilds on change.
import { build, context } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const watch = process.argv.includes('--watch');
const pdfjs = 'node_modules/pdfjs-dist';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
manifest.version = pkg.version;
await writeFile('dist/manifest.json', JSON.stringify(manifest, null, 2));

await cp('src/ui/print.html', 'dist/print.html');
await cp('src/ui/print.css', 'dist/print.css');
await cp('assets/icons', 'dist/icons', { recursive: true });
await cp(`${pdfjs}/build/pdf.worker.min.mjs`, 'dist/pdfjs/pdf.worker.min.mjs');
await cp(`${pdfjs}/standard_fonts`, 'dist/pdfjs/standard_fonts', { recursive: true });
await cp(`${pdfjs}/cmaps`, 'dist/pdfjs/cmaps', { recursive: true });
await cp(`${pdfjs}/wasm`, 'dist/pdfjs/wasm', { recursive: true });
// Bundled third-party code ships with its licenses.
for (const name of [
  'pdfjs-dist',
  '@thermal-label/labelwriter-web',
  '@thermal-label/labelwriter-core',
  '@thermal-label/transport',
  '@thermal-label/contracts',
  '@mbtech-nl/bitmap',
]) {
  await cp(`node_modules/${name}/LICENSE`, `dist/licenses/${name.replace('/', '__')}.txt`);
}

const options = {
  entryPoints: {
    'service-worker': 'src/background/service-worker.ts',
    print: 'src/ui/print.ts',
  },
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  sourcemap: true,
  legalComments: 'linked',
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
