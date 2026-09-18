import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--mute-audio', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
await page.goto('file:///home/user/vox-arena/release/index.html');
await page.waitForFunction('window.__VOX__ && window.__VOX__.ready', null, { timeout: 25000 });
await page.evaluate('window.__VOX__.start()');
await page.evaluate(`(() => {
  const V = window.__VOX__;
  V._aimTimer = setInterval(() => {
    const list = V.enemies.list.filter(e => e.state !== 'dying' && e.state !== 'dead');
    if (!list.length) return;
    let best = null, bd = 1e9;
    for (const e of list) {
      const dx = e.pos.x - V.player.pos.x, dz = e.pos.z - V.player.pos.z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = e; }
    }
    const dx = best.pos.x - V.player.pos.x, dz = best.pos.z - V.player.pos.z;
    const dy = (best.pos.y + best.T.height * 0.75) - (V.player.pos.y + 1.62);
    V.player.yaw = Math.atan2(-dx, -dz);
    V.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }, 100);
})()`);
await page.mouse.move(640, 360);
await page.mouse.down(); // стреляем постоянно
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(5000);
  const s = await page.evaluate(`({
    t: Date.now() / 1000 | 0,
    wave: window.__VOX__.waves.num,
    wstate: window.__VOX__.waves.state,
    queue: window.__VOX__.waves.queue.length,
    pending: window.__VOX__.waves.pending.length,
    alive: window.__VOX__.enemies.list.map(e => e.typeName.slice(0, 4) + ':' + e.state + ':(' + e.pos.x.toFixed(1) + ',' + e.pos.y.toFixed(1) + ',' + e.pos.z.toFixed(1) + ')'),
    hp: Math.round(window.__VOX__.player.hp),
    mag: window.__VOX__.player.mag,
    killUI: document.getElementById('kills-label').textContent,
  })`);
  console.log(JSON.stringify(s));
}
console.log('errors:', errors.length ? errors : 'нет');
await browser.close();
