import * as THREE from 'three';

// ============================================================================
// Процедурные 3D-вьюмодели оружия и боевого пинка в PS1-стилистике
// 1) «СЕКТОР-9» — штурмовой автомат
// 2) «ПАЛАЧ» — брутальный двуствольный обрез-дробовик
// 3) Боевой армейский ботинок (пинок ногой)
// ============================================================================

function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
function cyl(r1, r2, h, seg = 10) { return new THREE.CylinderGeometry(r1, r2, h, seg); }

// ----------------------------------------------------------------------------
// 1) ШТУРМОВОЙ АВТОМАТ «СЕКТОР-9»
// ----------------------------------------------------------------------------
export function buildRifle() {
  const group = new THREE.Group();
  const M = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...extra });
  const body = M(0x24272d);
  const dark = M(0x141519);
  const metal = M(0x3d434c);
  const red = M(0xb31616, { emissive: 0x400604, emissiveIntensity: 0.6 });
  const rubber = M(0x1a1b20);

  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, parent = group) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  };

  // Ресивер
  const core = add(box(0.056, 0.075, 0.42), body, 0, 0.015, 0.11);
  add(box(0.032, 0.024, 0.36), dark, 0, 0.063, 0.10);
  for (let i = 0; i < 4; i++) add(box(0.058, 0.008, 0.02), dark, 0, 0.03, 0.02 + i * 0.05);
  add(box(0.004, 0.012, 0.2), red, 0.0295, 0.0, 0.1);
  add(box(0.004, 0.012, 0.2), red, -0.0295, 0.0, 0.1);

  // Ствол и кожух
  add(cyl(0.013, 0.013, 0.40, 10), metal, 0, 0.015, -0.26, Math.PI / 2, 0, 0);
  add(cyl(0.023, 0.023, 0.28, 10), dark, 0, 0.015, -0.20, Math.PI / 2, 0, 0);
  for (let i = 0; i < 3; i++) add(box(0.048, 0.008, 0.016), body, 0, 0.015, -0.16 - i * 0.06, 0, 0, 0);
  add(cyl(0.0238, 0.0238, 0.014, 10), red, 0, 0.015, -0.27, Math.PI / 2, 0, 0);
  add(cyl(0.0238, 0.0238, 0.014, 10), red, 0, 0.015, -0.33, Math.PI / 2, 0, 0);
  add(box(0.026, 0.024, 0.035), body, 0, 0.04, -0.295);
  add(cyl(0.019, 0.017, 0.062, 10), dark, 0, 0.015, -0.465, Math.PI / 2, 0, 0);
  for (let i = 0; i < 3; i++) add(box(0.036, 0.01, 0.008), body, 0, 0.015, -0.445 - i * 0.016);
  add(cyl(0.007, 0.007, 0.04, 8), metal, 0, 0.015, -0.505, Math.PI / 2, 0, 0);

  // Прицел
  add(box(0.014, 0.02, 0.02), dark, 0, 0.085, -0.065);
  const ringBase = add(box(0.03, 0.016, 0.12), dark, 0, 0.082, 0.04);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, 6, 12), body);
  ring.position.set(0, 0.028, 0);
  ring.rotation.y = Math.PI / 2;
  ringBase.add(ring);
  add(box(0.004, 0.016, 0.004), red, 0, 0.11, 0.04);
  add(box(0.02, 0.02, 0.03), dark, 0, 0.085, 0.17);

  // Магазин
  const mg = new THREE.Shape();
  mg.moveTo(-0.022, 0); mg.lineTo(0.022, 0); mg.lineTo(0.017, -0.14); mg.lineTo(-0.017, -0.14); mg.closePath();
  const mag = new THREE.Mesh(new THREE.ExtrudeGeometry(mg, { depth: 0.028, bevelEnabled: false }), dark);
  mag.rotation.y = -Math.PI / 2;
  mag.position.set(0.014, -0.008, 0.045);
  group.add(mag);
  add(box(0.03, 0.012, 0.036), red, 0, -0.148, 0.045, 0, 0, 0);

  // Рукоять
  const gripGeo = box(0.036, 0.125, 0.03);
  gripGeo.translate(0, -0.0625, 0);
  const grip = new THREE.Mesh(gripGeo, rubber);
  grip.position.set(0, -0.01, 0.235);
  grip.rotation.x = 0.14;
  group.add(grip);
  add(box(0.038, 0.01, 0.006), dark, 0, -0.055, 0.228, 0.14, 0, 0);
  add(box(0.038, 0.01, 0.006), dark, 0, -0.085, 0.234, 0.14, 0, 0);
  add(box(0.02, 0.014, 0.004), red, 0.019, -0.04, 0.226, 0.14, 0, 0);

  // Приклад
  add(box(0.04, 0.062, 0.15), body, 0, 0.012, 0.375);
  add(box(0.046, 0.02, 0.05), dark, 0, -0.03, 0.415);
  add(box(0.042, 0.07, 0.016), red, 0, 0.012, 0.455);
  add(box(0.02, 0.014, 0.03), dark, 0, -0.045, 0.44);

  // Затвор
  const bolt = add(box(0.022, 0.034, 0.08), metal, 0.039, 0.017, 0.06);
  add(box(0.012, 0.012, 0.02), dark, 0.045, 0.028, 0.06);

  // Дуло
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.015, -0.53);
  group.add(muzzle);

  group.traverse(o => { o.frustumCulled = false; });
  return { group, muzzle, bolt, core, mag, grip };
}

