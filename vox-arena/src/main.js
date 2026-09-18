import * as THREE from 'three';
import { loadSettings, saveSettings, PARTICLE_BUDGET, clamp } from './config.js';
import { makeTextures } from './textures.js';
import { PS1 } from './ps1.js';
import { AudioSys } from './audio.js';
import { FX } from './fx.js';
import { buildArena } from './arena.js';
import { Player } from './player.js';
import { buildRifle } from './weapon-model.js';
import { EnemyManager } from './enemies.js';
import { Waves } from './waves.js';
import { HUD } from './hud.js';

// ============================== базовая сцена ==============================
const settings = loadSettings();
const canvas = document.getElementById('game-canvas');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (e) {
  document.getElementById('loading').querySelector('.subtitle').textContent = 'ОШИБКА: WebGL недоступен в этом окружении';
  throw e;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(1);

const ps1 = new PS1(renderer);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.08, 500);
camera.rotation.order = 'YXZ';
scene.add(camera);
const fogObj = new THREE.Fog(0x140609, 12, 95);
scene.fog = settings.fog ? fogObj : null;

const T = makeTextures();
const arena = buildArena(scene, T);
const sfx = new AudioSys();
const fx = new FX(scene, T);
fx.setCamera(camera);
const enemies = new EnemyManager(scene, T, fx, sfx, {
  onKill: null, hud: null, // заполняется ниже
});
const player = new Player(camera, buildRifle());

// ============================== состояние игры ==============================
let state = 'loading'; // loading | menu | playing | paused | dead
let deathT = 0;
let kills = 0, score = 0, shotsFired = 0, shotsHit = 0, headshots = 0, stylePts = 0, hitstop = 0;
let locked = false, fallbackLook = false;

const applyFns = {
  pixelScale: v => ps1.setScale(v),
  fov: v => { camera.fov = v; camera.updateProjectionMatrix(); },
  brightness: v => { ps1.brightness = v; },
  fog: v => { scene.fog = v ? fogObj : null; },
  particles: v => fx.setBudget(PARTICLE_BUDGET[v]),
  bob: v => { player.bobEnabled = v; },
  shake: v => { player.shakeEnabled = v; },
  sensitivity: () => { },
  showFps: v => hud && hud.showFps(v),
  musicVol: v => sfx.setVolumes(settings.sfxVol, v),
  sfxVol: v => sfx.setVolumes(v, settings.musicVol),
  all: () => {
    applyFns.pixelScale(settings.pixelScale); applyFns.fov(settings.fov);
    applyFns.brightness(settings.brightness); applyFns.fog(settings.fog);
    applyFns.particles(settings.particles); applyFns.bob(settings.bob);
    applyFns.shake(settings.shake); applyFns.showFps(settings.showFps);
    applyFns.musicVol(settings.musicVol); applyFns.sfxVol(settings.sfxVol);
  },
};

const hud = new HUD(settings, applyFns);
enemies.hooks.hud = hud;

// ============================== игровой процесс ==============================
function onKill(e, head, gibbed) {
  kills++;
  const pts = Math.round(e.T.score * (head ? 1.5 : 1));
  score += pts;
  stylePts += pts;
  hitstop = head ? 0.085 : 0.045;
  hud.hitmarker(true);
  if (head) { sfx.headshot(); hud.styleEvent('ХЕДШОТ! +' + pts); headshots++; }
  else hud.styleEvent(e.T.label + ' УНИЧТОЖЕН +' + pts);
  hud.setKills(kills); hud.setScore(score);
}
enemies.hooks.onKill = onKill;

player.onShoot = () => { shotsFired++; };
player.onHit = ({ head, killed }) => {
  shotsHit++;
  if (killed) return; // хитмаркер уже показан в onKill
  hud.hitmarker(false);
  if (head) { stylePts += 25; hud.styleEvent('ХЕДШОТ +25'); sfx.headshot(); headshots++; }
  else stylePts += 6;
};
player.onReload = () => { };
player.onDead = () => {
  state = 'dead';
  input.fire = false;
  deathT = 0;
  document.exitPointerLock && document.exitPointerLock();
  sfx.stopMusic();
  sfx.gib();
  // гибс не в камеру: в 1.6м перед игроком
  const gpos = player.pos.clone();
  gpos.x += -Math.sin(player.yaw) * 1.6;
  gpos.z += -Math.cos(player.yaw) * 1.6;
  fx.gib(gpos, true);
  hud.showGame(false);
  setTimeout(() => hud.fadeToBlack(), 500);
  setTimeout(() => {
    hud.death({
      wave: waves.num, kills,
      acc: shotsFired ? Math.round(100 * shotsHit / shotsFired) : 0,
      headshots, score,
    });
  }, 1150);
};

