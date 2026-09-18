import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--mute-audio', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('file:///home/user/vox-arena/release/index.html');
await page.waitForFunction('window.__VOX__ && window.__VOX__.ready', null, { timeout: 25000 });
await page.evaluate('window.__VOX__.start(); window.__VOX__.gfx.pixelScale(0.2)');
await page.waitForFunction('window.__VOX__.waves.num === 1', null, { timeout: 30000 });
// убиваем игрока мгновенно и жмём рестарт
await page.waitForTimeout(1000);
await page.evaluate(`(() => { const V = window.__VOX__; V.player.hp = 0.5; for (let i=0;i<4;i++) V.spawn('minion', (i-1.5)*0.7, -1.2); })()`);
await page.waitForFunction(`window.__VOX__.state === 'dead'`, null, { timeout: 40000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'shots/30-death.png' });
await page.click('#btn-restart');
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/31-restart-04s.png' });
await page.waitForTimeout(1600);
await page.screenshot({ path: 'shots/32-restart-2s.png' });
await page.waitForTimeout(3000);
await page.screenshot({ path: 'shots/33-restart-5s.png' });
// замер ярких пикселей
const veil = await page.evaluate(`(() => {
  const c = document.getElementById('game-canvas');
  return { flashOpacity: document.getElementById('damage-flash').style.opacity,
           lowhp: document.getElementById('lowhp').style.opacity,
           state: window.__VOX__.state };
})()`);
console.log(JSON.stringify(veil));
await browser.close();
