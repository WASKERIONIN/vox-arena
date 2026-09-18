import * as THREE from 'three';
import { rand, pick } from './config.js';
import { buildMonster, poseMonster, createStumpCap } from './monsters.js';
import { Ragdoll, SeveredLimbProp } from './ragdoll.js';

// 4 типа тварей: уникальные тактики, скорости, poise и анимации
export const TYPES = {
  minion:  { hp: 36,  speed: 4.8, dmg: 8,  score: 100, radius: 0.4,  height: 1.85, baseY: 0,
             atkDur: 0.6, dieDur: 1.5, range: 1.9, cd: [0.7, 1.2], maxPoise: 42, label: 'СКОРОХОД' },
  rogue:   { hp: 30,  speed: 4.2, dmg: 10, score: 120, radius: 0.42, height: 1.55, baseY: 0,
             atkDur: 0.85, dieDur: 1.5, range: 1.85, cd: [0.7, 1.2], maxPoise: 48, label: 'РЕЗАК' },
  warrior: { hp: 150, speed: 2.3, dmg: 24, score: 250, radius: 0.62, height: 2.3, baseY: 0,
             atkDur: 1.3, dieDur: 1.9, range: 2.5, cd: [1.2, 1.8], maxPoise: 110, label: 'КЛЕЩ' },
  mage:    { hp: 60,  speed: 2.2, dmg: 16, score: 200, radius: 0.5,  height: 2.1, baseY: 0.45,
             atkDur: 1.4, dieDur: 1.3, ranged: true, keepMin: 8, keepMax: 14, cd: [1.8, 2.6], maxPoise: 55, label: 'ПЛОД' },
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const SPAWN_T = 0.9;

export class EnemyManager {
  constructor(scene, tex, fx, sfx, hooks) {
    this.scene = scene;
    this.tex = tex;
    this.fx = fx;
    this.sfx = sfx;
    this.hooks = hooks || {};
    this.list = [];
    this.projectiles = [];
    this.severedProps = [];
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

    const mats = [];
    body.traverse(o => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.frustumCulled = false;
        if (o.material.emissive) mats.push(o.material);
      }
    });

    const sh = new THREE.Mesh(
      new THREE.PlaneGeometry(T.radius * 3.4, T.radius * 3.4),
      new THREE.MeshBasicMaterial({ map: this.tex.shadow, transparent: true, opacity: 0.55, depthWrite: false })
    );
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.02; sh.renderOrder = 1;
    group.add(sh);

    group.position.set(x, 0, z);
    this.scene.add(group);

    // Распределяем тактические фланговые углы окружения (Surrounding Slots)
    const activeCount = this.list.length;
    const flankSlots = [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.8];
    const flankAngle = flankSlots[activeCount % flankSlots.length] + rand(-0.15, 0.15);

    const e = {
      typeName, T, group,
      root: body, j: built.joints, mats,
      shadowMesh: sh,
      pos: group.position,
      hp: T.hp * (1 + wave * 0.07), maxHp: T.hp * (1 + wave * 0.07),
      speed: T.speed * Math.min(1.15, 1 + wave * 0.015),
      state: 'spawn', t: 0, animT: 0, animDur: SPAWN_T, atkDur: T.atkDur,
      cdT: rand(T.cd[0], T.cd[1]) * 0.6,
      phase: rand(0, 6.28), seed: rand(0, 20),
      twitch: 0, spasm: 0, twist: rand(-0.16, 0.16), tilt: rand(-0.14, 0.14),
      baseY: T.baseY || 0,
      growlT: rand(2, 7), strafeDir: Math.random() < 0.5 ? 1 : -1,
      appliedHit: false, flashT: 0, staggerT: 0,

      // --- Тактический ИИ (Tactical Flocking & Flanking) ---
      flankAngle,
      dodgeTimer: 0,
      dodgeDir: Math.random() < 0.5 ? 1 : -1,
      hitAndRunTimer: 0,
      targetOffsetX: 0,
      targetOffsetZ: 0,

      // --- Физика отдачи и равновесие (Poise) ---
      poise: 0, maxPoise: T.maxPoise,
      knockbackVel: new THREE.Vector3(),
      angularVel: 0,
      flinchPitch: 0, flinchRoll: 0, flinchYaw: 0,

      // --- Отстрел конечностей (Dismemberment) ---
      limbs: { head: 22, lArm: 18, rArm: 18, lLeg: 20, rLeg: 20, torso: 999 },
      severed: { head: false, lArm: false, rArm: false, lLeg: false, rLeg: false },
      stumps: {},

      // --- Падение и подъём (Knockdown / Getup) ---
      stunT: 0, getupT: 0, getupDur: 0.95,

      // --- Труп на земле ---
      corpseT: 0, corpseDur: rand(4.5, 6.5),

      // --- Ползание ---
      crawlBloodT: 0,
    };

    e.ragdoll = new Ragdoll(e);
    attachEnemyDamage(e, this, this.hooks);
    this.list.push(e);
    return e;
  }

  get aliveCount() {
    let n = 0;
    for (const e of this.list) if (e.state !== 'dying' && e.state !== 'dead' && e.state !== 'corpse_ragdoll' && e.state !== 'headless_rampage') n++;
    return n;
  }

  // Отрыв конечности и спавн физического обломка в мире
  severLimb(e, zone, impulseDir = UP, hitPoint = null) {
    if (e.severed[zone]) return;
    e.severed[zone] = true;

    if (e.ragdoll) e.ragdoll.severLimb(zone);

    const j = e.j;
    let detachedJoint = null;
    let spawnWorldPos = new THREE.Vector3();
    let capParent = null;
    let capLocalPos = new THREE.Vector3();

    if (zone === 'head') {
      detachedJoint = j.head;
      if (detachedJoint) {
        detachedJoint.getWorldPosition(spawnWorldPos);
        capParent = j.neck || j.chest;
        if (capParent) capLocalPos.set(0, 0.1, 0.05);
      }
    } else if (zone === 'lArm') {
      detachedJoint = j.lShoulder;
      if (detachedJoint) {
        detachedJoint.getWorldPosition(spawnWorldPos);
        capParent = j.chest;
        if (capParent) capLocalPos.copy(detachedJoint.position);
      }
    } else if (zone === 'rArm') {
      detachedJoint = j.rShoulder;
      if (detachedJoint) {
        detachedJoint.getWorldPosition(spawnWorldPos);
        capParent = j.chest;
        if (capParent) capLocalPos.copy(detachedJoint.position);
      }
    } else if (zone === 'lLeg') {
      detachedJoint = j.lHip;
      if (detachedJoint) {
        detachedJoint.getWorldPosition(spawnWorldPos);
        capParent = j.pelvis;
        if (capParent) capLocalPos.copy(detachedJoint.position);
      }
    } else if (zone === 'rLeg') {
      detachedJoint = j.rHip;
      if (detachedJoint) {
        detachedJoint.getWorldPosition(spawnWorldPos);
        capParent = j.pelvis;
        if (capParent) capLocalPos.copy(detachedJoint.position);
      }
    }

    if (detachedJoint && detachedJoint.parent) {
      detachedJoint.parent.remove(detachedJoint);

      if (capParent) {
        const cap = createStumpCap(this.tex, e.typeName === 'warrior' ? 1.4 : 1.0);
        cap.position.copy(capLocalPos);
        capParent.add(cap);
        e.stumps[zone] = cap;
      }

      const prop = new SeveredLimbProp(detachedJoint, spawnWorldPos, impulseDir, zone, this.scene, this.fx, this.tex);
      this.severedProps.push(prop);

      this.fx.bloodFountain(spawnWorldPos, impulseDir.clone().add(new THREE.Vector3(0, 1.2, 0)).normalize(), zone === 'head' ? 52 : 36, 2.4);
      this.sfx.limbSever();

      if (zone === 'head') {
        this.sfx.headshot();
        if (this.hooks.hud) this.hooks.hud.styleEvent('ДЕКАПИТАЦИЯ! +200');
        e.hp = 0;

        const canRampage = (e.typeName === 'minion' || e.typeName === 'rogue') && (Math.random() < 0.45);
        if (canRampage) {
          e.state = 'headless_rampage';
          e.rampageT = rand(1.3, 1.9);
          e.poise = 0;
          e.knockbackVel.set(0, 0, 0);
          e.angularVel = 0;
          e.staggerT = 0;
          const rotY = e.group.rotation.y;
          e.forwardX = Math.sin(rotY);
          e.forwardZ = Math.cos(rotY);
          this.hooks.onKill(e, true, false);
          if (this.hooks.hud) this.hooks.hud.styleEvent('АГОНИЯ ОБЕЗГЛАВЛЕННОГО!');
        } else {
          this._triggerDeath(e, impulseDir, hitPoint, true);
        }
      } else if (zone === 'lArm' || zone === 'rArm') {
        const isBlade = (zone === 'rArm' && e.typeName === 'rogue');
        if (this.hooks.hud) this.hooks.hud.styleEvent(isBlade ? 'ЛЕЗВИЕ ОТСЕЧЕНО! +100' : 'ОТРЫВ РУКИ! +80');
      } else if (zone === 'lLeg' || zone === 'rLeg') {
        if (this.hooks.hud) this.hooks.hud.styleEvent('ОТРЫВ НОГИ! +90');
        if (e.hp > 0 && e.state !== 'dead' && e.state !== 'corpse_ragdoll') {
          this._triggerKnockdown(e, impulseDir, 9.0, zone, hitPoint, true);
        }
      }
    }
  }

  _triggerKnockdown(e, dir, force = 9.0, hitZone = 'torso', hitPoint = null, becomesCrawler = false) {
    if (e.state === 'knockdown' || e.state === 'corpse_ragdoll' || e.state === 'dead') return;

    e.state = 'knockdown';
    e.poise = 0;
    e.knockbackVel.set(0, 0, 0);
    e.angularVel = 0;
    e.staggerT = 0;
    e.stunT = rand(1.4, 2.0);
    e.isCrawling = becomesCrawler || e.severed.lLeg || e.severed.rLeg;

    e.ragdoll.active = true;
    e.ragdoll.syncFromAnimation();
    e.ragdoll.applyImpulse(dir, force, hitZone, hitPoint);

    this.sfx.thud();
    this.sfx.boneCrack();
    if (this.hooks.hud && !becomesCrawler) this.hooks.hud.styleEvent('СБИТ С НОГ! +40');
  }

  _triggerDeath(e, dir, hitPoint = null, decapitated = false) {
    const big = e.T === TYPES.warrior;
    const instantGib = !decapitated && (Math.random() < 0.2 || e.hp < -30);

    e.knockbackVel.set(0, 0, 0);
    e.angularVel = 0;
    e.staggerT = 0;

    if (instantGib) {
      e.state = 'dead';
      this.fx.gib(e.pos, big);
      this.sfx.gib();
      this.hooks.onKill(e, false, true);
      this._removeByEnemy(e);
    } else {
      e.state = 'corpse_ragdoll';
      e.corpseT = 0;
      e.corpseDur = rand(4.5, 6.5);

      e.ragdoll.active = true;
      e.ragdoll.syncFromAnimation();
      e.ragdoll.applyImpulse(dir, 10.0, decapitated ? 'head' : 'torso', hitPoint);

      this.sfx.thud();
      this.sfx.boneCrack();
      this.hooks.onKill(e, decapitated, false);
    }
  }

  update(dt, player, arena) {
    this.time += dt;
    const t = this.time, fx = this.fx, sfx = this.sfx;

    // Обновление отстреленных конечностей
    for (let i = this.severedProps.length - 1; i >= 0; i--) {
      const prop = this.severedProps[i];
      const alive = prop.update(dt, arena);
      if (!alive) this.severedProps.splice(i, 1);
    }

    // Вектор направления взгляда игрока (для проверки прицеливания и уклонений)
    const playerFwd = new THREE.Vector3();
    player.camera.getWorldDirection(playerFwd);
    playerFwd.y = 0; playerFwd.normalize();

    // Обновление врагов
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];

      if (e.flashT > 0) {
        e.flashT -= dt;
        if (e.flashT <= 0) for (const m of e.mats) m.emissive.setHex(0x000000);
      }

      if (e.poise > 0) {
        e.poise = Math.max(0, e.poise - dt * 26);
      }

      const canKnockback = (e.state === 'chase' || e.state === 'attack' || e.state === 'spawn');
      if (canKnockback && e.knockbackVel.lengthSq() > 0.001) {
        e.pos.x += e.knockbackVel.x * dt;
        e.pos.z += e.knockbackVel.z * dt;
        arena.clampCircle(e.pos, e.T.radius, e.pos.y, e.T.height);
        e.knockbackVel.multiplyScalar(Math.max(0, 1 - dt * 9.0));
      } else if (!canKnockback) {
        e.knockbackVel.set(0, 0, 0);
      }

      if (canKnockback && Math.abs(e.angularVel) > 0.01) {
        e.group.rotation.y += e.angularVel * dt;
        e.angularVel *= Math.max(0, 1 - dt * 11);
      } else if (!canKnockback) {
        e.angularVel = 0;
      }

      const dx = player.pos.x - e.pos.x, dz = player.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      const nx = dx / (dist || 1), nz = dz / (dist || 1);

      // Проверка: целится ли игрок прямо в этого монстра
      const dotAim = (-nx * playerFwd.x - nz * playerFwd.z);
      const isPlayerAimingAt = dotAim > 0.88;

      switch (e.state) {
        case 'spawn': {
          e.t += dt; e.animT += dt;
          poseMonster(e, dt, t);
          if (e.t >= SPAWN_T) { e.state = 'chase'; e.t = 0; }
          break;
        }

        case 'chase': {
          if (e.staggerT > 0) {
            e.staggerT -= dt;
            e.phase += dt * 3.5;
            break;
          }
          e.cdT -= dt;
          if (e.dodgeTimer > 0) e.dodgeTimer -= dt;
          if (e.hitAndRunTimer > 0) e.hitAndRunTimer -= dt;

          let moveX = nx, moveZ = nz;
          let moveSpeed = e.speed;

          // ==================================================================
          // ТАКТИЧЕСКИЙ ИИ ПО ТИПАМ ВРАГОВ
          // ==================================================================
          if (e.typeName === 'minion') {
            // СКОРОХОД: Тактическое уклонение (зигзаг) при наведении прицела игрока
            if (isPlayerAimingAt && e.dodgeTimer <= 0 && dist > 3.0 && dist < 14.0) {
              e.dodgeTimer = rand(0.35, 0.55);
              e.dodgeDir = Math.random() < 0.5 ? 1 : -1;
            }
            if (e.dodgeTimer > 0) {
              // Стрейф перпендикулярно лучу огня на повышенной скорости
              const perpX = -nz * e.dodgeDir;
              const perpZ = nx * e.dodgeDir;
              moveX = nx * 0.45 + perpX * 0.85;
              moveZ = nz * 0.45 + perpZ * 0.85;
              moveSpeed = e.speed * 1.35;
            } else {
              // Фланговый заход по дуге
              const cA = Math.cos(e.flankAngle * 0.5), sA = Math.sin(e.flankAngle * 0.5);
              moveX = nx * cA - nz * sA;
              moveZ = nx * sA + nz * cA;
            }
          } else if (e.typeName === 'rogue') {
            // РЕЗАК: Скрытный заход с флангов и тыла (Flanking Stalker)
            if (e.hitAndRunTimer > 0) {
              // Отскок назад и вбок после удара
              moveX = -nx * 0.6 + (-nz * e.strafeDir * 0.8);
              moveZ = -nz * 0.6 + (nx * e.strafeDir * 0.8);
            } else if (dist > e.T.range * 1.2) {
              // Широкий фланговый охват
              const cA = Math.cos(e.flankAngle), sA = Math.sin(e.flankAngle);
              moveX = nx * cA - nz * sA;
              moveZ = nx * sA + nz * cA;
            }
          } else if (e.typeName === 'warrior') {
            // КЛЕЩ: Танк-авангард, прёт прямо по центру, продавливая игрока
            moveX = nx;
            moveZ = nz;
          } else if (e.T.ranged) {
            // ПЛОД: Дистанционный кайт и стрейф за укрытия
            if (dist < e.T.keepMin) {
              moveX = -nx; moveZ = -nz; // отступает при сближении игрока
            } else if (dist < e.T.keepMax) {
              moveX = -nz * e.strafeDir * 0.75 + nx * 0.15;
              moveZ = nx * e.strafeDir * 0.75 + nz * 0.15;
            }
            if (Math.random() < dt * 0.4) e.strafeDir *= -1;
          }

          // Нормализуем направление движения
          const moveLen = Math.hypot(moveX, moveZ);
          if (moveLen > 0.001) { moveX /= moveLen; moveZ /= moveLen; }

          this._moveWithTacticalSteering(e, moveX, moveZ, moveSpeed, dt, arena);

          const targetRot = Math.atan2(dx, dz);
          let d = targetRot - e.group.rotation.y;
          while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
          e.group.rotation.y += d * Math.min(1, dt * 8);

          const wantAttack = e.T.ranged ? (dist < e.T.keepMax + 3) : (dist < e.T.range);
          if (wantAttack && e.cdT <= 0) {
            e.state = 'attack'; e.t = 0; e.animT = 0; e.animDur = e.atkDur; e.appliedHit = false;
            if (!e.T.ranged) sfx.swing();
          }

          e.growlT -= dt;
          if (e.growlT <= 0) { e.growlT = rand(4, 9); sfx.growl(e.typeName === 'warrior' ? 60 : e.typeName === 'mage' ? 120 : 90); }

          if (e.typeName !== 'mage' && Math.random() < dt * 1.1) {
            const hd = e.typeName === 'warrior' ? e.T.height * 0.68 : e.T.height * 0.78;
            fx.voxel(e.pos.x, e.pos.y + hd, e.pos.z, 0, -1.4, 0, this._dripC, 0.026, 1.7, { bounce: 0 });
          }
          break;
        }

        case 'headless_rampage': {
          e.rampageT -= dt;
          const neckY = e.pos.y + e.T.height * 0.78;
          fx.voxel(
            e.pos.x + rand(-0.05, 0.05), neckY, e.pos.z + rand(-0.05, 0.05),
            rand(-0.8, 0.8), rand(2.5, 4.5), rand(-0.8, 0.8),
            pick([new THREE.Color(0xe81410), new THREE.Color(0xa00f0d), new THREE.Color(0x6a0808)]),
            rand(0.045, 0.08), rand(1.0, 1.8), { bounce: 0.3 }
          );

          const wander = Math.sin(t * 8) * 0.4;
          const mx = e.forwardX + wander * e.forwardZ;
          const mz = e.forwardZ - wander * e.forwardX;
          this._moveWithTacticalSteering(e, mx, mz, e.speed * 0.85, dt, arena);

          if (Math.random() < dt * 4.5) {
            fx.bloodFloor(e.pos.x + rand(-0.25, 0.25), e.pos.z + rand(-0.25, 0.25), rand(0.6, 1.1));
          }

          if (e.rampageT <= 0) {
            this._triggerDeath(e, new THREE.Vector3(e.forwardX, 0, e.forwardZ), null, true);
          }
          break;
        }

        case 'crawl_chase': {
          e.cdT -= dt;
          const crawlSpeed = e.speed * 0.45;
          const pullIntensity = Math.max(0, Math.sin(e.phase));
          const crawlSurge = pullIntensity * 2.1;

          if (crawlSurge > 0.05) {
            this._moveWithTacticalSteering(e, nx, nz, crawlSpeed * crawlSurge, dt, arena);
          }

          const targetRot = Math.atan2(dx, dz);
          let d = targetRot - e.group.rotation.y;
          while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
          e.group.rotation.y += d * Math.min(1, dt * 6);

          e.crawlBloodT -= dt;
          if (e.crawlBloodT <= 0) {
            e.crawlBloodT = 0.35;
            fx.bloodFloor(e.pos.x + rand(-0.2, 0.2), e.pos.z + rand(-0.2, 0.2), rand(0.65, 1.05));
          }

          if (dist < 1.45 && e.cdT <= 0) {
            e.state = 'crawl_attack'; e.t = 0; e.animT = 0; e.animDur = 0.7; e.appliedHit = false;
            sfx.swing();
          }
          break;
        }

        case 'attack': {
          e.t += dt; e.animT += dt;
          if (!e.T.ranged && dist > e.T.range * 0.6) {
            this._moveWithTacticalSteering(e, nx, nz, 1.0, dt, arena);
          }
          if (!e.appliedHit && e.t >= e.atkDur * (e.T.ranged ? 0.55 : 0.45)) {
            e.appliedHit = true;
            if (e.T.ranged) {
              this._fireProjectile(e, player);
            } else if (dist < e.T.range + 0.6) {
              player.damage(e.T.dmg, null, sfx, this.hooks.hud);
              if (e.typeName === 'rogue') e.hitAndRunTimer = 0.75; // Резак отпрыгивает после атаки
            }
          }
          if (e.t >= e.atkDur + 0.12) {
            e.cdT = rand(e.T.cd[0], e.T.cd[1]);
            e.state = 'chase';
          }
          break;
        }

        case 'crawl_attack': {
          e.t += dt; e.animT += dt;
          if (!e.appliedHit && e.t >= 0.35) {
            e.appliedHit = true;
            if (dist < 1.7) player.damage(Math.round(e.T.dmg * 0.75), null, sfx, this.hooks.hud);
          }
          if (e.t >= 0.7) {
            e.cdT = rand(0.8, 1.4);
            e.state = 'crawl_chase';
          }
          break;
        }

        case 'knockdown': {
          e.ragdoll.update(dt, arena);
          e.stunT -= dt;

          if (Math.random() < dt * 0.4) {
            fx.voxel(e.pos.x, e.pos.y + 0.2, e.pos.z, 0, -1.0, 0, this._dripC, 0.03, 1.5, { bounce: 0 });
          }

          if (e.stunT <= 0) {
            if (e.hp <= 0) {
              this._triggerDeath(e, UP);
            } else {
              e.ragdoll.active = false;
              const hasLegLoss = e.severed.lLeg || e.severed.rLeg;
              if (hasLegLoss) {
                e.state = 'crawl_getup';
                e.getupT = 0; e.getupDur = 0.9;
              } else {
                e.state = 'getup';
                e.getupT = 0; e.getupDur = 0.95;
              }
              sfx.monsterGetup();
            }
          }
          break;
        }

        case 'getup': {
          e.getupT += dt;
          if (e.getupT >= e.getupDur) {
            e.state = 'chase';
            e.cdT = 0.4;
          }
          break;
        }

        case 'crawl_getup': {
          e.getupT += dt;
          if (e.getupT >= e.getupDur) {
            e.state = 'crawl_chase';
            e.cdT = 0.4;
          }
          break;
        }

        case 'corpse_ragdoll': {
          e.ragdoll.update(dt, arena);
          e.corpseT += dt;

          if (e.corpseT >= 0.5 && e.corpseT - dt < 0.5) {
            fx.bloodFloor(e.pos.x, e.pos.z, e.T === TYPES.warrior ? 1.8 : 1.2);
          }

          if (e.corpseT >= e.corpseDur) {
            fx.dissolve(e.pos, e.T.radius * 1.1, e.T.height * 0.4);
            sfx.boneCrack();
            this._remove(i);
            continue;
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

    // Снаряды ПЛОДОВ
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

  // ==========================================================================
  // Тактическое руление: обход стен, прохождение коридоров и дверей без застревания
  // ==========================================================================
  _moveWithTacticalSteering(e, wishX, wishZ, speed, dt, arena) {
    const probe = 0.85 + e.T.radius;

    const isBlocked = (x, z) => {
      if (Math.abs(x) > 33.0 || Math.abs(z) > 33.0) return true;
      for (const c of arena.colliders) {
        if (c.max.y - e.pos.y <= 0.7) continue;
        if (e.pos.y + e.T.height < c.min.y) continue;
        if (x > c.min.x - e.T.radius && x < c.max.x + e.T.radius &&
            z > c.min.z - e.T.radius && z < c.max.z + e.T.radius) return true;
      }
      return false;
    };

    let dirx = wishX, dirz = wishZ;

    // Проверка препятствия впереди лучами-усиками (Whisker Feeler Navigation)
    if ((wishX || wishZ) && isBlocked(e.pos.x + dirx * probe, e.pos.z + dirz * probe)) {
      const baseAng = Math.atan2(wishZ, wishX);
      let found = false;
      // Сканируем углы в обе стороны
      for (const s of [0.55, -0.55, 1.1, -1.1, 1.6, -1.6, 2.2, -2.2]) {
        const a = baseAng + s * (e.strafeDir || 1);
        const tx = Math.cos(a), tz = Math.sin(a);
        if (!isBlocked(e.pos.x + tx * probe, e.pos.z + tz * probe)) {
          dirx = tx; dirz = tz;
          found = true;
          break;
        }
      }
      if (!found) {
        dirx = -wishX; dirz = -wishZ;
        e.strafeDir *= -1;
      }
    }

    e.pos.x += dirx * speed * dt;
    e.pos.z += dirz * speed * dt;

    // Расталкивание между врагами (Anti-Clustering Boid Separation)
    this._separate(e);

    arena.clampCircle(e.pos, e.T.radius, e.pos.y, e.T.height);

    const g = arena.groundTopAt(e.pos.x, e.pos.z, e.pos.y + 0.5);
    e.pos.y = g;
  }

  // Мощное расталкивание монстров (предотвращает сбивание в кучу)
  _separate(e) {
    for (const o of this.list) {
      if (o === e || o.state === 'dying' || o.state === 'dead' || o.state === 'corpse_ragdoll') continue;
      const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z;
      const minDistance = e.T.radius + o.T.radius + 0.28; // увеличенная дистанция личного пространства
      const d2 = dx * dx + dz * dz;

      if (d2 < minDistance * minDistance && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (minDistance - d) * 0.55 / d;
        e.pos.x += dx * push;
        e.pos.z += dz * push;
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

    // Упреждение цели (Predictive aim leading)
    const t = Math.min(1.2, Math.hypot(player.pos.x - start.x, player.pos.z - start.z) / 12);
    const target = _v2.set(player.pos.x + player.vel.x * t * 0.65, player.pos.y + 1.1, player.pos.z + player.vel.z * t * 0.65);
    const dir = target.sub(start).normalize();
    this.projectiles.push({
      mesh, pos: start.clone(), vel: dir.multiplyScalar(12),
      dmg: e.T.dmg, life: 6,
    });
    this.sfx.portal();
  }

  raycast(o, d, maxDist) {
    let best = null;

    for (const e of this.list) {
      if (e.state === 'dead' || e.state === 'dying') continue;

      if (e.state === 'corpse_ragdoll' || e.state === 'knockdown') {
        const ox = o.x - e.pos.x, oz = o.z - e.pos.z;
        const r = e.T.radius * 1.35;
        const a = d.x * d.x + d.z * d.z;
        const b = 2 * (d.x * ox + d.z * oz);
        const c = ox * ox + oz * oz - r * r;
        const disc = b * b - 4 * a * c;
        if (disc >= 0) {
          const sq = Math.sqrt(disc);
          let t = (-b - sq) / (2 * a);
          if (t < 0.01) t = (-b + sq) / (2 * a);
          if (t >= 0.01 && t <= maxDist && (!best || t < best.dist)) {
            const y = o.y + d.y * t;
            if (y >= e.pos.y - 0.15 && y <= e.pos.y + 0.85) {
              best = {
                dist: t, point: new THREE.Vector3(o.x + d.x * t, y, o.z + d.z * t),
                enemy: e, head: false, hitZone: 'corpse', isCorpse: (e.state === 'corpse_ragdoll'),
              };
            }
          }
        }
        continue;
      }

      const ox = o.x - e.pos.x, oz = o.z - e.pos.z;
      const r = e.T.radius * 1.25;
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

      const hitP = new THREE.Vector3(o.x + d.x * t, y, o.z + d.z * t);
      const relY = y - y0;
      const normY = relY / e.T.height;

      const cosA = Math.cos(-e.group.rotation.y), sinA = Math.sin(-e.group.rotation.y);
      const dxLocal = (hitP.x - e.pos.x) * cosA - (hitP.z - e.pos.z) * sinA;

      let hitZone = 'torso';
      let isHead = false;

      if (e.typeName === 'mage') {
        hitZone = normY > 0.4 ? 'head' : 'torso';
        isHead = normY > 0.65;
      } else if (e.state === 'crawl_chase' || e.state === 'crawl_attack' || e.state === 'crawl_getup') {
        if (normY > 0.35 || relY > 0.3) {
          hitZone = 'head'; isHead = true;
        } else if (Math.abs(dxLocal) > 0.18) {
          hitZone = dxLocal > 0 ? 'lArm' : 'rArm';
        } else {
          hitZone = 'torso';
        }
      } else {
        if (normY > 0.72) {
          hitZone = 'head'; isHead = true;
        } else if (normY < 0.42) {
          hitZone = dxLocal > 0 ? 'lLeg' : 'rLeg';
        } else if (Math.abs(dxLocal) > 0.18) {
          hitZone = dxLocal > 0 ? 'lArm' : 'rArm';
        } else {
          hitZone = 'torso';
        }
      }

      best = { dist: t, point: hitP, enemy: e, head: isHead, hitZone, isCorpse: false };
    }

    return best;
  }

  kickMelee(origin, dir, maxRange = 2.4, kickForce = 18, kickDmg = 55) {
    let hitSomething = false;

    for (const e of this.list) {
      if (e.state === 'dead' || e.state === 'dying') continue;
      const dx = e.pos.x - origin.x, dz = e.pos.z - origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist > maxRange + e.T.radius) continue;

      const dot = (dx * dir.x + dz * dir.z) / (dist || 1);
      if (dot < 0.35) continue;

      hitSomething = true;

      if (e.state === 'corpse_ragdoll') {
        if (e.ragdoll) {
          e.ragdoll.applyImpulse(dir, kickForce * 1.3, 'torso');
        }
        this.fx.bloodFloor(e.pos.x, e.pos.z, rand(1.2, 1.8));
        this.sfx.thud();
        continue;
      }

      e.hp -= kickDmg;
      e.flashT = 0.12;
      for (const m of e.mats) m.emissive.setHex(0xaa1111);

      this.fx.blood(e.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), dir, 32, 1.8);
      this.sfx.kick();
      this.sfx.boneCrack();
      this.sfx.thud();

      if (this.hooks.hud) {
        this.hooks.hud.hitmarker(e.hp <= 0);
        this.hooks.hud.styleEvent('ПИНОК! +' + (e.hp <= 0 ? '120' : '45'));
      }

      if (e.hp <= 0) {
        if (this.hooks.onKill) this.hooks.onKill(e, false, false);
        this._triggerDeath(e, dir, null, false);
      } else {
        e.poise = e.maxPoise + 50;
        this._triggerKnockdown(e, dir, kickForce, 'torso', null, e.severed.lLeg || e.severed.rLeg);
      }
    }

    for (const prop of this.severedProps) {
      const dx = prop.pos.x - origin.x, dz = prop.pos.z - origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist < maxRange + 0.5) {
        const dot = (dx * dir.x + dz * dir.z) / (dist || 1);
        if (dot > 0.3) {
          hitSomething = true;
          prop.vel.x = dir.x * rand(20, 26) + rand(-2, 2);
          prop.vel.y = rand(6.5, 10.5);
          prop.vel.z = dir.z * rand(20, 26) + rand(-2, 2);
          prop.angVel.set(rand(-16, 16), rand(-16, 16), rand(-16, 16));
          this.fx.bloodFountain(prop.pos, dir, 20, 1.6);
          this.sfx.kick();
          this.sfx.boneCrack();
          if (this.hooks.hud) {
            this.hooks.hud.styleEvent(prop.type === 'head' ? 'ГОЛ! ПИНОК ЧЕРЕПА! +75' : 'ПИНОК КОНЕЧНОСТИ! +50');
          }
        }
      }
    }

    return hitSomething;
  }

  _remove(i) {
    const e = this.list[i];
    this.scene.remove(e.group);
    this.list.splice(i, 1);
  }

  _removeByEnemy(e) {
    this.scene.remove(e.group);
    const i = this.list.indexOf(e);
    if (i >= 0) this.list.splice(i, 1);
  }

  killAllInstant() {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      this.fx.gib(e.pos, e.T === TYPES.warrior);
      this._remove(i);
    }
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles.length = 0;
    for (const prop of this.severedProps) prop.destroy();
    this.severedProps.length = 0;
  }

  clear() {
    for (const e of this.list) this.scene.remove(e.group);
    this.list.length = 0;
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles.length = 0;
    for (const prop of this.severedProps) prop.destroy();
    this.severedProps.length = 0;
  }
}

