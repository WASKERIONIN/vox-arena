// Сборка единого HTML: ассеты -> base64-модуль, бандл esbuild, инлайн в шаблон
import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const root = path.resolve(new URL('..', import.meta.url).pathname);

// 1) src/assets.js из assets/processed/*.glb
const assetDir = path.join(root, 'assets', 'processed');
const files = fs.readdirSync(assetDir).filter(f => f.endsWith('.glb'));
let js = '// Автогенерируется tools/build.mjs — GLB как data URLs\nexport const ASSETS = {\n';
for (const f of files) {
  const b64 = fs.readFileSync(path.join(assetDir, f)).toString('base64');
  js += `  ${path.basename(f, '.glb')}: 'data:model/gltf-binary;base64,${b64}',\n`;
}
js += '};\n';
fs.writeFileSync(path.join(root, 'src', 'assets.js'), js);
console.log('assets.js:', files.map(f => path.basename(f)).join(', '));

// 2) бандл
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

// 3) инлайн в шаблон
const tpl = fs.readFileSync(path.join(root, 'index.template.html'), 'utf8');
const html = tpl.replace('/*__BUNDLE__*/', () => bundle);
fs.mkdirSync(path.join(root, 'release'), { recursive: true });
fs.writeFileSync(path.join(root, 'release', 'index.html'), html);

const mb = (fs.statSync(path.join(root, 'release', 'index.html')).size / 1024 / 1024).toFixed(2);
console.log(`release/index.html готов: ${mb} MB`);
