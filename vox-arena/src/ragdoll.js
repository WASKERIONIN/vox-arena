import * as THREE from 'three';
import { rand } from './config.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _vDir = new THREE.Vector3();
const _vLocalDir = new THREE.Vector3();
const _vUp = new THREE.Vector3(0, 1, 0);
const _q1 = new THREE.Quaternion();
const _qParent = new THREE.Quaternion();
const _m1 = new THREE.Matrix4();
const BONE_DOWN = new THREE.Vector3(0, -1, 0);

// Поворот кости к целевому мировому положению узла
function orientJointTowards(joint, fromNodePos, toNodePos, downAxis = BONE_DOWN) {
  if (!joint || !joint.parent) return;
  _vDir.subVectors(toNodePos, fromNodePos);
  if (_vDir.lengthSq() < 1e-6) return;
  _vDir.normalize();

  // Получаем мировую ориентацию родителя
  joint.parent.getWorldQuaternion(_qParent);

  // Переводим мировое направление в локальную систему родителя
  _vLocalDir.copy(_vDir).applyQuaternion(_qParent.clone().invert()).normalize();

  // Поворачиваем локальную базовую ось к целевому локальному направлению
  joint.quaternion.setFromUnitVectors(downAxis, _vLocalDir);
}

// ============================================================================
// Физический узел рэгдолла (Verlet particle)
// ============================================================================
export class RagdollNode {
  constructor(name, pos, mass = 1.0, radius = 0.15) {
    this.name = name;
    this.pos = pos.clone();
    this.prevPos = pos.clone();
    this.vel = new THREE.Vector3();
    this.mass = mass;
    this.invMass = mass > 0 ? 1 / mass : 0;
    this.radius = radius;
    this.pinned = false;
  }
}

// ============================================================================
// Дистанционная связь между узлами (Distance constraint)
// ============================================================================
export class RagdollConstraint {
  constructor(nodeA, nodeB, restLen = null, opts = {}) {
    this.nodeA = nodeA;
    this.nodeB = nodeB;
    this.restLen = restLen !== null ? restLen : nodeA.pos.distanceTo(nodeB.pos);
    this.broken = false;
    this.stiffness = opts.stiffness || 1.0;
    this.isLimb = opts.isLimb || null; // 'lArm', 'rArm', 'lLeg', 'rLeg', 'head'
    this.minDist = opts.minDist || null;
    this.maxDist = opts.maxDist || null;
  }
}

// ============================================================================
// Рэгдолл монстра: физический скелет + синхронизация с Three.js
// ============================================================================
export class Ragdoll {
  constructor(enemy) {
    this.enemy = enemy;
    this.nodes = [];
    this.nodeMap = {};
    this.constraints = [];
    this.active = false;
    this.settled = false;
    this.restEnergy = 0;
    this.time = 0;
    this.isMage = enemy.typeName === 'mage';
    this._initNodes();
  }

  _addNode(name, pos, mass, radius) {
    const n = new RagdollNode(name, pos, mass, radius);
    this.nodes.push(n);
    this.nodeMap[name] = n;
    return n;
  }

  _addConstraint(nameA, nameB, restLen = null, opts = {}) {
    const nA = this.nodeMap[nameA], nB = this.nodeMap[nameB];
    if (!nA || !nB) return null;
    const c = new RagdollConstraint(nA, nB, restLen, opts);
    this.constraints.push(c);
    return c;
  }

  _worldPos(obj, out) {
    if (!obj) return out.set(0, 0, 0);
    obj.getWorldPosition(out);
    return out;
  }

