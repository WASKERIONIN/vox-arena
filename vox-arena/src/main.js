import * as THREE from 'three';
import { loadSettings, saveSettings, PARTICLE_BUDGET, clamp } from './config.js';
import { makeTextures } from './textures.js';
import { PS1 } from './ps1.js';
import { AudioSys } from './audio.js';
import { FX } from './fx.js';
import { buildArena, MAPS } from './arena.js';
import { StarshipLevel } from './starship.js';
import { PropsManager } from './props.js';
import { Player } from './player.js';
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
const fogObj = new THREE.Fog(0x06080d, 4, 65);
scene.fog = settings.fog ? fogObj : null;

const T = makeTextures();
let currentMapId = 'starship'; // По умолчанию сюжетный звездолёт
let currentGameMode = 'campaign'; // 'campaign' | 'sandbox'
const props = new PropsManager(scene, T);
let arena = new StarshipLevel(scene, T, props);
const sfx = new AudioSys();
const fx = new FX(scene, T);
fx.setCamera(camera);

const enemies = new EnemyManager(scene, T, fx, sfx, {
  onKill: null, hud: null,
});
const player = new Player(camera);

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
player.onHit = ({ head, killed, hitZone, isCorpse }) => {
  shotsHit++;
  if (killed || isCorpse) return;
  hud.hitmarker(false);
  if (head) { stylePts += 25; hud.styleEvent('ХЕДШОТ +25'); sfx.headshot(); headshots++; }
  else stylePts += 6;
};
player.onReload = () => { };
player.onDead = () => {
  if (currentGameMode === 'sandbox') {
    player.hp = player.maxHp;
    hud.setHP(player.hp, player.maxHp);
    hud.styleEvent('ВОССТАНОВЛЕНИЕ ТЕСТОВОЙ БРОНИ');
    return;
  }
  state = 'dead';
  input.fire = false;
  deathT = 0;
  document.exitPointerLock && document.exitPointerLock();
  sfx.stopMusic();
  sfx.gib();
  // гибс перед игроком
  const gpos = player.pos.clone();
  gpos.x += -Math.sin(player.yaw) * 1.6;
  gpos.z += -Math.cos(player.yaw) * 1.6;
  fx.gib(gpos, true);
  hud.showGame(false);
  setTimeout(() => hud.fadeToBlack(), 500);
  setTimeout(() => {
    hud.death({
      wave: 1, kills,
      acc: shotsFired ? Math.round(100 * shotsHit / shotsFired) : 0,
      headshots, score,
    });
  }, 1150);
};

const waves = new Waves(enemies, arena, {
  waveStart: (n, total) => {},
  countdown: (t, next) => {},
  portal: (x, z) => { fx.portal(new THREE.Vector3(x, 0, z)); },
  waveClear: n => {},
});

function onPickup() { player.heal(35); sfx.pickup(); hud.styleEvent('+35 БРОНЕПЛАСТИНЫ'); }

function setMap(mapId) {
  currentMapId = mapId;
  if (arena) arena.clear();
  props.clear();
  if (mapId === 'starship') {
    arena = new StarshipLevel(scene, T, props);
  } else {
    arena = buildArena(scene, T, currentMapId, props);
    waves.setArena(arena);
  }
}

// ============================== СПАВНЕР И ПЕСОЧНИЦА ==============================
function spawnSandboxMonster(typeName) {
  if (state !== 'playing') return;
  const dist = 5.5;
  const yaw = player.yaw;
  const wx = player.pos.x - Math.sin(yaw) * dist;
  const wz = player.pos.z - Math.cos(yaw) * dist;
  const aiDisabled = !hud.aiEnabledInSandbox;

  const e = enemies.spawn(typeName, wx, wz, 1, aiDisabled);
  if (e) {
    fx.portal(new THREE.Vector3(wx, 0, wz));
    sfx.pickup();
    const modeStr = aiDisabled ? 'МАНЕКЕН (ИИ ВЫКЛ)' : 'БОЕВОЙ (ИИ ВКЛ)';
    hud.styleEvent(`СПАВН: ${e.T.label} [${modeStr}]`);
  }
}

function toggleSandboxAI() {
  if (state !== 'playing') return;
  const next = !hud.aiEnabledInSandbox;
  hud.setSandboxAIToggle(next);
  enemies.setAllAI(next);
  sfx.pickup();
  hud.styleEvent(next ? 'ИИ ВСЕХ ВРАГОВ: ВКЛ (БОЙ)' : 'ИИ ВСЕХ ВРАГОВ: ВЫКЛ (МАНЕКЕН)');
}

function clearSandbox() {
  if (state !== 'playing') return;
  enemies.clear();
  fx.clear();
  props.clear();
  if (arena) arena.clear();
  arena = (currentMapId === 'starship') ? new StarshipLevel(scene, T, props) : buildArena(scene, T, currentMapId, props);
  if (currentMapId !== 'starship') waves.setArena(arena);
  sfx.pickup();
  hud.styleEvent('АРЕНА И ОБЪЕКТЫ ПОЛНОСТЬЮ СБРОШЕНЫ');
}

