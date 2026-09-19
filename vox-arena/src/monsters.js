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
  zombie: 0.82,
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

// Геометрия шипа / когтя / клыка / лезвия:
// Основание на Y = 0 (укоренено в плоти), остриё направлено по -Y на расстояние -len (торчит наружу)
function makeSpikeGeo(radius, len, radialSegments = 4) {
  const g = new THREE.ConeGeometry(radius, len, radialSegments);
  // В Three.js вершина (остриё) на +len/2, основание на -len/2.
  // Переворачиваем чтобы остриё смотрело вдоль -Y (наружу):
  g.rotateX(Math.PI);
  // Сдвигаем так, чтобы основание находилось в начале координат (Y = 0):
  g.translate(0, -len / 2, 0);
  return g;
}

// Геометрия шипа, направленного вдоль +Z (вперед из тела):
function makeSpikeForwardGeo(radius, len, radialSegments = 4) {
  const g = new THREE.ConeGeometry(radius, len, radialSegments);
  g.rotateX(Math.PI / 2); // Остриё направлено в +Z
  g.translate(0, 0, len / 2); // Основание на Z = 0
  return g;
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
  const meatRot = new THREE.MeshLambertMaterial({ map: tex.flesh, color: 0x6e7e60, flatShading: true }); // Гнилостная зеленоватая плоть зомби
  const fleshRancid = new THREE.MeshLambertMaterial({ map: tex.flesh, color: 0x48322e, flatShading: true });
  const bone = new THREE.MeshLambertMaterial({ color: 0xb9ad93, flatShading: true });
  const boneDirty = new THREE.MeshLambertMaterial({ color: 0x8a8270, flatShading: true });
  const maw = new THREE.MeshLambertMaterial({ color: 0x160709, flatShading: true });
  const membrane = new THREE.MeshLambertMaterial({ map: tex.membrane, flatShading: true });
  const eyeYellow = new THREE.MeshBasicMaterial({ color: 0xffd23a });
  const eyeRed = new THREE.MeshBasicMaterial({ color: 0xff2a12 });
  const eyeViolet = new THREE.MeshBasicMaterial({ color: 0xc44dff });
  const eyeCataract = new THREE.MeshBasicMaterial({ color: 0xd8e4c8 }); // Бельмо мертвого глаза
  const heart = new THREE.MeshBasicMaterial({ color: 0xff1e10 });
  return { meat, meatDark, meatPale, meatRot, fleshRancid, bone, boneDirty, maw, membrane, eyeYellow, eyeRed, eyeViolet, eyeCataract, heart };
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
    // Остриё когтей направлено наружу от кисти руки вперед-вниз
    const c = new THREE.Mesh(makeSpikeGeo(0.018, len, 4), M.bone);
    c.position.set(Math.sin(a) * 0.03, -0.01, Math.cos(a) * 0.02 + 0.02);
    c.rotation.x = -0.45;
    c.rotation.z = -a * 0.5;
    hand.add(c);
  }
}

