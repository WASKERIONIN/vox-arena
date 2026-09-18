import * as THREE from 'three';
import { rand } from './config.js';

// ============================================================================
// Процедурные твари в духе боди-хоррора.
// Никаких милых скелетов: мясо, рёбра, кости, светящиеся глаза,
// асимметрия и неестественные пропорции. Анимация — процедурная (суставы),
// с подёргиваниями и спазмами.
// Ориентация: тварь смотрит в +Z (группа поворачивается к игроку в enemies.js).
// ============================================================================
const SPAWN_DUR = 0.9;

const BASE_PELVIS_Y = {
  minion: 0.85,
  rogue: 0.68,
  warrior: 0.92,
  mage: 0,
};

// ---------- хелперы геометрии ----------
function J(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// сдвиг вершин — органический «неправильный» силуэт
function jitter(geo, amt) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(
      i,
      p.getX(i) + (Math.random() - 0.5) * amt,
      p.getY(i) + (Math.random() - 0.5) * amt,
      p.getZ(i) + (Math.random() - 0.5) * amt
    );
  }
  geo.computeVertexNormals();
  return geo;
}

// сегмент конечности: шарнир сверху, «шарик сустава» (капсула) вниз
function seg(parent, len, r, mat, opts = {}) {
  const j = J(parent, opts.x || 0, opts.y || 0, opts.z || 0);
  if (opts.rx) j.rotation.x = opts.rx;
  if (opts.ry) j.rotation.y = opts.ry;
  if (opts.rz) j.rotation.z = opts.rz;
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.02, len), 2, 7), mat);
  m.position.y = -len / 2;
  j.add(m);
  return j;
}

// ---------- материалы ----------
function makeMats(tex) {
  const meat = new THREE.MeshLambertMaterial({ map: tex.flesh, flatShading: true });
  const meatDark = new THREE.MeshLambertMaterial({ map: tex.flesh, color: 0x777777, flatShading: true });
  const meatPale = new THREE.MeshLambertMaterial({ map: tex.flesh, color: 0xc49a8a, flatShading: true });
  const bone = new THREE.MeshLambertMaterial({ color: 0xb9ad93, flatShading: true });
  const maw = new THREE.MeshLambertMaterial({ color: 0x160709, flatShading: true });
  const membrane = new THREE.MeshLambertMaterial({ map: tex.membrane, flatShading: true });
  const eyeYellow = new THREE.MeshBasicMaterial({ color: 0xffd23a });
  const eyeRed = new THREE.MeshBasicMaterial({ color: 0xff2a12 });
  const eyeViolet = new THREE.MeshBasicMaterial({ color: 0xc44dff });
  const heart = new THREE.MeshBasicMaterial({ color: 0xff1e10 });
  return { meat, meatDark, meatPale, bone, maw, membrane, eyeYellow, eyeRed, eyeViolet, heart };
}

// Заглушка культи (кровавый срез + торчащая сломанная кость)
export function createStumpCap(tex, scale = 1.0) {
  const g = new THREE.Group();
  const fleshMat = new THREE.MeshLambertMaterial({ map: tex.flesh, color: 0x6a0808, flatShading: true });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * scale, 0.09 * scale, 0.04 * scale, 6), fleshMat);
  cap.rotation.x = Math.PI / 2;
  const boneMat = new THREE.MeshLambertMaterial({ color: 0xb5a892, flatShading: true });
  const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.024 * scale, 0.03 * scale, 0.07 * scale, 5), boneMat);
  bone.position.set(0.01 * scale, 0, 0.025 * scale);
  bone.rotation.x = Math.PI / 2 + rand(-0.2, 0.2);
  g.add(cap, bone);
  return g;
}

function addRibs(parent, M, cx, cy, cz, r, n, mat) {
  for (let i = 0; i < n; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.02, 4, 12, Math.PI * 1.45), mat);
    t.rotation.y = Math.PI * 0.275;
    t.position.set(0, cy + i * 0.09, 0);
    t.scale.set(1, 0.75, 1.15);
    parent.add(t);
  }
}

// глаз + мягкое свечение
function addEye(parent, M, tex, mat, x, y, z, r, glowColor, scale = 0.16) {
  const e = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 5), mat);
  e.position.set(x, y, z);
  parent.add(e);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex.glow, color: glowColor, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  glow.position.set(x, y, z + 0.004);
  glow.scale.setScalar(scale);
  parent.add(glow);
  return e;
}

function addClaws(hand, M, n, len = 0.09) {
  for (let i = 0; i < n; i++) {
    const a = (i - (n - 1) / 2) * 0.5;
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.016, len, 4), M.bone);
    c.position.set(Math.sin(a) * 0.03, -len / 2 + 0.01, Math.cos(a) * 0.02 + 0.02);
    c.rotation.x = -0.5;
    c.rotation.z = -a * 0.7;
    hand.add(c);
  }
}

