import * as THREE from 'three';

// Процедурная вьюмодель штурмовой винтовки «Сектор-9»: экструзии, детали, подвижный затвор.
// Ориентация: ствол смотрит в -Z (как камера).
function extrude(shape, depth, bevel = 0.006) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 4 });
  g.rotateY(Math.PI / 2); // профиль в плоскости XZ? -> делаем боковой профиль в XY, выдавливание по Z
  return g;
}
function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
function cyl(r1, r2, h, seg = 10) { return new THREE.CylinderGeometry(r1, r2, h, seg); }

export function buildRifle() {
  const group = new THREE.Group();
  const M = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...extra });
  const body = M(0x24272d), dark = M(0x141519), grip = M(0x1a1b20), red = M(0xb31616, { emissive: 0x400604, emissiveIntensity: 0.5 }), metal = M(0x3d434c), brass = M(0x8a6a1a);

  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, parent = group) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    parent.add(m); return m;
  };

  // --- ресивер: боковой профиль, выдавлен по X (поперёк) ---
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(0.36, 0); s.lineTo(0.36, 0.055); s.lineTo(0.30, 0.075);
  s.lineTo(0.10, 0.075); s.lineTo(0.06, 0.10); s.lineTo(0.02, 0.10); s.lineTo(0, 0.06); s.closePath();
  const rec = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.052, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 1 }), body);
  rec.rotation.y = -Math.PI / 2; rec.position.set(0.026, -0.02, 0.05);
  group.add(rec);

  // --- ствол + кожух с отверстиями-имитацией ---
  add(cyl(0.013, 0.013, 0.34, 10), metal, 0, -0.004, -0.24, Math.PI / 2, 0, 0);
  const shroud = add(cyl(0.021, 0.021, 0.17, 10), dark, 0, -0.004, -0.135, Math.PI / 2, 0, 0);
  // красные акценты на кожухе
  add(cyl(0.0225, 0.0225, 0.012, 10), red, 0, -0.004, -0.075, Math.PI / 2, 0, 0);
  add(cyl(0.0225, 0.0225, 0.012, 10), red, 0, -0.004, -0.195, Math.PI / 2, 0, 0);
  // дульный тормоз с прорезями
  add(cyl(0.019, 0.017, 0.062, 10), dark, 0, -0.004, -0.435, Math.PI / 2, 0, 0);
  for (let i = 0; i < 3; i++) add(box(0.012, 0.008, 0.012), body, 0.02, -0.004, -0.415 - i * 0.018, 0, 0, 0);
  add(cyl(0.007, 0.007, 0.03, 8), metal, 0, -0.004, -0.47, Math.PI / 2, 0, 0); // дульный срез

  // --- мост-стык между ресивером и цевьём (убирает «разрыв» силуэта) ---
  add(box(0.058, 0.046, 0.1), body, 0, 0.004, -0.03);
  add(box(0.05, 0.012, 0.3), dark, 0, 0.052, -0.05); // нижняя направляющая

  // --- цевьё ---
  add(box(0.055, 0.05, 0.16), dark, 0, -0.012, -0.135);
  for (let i = 0; i < 4; i++) add(box(0.058, 0.006, 0.014), body, 0, 0.012, -0.08 - i * 0.032); // планка
  add(box(0.03, 0.014, 0.05), body, 0, 0.028, -0.06); // газблок

  // --- магазин (трапеция) ---
  const mg = new THREE.Shape();
  mg.moveTo(-0.026, 0); mg.lineTo(0.026, 0); mg.lineTo(0.02, -0.11); mg.lineTo(-0.02, -0.11); mg.closePath();
  const mag = new THREE.Mesh(new THREE.ExtrudeGeometry(mg, { depth: 0.03, bevelEnabled: false }), dark);
  mag.rotation.y = -Math.PI / 2; mag.position.set(0.015, -0.075, 0.02);
  mag.rotation.x = 0.1;
  group.add(mag);
  add(box(0.028, 0.012, 0.034), red, 0, -0.078, 0.02, 0.1, 0, 0); // база магазина

  // --- рукоять ---
  const hs = new THREE.Shape();
  hs.moveTo(0, 0); hs.lineTo(0.034, 0); hs.lineTo(0.026, -0.085); hs.lineTo(0.004, -0.085); hs.closePath();
  const hg = new THREE.Mesh(new THREE.ExtrudeGeometry(hs, { depth: 0.03, bevelEnabled: false }), grip);
  hg.rotation.y = -Math.PI / 2; hg.position.set(0.015, -0.072, 0.095);
  group.add(hg);

  // --- приклад ---
  add(box(0.03, 0.03, 0.12), body, 0, 0.012, 0.16);
  add(box(0.036, 0.075, 0.03), grip, 0, -0.005, 0.225);
  add(box(0.04, 0.09, 0.012), red, 0, -0.005, 0.245);

  // --- прицельная планка + кольцо ---
  add(box(0.03, 0.008, 0.1), dark, 0, 0.085, 0.02);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0035, 6, 12), dark);
  ring.position.set(0, 0.112, -0.025); group.add(ring);
  add(box(0.004, 0.014, 0.004), red, 0, 0.098, -0.025); // мушка
  add(box(0.026, 0.02, 0.03), body, 0, 0.098, 0.075); // целик-блок

  // --- затвор (двигается при выстреле) ---
  const bolt = add(box(0.014, 0.016, 0.09), metal, 0.034, 0.028, 0.06);

  // --- рукоять переноски/крючки ---
  add(box(0.008, 0.008, 0.05), dark, -0.03, 0.03, -0.05, 0, 0, 0.4);
  add(box(0.008, 0.008, 0.05), dark, 0.03, 0.03, -0.05, 0, 0, -0.4);

  // --- точка дула ---
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.004, -0.48);
  group.add(muzzle);

  group.traverse(o => { o.frustumCulled = false; });
  return { group, muzzle, bolt, mag };
}
