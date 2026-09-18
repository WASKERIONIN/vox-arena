import * as THREE from 'three';
import { rand } from './config.js';

// ============================================================================
// Процедурные твари в духе боди-хоррора.
// Никаких милых скелетов: мясо, рёбра, кости, светящиеся глаза,
// асимметрия и неестественные пропорции. Анимация — процедурная (суставы),
// с подёргиваниями и спазмами.
// Ориентация: тварь смотрит в +Z (група поворачивается к игроку в enemies.js).
// ============================================================================
const SPAWN_DUR = 0.9; // длительность анимации материализации

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

function addRibs(parent, M, cx, cy, cz, r, n, mat) {
  // дуги рёбер, открытые спереди (+Z)
  for (let i = 0; i < n; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.02, 4, 12, Math.PI * 1.45), mat);
    t.rotation.y = Math.PI * 0.275; // разрыв дуги вперёд
    t.position.set(0, cy + i * 0.09, 0);
    t.scale.set(1, 0.75, 1.15);
    parent.add(t);
  }
}

// глаз + мягкое свечение (читается издалека в PS1-разрешении)
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
    c.rotation.x = 0.5;
    c.rotation.z = -a * 0.7;
    hand.add(c);
  }
}

// ============================================================================
// 1) СКОРОХОД — худой безголовый бегун с видимым сердцем
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
  // обнажённые рёбра + позвоночник
  addRibs(chest, M, 0, 0.02, 0.1, 0.2, 4, M.bone);
  for (let i = 0; i < 5; i++) {
    const v = new THREE.Mesh(new THREE.SphereGeometry(0.028, 5, 4), M.bone);
    v.position.set(0, 0.05 + i * 0.07, -0.2);
    chest.add(v);
  }
  // сердце — бьётся (анимация в pose)
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
  // глаза — два жёлтых угасающих фонарика
  for (const sx of [-0.05, 0.05]) {
    addEye(head, M, tex, M.eyeYellow, sx, 0.035, 0.105, 0.026, 0xffd23a, 0.13);
  }
  // пасть: длинный сгусток, висящий ниже черепа
  const jaw = J(head, 0, -0.1, 0.06); j.jaw = jaw;
  const jm = new THREE.Mesh(jitter(new THREE.ConeGeometry(0.055, 0.16, 5), 0.012), M.maw);
  jm.position.y = -0.07; jm.rotation.x = 0.25; jaw.add(jm);

  // руки — слишком длинные, тонкие
  for (const s of [1, -1]) {
    const sh = J(chest, s * 0.24, 0.26, 0);
    if (s === 1) j.lShoulder = sh; else j.rShoulder = sh;
    const up = seg(sh, 0.34, 0.05, M.meat, { rx: s * 0.08 });
    const el = J(up, 0, -0.34, 0);
    if (s === 1) j.lElbow = el; else j.rElbow = el;
    const lo = seg(el, 0.34, 0.04, M.meatDark, { rx: -0.3 });
    const hand = J(lo, 0, -0.34, 0);
    if (s === 1) j.lHand = hand; else j.rHand = hand;
    addClaws(hand, M, 3, 0.1);
  }

  // ноги — тощие
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
// 2) РЕЗАК — сутулый мясник с костяным лезвием и одним глазом
// ============================================================================
function buildButcher(M, tex) {
  const root = new THREE.Group();
  const j = {};
  const mats = [M.meat, M.meatDark, M.meatPale, M.bone, M.maw];

  const pelvis = J(root, 0, 0.68, 0); j.pelvis = pelvis;
  const pb = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.17, 7, 5), 0.03), M.meat);
  pb.scale.set(1.15, 0.75, 0.95); pelvis.add(pb);

  const spine = J(pelvis, 0, 0.06, -0.02); j.spine = spine;
  spine.rotation.x = 0.55; // глубокий сутулость
  const sp = new THREE.Mesh(jitter(new THREE.CapsuleGeometry(0.12, 0.16, 2, 6), 0.02), M.meat);
  sp.position.y = 0.08; spine.add(sp);

  const chest = J(spine, 0, 0.18, 0); j.chest = chest;
  chest.rotation.x = 0.35;
  const ch = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.28, 8, 6), 0.04), M.meat);
  ch.scale.set(1.25, 0.85, 1); ch.position.y = 0.08; chest.add(ch);
  // рёбра торчат только слева — асимметрия
  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.26 + i * 0.012, 0.018, 4, 10, Math.PI * 1.2), M.bone);
    t.rotation.set(Math.PI / 2 - 0.35, 0.45 + i * 0.18, 0);
    t.position.set(-0.12, 0.0 + i * 0.08, 0.08);
    chest.add(t);
  }
  // позвоночник-шип на спине
  for (let i = 0; i < 4; i++) {
    const v = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 4), M.bone);
    v.position.set(0.02, 0.1 + i * 0.07, -0.24);
    v.rotation.x = -1.9;
    chest.add(v);
  }

  const neck = J(chest, 0, 0.2, 0.14); j.neck = neck;
  const head = J(neck, 0, 0.08, 0.05); j.head = head;
  head.rotation.x = 0.4;
  const hd = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.15, 7, 5), 0.025), M.meatDark);
  hd.scale.set(1.15, 0.75, 1.05); head.add(hd);
  // один глаз — красная щель; вторая глазница пустая
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.022, 0.03), M.eyeRed);
  eye.position.set(0.06, 0.02, 0.13); eye.rotation.y = 0.2; head.add(eye);
  const eyeGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex.glow, color: 0xff2a12, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  eyeGlow.position.set(0.06, 0.02, 0.135); eyeGlow.scale.set(0.2, 0.1, 1);
  head.add(eyeGlow);
  const sock = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), M.maw);
  sock.position.set(-0.06, 0.03, 0.12); head.add(sock);
  // пасть: обод из клыков
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

  // ПРАВАЯ рука — лезвие
  const rsh = J(chest, -0.3, 0.14, 0); j.rShoulder = rsh;
  const rup = seg(rsh, 0.26, 0.09, M.meat, { rx: -0.2, rz: 0.25 });
  const rel = J(rup, 0, -0.26, 0); j.rElbow = rel;
  // «предплечье» расширяется в кость-лезвие
  const blade = new THREE.Mesh(jitter(new THREE.ConeGeometry(0.085, 0.62, 4), 0.015), M.meatPale);
  blade.scale.set(1, 1, 0.3); blade.position.y = -0.28; blade.rotation.z = 0.15; rel.add(blade);
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.5, 0.012), M.eyeRed);
  seam.position.set(0.05, -0.3, 0.015); rel.add(seam); // светящийся шов
  j.rHand = J(rel, 0, -0.6, 0);

  // ЛЕВАЯ рука — исхудалая, таскается по земле
  const lsh = J(chest, 0.28, 0.12, 0); j.lShoulder = lsh;
  lsh.rotation.x = 0.55; lsh.rotation.z = -0.25;
  const lup = seg(lsh, 0.3, 0.045, M.meatDark, { rx: 0.25 });
  const lel = J(lup, 0, -0.3, 0); j.lElbow = lel;
  lel.rotation.x = 0.5;
  const llo = seg(lel, 0.34, 0.038, M.meatDark);
  const lhand = J(llo, 0, -0.34, 0); j.lHand = lhand;
  addClaws(lhand, M, 4, 0.12);

  // ноги: правая короче — хромота
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
  spine.rotation.x = 0.25;
  const chest = J(spine, 0, 0.28, 0); j.chest = chest;
  // огромное брюхо-торс
  const ch = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.52, 9, 7), 0.05), M.meat);
  ch.scale.set(1.12, 1.15, 1); ch.position.y = 0.1; chest.add(ch);
  j.belly = ch;
  // рёбра-перемычки поверх шкуры
  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 4, 14, Math.PI * 1.3), M.bone);
    t.rotation.set(Math.PI / 2, 0, 0);
    t.position.y = 0.3 + i * 0.12;
    t.scale.set(1.12, 1, 1);
    chest.add(t);
  }
  // пасть НА ГРУДИ: тёмный зев + челюсть с зубами
  const mawJ = J(chest, 0, 0.05, 0.42); j.maw = mawJ;
  const zew = new THREE.Mesh(new THREE.SphereGeometry(0.19, 7, 5), M.maw);
  zew.scale.set(1, 1.35, 0.5); mawJ.add(zew);
  // верхние зубы
  for (let i = 0; i < 8; i++) {
    const a = (i / 7 - 0.5) * 2.2;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 4), M.bone);
    tooth.position.set(Math.sin(a) * 0.14, 0.12, 0.12);
    tooth.rotation.x = Math.PI * 0.85;
    tooth.rotation.z = -a * 0.4;
    mawJ.add(tooth);
  }
  // нижняя челюсть — открывается
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

  // маленькая голова на толстой шее
  const neck = J(chest, 0, 0.62, 0.12); j.neck = neck;
  const nk = new THREE.Mesh(jitter(new THREE.CapsuleGeometry(0.1, 0.12, 2, 6), 0.02), M.meat);
  nk.position.y = 0.06; neck.add(nk);
  const head = J(neck, 0, 0.16, 0.06); j.head = head;
  const hd = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.13, 7, 5), 0.02), M.meatDark);
  hd.scale.set(1.1, 0.85, 1); head.add(hd);
  for (const sx of [-0.05, 0.05]) {
    addEye(head, M, tex, M.eyeRed, sx, 0.02, 0.115, 0.018, 0xff2a12, 0.11);
  }

  // короткие толстые руки с клешнями
  for (const s of [1, -1]) {
    const sh = J(chest, s * 0.55, 0.28, 0.08);
    if (s === 1) j.lShoulder = sh; else j.rShoulder = sh;
    sh.rotation.z = s * -0.35;
    const up = seg(sh, 0.3, 0.11, M.meat, { rz: s * -0.3 });
    const el = J(up, 0, -0.3, 0);
    if (s === 1) j.lElbow = el; else j.rElbow = el;
    el.rotation.x = -0.5;
    const lo = seg(el, 0.26, 0.09, M.meatDark);
    // клешня: два когтя
    const hand = J(lo, 0, -0.26, 0);
    if (s === 1) j.lHand = hand; else j.rHand = hand;
    const p1 = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 5), M.bone);
    p1.position.set(-0.055, -0.12, 0.03); p1.rotation.x = 0.35;
    const p2 = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 5), M.bone);
    p2.position.set(0.055, -0.12, 0.03); p2.rotation.x = 0.35;
    hand.add(p1, p2);
    if (s === 1) { j.pincerA = p1; j.pincerB = p2; }
  }

  // столбовидные ноги
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
// 4) ПЛОД — парящий паразит-мешок с усицами
// ============================================================================
function buildSpawn(M, tex) {
  const root = new THREE.Group();
  const j = {};
  const mats = [M.membrane, M.meatDark, M.eyeViolet, M.maw];

  // мешок
  const sacJ = J(root, 0, 1.32, 0); j.sac = sacJ;
  const sac = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.44, 10, 8), 0.05), M.membrane);
  sac.scale.set(1, 1.12, 1); sacJ.add(sac);
  j.sacMesh = sac;

  // три глаза треугольником
  const eyes = [[0, 0.1, 0.4], [-0.12, -0.02, 0.38], [0.12, -0.02, 0.38]];
  for (const [x, y, z] of eyes) {
    addEye(sacJ, M, tex, M.eyeViolet, x, y, z, 0.032, 0xc44dff, 0.16);
  }
  // рот-щель
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.04), M.maw);
  mouth.position.set(0, -0.14, 0.4); sacJ.add(mouth);
  j.mouth = mouth;

  // сросшийся «голос»-бугор
  const nub = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.11, 6, 5), 0.02), M.meatDark);
  nub.position.set(0, 0.42, 0.2); sacJ.add(nub);

  // усицы снизу — качаются
  j.tendrils = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const r = 0.12 + (i % 3) * 0.08;
    const t = J(sacJ, Math.cos(a) * r, -0.42, Math.sin(a) * r * 0.6);
    const len = 0.4 + Math.random() * 0.3;
    const c = new THREE.Mesh(jitter(new THREE.ConeGeometry(0.055, len, 5), 0.015), M.membrane);
    c.position.y = -len / 2;
    c.rotation.x = (Math.random() - 0.5) * 0.3;
    t.add(c);
    j.tendrils.push(t);
  }

  // хвост-шнурок с каплей
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
  return b; // { root, joints, mats }
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
  minion:  { freq: 9.5, legAmp: 0.85, armAmp: 1.05, kneeAmp: 0.9,  bob: 0.07, hunch: 0.35, armBase: 0.5,  elbow: 0.6 },
  rogue:   { freq: 7.2, legAmp: 0.6,  armAmp: 0.3,  kneeAmp: 0.8,  bob: 0.05, hunch: 0.2,  armBase: 0.15, elbow: 0.5 },
  warrior: { freq: 4.6, legAmp: 0.5,  armAmp: 0.45, kneeAmp: 0.6,  bob: 0.04, hunch: 0.15, armBase: -0.1, elbow: 0.3 },
};