// ============================================================================
// 1) СКОРОХОД — худой бегун с обнажённым сердцем
// ============================================================================
function buildRunner(M, tex) {
  const root = new THREE.Group();
  const j = {};
  const mats = [M.meat, M.meatDark, M.bone, M.maw];

  const pelvis = J(root, 0, 0.85, 0); j.pelvis = pelvis;
  const pb = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.15, 7, 5), 0.03), M.meat);
  pb.scale.set(1.1, 0.8, 0.9); pelvis.add(pb);

  const spine = J(pelvis, 0, 0.07, -0.02); j.spine = spine;
  const sp = new THREE.Mesh(jitter(new THREE.CapsuleGeometry(0.09, 0.2, 2, 6), 0.02), M.meatDark);
  sp.position.y = 0.1; spine.add(sp);

  const chest = J(spine, 0, 0.22, 0); j.chest = chest;
  const ch = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.23, 8, 6), 0.035), M.meat);
  ch.scale.set(1, 1.3, 0.85); ch.position.y = 0.12; chest.add(ch);
  addRibs(chest, M, 0, 0.02, 0.1, 0.2, 4, M.bone);
  for (let i = 0; i < 5; i++) {
    const v = new THREE.Mesh(new THREE.SphereGeometry(0.028, 5, 4), M.bone);
    v.position.set(0, 0.05 + i * 0.07, -0.2);
    chest.add(v);
  }

  const heartJ = J(chest, 0, 0.06, 0.14); j.heart = heartJ;
  const hm = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), M.heart);
  heartJ.add(hm);
  j.heartMesh = hm;

  const neck = J(chest, 0, 0.34, 0.04); j.neck = neck;
  const nk = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.1, 2, 6), M.meatDark);
  nk.position.y = 0.05; neck.add(nk);

  const head = J(neck, 0, 0.13, 0.03); j.head = head;
  const hd = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.125, 7, 5), 0.02), M.meatDark);
  hd.scale.set(0.85, 1.15, 0.95); hd.rotation.z = 0.12; head.add(hd);
  for (const sx of [-0.05, 0.05]) {
    addEye(head, M, tex, M.eyeYellow, sx, 0.035, 0.105, 0.026, 0xffd23a, 0.13);
  }

  const jaw = J(head, 0, -0.1, 0.06); j.jaw = jaw;
  const jm = new THREE.Mesh(jitter(new THREE.ConeGeometry(0.055, 0.16, 5), 0.012), M.maw);
  jm.position.y = -0.07; jm.rotation.x = -0.25; jaw.add(jm);

  // Руки — вытянуты вперёд к жертве
  for (const s of [1, -1]) {
    const sh = J(chest, s * 0.24, 0.26, 0);
    if (s === 1) j.lShoulder = sh; else j.rShoulder = sh;
    const up = seg(sh, 0.34, 0.05, M.meat);
    const el = J(up, 0, -0.34, 0);
    if (s === 1) j.lElbow = el; else j.rElbow = el;
    const lo = seg(el, 0.34, 0.04, M.meatDark);
    const hand = J(lo, 0, -0.34, 0);
    if (s === 1) j.lHand = hand; else j.rHand = hand;
    addClaws(hand, M, 3, 0.1);
  }

  // Ноги
  for (const s of [1, -1]) {
    const hip = J(pelvis, s * 0.11, -0.04, 0);
    if (s === 1) j.lHip = hip; else j.rHip = hip;
    const th = seg(hip, 0.4, 0.065, M.meat);
    const kn = J(th, 0, -0.4, 0);
    if (s === 1) j.lKnee = kn; else j.rKnee = kn;
    const sh2 = seg(kn, 0.36, 0.05, M.meatDark);
    const ft = J(sh2, 0, -0.36, 0);
    if (s === 1) j.lFoot = ft; else j.rFoot = ft;
    const foot = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.08, 6, 4), 0.015), M.maw);
    foot.scale.set(0.8, 0.45, 1.5); foot.position.set(0, -0.04, 0.05); ft.add(foot);
  }

  return { root, joints: j, mats };
}

// ============================================================================
// 2) РЕЗАК — сутулый мясник с костяным лезвием
// ============================================================================
function buildButcher(M, tex) {
  const root = new THREE.Group();
  const j = {};
  const mats = [M.meat, M.meatDark, M.meatPale, M.bone, M.maw];

  const pelvis = J(root, 0, 0.68, 0); j.pelvis = pelvis;
  const pb = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.17, 7, 5), 0.03), M.meat);
  pb.scale.set(1.15, 0.75, 0.95); pelvis.add(pb);

  const spine = J(pelvis, 0, 0.06, -0.02); j.spine = spine;
  const sp = new THREE.Mesh(jitter(new THREE.CapsuleGeometry(0.12, 0.16, 2, 6), 0.02), M.meat);
  sp.position.y = 0.08; spine.add(sp);

  const chest = J(spine, 0, 0.18, 0); j.chest = chest;
  const ch = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.28, 8, 6), 0.04), M.meat);
  ch.scale.set(1.25, 0.85, 1); ch.position.y = 0.08; chest.add(ch);

  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.26 + i * 0.012, 0.018, 4, 10, Math.PI * 1.2), M.bone);
    t.rotation.set(Math.PI / 2 - 0.35, 0.45 + i * 0.18, 0);
    t.position.set(-0.12, 0.0 + i * 0.08, 0.08);
    chest.add(t);
  }
  for (let i = 0; i < 4; i++) {
    const v = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 4), M.bone);
    v.position.set(0.02, 0.1 + i * 0.07, -0.24);
    v.rotation.x = -1.9;
    chest.add(v);
  }

  const neck = J(chest, 0, 0.2, 0.14); j.neck = neck;
  const head = J(neck, 0, 0.08, 0.05); j.head = head;
  const hd = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.15, 7, 5), 0.025), M.meatDark);
  hd.scale.set(1.15, 0.75, 1.05); head.add(hd);

  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.022, 0.03), M.eyeRed);
  eye.position.set(0.06, 0.02, 0.13); eye.rotation.y = 0.2; head.add(eye);
  const eyeGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex.glow, color: 0xff2a12, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  eyeGlow.position.set(0.06, 0.02, 0.135); eyeGlow.scale.set(0.2, 0.1, 1);
  head.add(eyeGlow);
  const sock = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), M.maw);
  sock.position.set(-0.06, 0.03, 0.12); head.add(sock);

  const jaw = J(head, 0, -0.08, 0.09); j.jaw = jaw;
  const lip = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.03, 0.06), M.maw);
  lip.position.y = -0.02; jaw.add(lip);
  for (let i = 0; i < 6; i++) {
    const a = (i / 5 - 0.5) * 1.6;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.05, 4), M.bone);
    tooth.position.set(Math.sin(a) * 0.07, -0.055, Math.cos(a) * 0.015 + 0.01);
    tooth.rotation.x = Math.PI + 0.3;
    jaw.add(tooth);
  }

  // Правая рука — костяное лезвие
  const rsh = J(chest, -0.3, 0.14, 0); j.rShoulder = rsh;
  const rup = seg(rsh, 0.26, 0.09, M.meat);
  const rel = J(rup, 0, -0.26, 0); j.rElbow = rel;
  const blade = new THREE.Mesh(jitter(new THREE.ConeGeometry(0.085, 0.62, 4), 0.015), M.meatPale);
  blade.scale.set(1, 1, 0.3); blade.position.y = -0.28; blade.rotation.z = 0.15; rel.add(blade);
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.5, 0.012), M.eyeRed);
  seam.position.set(0.05, -0.3, 0.015); rel.add(seam);
  j.rHand = J(rel, 0, -0.6, 0);

  // Левая рука — когти
  const lsh = J(chest, 0.28, 0.12, 0); j.lShoulder = lsh;
  const lup = seg(lsh, 0.3, 0.045, M.meatDark);
  const lel = J(lup, 0, -0.3, 0); j.lElbow = lel;
  const llo = seg(lel, 0.34, 0.038, M.meatDark);
  const lhand = J(llo, 0, -0.34, 0); j.lHand = lhand;
  addClaws(lhand, M, 4, 0.12);

  for (const s of [1, -1]) {
    const hip = J(pelvis, s * 0.13, -0.05, 0);
    if (s === 1) j.lHip = hip; else j.rHip = hip;
    const th = seg(hip, 0.34, 0.085, M.meat);
    const kn = J(th, 0, -0.34, 0);
    if (s === 1) j.lKnee = kn; else j.rKnee = kn;
    const shinLen = s === 1 ? 0.36 : 0.3;
    const sh2 = seg(kn, shinLen, 0.065, M.meatDark);
    const ft = J(sh2, 0, -shinLen, 0);
    if (s === 1) j.lFoot = ft; else j.rFoot = ft;
    const foot = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.09, 6, 4), 0.02), M.maw);
    foot.scale.set(0.85, 0.5, 1.4); foot.position.set(0, -0.045, 0.05); ft.add(foot);
  }

  return { root, joints: j, mats };
}