  _initNodes() {
    const e = this.enemy;
    const j = e.j;

    if (this.isMage) {
      // Рэгдолл для парящего мешка ПЛОД
      const sacP = this._worldPos(j.sac, new THREE.Vector3());
      const topP = sacP.clone().add(new THREE.Vector3(0, 0.45, 0));
      const tailP = this._worldPos(j.tail, new THREE.Vector3());

      this._addNode('sac', sacP, 3.2, 0.42);
      this._addNode('sacTop', topP, 2.0, 0.32);
      this._addNode('tail', tailP, 1.2, 0.18);

      this._addConstraint('sac', 'sacTop', null, { stiffness: 1.0 });
      this._addConstraint('sac', 'tail', null, { stiffness: 0.95 });

      if (j.tendrils && j.tendrils.length) {
        for (let i = 0; i < j.tendrils.length; i++) {
          const tP = this._worldPos(j.tendrils[i], new THREE.Vector3());
          tP.y -= 0.35;
          const tName = `tendril_${i}`;
          this._addNode(tName, tP, 0.4, 0.08);
          this._addConstraint('sac', tName, null, { stiffness: 0.85 });
          if (i > 0) {
            this._addConstraint(`tendril_${i - 1}`, tName, null, { stiffness: 0.6, minDist: 0.2 });
          }
        }
      }
      return;
    }

    // Гуманоидный скелет (СКОРОХОД, РЕЗАК, КЛЕЩ)
    const pPelvis = this._worldPos(j.pelvis, new THREE.Vector3());
    const pSpine = this._worldPos(j.spine, new THREE.Vector3());
    const pChest = this._worldPos(j.chest, new THREE.Vector3());
    const pNeck = this._worldPos(j.neck, new THREE.Vector3());
    const pHead = this._worldPos(j.head, new THREE.Vector3());

    const pLShoulder = this._worldPos(j.lShoulder, new THREE.Vector3());
    const pLElbow = this._worldPos(j.lElbow, new THREE.Vector3());
    const pLHand = this._worldPos(j.lHand, new THREE.Vector3());

    const pRShoulder = this._worldPos(j.rShoulder, new THREE.Vector3());
    const pRElbow = this._worldPos(j.rElbow, new THREE.Vector3());
    const pRHand = this._worldPos(j.rHand, new THREE.Vector3());

    const pLHip = this._worldPos(j.lHip, new THREE.Vector3());
    const pLKnee = this._worldPos(j.lKnee, new THREE.Vector3());
    const pLFoot = this._worldPos(j.lFoot, new THREE.Vector3());

    const pRHip = this._worldPos(j.rHip, new THREE.Vector3());
    const pRKnee = this._worldPos(j.rKnee, new THREE.Vector3());
    const pRFoot = this._worldPos(j.rFoot, new THREE.Vector3());

    const isWarrior = e.typeName === 'warrior';
    const radMul = isWarrior ? 1.35 : 1.0;
    const massMul = isWarrior ? 2.2 : 1.0;

    // Торс и голова
    this._addNode('pelvis', pPelvis, 3.2 * massMul, 0.22 * radMul);
    this._addNode('spine', pSpine, 2.8 * massMul, 0.20 * radMul);
    this._addNode('chest', pChest, 3.4 * massMul, 0.25 * radMul);
    this._addNode('neck', pNeck, 1.4 * massMul, 0.14 * radMul);
    this._addNode('head', pHead, 1.8 * massMul, 0.18 * radMul);

    // Левая рука
    this._addNode('lShoulder', pLShoulder, 1.4 * massMul, 0.14 * radMul);
    this._addNode('lElbow', pLElbow, 1.0 * massMul, 0.12 * radMul);
    this._addNode('lHand', pLHand, 0.7 * massMul, 0.10 * radMul);

    // Правая рука
    this._addNode('rShoulder', pRShoulder, 1.4 * massMul, 0.14 * radMul);
    this._addNode('rElbow', pRElbow, 1.0 * massMul, 0.12 * radMul);
    this._addNode('rHand', pRHand, 0.7 * massMul, 0.10 * radMul);

    // Левая нога
    this._addNode('lHip', pLHip, 2.0 * massMul, 0.16 * radMul);
    this._addNode('lKnee', pLKnee, 1.4 * massMul, 0.14 * radMul);
    this._addNode('lFoot', pLFoot, 0.9 * massMul, 0.13 * radMul);

    // Правая нога
    this._addNode('rHip', pRHip, 2.0 * massMul, 0.16 * radMul);
    this._addNode('rKnee', pRKnee, 1.4 * massMul, 0.14 * radMul);
    this._addNode('rFoot', pRFoot, 0.9 * massMul, 0.13 * radMul);

    // Связи позвоночника
    this._addConstraint('pelvis', 'spine', null, { stiffness: 1.0 });
    this._addConstraint('spine', 'chest', null, { stiffness: 1.0 });
    this._addConstraint('chest', 'neck', null, { stiffness: 1.0 });
    this._addConstraint('neck', 'head', null, { stiffness: 0.95, isLimb: 'head' });

    // Связи рук
    this._addConstraint('chest', 'lShoulder', null, { stiffness: 1.0, isLimb: 'lArm' });
    this._addConstraint('lShoulder', 'lElbow', null, { stiffness: 1.0, isLimb: 'lArm' });
    this._addConstraint('lElbow', 'lHand', null, { stiffness: 1.0, isLimb: 'lArm' });

    this._addConstraint('chest', 'rShoulder', null, { stiffness: 1.0, isLimb: 'rArm' });
    this._addConstraint('rShoulder', 'rElbow', null, { stiffness: 1.0, isLimb: 'rArm' });
    this._addConstraint('rElbow', 'rHand', null, { stiffness: 1.0, isLimb: 'rArm' });

    // Связи ног
    this._addConstraint('pelvis', 'lHip', null, { stiffness: 1.0, isLimb: 'lLeg' });
    this._addConstraint('lHip', 'lKnee', null, { stiffness: 1.0, isLimb: 'lLeg' });
    this._addConstraint('lKnee', 'lFoot', null, { stiffness: 1.0, isLimb: 'lLeg' });

    this._addConstraint('pelvis', 'rHip', null, { stiffness: 1.0, isLimb: 'rLeg' });
    this._addConstraint('rHip', 'rKnee', null, { stiffness: 1.0, isLimb: 'rLeg' });
    this._addConstraint('rKnee', 'rFoot', null, { stiffness: 1.0, isLimb: 'rLeg' });

    // Структурные перекрёстные связи
    this._addConstraint('lShoulder', 'rShoulder', null, { stiffness: 0.95 });
    this._addConstraint('lHip', 'rHip', null, { stiffness: 0.95 });
    this._addConstraint('pelvis', 'chest', null, { stiffness: 0.95 });
    this._addConstraint('pelvis', 'head', null, { stiffness: 0.8, minDist: 0.4 });
    this._addConstraint('lElbow', 'spine', null, { stiffness: 0.6, minDist: 0.25 });
    this._addConstraint('rElbow', 'spine', null, { stiffness: 0.6, minDist: 0.25 });
  }

