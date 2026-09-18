// Headless-тест: грузим release/index.html, стартуем игру, ловим ошибки, скриншотим
import { chromium } from 'playwright';
import fs from 'fs';

const errors = [], warns = [];
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--mute-audio', '--disable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', m => {
  const t = m.type();
  if (t === 'error' || t === 'warning') (t === 'error' ? errors : warns).push(m.text().slice(0, 500));
});
page.on('pageerror', e => errors.push('PAGEERROR: ' + String(e && e.stack || e).slice(0, 800)));

await page.goto('file:///home/user/vox-arena/release/index.html');
let ready = true;
try {
  await page.waitForFunction('window.__VOX__ && window.__VOX__.ready', null, { timeout: 25000 });
} catch (e) { ready = false; }

if (!ready || errors.length) {
  console.log('READY:', ready);
  console.log('ERRORS:', JSON.stringify(errors, null, 2).slice(0, 4000));
  await browser.close();
  process.exit(1);
}

fs.mkdirSync('shots', { recursive: true });
await page.screenshot({ path: 'shots/01-menu.png' });
console.log('state:', await page.evaluate('window.__VOX__.state'));

await page.evaluate('window.__VOX__.start()');
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/02-start.png' });

await page.waitForTimeout(3000);
await page.screenshot({ path: 'shots/03-wave.png' });

await page.evaluate(`window.__VOX__.spawn('minion', -1.2, -7)`);
await page.evaluate(`window.__VOX__.spawn('warrior', 1.4, -9)`);
await page.evaluate(`window.__VOX__.spawn('mage', 0, -14)`);
await page.waitForTimeout(1400);
await page.screenshot({ path: 'shots/04-enemies.png' });

await page.mouse.move(640, 360);
await page.mouse.down();
await page.waitForTimeout(700);
await page.screenshot({ path: 'shots/05-firing.png' });
await page.waitForTimeout(1500);
await page.mouse.up();
await page.screenshot({ path: 'shots/06-after.png' });

const stats = await page.evaluate(`({
  state: window.__VOX__.state,
  enemies: window.__VOX__.enemies.list.map(e => e.typeName + ':' + e.state),
  hp: window.__VOX__.player.hp,
  mag: window.__VOX__.player.mag,
  dead: window.__VOX__.enemies.list.length,
})`);
console.log('stats:', JSON.stringify(stats));
console.log('errors:', errors.length ? errors : 'нет');
if (warns.length) console.log('warns:', warns.slice(0, 5));
await browser.close();