// ============================================================================
// 3) КЛЕЩ — раздутый громила с пастью на груди
// ============================================================================
function buildBrute(M, tex) {
  const root = new THREE.Group();
  const j = {};
  const mats = [M.meat, M.meatDark, M.bone, M.maw];

  const pelvis = J(root, 0, 0.92, 0); j.pelvis = pelvis;
  const pb = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.26, 8, 5), 0.04), M.meat);
  pb.scale.set(1.25, 0.8, 1); pelvis.add(pb);

  const spine = J(pelvis, 0, 0.18, 0); j.spine = spine;
  const chest = J(spine, 0, 0.28, 0); j.chest = chest;
  const ch = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.52, 9, 7), 0.05), M.meat);
  ch.scale.set(1.12, 1.15, 1); ch.position.y = 0.1; chest.add(ch);
  j.belly = ch;

  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 4, 14, Math.PI * 1.3), M.bone);
    t.rotation.set(Math.PI / 2, 0, 0);
    t.position.y = 0.3 + i * 0.12;
    t.scale.set(1.12, 1, 1);
    chest.add(t);
  }

  const mawJ = J(chest, 0, 0.05, 0.42); j.maw = mawJ;
  const zew = new THREE.Mesh(new THREE.SphereGeometry(0.19, 7, 5), M.maw);
  zew.scale.set(1, 1.35, 0.5); mawJ.add(zew);
  for (let i = 0; i < 8; i++) {
    const a = (i / 7 - 0.5) * 2.2;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 4), M.bone);
    tooth.position.set(Math.sin(a) * 0.14, 0.12, 0.12);
    tooth.rotation.x = Math.PI * 0.85;
    tooth.rotation.z = -a * 0.4;
    mawJ.add(tooth);
  }

  const jaw = J(mawJ, 0, 0, 0.05); j.jaw = jaw;
  const lower = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 4, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), M.meatDark);
  lower.scale.set(1, 0.7, 0.8); lower.position.y = -0.1; jaw.add(lower);
  for (let i = 0; i < 6; i++) {
    const a = (i / 5 - 0.5) * 1.9;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.08, 4), M.bone);
    tooth.position.set(Math.sin(a) * 0.11, -0.02, 0.1);
    tooth.rotation.x = 0.35;
    jaw.add(tooth);
  }

  const neck = J(chest, 0, 0.62, 0.12); j.neck = neck;
  const nk = new THREE.Mesh(jitter(new THREE.CapsuleGeometry(0.1, 0.12, 2, 6), 0.02), M.meat);
  nk.position.y = 0.06; neck.add(nk);
  const head = J(neck, 0, 0.16, 0.06); j.head = head;
  const hd = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.13, 7, 5), 0.02), M.meatDark);
  hd.scale.set(1.1, 0.85, 1); head.add(hd);
  for (const sx of [-0.05, 0.05]) {
    addEye(head, M, tex, M.eyeRed, sx, 0.02, 0.115, 0.018, 0xff2a12, 0.11);
  }

  for (const s of [1, -1]) {
    const sh = J(chest, s * 0.55, 0.28, 0.08);
    if (s === 1) j.lShoulder = sh; else j.rShoulder = sh;
    const up = seg(sh, 0.3, 0.11, M.meat);
    const el = J(up, 0, -0.3, 0);
    if (s === 1) j.lElbow = el; else j.rElbow = el;
    const lo = seg(el, 0.26, 0.09, M.meatDark);
    const hand = J(lo, 0, -0.26, 0);
    if (s === 1) j.lHand = hand; else j.rHand = hand;
    const p1 = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 5), M.bone);
    p1.position.set(-0.055, -0.12, 0.03); p1.rotation.x = -0.35;
    const p2 = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 5), M.bone);
    p2.position.set(0.055, -0.12, 0.03); p2.rotation.x = -0.35;
    hand.add(p1, p2);
    if (s === 1) { j.pincerA = p1; j.pincerB = p2; }
  }

  for (const s of [1, -1]) {
    const hip = J(pelvis, s * 0.24, -0.1, 0);
    if (s === 1) j.lHip = hip; else j.rHip = hip;
    const th = seg(hip, 0.42, 0.13, M.meat);
    const kn = J(th, 0, -0.42, 0);
    if (s === 1) j.lKnee = kn; else j.rKnee = kn;
    const sh2 = seg(kn, 0.36, 0.11, M.meatDark);
    const ft = J(sh2, 0, -0.36, 0);
    if (s === 1) j.lFoot = ft; else j.rFoot = ft;
    const foot = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.14, 7, 4), 0.02), M.maw);
    foot.scale.set(1, 0.45, 1.5); foot.position.set(0, -0.06, 0.06); ft.add(foot);
  }

  return { root, joints: j, mats };
}

