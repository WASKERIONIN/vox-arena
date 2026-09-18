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
const gate = await page.evaluate(`(() => {
  const V = window.__VOX__;
  const g = V.fx.scene.children[22];
  const out = { kids: [], world: [] };
  g.children.forEach((c, i) => {
    const wp = c.getWorldPosition(new c.position.constructor());
    out.kids.push({ i, type: c.type, local: [c.position.x, c.position.y, c.position.z].map(v => +v.toFixed(2)), world: [wp.x, wp.y, wp.z].map(v => +v.toFixed(2)), visible: c.visible, scale: c.scale.x });
  });
  return out;
})()`);
console.log(JSON.stringify(gate, null, 1));
await browser.close();
