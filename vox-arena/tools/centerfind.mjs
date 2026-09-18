import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--mute-audio', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('file:///home/user/vox-arena/release/index.html');
await page.waitForFunction('window.__VOX__ && window.__VOX__.ready', null, { timeout: 25000 });
await page.evaluate('window.__VOX__.start()');
await page.waitForTimeout(5000);
const info = await page.evaluate(`(() => {
  const out = { sprites: [], html: null };
  const cam = window.__VOX__.player.camera;
  window.__VOX__.fx.scene.traverse(o => {
    if (!o.isSprite || !o.visible) return;
    const wp = o.getWorldPosition(new o.position.constructor());
    const v = wp.clone().applyMatrix4(cam.matrixWorldInverse);
    if (v.z < 0) out.sprites.push({ wp: [wp.x.toFixed(1), wp.y.toFixed(1), wp.z.toFixed(1)], dist: (-v.z).toFixed(1), scale: o.scale.x.toFixed(2), color: '#' + o.material.color.getHexString(), opacity: o.material.opacity.toFixed(2), map: o.material.map && o.material.map.image ? (o.material.map.image.width + 'x' + o.material.map.image.height) : 'none', blending: o.material.blending });
  });
  const el = document.elementFromPoint(640, 340);
  out.html = el ? el.id || el.className || el.tagName : 'none';
  return out;
})()`);
console.log(JSON.stringify(info, null, 1));
await browser.close();