const waves = new Waves(enemies, arena, {
  waveStart: (n, total) => { hud.setWave(n); hud.banner('ВОЛНА ' + n, 'ПРОТИВНИКОВ: ' + total); sfx.waveHorn(); },
  countdown: (t, next) => hud.countdown(t, next),
  portal: (x, z) => { fx.portal(new THREE.Vector3(x, 0, z)); },
  waveClear: n => {
    hud.banner('ВОЛНА ' + n + ' ЗАЧИЩЕНА', 'ВОССТАНОВЛЕНО +15 БРОНИ · СТИЛЬ +150');
    player.heal(15); stylePts += 150; sfx.waveClear();
  },
});

function onPickup() { player.heal(30); sfx.pickup(); hud.styleEvent('+30 БРОНЕПЛАСТИНЫ'); }

// ============================== ввод ==============================
const input = { keys: new Set(), fire: false, reload: false, jump: false, lookDX: 0, lookDY: 0 };
const SENS = 0.0021;

function look(dx, dy) {
  const s = SENS * settings.sensitivity;
  player.yaw -= dx * s;
  player.pitch = clamp(player.pitch - dy * s, -1.55, 1.55);
  input.lookDX = dx; input.lookDY = dy;
}
function tryLock() {
  if (document.pointerLockElement === canvas) return;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => enableFallback()); } catch (e) { enableFallback(); }
}
function enableFallback() {
  if (fallbackLook) return;
  fallbackLook = true;
  hud.fallback('Захват мыши недоступен в этом окне — обзор мышью по экрану или стрелками ←→↑↓. Для полного захвата скачайте файл и откройте локально.');
  hud.hint('ЛКМ — огонь · R — перезарядка · SHIFT — бег · ПРОБЕЛ — прыжок · ESC — пауза');
}
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked && state === 'playing' && !fallbackLook) pauseGame();
});
document.addEventListener('pointerlockerror', () => enableFallback());

document.addEventListener('mousemove', e => {
  if (state !== 'playing') return;
  if (locked || (fallbackLook && e.buttons >= 0)) look(e.movementX || 0, e.movementY || 0);
});
canvas.addEventListener('mousedown', e => {
  if (state !== 'playing') return;
  if (!locked && !fallbackLook) tryLock();
  if (e.button === 0) input.fire = true;
});
window.addEventListener('mouseup', e => { if (e.button === 0) input.fire = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  input.keys.add(e.code);
  if (e.code === 'KeyR') input.reload = true;
  if (e.code === 'Space') input.jump = true;
  if (e.code === 'Escape' && fallbackLook) {
    if (state === 'playing') pauseGame(); else if (state === 'paused') resumeGame();
  }
});
window.addEventListener('keyup', e => input.keys.delete(e.code));
window.addEventListener('blur', () => { input.keys.clear(); input.fire = false; });

// ============================== переходы состояний ==============================
function startRun() {
  sfx.init();
  sfx.setVolumes(settings.sfxVol, settings.musicVol);
  sfx.startMusic();
  enemies.clear(); fx.clear(); arena.resetPickups();
  player.reset();
  kills = score = shotsFired = shotsHit = headshots = stylePts = hitstop = 0;
  waves.reset();
  hud.forceClearOverlays();
  hud.noScreen(); hud.showGame(true);
  hud.fadeFromBlack();
  hud.setHP(player.hp, player.maxHp);
  hud.setAmmo(player.mag, player.magSize, false);
  hud.setKills(0); hud.setScore(0); hud.setStyle(0);
  hud.setWave(0);
  hud.hint(fallbackLook
    ? 'ЛКМ — огонь · МЫШЬ/СТРЕЛКИ — обзор · R — перезарядка'
    : 'ЛКМ — огонь · R — перезарядка · SHIFT — бег · ПРОБЕЛ — прыжок · ESC — пауза');
  player.gun.visible = true;
  state = 'playing';
  tryLock();
}
function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused'; input.fire = false;
  hud.screen('pause');
}
function resumeGame() {
  if (state !== 'paused') return;
  hud.noScreen(); state = 'playing';
  if (!fallbackLook) tryLock();
}
function quitToMenu() {
  state = 'menu'; input.fire = false;
  hud.showGame(false); hud.screen('menu');
  enemies.clear(); fx.clear(); waves.state = 'idle'; hud.countdown(0, 0);
  player.gun.visible = false;
  document.exitPointerLock && document.exitPointerLock();
}
hud.onPlay = startRun;
hud.onResume = resumeGame;
hud.onQuit = quitToMenu;
hud.onRestart = startRun;
hud.onSettingsClose = () => { if (state === 'paused') hud.screen('pause'); else hud.screen('menu'); };