  // Синхронизация положений узлов из текущей анимации перед включением физики
  syncFromAnimation() {
    const j = this.enemy.j;
    if (this.isMage) {
      if (this.nodeMap.sac) this._worldPos(j.sac, this.nodeMap.sac.pos);
      if (this.nodeMap.sacTop && this.nodeMap.sac) this.nodeMap.sacTop.pos.copy(this.nodeMap.sac.pos).add(new THREE.Vector3(0, 0.45, 0));
      if (this.nodeMap.tail) this._worldPos(j.tail, this.nodeMap.tail.pos);
      if (j.tendrils) {
        for (let i = 0; i < j.tendrils.length; i++) {
          const n = this.nodeMap[`tendril_${i}`];
          if (n) {
            this._worldPos(j.tendrils[i], n.pos);
            n.pos.y -= 0.35;
          }
        }
      }
    } else {
      const map = {
        pelvis: j.pelvis, spine: j.spine, chest: j.chest, neck: j.neck, head: j.head,
        lShoulder: j.lShoulder, lElbow: j.lElbow, lHand: j.lHand,
        rShoulder: j.rShoulder, rElbow: j.rElbow, rHand: j.rHand,
        lHip: j.lHip, lKnee: j.lKnee, lFoot: j.lFoot,
        rHip: j.rHip, rKnee: j.rKnee, rFoot: j.rFoot,
      };
      for (const [name, joint] of Object.entries(map)) {
        const n = this.nodeMap[name];
        if (n && joint) {
          this._worldPos(joint, n.pos);
          n.prevPos.copy(n.pos);
          n.vel.set(0, 0, 0);
        }
      }
    }
    // Сброс скоростей
    for (const n of this.nodes) {
      n.prevPos.copy(n.pos);
      n.vel.set(0, 0, 0);
    }
  }