function twitch(e, dt) {
  // случайные подёргивания и судороги
  e.twitch += (Math.random() - 0.5) * dt * 16;
  e.twitch *= Math.max(0, 1 - dt * 4);
  if (Math.random() < dt * 0.35) e.spasm = rand(0.35, 0.7);
  e.spasm = Math.max(0, e.spasm - dt * 2.2);
}

function poseWalk(e, dt, t, P) {
  const j = e.j;
  if (!e.staggerT) e.phase += dt * P.freq; // под ударом — замирает
  const p = e.phase;
  const s = Math.sin(p), c = Math.cos(p);
  const spasmAmp = e.spasm > 0 ? Math.sin(t * 42) * e.spasm : 0;

  // ноги
  if (j.lHip) {
    j.lHip.rotation.x = s * P.legAmp;
    j.rHip.rotation.x = -s * P.legAmp;
    j.lKnee.rotation.x = Math.max(0, -s) * P.kneeAmp + 0.2;
    j.rKnee.rotation.x = Math.max(0, s) * P.kneeAmp + 0.2;
    if (e.type === 'rogue') { j.rHip.rotation.x -= 0.3; j.rKnee.rotation.x += 0.5; } // хромота
  }
  // руки
  if (j.lShoulder && e.type !== 'rogue') {
    j.lShoulder.rotation.x = -s * P.armAmp + P.armBase;
    j.rShoulder.rotation.x = s * P.armAmp + P.armBase;
    j.lElbow.rotation.x = P.elbow + Math.max(0, s) * 0.35;
    j.rElbow.rotation.x = P.elbow + Math.max(0, -s) * 0.35;
  }
  if (e.type === 'rogue') {
    j.lShoulder.rotation.x = 0.55 + s * 0.12;
    j.rShoulder.rotation.x = -0.4 + s * 0.3;
    j.rElbow.rotation.x = -0.5 + c * 0.2;
  }
  // торс
  if (j.spine) {
    j.spine.rotation.x = P.hunch + s * 0.05 + spasmAmp * 0.35;
    j.spine.rotation.z = c * 0.05 + e.twist;
    j.chest.rotation.z = c * 0.08 + spasmAmp * 0.5;
  }
  if (j.head) {
    j.head.rotation.x = s * 0.07 + e.spasm * 0.3 * Math.sin(t * 30);
    j.head.rotation.z = c * 0.1 + e.tilt;
  }
  // взмахи ногами у скорехода — голова кивает сильно
  if (j.pelvis) e.root.position.y = e.baseY + c * P.bob + spasmAmp * 0.03;
}

