// Bundle the game (three.js included) into one self-contained HTML file that
// opens by double-click — handy for itch.io uploads or an Electron/Tauri shell.
//   npm i --no-save esbuild three@0.170.0
//   node tools/build-single.mjs            -> dist/igri.html
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const res = await esbuild.build({
  entryPoints: [path.join(ROOT, 'js/main.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2020',
  write: false,
  legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
const out = html
  .replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '')
  .replace('<link rel="stylesheet" href="css/style.css" />', `<style>\n${css}\n</style>`)
  .replace(/<script>\s*if \(location\.protocol[\s\S]*?<\/script>\s*/, '')
  .replace('<script type="module" src="js/main.js"></script>', `<script type="module">\n${js}\n</script>`);
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist/igri.html'), out);
console.log(`dist/igri.html (${(out.length / 1024).toFixed(0)} KB)`);