  // Разрыв связей при отстреле конечности
  severLimb(limbZone) {
    for (const c of this.constraints) {
      if (c.isLimb === limbZone) {
        c.broken = true;
      }
    }
  }

  // Приложение физического импульса пули
  applyImpulse(dir, force = 8.0, hitZone = 'torso', hitPoint = null) {
    this.settled = false;
    const isWarrior = this.enemy.typeName === 'warrior';
    const f = isWarrior ? force * 0.75 : force;

    // Импульс туловища назад и вверх для кувырка
    const upLift = rand(3.5, 6.0);
    const mainDir = _v1.copy(dir).normalize();

    // Передаём импульс всем узлам туловища
    for (const n of this.nodes) {
      const mul = (n.name === 'head' || n.name === 'chest' || n.name === 'sac') ? 1.4 : 0.95;
      n.vel.x += mainDir.x * f * mul + rand(-1.0, 1.0);
      n.vel.z += mainDir.z * f * mul + rand(-1.0, 1.0);
      n.vel.y += upLift * mul * 0.85;
      n.prevPos.copy(n.pos).addScaledVector(n.vel, -0.016);
    }

    // Дополнительный импульс и вращение (torque) по месту попадания
    if (hitZone === 'head' && this.nodeMap.head) {
      this.nodeMap.head.vel.addScaledVector(mainDir, f * 2.0);
      this.nodeMap.head.vel.y += rand(3.0, 5.5);
    } else if (hitZone === 'lArm' && this.nodeMap.lShoulder) {
      this.nodeMap.lShoulder.vel.addScaledVector(mainDir, f * 1.6);
      this.nodeMap.lHand.vel.y += rand(2.5, 4.5);
    } else if (hitZone === 'rArm' && this.nodeMap.rShoulder) {
      this.nodeMap.rShoulder.vel.addScaledVector(mainDir, f * 1.6);
      this.nodeMap.rHand.vel.y += rand(2.5, 4.5);
    } else if (hitZone === 'lLeg' && this.nodeMap.lFoot) {
      this.nodeMap.lFoot.vel.addScaledVector(mainDir, f * 1.8);
      this.nodeMap.lFoot.vel.y += rand(3.5, 6.0);
    } else if (hitZone === 'rLeg' && this.nodeMap.rFoot) {
      this.nodeMap.rFoot.vel.addScaledVector(mainDir, f * 1.8);
      this.nodeMap.rFoot.vel.y += rand(3.5, 6.0);
    }
  }

