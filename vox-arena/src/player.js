import * as THREE from 'three';
import { rand, clamp } from './config.js';
import { buildRifle, buildShotgun, buildKickLeg } from './weapon-model.js';

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _muzzleP = new THREE.Vector3();
const _hitP = new THREE.Vector3();
const _rightDir = new THREE.Vector3();
const _shotDirVec = new THREE.Vector3();

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, 0, 16);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.hp = 100; this.maxHp = 100;
    this.onGround = true;
    this.radius = 0.38; this.eyeH = 1.62; this.height = 1.75;

    // ========================================================================
    // Оружие и инвентарь
    // ========================================================================
    this.rifleAssets = buildRifle();
    this.shotgunAssets = buildShotgun();
    this.kickLeg = buildKickLeg();

    // Базовые позиции вьюмоделей
    this.rifleBase = new THREE.Vector3(0.24, -0.22, -0.44);
    this.shotgunBase = new THREE.Vector3(0.22, -0.20, -0.42);

    this.rifleAssets.group.position.copy(this.rifleBase);
    this.shotgunAssets.group.position.copy(this.shotgunBase);

    camera.add(this.rifleAssets.group);
    camera.add(this.shotgunAssets.group);
    camera.add(this.kickLeg);

    this.weapons = [
      {
        name: 'СЕКТОР-9',
        type: 'rifle',
        assets: this.rifleAssets,
        basePos: this.rifleBase,
        magSize: 30,
        mag: 30,
        fireInterval: 60 / 640,
        reloadDur: 1.5,
        baseDamage: 14,
        pellets: 1,
        spread: 0.005,
        auto: true,
      },
      {
        name: 'ПАЛАЧ',
        type: 'shotgun',
        assets: this.shotgunAssets,
        basePos: this.shotgunBase,
        magSize: 2,
        mag: 2,
        fireInterval: 0.42,
        reloadDur: 1.85,
        baseDamage: 18, // 18 * 9 дробин = 162 урона в упор!
        pellets: 9,
        spread: 0.055,
        auto: false,
      },
    ];

    this.curSlot = 0;
    this.prevSlot = 1;
    this.switching = false;
    this.switchT = 0;
    this.switchDur = 0.32;
    this.nextSlot = 0;

    // Текущее состояние активного оружия
    this.cd = 0;
    this.heat = 0;
    this.reloading = false;
    this.reloadT = 0;
    this.recoilPitch = 0;
    this.recoilVel = 0;
    this.kickZ = 0;

    // ========================================================================
    // Тактический фонарь (Tactical Flashlight System)
    // 1) Hotspot (SpotLight): мощный луч вперед с мягким градиентом
    // 2) Spill / Ambient Glow (PointLight): рассеянный ореол, освещающий пол,
    //    стены по бокам и тварей вокруг игрока
    // ========================================================================
    this.flashlightOn = true;

    // Центральный прожекторный луч (Hotspot)
    this.spotLight = new THREE.SpotLight(0xfff6e4, 5.8, 54, Math.PI / 3.4, 0.65, 1.1);
    this.spotLight.position.set(0.16, -0.12, -0.05);

    this.spotLightTarget = new THREE.Object3D();
    this.spotLightTarget.position.set(0.16, -0.12, -15);
    camera.add(this.spotLightTarget);
    this.spotLight.target = this.spotLightTarget;
    camera.add(this.spotLight);

    // Рассеянный ореол вокруг игрока (Surrounding Spill Light)
    // Освещает окружение, пол под ногами, стены и монстров на периферии
    this.spillLight = new THREE.PointLight(0xffecd0, 2.4, 18, 1.4);
    this.spillLight.position.set(0.16, -0.10, -0.2);
    camera.add(this.spillLight);

    // ========================================================================
    // Боевой армейский пинок (Melee Kick)
    // ========================================================================
    this.isKicking = false;
    this.kickT = 0;
    this.kickDur = 0.48;
    this.kickCd = 0;
    this.kickHitApplied = false;

    // Вьюмодель и покачивание
    this.swayX = 0; this.swayY = 0;
    this.bobPhase = 0; this.bobAmt = 0;
    this.shake = 0;
    this.bobEnabled = true; this.shakeEnabled = true;

    // Колбэки
    this.onShoot = null; this.onHit = null; this.onDry = null; this.onReload = null; this.onDead = null;

    this._updateWeaponVisibility();
  }

  get curWeapon() { return this.weapons[this.curSlot]; }
  get mag() { return this.curWeapon.mag; }
  set mag(v) { this.curWeapon.mag = v; }
  get magSize() { return this.curWeapon.magSize; }
  get reloadDur() { return this.curWeapon.reloadDur; }
  get eyePos() { return _hitP.set(this.pos.x, this.pos.y + this.eyeH, this.pos.z); }

  reset(x = 0, y = 0, z = 16, yaw = 0) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.hp = this.maxHp;

    this.weapons[0].mag = this.weapons[0].magSize;
    this.weapons[1].mag = this.weapons[1].magSize;
    this.curSlot = 0;
    this.switching = false;
    this.switchT = 0;

    this.reloading = false; this.cd = 0; this.heat = 0;
    this.recoilPitch = 0; this.recoilVel = 0; this.shake = 0;

    this.isKicking = false;
    this.kickT = 0;
    this.kickCd = 0;
    this.kickLeg.visible = false;

    this.flashlightOn = true;
    this.spotLight.intensity = 5.8;
    this.spillLight.intensity = 2.4;

    this._updateWeaponVisibility();
  }

  _updateWeaponVisibility() {
    this.rifleAssets.group.visible = (this.curSlot === 0);
    this.shotgunAssets.group.visible = (this.curSlot === 1);
  }

  toggleFlashlight(sfx, hud) {
    this.flashlightOn = !this.flashlightOn;
    this.spotLight.intensity = this.flashlightOn ? 5.8 : 0;
    this.spillLight.intensity = this.flashlightOn ? 2.4 : 0;
    if (sfx) sfx.click();
    if (hud) hud.setFlashlight(this.flashlightOn);
  }

  switchWeapon(slot, sfx, hud) {
    if (slot === this.curSlot || slot < 0 || slot >= this.weapons.length || this.switching) return;
    this.switching = true;
    this.switchT = 0;
    this.nextSlot = slot;
    if (this.reloading) this.reloading = false;
    if (sfx) sfx.weaponSwitch();
  }

  quickSwitch(sfx, hud) {
    const next = this.curSlot === 0 ? 1 : 0;
    this.switchWeapon(next, sfx, hud);
  }

  // Направление выстрела со сферическим разбросом
  _shootDir(spread) {
    this.camera.getWorldDirection(_fwd);
    if (spread > 0) {
      _fwd.x += rand(-spread, spread);
      _fwd.y += rand(-spread, spread);
      _fwd.z += rand(-spread, spread);
      _fwd.normalize();
    }
    return _fwd;
  }

  // Запуск боевого пинка ногой
  startKick(sfx) {
    if (this.isKicking || this.kickCd > 0) return;
    this.isKicking = true;
    this.kickT = 0;
    this.kickCd = 0.62;
    this.kickHitApplied = false;
    this.kickLeg.visible = true;
    if (sfx) sfx.swing();
  }

  update(dt, input, arena, ctx) {
    const { enemies, fx, sfx, hud, props } = ctx;
    const w = this.curWeapon;

    // --- Переключение оружия по клавишам ---
    if (input.keys.has('Digit1') || input.keys.has('Numpad1')) {
      this.switchWeapon(0, sfx, hud);
    } else if (input.keys.has('Digit2') || input.keys.has('Numpad2')) {
      this.switchWeapon(1, sfx, hud);
    } else if (input.keys.has('KeyQ')) {
      this.quickSwitch(sfx, hud);
      input.keys.delete('KeyQ');
    }

    // Переключение фонарика
    if (input.keys.has('KeyT') || input.keys.has('KeyL')) {
      this.toggleFlashlight(sfx, hud);
      input.keys.delete('KeyT');
      input.keys.delete('KeyL');
    }

    // Боевой пинок (F / V / RMB)
    if (input.kick || input.keys.has('KeyF') || input.keys.has('KeyV')) {
      this.startKick(sfx);
      input.kick = false;
      input.keys.delete('KeyF');
      input.keys.delete('KeyV');
    }

    // --- Движение игрока ---
    const sprint = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
    const maxSpeed = sprint ? 9.2 : 6.4;
    this.camera.getWorldDirection(_fwd); _fwd.y = 0; _fwd.normalize();
    _right.crossVectors(_fwd, new THREE.Vector3(0, 1, 0));
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
      const cap = Math.max(maxSpeed, sp);
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

    // --- Покачивание ---
    const speedXZ = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && speedXZ > 0.5) this.bobPhase += dt * speedXZ * 1.55;
    this.bobAmt += ((this.onGround && speedXZ > 0.5 ? 1 : 0) - this.bobAmt) * Math.min(1, dt * 8);
    const bobY = this.bobEnabled ? Math.sin(this.bobPhase * 2) * 0.028 * this.bobAmt : 0;
    const bobX = this.bobEnabled ? Math.cos(this.bobPhase) * 0.017 * this.bobAmt : 0;

    // --- Тряска ---
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.6);
      if (!this.shakeEnabled) this.shake = 0;
    }
    const shX = (Math.random() - 0.5) * this.shake * 0.5;
    const shY = (Math.random() - 0.5) * this.shake * 0.5;

    // --- Камера ---
    this.recoilVel += (-this.recoilPitch * 130 - this.recoilVel * 13) * dt;
    this.recoilPitch += this.recoilVel * dt;
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch + this.recoilPitch, this.yaw, -ix * 0.014);
    this.camera.position.set(this.pos.x + bobX + shX, this.pos.y + this.eyeH + bobY + shY, this.pos.z);

    // --- Анимация смены оружия ---
    let switchDip = 0;
    if (this.switching) {
      this.switchT += dt;
      const half = this.switchDur * 0.5;
      if (this.switchT < half) {
        switchDip = (this.switchT / half);
      } else {
        if (this.curSlot !== this.nextSlot) {
          this.prevSlot = this.curSlot;
          this.curSlot = this.nextSlot;
          this._updateWeaponVisibility();
          if (hud) {
            hud.setWeaponSlot(this.curSlot);
            hud.setAmmo(this.mag, this.magSize, false, this.curSlot === 1);
          }
        }
        switchDip = (1 - (this.switchT - half) / half);
      }
      if (this.switchT >= this.switchDur) {
        this.switching = false;
        switchDip = 0;
      }
    }

    // --- Перезарядка и таймеры оружия ---
    this.cd -= dt;
    this.kickCd -= dt;
    this.heat = Math.max(0, this.heat - dt * 0.9);

    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.reloading = false;
        this.mag = this.magSize;
        if (hud) hud.setAmmo(this.mag, this.magSize, false, this.curSlot === 1);
      }
    }

    // --- Стрельба ---
    const wantsFire = w.auto ? input.fire : (input.fireOnce || (input.fire && this.cd <= 0));
    input.fireOnce = false;

    if (wantsFire && !this.reloading && !this.switching && this.cd <= 0) {
      if (this.mag > 0) {
        if (w.type === 'shotgun') this._fireShotgun(arena, enemies, fx, sfx, hud, props);
        else this._fireRifle(arena, enemies, fx, sfx, hud, props);
      } else {
        this.cd = 0.25; sfx.dry(); this._startReload(sfx, hud);
      }
    }

    if (input.reload && !this.reloading && !this.switching && this.mag < this.magSize) {
      this._startReload(sfx, hud);
    }
    input.reload = false;
    input.jump = false;

    // --- Анимация вьюмодели текущего оружия ---
    this.swayX += ((input.lookDX || 0)) * 0.00006; this.swayY += ((input.lookDY || 0)) * 0.00006;
    this.swayX = clamp(this.swayX, -0.03, 0.03); this.swayY = clamp(this.swayY, -0.03, 0.03);
    this.swayX *= Math.max(0, 1 - dt * 8); this.swayY *= Math.max(0, 1 - dt * 8);
    this.kickZ *= Math.max(0, 1 - dt * 10);

    const curGroup = (this.curSlot === 0 ? this.rifleAssets.group : this.shotgunAssets.group);
    const curBase = (this.curSlot === 0 ? this.rifleBase : this.shotgunBase);
    const gp = curGroup.position;

    gp.set(
      curBase.x + this.swayX + bobX * 0.6,
      curBase.y + this.swayY + bobY * 0.8 - switchDip * 0.35,
      curBase.z + this.kickZ
    );

    let rx = -this.swayY * 4 + this.kickZ * 1.6 - switchDip * 0.8;
    let ry = this.swayX * 2;
    let rz = 0;

    if (this.reloading) {
      const t = 1 - this.reloadT / this.reloadDur;
      if (w.type === 'rifle') {
        const dip = Math.sin(Math.min(1, t) * Math.PI);
        rx -= dip * 0.7; rz = dip * 0.35; gp.y -= dip * 0.09;
      } else {
        // ====================================================================
        // Переломная перезарядка двустволки «ПАЛАЧ»
        // Стволы отклоняются СТРОГО ВНИЗ (отрицательный pitch -X),
        // казённик открывается вверх навстречу игроку
        // ====================================================================
        const breakPhase = Math.sin(Math.min(1, t) * Math.PI);
        // Ствол переламывается вниз (-0.85 рад)
        const barrelAngle = Math.max(0, Math.sin(t * Math.PI)) * 0.85;
        this.shotgunAssets.barrelGroup.rotation.x = -barrelAngle;

        // Поворот рычага отпирания стволов
        if (this.shotgunAssets.lever) {
          this.shotgunAssets.lever.rotation.x = -0.3 + breakPhase * 0.45;
        }

        // Наклон самого обреза в руках (подставляем казённик под загрузку)
        rx -= breakPhase * 0.42;
        rz = breakPhase * 0.32;
        ry -= breakPhase * 0.15;
        gp.y -= breakPhase * 0.07;
        gp.x -= breakPhase * 0.03;

        const sL = this.shotgunAssets.shellL;
        const sR = this.shotgunAssets.shellR;

        // Фаза 1: Выброс стреляных гильз (t: 0.15 -> 0.38)
        if (t < 0.38) {
          if (sL && sR) {
            sL.visible = true; sR.visible = true;
            const ejectZ = -0.03 + Math.max(0, (t - 0.15) / 0.23) * 0.09;
            sL.position.z = ejectZ;
            sR.position.z = ejectZ;
          }
        }

        // Момент выброса физических гильз в воздух
        if (t >= 0.34 && t < 0.42 && !this._shotgunCased) {
          this._shotgunCased = true;
          this.camera.getWorldDirection(_fwd);
          _rightDir.set(0.6, 0.8, -0.2).applyQuaternion(this.camera.quaternion);
          const muzP = new THREE.Vector3();
          this.shotgunAssets.barrelGroup.getWorldPosition(muzP);
          fx.shotgunCasing(muzP, _rightDir);
          if (sL && sR) { sL.visible = false; sR.visible = false; }
        }

        // Фаза 2: Вставка новых патронов (t: 0.48 -> 0.78)
        if (t >= 0.48 && t < 0.82) {
          if (sL && sR) {
            sL.visible = true; sR.visible = true;
            const insertZ = 0.08 - Math.min(1, (t - 0.48) / 0.28) * 0.11;
            sL.position.z = insertZ;
            sR.position.z = insertZ;
          }
        }

        // Фаза 3: Захлопывание стволов
        if (t >= 0.82) {
          if (sL && sR) {
            sL.visible = true; sR.visible = true;
            sL.position.z = -0.03;
            sR.position.z = -0.03;
          }
        }
      }
    } else {
      if (this.shotgunAssets.barrelGroup) this.shotgunAssets.barrelGroup.rotation.x = 0;
      if (this.shotgunAssets.lever) this.shotgunAssets.lever.rotation.x = -0.3;
      if (this.shotgunAssets.shellL && this.shotgunAssets.shellR) {
        this.shotgunAssets.shellL.visible = true;
        this.shotgunAssets.shellR.visible = true;
        this.shotgunAssets.shellL.position.z = -0.03;
        this.shotgunAssets.shellR.position.z = -0.03;
      }
      this._shotgunCased = false;
    }

    curGroup.rotation.set(rx, ry, rz);

    // Затвор автомата
    if (this.curSlot === 0 && this.rifleAssets.bolt) {
      const boltBack = Math.max(0, this.kickZ / 0.05);
      this.rifleAssets.bolt.position.z = 0.06 + boltBack * 0.045;
    }

    // --- Анимация боевого пинка (Melee Kick) ---
    if (this.isKicking) {
      this.kickT += dt;
      const kp = this.kickT / this.kickDur;

      // Фаза удара: быстрый выпад вперёд и возврат
      let kickProgress = 0;
      if (kp < 0.35) {
        kickProgress = Math.sin((kp / 0.35) * (Math.PI / 2));
      } else {
        kickProgress = Math.cos(((kp - 0.35) / 0.65) * (Math.PI / 2));
      }

      this.kickLeg.position.set(
        0.18 - kickProgress * 0.18,
        -0.65 + kickProgress * 0.35,
        -0.25 - kickProgress * 0.55
      );
      this.kickLeg.rotation.set(
        kickProgress * 0.65,
        -kickProgress * 0.35,
        kickProgress * 0.2
      );

      // Момент максимального контакта ноги с целью (t ~ 0.3)
      if (kp >= 0.28 && !this.kickHitApplied) {
        this.kickHitApplied = true;
        this.camera.getWorldDirection(_fwd);
        const hitEnemy = enemies.kickMelee(this.eyePos, _fwd, 2.4, 20, 55);

        // Проверка пинка по физическим ящикам и объектам
        let hitProp = false;
        if (props) {
          const pHit = props.raycast(this.eyePos, _fwd, 2.6);
          if (pHit) {
            hitProp = true;
            // Мощнейший пинок по ящику — отправляет его в полет как снаряд
            const kickImpulse = _fwd.clone().multiplyScalar(44.0).add(new THREE.Vector3(0, 16.0, 0));
            pHit.prop.applyImpulse(pHit.point, kickImpulse, true);
            if (sfx) {
              sfx.crateThud(3.5);
              sfx.kick();
            }
            if (fx) fx.woodImpact(pHit.point, _fwd.clone().negate());
          }
        }

        if (hitEnemy || hitProp) {
          this.shake = Math.min(0.45, this.shake + 0.22);
        }
        enemies.alertSound(this.pos, 14);
      }

      if (this.kickT >= this.kickDur) {
        this.isKicking = false;
        this.kickLeg.visible = false;
      }
    }
  }

  _startReload(sfx, hud) {
    this.reloading = true;
    this.reloadT = this.reloadDur;
    if (this.curSlot === 1) {
      sfx.shotgunReload();
    } else {
      sfx.reload();
    }
    if (hud) hud.setAmmo(this.mag, this.magSize, true, this.curSlot === 1);
    if (this.onReload) this.onReload();
  }

  // Выстрел из автомата «СЕКТОР-9»
  _fireRifle(arena, enemies, fx, sfx, hud, props = null) {
    this.mag--;
    this.cd = this.curWeapon.fireInterval;
    this.heat = Math.min(1, this.heat + 0.085);
    const spread = this.curWeapon.spread + this.heat * 0.019 + (this.onGround ? 0 : 0.012) + Math.hypot(this.vel.x, this.vel.z) * 0.0012;
    const dir = this._shootDir(spread).clone();
    const origin = this.camera.getWorldPosition(new THREE.Vector3());

    this.rifleAssets.muzzle.getWorldPosition(_muzzleP);
    fx.muzzle(_muzzleP, dir);
    _rightDir.set(1, 0.2, 0).applyQuaternion(this.camera.quaternion);
    fx.casing(_muzzleP.clone().addScaledVector(dir, -0.25), _rightDir);
    sfx.shot();
    this.recoilVel += rand(1.9, 2.5);
    this.kickZ = 0.05;

    // Звук выстрела привлекает внимание врагов в радиусе слышимости
    enemies.alertSound(origin, 32);

    if (this.onShoot) this.onShoot();

    const MAXD = 120;
    const eHit = enemies.raycast(origin, dir, MAXD);
    const pHit = props ? props.raycast(origin, dir, MAXD) : null;
    const maxWorldD = Math.min(eHit ? eHit.dist : MAXD, pHit ? pHit.dist : MAXD);
    const wHit = arena.raycastWorld(origin, dir, maxWorldD);

    let point, hitEnemy = null, hitProp = null, head = false, hitZone = 'torso', isCorpse = false;

    // Определяем ближайшее попадание среди врагов, физ. объектов и геометрии
    const eDist = eHit ? eHit.dist : 9999;
    const pDist = pHit ? pHit.dist : 9999;
    const wDist = wHit ? wHit.dist : 9999;
    const minDist = Math.min(eDist, pDist, wDist);

    if (minDist === eDist && eHit) {
      point = eHit.point;
      hitEnemy = eHit.enemy;
      head = eHit.head;
      hitZone = eHit.hitZone || 'torso';
      isCorpse = !!eHit.isCorpse;
    } else if (minDist === pDist && pHit) {
      point = pHit.point;
      hitProp = pHit.prop;
    } else if (wHit) {
      point = wHit.point;
    } else {
      point = origin.clone().addScaledVector(dir, 80);
    }

    fx.tracer(_muzzleP, point);

    if (hitEnemy) {
      let dmg = this.curWeapon.baseDamage + rand(-2, 2);
      if (head) dmg *= 2.6;
      hitEnemy.damage(dmg, point, dir, { head, hitZone, isCorpse });
      if (this.onHit) this.onHit({ head, killed: hitEnemy.hp <= 0, enemy: hitEnemy, hitZone, isCorpse });
    } else if (hitProp) {
      // Попадание по физическому ящику: урон + импульс + щепки
      hitProp.damage(this.curWeapon.baseDamage + 4, point, dir, fx, sfx);
    } else if (wHit) {
      fx.impact(point, wHit.normal);
    }
  }

  // Выстрел из двуствольного обреза «ПАЛАЧ» (залп 9 дробин с высоким разлетом и отдачей)
  _fireShotgun(arena, enemies, fx, sfx, hud, props = null) {
    this.mag--;
    this.cd = this.curWeapon.fireInterval;
    const origin = this.camera.getWorldPosition(new THREE.Vector3());

    this.shotgunAssets.muzzle.getWorldPosition(_muzzleP);
    this.camera.getWorldDirection(_fwd);
    fx.shotgunMuzzle(_muzzleP, _fwd);
    sfx.shotgun();

    // Громкий выстрел обреза привлекает всех тварей в радиусе 45м
    enemies.alertSound(origin, 45);

    // Тяжелая отдача дробовика
    this.recoilVel += rand(5.5, 7.5);
    this.kickZ = 0.12;
    this.shake = Math.min(0.4, this.shake + 0.16);

    if (this.onShoot) this.onShoot();

    const pellets = this.curWeapon.pellets;
    const baseSpread = this.curWeapon.spread;
    let hitAny = false;
    let totalKilled = 0;

    for (let p = 0; p < pellets; p++) {
      const dir = this._shootDir(baseSpread).clone();
      const MAXD = 80;
      const eHit = enemies.raycast(origin, dir, MAXD);
      const pHit = props ? props.raycast(origin, dir, MAXD) : null;
      const maxWorldD = Math.min(eHit ? eHit.dist : MAXD, pHit ? pHit.dist : MAXD);
      const wHit = arena.raycastWorld(origin, dir, maxWorldD);

      let point, hitEnemy = null, hitProp = null, head = false, hitZone = 'torso', isCorpse = false;

      const eDist = eHit ? eHit.dist : 9999;
      const pDist = pHit ? pHit.dist : 9999;
      const wDist = wHit ? wHit.dist : 9999;
      const minDist = Math.min(eDist, pDist, wDist);

      if (minDist === eDist && eHit) {
        point = eHit.point;
        hitEnemy = eHit.enemy;
        head = eHit.head;
        hitZone = eHit.hitZone || 'torso';
        isCorpse = !!eHit.isCorpse;
      } else if (minDist === pDist && pHit) {
        point = pHit.point;
        hitProp = pHit.prop;
      } else if (wHit) {
        point = wHit.point;
      } else {
        point = origin.clone().addScaledVector(dir, 60);
      }

      // Трассер для каждого второго пеллета для PS1 стиля
      if (p % 2 === 0) {
        fx.tracer(_muzzleP, point);
      }

      if (hitEnemy) {
        hitAny = true;
        let dmg = this.curWeapon.baseDamage + rand(-3, 3);
        if (head) dmg *= 2.4;
        hitEnemy.damage(dmg, point, dir, { head, hitZone, isCorpse });

        if (hitEnemy.hp <= 0) totalKilled++;
        if (this.onHit) this.onHit({ head, killed: hitEnemy.hp <= 0, enemy: hitEnemy, hitZone, isCorpse });

        // В упор обрез порождает мощный фонтан брызг
        if (eHit.dist < 3.8) {
          fx.bloodFountain(point, dir.clone().add(new THREE.Vector3(0, 0.6, 0)).normalize(), 35, 2.0);
        }
      } else if (hitProp) {
        // Попадание дробины по физическому ящику: мощный импульс отдачи
        hitProp.damage(this.curWeapon.baseDamage + 6, point, dir, fx, sfx);
      } else if (wHit) {
        fx.impact(point, wHit.normal);
      }
    }

    if (hitAny && hud) {
      hud.hitmarker(totalKilled > 0);
    }
  }

  damage(amount, fromDir, sfx, hud) {
    if (this.hp <= 0) return;
    this.hp = Math.max(0, this.hp - amount);
    this.shake = Math.min(0.55, this.shake + 0.22);
    sfx.hurt();
    if (hud) hud.damageFlash();
    if (this.hp <= 0 && this.onDead) this.onDead();
  }

  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }
}