// ============================== ввод ==============================
const input = { keys: new Set(), fire: false, fireOnce: false, kick: false, reload: false, jump: false, lookDX: 0, lookDY: 0 };
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
  hud.hint('ЛКМ — огонь · E — взаимодействие/терминалы · 1/2 — оружие · F/ПКМ — пинок · T — фонарь');
}
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked && state === 'playing' && !fallbackLook && !hud.isTerminalOpen()) pauseGame();
});
document.addEventListener('pointerlockerror', () => enableFallback());

document.addEventListener('mousemove', e => {
  if (state !== 'playing' || hud.isTerminalOpen()) return;
  if (locked || (fallbackLook && e.buttons >= 0)) look(e.movementX || 0, e.movementY || 0);
});

canvas.addEventListener('mousedown', e => {
  if (state !== 'playing') return;
  if (hud.isTerminalOpen()) {
    hud.hideTerminal();
    return;
  }
  if (!locked && !fallbackLook) tryLock();
  if (e.button === 0) {
    input.fire = true;
    input.fireOnce = true;
  } else if (e.button === 2) {
    input.kick = true;
  }
});

window.addEventListener('mouseup', e => {
  if (e.button === 0) input.fire = false;
  if (e.button === 2) input.kick = false;
});

window.addEventListener('wheel', e => {
  if (state !== 'playing' || hud.isTerminalOpen()) return;
  if (e.deltaY > 0) {
    player.switchWeapon(1, sfx, hud);
  } else if (e.deltaY < 0) {
    player.switchWeapon(0, sfx, hud);
  }
}, { passive: true });

canvas.addEventListener('contextmenu', e => e.preventDefault());

window.addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;

  if (hud.isTerminalOpen()) {
    if (e.code === 'KeyE' || e.code === 'Escape' || e.code === 'Space') {
      hud.hideTerminal();
    }
    return;
  }

  input.keys.add(e.code);
  if (e.code === 'KeyR') input.reload = true;
  if (e.code === 'Space') input.jump = true;
  if (e.code === 'KeyF' || e.code === 'KeyV') input.kick = true;
  if (e.code === 'Escape' && fallbackLook) {
    if (state === 'playing') pauseGame(); else if (state === 'paused') resumeGame();
  }

  // Горячие клавиши спавнера и песочницы
  if (state === 'playing' && currentGameMode === 'sandbox') {
    if (e.code === 'Digit4' || e.code === 'Numpad4') spawnSandboxMonster('zombie');
    if (e.code === 'Digit5' || e.code === 'Numpad5') spawnSandboxMonster('minion');
    if (e.code === 'Digit6' || e.code === 'Numpad6') spawnSandboxMonster('rogue');
    if (e.code === 'Digit7' || e.code === 'Numpad7') spawnSandboxMonster('warrior');
    if (e.code === 'Digit8' || e.code === 'Numpad8') spawnSandboxMonster('mage');
    if (e.code === 'Digit9' || e.code === 'Numpad9') toggleSandboxAI();
    if (e.code === 'Digit0' || e.code === 'Numpad0') clearSandbox();
  }
});
window.addEventListener('keyup', e => {
  input.keys.delete(e.code);
  if (e.code === 'KeyF' || e.code === 'KeyV') input.kick = false;
});
window.addEventListener('blur', () => { input.keys.clear(); input.fire = false; input.kick = false; });

// ============================== переходы состояний ==============================
function startRun(selectedMap = 'starship', mode = 'campaign') {
  currentGameMode = mode;
  if (mode === 'campaign') selectedMap = 'starship';
  setMap(selectedMap);

  sfx.init();
  sfx.setVolumes(settings.sfxVol, settings.musicVol);
  sfx.startMusic();
  enemies.clear(); fx.clear();

  kills = score = shotsFired = shotsHit = headshots = stylePts = hitstop = 0;
  hud.forceClearOverlays();
  hud.noScreen(); hud.showGame(true, mode);
  hud.fadeFromBlack();

  if (mode === 'campaign') {
    // Начальная позиция: внутри стазис-капсулы 04
    player.reset(0, 0.4, 0, 0);
    arena.populateEnemies(enemies);
    hud.setObjective(arena.currentObjective);
    hud.setHP(player.hp, player.maxHp);
    hud.setAmmo(player.mag, player.magSize, false, false);
    hud.setWeaponSlot(0);
    hud.setFlashlight(true);

    sfx.heartbeat();
    hud.banner('СТАНЦИЯ «ЭРЕБ-7»', 'АВАРИЙНЫЙ СБРОС СТАЗИС-КАПСУЛЫ [E / ПРОБЕЛ]');
    hud.hint('E / ПРОБЕЛ — открыть капсулу · E — взаимодействие · ЛКМ — огонь · F/ПКМ — пинок · T — фонарь');
  } else {
    // РЕЖИМ ПЕСОЧНИЦЫ / БЕСТИАРИЙ
    const spawn = arena.mapDef ? arena.mapDef.playerSpawn : { x: 0, y: 0, z: 16, yaw: 0 };
    player.reset(spawn.x, spawn.y, spawn.z, spawn.yaw);
    waves.state = 'idle';
    hud.countdown(0, 0);
    hud.setSandboxAIToggle(hud.aiEnabledInSandbox);
    enemies.spawn('zombie', 0, 0, 1, !hud.aiEnabledInSandbox);
    hud.banner('ПЕСОЧНИЦА АКТИВИРОВАНА', 'КЛАВИШИ 4-8: СПАВН · 9: ИИ ВКЛ/ВЫКЛ · 0: ОЧИСТИТЬ');
    hud.hint('Клавиши 4-8 — спавн тварей · 9 — вкл/выкл ИИ · 0 — очистить · 1/2 — оружие · F — пинок');
  }

  player.rifleAssets.group.visible = true;
  state = 'playing';
  tryLock();
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused'; input.fire = false; input.kick = false;
  hud.screen('pause');
}
function resumeGame() {
  if (state !== 'paused') return;
  hud.noScreen(); state = 'playing';
  if (!fallbackLook) tryLock();
}
function quitToMenu() {
  state = 'menu'; input.fire = false; input.kick = false;
  hud.showGame(false); hud.screen('menu');
  enemies.clear(); fx.clear(); waves.state = 'idle'; hud.countdown(0, 0);
  player.rifleAssets.group.visible = false;
  player.shotgunAssets.group.visible = false;
  player.kickLeg.visible = false;
  document.exitPointerLock && document.exitPointerLock();
}