// ============================== запуск (модели процедурные) ==============================
function boot() {
  applyFns.all();
  player.gun.visible = false;
  state = 'menu';
  hud.screen('menu');
  window.__VOX__.ready = true;
}

// ============================== цикл ==============================
let prev = performance.now();
let fpsAcc = 0, fpsN = 0, fpsCool = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  const time = now / 1000;

  fpsAcc += 1 / Math.max(1e-4, dt); fpsN++; fpsCool -= dt;
  if (fpsCool <= 0) { hud.fps(Math.round(fpsAcc / fpsN)); fpsAcc = 0; fpsN = 0; fpsCool = 0.5; }

  if (hitstop > 0) { hitstop -= dt; dt *= 0.12; }

  if (state === 'playing') {
    if (input.keys.has('ArrowLeft')) player.yaw += 2.7 * dt;
    if (input.keys.has('ArrowRight')) player.yaw -= 2.7 * dt;
    if (input.keys.has('ArrowUp')) player.pitch = clamp(player.pitch + 1.9 * dt, -1.55, 1.55);
    if (input.keys.has('ArrowDown')) player.pitch = clamp(player.pitch - 1.9 * dt, -1.55, 1.55);
    player.update(dt, input, arena, { enemies, fx, sfx, hud });
    enemies.update(dt, player, arena);
    waves.update(dt);
    arena.updatePickups(dt, time, player.pos, onPickup);
    fx.update(dt);
    stylePts = Math.max(0, stylePts - 55 * dt);
    hud.setHP(player.hp, player.maxHp);
    hud.setAmmo(player.mag, player.magSize, player.reloading);
    hud.setStyle(stylePts);
  } else if (state === 'menu') {
    const a = time * 0.1;
    camera.position.set(Math.cos(a) * 23, 8.5 + Math.sin(a * 0.6) * 1.5, Math.sin(a) * 23);
    camera.lookAt(0, 1.6, 0);
    fx.update(dt);
  } else if (state === 'dead') {
    deathT += dt;
    // падение камеры на землю
    const fall = Math.min(1, deathT * 1.8);
    const eye = player.eyeH * (1 - fall) + 0.35 * fall;
    camera.rotation.z = fall * 0.55;
    camera.position.set(player.pos.x, player.pos.y + eye, player.pos.z);
    fx.update(dt);
    enemies.update(dt * 0.25, player, arena); // враги «доигрывают» в слоумо
  } else {
    fx.update(dt * 0.5);
  }

  ps1.render(scene, camera);
}

// ============================== resize + тест-хуки ==============================
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  ps1.setSize(w, h);
}
window.addEventListener('resize', resize);
resize();

window.__VOX__ = {
  ready: false,
  get state() { return state; },
  gfx: applyFns,
  start: () => startRun(),
  spawn: (typeName = 'minion', dx = 0, dz = -6) => {
    // спавн врага в КСЗ-системе игрока (вперёд = -Z)
    const c = Math.cos(player.yaw), s = Math.sin(player.yaw);
    const wx = player.pos.x + dx * c - dz * s;
    const wz = player.pos.z + dx * s + dz * c;
    return enemies.spawn(typeName, wx, wz, 1);
  },
  enemies, player, waves, hud, fx,
  killAll: () => enemies.killAllInstant(),
};

boot();
requestAnimationFrame(frame);
