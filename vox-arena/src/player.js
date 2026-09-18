import * as THREE from 'three';
import { rand, clamp } from './config.js';
import { buildRifle } from './weapon-model.js';

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _muzzleP = new THREE.Vector3();
const _hitP = new THREE.Vector3();
const _rightDir = new THREE.Vector3();

export class Player {
  constructor(camera, gunAssets) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, 0, 16);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.hp = 100; this.maxHp = 100;
    this.onGround = true;
    this.radius = 0.38; this.eyeH = 1.62; this.height = 1.75;

    // оружие
    this.mag = 30; this.magSize = 30;
    this.fireInterval = 60 / 640;
    this.cd = 0; this.heat = 0;
    this.reloading = false; this.reloadT = 0; this.reloadDur = 1.5;
    this.recoilPitch = 0; this.recoilVel = 0; this.kickZ = 0;
    this.baseDamage = 14;

    // вьюмодель
    this.gun = gunAssets.group;
    this.gunMuzzle = gunAssets.muzzle;
    this.gunBolt = gunAssets.bolt;
    this.gunBase = new THREE.Vector3(0.24, -0.22, -0.44);
    this.gun.position.copy(this.gunBase);
    camera.add(this.gun);
    this.swayX = 0; this.swayY = 0;
    this.bobPhase = 0; this.bobAmt = 0;
    this.shake = 0;
    this.bobEnabled = true; this.shakeEnabled = true;

    this.onShoot = null; this.onHit = null; this.onDry = null; this.onReload = null; this.onDead = null;
  }

  get eyePos() { return _hitP.set(this.pos.x, this.pos.y + this.eyeH, this.pos.z); }

  reset() {
    this.pos.set(0, 0, 16); this.vel.set(0, 0, 0);
    this.yaw = 0; this.pitch = 0;
    this.hp = this.maxHp;
    this.mag = this.magSize; this.reloading = false; this.cd = 0; this.heat = 0;
    this.recoilPitch = 0; this.recoilVel = 0; this.shake = 0;
  }

  // dir: экранное направление с разбросом
  _shootDir(spread) {
    this.camera.getWorldDirection(_fwd);
    if (spread > 0) {
      _fwd.x += rand(-spread, spread); _fwd.y += rand(-spread, spread); _fwd.z += rand(-spread, spread);
      _fwd.normalize();
    }
    return _fwd;
  }

  update(dt, input, arena, ctx) {
    const { enemies, fx, sfx, hud } = ctx;

    // --- движение ---
    const sprint = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
    const maxSpeed = sprint ? 9.2 : 6.4;
    this.camera.getWorldDirection(_fwd); _fwd.y = 0; _fwd.normalize();
    _right.crossVectors(_fwd, new THREE.Vector3(0, 1, 0)); // fwd×up = вправо
    let ix = 0, iz = 0;
    if (input.keys.has('KeyW')) iz += 1;
    if (input.keys.has('KeyS')) iz -= 1;
    if (input.keys.has('KeyD')) ix += 1;
    if (input.keys.has('KeyA')) ix -= 1;
    _wish.set(0, 0, 0).addScaledVector(_fwd, iz).addScaledVector(_right, ix);
    if (_wish.lengthSq() > 0) _wish.normalize();

    const accel = this.onGround ? 52 : 10;
    this.vel.x += _wish.x * accel * dt;
    this.vel.z += _wish.z * accel * dt;
    if (this.onGround) {
      const fr = Math.max(0, 1 - 9 * dt);
      this.vel.x *= fr; this.vel.z *= fr;
      const sp = Math.hypot(this.vel.x, this.vel.z);
      if (sp > maxSpeed) { this.vel.x *= maxSpeed / sp; this.vel.z *= maxSpeed / sp; }
    } else {
      const sp = Math.hypot(this.vel.x, this.vel.z);
      const cap = Math.max(maxSpeed, sp); // в воздухе не разгоняемся сверх
      if (sp > cap) { this.vel.x *= cap / sp; this.vel.z *= cap / sp; }
    }

    if (this.onGround && input.jump) { this.vel.y = 8.6; this.onGround = false; input.jump = false; }
    this.vel.y -= 24 * dt;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    arena.clampCircle(this.pos, this.radius, this.pos.y, this.height);
    const g = arena.groundTopAt(this.pos.x, this.pos.z, this.pos.y - this.vel.y * dt);
    if (this.pos.y <= g + 0.02 && this.vel.y <= 0) {
      if (!this.onGround && this.vel.y < -9) this.shake = Math.min(0.25, -this.vel.y * 0.012);
      this.pos.y = g; this.vel.y = 0; this.onGround = true;
    } else if (this.pos.y > g + 0.05) this.onGround = false;
    if (this.pos.y < -2) { this.pos.y = 0; this.vel.y = 0; }

    // --- покачивание ---
    const speedXZ = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && speedXZ > 0.5) this.bobPhase += dt * speedXZ * 1.55;
    this.bobAmt += ((this.onGround && speedXZ > 0.5 ? 1 : 0) - this.bobAmt) * Math.min(1, dt * 8);
    const bobY = this.bobEnabled ? Math.sin(this.bobPhase * 2) * 0.028 * this.bobAmt : 0;
    const bobX = this.bobEnabled ? Math.cos(this.bobPhase) * 0.017 * this.bobAmt : 0;

    // --- тряска ---
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.6);
      if (!this.shakeEnabled) this.shake = 0;
    }
    const shX = (Math.random() - 0.5) * this.shake * 0.5;
    const shY = (Math.random() - 0.5) * this.shake * 0.5;

    // --- камера ---
    this.recoilVel += (-this.recoilPitch * 130 - this.recoilVel * 13) * dt;
    this.recoilPitch += this.recoilVel * dt;
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch + this.recoilPitch, this.yaw, -ix * 0.014);
    this.camera.position.set(this.pos.x + bobX + shX, this.pos.y + this.eyeH + bobY + shY, this.pos.z);

    // --- оружие ---
    this.cd -= dt;
    this.heat = Math.max(0, this.heat - dt * 0.9);
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) { this.reloading = false; this.mag = this.magSize; }
    }
    if (input.fire && !this.reloading && this.cd <= 0) {
      if (this.mag > 0) this._fire(arena, enemies, fx, sfx, hud);
      else {
        this.cd = 0.25; sfx.dry(); this._startReload(sfx);
      }
    }
    if (input.reload && !this.reloading && this.mag < this.magSize) this._startReload(sfx);
    input.reload = false;
    input.jump = false;

    // --- вьюмодель ---
    this.swayX += ((input.lookDX || 0)) * 0.00006; this.swayY += ((input.lookDY || 0)) * 0.00006;
    this.swayX = clamp(this.swayX, -0.03, 0.03); this.swayY = clamp(this.swayY, -0.03, 0.03);
    this.swayX *= Math.max(0, 1 - dt * 8); this.swayY *= Math.max(0, 1 - dt * 8);
    this.kickZ *= Math.max(0, 1 - dt * 10);
    const gp = this.gun.position;
    gp.set(
      this.gunBase.x + this.swayX + bobX * 0.6,
      this.gunBase.y + this.swayY + bobY * 0.8,
      this.gunBase.z + this.kickZ
    );
    let rx = -this.swayY * 4 + this.kickZ * 1.6, ry = this.swayX * 2, rz = 0;
    if (this.reloading) {
      const t = 1 - this.reloadT / this.reloadDur;
      const dip = Math.sin(Math.min(1, t) * Math.PI);
      rx -= dip * 0.7; rz = dip * 0.35;
      gp.y -= dip * 0.09;
    }
    this.gun.rotation.set(rx, ry, rz);
    // затвор
    const boltBack = Math.max(0, this.kickZ / 0.05);
    this.gunBolt.position.z = 0.06 + boltBack * 0.045;
  }

  _startReload(sfx) {
    this.reloading = true; this.reloadT = this.reloadDur;
    sfx.reload();
    if (this.onReload) this.onReload();
  }

  _fire(arena, enemies, fx, sfx, hud) {
    this.mag--;
    this.cd = this.fireInterval;
    this.heat = Math.min(1, this.heat + 0.085);
    const spread = 0.004 + this.heat * 0.019 + (this.onGround ? 0 : 0.012) + Math.hypot(this.vel.x, this.vel.z) * 0.0012;
    const dir = this._shootDir(spread).clone();
    const origin = this.camera.getWorldPosition(new THREE.Vector3());

    this.gunMuzzle.getWorldPosition(_muzzleP);
    fx.muzzle(_muzzleP, dir);
    _rightDir.set(1, 0.2, 0).applyQuaternion(this.camera.quaternion);
    fx.casing(_muzzleP.clone().addScaledVector(dir, -0.25), _rightDir);
    sfx.shot();
    this.recoilVel += rand(1.9, 2.5);
    this.kickZ = 0.05;

    const MAXD = 120;
    const eHit = enemies.raycast(origin, dir, MAXD);
    const wHit = arena.raycastWorld(origin, dir, eHit ? eHit.dist : MAXD);
    let point, hitEnemy = null, head = false;
    if (eHit && (!wHit || eHit.dist < wHit.dist)) { point = eHit.point; hitEnemy = eHit.enemy; head = eHit.head; }
    else if (wHit) point = wHit.point;
    else point = origin.clone().addScaledVector(dir, 80);

    fx.tracer(_muzzleP, point);

    if (hitEnemy) {
      let dmg = this.baseDamage + rand(-2, 2);
      if (head) dmg *= 2.6;
      hitEnemy.damage(dmg, point, dir, head);
      if (this.onHit) this.onHit({ head, killed: hitEnemy.hp <= 0, enemy: hitEnemy });
    } else if (wHit) {
      fx.impact(point, wHit.normal);
      sfx.boneCrack();
    }
  }

  damage(amount, fromDir, sfx, hud) {
    if (this.hp <= 0) return;
    this.hp = Math.max(0, this.hp - amount);
    this.shake = Math.min(0.55, this.shake + 0.22);
    sfx.hurt();
    hud.damageFlash();
    if (this.hp <= 0 && this.onDead) this.onDead();
  }
  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }
}
