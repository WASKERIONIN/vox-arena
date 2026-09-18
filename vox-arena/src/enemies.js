import * as THREE from 'three';
import { rand, pick } from './config.js';
import { buildMonster, poseMonster } from './monsters.js';

// 4 типа тварей (процедурный боди-хоррор): бой, скорость, аним-длительности
export const TYPES = {
  minion:  { hp: 36,  speed: 7.4, dmg: 8,  score: 100, radius: 0.4,  height: 1.85, baseY: 0,
             atkDur: 0.55, dieDur: 1.5, range: 2.0, cd: [0.7, 1.1], label: 'СКОРОХОД' },
  rogue:   { hp: 30,  speed: 6.6, dmg: 10, score: 120, radius: 0.42, height: 1.55, baseY: 0,
             atkDur: 0.85, dieDur: 1.5, range: 1.9, cd: [0.6, 1.0], label: 'РЕЗАК' },
  warrior: { hp: 150, speed: 3.5, dmg: 24, score: 250, radius: 0.62, height: 2.3, baseY: 0,
             atkDur: 1.3, dieDur: 1.9, range: 2.6, cd: [1.1, 1.7], label: 'КЛЕЩ' },
  mage:    { hp: 60,  speed: 3.4, dmg: 16, score: 200, radius: 0.5,  height: 2.1, baseY: 0.45,
             atkDur: 1.4, dieDur: 1.3, ranged: true, keepMin: 9, keepMax: 15, cd: [1.7, 2.5], label: 'ПЛОД' },
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const SPAWN_T = 0.9;

export class EnemyManager {
  constructor(scene, tex, fx, sfx, hooks) {
    this.scene = scene; this.tex = tex; this.fx = fx; this.sfx = sfx; this.hooks = hooks || {};
    this.list = []; this.projectiles = [];
    this.time = 0;
    this._dripC = new THREE.Color(0x5e0a08);
  }

  spawn(typeName, x, z, wave = 1) {
    const T = TYPES[typeName];
    if (!T) return null;
    const group = new THREE.Group();
    const built = buildMonster(typeName, this.tex);
    const body = built.root;
    group.add(body);
    // материалы клонируем под каждую тварь (вспышка урона через emissive)
    const mats = [];
    body.traverse(o => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.frustumCulled = false;
        if (o.material.emissive) mats.push(o.material);
      }
    });
    // blob-тень
    const sh = new THREE.Mesh(
      new THREE.PlaneGeometry(T.radius * 3.4, T.radius * 3.4),
      new THREE.MeshBasicMaterial({ map: this.tex.shadow, transparent: true, opacity: 0.55, depthWrite: false })
    );
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.02; sh.renderOrder = 1;
    group.add(sh);

    group.position.set(x, 0, z);
    this.scene.add(group);

    const e = {
      typeName, T, group,
      root: body, j: built.joints, mats,
      pos: group.position,
      hp: T.hp * (1 + wave * 0.07), maxHp: T.hp * (1 + wave * 0.07),
      speed: T.speed * Math.min(1.28, 1 + wave * 0.02),
      state: 'spawn', t: 0, animT: 0, animDur: SPAWN_T, atkDur: T.atkDur,
      cdT: rand(T.cd[0], T.cd[1]) * 0.6,
      phase: rand(0, 6.28), seed: rand(0, 20),
      twitch: 0, spasm: 0, twist: rand(-0.16, 0.16), tilt: rand(-0.14, 0.14),
      baseY: T.baseY || 0,
      growlT: rand(2, 7), strafeDir: Math.random() < 0.5 ? 1 : -1,
      appliedHit: false, flashT: 0, staggerT: 0,
    };
    attachEnemyDamage(e, this, this.hooks);
    this.list.push(e);
    return e;
  }

  get aliveCount() {
    let n = 0;
    for (const e of this.list) if (e.state !== 'dying' && e.state !== 'dead') n++;
    return n;
  }

  update(dt, player, arena) {
    this.time += dt;
    const t = this.time, fx = this.fx, sfx = this.sfx;

    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.flashT > 0) {
        e.flashT -= dt;
        if (e.flashT <= 0) for (const m of e.mats) m.emissive.setHex(0x000000);
      }
      const dx = player.pos.x - e.pos.x, dz = player.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      const nx = dx / (dist || 1), nz = dz / (dist || 1);

      switch (e.state) {
        case 'spawn': {
          e.t += dt; e.animT += dt;
          poseMonster(e, dt, t);
          if (e.t >= SPAWN_T) { e.state = 'chase'; e.t = 0; }
          break;
        }
        case 'chase': {
          if (e.staggerT > 0) { e.staggerT -= dt; break; }
          e.cdT -= dt;
          let mx = nx, mz = nz;
          if (e.T.ranged) {
            if (dist < e.T.keepMin) { mx = -nx; mz = -nz; }
            else if (dist < e.T.keepMax) { mx = -nz * e.strafeDir * 0.6; mz = nx * e.strafeDir * 0.6; }
            if (Math.random() < dt * 0.3) e.strafeDir *= -1;
          }
          this._moveWithSteering(e, mx, mz, e.speed, dt, arena);
          // поворот к игроку
          const targetRot = Math.atan2(dx, dz);
          let d = targetRot - e.group.rotation.y;
          while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
          e.group.rotation.y += d * Math.min(1, dt * 10);
          // атака?
          const wantAttack = e.T.ranged ? (dist < e.T.keepMax + 3) : (dist < e.T.range);
          if (wantAttack && e.cdT <= 0) {
            e.state = 'attack'; e.t = 0; e.animT = 0; e.animDur = e.atkDur; e.appliedHit = false;
            if (!e.T.ranged) sfx.swing();
          }
          // рычание
          e.growlT -= dt;
          if (e.growlT <= 0) { e.growlT = rand(4, 9); sfx.growl(e.typeName === 'warrior' ? 60 : e.typeName === 'mage' ? 120 : 90); }
          // подтёки крови из пасти у мясника и клеща
          if (e.typeName !== 'mage' && Math.random() < dt * 1.1) {
            const hd = e.typeName === 'warrior' ? e.T.height * 0.68 : e.T.height * 0.78;
            fx.voxel(e.pos.x, e.pos.y + hd, e.pos.z, 0, -1.4, 0, this._dripC, 0.026, 1.7, { bounce: 0 });
          }
          break;
        }
        case 'attack': {
          e.t += dt; e.animT += dt;
          // лёгкий дожим вперёд у милишников
          if (!e.T.ranged && dist > e.T.range * 0.6) {
            this._moveWithSteering(e, nx, nz, 1.3, dt, arena);
          }
          if (!e.appliedHit && e.t >= e.atkDur * (e.T.ranged ? 0.55 : 0.45)) {
            e.appliedHit = true;
            if (e.T.ranged) {
              this._fireProjectile(e, player);
            } else if (dist < e.T.range + 0.6) {
              player.damage(e.T.dmg, null, sfx, this.hooks.hud);
            }
          }
          if (e.t >= e.atkDur + 0.12) {
            e.cdT = rand(e.T.cd[0], e.T.cd[1]);
            e.state = 'chase';
          }
          break;
        }
        case 'dying': {
          e.t += dt; e.animT += dt;
          if (e.t >= e.T.dieDur) {
            this.fx.dissolve(e.pos, e.T.radius * 1.1, e.T.height);
            sfx.boneCrack();
            this._remove(i);
            continue;
          }
          break;
        }
      }
      poseMonster(e, dt, t);
    }

    // --- снаряды ПЛОДОВ ---
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.vel.y -= 5.5 * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      p.mesh.rotation.x += dt * 7; p.mesh.rotation.y += dt * 5;
      p.life -= dt;
      let boom = p.life <= 0 || p.pos.y < 0.08;
      const pdx = player.pos.x - p.pos.x, pdz = player.pos.z - p.pos.z, pdy = (player.pos.y + 1) - p.pos.y;
      if (!boom && pdx * pdx + pdz * pdz < 0.45 && Math.abs(pdy) < 1.2) {
        player.damage(p.dmg, null, sfx, this.hooks.hud);
        boom = true;
      }
      if (boom) {
        this.fx.explosion(p.pos);
        this.fx.splash(p.pos);
        sfx.explosion();
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  // движение с обходом препятствий + подъём по ступеням
  _moveWithSteering(e, mx, mz, speed, dt, arena) {
    const probe = 0.9 + e.T.radius;
    const blocked = (x, z) => {
      if (Math.abs(x) > 30.6 || Math.abs(z) > 30.6) return true;
      for (const c of arena.colliders) {
        if (c.max.y - e.pos.y <= 0.7) continue;         // ступень — можно зайти
        if (e.pos.y + e.T.height < c.min.y) continue;
        if (x > c.min.x - e.T.radius && x < c.max.x + e.T.radius &&
            z > c.min.z - e.T.radius && z < c.max.z + e.T.radius) return true;
      }
      return false;
    };
    let dirx = mx, dirz = mz;
    if ((mx || mz) && blocked(e.pos.x + dirx * probe, e.pos.z + dirz * probe)) {
      const base = Math.atan2(mz, mx);
      let found = false;
      for (const s of [0.65, -0.65, 1.3, -1.3, 2.0, -2.0]) {
        const a = base + s * (e.strafeDir || 1);
        const tx = Math.cos(a), tz = Math.sin(a);
        if (!blocked(e.pos.x + tx * probe, e.pos.z + tz * probe)) { dirx = tx; dirz = tz; found = true; break; }
      }
      if (!found) { dirx = -mx; dirz = -mz; }
      e.strafeDir *= -1;
    }
    e.pos.x += dirx * speed * dt;
    e.pos.z += dirz * speed * dt;
    this._separate(e);
    arena.clampCircle(e.pos, e.T.radius, e.pos.y, e.T.height);
    // следование по высоте (ступени/платформа)
    const g = arena.groundTopAt(e.pos.x, e.pos.z, e.pos.y + 0.05);
    if (g > e.pos.y) e.pos.y = Math.min(g, e.pos.y + 4 * dt);
    else e.pos.y = Math.max(g, e.pos.y - 7 * dt);
  }

  _separate(e) {
    for (const o of this.list) {
      if (o === e || o.state === 'dying' || o.state === 'dead') continue;
      const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z;
      const rr = e.T.radius + o.T.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (rr - d) * 0.5 / d;
        e.pos.x += dx * push; e.pos.z += dz * push;
      }
    }
  }

  _fireProjectile(e, player) {
    const mesh = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: 0xb060ff }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.glow, color: 0x9a30ff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(1.1);
    mesh.add(core, glow);
    const start = _v.set(e.pos.x, e.pos.y + e.T.height * 0.65, e.pos.z);
    mesh.position.copy(start);
    this.scene.add(mesh);
    // упреждение
    const t = Math.min(1.2, Math.hypot(player.pos.x - start.x, player.pos.z - start.z) / 13);
    const target = _v2.set(player.pos.x + player.vel.x * t * 0.5, player.pos.y + 1.1, player.pos.z + player.vel.z * t * 0.5);
    const dir = target.sub(start).normalize();
    this.projectiles.push({
      mesh, pos: start.clone(), vel: dir.multiplyScalar(13),
      dmg: e.T.dmg, life: 6,
    });
    this.sfx.portal();
  }

  damageEnemy(e, amount, point, dir, head) { e.damage(amount, point, dir, head); }

  // попадание луча по цилиндру врага
  raycast(o, d, maxDist) {
    let best = null;
    for (const e of this.list) {
      if (e.state === 'dying' || e.state === 'dead') continue;
      const ox = o.x - e.pos.x, oz = o.z - e.pos.z;
      const r = e.T.radius * 1.15;
      const a = d.x * d.x + d.z * d.z;
      const b = 2 * (d.x * ox + d.z * oz);
      const c = ox * ox + oz * oz - r * r;
      const disc = b * b - 4 * a * c;
      if (disc < 0) continue;
      const sq = Math.sqrt(disc);
      let t = (-b - sq) / (2 * a);
      if (t < 0.01) t = (-b + sq) / (2 * a);
      if (t < 0.01 || t > maxDist) continue;
      if (best && t >= best.dist) continue;
      const y = o.y + d.y * t;
      const y0 = e.pos.y, y1 = e.pos.y + e.T.height;
      if (y < y0 - 0.05 || y > y1 + 0.1) continue;
      best = { dist: t, point: new THREE.Vector3(o.x + d.x * t, y, o.z + d.z * t), enemy: e, head: y > y0 + e.T.height * 0.72 };
    }
    return best;
  }

  _remove(i) {
    const e = this.list[i];
    this.scene.remove(e.group);
    this.list.splice(i, 1);
  }

  killAllInstant() {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      this.fx.gib(e.pos, e.T === TYPES.warrior);
      this._remove(i);
    }
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles.length = 0;
  }

  clear() {
    for (const e of this.list) this.scene.remove(e.group);
    this.list.length = 0;
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles.length = 0;
  }
}

// урон: вспышка, кровь, гибс или анимация смерти
export function attachEnemyDamage(e, mgr, hooks) {
  e.damage = function (amount, point, dir, head) {
    if (e.state === 'dead' || e.state === 'dying') return;
    e.hp -= amount;
    e.flashT = 0.09;
    for (const m of e.mats) m.emissive.setHex(0x881111);
    mgr.fx.blood(point || e.pos, dir || _v.set(0, 1, 0), head ? 24 : 13, head ? 1.35 : 1);
    if (e.state === 'chase') e.staggerT = Math.min(0.22, amount / 90);
    if (e.hp <= 0) {
      e.state = 'dead';
      const big = e.T === TYPES.warrior;
      if (head || Math.random() < 0.55) {
        mgr.fx.gib(e.pos, big);
        mgr.sfx.gib();
        hooks.onKill(e, head, true);
        mgr.scene.remove(e.group);
        const i = mgr.list.indexOf(e);
        if (i >= 0) mgr.list.splice(i, 1);
      } else {
        e.state = 'dying';
        e.t = 0; e.animT = 0; e.animDur = e.T.dieDur;
        mgr.sfx.gib();
        hooks.onKill(e, head, false);
      }
    }
  };
}
