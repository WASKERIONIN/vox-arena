import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--mute-audio', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });
await page.goto('file:///home/user/vox-arena/release/index.html');
await page.waitForFunction('window.__VOX__ && window.__VOX__.ready', null, { timeout: 25000 });
console.log('ready ok');
await page.evaluate('window.__VOX__.start()');
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(3000);
  const s = await page.evaluate(`({ st: window.__VOX__.state, w: window.__VOX__.waves.num, ws: window.__VOX__.waves.state, t: window.__VOX__.waves.t.toFixed(1) })`);
  console.log(JSON.stringify(s));
}
console.log('errors:', errors.length ? errors.slice(0, 5) : 'нет');
await browser.close();