  // Физический шаг симуляции
  update(dt, arena) {
    if (!this.active) return;
    this.time += dt;

    const gravity = 24.0;
    const damping = Math.pow(0.94, dt * 60);
    const groundBounce = 0.22;
    const groundFriction = 0.65;

    let totalKinetic = 0;

    // Интеграция Верле для всех узлов
    for (const n of this.nodes) {
      if (n.pinned) continue;

      n.vel.y -= gravity * dt;
      n.vel.x *= damping;
      n.vel.z *= damping;
      n.vel.y *= damping;

      n.pos.addScaledVector(n.vel, dt);

      // Коллизия с поверхностью пола арены
      const groundY = (arena ? arena.groundTopAt(n.pos.x, n.pos.z, n.pos.y) : 0) + n.radius;
      if (n.pos.y < groundY) {
        n.pos.y = groundY;
        if (n.vel.y < 0) {
          n.vel.y *= -groundBounce;
          n.vel.x *= groundFriction;
          n.vel.z *= groundFriction;
          if (Math.abs(n.vel.y) < 0.3) n.vel.y = 0;
        }
      }

      // Границы арены
      n.pos.x = Math.max(-30.8, Math.min(30.8, n.pos.x));
      n.pos.z = Math.max(-30.8, Math.min(30.8, n.pos.z));

      totalKinetic += n.vel.lengthSq();
    }

    // Релаксация связей (8 суб-итераций)
    const ITERS = 8;
    for (let it = 0; it < ITERS; it++) {
      for (const c of this.constraints) {
        if (c.broken) continue;
        const nA = c.nodeA, nB = c.nodeB;
        const dx = nB.pos.x - nA.pos.x;
        const dy = nB.pos.y - nA.pos.y;
        const dz = nB.pos.z - nA.pos.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist < 1e-6) continue;

        let targetLen = c.restLen;
        if (c.minDist && dist < c.minDist) targetLen = c.minDist;
        else if (c.maxDist && dist > c.maxDist) targetLen = c.maxDist;
        else if (c.minDist || c.maxDist) continue;

        const diff = (dist - targetLen) / dist;
        const wA = nA.pinned ? 0 : nA.invMass;
        const wB = nB.pinned ? 0 : nB.invMass;
        const totalW = wA + wB;
        if (totalW === 0) continue;

        const factorA = (wA / totalW) * diff * c.stiffness;
        const factorB = (wB / totalW) * diff * c.stiffness;

        nA.pos.x += dx * factorA;
        nA.pos.y += dy * factorA;
        nA.pos.z += dz * factorA;

        nB.pos.x -= dx * factorB;
        nB.pos.y -= dy * factorB;
        nB.pos.z -= dz * factorB;
      }

      // Повторный зажим по полу
      for (const n of this.nodes) {
        if (n.pinned) continue;
        const groundY = (arena ? arena.groundTopAt(n.pos.x, n.pos.z, n.pos.y) : 0) + n.radius;
        if (n.pos.y < groundY) n.pos.y = groundY;
      }
    }

    this.restEnergy = totalKinetic;
    if (totalKinetic < 0.08) this.settled = true;

