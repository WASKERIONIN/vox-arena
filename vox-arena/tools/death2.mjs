import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--mute-audio', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
await page.goto('file:///home/user/vox-arena/release/index.html');
await page.waitForFunction('window.__VOX__ && window.__VOX__.ready', null, { timeout: 25000 });
await page.evaluate('window.__VOX__.start(); window.__VOX__.gfx.pixelScale(0.15)');
await page.waitForFunction('window.__VOX__.waves.num === 1', null, { timeout: 30000 });
await page.evaluate(`(() => {
  const V = window.__VOX__;
  V._log = [];
  const pd = V.player.damage.bind(V.player);
  V.player.damage = (a, b, c, d) => { V._log.push('dmg:' + a.toFixed(0) + ' hp:' + V.player.hp.toFixed(0)); pd(a, b, c, d); };
  V.player.hp = 1;
  for (let i = 0; i < 3; i++) V.spawn('minion', (i - 1) * 0.8, -1.5);
})()`);
for (let i = 0; i < 10; i++) {
  const s = await page.evaluate(`(() => {
    const V = window.__VOX__;
    return {
      st: V.state, hp: V.player.hp.toFixed(1),
      log: V._log.slice(-4),
      es: V.enemies.list.map(e => e.typeName.slice(0,4) + ':' + e.state + ':d' + Math.hypot(e.pos.x-V.player.pos.x, e.pos.z-V.player.pos.z).toFixed(2) + ':cd' + e.cdT.toFixed(2)),
    };
  })()`);
  console.log(JSON.stringify(s));
  if (s.st === 'dead') { console.log('DEAD ✓'); break; }
  await page.waitForTimeout(2000);
}
console.log('errors:', errors.length ? errors.slice(0, 3) : 'нет');
await browser.close();
