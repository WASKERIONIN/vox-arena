import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--mute-audio', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('file:///home/user/vox-arena/release/index.html');
await page.waitForFunction('window.__VOX__ && window.__VOX__.ready', null, { timeout: 25000 });
await page.evaluate('window.__VOX__.start()');
await page.waitForTimeout(5000);
const reds = await page.evaluate(`(() => {
  const out = [];
  window.__VOX__.fx.scene.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material;
    const col = m && m.color ? [m.color.r, m.color.g, m.color.b].map(x => x.toFixed(2)).join(',') : null;
    const emissive = m && m.emissive ? [m.emissive.r, m.emissive.g, m.emissive.b].map(x => x.toFixed(2)).join(',') : null;
    const isRed = col && +col.split(',')[0] > 0.55 && +col.split(',')[1] < 0.35;
    if (isRed) out.push({ pos: [o.position.x.toFixed(1), o.position.y.toFixed(1), o.position.z.toFixed(1)], col, emissive, mat: m.type, sz: o.geometry && o.geometry.parameters ? JSON.stringify({w: o.geometry.parameters.width, h: o.geometry.parameters.height, d: o.geometry.parameters.depth}) : '', parent: o.parent && o.parent.type });
  });
  return out;
})()`);
console.log(JSON.stringify(reds, null, 1));
await browser.close();