export function attachEnemyDamage(e, mgr, hooks) {
  e.damage = function (amount, point, dir, hitInfo = {}) {
    const hitZone = typeof hitInfo === 'string' ? hitInfo : (hitInfo.hitZone || (hitInfo.head ? 'head' : 'torso'));
    const isHead = hitZone === 'head' || hitInfo.head;
    const shotDir = dir || UP;

    if (e.state === 'corpse_ragdoll') {
      const big = e.T === TYPES.warrior;
      mgr.fx.gib(point || e.pos, big);
      mgr.sfx.gib();
      mgr.sfx.boneCrack();
      mgr.fx.bloodFloor(e.pos.x, e.pos.z, big ? 2.6 : 1.9);
      mgr._removeByEnemy(e);
      if (hooks.hud) hooks.hud.hitmarker(true);
      return;
    }

    if (e.state === 'dead' || e.state === 'dying') return;

    e.hp -= amount;
    e.flashT = 0.09;
    for (const m of e.mats) m.emissive.setHex(0x881111);

    mgr.fx.blood(point || e.pos, shotDir, isHead ? 28 : 15, isHead ? 1.45 : 1.15);

    if (e.state === 'chase' || e.state === 'attack' || e.state === 'spawn') {
      const kbForce = (amount * 0.22) * (e.typeName === 'warrior' ? 0.65 : 1.15);
      e.knockbackVel.x += shotDir.x * kbForce;
      e.knockbackVel.z += shotDir.z * kbForce;

      if (hitZone === 'lArm' || hitZone === 'lLeg') {
        e.angularVel += rand(3.0, 5.0);
      } else if (hitZone === 'rArm' || hitZone === 'rLeg') {
        e.angularVel -= rand(3.0, 5.0);
      } else {
        e.angularVel += rand(-1.2, 1.2);
      }
    }

    e.flinchPitch = rand(0.3, 0.55);
    e.flinchRoll = hitZone === 'lArm' ? 0.35 : hitZone === 'rArm' ? -0.35 : 0;
    e.flinchYaw = hitZone === 'lArm' ? 0.25 : hitZone === 'rArm' ? -0.25 : 0;

    if (e.state === 'chase') {
      e.staggerT = Math.min(0.2, amount / 85);
    }

    if (hitZone && hitZone !== 'torso' && hitZone !== 'corpse' && !e.severed[hitZone]) {
      e.limbs[hitZone] -= amount;
      if (e.limbs[hitZone] <= 0) {
        mgr.severLimb(e, hitZone, shotDir, point);
      }
    }

    const poiseAdd = isHead ? amount * 4.5 : (hitZone === 'lLeg' || hitZone === 'rLeg') ? amount * 3.4 : amount * 2.4;
    e.poise += poiseAdd;

    if (e.poise >= e.maxPoise && e.hp > 0 && e.state !== 'knockdown' && e.state !== 'getup' && e.state !== 'crawl_getup') {
      mgr._triggerKnockdown(e, shotDir, 9.0, hitZone, point, e.severed.lLeg || e.severed.rLeg);
    }

    if (e.hp <= 0 && e.state !== 'corpse_ragdoll' && e.state !== 'dead') {
      mgr._triggerDeath(e, shotDir, point, isHead);
    }
  };
}
