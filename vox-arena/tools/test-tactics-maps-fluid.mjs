import * as THREE from 'three';
import { TYPES, EnemyManager } from '../src/enemies.js';
import { Player } from '../src/player.js';
import { FX } from '../src/fx.js';
import { AudioSys } from '../src/audio.js';
import { buildArena, MAPS } from '../src/arena.js';

console.log('=== ТЕСТИРОВАНИЕ ТАКТИЧЕСКОГО ИИ, КАРТЫ КАТАКОМБ И 3D ФЛЮИДОВ ===\n');

function mockTex() {
  const d = new Uint8Array([255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 1, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
}
const T = {
  flesh: mockTex(), membrane: mockTex(), glow: mockTex(), shadow: mockTex(),
  smoke: mockTex(), flash: mockTex(), hole: mockTex(), splat: mockTex(),
  sky: mockTex(), floor: mockTex(), wall: mockTex(), hazard: mockTex(),
  platform: mockTex(), crate: mockTex(),
};

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(85, 16 / 9, 0.1, 100);
const sfx = new AudioSys();
const fx = new FX(scene, T);

const mockHud = {
  styleEvent: (s) => console.log('  [HUD STYLE]', s),
  hitmarker: (k) => {},
  damageFlash: () => {},
  setAmmo: () => {},
  setWeaponSlot: () => {},
  setFlashlight: () => {},
};

const enemies = new EnemyManager(scene, T, fx, sfx, {
  onKill: (e, h, g) => {},
  hud: mockHud,
});

const player = new Player(camera);

// --------------------------------------------------------------------------
// 1. Тест карты «КАТАКОМБЫ»
// --------------------------------------------------------------------------
console.log('--- ТЕСТ 1: Генерация геометрии карты Катакомб ---');
const catacombs = buildArena(scene, T, 'catacombs');
console.log('Коллайдеров в Катакомбах:', catacombs.colliders.length);
console.log('Точек спавна в Катакомбах:', catacombs.spawnPoints.length);
if (catacombs.colliders.length < 15) throw new Error('Not enough colliders in Catacombs map');
if (catacombs.spawnPoints.length < 4) throw new Error('Catacombs map must have at least 4 spawn portals');
console.log('✓ Карта Катакомб успешно построена с коридорами, комнатами и порталами');

// --------------------------------------------------------------------------
// 2. Тест тактического движения и обхода стен в узком коридоре
// --------------------------------------------------------------------------
console.log('\n--- ТЕСТ 2: Навигация монстров по коридорам и обход углов ---');
// Спавним монстра в северном коридоре (X=0, Z=14), где стены на X=-2.8 и X=2.8
player.pos.set(0, 0, 0); // Игрок в центральном хабе
const minionCorridor = enemies.spawn('minion', 0, 14, 1);
console.log('Скороход заспавнен в коридоре (0, 14). Цель: игрок в (0, 0)');

for (let s = 0; s < 40; s++) {
  enemies.update(0.05, player, catacombs);
}
console.log('Позиция скорохода после движения:', minionCorridor.pos.x.toFixed(2), minionCorridor.pos.y.toFixed(2), minionCorridor.pos.z.toFixed(2));
if (minionCorridor.pos.z >= 14) throw new Error('Minion should advance along corridor toward player');
if (Math.abs(minionCorridor.pos.x) > 2.5) throw new Error('Minion clipped through corridor wall!');
if (minionCorridor.pos.y < 0) throw new Error('Minion fell through floor!');
console.log('✓ Монстр корректно продвигается по коридору без застреваний и проваливаний');

// --------------------------------------------------------------------------
// 3. Тест тактического уклонения скорохода (Evasive Dodge)
// --------------------------------------------------------------------------
console.log('\n--- ТЕСТ 3: Тактическое уклонение (зигзаг) при наведении прицела ---');
player.pos.set(0, 0, 0);
player.yaw = 0;
player.pitch = 0;
// Обновляем камеру игрока
player.camera.position.set(0, 1.62, 0);
player.camera.rotation.set(0, 0, 0);

const evader = enemies.spawn('minion', 0, -8, 1);
evader.state = 'chase'; // переводим сразу в активное преследование

// Обновляем состояние, монстр должен обнаружить прицел и начать уклонение
enemies.update(0.05, player, catacombs);
console.log('Таймер уклонения скорохода:', evader.dodgeTimer.toFixed(2), '| Направление:', evader.dodgeDir);
if (evader.dodgeTimer <= 0) throw new Error('Minion should activate evasive dodge when aimed at');

const initX = evader.pos.x;
for (let s = 0; s < 10; s++) {
  enemies.update(0.04, player, catacombs);
}
console.log('Смещение скорохода по X при уклонении:', (evader.pos.x - initX).toFixed(3));
if (Math.abs(evader.pos.x - initX) < 0.1) throw new Error('Minion should dodge sideways');
console.log('✓ Скороход успешно совершил тактический зигзаг для уклонения от огня');

// --------------------------------------------------------------------------
// 4. Тест анти-скучивания (Anti-Clumping Repulsion)
// --------------------------------------------------------------------------
console.log('\n--- ТЕСТ 4: Предотвращение скучивания (Anti-Clustering) ---');
enemies.clear();
const m1 = enemies.spawn('warrior', 0.1, 8, 1);
const m2 = enemies.spawn('warrior', -0.1, 8, 1);
m1.state = 'chase';
m2.state = 'chase';
const initialDist = Math.hypot(m1.pos.x - m2.pos.x, m1.pos.z - m2.pos.z);
console.log('Начальная дистанция между двумя монстрами в одной точке:', initialDist.toFixed(3));

for (let s = 0; s < 10; s++) {
  enemies.update(0.05, player, catacombs);
}
const finalDist = Math.hypot(m1.pos.x - m2.pos.x, m1.pos.z - m2.pos.z);
console.log('Дистанция после взаимного расталкивания:', finalDist.toFixed(3));
if (finalDist <= initialDist) throw new Error('Monsters should push each other apart');
console.log('✓ Монстры распределяют личное пространство и не сбиваются в сплошную кучу');

// --------------------------------------------------------------------------
// 5. Тест 3D флюидной динамики крови и расширяющихся луж
// --------------------------------------------------------------------------
console.log('\n--- ТЕСТ 5: 3D флюидная физика и динамические лужи на полу ---');
fx.clear();
console.log('Количество активных луж изначально:', fx.bloodPuddles.filter(p => p.mesh.visible).length);

// Вызываем физический флюидный фонтан
fx.fluidSpurt(new THREE.Vector3(0, 2.0, 0), new THREE.Vector3(0, 1, 0), 30, 4.0, 1.0, true);
console.log('Воксельных частиц флюида создано:', fx.count);
if (fx.count === 0) throw new Error('Fluid voxels should be spawned');

// Симулируем падение флюида на пол
for (let s = 0; s < 25; s++) {
  fx.update(0.04, catacombs);
}

const activePuddles = fx.bloodPuddles.filter(p => p.mesh.visible);
console.log('Активных луж сформировано на полу:', activePuddles.length);
if (activePuddles.length === 0) throw new Error('Floor blood puddles should be formed by fluid impacts');
const puddle = activePuddles[0];
console.log('Радиус сформированной лужи:', puddle.radius.toFixed(3), 'м, цель:', puddle.targetRadius.toFixed(3), 'м');

console.log('\n================================================================');
console.log('ВСЕ ТЕСТЫ ТАКТИЧЕСКОГО ИИ, КАРТЫ И 3D ЖИДКОСТЕЙ УСПЕШНО ПРОЙДЕНЫ! ✓');
console.log('================================================================');
