import * as THREE from 'three';
import { rand } from './config.js';

const _v3a = new THREE.Vector3();
const _v3b = new THREE.Vector3();
const _v3c = new THREE.Vector3();
const _quatTmp = new THREE.Quaternion();
const _axisTmp = new THREE.Vector3();

// 8 локальных вершин единичного куба
const UNIT_CORNERS = [
  new THREE.Vector3(-0.5, -0.5, -0.5),
  new THREE.Vector3( 0.5, -0.5, -0.5),
  new THREE.Vector3( 0.5, -0.5,  0.5),
  new THREE.Vector3(-0.5, -0.5,  0.5),
  new THREE.Vector3(-0.5,  0.5, -0.5),
  new THREE.Vector3( 0.5,  0.5, -0.5),
  new THREE.Vector3( 0.5,  0.5,  0.5),
  new THREE.Vector3(-0.5,  0.5,  0.5),
];

// Применение обратного тензора инерции в мировых координатах:
// I_world^-1 * v = R * (I_body^-1 * (R^T * v))
function applyInvInertia(v, quat, invInertiaBody, out) {
  _quatTmp.copy(quat).invert();
  _v3c.copy(v).applyQuaternion(_quatTmp);
  _v3c.x *= invInertiaBody.x;
  _v3c.y *= invInertiaBody.y;
  _v3c.z *= invInertiaBody.z;
  out.copy(_v3c).applyQuaternion(quat);
  return out;
}

