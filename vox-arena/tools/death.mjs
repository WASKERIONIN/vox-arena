import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--mute-audio', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
await page.goto('file:///home/user/vox-arena/release/index.html');
await page.waitForFunction('window.__VOX__ && window.__VOX__.ready', null, { timeout: 25000 });
await page.evaluate('window.__VOX__.start()');
await page.waitForTimeout(4500); // ждём волну 1 и спавн
await page.evaluate('window.__VOX__.player.hp = 1');
for (let i = 0; i < 6; i++) {
  const s = await page.evaluate(`(() => {
    const V = window.__VOX__;
    const list = V.enemies.list;
    return {
      state: V.state,
      hp: V.player.hp,
      ppos: [V.player.pos.x.toFixed(1), V.player.pos.z.toFixed(1)],
      wave: V.waves.num,
      enemies: list.map(e => e.typeName.slice(0,4) + ':' + e.state + ':d' + Math.hypot(e.pos.x - V.player.pos.x, e.pos.z - V.player.pos.z).toFixed(1)),
    };
  })()`);
  console.log(JSON.stringify(s));
  if (s.state === 'dead') break;
  await page.waitForTimeout(1500);
}
console.log('errors:', errors.length ? errors.slice(0, 3) : 'нет');
await browser.close();