function poseIdle(e, dt, t, P) {
  // почти то же, что walk, но медленнее и тише
  e.phase += dt * P.freq * 0.35;
  const s = Math.sin(e.phase * 0.7), c = Math.cos(e.phase * 0.7);
  const j = e.j;
  if (j.lHip) {
    j.lHip.rotation.x = toward(j.lHip.rotation.x, 0.15 + s * 0.08, 0.1);
    j.rHip.rotation.x = toward(j.rHip.rotation.x, -0.1 + c * 0.08, 0.1);
  }
  if (j.lShoulder && e.type !== 'rogue') {
    j.lShoulder.rotation.x = toward(j.lShoulder.rotation.x, P.armBase + s * 0.1, 0.08);
    j.rShoulder.rotation.x = toward(j.rShoulder.rotation.x, P.armBase - c * 0.1, 0.08);
  }
  if (j.chest) j.chest.rotation.z = toward(j.chest.rotation.z, Math.sin(t * 0.7 + e.seed) * 0.06 + e.spasm * 0.4 * Math.sin(t * 40), 0.1);
  if (j.head) {
    j.head.rotation.x = toward(j.head.rotation.x, Math.sin(t * 0.5 + e.seed) * 0.12, 0.06);
    j.head.rotation.z = toward(j.head.rotation.z, Math.sin(t * 0.33) * 0.12 + e.tilt, 0.06);
  }
}

