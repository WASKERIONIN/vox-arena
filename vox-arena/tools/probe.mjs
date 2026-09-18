import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--mute-audio', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('file:///home/user/vox-arena/release/index.html');
await page.waitForFunction('window.__VOX__ && window.__VOX__.ready', null, { timeout: 25000 });
await page.evaluate('window.__VOX__.start()');
await page.waitForFunction('window.__VOX__.waves.num === 1', null, { timeout: 30000 });
await page.evaluate(`(() => { const V = window.__VOX__; V.player.hp = 0.5; for (let i=0;i<4;i++) V.spawn('minion', (i-1.5)*0.7, -1.2); })()`);
await page.waitForFunction(`window.__VOX__.state === 'dead'`, null, { timeout: 40000 });
await page.waitForTimeout(1200);
await page.click('#btn-restart');
await page.waitForTimeout(2500);
const info = await page.evaluate(`(() => {
  const V = window.__VOX__;
  // что находится рядом с камерой?
  const cam = V.player.camera;
  const near = [];
  V.fx.scene.traverse(o => {
    if (!o.isMesh && !o.isSprite) return;
    const wp = new (o.position.constructor)();
    o.getWorldPosition(wp);
    const d = wp.distanceTo(cam.getWorldPosition(new (o.position.constructor)()));
    if (d < 3) near.push({ type: o.isSprite ? 'sprite' : 'mesh', name: o.name || (o.material && o.material.map ? o.material.map.image ? 'tex' : 'notex' : ''), d: d.toFixed(2), vis: o.visible });
  });
  return {
    hitmarker: document.getElementById('hitmarker').className,
    near: near.slice(0, 12),
    camPos: [cam.position.x.toFixed(2), cam.position.y.toFixed(2), cam.position.z.toFixed(2)],
    enemies: V.enemies.list.length,
  };
})()`);
console.log(JSON.stringify(info, null, 1));
await browser.close();