export class CrateProp {
  constructor(scene, T, x, y, z, sx = 1.4, sy = 1.4, sz = 1.4) {
    this.scene = scene;
    this.size = new THREE.Vector3(sx, sy, sz);
    this.mass = Math.max(22, sx * sy * sz * 30.0); // 30-65 кг
    this.invMass = 1.0 / this.mass;

    // Тензор инерции сплошного прямоугольного параллелепипеда (кубоида)
    const Ixx = (1 / 12) * this.mass * (sy * sy + sz * sz);
    const Iyy = (1 / 12) * this.mass * (sx * sx + sz * sz);
    const Izz = (1 / 12) * this.mass * (sx * sx + sy * sy);
    this.invInertiaBody = new THREE.Vector3(1 / Ixx, 1 / Iyy, 1 / Izz);

    this.pos = new THREE.Vector3(x, y + sy / 2, z);
    this.vel = new THREE.Vector3(0, 0, 0);
    this.quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand(0, Math.PI * 2), 0));
    this.angVel = new THREE.Vector3(0, 0, 0); // рад/с

    this.hp = 110;
    this.maxHp = 110;
    this.alive = true;
    this.resting = false; // На старте проходит 2 кадра физического укоренения на полу
    this.stillTime = 0;
    this.soundCool = 0;
    this.slideSoundT = 0;
    this.radius = Math.hypot(sx, sy, sz) * 0.52; // радиус охватывающей сферы

    // 8 локальных вершин ящика
    this.localCorners = UNIT_CORNERS.map(c => new THREE.Vector3(c.x * sx, c.y * sy, c.z * sz));

    // ========================================================================
    // 3D-модель деревянного ящика (Без Z-файтинга и накладывающихся мешей)
    // ========================================================================
    this.mesh = new THREE.Group();

    // Основной деревянный куб
    const matWood = new THREE.MeshLambertMaterial({ map: T.crate, color: 0xc4b49c, flatShading: true });
    const woodBox = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), matWood);
    this.mesh.add(woodBox);

    // Металлические опоясывающие стальные стяжки по бокам
    const metalMat = new THREE.MeshLambertMaterial({ map: T.platform, color: 0x4a4a50, flatShading: true });
    const strapH = Math.min(0.065, sy * 0.08);

    const strapTop = new THREE.Mesh(new THREE.BoxGeometry(sx * 1.012, strapH, sz * 1.012), metalMat);
    strapTop.position.y = sy * 0.32;
    const strapBot = new THREE.Mesh(new THREE.BoxGeometry(sx * 1.012, strapH, sz * 1.012), metalMat);
    strapBot.position.y = -sy * 0.32;
    this.mesh.add(strapTop, strapBot);

    // 4 вертикальных угловых металлических уголка
    const cornerW = 0.06;
    for (const cx of [-1, 1]) {
      for (const cz of [-1, 1]) {
        const cPillar = new THREE.Mesh(new THREE.BoxGeometry(cornerW, sy * 1.002, cornerW), metalMat);
        cPillar.position.set(cx * (sx / 2 - cornerW / 3), 0, cz * (sz / 2 - cornerW / 3));
        this.mesh.add(cPillar);
      }
    }

    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.copy(this.quat);
    scene.add(this.mesh);
  }

  // Приложение 3D-импульса в произвольную точку попадания (с крутящим моментом)
  applyImpulse(hitPoint, impulseVec, isKick = false) {
    this.resting = false;
    this.stillTime = 0;

    // Линейное ускорение
    this.vel.addScaledVector(impulseVec, this.invMass);

    // Вращательный момент (Torque = r x J)
    const r = hitPoint.clone().sub(this.pos);
    const torque = new THREE.Vector3().crossVectors(r, impulseVec);
    const angImpulse = new THREE.Vector3();
    applyInvInertia(torque, this.quat, this.invInertiaBody, angImpulse);
    this.angVel.add(angImpulse);

    if (isKick) {
      // Пинок ногой добавляет мощное кувыркание в воздухе
      this.angVel.x += rand(-4.5, 4.5);
      this.angVel.y += rand(-5.0, 5.0);
      this.angVel.z += rand(-4.5, 4.5);
      this.vel.y += rand(2.8, 4.8);
    }
  }

  damage(amt, hitPoint, shotDir, fx, sfx) {
    if (!this.alive) return;
    this.hp -= amt;
    this.resting = false;
    this.stillTime = 0;

    // Щепки и эффект попадания по дереву
    if (fx) {
      const norm = hitPoint.clone().sub(this.pos).normalize();
      fx.woodImpact(hitPoint, norm);
    }
    if (sfx) sfx.woodHit();

    // Чувствительный, смачный кинетический импульс от попадания пуль / дроби
    const pushForce = Math.max(34, amt * 1.85);
    this.applyImpulse(hitPoint, shotDir.clone().multiplyScalar(pushForce));

    if (this.hp <= 0) {
      this.destroy(fx, sfx);
    }
  }

  destroy(fx, sfx) {
    if (!this.alive) return;
    this.alive = false;
    if (this.mesh) {
      this.scene.remove(this.mesh);
    }
    if (fx) fx.woodGibs(this.pos, this.size.x);
    if (sfx) sfx.woodSnap();
  }

  // Интеграция физики твердого тела за один суб-шаг
  _stepPhysics(dt, arena, fx, sfx) {
    if (this.resting) return;

    // 1. Гравитация
    this.vel.y -= 22.0 * dt;

    // 2. Интеграция линейной скорости
    this.pos.addScaledVector(this.vel, dt);

    // 3. Интеграция угловой скорости в кватернион ориентации
    const angSpeed = this.angVel.length();
    if (angSpeed > 1e-6) {
      _axisTmp.copy(this.angVel).multiplyScalar(1 / angSpeed);
      _quatTmp.setFromAxisAngle(_axisTmp, angSpeed * dt);
      this.quat.premultiply(_quatTmp).normalize();
    }

    // Сопротивление воздуха
    const linearDamping = Math.pow(0.96, dt * 60);
    const angularDamping = Math.pow(0.92, dt * 60);
    this.vel.x *= linearDamping;
    this.vel.z *= linearDamping;
    this.angVel.multiplyScalar(angularDamping);

    // 4. Проверка и разрешение контактов 8 вершин куба с поверхностью пола / ступенями
    let contactsCount = 0;
    let maxPenetration = 0;
    const groundNormal = new THREE.Vector3(0, 1, 0);

    const normalTorqueArm = new THREE.Vector3();
    const invInertiaTorque = new THREE.Vector3();
    let currentGroundY = 0;

    for (let i = 0; i < 8; i++) {
      // Мировое положение вершины
      const r = this.localCorners[i].clone().applyQuaternion(this.quat);
      const cornerWorld = this.pos.clone().add(r);

      const groundY = arena ? arena.groundTopAt(cornerWorld.x, cornerWorld.z, cornerWorld.y) : 0;
      currentGroundY = groundY;
      const penetration = groundY - cornerWorld.y;

      if (penetration > -0.02) {
        contactsCount++;
        maxPenetration = Math.max(maxPenetration, Math.max(0, penetration));

        // Линейная скорость вершины: v_corner = v + omega x r
        const vCorner = new THREE.Vector3().crossVectors(this.angVel, r).add(this.vel);
        const vn = vCorner.dot(groundNormal);

        // Расчет эффективной массы в точке контакта вдоль нормали
        normalTorqueArm.crossVectors(r, groundNormal);
        applyInvInertia(normalTorqueArm, this.quat, this.invInertiaBody, invInertiaTorque);
        const Kn = this.invMass + invInertiaTorque.dot(normalTorqueArm);

        // Коэффициент упругости отскока
        const restitution = vn < -1.4 ? 0.22 : 0.0;
        const bias = Math.min(3.5, Math.max(0, penetration) * 26.0);
        const jn = (-(1.0 + restitution) * vn + bias) / Math.max(1e-5, Kn);

        if (jn > 0) {
          // Применяем нормальный импульс
          const normalImpulse = groundNormal.clone().multiplyScalar(jn);
          this.vel.addScaledVector(normalImpulse, this.invMass);

          const angImpNorm = new THREE.Vector3();
          const rCrossJn = new THREE.Vector3().crossVectors(r, normalImpulse);
          applyInvInertia(rCrossJn, this.quat, this.invInertiaBody, angImpNorm);
          this.angVel.add(angImpNorm);

          // Звук удара о пол
          if (vn < -1.8 && this.soundCool <= 0) {
            if (sfx) sfx.crateThud(-vn);
            if (fx) fx.woodImpact(cornerWorld, groundNormal);
            this.soundCool = 0.16;
          }

          // Мощное трение Кулона (Friction) о пол
          const vTangent = vCorner.clone().sub(groundNormal.clone().multiplyScalar(vn));
          const vt = vTangent.length();

          if (vt > 1e-4) {
            const tangentDir = vTangent.clone().multiplyScalar(1 / vt);
            const tanTorqueArm = new THREE.Vector3().crossVectors(r, tangentDir);
            applyInvInertia(tanTorqueArm, this.quat, this.invInertiaBody, invInertiaTorque);
            const Kt = this.invMass + invInertiaTorque.dot(tanTorqueArm);

            const mu = 0.65; // высокое трение дерева о камень
            let jt = -vt / Math.max(1e-5, Kt);
            jt = Math.max(-mu * jn, Math.min(mu * jn, jt));

            const frictionImpulse = tangentDir.clone().multiplyScalar(jt);
            this.vel.addScaledVector(frictionImpulse, this.invMass);

            const rCrossJt = new THREE.Vector3().crossVectors(r, frictionImpulse);
            const angImpTan = new THREE.Vector3();
            applyInvInertia(rCrossJt, this.quat, this.invInertiaBody, angImpTan);
            this.angVel.add(angImpTan);
          }
        }

        // Выталкивание вершины из пола
        if (penetration > 0) {
          this.pos.y += penetration * 0.45;
        }
      }
    }

    // Сильное гашение вращения и скольжения при контакте с полом
    if (contactsCount >= 1) {
      const floorFriction = Math.pow(0.68, dt * 60);
      this.vel.x *= floorFriction;
      this.vel.z *= floorFriction;
      this.angVel.multiplyScalar(Math.pow(0.55, dt * 60));

      const horiz = Math.hypot(this.vel.x, this.vel.z);
      if (horiz < 0.12) {
        this.vel.x = 0;
        this.vel.z = 0;
      }
      if (this.angVel.length() < 0.15) {
        this.angVel.set(0, 0, 0);
      }
    }

    // Звук волочения / скольжения по полу
    const horizSpd = Math.hypot(this.vel.x, this.vel.z);
    if (contactsCount >= 2 && horizSpd > 2.0 && this.slideSoundT <= 0) {
      if (sfx) sfx.crateSlide();
      this.slideSoundT = 0.32;
    }

    // Столкновение со стенами арены
    if (arena && arena.clampCircle) {
      const halfH = this.size.y * 0.5;
      arena.clampCircle(this.pos, this.radius * 0.85, this.pos.y - halfH, this.size.y);
    }

    // 5. Успокоение и перевод в стабильный покой (Resting State)
    if (contactsCount >= 2 && horizSpd < 0.15 && Math.abs(this.vel.y) < 0.2 && this.angVel.length() < 0.2) {
      this.stillTime += dt;
      if (this.stillTime > 0.08) {
        this.vel.set(0, 0, 0);
        this.angVel.set(0, 0, 0);

        // Естественное выравнивание на ближайшую грань куба
        const euler = new THREE.Euler().setFromQuaternion(this.quat, 'YXZ');
        const snap = a => Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
        euler.x = snap(euler.x);
        euler.z = snap(euler.z);
        this.quat.setFromEuler(euler);

        this.pos.y = currentGroundY + this.size.y * 0.5;
        this.resting = true;
      }
    } else {
      this.stillTime = 0;
    }
  }

  update(dt, arena, enemies, player, fx, sfx) {
    if (!this.alive) return;
    if (this.soundCool > 0) this.soundCool -= dt;
    if (this.slideSoundT > 0) this.slideSoundT -= dt;

    if (!this.resting) {
      // 2 физических суб-шага для численной стабильности и предотвращения проваливаний
      const substeps = 2;
      const subDt = dt / substeps;
      for (let s = 0; s < substeps; s++) {
        this._stepPhysics(subDt, arena, fx, sfx);
      }
    }

    // Физическое столкновение летящего/скользящего ящика с монстрами
    const spd = this.vel.length();
    if (spd > 2.4 && enemies && enemies.list) {
      for (const e of enemies.list) {
        if (!e.alive || e.state === 'dead' || e.state === 'dying' || e.state === 'corpse_ragdoll') continue;
        const dx = e.pos.x - this.pos.x;
        const dz = e.pos.z - this.pos.z;
        const dy = Math.abs(e.pos.y - this.pos.y);
        const hitR = this.radius + e.radius;

        if (dx * dx + dz * dz < hitR * hitR && dy < 1.6) {
          // Сокрушительный кинетический удар по твари!
          const dmg = Math.round(spd * 14) + 25;
          const hitDir = this.vel.clone().normalize();
          enemies.damage(e, dmg, hitDir, this.pos.clone(), 'torso');

          // Сбиваем тварь с ног
          if (e.poise > 0) e.poise = 0;

          if (fx) {
            fx.blood(e.pos.clone().addScaledVector(hitDir, 0.3), hitDir, 28, 1.8);
            fx.woodImpact(this.pos, hitDir.clone().negate());
          }
          if (sfx) {
            sfx.crateThud(spd * 1.5);
            sfx.boneCrack();
          }

          // Ящик передает импульс и отскакивает
          this.vel.multiplyScalar(0.42);
          this.angVel.multiplyScalar(0.5);
          break;
        }
      }
    }

    // Если игрок стоит на ящике, прижимаем ящик к полу
    if (player) {
      const topY = this.pos.y + this.size.y * 0.5;
      const onTop = Math.abs(player.pos.x - this.pos.x) < this.size.x * 0.55 &&
                    Math.abs(player.pos.z - this.pos.z) < this.size.z * 0.55 &&
                    Math.abs(player.pos.y - topY) < 0.12;
      if (onTop) {
        if (this.vel.y > 0) this.vel.y = 0;
      }
    }

    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.copy(this.quat);
  }
}