    // Применяем результат физики к скелету Three.js с учётом высоты пола арены
    this.applyToSkeleton(arena);
  }

  // Применение физических узлов к Three.js Object3D
  applyToSkeleton(arena) {
    const e = this.enemy;
    const j = e.j;

    if (this.isMage) {
      const sacN = this.nodeMap.sac;
      const topN = this.nodeMap.sacTop;
      const tailN = this.nodeMap.tail;
      if (sacN) {
        const floorY = arena ? arena.groundTopAt(sacN.pos.x, sacN.pos.z, sacN.pos.y) : 0;
        e.group.position.set(sacN.pos.x, floorY, sacN.pos.z);
        e.pos.copy(e.group.position);
        e.root.position.set(0, 0, 0);
        if (j.sac) {
          j.sac.position.set(0, Math.max(0.2, sacN.pos.y - floorY), 0);
          if (topN) {
            orientJointTowards(j.sac, sacN.pos, topN.pos, _vUp);
          }
        }
      }
      if (tailN && j.tail && sacN) {
        orientJointTowards(j.tail, sacN.pos, tailN.pos, new THREE.Vector3(0, -1, 0));
      }
      if (j.tendrils && sacN) {
        for (let i = 0; i < j.tendrils.length; i++) {
          const tN = this.nodeMap[`tendril_${i}`];
          const tJoint = j.tendrils[i];
          if (tN && tJoint) {
            orientJointTowards(tJoint, sacN.pos, tN.pos, new THREE.Vector3(0, -1, 0));
          }
        }
      }
      return;
    }

    const pelvisN = this.nodeMap.pelvis;
    const spineN = this.nodeMap.spine;
    const chestN = this.nodeMap.chest;
    const headN = this.nodeMap.head;
    const lHipN = this.nodeMap.lHip;
    const rHipN = this.nodeMap.rHip;
    const lShoulderN = this.nodeMap.lShoulder;
    const lElbowN = this.nodeMap.lElbow;
    const lHandN = this.nodeMap.lHand;
    const rShoulderN = this.nodeMap.rShoulder;
    const rElbowN = this.nodeMap.rElbow;
    const rHandN = this.nodeMap.rHand;
    const lKneeN = this.nodeMap.lKnee;
    const lFootN = this.nodeMap.lFoot;
    const rKneeN = this.nodeMap.rKnee;
    const rFootN = this.nodeMap.rFoot;

    if (!pelvisN || !chestN) return;

    // Позиционируем корневую группу врага точно на поверхности пола арены
    const floorY = arena ? arena.groundTopAt(pelvisN.pos.x, pelvisN.pos.z, pelvisN.pos.y) : 0;
    e.group.position.set(pelvisN.pos.x, floorY, pelvisN.pos.z);
    e.group.rotation.set(0, 0, 0);
    e.pos.copy(e.group.position);

    // Сбрасываем root
    e.root.position.set(0, 0, 0);
    e.root.rotation.set(0, 0, 0);

    // 1. Таз (Pelvis): позиция на высоте узла pelvisN над floorY
    if (j.pelvis) {
      j.pelvis.position.set(0, Math.max(0.14, pelvisN.pos.y - floorY), 0);

      // Up = Spine, Right = Hip axis, Forward = Up x Right
      const upVec = _v1.subVectors(chestN.pos, pelvisN.pos).normalize();
      let rightVec = _v2.set(1, 0, 0);
      if (lHipN && rHipN) {
        rightVec.subVectors(lHipN.pos, rHipN.pos).normalize();
      }
      const fwdVec = _v3.crossVectors(upVec, rightVec).normalize();
      rightVec.crossVectors(fwdVec, upVec).normalize();

      _m1.makeBasis(rightVec, upVec, fwdVec);
      j.pelvis.quaternion.setFromRotationMatrix(_m1);
    }

    // Обновляем мировую матрицу таза для корректного перевода координат детей
    j.pelvis.updateMatrixWorld(true);

    // 2. Позвоночник и грудь
    if (j.spine && spineN && chestN) {
      orientJointTowards(j.spine, spineN.pos, chestN.pos, _vUp);
      j.spine.updateMatrixWorld(true);
    }
    if (j.chest && chestN && headN) {
      orientJointTowards(j.chest, chestN.pos, headN.pos, _vUp);
      j.chest.updateMatrixWorld(true);
    }

    // 3. Голова
    if (j.head && headN && !e.severed?.head) {
      const neckN = this.nodeMap.neck || chestN;
      orientJointTowards(j.head, neckN.pos, headN.pos, _vUp);
    }

    // 4. Левая рука
    if (j.lShoulder && lShoulderN && lElbowN && !e.severed?.lArm) {
      orientJointTowards(j.lShoulder, lShoulderN.pos, lElbowN.pos, BONE_DOWN);
      j.lShoulder.updateMatrixWorld(true);

      if (j.lElbow && lHandN) {
        orientJointTowards(j.lElbow, lElbowN.pos, lHandN.pos, BONE_DOWN);
      }
    }

    // 5. Правая рука
    if (j.rShoulder && rShoulderN && rElbowN && !e.severed?.rArm) {
      orientJointTowards(j.rShoulder, rShoulderN.pos, rElbowN.pos, BONE_DOWN);
      j.rShoulder.updateMatrixWorld(true);

      if (j.rElbow && rHandN) {
        orientJointTowards(j.rElbow, rElbowN.pos, rHandN.pos, BONE_DOWN);
      }
    }

    // 6. Левая нога
    if (j.lHip && lHipN && lKneeN && !e.severed?.lLeg) {
      orientJointTowards(j.lHip, lHipN.pos, lKneeN.pos, BONE_DOWN);
      j.lHip.updateMatrixWorld(true);

      if (j.lKnee && lFootN) {
        orientJointTowards(j.lKnee, lKneeN.pos, lFootN.pos, BONE_DOWN);
      }
    }

    // 7. Правая нога
    if (j.rHip && rHipN && rKneeN && !e.severed?.rLeg) {
      orientJointTowards(j.rHip, rHipN.pos, rKneeN.pos, BONE_DOWN);
      j.rHip.updateMatrixWorld(true);

      if (j.rKnee && rFootN) {
        orientJointTowards(j.rKnee, rKneeN.pos, rFootN.pos, BONE_DOWN);
      }
    }
  }
}

