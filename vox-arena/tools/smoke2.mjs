// Полный геймплей-тест: волна 1 -> волна 2 -> смерть -> рестарт
import { chromium } from 'playwright';
import fs from 'fs';

const errors = [];
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--mute-audio', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => errors.push(String(e).slice(0, 400)));

await page.goto('file:///home/user/vox-arena/release/index.html');
await page.waitForFunction('window.__VOX__ && window.__VOX__.ready', null, { timeout: 25000 });
fs.mkdirSync('shots', { recursive: true });

await page.evaluate('window.__VOX__.start(); window.__VOX__.gfx.pixelScale(0.15);');
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

await page.waitForFunction(`window.__VOX__.waves.num === 1`, null, { timeout: 15000 });
await page.waitForTimeout(2000);
await page.mouse.move(640, 360);
await page.mouse.down(); // непрерывный огонь до волны 2
await page.waitForTimeout(4000);
await page.screenshot({ path: 'shots/11-combat.png' });
await page.waitForFunction(`window.__VOX__.waves.num >= 2`, null, { timeout: 90000 });
console.log('ВОЛНА 2 началась ✓, убито:', await page.evaluate(`document.getElementById('kills-label').textContent`));
await page.waitForTimeout(4000);
await page.screenshot({ path: 'shots/13-wave2.png' });

// гибсы
await page.evaluate('window.__VOX__.killAll()');
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/14-gibs.png' });

// смерть: обнуляем HP и подпускаем толпу (перестаём стрелять и целиться)
await page.mouse.up();
await page.evaluate('clearInterval(window.__VOX__._aimTimer)');
await page.evaluate(`(() => {
  const V = window.__VOX__;
  V.player.hp = 1;
  for (let i = 0; i < 5; i++) V.spawn('minion', (Math.random() - 0.5) * 1.2, -(1.1 + Math.random() * 0.8));
})()`);
await page.waitForFunction(`window.__VOX__.state === 'dead'`, null, { timeout: 60000 });
console.log('смерть ✓');
await page.waitForTimeout(1400);
await page.screenshot({ path: 'shots/15-death.png' });
const deathVisible = await page.evaluate(`!document.getElementById('death').classList.contains('hidden')`);
console.log('экран смерти показан ✓:', deathVisible);

// рестарт
await page.click('#btn-restart');
await page.waitForTimeout(800);
const st = await page.evaluate('window.__VOX__.state');
console.log('рестарт ✓:', st);
await page.screenshot({ path: 'shots/16-restart.png' });

console.log('errors:', errors.length ? errors : 'нет');
await browser.close();
