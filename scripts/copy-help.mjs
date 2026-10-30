// Divtech Hisaab - copies the built help pages (docs-site/out/help) into
// dist/help, so the local server serves them at /help/ and every Help button
// in the app works offline. Run after `vite build` and `node docs-site/build.mjs`.
import { cpSync, existsSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const SRC = join(ROOT, 'docs-site', 'out', 'help');
const DEST = join(ROOT, 'dist', 'help');

if (!existsSync(SRC)) {
  console.error('  x docs-site/out/help not found. Run `node docs-site/build.mjs` first.');
  process.exit(1);
}
if (!existsSync(join(ROOT, 'dist'))) {
  console.error('  x dist/ not found. Run `vite build` first.');
  process.exit(1);
}
rmSync(DEST, { recursive: true, force: true });
cpSync(SRC, DEST, { recursive: true });
console.log('  ✓ Help pages copied to dist/help');