// ============================================================================
// 0) ЗОМБИ / УПЫРЬ — медленный гниющий труп с перекошенной шеей,
// тянущейся рукой и волочащейся ногой (без торчащих рёбер)
// ============================================================================
function buildZombie(M, tex) {
  const root = new THREE.Group();
  const j = {};
  const mats = [M.meatRot, M.fleshRancid, M.meatDark, M.boneDirty, M.maw];

  // Устойчивый анатомический таз
  const pelvis = J(root, 0, 0.82, 0); j.pelvis = pelvis;
  const pb = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.18, 7, 5), 0.03), M.meatRot);
  pb.scale.set(1.1, 0.85, 0.95); pelvis.add(pb);

  // Сгорбленный вперед позвоночник (минимальный боковой наклон для естественного баланса массы)
  const spine = J(pelvis, 0, 0.08, -0.02); j.spine = spine;
  const sp = new THREE.Mesh(jitter(new THREE.CapsuleGeometry(0.11, 0.2, 2, 6), 0.02), M.fleshRancid);
  sp.position.y = 0.1; spine.add(sp);

  // Гниющий торс без рёбер (разлагающаяся плоть и волокна мышц)
  const chest = J(spine, 0, 0.22, 0); j.chest = chest;
  const ch = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.26, 8, 6), 0.04), M.meatRot);
  ch.scale.set(1.08, 1.25, 0.9); ch.position.y = 0.1; chest.add(ch);

  // Тёмные разорванные волокна и обнаженные гниющие внутренности (без ребер!)
  const guts = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), M.fleshRancid);
  guts.scale.set(1.15, 0.85, 0.95); guts.position.set(0.02, 0.03, 0.13); chest.add(guts);
  const sinew = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.04), M.maw);
  sinew.position.set(-0.06, 0.08, 0.14); sinew.rotation.z = 0.35; chest.add(sinew);

  // ========================================================================
  // Перекошенная сломанная шея и наклон головы (кривой шейный позвонок)
  // ========================================================================
  const neck = J(chest, 0.04, 0.32, 0.03); j.neck = neck;
  neck.rotation.set(-0.15, 0.12, 0.38); // Анатомический вывих шеи
  const nk = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.12, 2, 6), M.fleshRancid);
  nk.position.y = 0.06; neck.add(nk);

  const head = J(neck, 0, 0.13, 0.02); j.head = head;
  head.rotation.set(0.14, -0.08, 0.24); // Наклон головы
  const hd = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.14, 7, 5), 0.025), M.meatRot);
  hd.scale.set(0.9, 1.15, 1.0); head.add(hd);

  // Глаза: слева — пустая темная впадина, справа — мутное бельмо мертвого глаза
  const eyeLeftHole = new THREE.Mesh(new THREE.SphereGeometry(0.032, 5, 4), M.maw);
  eyeLeftHole.position.set(-0.045, 0.025, 0.12); head.add(eyeLeftHole);

  addEye(head, M, tex, M.eyeCataract, 0.045, 0.025, 0.12, 0.025, 0xd0e8b8, 0.12);

  // Отвисшая, криво болтающаяся челюсть
  const jaw = J(head, 0, -0.09, 0.06); j.jaw = jaw;
  jaw.rotation.set(-0.4, 0.15, 0.18);
  const jm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.1), M.maw);
  jm.position.set(0, -0.02, 0.02); jaw.add(jm);
  for (let i = 0; i < 4; i++) {
    const a = (i / 3 - 0.5) * 1.4;
    const tooth = new THREE.Mesh(makeSpikeGeo(0.012, 0.045, 4), M.boneDirty);
    tooth.position.set(Math.sin(a) * 0.04, -0.01, Math.cos(a) * 0.02 + 0.04);
    tooth.rotation.x = 2.6;
    jaw.add(tooth);
  }

  // ========================================================================
  // Руки: Левая рука — вытянута ВПЕРЕД и жадно тянется к игроку;
  //       Правая рука — вывихнута, безжизненно свисает
  // ========================================================================
  // Левая рука (тянущаяся вперед)
  const lsh = J(chest, 0.26, 0.22, 0.04); j.lShoulder = lsh;
  lsh.rotation.set(-1.25, 0.15, -0.1);
  const lup = seg(lsh, 0.32, 0.048, M.meatRot);
  const lel = J(lup, 0, -0.32, 0); j.lElbow = lel;
  lel.rotation.set(-0.22, 0, 0);
  const llo = seg(lel, 0.32, 0.042, M.fleshRancid);
  const lhand = J(llo, 0, -0.32, 0); j.lHand = lhand;
  addClaws(lhand, M, 4, 0.08);

  // Правая рука (свисшая, вывихнутая)
  const rsh = J(chest, -0.26, 0.18, -0.02); j.rShoulder = rsh;
  rsh.rotation.set(0.12, -0.1, 0.35);
  const rup = seg(rsh, 0.30, 0.045, M.fleshRancid);
  const rel = J(rup, 0, -0.30, 0); j.rElbow = rel;
  rel.rotation.set(0.25, 0, 0);
  const rlo = seg(rel, 0.30, 0.038, M.meatRot);
  const rhand = J(rlo, 0, -0.30, 0); j.rHand = rhand;
  addClaws(rhand, M, 3, 0.07);

  // ========================================================================
  // Ноги: Левая — опорная (шагает), Правая — поврежденная (волочится сзади)
  // ========================================================================
  // Левая нога (шагающая)
  const lhip = J(pelvis, 0.12, -0.05, 0); j.lHip = lhip;
  const lth = seg(lhip, 0.38, 0.065, M.meatRot);
  const lkn = J(lth, 0, -0.38, 0); j.lKnee = lkn;
  const lsh2 = seg(lkn, 0.36, 0.052, M.fleshRancid);
  const lft = J(lsh2, 0, -0.36, 0); j.lFoot = lft;
  const lfoot = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.08, 6, 4), 0.015), M.maw);
  lfoot.scale.set(0.85, 0.45, 1.4); lfoot.position.set(0, -0.04, 0.05); lft.add(lfoot);

  // Правая нога (поврежденная — волочится)
  const rhip = J(pelvis, -0.12, -0.05, 0); j.rHip = rhip;
  rhip.rotation.set(0.35, -0.15, 0.1);
  const rth = seg(rhip, 0.38, 0.065, M.fleshRancid);
  const rkn = J(rth, 0, -0.38, 0); j.rKnee = rkn;
  rkn.rotation.set(0.08, 0, 0);
  const rsh2 = seg(rkn, 0.36, 0.052, M.meatRot);
  const rft = J(rsh2, 0, -0.36, 0); j.rFoot = rft;
  rft.rotation.set(0.18, 0.2, -0.08);
  const rfoot = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.08, 6, 4), 0.015), M.maw);
  rfoot.scale.set(0.85, 0.45, 1.4); rfoot.position.set(0, -0.04, 0.05); rft.add(rfoot);

  return { root, joints: j, mats };
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
  const jm = new THREE.Mesh(jitter(makeSpikeGeo(0.055, 0.16, 5), 0.012), M.maw);
  jm.position.set(0, 0, 0.02); jm.rotation.x = -0.35; jaw.add(jm);
  for (let i = 0; i < 4; i++) {
    const a = (i / 3 - 0.5) * 1.2;
    const t = new THREE.Mesh(makeSpikeGeo(0.012, 0.04, 4), M.bone);
    t.position.set(Math.sin(a) * 0.04, -0.02, 0.06);
    t.rotation.x = -0.5;
    t.rotation.z = -a * 0.4;
    jaw.add(t);
  }

  // Руки — вытянуты вперёд к жертве + шипы на предплечьях
  for (const s of [1, -1]) {
    const sh = J(chest, s * 0.24, 0.26, 0);
    if (s === 1) j.lShoulder = sh; else j.rShoulder = sh;
    const up = seg(sh, 0.34, 0.05, M.meat);
    const el = J(up, 0, -0.34, 0);
    if (s === 1) j.lElbow = el; else j.rElbow = el;
    const lo = seg(el, 0.34, 0.04, M.meatDark);

    // Шипы на локтях (остриё торчит наружу из руки)
    for (let k = 0; k < 2; k++) {
      const spk = new THREE.Mesh(makeSpikeGeo(0.018, 0.09, 4), M.bone);
      spk.position.set(s * 0.04, -0.12 - k * 0.1, -0.02);
      spk.rotation.z = s * 1.35; // остриё смотрит вбок наружу
      spk.rotation.x = 0.3;
      lo.add(spk);
    }

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
    // Шипы на спине (остриё торчит наружу из спины назад)
    const v = new THREE.Mesh(makeSpikeGeo(0.03, 0.11, 4), M.bone);
    v.position.set(0.02, 0.1 + i * 0.07, -0.24);
    v.rotation.x = 1.35; // остриё смотрит назад и чуть вверх
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
    // Зубы челюсти: остриё торчит вверх-вперед
    const tooth = new THREE.Mesh(makeSpikeGeo(0.016, 0.06, 4), M.bone);
    tooth.position.set(Math.sin(a) * 0.07, -0.01, Math.cos(a) * 0.015 + 0.02);
    tooth.rotation.x = 2.8; // остриё вверх-вперед
    tooth.rotation.z = -a * 0.3;
    jaw.add(tooth);
  }

  // Правая рука — длинное костяное лезвие (остриё торчит наружу из локтя)
  const rsh = J(chest, -0.3, 0.14, 0); j.rShoulder = rsh;
  const rup = seg(rsh, 0.26, 0.09, M.meat);
  const rel = J(rup, 0, -0.26, 0); j.rElbow = rel;

  // Остриё лезвия смотрит прямо вперед-вниз от локтя наружу:
  const blade = new THREE.Mesh(jitter(makeSpikeGeo(0.09, 0.64, 4), 0.015), M.meatPale);
  blade.scale.set(1, 1, 0.35); blade.rotation.z = 0.12; rel.add(blade);

  // Боковые шипы вдоль лезвия и локтя (остриё наружу)
  for (let k = 0; k < 3; k++) {
    const spk = new THREE.Mesh(makeSpikeGeo(0.022, 0.1, 4), M.bone);
    spk.position.set(-0.06, -0.15 - k * 0.14, 0.01);
    spk.rotation.z = -1.45; // торчит наружу влево
    rel.add(spk);
  }

  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.5, 0.012), M.eyeRed);
  seam.position.set(0.05, -0.3, 0.015); rel.add(seam);
  j.rHand = J(rel, 0, -0.6, 0);

  // Левая рука — когти + шипы на плече
  const lsh = J(chest, 0.28, 0.12, 0); j.lShoulder = lsh;
  const lup = seg(lsh, 0.3, 0.045, M.meatDark);
  // Шип на левом плече
  const shSpike = new THREE.Mesh(makeSpikeGeo(0.025, 0.12, 4), M.bone);
  shSpike.position.set(0.06, 0, 0); shSpike.rotation.z = 1.35; lup.add(shSpike);

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
// 3) КЛЕЩ — раздутый громила с пастью на животе
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

  // Рёбра на верхней части груди
  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 4, 14, Math.PI * 1.3), M.bone);
    t.rotation.set(Math.PI / 2, 0, 0);
    t.position.y = 0.3 + i * 0.12;
    t.scale.set(1.12, 1, 1);
    chest.add(t);
  }

  // ========================================================================
  // Пасть на животе: расположена прямо по центру выпирающего брюха
  // ========================================================================
  const bellyMaw = J(chest, 0, -0.06, 0.46); j.maw = bellyMaw;

  // Тёмная глотка внутри брюха
  const throat = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 5), M.maw);
  throat.scale.set(1.2, 0.9, 0.6); throat.position.set(0, 0, -0.04); bellyMaw.add(throat);

  // Мясистые губы вокруг пасти живота
  const lips = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.045, 5, 12), M.meatDark);
  lips.scale.set(1.25, 0.85, 1); lips.position.set(0, 0, 0.04); bellyMaw.add(lips);

  // Верхний ряд зубов пасти живота: основание сверху, острия торчат ВНИЗ и НАРУЖУ
  for (let i = 0; i < 7; i++) {
    const a = (i / 6 - 0.5) * 2.2;
    const tooth = new THREE.Mesh(makeSpikeGeo(0.024, 0.09, 4), M.bone);
    tooth.position.set(Math.sin(a) * 0.22, 0.14, Math.cos(a) * 0.04 + 0.04);
    tooth.rotation.x = 0.35; // остриё смотрит вниз-вперед наружу
    tooth.rotation.z = -a * 0.3;
    bellyMaw.add(tooth);
  }

  // Нижняя подвижная челюсть пасти живота
  const lowerBellyJaw = J(bellyMaw, 0, -0.16, 0.04); j.jaw = lowerBellyJaw;
  const lowerRim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 4, 10, Math.PI * 1.1), M.meatDark);
  lowerRim.rotation.x = Math.PI * 0.5; lowerRim.position.set(0, -0.02, 0.02); lowerBellyJaw.add(lowerRim);

  // Нижний ряд зубов пасти живота: основание снизу, острия торчат ВВЕРХ и НАРУЖУ
  for (let i = 0; i < 6; i++) {
    const a = (i / 5 - 0.5) * 1.9;
    const tooth = new THREE.Mesh(makeSpikeGeo(0.022, 0.08, 4), M.bone);
    tooth.position.set(Math.sin(a) * 0.18, -0.02, Math.cos(a) * 0.03 + 0.04);
    tooth.rotation.x = 2.8; // остриё смотрит вверх-вперед наружу!
    tooth.rotation.z = -a * 0.25;
    lowerBellyJaw.add(tooth);
  }

  // Шея и голова
  const neck = J(chest, 0, 0.62, 0.12); j.neck = neck;
  const nk = new THREE.Mesh(jitter(new THREE.CapsuleGeometry(0.1, 0.12, 2, 6), 0.02), M.meat);
  nk.position.y = 0.06; neck.add(nk);
  const head = J(neck, 0, 0.16, 0.06); j.head = head;
  const hd = new THREE.Mesh(jitter(new THREE.SphereGeometry(0.13, 7, 5), 0.02), M.meatDark);
  hd.scale.set(1.1, 0.85, 1); head.add(hd);
  for (const sx of [-0.05, 0.05]) {
    addEye(head, M, tex, M.eyeRed, sx, 0.02, 0.115, 0.018, 0xff2a12, 0.11);
  }

  // Рога / шипы на голове (остриё торчит вверх-наружу)
  for (const sx of [-0.07, 0.07]) {
    const horn = new THREE.Mesh(makeSpikeGeo(0.025, 0.14, 4), M.bone);
    horn.position.set(sx, 0.09, 0.02);
    horn.rotation.z = (sx > 0 ? -1 : 1) * 2.5; // остриё вверх и наружу
    horn.rotation.x = 0.3;
    head.add(horn);
  }

  // ========================================================================
  // Мощные руки с шипами и клешнями (острия торчат строго наружу)
  // ========================================================================
  for (const s of [1, -1]) {
    const sh = J(chest, s * 0.55, 0.28, 0.08);
    if (s === 1) j.lShoulder = sh; else j.rShoulder = sh;
    const up = seg(sh, 0.3, 0.11, M.meat);

    // Большие шипы на плечах (остриё торчит вверх и вбок наружу)
    const shHorn = new THREE.Mesh(makeSpikeGeo(0.038, 0.18, 4), M.bone);
    shHorn.position.set(s * 0.1, 0.04, 0);
    shHorn.rotation.z = s * 1.6; // остриё наружу
    shHorn.rotation.x = -0.3;
    up.add(shHorn);

    const el = J(up, 0, -0.3, 0);
    if (s === 1) j.lElbow = el; else j.rElbow = el;
    const lo = seg(el, 0.26, 0.09, M.meatDark);

    // Шипы на локтях / предплечьях (остриё смотрит наружу вбок)
    for (let k = 0; k < 3; k++) {
      const spk = new THREE.Mesh(makeSpikeGeo(0.026, 0.12, 4), M.bone);
      spk.position.set(s * 0.08, -0.06 - k * 0.08, -0.02);
      spk.rotation.z = s * 1.45; // остриё торчит наружу из руки!
      spk.rotation.x = 0.2;
      lo.add(spk);
    }

    const hand = J(lo, 0, -0.26, 0);
    if (s === 1) j.lHand = hand; else j.rHand = hand;

    // Клешни / шипы-хваты: основание в руке (Y = 0), остриё смотрит вперед-наружу (Y = -0.3)
    const p1 = new THREE.Mesh(makeSpikeGeo(0.045, 0.32, 5), M.bone);
    p1.position.set(-0.05, 0, 0.03); p1.rotation.x = -0.35; p1.rotation.z = 0.15;
    const p2 = new THREE.Mesh(makeSpikeGeo(0.045, 0.32, 5), M.bone);
    p2.position.set(0.05, 0, 0.03); p2.rotation.x = -0.35; p2.rotation.z = -0.15;
    hand.add(p1, p2);
    if (s === 1) { j.pincerA = p1; j.pincerB = p2; }
  }

  for (const s of [1, -1]) {
    const hip = J(pelvis, s * 0.24, -0.1, 0);
    if (s === 1) j.lHip = hip; else j.rHip = hip;
    const th = seg(hip, 0.42, 0.13, M.meat);

    // Шип на бедре
    const thighSpk = new THREE.Mesh(makeSpikeGeo(0.03, 0.12, 4), M.bone);
    thighSpk.position.set(s * 0.12, -0.18, 0);
    thighSpk.rotation.z = s * 1.4;
    th.add(thighSpk);

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
    // Остриё щупалец направлено вниз наружу
    const c = new THREE.Mesh(jitter(makeSpikeGeo(0.055, len, 5), 0.015), M.membrane);
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
const BUILDERS = { zombie: buildZombie, minion: buildRunner, rogue: buildButcher, warrior: buildBrute, mage: buildSpawn };

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
  zombie:  { freq: 3.2, legAmp: 0.55, armAmp: 0.35, kneeAmp: 0.55, bob: 0.05, hunch: 0.35 },
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

  // Точная синхронизация шага со скоростью перемещения для исключения проскальзывания ног
  if (!e.staggerT) {
    if (type === 'zombie') {
      // Длина шага 0.72м: фаза шага продвигается строго пропорционально пройденному расстоянию
      const zSpeed = e.speed || 1.85;
      e.phase += (zSpeed / 0.72) * Math.PI * dt;
    } else {
      const moveScale = Math.max(0.4, (e.speed || 4.8) / 4.8);
      e.phase += dt * P.freq * moveScale;
    }
  }

  const p = e.phase;
  const s = Math.sin(p), c = Math.cos(p);
  const spasmAmp = e.spasm > 0 ? Math.sin(t * 36) * e.spasm : 0;

  // 1. Ноги — шаг вперед (+Z) и толчок назад (-Z)
  if (type === 'zombie') {
    // Вальяжная хромающая походка зомби:
    // Левая нога: честный шаг вперед и толчок
    if (j.lHip && !e.severed?.lLeg) {
      j.lHip.rotation.x = -s * 0.52;
      if (j.lKnee) j.lKnee.rotation.x = Math.max(0, -s) * 0.65;
    }
    // Правая нога: повреждена, волочится сзади с минимальным сгибом
    if (j.rHip && !e.severed?.rLeg) {
      j.rHip.rotation.set(0.32 + Math.max(0, s) * 0.12, -0.15, 0.08);
      if (j.rKnee) j.rKnee.rotation.x = 0.06;
    }
  } else {
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
  }

  // 2. Руки — вытянуты ВПЕРЁД (отрицательный pitch по оси X), тянутся к игроку
  if (type === 'zombie') {
    // Левая рука тянется прямо к игроку
    if (j.lShoulder && !e.severed?.lArm) {
      j.lShoulder.rotation.set(-1.25 + Math.sin(t * 4) * 0.06, 0.15 + s * 0.05, -0.1);
      if (j.lElbow) j.lElbow.rotation.set(-0.22 + Math.cos(t * 5) * 0.08, 0, 0);
    }
    // Правая рука свисает вывихнутой и естественно покачивается
    if (j.rShoulder && !e.severed?.rArm) {
      j.rShoulder.rotation.set(0.12 + c * 0.18, -0.1, 0.35 + s * 0.06);
      if (j.rElbow) j.rElbow.rotation.set(0.25 + Math.sin(t * 3) * 0.05, 0, 0);
    }
  } else if (type === 'rogue') {
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
  if (type === 'zombie') {
    if (j.spine) {
      // Реалистичный наклон вперед с минимальным покачиванием (без завала вбок!)
      j.spine.rotation.set(0.28 + s * 0.03, s * 0.05, 0.03 + c * 0.04);
    }
    if (j.neck) {
      j.neck.rotation.set(-0.15, 0.12, 0.38 + spasmAmp * 0.15);
    }
    if (j.head && !e.severed?.head) {
      j.head.rotation.set(0.14 + s * 0.04, -0.08, 0.24 + Math.sin(t * 3) * 0.04);
    }
    if (j.jaw) {
      j.jaw.rotation.set(-0.4 + Math.sin(t * 3) * 0.06, 0.15, 0.18);
    }
    if (j.pelvis) {
      j.pelvis.position.y = 0.82 + Math.abs(c) * 0.025;
      j.pelvis.rotation.z = -c * 0.03;
    }
  } else {
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
}

function poseIdle(e, dt, t, P, type) {
  resetJoints(e, type);
  e.phase += dt * P.freq * 0.3;
  const s = Math.sin(e.phase * 0.7), c = Math.cos(e.phase * 0.7);
  const j = e.j;

  if (type === 'zombie') {
    if (j.lHip && !e.severed?.lLeg) j.lHip.rotation.x = -0.1 + s * 0.03;
    if (j.rHip && !e.severed?.rLeg) j.rHip.rotation.set(0.35, -0.25, 0.22);
    if (j.lShoulder && !e.severed?.lArm) j.lShoulder.rotation.set(-1.2 + s * 0.05, 0.25, -0.15);
    if (j.rShoulder && !e.severed?.rArm) j.rShoulder.rotation.set(0.15 + c * 0.08, -0.15, 0.45);
    if (j.neck) j.neck.rotation.set(-0.25, 0.2, 0.52);
    if (j.head && !e.severed?.head) j.head.rotation.set(0.22, -0.15, 0.35 + Math.sin(t * 1.5) * 0.05);
    if (j.jaw) j.jaw.rotation.set(-0.4 + Math.sin(t * 2) * 0.08, 0.15, 0.18);
    if (j.spine) j.spine.rotation.set(0.35, 0, 0.15 + s * 0.04);
    if (j.pelvis) j.pelvis.position.y = 0.82;
    return;
  }

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

  if (type === 'zombie') {
    // Зомби делает яростный выпад тянущейся рукой и пытается вцепиться челюстью
    const lunge = kf(p, [[0, -1.2], [0.35, -1.55], [0.55, -0.9], [1, -1.2]]);
    if (j.lShoulder && !e.severed?.lArm) {
      j.lShoulder.rotation.set(lunge, 0.2, -0.2);
      if (j.lElbow) j.lElbow.rotation.set(Math.abs(lunge) * 0.4 - 0.5, 0, 0);
    }
    if (j.rShoulder && !e.severed?.rArm) {
      j.rShoulder.rotation.set(0.2, -0.2, 0.5);
    }
    const bite = kf(p, [[0, -0.4], [0.4, -0.85], [0.6, -0.2], [1, -0.4]]);
    if (j.jaw) j.jaw.rotation.set(bite, 0.15, 0.18);
    if (j.neck) j.neck.rotation.set(-0.35, 0.2, 0.52);
    if (j.spine) j.spine.rotation.set(0.45 + kf(p, [[0, 0], [0.4, 0.35], [1, 0]]), 0, 0.15);
  } else if (type === 'minion') {
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
  const isZombie = (type === 'zombie');

  const crawlFreq = isZombie ? 2.4 : (P.freq * 0.75);
  e.phase += dt * crawlFreq;
  const p = e.phase;
  const s = Math.sin(p), c = Math.cos(p);
  const spasmAmp = e.spasm > 0 ? Math.sin(t * 36) * e.spasm : 0;

  // 1. Позиция таза и подъем груди на локтях/руках
  const pelvisY = isWarrior ? 0.28 : (isZombie ? 0.18 : 0.20);
  e.root.position.set(0, 0, 0);

  if (j.pelvis) {
    j.pelvis.position.set(0, pelvisY + Math.abs(s) * 0.02, 0);
    j.pelvis.rotation.set(1.42, s * 0.12, c * 0.08);
  }

  if (j.spine) {
    // Позвоночник плавно выгибается вверх
    if (isZombie) {
      j.spine.rotation.set(-0.12 + c * 0.03, s * 0.2, 0.04 + spasmAmp * 0.15);
    } else {
      j.spine.rotation.set(-0.15 + c * 0.04, s * 0.3, -c * 0.18 + spasmAmp * 0.2);
    }
  }

  if (j.chest) {
    // Грудь приподнята над полом на руках
    j.chest.rotation.set(-0.2, s * 0.18, -c * 0.16);
  }

  if (j.neck) {
    if (isZombie) {
      j.neck.rotation.set(-0.65, 0.12, 0.35 + spasmAmp * 0.1);
    } else {
      j.neck.rotation.set(-0.75, 0, 0);
    }
  }

  if (j.head && !e.severed?.head) {
    // Голова смотрит прямо на игрока
    if (isZombie) {
      j.head.rotation.set(-0.68 + Math.abs(s) * 0.08, -0.08 + (e.tilt || 0), 0.22 + s * 0.06);
    } else {
      j.head.rotation.set(-0.75 + Math.abs(s) * 0.12, c * 0.15 + (e.tilt || 0), s * 0.08);
    }
  }

  if (j.jaw) {
    if (isZombie) {
      j.jaw.rotation.set(-0.35 - Math.max(0, Math.sin(t * 6)) * 0.25, 0.15, 0.18);
    } else {
      j.jaw.rotation.x = -0.25 - Math.max(0, Math.sin(t * 8)) * 0.35;
    }
  }

  // 2. Руки загребают по поверхности пола, не опускаясь ниже плоскости арены
  const hasLArm = !e.severed?.lArm;
  const hasRArm = !e.severed?.rArm;

  if (isZombie) {
    // У зомби левая рука — основная загребающая, правая — слабая/вывихнутая
    if (hasLArm && hasRArm) {
      if (j.lShoulder) {
        const lReach = -1.25 - s * 0.45;
        j.lShoulder.rotation.set(lReach, 0.25 + c * 0.12, -0.25);
        if (j.lElbow) j.lElbow.rotation.set(-0.3 - Math.max(0, s) * 0.7, 0, 0);
      }
      if (j.rShoulder) {
        const rReach = -0.85 + s * 0.3;
        j.rShoulder.rotation.set(rReach, -0.2 - c * 0.1, 0.35);
        if (j.rElbow) j.rElbow.rotation.set(-0.25 - Math.max(0, -s) * 0.5, 0, 0);
      }
    } else if (hasLArm) {
      if (j.lShoulder) {
        j.lShoulder.rotation.set(-1.25 - s * 0.5, 0.3, -0.3);
        if (j.lElbow) j.lElbow.rotation.set(-0.35 - Math.max(0, s) * 0.8, 0, 0);
      }
      if (j.spine) j.spine.rotation.y = s * 0.35;
    } else if (hasRArm) {
      if (j.rShoulder) {
        j.rShoulder.rotation.set(-1.1 + s * 0.45, -0.3, 0.3);
        if (j.rElbow) j.rElbow.rotation.set(-0.3 - Math.max(0, -s) * 0.7, 0, 0);
      }
      if (j.spine) j.spine.rotation.y = -s * 0.35;
    }
  } else if (hasLArm && hasRArm) {
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

  const hasSeveredLeg = !!(e.severed?.lLeg || e.severed?.rLeg);

  if (hasSeveredLeg && (e.state === 'chase' || e.state === 'patrol' || e.state === 'wander' || e.state === 'investigate' || e.state === 'dummy_preview' || e.state === 'dummy_idle' || e.state === 'dummy_walk')) {
    poseCrawl(e, dt, t, P, type);
  } else {
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
