import * as THREE from 'three';
import { rand } from './config.js';

const _v3 = new THREE.Vector3();
const _r3 = new THREE.Vector3();

export class CrateProp {
  constructor(scene, T, x, y, z, sx = 1.4, sy = 1.4, sz = 1.4) {
    this.scene = scene;
    this.size = new THREE.Vector3(sx, sy, sz);
    this.mass = Math.max(15, sx * sy * sz * 24.0); // 20-55 кг
    this.pos = new THREE.Vector3(x, y + sy / 2, z);
    this.vel = new THREE.Vector3(0, 0, 0);
    this.rot = new THREE.Euler(0, rand(0, Math.PI * 2), 0);
    this.angVel = new THREE.Vector3(0, 0, 0);
    this.hp = 110;
    this.maxHp = 110;
    this.alive = true;
    this.resting = true;
    this.soundCool = 0;
    this.slideSoundT = 0;
    this.radius = Math.max(sx, sz) * 0.58;

    // 3D-модель деревянного ящика со скобами
    this.mesh = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ map: T.crate, color: 0xb4aa94, flatShading: true });
    const box = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    this.mesh.add(box);

    // Металлические угловые накладки / окантовка для PS1-детализации
    const metalMat = new THREE.MeshLambertMaterial({ map: T.platform, color: 0x4a4a4e, flatShading: true });
    const bTop = new THREE.Mesh(new THREE.BoxGeometry(sx * 1.02, 0.08, sz * 1.02), metalMat);
    bTop.position.y = sy / 2 - 0.04;
    const bBot = new THREE.Mesh(new THREE.BoxGeometry(sx * 1.02, 0.08, sz * 1.02), metalMat);
    bBot.position.y = -sy / 2 + 0.04;
    this.mesh.add(bTop, bBot);

    this.mesh.position.copy(this.pos);
    this.mesh.rotation.copy(this.rot);
    scene.add(this.mesh);
  }

  applyImpulse(hitPoint, impulseVec, isKick = false) {
    this.resting = false;
    // Линейный импульс
    this.vel.addScaledVector(impulseVec, 1.0 / this.mass);

    // Вращательный момент (Torque) на основе плеча силы относительно центра масс
    const r = hitPoint.clone().sub(this.pos);
    const torque = r.cross(impulseVec).multiplyScalar(2.6 / (this.mass * this.size.x));
    this.angVel.add(torque);

    if (isKick) {
      // Пинок ногой добавляет мощное кувыркание вперед
      this.angVel.x += rand(-4.0, 4.0);
      this.angVel.y += rand(-5.0, 5.0);
      this.angVel.z += rand(-4.0, 4.0);
      this.vel.y += rand(2.5, 4.5);
    }
  }

  damage(amt, hitPoint, shotDir, fx, sfx) {
    if (!this.alive) return;
    this.hp -= amt;
    this.resting = false;

    // Щепки и эффект попадания по дереву
    if (fx) {
      const norm = hitPoint.clone().sub(this.pos).normalize();
      fx.woodImpact(hitPoint, norm);
    }
    if (sfx) sfx.woodHit();

    // Физический сдвиг от пули
    const pushForce = Math.min(32, amt * 0.35);
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

  update(dt, arena, enemies, player, fx, sfx) {
    if (!this.alive) return;
    if (this.soundCool > 0) this.soundCool -= dt;
    if (this.slideSoundT > 0) this.slideSoundT -= dt;

    if (this.resting) {
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.copy(this.rot);
      return;
    }

    // Гравитация
    this.vel.y -= 22.0 * dt;

    // Интеграция скорости и положения
    this.pos.addScaledVector(this.vel, dt);
    this.rot.x += this.angVel.x * dt;
    this.rot.y += this.angVel.y * dt;
    this.rot.z += this.angVel.z * dt;

    // Затухание вращения в воздухе
    this.angVel.multiplyScalar(Math.pow(0.92, dt * 60));

    // Проверка столкновения с полом арены (с учетом ступеней и возвышений)
    const groundY = arena ? arena.groundTopAt(this.pos.x, this.pos.z, this.pos.y) : 0;
    const halfH = this.size.y * 0.5;

    if (this.pos.y - halfH <= groundY) {
      this.pos.y = groundY + halfH;
      const hitSpeed = -this.vel.y;

      if (hitSpeed > 1.6 && this.soundCool <= 0) {
        if (sfx) sfx.crateThud(hitSpeed);
        if (fx) fx.woodImpact(this.pos, new THREE.Vector3(0, 1, 0));
        this.soundCool = 0.18;
      }

      // Упругий отскок с сильным гашением
      this.vel.y = -this.vel.y * 0.18;
      if (Math.abs(this.vel.y) < 0.4) this.vel.y = 0;

      // Трение о пол
      const friction = Math.pow(0.12, dt * 60);
      this.vel.x *= friction;
      this.vel.z *= friction;

      // Трение вращения о пол
      this.angVel.x *= Math.pow(0.08, dt * 60);
      this.angVel.z *= Math.pow(0.08, dt * 60);
      this.angVel.y *= Math.pow(0.25, dt * 60);

      // Звук скольжения тяжелого ящика
      const horizSpd = Math.hypot(this.vel.x, this.vel.z);
      if (horizSpd > 2.2 && this.slideSoundT <= 0) {
        if (sfx) sfx.crateSlide();
        this.slideSoundT = 0.35;
      }

      // Если ящик замедлился — укладываем ровно и переводим в сон
      if (horizSpd < 0.08 && Math.abs(this.vel.y) < 0.1 && this.angVel.length() < 0.15) {
        this.vel.set(0, 0, 0);
        this.angVel.set(0, 0, 0);
        // Выравнивание угла наклона к ближайшему углу 90° (0, PI/2, PI, 3PI/2)
        const snap = a => Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
        this.rot.x = snap(this.rot.x);
        this.rot.z = snap(this.rot.z);
        this.resting = true;
      }
    }

    // Столкновение со стенами арены
    if (arena && arena.clampCircle) {
      arena.clampCircle(this.pos, this.radius, this.pos.y - halfH, this.size.y);
    }

    // Физическое столкновение летящего/скользящего ящика с монстрами (БОУЛИНГ!)
    const spd = this.vel.length();
    if (spd > 2.6 && enemies && enemies.list) {
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

          // Принудительно сбиваем тварь с ног
          if (e.poise > 0) e.poise = 0;

          if (fx) {
            fx.blood(e.pos.clone().addScaledVector(hitDir, 0.3), hitDir, 28, 1.8);
            fx.woodImpact(this.pos, hitDir.clone().negate());
          }
          if (sfx) {
            sfx.crateThud(spd * 1.5);
            sfx.boneCrack();
          }

          // Ящик теряет скорость от удара о плоть
          this.vel.multiplyScalar(0.4);
          this.angVel.multiplyScalar(0.5);
          break;
        }
      }
    }

    // Толкание ящика игроком при ходьбе
    if (player) {
      const pdx = this.pos.x - player.pos.x;
      const pdz = this.pos.z - player.pos.z;
      const pDist2 = pdx * pdx + pdz * pdz;
      const pushR = this.radius + player.radius + 0.05;

      if (pDist2 < pushR * pushR && Math.abs(player.pos.y - this.pos.y) < 1.4) {
        const pDist = Math.sqrt(pDist2) || 0.001;
        const nx = pdx / pDist;
        const nz = pdz / pDist;
        const overlap = pushR - pDist;

        // Игрок толкает ящик вперед
        this.pos.x += nx * overlap * 0.6;
        this.pos.z += nz * overlap * 0.6;
        this.vel.x += nx * 2.5;
        this.vel.z += nz * 2.5;
        this.resting = false;
      }
    }

    this.mesh.position.copy(this.pos);
    this.mesh.rotation.copy(this.rot);
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

  // Raycast проверка попадания пуль / картечи по ящикам
  raycast(origin, dir, maxDist) {
    let bestHit = null;
    let bestDist = maxDist;

    for (const p of this.list) {
      if (!p.alive) continue;
      // Быстрая проверка ограничивающей сферы
      const toProp = p.pos.clone().sub(origin);
      const proj = toProp.dot(dir);
      if (proj < 0 || proj > bestDist + p.radius) continue;

      const perp2 = toProp.lengthSq() - proj * proj;
      if (perp2 > p.radius * p.radius) continue;

      // Точная проверка Oriented Bounding Box
      // Переводим луч в локальную систему координат ящика
      _v3.copy(origin).sub(p.pos);
      const invEuler = new THREE.Euler(-p.rot.x, -p.rot.y, -p.rot.z, 'ZYX');
      _v3.applyEuler(invEuler);
      const localDir = dir.clone().applyEuler(invEuler);

      const hx = p.size.x / 2, hy = p.size.y / 2, hz = p.size.z / 2;
      let tmin = 0, tmax = bestDist;
      let normalAxis = -1, normalSign = 0;
      let ok = true;

      const axes = [
        { orig: _v3.x, d: localDir.x, min: -hx, max: hx, ax: 0 },
        { orig: _v3.y, d: localDir.y, min: -hy, max: hy, ax: 1 },
        { orig: _v3.z, d: localDir.z, min: -hz, max: hz, ax: 2 },
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

      if (ok && tmin > 0.01 && tmin < bestDist) {
        bestDist = tmin;
        const localHitPoint = _v3.clone().addScaledVector(localDir, tmin);
        const worldHitPoint = origin.clone().addScaledVector(dir, tmin);

        const localNorm = new THREE.Vector3();
        if (normalAxis === 0) localNorm.x = normalSign;
        else if (normalAxis === 1) localNorm.y = normalSign;
        else if (normalAxis === 2) localNorm.z = normalSign;
        const worldNorm = localNorm.applyEuler(p.rot);

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

  // Обновление всех физических интерактивных объектов
  update(dt, arena, enemies, player, fx, sfx) {
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
