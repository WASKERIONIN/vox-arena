import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--mute-audio', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('file:///home/user/vox-arena/release/index.html');
await page.waitForFunction('window.__VOX__ && window.__VOX__.ready', null, { timeout: 25000 });
await page.evaluate('window.__VOX__.start()');
await page.waitForFunction('window.__VOX__.waves.num === 1', null, { timeout: 30000 });
await page.waitForTimeout(800);
await page.evaluate(`(() => { const V = window.__VOX__; V.player.hp = 0.5; for (let i=0;i<4;i++) V.spawn('minion', (i-1.5)*0.7, -1.2); })()`);
await page.waitForFunction(`window.__VOX__.state === 'dead'`, null, { timeout: 40000 });
await page.waitForTimeout(1200);
await page.click('#btn-restart');
await page.waitForTimeout(800);
const giants = await page.evaluate(`(() => {
  const V = window.__VOX__;
  const out = [];
  V.fx.scene.updateMatrixWorld(true);
  V.fx.scene.traverse(o => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    if (!o.visible) return;
    let bs = null;
    try { bs = new (o.geometry.boundingSphere || Object).constructor ? (o.geometry.computeBoundingSphere(), o.geometry.boundingSphere) : null; } catch(e) {}
    if (!bs) return;
    const scale = o.getWorldScale(new (o.position.constructor)());
    const r = bs.radius * Math.max(scale.x, scale.y, scale.z);
    if (r > 8) out.push({ type: o.type, r: +r.toFixed(1), scale: +scale.x.toFixed(2), parent: o.parent && o.parent.type, gp: o.parent ? [o.parent.position.x, o.parent.position.y, o.parent.position.z].map(v=>+v.toFixed(1)) : null });
  });
  // и NaN-проверка вокселей
  const fx = V.fx;
  let nans = 0;
  for (let i = 0; i < fx.count; i++) if (!isFinite(fx.px[i]) || !isFinite(fx.size[i])) nans++;
  return { giants: out, voxCount: fx.count, nans };
})()`);
console.log(JSON.stringify(giants, null, 1));
await browser.close();
