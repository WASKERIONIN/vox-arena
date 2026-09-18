// Безголовый прогон игровой логики: DOM/WebGL/Audio зашиты заглушками,
// цикл рендера и весь геймплей (волны, ИИ, урон, отстрел частей) — настоящие.
import esbuild from 'esbuild';
import fs from 'fs';
import vm from 'vm';
import path from 'path';

const root = path.resolve(new URL('..', import.meta.url).pathname);

// ---------- 1. неджминифицированный бандл (чтобы патчить по имени) ----------
await esbuild.build({
  entryPoints: [path.join(root, 'src', 'main.js')],
  bundle: true, format: 'iife', target: ['es2020'],
  outfile: path.join(root, 'dist', 'test-bundle.js'),
  logLevel: 'error',
});
let code = fs.readFileSync(path.join(root, 'dist', 'test-bundle.js'), 'utf8');
code = code.replace('renderer = new WebGLRenderer(', 'renderer = new globalThis.__FAKE_RENDERER(');
code = code.replace('window.__VOX__ = {', 'window.__VOX__ = { arena, sfx,');
if (!code.includes('__FAKE_RENDERER')) throw new Error('WebGLRenderer patch not applied');

// ---------- 2. заглушки ----------
function deepProxy(name) {
  const store = {};
  const t = new Proxy(function () { }, {
    get(tg, prop) {
      if (prop === Symbol.toPrimitive) return () => 0;
      if (prop === 'then') return undefined;
      if (prop in store) return store[prop];
      return deepProxy(name + '.' + String(prop));
    },
    set(tg, prop, v) { store[prop] = v; return true; },
    apply() { return deepProxy(name + '()'); },
  });
  return t;
}

const els = {};
function makeEl(id) {
  return {
    id, style: {}, dataset: {},
    classList: { toggle() { }, add() { }, remove() { }, contains() { return false; } },
    _children: [],
    appendChild(c) { this._children.push(c); return c; },
    append(...c) { this._children.push(...c); },
    querySelector() { return makeEl('q'); },
    querySelectorAll() { return []; },
    addEventListener() { }, removeEventListener() { },
    setAttribute() { }, focus() { }, blur() { }, click() { },
    getContext(kind) { return kind === '2d' ? ctx2d : null; },
    requestPointerLock() { },
    innerHTML: '', textContent: '', value: '0',
    width: 1280, height: 720, clientWidth: 1280, clientHeight: 720,
  };
}
const ctx2d = deepProxy('ctx2d');

class P { constructor() { this.value = 0; } setValueAtTime() { } linearRampToValueAtTime() { } exponentialRampToValueAtTime() { } cancelScheduledValues() { } }
class N {
  constructor() { this.gain = new P(); this.frequency = new P(); this.Q = new P(); this.detune = new P(); this.playbackRate = new P(); this.threshold = new P(); this.ratio = new P(); this.buffer = null; this.loop = false; this.type = 'sine'; }
  connect() { return this; } disconnect() { } start() { } stop() { }
}
class FakeAudio {
  constructor() { this.currentTime = 0; this.sampleRate = 44100; this.state = 'running'; this.destination = new N(); }
  resume() { }
  createGain() { return new N(); }
  createOscillator() { return new N(); }
  createBiquadFilter() { return new N(); }
  createDynamicsCompressor() { return new N(); }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(Math.min(len, 8192)) }; }
  createBufferSource() { return new N(); }
}
class FakeRenderer {
  constructor() { this.outputColorSpace = 0; this.domElement = els['game-canvas']; }
  setPixelRatio() { } setSize() { } setRenderTarget() { } render() { }
}

