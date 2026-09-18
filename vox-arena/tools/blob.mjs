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
for (let i = 0; i < 6; i++) {
  await page.screenshot({ path: `shots/d-${i}.png` });
  await page.waitForTimeout(400);
}
await page.click('#btn-restart');
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/d-10-restart.png' });
await page.waitForTimeout(2000);
await page.screenshot({ path: 'shots/d-11-restart2.png' });
await browser.close();
console.log('ok');