// Менеджер физических интерактивных объектов карты
export class PropsManager {
  constructor(scene, T) {
    this.scene = scene;
    this.T = T;
    this.list = [];
  }

  addCrate(x, y, z, sx = 1.4, sy = 1.4, sz = 1.4) {
    const c = new CrateProp(this.scene, this.T, x, y, z, sx, sy, sz);
    this.list.push(c);
    return c;
  }

  clear() {
    for (const p of this.list) {
      if (p.mesh) this.scene.remove(p.mesh);
    }
    this.list.length = 0;
  }

  // Расчёт высоты верхней плоскости ящика под ногами игрока для возможности запрыгивания
  groundTopAt(x, z, footY) {
    let best = 0;
    for (const p of this.list) {
      if (!p.alive) continue;
      const topY = p.pos.y + p.size.y * 0.5;
      const hx = p.size.x * 0.52;
      const hz = p.size.z * 0.52;

      // Проверка нахождения игрока в горизонтальных границах ящика
      if (x >= p.pos.x - hx && x <= p.pos.x + hx && z >= p.pos.z - hz && z <= p.pos.z + hz) {
        if (topY <= footY + 0.75 && topY > best) {
          best = topY;
        }
      }
    }
    return best;
  }

  // Предотвращение прохождения игрока сквозь боковые стенки ящиков + плавное толкание
  clampCircle(pos, radius, footY, height) {
    for (const p of this.list) {
      if (!p.alive) continue;
      const topY = p.pos.y + p.size.y * 0.5;
      const botY = p.pos.y - p.size.y * 0.5;

      // Если игрок стоит на крышке ящика сверху, боковая коллизия не нужна
      if (footY >= topY - 0.18) continue;
      // Если игрок ниже ящика
      if (footY + height <= botY) continue;

      const hx = p.size.x * 0.5;
      const hz = p.size.z * 0.5;

      const nx = Math.max(p.pos.x - hx, Math.min(pos.x, p.pos.x + hx));
      const nz = Math.max(p.pos.z - hz, Math.min(pos.z, p.pos.z + hz));
      const dx = pos.x - nx;
      const dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;

      if (d2 < radius * radius) {
        const d = Math.sqrt(d2) || 0.001;
        const push = (radius - d) / d;
        const pushX = dx * push;
        const pushZ = dz * push;

        // Выталкиваем игрока
        pos.x += pushX;
        pos.z += pushZ;

        // Сдвигаем ящик в сторону толкания БЕЗ вращения (без бесконечного вращения!)
        const pushDirX = -(dx / d);
        const pushDirZ = -(dz / d);
        p.pos.x += pushDirX * push * 0.35;
        p.pos.z += pushDirZ * push * 0.35;
        p.vel.x = pushDirX * 1.1;
        p.vel.z = pushDirZ * 1.1;
        p.angVel.set(0, 0, 0); // Обнуляем угловую скорость при толкании игроком
        p.resting = false;
        p.stillTime = 0;
      }
    }
  }

