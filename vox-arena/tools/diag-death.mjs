import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--mute-audio', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
await page.goto('file:///home/user/vox-arena/release/index.html');
await page.waitForFunction('window.__VOX__ && window.__VOX__.ready', null, { timeout: 30000 });
await page.evaluate('window.__VOX__.start()');
await page.waitForFunction('window.__VOX__.waves.num === 1', null, { timeout: 60000 });
await page.waitForTimeout(1000);
await page.evaluate(`(() => { const V = window.__VOX__; V.player.hp = 0.5; for (let i=0;i<4;i++) V.spawn('minion', (i-1.5)*0.7, -1.2); })()`);
await page.waitForFunction(`window.__VOX__.state === 'dead'`, null, { timeout: 60000 });
for (let i = 0; i < 5; i++) {
  await page.waitForTimeout(700);
  const s = await page.evaluate(`({
    deathClass: document.getElementById('death').className,
    btnVisible: (() => { const b = document.getElementById('btn-restart'); const r = b.getBoundingClientRect(); return r.width + 'x' + r.height; })(),
    fadeOp: document.getElementById('fade').style.opacity,
    fadePE: getComputedStyle(document.getElementById('fade')).pointerEvents,
    hudClass: document.getElementById('hud').className,
  })`);
  console.log(i, JSON.stringify(s));
}
console.log('errors:', errors.length ? errors.slice(0, 3) : 'нет');
await browser.close();
