import * as THREE from 'three';

// ============================================================================
// Вьюмодель штурмового модуля «СЕКТОР-9».
// Ключевой принцип: ВСЕ детали перекрываются с корпусом-ядром —
// ничего не висит в воздухе (раньше ствол, магазин и рукоять были
// отставлены от ресивера на 5–12 см).
// Ориентация: ствол смотрит в -Z (в сторону камеры-цели).
// Линия ствола: y = 0.015.
// ============================================================================

function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
function cyl(r1, r2, h, seg = 10) { return new THREE.CylinderGeometry(r1, r2, h, seg); }

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

  // ---- ядро: ресивер. z: -0.10..0.32, y: -0.0225..0.0525 ----
  const core = add(box(0.056, 0.075, 0.42), body, 0, 0.015, 0.11);
  // верхняя планка-рейка: лежит сверху на ядре
  add(box(0.032, 0.024, 0.36), dark, 0, 0.063, 0.10);
  // рёбра охлаждения на ядре
  for (let i = 0; i < 4; i++) add(box(0.058, 0.008, 0.02), dark, 0, 0.03, 0.02 + i * 0.05);
  // красная полоса на боку (эмитирует — «заряженный» вид)
  add(box(0.004, 0.012, 0.2), red, 0.0295, 0.0, 0.1);
  add(box(0.004, 0.012, 0.2), red, -0.0295, 0.0, 0.1);

  // ---- ствол: задний торец утыкнут в ядро (z -0.06 > -0.10) ----
  add(cyl(0.013, 0.013, 0.40, 10), metal, 0, 0.015, -0.26, Math.PI / 2, 0, 0);
  // кожух-шахтa поверх ствола, тоже утыкана в ядро
  add(cyl(0.023, 0.023, 0.28, 10), dark, 0, 0.015, -0.20, Math.PI / 2, 0, 0);
  // отверстия-жалюзи на кожухе
  for (let i = 0; i < 3; i++) add(box(0.048, 0.008, 0.016), body, 0, 0.015, -0.16 - i * 0.06, 0, 0, 0);
  // красные кольца на кожухе
  add(cyl(0.0238, 0.0238, 0.014, 10), red, 0, 0.015, -0.27, Math.PI / 2, 0, 0);
  add(cyl(0.0238, 0.0238, 0.014, 10), red, 0, 0.015, -0.33, Math.PI / 2, 0, 0);
  // газблок на кожухе
  add(box(0.026, 0.024, 0.035), body, 0, 0.04, -0.295);
  // дульный тормоз + срез
  add(cyl(0.019, 0.017, 0.062, 10), dark, 0, 0.015, -0.465, Math.PI / 2, 0, 0);
  for (let i = 0; i < 3; i++) add(box(0.036, 0.01, 0.008), body, 0, 0.015, -0.445 - i * 0.016);
  add(cyl(0.007, 0.007, 0.04, 8), metal, 0, 0.015, -0.505, Math.PI / 2, 0, 0);

  // ---- прицельные приспособления: сидят на рейке ----
  add(box(0.014, 0.02, 0.02), dark, 0, 0.085, -0.065);   // мушка
  const ringBase = add(box(0.03, 0.016, 0.12), dark, 0, 0.082, 0.04); // основание оптики
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, 6, 12), body);
  ring.position.set(0, 0.028, 0); // локально от основания: кольцо сидит сверху
  ring.rotation.y = Math.PI / 2;
  ringBase.add(ring);
  add(box(0.004, 0.016, 0.004), red, 0, 0.11, 0.04);       // точка-репер в центре кольца
  add(box(0.02, 0.02, 0.03), dark, 0, 0.085, 0.17);        // целик

  // ---- магазин: верх утыкнут в низ ядра ----
  const mg = new THREE.Shape();
  mg.moveTo(-0.022, 0); mg.lineTo(0.022, 0); mg.lineTo(0.017, -0.14); mg.lineTo(-0.017, -0.14); mg.closePath();
  const mag = new THREE.Mesh(new THREE.ExtrudeGeometry(mg, { depth: 0.028, bevelEnabled: false }), dark);
  mag.rotation.y = -Math.PI / 2;
  mag.position.set(0.014, -0.008, 0.045);   // верх магазина на y=0 внутри ядра
  group.add(mag);
  add(box(0.03, 0.012, 0.036), red, 0, -0.148, 0.045, 0, 0, 0); // базовая плита магазина

  // ---- рукоять: верх утыкнут в низ ядра, наклон назад ----
  const gripGeo = box(0.036, 0.125, 0.03);
  gripGeo.translate(0, -0.0625, 0); // верх = pivot
  const grip = new THREE.Mesh(gripGeo, rubber);
  grip.position.set(0, -0.01, 0.235);
  grip.rotation.x = 0.14;
  group.add(grip);
  // насечки-кровавая грязь на рукояти
  add(box(0.038, 0.01, 0.006), dark, 0, -0.055, 0.228, 0.14, 0, 0);
  add(box(0.038, 0.01, 0.006), dark, 0, -0.085, 0.234, 0.14, 0, 0);
  add(box(0.02, 0.014, 0.004), red, 0.019, -0.04, 0.226, 0.14, 0, 0);

  // ---- приклад: лоб утыкнут в зад ядра (0.30 < 0.32) ----
  add(box(0.04, 0.062, 0.15), body, 0, 0.012, 0.375);
  add(box(0.046, 0.02, 0.05), dark, 0, -0.03, 0.415);       // щёчка
  add(box(0.042, 0.07, 0.016), red, 0, 0.012, 0.455);       // задняя плита
  add(box(0.02, 0.014, 0.03), dark, 0, -0.045, 0.44);       // подстелек

  // ---- затвор-рычаг справа: прицеплен к боку ядра (x 0.028) ----
  // player.js анимирует bolt.position.z = 0.06 + kick
  const bolt = add(box(0.022, 0.034, 0.08), metal, 0.039, 0.017, 0.06);
  add(box(0.012, 0.012, 0.02), dark, 0.045, 0.028, 0.06); // ушки рычага

  // ---- точка дула ----
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.015, -0.53);
  group.add(muzzle);

  group.traverse(o => { o.frustumCulled = false; });
  return { group, muzzle, bolt, core, mag, grip };
}