  // Высокоточный Raycast по ориентированному ящику (Oriented Bounding Box)
  raycast(origin, dir, maxDist) {
    let bestHit = null;
    let bestDist = maxDist;

    for (const p of this.list) {
      if (!p.alive) continue;

      const toProp = p.pos.clone().sub(origin);
      const distToCenterSq = toProp.lengthSq();
      const radiusSq = (p.radius + 0.2) * (p.radius + 0.2);

      const proj = toProp.dot(dir);
      if (distToCenterSq > radiusSq && proj < 0) continue;
      if (proj > bestDist + p.radius) continue;
      if (distToCenterSq > radiusSq) {
        const perp2 = distToCenterSq - proj * proj;
        if (perp2 > radiusSq) continue;
      }

      // Точная проверка OBB через инверсию кватерниона
      const invQuat = p.quat.clone().invert();
      const localOrigin = origin.clone().sub(p.pos).applyQuaternion(invQuat);
      const localDir = dir.clone().applyQuaternion(invQuat);

      const hx = p.size.x / 2, hy = p.size.y / 2, hz = p.size.z / 2;
      let tmin = 0, tmax = bestDist;
      let normalAxis = -1, normalSign = 0;
      let ok = true;

      const axes = [
        { orig: localOrigin.x, d: localDir.x, min: -hx, max: hx, ax: 0 },
        { orig: localOrigin.y, d: localDir.y, min: -hy, max: hy, ax: 1 },
        { orig: localOrigin.z, d: localDir.z, min: -hz, max: hz, ax: 2 },
      ];

      for (const a of axes) {
        if (Math.abs(a.d) < 1e-8) {
          if (a.orig < a.min || a.orig > a.max) { ok = false; break; }
        } else {
          let t1 = (a.min - a.orig) / a.d;
          let t2 = (a.max - a.orig) / a.d;
          let sgn = -1;
          if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; sgn = 1; }
          if (t1 > tmin) { tmin = t1; normalAxis = a.ax; normalSign = sgn; }
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) { ok = false; break; }
        }
      }