function poseAttack(e, t, P) {
  const p = Math.min(1, e.animT / e.animDur);
  const j = e.j;
  if (e.type === 'minion') {
    // быстрый выпрям и колющий толчок двумя руками
    const k = kf(p, [[0, 0], [0.3, -1.1], [0.5, 1.25], [1, 0]]);
    j.lShoulder.rotation.x = k + 0.3;
    j.rShoulder.rotation.x = k + 0.3;
    j.lElbow.rotation.x = Math.abs(kf(p, [[0, 0.8], [0.3, 1.6], [0.5, 0.1], [1, 0.8]]));
    j.rElbow.rotation.x = j.lElbow.rotation.x;
    j.spine.rotation.x = 0.5 + kf(p, [[0, -0.3], [0.5, 0.7], [1, 0]]);
    j.head.rotation.x = 0.25 * (1 - p);
  } else if (e.type === 'rogue') {
    // широкий косой срез лезвием
    const wind = kf(p, [[0, 0.5], [0.4, 1.5], [0.6, -1.1], [1, 0.2]]);
    j.rShoulder.rotation.x = kf(p, [[0, -0.3], [0.4, -0.9], [0.6, 0.9], [1, 0]]);
    j.rShoulder.rotation.z = wind;
    j.rElbow.rotation.x = -0.5 + wind * 0.3;
    j.spine.rotation.z = -0.4 + wind * 0.5;
    j.lShoulder.rotation.x = 0.55;
  } else if (e.type === 'warrior') {
    // двойной удар клешнями сверху
    const k = kf(p, [[0, 0.2], [0.35, -1.9], [0.55, 1.0], [0.75, -0.3], [1, 0.15]]);
    j.lShoulder.rotation.x = k;
    j.rShoulder.rotation.x = k;
    j.lElbow.rotation.x = -0.5 + Math.max(0, k) * 0.6;
    j.rElbow.rotation.x = -0.5 + Math.max(0, k) * 0.6;
    // клешня раскрывается в замахе
    const open = kf(p, [[0, 0.15], [0.35, 0.5], [0.55, 0.05], [1, 0.15]]);
    if (j.pincerA) { j.pincerA.rotation.z = -open; j.pincerB.rotation.z = open; }
    j.spine.rotation.x = 0.3 + kf(p, [[0, 0.1], [0.35, -0.35], [0.55, 0.55], [1, 0]]);
    j.maw.rotation.x = kf(p, [[0, 0], [0.5, 0.7], [1, 0]]);
  }
}

