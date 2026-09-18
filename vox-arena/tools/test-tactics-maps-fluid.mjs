import * as THREE from 'three';
import { TYPES, EnemyManager } from '../src/enemies.js';
import { Player } from '../src/player.js';
import { FX } from '../src/fx.js';
import { AudioSys } from '../src/audio.js';
import { buildArena, MAPS } from '../src/arena.js';

console.log('=== ТЕСТИРОВАНИЕ СИСТЕМ: LOS, ЗРЕНИЕ БЕЗ МАГНИТА, ФИЗИЧЕСКИЙ ПОВОРОТ, СВЕТОТЕНЬ КРОВИ ===\n');

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
  styleEvent: (s) => {},
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
const catacombs = buildArena(scene, T, 'catacombs');

// --------------------------------------------------------------------------
// 1. Тест: Материалы крови реагируют на свет (MeshLambertMaterial, а не unlit Basic)
// --------------------------------------------------------------------------
console.log('--- ТЕСТ 1: Материалы крови и луж реагируют на освещение сцены ---');
const puddle = fx.bloodPuddles[0];
console.log('Тип материала лужи на полу:', puddle.mesh.material.type);
if (puddle.mesh.material.type !== 'MeshLambertMaterial') {
  throw new Error('Blood puddle material must be MeshLambertMaterial to respond to light/shadow');
}
const hole = fx.holes[0];
console.log('Тип материала декалей:', hole.material.type);
if (hole.material.type !== 'MeshLambertMaterial') {
  throw new Error('Hole/blood decal material must be MeshLambertMaterial');
}
console.log('✓ Лужи и декали крови используют MeshLambertMaterial и реагируют на свет/тень/фонарь');

// --------------------------------------------------------------------------
// 2. Тест: Поворот корпуса строго по ходу движения (НИКАКИХ СТРЕЙФОВ БОКОМ)
// --------------------------------------------------------------------------
console.log('\n--- ТЕСТ 2: Ориентация монстра точно по направлению ходьбы (No strafing) ---');
enemies.clear();
// Ставим монстра в открытом коридоре (0, 4) с целью на север (0, 14)
const walker = enemies.spawn('minion', 0, 4, 1);
walker.state = 'patrol';
walker.patrolTarget.set(0, 0, 14); // движение на север (+Z), ожидаемый угол atan2(0, 1) = 0
walker.patrolWaitT = 0;

for (let s = 0; s < 25; s++) {
  enemies.update(0.05, player, catacombs);
}

// Угол движения на север (+Z): Math.atan2(0, 1) = 0 рад
console.log('Вращение монстра по Y при ходьбе на север (+Z):', walker.group.rotation.y.toFixed(3), 'рад (ожидается ~0.00)');
const angleDiff = Math.abs(walker.group.rotation.y);
if (angleDiff > 0.35) throw new Error('Monster body must face the direction of movement!');
console.log('✓ Монстр поворачивается лицом по вектору своего пути без боковых стрейфов');

// --------------------------------------------------------------------------
// 3. Тест: Отсутствие магнита / Линия видимости (LOS)
// --------------------------------------------------------------------------
console.log('\n--- ТЕСТ 3: Отсутствие магнита сквозь стены (Line of Sight & Awareness) ---');
enemies.clear();
// Игрок в центральном зале (0, 0)
player.pos.set(0, 0, 0);
player.flashlightOn = false;

// Монстр за стеной в северной биолаборатории (0, 26). Стены лаборатории блокируют прямую видимость!
const hiddenMonster = enemies.spawn('warrior', 0, 26, 1);
hiddenMonster.state = 'patrol';

for (let s = 0; s < 10; s++) {
  enemies.update(0.05, player, catacombs);
}

console.log('Состояние монстра за сплошной стеной:', hiddenMonster.state, '| hasLOS:', hiddenMonster.hasLOS);
if (hiddenMonster.state === 'chase' || hiddenMonster.hasLOS) {
  throw new Error('Monster behind walls must NOT magically detect player without LOS!');
}
console.log('✓ Монстр за стеной не бросается на игрока и остаётся в патруле/блуждании');

// --------------------------------------------------------------------------
// 4. Тест: Обнаружение при появлении прямой видимости (LOS)
// --------------------------------------------------------------------------
console.log('\n--- ТЕСТ 4: Обнаружение при входе в прямую видимость (LOS) ---');
// Ставим игрока в открытом коридоре (0, 4), а монстра в (0, 12)
player.pos.set(0, 0, 4);
const visibleMonster = enemies.spawn('minion', 0, 12, 1);
visibleMonster.state = 'patrol';
// Разворачиваем монстра лицом к игроку (смотрит по -Z, rotation.y = PI)
visibleMonster.group.rotation.y = Math.PI;

enemies.update(0.05, player, catacombs);
console.log('Состояние монстра в прямой видимости:', visibleMonster.state, '| hasLOS:', visibleMonster.hasLOS);
if (visibleMonster.state !== 'chase' || !visibleMonster.hasLOS) {
  throw new Error('Monster with clear line of sight must spot player and enter chase');
}
console.log('✓ Монстр в прямой видимости успешно замечает игрока и начинает преследование');

// --------------------------------------------------------------------------
// 5. Тест: Звук выстрела привлекает врагов за стенами (Investigate sound origin)
// --------------------------------------------------------------------------
console.log('\n--- ТЕСТ 5: Звук выстрела привлекает монстров из других комнат ---');
console.log('Состояние скрытого монстра до звука выстрела:', hiddenMonster.state);
enemies.alertSound(player.pos, 35);
console.log('Состояние скрытого монстра после звука выстрела:', hiddenMonster.state);
if (hiddenMonster.state !== 'investigate') {
  throw new Error('Monster should enter investigate state upon hearing gunshot');
}
console.log('Цель расследования монстра:', hiddenMonster.lastKnownPlayerPos.x, hiddenMonster.lastKnownPlayerPos.z);
if (hiddenMonster.lastKnownPlayerPos.x !== player.pos.x || hiddenMonster.lastKnownPlayerPos.z !== player.pos.z) {
  throw new Error('Monster should investigate sound origin position');
}
console.log('✓ Звук выстрела правильно переводит удаленных врагов в режим расследования источника шума');

console.log('\n================================================================');
console.log('ВСЕ ТЕСТЫ СЕНСОРНОГО ИИ, ПОВОРОТОВ И СВЕТОТЕНИ КРОВИ УСПЕШНО ПРОЙДЕНЫ! ✓');
console.log('================================================================');
