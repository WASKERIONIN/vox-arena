import * as THREE from 'three';
import { rand } from './config.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// Арена «SKIASH TELEPORT»: пол, стены, неон, ворота спавна, платформа, укрытия, аптечки
export function buildArena(scene, T) {
  const colliders = []; // {min,max}
  const lam = (map, color = 0xffffff, extra = {}) => new THREE.MeshLambertMaterial({ map, color, ...extra });

  const addBox = (cx, baseY, cz, sx, sy, sz, mat, { collide = true, texRepeat = null } = {}) => {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    if (texRepeat) {
      const m = mat.clone();
      m.map = mat.map.clone();
      m.map.repeat.set(texRepeat[0], texRepeat[1]);
      m.map.needsUpdate = true;
      mat = m;
    }
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(cx, baseY + sy / 2, cz);
    scene.add(mesh);
    if (collide) colliders.push({ min: V3(cx - sx / 2, baseY, cz - sz / 2), max: V3(cx + sx / 2, baseY + sy, cz + sz / 2) });
    return mesh;
  };

  // ---- свет (хоррор-атмосфера: контрастные тени и глубокие тона) ----
  scene.add(new THREE.HemisphereLight(0x5a4850, 0x120c16, 0.65));
  scene.add(new THREE.AmbientLight(0x32242a, 0.4));
  const dir = new THREE.DirectionalLight(0xb88870, 0.85);
  dir.position.set(24, 38, 14);
  scene.add(dir);

  // ---- небо ----
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(300, 20, 12),
    new THREE.MeshBasicMaterial({ map: T.sky, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  sky.renderOrder = -1;
  scene.add(sky);

  // ---- пол ----
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), lam(T.floor));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // ---- стены ----
  const wallMat = lam(T.wall, 0xffffff, { color: 0xb8b0ac });
  addBox(0, 0, -32, 64, 6, 1.2, wallMat, { texRepeat: [8, 1] });
  addBox(0, 0, 32, 64, 6, 1.2, wallMat, { texRepeat: [8, 1] });
  addBox(-32, 0, 0, 1.2, 6, 64, wallMat, { texRepeat: [8, 1] });
  addBox(32, 0, 0, 1.2, 6, 64, wallMat, { texRepeat: [8, 1] });

  // ---- неон и hazard-полосы по стенам ----
  const neon = new THREE.MeshBasicMaterial({ color: 0xff2418 });
  const neon2 = new THREE.MeshBasicMaterial({ color: 0xff5530 });
  const hazMat = lam(T.hazard);
  const strip = (x, y, z, sx, sy, sz, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z); scene.add(m); return m;
  };
  strip(0, 1.0, -31.35, 63, 0.5, 0.06, hazMat); strip(0, 1.0, 31.35, 63, 0.5, 0.06, hazMat);
  strip(-31.35, 1.0, 0, 0.06, 0.5, 63, hazMat); strip(31.35, 1.0, 0, 0.06, 0.5, 63, hazMat);
  strip(0, 3.4, -31.32, 63, 0.1, 0.05, neon); strip(0, 3.4, 31.32, 63, 0.1, 0.05, neon);
  strip(-31.32, 3.4, 0, 0.05, 0.1, 63, neon); strip(31.32, 3.4, 0, 0.05, 0.1, 63, neon);
  strip(0, 5.6, -31.34, 63, 0.06, 0.04, neon2); strip(0, 5.6, 31.34, 63, 0.06, 0.04, neon2);
  strip(-31.34, 5.6, 0, 0.04, 0.06, 63, neon2); strip(31.34, 5.6, 0, 0.04, 0.06, 63, neon2);

  // ---- ворота спавна (4) ----
  const gateMat = lam(T.platform, 0x8a8a8a);
  const portalMat = new THREE.MeshBasicMaterial({ color: 0x55090a, transparent: true, opacity: 0.78, side: THREE.DoubleSide });
  const barsMat = new THREE.MeshBasicMaterial({ color: 0x14090c });
  const spawnPoints = [];
  const gates = [
    { x: 0, z: -31.2, ry: 0 }, { x: 0, z: 31.2, ry: Math.PI },
    { x: -31.2, z: 0, ry: Math.PI / 2 }, { x: 31.2, z: 0, ry: -Math.PI / 2 },
  ];
  for (const gt of gates) {
    const g = new THREE.Group(); g.position.set(gt.x, 0, gt.z); g.rotation.y = gt.ry;
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 4.6, 1), gateMat); p1.position.set(-2.2, 2.3, 0.4);
    const p2 = p1.clone(); p2.position.x = 2.2;
    const top = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.7, 1), gateMat); top.position.set(0, 4.95, 0.4);
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 4.2), portalMat);
    portal.position.set(0, 2.2, 0.55);
    // тёмная решётка поверх портала — читается как врата, а не как плашка
    const bars = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.12, 0.08), barsMat);
      h.position.set(0, 0.7 + i * 1.05, 0.6); bars.add(h);
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.4, 0.08), barsMat);
      v.position.set(-1.3 + i * 0.87, 2.2, 0.6); bars.add(v);
    }
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.3, 0.1), barsMat);
    frame.position.set(0, 4.5, 0.58);
    // светящаяся красная окантовка проёма
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff2418 });
    const edgeT = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.14, 0.12), glowMat); edgeT.position.set(0, 4.62, 0.6);
    const edgeL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 4.5, 0.12), glowMat); edgeL.position.set(-1.95, 2.35, 0.6);
    const edgeR = edgeL.clone(); edgeR.position.x = 1.95;
    // мягкое свечение внутри проёма
    const innerGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: 0xff2018, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    innerGlow.scale.set(5.5, 6.5, 1); innerGlow.position.set(0, 2.3, 0.4);
    g.add(p1, p2, top, portal, bars, frame, edgeT, edgeL, edgeR, innerGlow);
    // красный свет у ворот
    const pl = new THREE.PointLight(0xff2418, 26, 14, 2); pl.position.set(0, 3, -1.5); g.add(pl);
    scene.add(g);
    spawnPoints.push(V3(gt.x * 0.93, 0, gt.z * 0.93));
  }

  // ---- центральная платформа + ступени ----
  const platMat = lam(T.platform, 0x9aa0a8);
  addBox(0, 0, 0, 12, 1.2, 12, platMat, { texRepeat: [3, 3] });
  addBox(0, 0, 7.2, 4.4, 0.6, 2.6, platMat, { texRepeat: [1, 1] });
  addBox(0, 0, -7.2, 4.4, 0.6, 2.6, platMat, { texRepeat: [1, 1] });
  addBox(0, 1.2, 0, 3, 0.14, 3, lam(T.crate), { collide: false }); // декор-панель
  // красная кайма платформы
  const rim = new THREE.MeshBasicMaterial({ color: 0xff2418 });
  strip(0, 1.28, 6.02, 12.06, 0.06, 0.05, rim); strip(0, 1.28, -6.02, 12.06, 0.06, 0.05, rim);
  strip(6.02, 1.28, 0, 0.05, 0.06, 12.06, rim); strip(-6.02, 1.28, 0, 0.05, 0.06, 12.06, rim);

  // ---- колонны с фонарями ----
  const colMat = lam(T.wall, 0x777777);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 + Math.PI / 8;
    const x = Math.cos(a) * 19, z = Math.sin(a) * 19;
    addBox(x, 0, z, 1.7, 6, 1.7, colMat, { texRepeat: [1, 2] });
    strip(x, 4.4, z, 1.76, 0.14, 1.76, neon);
    if (i % 2 === 0) {
      const pl = new THREE.PointLight(0xffa050, 42, 20, 2);
      pl.position.set(x, 5.2, z); scene.add(pl);
      strip(x, 5.6, z, 0.5, 0.3, 0.5, new THREE.MeshBasicMaterial({ color: 0xffc860 }));
    }
  }

  // ---- ящики ----
  const crateMat = lam(T.crate, 0xb0a890);
  const crates = [
    [8, 0, 14, 1.5], [9.6, 0, 14.4, 1.1], [8.7, 1.5, 14.2, 1.0],
    [-13, 0, 9, 1.4], [-13, 1.4, 9, 0.9],
    [15, 0, -9, 1.6], [-9, 0, -16, 1.3], [-10.4, 0, -15.6, 1.0],
    [18, 0, 6, 1.2], [-17, 0, -4, 1.5], [6, 0, -20, 1.1], [-22, 0, 12, 1.3],
  ];
  for (const [x, y, z, s] of crates) addBox(x, y, z, s, s, s, crateMat);

  // ---- дальние силуэты ----
  const towerMat = new THREE.MeshLambertMaterial({ color: 0x0d0a0e });
  const towers = [[-46, -40, 6, 30], [40, -52, 8, 24], [55, 20, 5, 34], [-58, 15, 7, 26], [10, -60, 9, 20], [-25, 55, 6, 28]];
  for (const [x, z, w, h] of towers) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), towerMat);
    t.position.set(x, h / 2 - 0.5, z); scene.add(t);
  }

  // ---- аптечки ----
  const pickups = [];
  const spots = [[12.5, 0, 12.5], [-12.5, 0, -12.5], [12.5, 0, -12.5], [-12.5, 0, 12.5]];
  const crossMatA = new THREE.MeshBasicMaterial({ color: 0xff3344 });
  const glowMat = new THREE.SpriteMaterial({ map: T.glow, color: 0xff3344, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  for (const [x, baseY, z] of spots) {
    const g = new THREE.Group(); g.position.set(x, baseY, z);
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.13), crossMatA);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.42, 0.13), crossMatA);
    const glow = new THREE.Sprite(glowMat); glow.scale.setScalar(1.4);
    g.add(a, b, glow);
    scene.add(g);
    pickups.push({ g, x, y: baseY, z, active: true, timer: 0 });
  }

  // ==========================================================
  // Физика: земля с учётом «ступенек» + выталкивание из ящиков/стен
  const STEP = 0.7;
  function groundTopAt(x, z, footY) {
    let best = 0;
    for (const c of colliders) {
      if (x >= c.min.x - 0.01 && x <= c.max.x + 0.01 && z >= c.min.z - 0.01 && z <= c.max.z + 0.01) {
        if (c.max.y <= footY + STEP && c.max.y > best) best = c.max.y;
      }
    }
    return best;
  }
  function clampCircle(pos, r, footY, height) {
    for (const c of colliders) {
      // только если препятствие реально выше ног
      if (c.max.y - footY <= STEP) continue;
      if (footY + height < c.min.y) continue;
      const nx = Math.max(c.min.x, Math.min(pos.x, c.max.x));
      const nz = Math.max(c.min.z, Math.min(pos.z, c.max.z));
      let dx = pos.x - nx, dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2), push = (r - d) / d;
        pos.x += dx * push; pos.z += dz * push;
      } else {
        // внутри бокса: выталкиваем по минимальной оси
        const l = pos.x - c.min.x, rgt = c.max.x - pos.x, tp = pos.z - c.min.z, bt = c.max.z - pos.z;
        const m = Math.min(l, rgt, tp, bt);
        if (m === l) pos.x = c.min.x - r; else if (m === rgt) pos.x = c.max.x + r;
        else if (m === tp) pos.z = c.min.z - r; else pos.z = c.max.z + r;
      }
    }
    // границы арены на всякий случай
    pos.x = Math.max(-31, Math.min(31, pos.x));
    pos.z = Math.max(-31, Math.min(31, pos.z));
  }
  // луч против мира (для пуль): AABB-слэб метод + пол
  function raycastWorld(o, d, maxDist) {
    let bestT = maxDist, normal = null;
    for (const c of colliders) {
      let tmin = 0, tmax = bestT, nAxis = -1, nSign = 0;
      let ok = true;
      for (let a = 0; a < 3; a++) {
        const ax = ['x', 'y', 'z'][a];
        const mn = c.min[ax], mx = c.max[ax], oo = o[ax], dd = d[ax];
        if (Math.abs(dd) < 1e-9) { if (oo < mn || oo > mx) { ok = false; break; } continue; }
        let t1 = (mn - oo) / dd, t2 = (mx - oo) / dd, sgn = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sgn = 1; }
        if (t1 > tmin) { tmin = t1; nAxis = a; nSign = sgn; }
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) { ok = false; break; }
      }
      if (ok && tmin < bestT && tmin > 0.001) {
        bestT = tmin; normal = new THREE.Vector3();
        if (nAxis >= 0) normal[['x', 'y', 'z'][nAxis]] = nSign; else normal.copy(d).negate();
      }
    }
    // пол
    if (d.y < -1e-6) {
      const t = -o.y / d.y;
      if (t > 0.001 && t < bestT && Math.abs(o.x + d.x * t) < 32 && Math.abs(o.z + d.z * t) < 32) {
        bestT = t; normal = V3(0, 1, 0);
      }
    }
    return normal ? { dist: bestT, point: o.clone().addScaledVector(d, bestT), normal } : null;
  }

  function updatePickups(dt, time, playerPos, onPickup) {
    // пульс порталов
    portalMat.opacity = 0.38 + Math.sin(time * 2.6) * 0.14;
    for (const p of pickups) {
      if (!p.active) {
        p.timer -= dt;
        if (p.timer <= 0) { p.active = true; p.g.visible = true; }
        continue;
      }
      p.g.rotation.y = time * 2.2;
      p.g.position.y = p.y + 0.55 + Math.sin(time * 3 + p.x) * 0.09;
      if (playerPos) {
        const dx = playerPos.x - p.x, dz = playerPos.z - p.z, dy = playerPos.y - p.y;
        if (dx * dx + dz * dz < 1.1 && dy < 1.4) {
          p.active = false; p.g.visible = false; p.timer = 18;
          onPickup(p);
        }
      }
    }
  }
  function resetPickups() { for (const p of pickups) { p.active = true; p.g.visible = true; p.timer = 0; } }

  return { colliders, spawnPoints, groundTopAt, clampCircle, raycastWorld, updatePickups, resetPickups };
}