// ============================================================================
// 4) ПЛОД — парящий паразит-мешок
// ============================================================================
function buildSpawn(M, tex) {
  const root = new THREE.Group();
  const j = {};
  const mats = [M.membrane, M.meatDark, M.eyeViolet, M.maw];

  const sacJ = J(root, 0, 1.32, 0); j.sac = sacJ;
  const sac = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.44, 10, 8), 0.05), M.membrane);
  sac.scale.set(1, 1.12, 1); sacJ.add(sac);
  j.sacMesh = sac;

  const eyes = [[0, 0.1, 0.4], [-0.12, -0.02, 0.38], [0.12, -0.02, 0.38]];
  for (const [x, y, z] of eyes) {
    addEye(sacJ, M, tex, M.eyeViolet, x, y, z, 0.032, 0xc44dff, 0.16);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.04), M.maw);
  mouth.position.set(0, -0.14, 0.4); sacJ.add(mouth);
  j.mouth = mouth;

  const nub = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.11, 6, 5), 0.02), M.meatDark);
  nub.position.set(0, 0.42, 0.2); sacJ.add(nub);

  j.tendrils = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const r = 0.12 + (i % 3) * 0.08;
    const t = J(sacJ, Math.cos(a) * r, -0.42, Math.sin(a) * r * 0.6);
    const len = 0.4 + Math.random() * 0.3;
    const c = new THREE.Mesh(jitter(new THREE.ConeGeometry(0.055, len, 5), 0.015), M.membrane);
    c.position.y = -len / 2;
    t.add(c);
    j.tendrils.push(t);
  }

  const tail = J(sacJ, 0, -0.5, 0); j.tail = tail;
  const tl = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.4, 2, 5), M.membrane);
  tl.position.y = -0.2; tail.add(tl);
  const drop = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), M.meatDark);
  drop.scale.set(1, 1.4, 1); drop.position.y = -0.45; tail.add(drop);

  return { root, joints: j, mats };
}

// ============================================================================
// Сборка
// ============================================================================
const BUILDERS = { minion: buildRunner, rogue: buildButcher, warrior: buildBrute, mage: buildSpawn };

export function buildMonster(type, tex) {
  const M = makeMats(tex);
  const b = BUILDERS[type](M, tex);
  b.root.traverse(o => { o.frustumCulled = false; });
  return b;
}

// ============================================================================
// Анимация: процедурные позы
// ============================================================================
function kf(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
      const u = (t - t0) / (t1 - t0);
      const uu = u * u * (3 - 2 * u);
      return v0 + (v1 - v0) * uu;
    }
  }
  return keys[keys.length - 1][1];
}
function toward(v, target, k) { return v + (target - v) * k; }

const WALK = {
  minion:  { freq: 6.8, legAmp: 0.65, armAmp: 0.45, kneeAmp: 0.75, bob: 0.04, hunch: 0.25 },
  rogue:   { freq: 5.6, legAmp: 0.55, armAmp: 0.35, kneeAmp: 0.65, bob: 0.03, hunch: 0.35 },
  warrior: { freq: 3.8, legAmp: 0.45, armAmp: 0.3,  kneeAmp: 0.55, bob: 0.03, hunch: 0.2 },
};

function twitch(e, dt) {
  e.twitch += (Math.random() - 0.5) * dt * 12;
  e.twitch *= Math.max(0, 1 - dt * 4);
  if (Math.random() < dt * 0.3) e.spasm = rand(0.25, 0.5);
  e.spasm = Math.max(0, e.spasm - dt * 2.2);
}

// Сброс кватернионов и вращений всех суставов для чистых переходов между анимациями
function resetJoints(e, type) {
  const j = e.j;
  e.root.position.set(0, 0, 0);
  e.root.rotation.set(0, 0, 0);
  if (j.pelvis) {
    j.pelvis.position.set(0, BASE_PELVIS_Y[type] || 0.85, 0);
    j.pelvis.rotation.set(0, 0, 0);
    j.pelvis.quaternion.identity();
  }
  if (j.spine) { j.spine.rotation.set(0, 0, 0); j.spine.quaternion.identity(); }
  if (j.chest) { j.chest.rotation.set(0, 0, 0); j.chest.quaternion.identity(); }
  if (j.neck) { j.neck.rotation.set(0, 0, 0); j.neck.quaternion.identity(); }
  if (j.head) { j.head.rotation.set(0, 0, 0); j.head.quaternion.identity(); }
  if (j.lShoulder) { j.lShoulder.rotation.set(0, 0, 0); j.lShoulder.quaternion.identity(); }
  if (j.rShoulder) { j.rShoulder.rotation.set(0, 0, 0); j.rShoulder.quaternion.identity(); }
  if (j.lElbow) { j.lElbow.rotation.set(0, 0, 0); j.lElbow.quaternion.identity(); }
  if (j.rElbow) { j.rElbow.rotation.set(0, 0, 0); j.rElbow.quaternion.identity(); }
  if (j.lHip) { j.lHip.rotation.set(0, 0, 0); j.lHip.quaternion.identity(); }
  if (j.rHip) { j.rHip.rotation.set(0, 0, 0); j.rHip.quaternion.identity(); }
  if (j.lKnee) { j.lKnee.rotation.set(0, 0, 0); j.lKnee.quaternion.identity(); }
  if (j.rKnee) { j.rKnee.rotation.set(0, 0, 0); j.rKnee.quaternion.identity(); }
}