// ----------------------------------------------------------------------------
// 2) ДВУСТВОЛЬНЫЙ ОБРЕЗ «ПАЛАЧ»
// ----------------------------------------------------------------------------
export function buildShotgun() {
  const group = new THREE.Group();
  const M = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...extra });
  const wood = M(0x4a2a16);
  const woodDark = M(0x2d170b);
  const steel = M(0x353a42);
  const darkSteel = M(0x1a1c22);
  const brass = M(0xc49232);
  const redShell = M(0x9a1010);
  const wrap = M(0x736352);

  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, parent = group) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  };

  // Ресиверная коробка (база)
  const receiver = add(box(0.076, 0.078, 0.18), darkSteel, 0, 0.01, 0.06);
  add(box(0.068, 0.022, 0.14), brass, 0, 0.052, 0.05); // верхняя пластина
  // Рычаг отпирания стволов
  const lever = add(box(0.014, 0.024, 0.05), brass, 0, 0.065, 0.1);
  lever.rotation.x = -0.3;

  // Два курка сзади
  add(box(0.012, 0.035, 0.02), darkSteel, -0.022, 0.055, 0.13, -0.35, 0, 0);
  add(box(0.012, 0.035, 0.02), darkSteel, 0.022, 0.055, 0.13, -0.35, 0, 0);

  // Скоба и два спусковых крючка снизу
  add(box(0.024, 0.04, 0.09), darkSteel, 0, -0.045, 0.08);
  add(box(0.008, 0.025, 0.01), brass, -0.008, -0.04, 0.07, 0.35, 0, 0);
  add(box(0.008, 0.025, 0.01), brass, 0.008, -0.04, 0.09, 0.35, 0, 0);

  // Рукоять из тёмного дерева с кровавой обмоткой
  const gripGeo = box(0.048, 0.15, 0.06);
  gripGeo.translate(0, -0.07, 0);
  const grip = new THREE.Mesh(gripGeo, wood);
  grip.position.set(0, -0.01, 0.14);
  grip.rotation.x = 0.38;
  group.add(grip);

  // Тканевая обмотка на рукояти
  for (let i = 0; i < 3; i++) {
    add(box(0.052, 0.018, 0.064), wrap, 0, -0.04 - i * 0.032, 0.155 + i * 0.015, 0.38, 0, (i % 2 === 0 ? 0.08 : -0.08));
  }
  add(box(0.044, 0.024, 0.055), woodDark, 0, -0.145, 0.20, 0.38, 0, 0);

  // ==========================================
  // Переломный блок стволов (Barrel Break Pivot)
  // ==========================================
  const barrelGroup = new THREE.Group();
  barrelGroup.position.set(0, 0.01, -0.02); // шарнир перелома
  group.add(barrelGroup);

  // Деревянное цевьё снизу стволов
  const forend = new THREE.Mesh(box(0.074, 0.045, 0.20), wood);
  forend.position.set(0, -0.03, -0.09);
  barrelGroup.add(forend);
  const band = new THREE.Mesh(box(0.078, 0.048, 0.018), darkSteel);
  band.position.set(0, -0.03, -0.16);
  barrelGroup.add(band);

  // Два параллельных тяжелых ствола
  const barrelL = new THREE.Mesh(cyl(0.019, 0.018, 0.38, 12), steel);
  barrelL.rotation.x = Math.PI / 2;
  barrelL.position.set(-0.022, 0.005, -0.18);
  barrelGroup.add(barrelL);

  const barrelR = new THREE.Mesh(cyl(0.019, 0.018, 0.38, 12), steel);
  barrelR.rotation.x = Math.PI / 2;
  barrelR.position.set(0.022, 0.005, -0.18);
  barrelGroup.add(barrelR);

  // Срезы стволов (дульные отверстия)
  const holeL = new THREE.Mesh(cyl(0.012, 0.012, 0.03, 10), darkSteel);
  holeL.rotation.x = Math.PI / 2;
  holeL.position.set(-0.022, 0.005, -0.37);
  barrelGroup.add(holeL);

  const holeR = new THREE.Mesh(cyl(0.012, 0.012, 0.03, 10), darkSteel);
  holeR.rotation.x = Math.PI / 2;
  holeR.position.set(0.022, 0.005, -0.37);
  barrelGroup.add(holeR);

  // Мушка на стволе
  const bead = new THREE.Mesh(box(0.006, 0.012, 0.008), brass);
  bead.position.set(0, 0.026, -0.35);
  barrelGroup.add(bead);

  // Патроны в казённике (красный пластик + латунный донец)
  const shellL = new THREE.Group();
  shellL.position.set(-0.022, 0.005, -0.03);
  const sBodyL = new THREE.Mesh(cyl(0.0135, 0.0135, 0.055, 8), redShell);
  sBodyL.rotation.x = Math.PI / 2;
  sBodyL.position.z = -0.01;
  const sRimL = new THREE.Mesh(cyl(0.0148, 0.0148, 0.015, 8), brass);
  sRimL.rotation.x = Math.PI / 2;
  sRimL.position.z = 0.02;
  shellL.add(sBodyL, sRimL);
  barrelGroup.add(shellL);

  const shellR = new THREE.Group();
  shellR.position.set(0.022, 0.005, -0.03);
  const sBodyR = new THREE.Mesh(cyl(0.0135, 0.0135, 0.055, 8), redShell);
  sBodyR.rotation.x = Math.PI / 2;
  sBodyR.position.z = -0.01;
  const sRimR = new THREE.Mesh(cyl(0.0148, 0.0148, 0.015, 8), brass);
  sRimR.rotation.x = Math.PI / 2;
  sRimR.position.z = 0.02;
  shellR.add(sBodyR, sRimR);
  barrelGroup.add(shellR);

  // Точка дула (по центру стволов)
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.005, -0.39);
  barrelGroup.add(muzzle);

  group.traverse(o => { o.frustumCulled = false; });
  return { group, muzzle, barrelGroup, shellL, shellR, grip, lever };
}

