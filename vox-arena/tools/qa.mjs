// QA: портреты тварей, вьюмодель оружия, полный цикл геймплея
import { chromium } from 'playwright';
import sparticuz from '@sparticuz/chromium';
import fs from 'fs';
import path from 'path';

const errors = [];
const exe = await sparticuz.executablePath();
const browser = await chromium.launch({
  executablePath: exe,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--enable-unsafe-swiftshader', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });

fs.mkdirSync('shots', { recursive: true });
await page.goto('file:///home/user/vox-arena/vox-arena/release/index.html');
await page.waitForFunction('window.__VOX__ && window.__VOX__.ready', null, { timeout: 30000 });
console.log('загрузка OK, состояние:', await page.evaluate('window.__VOX__.state'));

// ---------- портреты тварей ----------
const PORT = [
  ['minion', 1.0, 1.7],
  ['rogue', 0.75, 1.7],
  ['warrior', 1.2, 2.0],
  ['mage', 1.1, 1.9],
];
for (const [type, dz, eye] of PORT) {
  await page.evaluate(({ t, eye }) => {
    const V = window.__VOX__;
    V.start();
    V.enemies.clear();
    V.player.pos.set(0, 0, 16);
    V.player.yaw = 0; V.player.pitch = 0;
    const e = V.spawn(t, 0, -5.5, 3); // 5.5 м впереди (dz>0 = назад)
    e.state = 'chase'; e.staggerT = 5; // застыть в рабочей позе
    V.player.pitch = Math.atan2(eye - 1.62, 5.5);
  }, { t: type, eye });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `shots/qa-${type}.png` });
  // проверка геометрии: все мировые позиции конечны
  const bad = await page.evaluate(() => {
    const V = window.__VOX__;
    const p = new (Object.getPrototypeOf(V.player.pos).constructor)(0, 0, 0);
    let bad = 0, n = 0;
    for (const e of V.enemies.list) {
      e.root.traverse(o => {
        if (!o.isMesh) return;
        o.getWorldPosition(p); n++;
        if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) bad++;
      });
    }
    return { bad, n };
  });
  console.log(`портрет ${type}: mesh=${bad.n} NaN=${bad.bad}`);
}

// ---------- вьюмодель оружия (первый план) ----------
await page.evaluate(() => {
  const V = window.__VOX__;
  V.enemies.clear();
  V.player.pos.set(0, 0, 16);
  V.player.yaw = 0; V.player.pitch = -0.25;
});
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/qa-weapon.png' });
console.log('оружие снято');

// ---------- бой: урон, гибсы, счётчик ----------
await page.evaluate(() => {
  const V = window.__VOX__;
  V.enemies.clear();
  for (let i = 0; i < 5; i++) V.spawn('minion', (i - 2) * 1.4, 11 + (i % 2), 3);
});
// непрерывный огонь по центру
await page.evaluate(`(() => {
  const V = window.__VOX__;
  V._aim = setInterval(() => {
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
  }, 60);
})()`);
await page.mouse.move(640, 360);
await page.mouse.down();
await page.waitForTimeout(3500);
await page.screenshot({ path: 'shots/qa-combat.png' });
await page.mouse.up();
const kills = await page.evaluate(`document.getElementById('kills-label').textContent`);
console.log('бой:', kills);

// гибсы всех
await page.evaluate('clearInterval(window.__VOX__._aim); window.__VOX__.killAll();');
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/qa-gibs.png' });

// ---------- смерть и рестарт ----------
await page.evaluate(`(() => {
  const V = window.__VOX__;
  V.player.hp = 1;
  for (let i = 0; i < 6; i++) V.spawn('minion', (Math.random() - 0.5) * 1.2, 16 - (1.0 + Math.random() * 0.8), 3);
})()`);
await page.waitForFunction(`window.__VOX__.state === 'dead'`, null, { timeout: 45000 });
console.log('смерть OK');
await page.waitForTimeout(1500);
await page.screenshot({ path: 'shots/qa-death.png' });
const deathVisible = await page.evaluate(`!document.getElementById('death').classList.contains('hidden')`);
console.log('экран смерти:', deathVisible);
await page.click('#btn-restart');
await page.waitForTimeout(900);
console.log('рестарт:', await page.evaluate('window.__VOX__.state'));

console.log(errors.length ? 'ОШИБКИ:\n' + errors.join('\n') : 'ошибок нет');
await browser.close();
process.exit(errors.length ? 1 : 0);
