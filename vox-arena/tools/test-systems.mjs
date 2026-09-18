import * as THREE from 'three';
import { TYPES, EnemyManager } from '../src/enemies.js';
import { Player } from '../src/player.js';
import { FX } from '../src/fx.js';
import { AudioSys } from '../src/audio.js';
import { buildArena } from '../src/arena.js';
import { buildRifle, buildShotgun, buildKickLeg } from '../src/weapon-model.js';

console.log('=== ЗАПУСК ТЕСТОВ СИСТЕМ РАСШИРЕНИЯ ХОРРОР-ШУТЕРА ===\n');

// Создаем мок-текстуры
function mockTex() {
  const d = new Uint8Array([255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 1, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
}
const T = {
  flesh: mockTex(),
  membrane: mockTex(),
  glow: mockTex(),
  shadow: mockTex(),
  smoke: mockTex(),
  flash: mockTex(),
  hole: mockTex(),
  splat: mockTex(),
  sky: mockTex(),
  floor: mockTex(),
  wall: mockTex(),
  hazard: mockTex(),
  platform: mockTex(),
  crate: mockTex(),
};

// 1. Создание мок-сцены и систем
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(85, 16 / 9, 0.1, 100);
const arena = buildArena(scene, T);
const fx = new FX(scene, T);
const sfx = new AudioSys();
const mockHud = {
  styleEvent: (s) => console.log('  [HUD STYLE]', s),
  hitmarker: (k) => console.log('  [HUD HITMARKER]', k ? 'KILL' : 'HIT'),
  damageFlash: () => {},
  addScreenBlood: (a) => console.log('  [HUD SCREEN BLOOD] intensity:', a),
  setAmmo: (m, s, r, isShotgun) => {},
  setWeaponSlot: (slot) => {},
  setFlashlight: (on) => console.log('  [HUD FLASHLIGHT]', on ? 'ON' : 'OFF'),
};

const enemies = new EnemyManager(scene, T, fx, sfx, {
  onKill: (e, head, gib) => console.log(`  [KILL EVENT] ${e.typeName} | headshot: ${head} | gibbed: ${gib}`),
  hud: mockHud,
});

const player = new Player(camera);
console.log('✓ Игрок и системы инициализированы');

// Тест 1: Проверка 3D-моделей оружия и ноги
console.log('\n--- ТЕСТ 1: 3D Вьюмодели (Автомат, Двустволка, Нога) ---');
const r = buildRifle();
const sg = buildShotgun();
const k = buildKickLeg();
if (!r.group || !r.muzzle || !r.bolt) throw new Error('Rifle model invalid');
if (!sg.group || !sg.muzzle || !sg.barrelGroup || !sg.shellL || !sg.shellR) throw new Error('Shotgun model invalid');
if (!k || k.children.length === 0) throw new Error('Kick leg invalid');
console.log('✓ Все 3D-вьюмодели успешно сгенерированы с суставами и точками крепления');

// Тест 2: Проверка переключения оружия и стрельбы из дробовика
console.log('\n--- ТЕСТ 2: Оружие (Автомат и Двуствольный обрез «ПАЛАЧ») ---');
if (player.curSlot !== 0) throw new Error('Default slot must be 0 (Rifle)');
console.log('Текущее оружие:', player.curWeapon.name, '| Патронов:', player.mag);

// Переключаем на обрез
player.switchWeapon(1, sfx, mockHud);
player.update(0.35, { keys: new Set() }, arena, { enemies, fx, sfx, hud: mockHud });
if (player.curSlot !== 1) throw new Error('Should switch to shotgun slot 1');
console.log('Переключено на:', player.curWeapon.name, '| Патронов:', player.mag);

// Проверяем направление перелома стволов при перезарядке (строго вниз, отрицательный rotation.x)
player.mag = 0;
player._startReload(sfx, mockHud);
player.update(0.5, { keys: new Set() }, arena, { enemies, fx, sfx, hud: mockHud });
const barrelRotX = player.shotgunAssets.barrelGroup.rotation.x;
console.log('Угол перелома стволов дробовика при перезарядке:', barrelRotX.toFixed(3), 'рад');
if (barrelRotX >= 0) throw new Error('Shotgun barrel must tilt DOWNWARD (negative X rotation)');
console.log('✓ Стволы дробовика отклоняются строго вниз, казённик открывается навстречу игроку');

// Спавним тестового монстра перед игроком
const monster1 = enemies.spawn('minion', 0, 13, 1);
console.log('Заспавнен скороход перед игроком, HP:', monster1.hp);

// Стреляем из обреза
player.reloading = false;
player.mag = 2;
player._fireShotgun(arena, enemies, fx, sfx, mockHud);
console.log('Выстрел из обреза произведен! HP монстра после залпа картечи:', monster1.hp);
console.log('Патронов в обрезе после выстрела:', player.mag);

// Тест 3: Боевой армейский пинок (Melee Kick)
console.log('\n--- ТЕСТ 3: Боевой пинок ногой ---');
const warrior = enemies.spawn('warrior', 0, 14.5, 1);
console.log('Заспавнен громила (Клещ), HP:', warrior.hp, 'Poise:', warrior.poise);

player.startKick(sfx);
if (!player.isKicking || !player.kickLeg.visible) throw new Error('Kick should be active');

// Симулируем фазу удара пинка
for (let step = 0; step < 10; step++) {
  player.update(0.04, { keys: new Set() }, arena, { enemies, fx, sfx, hud: mockHud });
}
console.log('Пинок нанесён! Громила HP:', warrior.hp, 'Poise:', warrior.poise, 'State:', warrior.state);
if (warrior.state !== 'knockdown') throw new Error('Warrior should be in knockdown after heavy kick');
console.log('✓ Монстр сбит с ног в физический рэгдолл-нокаут');

// Тест 4: Отстрел конечности и пинок по оторванной голове
console.log('\n--- ТЕСТ 4: Пинок по оторванной голове/конечности ---');
const rogue = enemies.spawn('rogue', 0, 14.8, 1);
enemies.severLimb(rogue, 'lArm', new THREE.Vector3(0, 1, 0), rogue.pos.clone());
console.log('Конечность оторвана, количество оторванных предметов в мире:', enemies.severedProps.length);
if (enemies.severedProps.length === 0) throw new Error('Severed prop should spawn');

const prop = enemies.severedProps[0];
console.log('Позиция отстреленной конечности:', prop.pos.x.toFixed(2), prop.pos.y.toFixed(2), prop.pos.z.toFixed(2));

// Пинаем лежащую конечность
player.isKicking = false;
player.kickCd = 0;
player.startKick(sfx);
for (let step = 0; step < 4; step++) {
  player.update(0.04, { keys: new Set() }, arena, { enemies, fx, sfx, hud: mockHud });
}
console.log('Конечность после пинка: vx =', prop.vel.x.toFixed(2), 'vy =', prop.vel.y.toFixed(2), 'vz =', prop.vel.z.toFixed(2));
if (Math.hypot(prop.vel.x, prop.vel.z) < 3.0 || prop.vel.y <= 0) throw new Error('Severed prop should be launched by kick');
console.log('✓ Конечность запущена пинком как снаряд');

// Тест 5: Агония обезглавленного (Headless Rampage)
console.log('\n--- ТЕСТ 5: Агония обезглавленного (Headless Rampage) ---');
const runner = enemies.spawn('minion', 0, 10, 1);
runner.state = 'headless_rampage';
runner.rampageT = 1.5;
runner.forwardX = 0;
runner.forwardZ = 1;
console.log('Монстр переведён в Headless Rampage, state:', runner.state);

for (let s = 0; s < 15; s++) {
  enemies.update(0.05, player, arena);
}
console.log('Монстр в агонии прошагал вперед, Z =', runner.pos.z.toFixed(2), 'State:', runner.state);
if (runner.pos.z <= 10) throw new Error('Headless monster should stumble forward');
console.log('✓ Обезглавленный монстр бежит вперед в агонии, фонтанируя кровью');

// Тест 6: Тактический фонарик (Hotspot + Spill)
console.log('\n--- ТЕСТ 6: Тактический фонарик (SpotLight + Spill PointLight) ---');
console.log('Фонарь изначально:', player.flashlightOn, 'Spot:', player.spotLight.intensity, 'Spill:', player.spillLight.intensity);
player.toggleFlashlight(sfx, mockHud);
console.log('Фонарь после выключения:', player.flashlightOn, 'Spot:', player.spotLight.intensity, 'Spill:', player.spillLight.intensity);
if (player.flashlightOn || player.spotLight.intensity !== 0 || player.spillLight.intensity !== 0) throw new Error('Flashlight lights should be OFF');
player.toggleFlashlight(sfx, mockHud);
if (!player.flashlightOn || player.spotLight.intensity === 0 || player.spillLight.intensity === 0) throw new Error('Flashlight lights should be ON');
console.log('✓ Двойная система фонаря (луч + окружающий рассеянный свет) корректно переключается');

console.log('\n======================================================');
console.log('ВСЕ ТЕСТЫ НОВЫХ СИСТЕМ УСПЕШНО ПРОЙДЕНЫ БЕЗ ОШИБОК! ✓');
console.log('======================================================');