// ============================================================================
// Физический отстреленный кусок тела (Severed Limb Prop)
// ============================================================================
export class SeveredLimbProp {
  constructor(mesh, spawnPos, impulseDir, type = 'limb', scene, fx, tex) {
    this.scene = scene;
    this.fx = fx;
    this.mesh = mesh;
    this.type = type;
    this.life = 35.0;
    this.time = 0;
    this.bloodDripT = 0;

    this.pos = spawnPos.clone();
    this.prevPos = spawnPos.clone();
    this.vel = new THREE.Vector3();
    this.angVel = new THREE.Vector3(rand(-12, 12), rand(-10, 10), rand(-12, 12));
    this.rot = new THREE.Euler(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28));

    const f = rand(5.0, 10.0);
    this.vel.x = impulseDir.x * f + rand(-2.5, 2.5);
    this.vel.y = rand(3.5, 7.5);
    this.vel.z = impulseDir.z * f + rand(-2.5, 2.5);
    this.radius = type === 'head' ? 0.18 : 0.14;

    this.mesh.position.copy(this.pos);
    this.mesh.rotation.copy(this.rot);
    this.scene.add(this.mesh);
  }

  update(dt, arena) {
    this.time += dt;
    this.life -= dt;

    if (this.life <= 0) {
      this.destroy();
      return false;
    }

    const gravity = 25.0;
    const damping = Math.pow(0.92, dt * 60);
    const bounce = 0.32;
    const friction = 0.58;

    this.vel.y -= gravity * dt;
    this.vel.x *= damping;
    this.vel.z *= damping;
    this.vel.y *= damping;

    this.pos.addScaledVector(this.vel, dt);

    // Вращение
    this.rot.x += this.angVel.x * dt;
    this.rot.y += this.angVel.y * dt;
    this.rot.z += this.angVel.z * dt;
    this.angVel.multiplyScalar(damping);

    // Коллизия с землей
    const groundY = (arena ? arena.groundTopAt(this.pos.x, this.pos.z, this.pos.y) : 0) + this.radius;
    if (this.pos.y < groundY) {
      this.pos.y = groundY;
      if (this.vel.y < 0) {
        this.vel.y *= -bounce;
        this.vel.x *= friction;
        this.vel.z *= friction;
        this.angVel.multiplyScalar(0.5);
        if (Math.abs(this.vel.y) < 0.4) this.vel.y = 0;
        // Кровавый отпечаток при ударе
        if (Math.random() < 0.45) {
          this.fx.bloodFloor(this.pos.x, this.pos.z, rand(0.6, 1.1));
        }
      }
    }

    // Капли крови в полёте
    if (this.vel.lengthSq() > 1.0) {
      this.bloodDripT -= dt;
      if (this.bloodDripT <= 0) {
        this.bloodDripT = 0.08;
        if (this.fx && this.fx.voxel) {
          this.fx.voxel(this.pos.x, this.pos.y, this.pos.z, 0, -1.2, 0, new THREE.Color(0x8a0c0a), 0.035, 1.5, { bounce: 0 });
        }
      }
    }

    this.mesh.position.copy(this.pos);
    this.mesh.rotation.copy(this.rot);
    return true;
  }

  destroy() {
    this.scene.remove(this.mesh);
  }
}