function poseWalk(e, dt, t, P, type) {
  resetJoints(e, type);
  const j = e.j;
  if (!e.staggerT) {
    const moveScale = Math.max(0.4, (e.speed || 4.8) / 4.8);
    e.phase += dt * P.freq * moveScale;
  }
  const p = e.phase;
  const s = Math.sin(p), c = Math.cos(p);
  const spasmAmp = e.spasm > 0 ? Math.sin(t * 36) * e.spasm : 0;

  // 1. Ноги — шаг вперед (+Z) и толчок назад (-Z)
  if (j.lHip && !e.severed?.lLeg) {
    j.lHip.rotation.x = -s * P.legAmp;
    if (j.lKnee) j.lKnee.rotation.x = Math.max(0, -s) * P.kneeAmp + 0.15;
  }
  if (j.rHip && !e.severed?.rLeg) {
    j.rHip.rotation.x = s * P.legAmp;
    if (j.rKnee) j.rKnee.rotation.x = Math.max(0, s) * P.kneeAmp + 0.15;
    if (type === 'rogue') {
      j.rHip.rotation.x += 0.2;
      if (j.rKnee) j.rKnee.rotation.x += 0.35;
    }
  }

  // 2. Руки — вытянуты ВПЕРЁД (отрицательный pitch по оси X), тянутся к игроку
  if (type === 'rogue') {
    if (j.lShoulder && !e.severed?.lArm) {
      j.lShoulder.rotation.set(-0.4 + s * 0.2, 0, -0.2);
      if (j.lElbow) j.lElbow.rotation.set(-0.45 + Math.max(0, s) * 0.25, 0, 0);
    }
    if (j.rShoulder && !e.severed?.rArm) {
      j.rShoulder.rotation.set(-0.75 - s * 0.2, -0.3, 0.4);
      if (j.rElbow) j.rElbow.rotation.set(-0.6 + c * 0.2, 0, 0);
    }
  } else if (type === 'warrior') {
    if (j.lShoulder && !e.severed?.lArm) {
      j.lShoulder.rotation.set(-0.55 + s * 0.25, 0.2, -0.35);
      if (j.lElbow) j.lElbow.rotation.set(-0.65 + Math.max(0, s) * 0.2, 0, 0);
    }
    if (j.rShoulder && !e.severed?.rArm) {
      j.rShoulder.rotation.set(-0.55 - s * 0.25, -0.2, 0.35);
      if (j.rElbow) j.rElbow.rotation.set(-0.65 + Math.max(0, -s) * 0.2, 0, 0);
    }
  } else {
    // Скороход (minion)
    if (j.lShoulder && !e.severed?.lArm) {
      j.lShoulder.rotation.set(-0.55 + s * P.armAmp, 0.1, -0.15);
      if (j.lElbow) j.lElbow.rotation.set(-0.5 + Math.max(0, -s) * 0.35, 0, 0);
    }
    if (j.rShoulder && !e.severed?.rArm) {
      j.rShoulder.rotation.set(-0.55 - s * P.armAmp, -0.1, 0.15);
      if (j.rElbow) j.rElbow.rotation.set(-0.5 + Math.max(0, s) * 0.35, 0, 0);
    }
  }

  // 3. Торс и голова
  if (j.spine) {
    j.spine.rotation.x = P.hunch + s * 0.04 + spasmAmp * 0.25;
    j.spine.rotation.y = s * 0.08;
    j.spine.rotation.z = c * 0.06 + e.twist;
    if (j.chest) j.chest.rotation.z = -c * 0.06 + spasmAmp * 0.3;
  }
  if (j.head && !e.severed?.head) {
    j.head.rotation.x = -s * 0.05 + e.spasm * 0.2 * Math.sin(t * 26);
    j.head.rotation.z = c * 0.08 + e.tilt;
  }
  if (j.pelvis) {
    j.pelvis.position.y = (BASE_PELVIS_Y[type] || 0.85) + Math.abs(c) * P.bob + spasmAmp * 0.02;
  }
}

function poseIdle(e, dt, t, P, type) {
  resetJoints(e, type);
  e.phase += dt * P.freq * 0.3;
  const s = Math.sin(e.phase * 0.7), c = Math.cos(e.phase * 0.7);
  const j = e.j;

  if (j.lHip && !e.severed?.lLeg) {
    j.lHip.rotation.x = toward(j.lHip.rotation.x, -0.1 + s * 0.05, 0.1);
  }
  if (j.rHip && !e.severed?.rLeg) {
    j.rHip.rotation.x = toward(j.rHip.rotation.x, 0.1 - c * 0.05, 0.1);
  }

  if (type === 'rogue') {
    if (j.lShoulder && !e.severed?.lArm) j.lShoulder.rotation.set(-0.35, 0, -0.2);
    if (j.rShoulder && !e.severed?.rArm) j.rShoulder.rotation.set(-0.7, -0.3, 0.4);
    if (j.rElbow && !e.severed?.rArm) j.rElbow.rotation.set(-0.55, 0, 0);
  } else if (type === 'warrior') {
    if (j.lShoulder && !e.severed?.lArm) j.lShoulder.rotation.set(-0.5, 0.15, -0.3);
    if (j.rShoulder && !e.severed?.rArm) j.rShoulder.rotation.set(-0.5, -0.15, 0.3);
    if (j.lElbow && !e.severed?.lArm) j.lElbow.rotation.set(-0.6, 0, 0);
    if (j.rElbow && !e.severed?.rArm) j.rElbow.rotation.set(-0.6, 0, 0);
  } else {
    if (j.lShoulder && !e.severed?.lArm) {
      j.lShoulder.rotation.set(-0.45 + s * 0.08, 0.1, -0.15);
      if (j.lElbow) j.lElbow.rotation.set(-0.45, 0, 0);
    }
    if (j.rShoulder && !e.severed?.rArm) {
      j.rShoulder.rotation.set(-0.45 - c * 0.08, -0.1, 0.15);
      if (j.rElbow) j.rElbow.rotation.set(-0.45, 0, 0);
    }
  }

  if (j.spine) j.spine.rotation.x = P.hunch + s * 0.03;
  if (j.chest) j.chest.rotation.z = toward(j.chest.rotation.z, Math.sin(t * 0.7 + e.seed) * 0.04, 0.1);
  if (j.head && !e.severed?.head) {
    j.head.rotation.x = toward(j.head.rotation.x, Math.sin(t * 0.5 + e.seed) * 0.08, 0.06);
    j.head.rotation.z = toward(j.head.rotation.z, Math.sin(t * 0.33) * 0.08 + e.tilt, 0.06);
  }
}