      if (ok && tmin > 0.001 && tmin < bestDist) {
        bestDist = tmin;
        const worldHitPoint = origin.clone().addScaledVector(dir, tmin);

        const localNorm = new THREE.Vector3();
        if (normalAxis === 0) localNorm.x = normalSign;
        else if (normalAxis === 1) localNorm.y = normalSign;
        else if (normalAxis === 2) localNorm.z = normalSign;
        const worldNorm = localNorm.applyQuaternion(p.quat);

        bestHit = {
          prop: p,
          dist: tmin,
          point: worldHitPoint,
          normal: worldNorm,
        };
      }
    }

    return bestHit;
  }

  // Обновление физических взаимодействий между самими ящиками и миром
  update(dt, arena, enemies, player, fx, sfx) {
    // 1. Попарные физические столкновения между ящиками (Crate vs Crate)
    const len = this.list.length;
    for (let i = 0; i < len; i++) {
      const a = this.list[i];
      if (!a.alive) continue;

      for (let j = i + 1; j < len; j++) {
        const b = this.list[j];
        if (!b.alive) continue;

        const delta = b.pos.clone().sub(a.pos);
        const dist = delta.length();
        const minDist = (a.radius + b.radius) * 0.72;

        if (dist < minDist && dist > 1e-4) {
          const normal = delta.multiplyScalar(1.0 / dist);
          const overlap = minDist - dist;

          // Расталкивание центров
          const totalMass = a.mass + b.mass;
          const pushA = overlap * (b.mass / totalMass);
          const pushB = overlap * (a.mass / totalMass);

          a.pos.addScaledVector(normal, -pushA);
          b.pos.addScaledVector(normal, pushB);

          // Передача импульса удара
          const vRel = b.vel.clone().sub(a.vel);
          const vn = vRel.dot(normal);

          if (vn < 0) {
            const restitution = 0.35;
            const impulseMag = -(1 + restitution) * vn / (a.invMass + b.invMass);
            const impulseVec = normal.clone().multiplyScalar(impulseMag);

            a.vel.addScaledVector(impulseVec, -a.invMass);
            b.vel.addScaledVector(impulseVec, b.invMass);

            // Угловой импульс при ударе ящиков
            const contactPoint = a.pos.clone().addScaledVector(normal, a.radius * 0.6);
            const rA = contactPoint.clone().sub(a.pos);
            const rB = contactPoint.clone().sub(b.pos);

            const torqueA = new THREE.Vector3().crossVectors(rA, impulseVec.clone().negate());
            const torqueB = new THREE.Vector3().crossVectors(rB, impulseVec);

            const angA = new THREE.Vector3();
            const angB = new THREE.Vector3();
            applyInvInertia(torqueA, a.quat, a.invInertiaBody, angA);
            applyInvInertia(torqueB, b.quat, b.invInertiaBody, angB);

            a.angVel.add(angA);
            b.angVel.add(angB);

            a.resting = false;
            b.resting = false;
            a.stillTime = 0;
            b.stillTime = 0;

            if (Math.abs(vn) > 1.2 && sfx) {
              sfx.crateThud(Math.abs(vn));
            }
          }
        }
      }
    }

    // 2. Индивидуальное обновление физики ящиков
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (!p.alive) {
        this.list.splice(i, 1);
        continue;
      }
      p.update(dt, arena, enemies, player, fx, sfx);
    }
  }
}
