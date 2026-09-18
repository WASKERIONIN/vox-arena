import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--mute-audio', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto('file:///home/user/vox-arena/release/index.html');
await page.waitForFunction('window.__VOX__ && window.__VOX__.ready', null, { timeout: 25000 });
await page.evaluate('window.__VOX__.start()');
await page.waitForTimeout(5000);

// проверка пикселя в центре (область красного квадрата) через canvas
async function redPixelScore(label) {
  const buf = await page.screenshot();
  const fs = await import('fs');
  fs.writeFileSync(`shots/bisect-${label}.png`);
}
// проще: делаем скриншоты и анализируем в питоне потом
await page.screenshot({ path: 'shots/b1-all.png' });
await page.evaluate(`document.getElementById('hud').style.display='none'`);
await page.screenshot({ path: 'shots/b2-nohud.png' });
await page.evaluate(`document.getElementById('hud').style.display=''`);
await page.evaluate(`(() => {
  const V = window.__VOX__;
  V.fx.mesh.visible = false;
  V.fx.smokes.forEach(o => o.s.visible = false);
  V.fx.flashes.forEach(o => o.s.visible = false);
  V.fx.holes.forEach(m => m.visible = false);
  V.fx.bloods.forEach(m => m.visible = false);
  V.fx.tracers.forEach(o => o.l.visible = false);
  V.player.gun.visible = false;
})()`);
await page.screenshot({ path: 'shots/b3-nofx.png' });
await page.evaluate(`(() => {
  const V = window.__VOX__;
  V.fx.mesh.visible = true;
  V.player.gun.visible = true;
  // скрываем декор-панель и всё на платформе
  V.fx.scene.traverse(o => { if (o.isMesh && Math.abs(o.position.x) < 2 && Math.abs(o.position.z) < 7 && o.position.y > 1 && o.position.y < 2) o.visible = false; });
})()`);
await page.screenshot({ path: 'shots/b4-noplat.png' });
await browser.close();
console.log('done');