function poseAttack(e, t, P, type) {
  resetJoints(e, type);
  const p = Math.min(1, e.animT / e.animDur);
  const j = e.j;

  if (type === 'minion') {
    const k = kf(p, [[0, -0.4], [0.35, -0.1], [0.55, -1.35], [1, -0.4]]);
    if (j.lShoulder && !e.severed?.lArm) {
      j.lShoulder.rotation.set(k, 0.1, -0.15);
      if (j.lElbow) j.lElbow.rotation.set(Math.abs(k) * 0.5 - 0.7, 0, 0);
    }
    if (j.rShoulder && !e.severed?.rArm) {
      j.rShoulder.rotation.set(k, -0.1, 0.15);
      if (j.rElbow) j.rElbow.rotation.set(Math.abs(k) * 0.5 - 0.7, 0, 0);
    }
    if (j.spine) j.spine.rotation.x = 0.35 + kf(p, [[0, 0], [0.35, -0.2], [0.55, 0.45], [1, 0]]);
  } else if (type === 'rogue') {
    const slash = kf(p, [[0, 0], [0.35, 0.8], [0.55, -1.2], [1, 0]]);
    if (j.rShoulder && !e.severed?.rArm) {
      j.rShoulder.rotation.set(-0.8 + slash * 0.6, slash * 0.8, 0.4 - slash * 0.5);
      if (j.rElbow) j.rElbow.rotation.set(-0.6 + Math.abs(slash) * 0.4, 0, 0);
    }
    if (j.spine) j.spine.rotation.y = slash * 0.5;
    if (j.lShoulder && !e.severed?.lArm) j.lShoulder.rotation.set(-0.4, 0, -0.2);
  } else if (type === 'warrior') {
    const k = kf(p, [[0, -0.5], [0.35, -1.4], [0.55, -0.2], [1, -0.5]]);
    if (j.lShoulder && !e.severed?.lArm) {
      j.lShoulder.rotation.set(k, 0.2, -0.35);
      if (j.lElbow) j.lElbow.rotation.set(k * 0.6 - 0.4, 0, 0);
    }
    if (j.rShoulder && !e.severed?.rArm) {
      j.rShoulder.rotation.set(k, -0.2, 0.35);
      if (j.rElbow) j.rElbow.rotation.set(k * 0.6 - 0.4, 0, 0);
    }
    const open = kf(p, [[0, 0.1], [0.35, 0.55], [0.55, 0.0], [1, 0.1]]);
    if (j.pincerA) { j.pincerA.rotation.z = -open; j.pincerB.rotation.z = open; }
    if (j.spine) j.spine.rotation.x = 0.2 + kf(p, [[0, 0], [0.35, -0.3], [0.55, 0.45], [1, 0]]);
  }
}

function poseCast(e, t) {
  const p = Math.min(1, e.animT / e.animDur);
  const j = e.j;
  const stretch = kf(p, [[0, 1], [0.45, 1.22], [0.6, 0.85], [1, 1]]);
  j.sac.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
  const tuck = kf(p, [[0, 1], [0.45, 0.25], [0.6, 0.25], [1, 1]]);
  for (let i = 0; i < j.tendrils.length; i++) {
    j.tendrils[i].rotation.x = tuck * Math.sin(t * 2 + i) * 0.25 - (1 - tuck) * 0.8;
  }
  j.mouth.scale.y = 1 + kf(p, [[0, 0], [0.45, 3], [0.6, 3], [1, 0]]);
}

function poseHover(e, dt, t) {
  const j = e.j;
  e.phase += dt * 1.6;
  const p = e.phase + e.seed * 9;
  e.root.position.y = (e.baseY || 0) + Math.sin(p) * 0.14;
  e.root.rotation.y += Math.sin(t * 0.5 + e.seed * 5) * dt * 0.3;
  for (let i = 0; i < j.tendrils.length; i++) {
    const tr = j.tendrils[i];
    tr.rotation.x = Math.sin(t * 1.8 + i * 1.1) * 0.22;
    tr.rotation.z = Math.cos(t * 1.5 + i * 0.7) * 0.22;
  }
  const pulse = 1 + Math.pow(Math.max(0, Math.sin(t * 2.6 + e.seed)), 6) * 0.14;
  j.sacMesh.scale.set(1 / Math.sqrt(pulse), pulse * 1.12, 1 / Math.sqrt(pulse));
  j.tail.rotation.x = Math.sin(t * 1.3 + e.seed) * 0.25;
}

function poseSpawn(e, dt, t) {
  const p = Math.min(1, e.animT / 0.9);
  const k = 1 - Math.pow(1 - p, 3);
  const sc = 0.45 + 0.55 * k;
  e.root.scale.setScalar(sc);
  e.root.position.y = 0;
  e.root.rotation.z = (1 - k) * Math.sin(t * 14) * 0.25;
}

function poseDeath(e, dt, t) {
  const j = e.j;
  const k = 1 - Math.exp(-dt * 6);
  const droop = Math.min(1, e.animT / 0.5);
  if (j.spine) {
    j.spine.rotation.x = toward(j.spine.rotation.x, 0.85 * droop, k);
    if (j.chest) j.chest.rotation.z = toward(j.chest.rotation.z, 0.4 * droop, k * 0.5);
  }
  if (j.lHip && !e.severed?.lLeg) {
    j.lHip.rotation.x = toward(j.lHip.rotation.x, 0.4 * droop, k);
    if (j.lKnee) j.lKnee.rotation.x = toward(j.lKnee.rotation.x, 0.8 * droop, k);
  }
  if (j.rHip && !e.severed?.rLeg) {
    j.rHip.rotation.x = toward(j.rHip.rotation.x, -0.2 * droop, k);
    if (j.rKnee) j.rKnee.rotation.x = toward(j.rKnee.rotation.x, 0.6 * droop, k);
  }
  if (j.lShoulder && !e.severed?.lArm) {
    j.lShoulder.rotation.set(toward(j.lShoulder.rotation.x, -0.2 * droop, k), 0, toward(j.lShoulder.rotation.z, 0.4 * droop, k));
  }
  if (j.rShoulder && !e.severed?.rArm) {
    j.rShoulder.rotation.set(toward(j.rShoulder.rotation.x, -0.2 * droop, k), 0, toward(j.rShoulder.rotation.z, -0.4 * droop, k));
  }
}

