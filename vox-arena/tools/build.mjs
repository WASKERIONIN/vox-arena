// Сборка единого HTML: бандл esbuild -> инлайн в шаблон.
// Ассеты больше не нужны: враги и оружие генерируются процедурно.
import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const root = path.resolve(new URL('..', import.meta.url).pathname);

await esbuild.build({
  entryPoints: [path.join(root, 'src', 'main.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  minify: true,
  legalComments: 'none',
  outfile: path.join(root, 'dist', 'bundle.js'),
  logLevel: 'warning',
});
const bundle = fs.readFileSync(path.join(root, 'dist', 'bundle.js'), 'utf8');

const tpl = fs.readFileSync(path.join(root, 'index.template.html'), 'utf8');
const html = tpl.replace('/*__BUNDLE__*/', () => bundle);
fs.mkdirSync(path.join(root, 'release'), { recursive: true });
fs.writeFileSync(path.join(root, 'release', 'index.html'), html);

const mb = (fs.statSync(path.join(root, 'release', 'index.html')).size / 1024 / 1024).toFixed(2);
console.log(`release/index.html готов: ${mb} MB`);
