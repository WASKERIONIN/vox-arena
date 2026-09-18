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
await page.waitForTimeout(2500);
const hits = await page.evaluate(`(() => {
  const THREE = window.__VOX__.player.camera.position.constructor ? window : window;
  const V = window.__VOX__;
  const cam = V.player.camera;
  const rc = new (cam.getWorldDirection(new cam.position.constructor()).constructor) ? null : null;
  return 'need-three';
})()`);
// three не экспортирован — сделаю иначе: сравню скриншот ДО и ПОСЛЕ скрытия групп по очереди
await page.screenshot({ path: 'shots/r0-with.png' });
const groups = await page.evaluate(`(() => {
  const V = window.__VOX__;
  const out = [];
  V.fx.scene.children.forEach((c, i) => {
    out.push({ i, type: c.type, visible: c.visible, pos: [c.position.x.toFixed(1), c.position.y.toFixed(1), c.position.z.toFixed(1)], kids: c.children ? c.children.length : 0 });
  });
  return out;
})()`);
console.log(JSON.stringify(groups));
// скрываю по одному индексу и проверяю красный пиксель
import fs from 'fs';
const { execSync } = await import('child_process');
for (const g of groups) {
  if (g.type === 'Group' || g.kids > 0) {
    await page.evaluate(i => { window.__VOX__.fx.scene.children[i].visible = false; }, g.i);
    await page.screenshot({ path: `shots/r-hide-${g.i}.png` });
    await page.evaluate(i => { window.__VOX__.fx.scene.children[i].visible = true; }, g.i);
  }
}
await browser.close();