hud.onPlay = (map, mode) => startRun(map, mode);
hud.onResume = resumeGame;
hud.onQuit = quitToMenu;
hud.onRestart = (map, mode) => startRun(map, mode);
hud.onMapSelect = mapId => setMap(mapId);
hud.onSpawn = typeName => spawnSandboxMonster(typeName);
hud.onToggleAI = () => toggleSandboxAI();
hud.onClearEnemies = () => clearSandbox();
hud.onSettingsClose = () => { if (state === 'paused') hud.screen('pause'); else hud.screen('menu'); };

// ============================== запуск ==============================
function boot() {
  applyFns.all();
  player.rifleAssets.group.visible = false;
  player.shotgunAssets.group.visible = false;
  player.kickLeg.visible = false;
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
    if (arena.checkInteraction) {
      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      const target = arena.checkInteraction(player.pos, fwd, 2.8);
      if (target) {
        const promptText = typeof target.prompt === 'function' ? target.prompt() : target.prompt;
        hud.setInteractionPrompt(promptText);
        if (input.keys.has('KeyE') || (target.type === 'cryo_pod' && input.jump)) {
          input.keys.delete('KeyE');
          if (target.type === 'cryo_pod') input.jump = false;
          target.onUse(player, arena, sfx, hud, fx);
        }
      } else {
        hud.setInteractionPrompt(null);
      }
    }

    if (input.keys.has('ArrowLeft')) player.yaw += 2.7 * dt;
    if (input.keys.has('ArrowRight')) player.yaw -= 2.7 * dt;
    if (input.keys.has('ArrowUp')) player.pitch = clamp(player.pitch + 1.9 * dt, -1.55, 1.55);
    if (input.keys.has('ArrowDown')) player.pitch = clamp(player.pitch - 1.9 * dt, -1.55, 1.55);
    player.update(dt, input, arena, { enemies, fx, sfx, hud, props });
    enemies.update(dt, player, arena);
    props.update(dt, arena, enemies, player, fx, sfx);
    if (arena.update) arena.update(dt, time, player.pos);
    if (arena.updatePickups) arena.updatePickups(dt, time, player.pos, onPickup);
    fx.update(dt, arena);
    stylePts = Math.max(0, stylePts - 55 * dt);
    hud.setHP(player.hp, player.maxHp);
    hud.setAmmo(player.mag, player.magSize, player.reloading, player.curSlot === 1);
    hud.setStyle(stylePts);
  } else if (state === 'menu') {
    const a = time * 0.12;
    if (currentMapId === 'starship') {
      camera.position.set(Math.cos(a) * 6, 2.2 + Math.sin(a * 0.5) * 0.4, Math.sin(a) * 6);
      camera.lookAt(0, 1.2, 0);
    } else if (currentMapId === 'catacombs') {
      camera.position.set(Math.cos(a) * 14, 6.0 + Math.sin(a * 0.5) * 1.0, Math.sin(a) * 14);
      camera.lookAt(0, 1.4, 0);
    } else {
      camera.position.set(Math.cos(a) * 23, 8.5 + Math.sin(a * 0.6) * 1.5, Math.sin(a) * 23);
      camera.lookAt(0, 1.6, 0);
    }
    fx.update(dt, arena);
  } else if (state === 'dead') {
    deathT += dt;
    const fall = Math.min(1, deathT * 1.8);
    const eye = player.eyeH * (1 - fall) + 0.35 * fall;
    camera.rotation.z = fall * 0.55;
    camera.position.set(player.pos.x, player.pos.y + eye, player.pos.z);
    fx.update(dt, arena);
    enemies.update(dt * 0.25, player, arena);
  } else {
    fx.update(dt * 0.5, arena);
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

window.__VOX__.ready = true;
boot();
requestAnimationFrame(frame);