function poseCast(e, t, P) {
  const p = Math.min(1, e.animT / e.animDur);
  const j = e.j;
  // мешок вытягивается, усицы поджимаются, рот раскрывается
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
  e.root.position.y = e.baseY + Math.sin(p) * 0.16;
  e.root.rotation.y += Math.sin(t * 0.5 + e.seed * 5) * dt * 0.3;
  const s = Math.sin(p * 0.9);
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
  e.root.position.y = e.baseY + (1 - k) * -e.T.height * 0.4;
  e.root.rotation.z = (1 - k) * Math.sin(t * 14) * 0.25;
}

function poseDeath(e, dt, t) {
  const j = e.j;
  const k = 1 - Math.exp(-dt * 6);
  const droop = Math.min(1, e.animT / 0.5);
  if (j.spine) {
    j.spine.rotation.x = toward(j.spine.rotation.x, 1.05 * droop + 0.3, k);
    j.chest.rotation.x = toward(j.chest.rotation.x || 0, 0.4 * droop, k);
    j.chest.rotation.z = toward(j.chest.rotation.z, 0.5 * droop, k * 0.5);
  }
  if (j.lHip) {
    j.lHip.rotation.x = toward(j.lHip.rotation.x, 0.5 * droop, k);
    j.rHip.rotation.x = toward(j.rHip.rotation.x, -0.2 * droop, k);
    j.lKnee.rotation.x = toward(j.lKnee.rotation.x, 1.2 * droop, k);
    j.rKnee.rotation.x = toward(j.rKnee.rotation.x, 0.7 * droop, k);
  }
  if (j.lShoulder) {
    j.lShoulder.rotation.x = toward(j.lShoulder.rotation.x, 1.1 * droop, k * 0.7);
    j.rShoulder.rotation.x = toward(j.rShoulder.rotation.x, -0.4 * droop, k * 0.7);
    j.lShoulder.rotation.z = toward(j.lShoulder.rotation.z, 0.6 * droop, k * 0.7);
    j.rShoulder.rotation.z = toward(j.rShoulder.rotation.z, -0.8 * droop, k * 0.7);
  }
  if (j.head) j.head.rotation.x = toward(j.head.rotation.x, 0.7 * droop, k);
  const p = Math.min(1, e.animT / e.animDur);
  e.root.position.y = e.baseY - p * 0.3;
  e.root.rotation.x = p * 0.35;
}

