import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--mute-audio', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
await page.goto('file:///home/user/vox-arena/release/index.html');
await page.waitForFunction('window.__VOX__ && window.__VOX__.ready', null, { timeout: 25000 });
await page.evaluate('window.__VOX__.start(); window.__VOX__.gfx.pixelScale(0.2)');
await page.waitForFunction('window.__VOX__.waves.num === 1', null, { timeout: 30000 });
for (let cycle = 0; cycle < 3; cycle++) {
  await page.evaluate(`(() => { const V = window.__VOX__; V.player.hp = 0.5; for (let i=0;i<4;i++) V.spawn('minion', (i-1.5)*0.7, -1.2); })()`);
  await page.waitForFunction(`window.__VOX__.state === 'dead'`, null, { timeout: 40000 });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `shots/v${cycle}-death.png` });
  await page.click('#btn-restart');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `shots/v${cycle}-r03.png` });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `shots/v${cycle}-r08.png` });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `shots/v${cycle}-r23.png` });
  console.log('цикл', cycle, 'done, state =', await page.evaluate('window.__VOX__.state'));
  if (cycle < 2) { // снова убиваем
    await page.waitForTimeout(500);
  }
}
console.log('errors:', errors.length ? errors.slice(0, 3) : 'нет');
await browser.close();