// ----------------------------------------------------------------------------
// 3) НОГА ИГРОКА ДЛЯ ПИНКА (Melee Kick Leg)
// ----------------------------------------------------------------------------
export function buildKickLeg() {
  const group = new THREE.Group();
  const M = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const camo = M(0x353f34);
  const leather = M(0x1c1815);
  const tread = M(0x0e0c0a);
  const steel = M(0x50555e);

  // Голень в армейском камуфляже
  const shin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.14), camo);
  shin.position.set(0, 0.15, 0);
  shin.rotation.x = -0.15;
  group.add(shin);

  // Наколенник
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.06), steel);
  pad.position.set(0, 0.34, 0.08);
  group.add(pad);

  // Тяжёлый армейский ботинок
  const bootFoot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.32), leather);
  bootFoot.position.set(0, -0.08, 0.09);
  group.add(bootFoot);

  // Стальной носок ботинка
  const toeCap = new THREE.Mesh(new THREE.BoxGeometry(0.132, 0.09, 0.1), steel);
  toeCap.position.set(0, -0.08, 0.22);
  group.add(toeCap);

  // Зубчатая подошва
  const sole = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.34), tread);
  sole.position.set(0, -0.15, 0.09);
  group.add(sole);

  // Протекторы подошвы
  for (let i = 0; i < 5; i++) {
    const lug = new THREE.Mesh(new THREE.BoxGeometry(0.142, 0.015, 0.025), steel);
    lug.position.set(0, -0.17, -0.05 + i * 0.065);
    group.add(lug);
  }

  group.position.set(0.35, -0.75, -0.3);
  group.visible = false;
  group.traverse(o => { o.frustumCulled = false; });
  return group;
}