// особые «органы»: сердце скорехода, брюхо клеща, пасть
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
  if (j.maw && e.state === 'chase') {
    // жует, пока ползёт
    j.maw.rotation.x = (Math.sin(t * 2.4 + e.seed) + 1) * 0.12;
  }
}

function poseDeathSpawn(e, dt, t) {
  // мешок сдувается, тонет, усицы рассыпаются
  const j = e.j;
  const p = Math.min(1, e.animT / e.animDur);
  const deflate = 1 - p * 0.55;
  j.sac.scale.set(deflate, deflate * 1.12, deflate);
  e.root.scale.setScalar(1 - p * 0.4);
  e.root.position.y = e.baseY - p * 0.9;
  e.root.rotation.z = p * 0.5;
  for (let i = 0; i < j.tendrils.length; i++) {
    j.tendrils[i].rotation.x = 0.8 * p;
    j.tendrils[i].rotation.z = Math.sin(i * 2.1) * 0.7 * p;
  }
  j.tail.rotation.x = p * 0.9;
  j.mouth.scale.y = 1 + (1 - p) * 2;
}

// ============================================================================
// Главный вызов: poseMonster(e, dt, t)
// e: { type, state, j (joints), root, baseY, T, animT, animDur, phase, seed,
//      twitch, spasm, twist, tilt, staggerT }
// ============================================================================
export function poseMonster(e, dt, t) {
  if (e.type === 'mage') {
    if (e.state === 'dying') { poseDeathSpawn(e, dt, t); return; }
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
  twitch(e, dt);
  organs(e, dt, t);
  const P = WALK[e.type] || WALK.minion;
  switch (e.state) {
    case 'spawn': poseSpawn(e, dt, t); break;
    case 'chase': poseWalk(e, dt, t, P); break;
    case 'attack': poseAttack(e, t, P); break;
    case 'dying': poseDeath(e, dt, t); break;
    default: poseIdle(e, dt, t, P);
  }
}