// ============================================================================
// Анимация ползания (когда оторваны ноги) — руки и когти строго над полом
// ============================================================================
function poseCrawl(e, dt, t, P, type) {
  resetJoints(e, type);
  const j = e.j;
  const isWarrior = (type === 'warrior');
  const isRogue = (type === 'rogue');

  e.phase += dt * (P.freq * 0.75);
  const p = e.phase;
  const s = Math.sin(p), c = Math.cos(p);
  const spasmAmp = e.spasm > 0 ? Math.sin(t * 36) * e.spasm : 0;

  // 1. Позиция таза и подъем груди на локтях/руках
  const pelvisY = isWarrior ? 0.28 : 0.20;
  e.root.position.set(0, 0, 0);

  if (j.pelvis) {
    j.pelvis.position.set(0, pelvisY + Math.abs(s) * 0.02, 0);
    j.pelvis.rotation.set(1.42, s * 0.12, c * 0.08);
  }

  if (j.spine) {
    // Позвоночник плавно выгибается вверх
    j.spine.rotation.set(-0.15 + c * 0.04, s * 0.3, -c * 0.18 + spasmAmp * 0.2);
  }

  if (j.chest) {
    // Грудь приподнята над полом на руках
    j.chest.rotation.set(-0.2, s * 0.18, -c * 0.16);
  }

  if (j.neck) {
    j.neck.rotation.set(-0.75, 0, 0);
  }

  if (j.head && !e.severed?.head) {
    // Голова смотрит прямо на игрока
    j.head.rotation.set(-0.75 + Math.abs(s) * 0.12, c * 0.15 + (e.tilt || 0), s * 0.08);
  }

  if (j.jaw) {
    j.jaw.rotation.x = -0.25 - Math.max(0, Math.sin(t * 8)) * 0.35;
  }

  // 2. Руки загребают по поверхности пола, не опускаясь ниже плоскости арены
  const hasLArm = !e.severed?.lArm;
  const hasRArm = !e.severed?.rArm;

  if (hasLArm && hasRArm) {
    // Левая рука: вынос вперед и гребок
    if (j.lShoulder) {
      const lReach = -1.15 - s * 0.45;
      j.lShoulder.rotation.set(lReach, 0.35 + c * 0.15, -0.35);
      if (j.lElbow) j.lElbow.rotation.set(-0.35 - Math.max(0, s) * 0.75, 0, 0);
    }
    // Правая рука: вынос вперед и гребок
    if (j.rShoulder) {
      if (isRogue) {
        const rReach = -1.15 + s * 0.5;
        j.rShoulder.rotation.set(rReach, -0.4 - c * 0.15, 0.45);
        if (j.rElbow) j.rElbow.rotation.set(-0.45 - Math.max(0, -s) * 0.8, 0, 0);
      } else {
        const rReach = -1.15 + s * 0.45;
        j.rShoulder.rotation.set(rReach, -0.35 - c * 0.15, 0.35);
        if (j.rElbow) j.rElbow.rotation.set(-0.35 - Math.max(0, -s) * 0.75, 0, 0);
      }
    }
  } else if (hasLArm && !hasRArm) {
    if (j.lShoulder) {
      j.lShoulder.rotation.set(-1.2 - s * 0.55, 0.4, -0.4);
      if (j.lElbow) j.lElbow.rotation.set(-0.35 - Math.max(0, s) * 0.85, 0, 0);
    }
    if (j.spine) j.spine.rotation.y = s * 0.45;
  } else if (!hasLArm && hasRArm) {
    if (j.rShoulder) {
      j.rShoulder.rotation.set(-1.2 + s * 0.55, -0.4, 0.4);
      if (j.rElbow) j.rElbow.rotation.set(-0.35 - Math.max(0, -s) * 0.85, 0, 0);
    }
    if (j.spine) j.spine.rotation.y = -s * 0.45;
  } else {
    // Без рук: извивание червем
    if (j.spine) j.spine.rotation.y = Math.sin(p * 1.8) * 0.75;
    if (j.chest) j.chest.rotation.y = Math.sin(p * 1.8 + 1.2) * 0.75;
  }

  // 3. Ноги волочатся горизонтально СЗАДИ по полу (Y >= 0.04m, не проваливаются)
  if (j.lHip && !e.severed?.lLeg) {
    j.lHip.rotation.set(-1.42, 0.15, 0.05);
    if (j.lKnee) j.lKnee.rotation.set(0.1, 0, 0);
  }
  if (j.rHip && !e.severed?.rLeg) {
    j.rHip.rotation.set(-1.42, -0.15, -0.05);
    if (j.rKnee) j.rKnee.rotation.set(0.1, 0, 0);
  }
}

// ============================================================================
// Анимация подъёма на ноги (Getup)
// ============================================================================
function poseGetup(e, dt, t, P, type) {
  resetJoints(e, type);
  const j = e.j;
  const p = Math.min(1, (e.getupT || 0) / (e.getupDur || 0.95));
  const k = p * p * (3 - 2 * p);

  const startY = 0.2;
  const targetY = BASE_PELVIS_Y[type] || 0.85;

  if (j.pelvis) {
    j.pelvis.position.set(0, toward(startY, targetY, k), 0);
    j.pelvis.rotation.set((1 - k) * 1.2, 0, (1 - k) * 0.2 * Math.sin(t * 12));
  }
  if (j.spine) {
    j.spine.rotation.set((1 - k) * 0.5 + k * P.hunch, 0, (1 - k) * 0.2 * Math.cos(t * 10));
  }
  if (j.head && !e.severed?.head) {
    j.head.rotation.set((1 - k) * -0.5, 0, 0);
  }

  // Руки упираются в пол и выпрямляются
  if (j.lShoulder && !e.severed?.lArm) {
    j.lShoulder.rotation.set(toward(-0.9, -0.45, k), 0, toward(-0.4, -0.15, k));
    if (j.lElbow) j.lElbow.rotation.set(toward(-1.2, -0.5, k), 0, 0);
  }
  if (j.rShoulder && !e.severed?.rArm) {
    j.rShoulder.rotation.set(toward(-0.9, -0.45, k), 0, toward(0.4, 0.15, k));
    if (j.rElbow) j.rElbow.rotation.set(toward(-1.2, -0.5, k), 0, 0);
  }

  // Ноги поджимаются и встают
  if (j.lHip && !e.severed?.lLeg) {
    j.lHip.rotation.set(toward(-0.8, -0.1, k), 0, 0);
    if (j.lKnee) j.lKnee.rotation.set(toward(1.1, 0.15, k), 0, 0);
  }
  if (j.rHip && !e.severed?.rLeg) {
    j.rHip.rotation.set(toward(-0.8, 0.1, k), 0, 0);
    if (j.rKnee) j.rKnee.rotation.set(toward(1.1, 0.15, k), 0, 0);
  }
}