const rafQ = [];
const documentStub = {
  getElementById(id) { return els[id] || (els[id] = makeEl(id)); },
  createElement(t) { return makeEl(t); },
  querySelectorAll() { return []; },
  addEventListener() { }, removeEventListener() { },
  pointerLockElement: null, exitPointerLock() { },
  fullscreenElement: null,
  documentElement: makeEl('html'),
};
const sandbox = {
  console, Math, Date, JSON,
  performance,
  setTimeout: (fn, ms) => 0, clearTimeout() { },
  setInterval: () => 0, clearInterval() { },
  localStorage: { getItem: () => null, setItem() { }, removeItem() { } },
  document: documentStub,
  AudioContext: FakeAudio, webkitAudioContext: FakeAudio,
  __FAKE_RENDERER: FakeRenderer,
  requestAnimationFrame(cb) { rafQ.push(cb); return rafQ.length; },
  cancelAnimationFrame() { },
  innerWidth: 1280, innerHeight: 720,
  addEventListener() { }, removeEventListener() { },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
const ctxvm = vm.createContext(sandbox);

// ---------- 3. запуск ----------
vm.runInContext(code, ctxvm, { filename: 'bundle.js' });
const V = sandbox.__VOX__;
let t = 0;
function pump(n, dtMs = 16.7) {
  for (let i = 0; i < n; i++) {
    t += dtMs;
    const q = rafQ.splice(0);
    for (const cb of q) cb(t); // ошибки пробрасываются наружу
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT: ' + msg); };

if (!V || V.ready !== true) throw new Error('boot failed');
console.log('boot OK, state =', V.state);
pump(30);
V.start();
console.log('start OK, state =', V.state);
assert(V.state === 'playing', 'state playing after start');
V.player.hp = 99999; // на время теста игрок неуязвим

// ~25 секунд: интермиссия + волна 1 + подход врагов
pump(1500);
console.log('after 25s: state =', V.state, 'enemies =', V.enemies.list.length, 'alive =', V.enemies.aliveCount);
assert(V.enemies.list.length >= 1, 'enemies spawned');

const V3 = V.enemies.list[0].pos.constructor;
const alive = () => V.enemies.list.filter(e => ['spawn', 'chase', 'attack'].includes(e.state));
function only(e) {
  for (let i = V.enemies.list.length - 1; i >= 0; i--) if (V.enemies.list[i] !== e) V.enemies._remove(i);
}
function sync(e) { e.group.updateWorldMatrix(true, true, true); } // в headless нет рендера
function aimAt(worldPoint) {
  const o = V.player.camera.getWorldPosition(new V3());
  const dx = worldPoint.x - o.x, dy = worldPoint.y - o.y, dz = worldPoint.z - o.z;
  const L = Math.hypot(dx, dy, dz);
  V.player.pitch = Math.asin(dy / L);
  V.player.yaw = Math.atan2(-dx, -dz);
}
function dirToCam(e, p, k) { // чуть сдвинуть точку в сторону камеры (стреляем во «внутреннюю» грань)
  const cam = V.player.camera.getWorldPosition(new V3());
  const d = cam.sub(p).normalize();
  return p.addScaledVector(d, k);
}

// ---------- 4a. полный выстрел по торсу ----------
const e1 = alive().find(e => e.typeName !== 'mage' && e.j.lShoulder);
assert(e1, 'no suitable enemy for arm test');
only(e1);
e1.group.position.set(0, 0, 10);
e1.staggerT = 3;
pump(2);
sync(e1);
const chestP = dirToCam(e1, e1.j.chest.getWorldPosition(new V3()).add(new V3(0, 0.0, 0.15)), 0.05);
aimAt(chestP);
pump(2);
sync(e1);
const hpBefore = e1.hp;
V.player._fire(V.arena, V.enemies, V.fx, V.sfx, V.hud);
console.log('torso shot: hp', hpBefore.toFixed(0), '->', e1.hp.toFixed(0));
assert(e1.hp < hpBefore, 'full-stack shot should deal damage');
e1.hp = 200; e1.maxHp = 200; // чтобы тесты частей не убили тварь досрочно

// ---------- 4b. части тела: raycast -> part -> отстрел руки ----------
e1.staggerT = 3;
pump(2);
sync(e1);
const elbowP = e1.j.lElbow.getWorldPosition(new V3());
const handP = e1.j.lHand.getWorldPosition(new V3());
const forearmP = elbowP.add(handP).multiplyScalar(0.5);
const aimArm = dirToCam(e1, forearmP.clone(), 0.03);
const o = V.player.camera.getWorldPosition(new V3());
const d = aimArm.sub(o).normalize();
const h1 = V.enemies.raycast(o, d, 60);
console.log('arm raycast -> part =', h1 && h1.part, 'dist =', h1 && h1.dist.toFixed(2));
assert(h1 && h1.enemy === e1, 'raycast should hit e1');
assert(h1.part === 'armL', 'part should be armL, got ' + (h1 && h1.part));
e1.damage(14, h1.point, d, h1.head, h1.part);
e1.damage(14, h1.point, d, h1.head, h1.part);
console.log('armL: hp', e1.limbs.armL.hp.toFixed(2), 'severed =', !e1.limbs.armL.on, 'visible =', e1.j.lShoulder.visible, 'gibs =', V.enemies.gibs.length);
assert(!e1.limbs.armL.on, 'armL should be severed after 2 hits');
assert(!e1.j.lShoulder.visible, 'original arm should be hidden');
assert(V.enemies.gibs.length === 1, 'one gib expected');

// гибс падает на землю
pump(120);
const g0 = V.enemies.gibs[0];
console.log('gib after 2s: y =', g0 && g0.position.y.toFixed(2), 'rot =', g0 && g0.rotation.x.toFixed(2), 'ttl =', g0 && g0.userData.gib.ttl.toFixed(1));
assert(g0 && g0.position.y <= 0.1, 'gib should rest on ground');
// гибс доживает и удаляется (ttl 6.5с)
pump(420);
console.log('after gib ttl: gibs =', V.enemies.gibs.length);
assert(V.enemies.gibs.length === 0, 'gib should expire');

// ---------- 5. отстрел головы ----------
let e2 = alive().find(e => e !== e1 && e.typeName !== 'mage' && e.j.head);
if (!e2) {
  e2 = V.spawn('minion', 0, -6);
  pump(80);
}
assert(e2 && e2.j.head, 'no suitable enemy for head test');
only(e2);
e2.group.position.set(0, 0, 10);
e2.staggerT = 3;
pump(2);
sync(e2);
const headP = dirToCam(e2, e2.j.head.getWorldPosition(new V3()).add(new V3(0, 0, 0.06)), 0.05);
const o2 = V.player.camera.getWorldPosition(new V3());
const d2 = headP.sub(o2).normalize();
const h2 = V.enemies.raycast(o2, d2, 60);
console.log('head raycast -> part =', h2 && h2.part, 'head =', h2 && h2.head, 'dist =', h2 && h2.dist.toFixed(2));
assert(h2 && h2.enemy === e2, 'raycast should hit e2');
assert(h2.part === 'head', 'part should be head, got ' + (h2 && h2.part));
assert(h2.head === true, 'headshot flag');
e2.damage(14, h2.point, d2, h2.head, h2.part);
console.log('after head hit: state =', e2.state, 'headSevered =', e2.headSevered, 'head visible =', e2.j.head.visible, 'gibs =', V.enemies.gibs.length);
assert(e2.headSevered, 'head should be severed');
assert(!e2.j.head.visible, 'original head should be hidden');
assert(e2.state === 'dying', 'body should be dying');
assert(V.enemies.gibs.length === 1, 'head gib expected');

// ---------- 6. гибсы и геймплей живут дальше ----------
pump(500);
console.log('after ~10s more: state =', V.state, 'enemies =', V.enemies.list.length, 'gibs =', V.enemies.gibs.length, 'wave =', V.waves.num, V.waves.state);
pump(300);
console.log('final: state =', V.state, 'enemies =', V.enemies.list.length, 'gibs =', V.enemies.gibs.length);
console.log('HEADLESS TEST: OK');