// ============================================================================
// Поза агонии обезглавленного (Headless Rampage)
// ============================================================================
function poseHeadlessRampage(e, dt, t, P, type) {
  resetJoints(e, type);
  const j = e.j;
  e.phase += dt * (P.freq || 6.8) * 1.35;
  const p = e.phase;
  const s = Math.sin(p), c = Math.cos(p);
  const spasm = Math.sin(t * 24) * 0.35;

  // Ноги шатаются и заплетаются в слепой конвульсии
  if (j.lHip && !e.severed?.lLeg) {
    j.lHip.rotation.x = -s * (P.legAmp * 1.25) + spasm * 0.2;
    if (j.lKnee) j.lKnee.rotation.x = Math.max(0, -s) * (P.kneeAmp * 1.3) + 0.2;
  }
  if (j.rHip && !e.severed?.rLeg) {
    j.rHip.rotation.x = s * (P.legAmp * 1.25) - spasm * 0.2;
    if (j.rKnee) j.rKnee.rotation.x = Math.max(0, s) * (P.kneeAmp * 1.3) + 0.2;
  }

  // Руки судорожно молотят по воздуху
  if (j.lShoulder && !e.severed?.lArm) {
    j.lShoulder.rotation.set(-0.85 + Math.sin(t * 18) * 0.65, 0.35 + c * 0.25, -0.4 + spasm);
    if (j.lElbow) j.lElbow.rotation.set(-0.65 + Math.cos(t * 16) * 0.55, 0, 0);
  }
  if (j.rShoulder && !e.severed?.rArm) {
    j.rShoulder.rotation.set(-0.85 - Math.sin(t * 18) * 0.65, -0.35 - c * 0.25, 0.4 - spasm);
    if (j.rElbow) j.rElbow.rotation.set(-0.65 - Math.cos(t * 16) * 0.55, 0, 0);
  }

  // Торс дёргается и наклонён вперёд
  if (j.spine) {
    j.spine.rotation.set(0.42 + spasm * 0.25, s * 0.2, c * 0.2);
  }
  if (j.chest) {
    j.chest.rotation.set(0.12, -s * 0.15, -c * 0.15);
  }
  if (j.pelvis) {
    j.pelvis.position.y = (BASE_PELVIS_Y[type] || 0.85) + Math.abs(c) * (P.bob * 1.5) + spasm * 0.03;
  }
}

// ============================================================================
// Поза трупа
// ============================================================================
function poseCorpse(e, dt, t) {
  const j = e.j;
  const twitchAmt = Math.sin(t * 36) * 0.02;
  if (j.spine) j.spine.rotation.x += twitchAmt;
  if (j.head && !e.severed?.head) j.head.rotation.z += twitchAmt * 1.2;
}

function poseDeathSpawn(e, dt, t) {
  const j = e.j;
  const p = Math.min(1, e.animT / e.animDur);
  const deflate = 1 - p * 0.55;
  j.sac.scale.set(deflate, deflate * 1.12, deflate);
  e.root.scale.setScalar(1 - p * 0.4);
  for (let i = 0; i < j.tendrils.length; i++) {
    j.tendrils[i].rotation.x = 0.8 * p;
    j.tendrils[i].rotation.z = Math.sin(i * 2.1) * 0.7 * p;
  }
  j.tail.rotation.x = p * 0.9;
  j.mouth.scale.y = 1 + (1 - p) * 2;
}

function organs(e, dt, t) {
  const j = e.j;
  if (j.heartMesh) {
    const beat = Math.pow(Math.max(0, Math.sin(t * 7.5 + e.seed)), 10);
    const sc = 1 + beat * 0.45;
    j.heartMesh.scale.setScalar(sc);
  }
  if (j.belly) {
    const b = 1 + Math.sin(t * 1.8 + e.seed) * 0.035;
    j.belly.scale.set(1.12 * b, 1.15 * b, 1 * b);
  }
  if (j.maw && (e.state === 'chase' || e.state === 'crawl_chase')) {
    j.maw.rotation.x = -0.15 - (Math.sin(t * 2.4 + e.seed) + 1) * 0.12;
  }
}

// ============================================================================
// Главный вызов: poseMonster(e, dt, t)
// ============================================================================
export function poseMonster(e, dt, t) {
  const type = e.typeName || e.type || 'minion';

  if (type === 'mage') {
    if (e.state === 'dying' || e.state === 'corpse_ragdoll') {
      if (e.ragdoll && e.ragdoll.active) return;
      poseDeathSpawn(e, dt, t);
      return;
    }
    if (e.state === 'spawn') {
      const p = Math.min(1, e.animT / SPAWN_DUR);
      const k = 1 - Math.pow(1 - p, 3);
      e.root.scale.setScalar(0.5 + 0.5 * k);
    } else e.root.scale.setScalar(1);
    poseHover(e, dt, t);
    if (e.state === 'attack') poseCast(e, t);
    organs(e, dt, t);
    return;
  }

  // Если активен физический рэгдолл, скелет управляется физикой
  if (e.ragdoll && e.ragdoll.active && (e.state === 'knockdown' || e.state === 'corpse_ragdoll')) {
    poseCorpse(e, dt, t);
    organs(e, dt, t);
    return;
  }

  twitch(e, dt);
  organs(e, dt, t);
  const P = WALK[type] || WALK.minion;

  switch (e.state) {
    case 'spawn': poseSpawn(e, dt, t); break;
    case 'dummy_preview':
    case 'dummy_idle': poseIdle(e, dt, t, P, type); break;
    case 'dummy_walk':
    case 'patrol':
    case 'wander':
    case 'investigate':
    case 'chase': poseWalk(e, dt, t, P, type); break;
    case 'attack': poseAttack(e, t, P, type); break;
    case 'headless_rampage': poseHeadlessRampage(e, dt, t, P, type); break;
    case 'crawl_chase':
    case 'crawl_attack': poseCrawl(e, dt, t, P, type); break;
    case 'getup':
    case 'crawl_getup': poseGetup(e, dt, t, P, type); break;
    case 'corpse_ragdoll': poseCorpse(e, dt, t); break;
    case 'dying': poseDeath(e, dt, t); break;
    default: poseIdle(e, dt, t, P, type);
  }

  // Физический флинч от пуль к позвоночнику и груди
  if (e.flinchPitch || e.flinchRoll || e.flinchYaw) {
    if (e.j.spine) {
      e.j.spine.rotation.x += e.flinchPitch || 0;
      e.j.spine.rotation.z += e.flinchRoll || 0;
    }
    if (e.j.chest) {
      e.j.chest.rotation.y += e.flinchYaw || 0;
    }
    const dec = Math.max(0, 1 - dt * 14);
    e.flinchPitch = (e.flinchPitch || 0) * dec;
    e.flinchRoll = (e.flinchRoll || 0) * dec;
    e.flinchYaw = (e.flinchYaw || 0) * dec;
  }
}
