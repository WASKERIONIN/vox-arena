import * as THREE from 'three';
import { rand, randi, pick } from './config.js';

// Воксельные эффекты: кровь/гибсы/искры/дым/гильзы/дырки/трассеры/вспышки
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v3 = new THREE.Vector3();
const _s3 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class FX {
  constructor(scene, tex) {
    this.scene = scene;
    this.budget = 1; // множитель количества
    this.MAX = 4000;
    // ---- пул вокселей ----
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial();
    this.mesh = new THREE.InstancedMesh(geo, mat, this.MAX);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.MAX * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    const F = this.MAX;
    this.px = new Float32Array(F); this.py = new Float32Array(F); this.pz = new Float32Array(F);
    this.vx = new Float32Array(F); this.vy = new Float32Array(F); this.vz = new Float32Array(F);
    this.life = new Float32Array(F); this.ttl = new Float32Array(F);
    this.size = new Float32Array(F); this.spin = new Float32Array(F); this.phase = new Float32Array(F);
    this.bounce = new Float32Array(F); this.grav = new Float32Array(F);
    this.rest = new Uint8Array(F); this.colors = new Float32Array(F * 3);
    this.count = 0;

    // ---- дым (спрайты) ----
    this.smokes = [];
    const smokeMat = new THREE.SpriteMaterial({ map: tex.smoke, color: 0x888080, transparent: true, opacity: 0.5, depthWrite: false });
    for (let i = 0; i < 80; i++) {
      const s = new THREE.Sprite(smokeMat.clone());
      s.visible = false; scene.add(s);
      this.smokes.push({ s, life: 0, ttl: 1, vel: new THREE.Vector3(), grow: 1, op: 0.5 });
    }
    this.smokeI = 0;

    // ---- вспышки-спрайты ----
    this.flashes = [];
    const flashMat = new THREE.SpriteMaterial({ map: tex.flash, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(flashMat.clone());
      s.visible = false; scene.add(s);
      this.flashes.push({ s, life: 0 });
    }
    this.flashI = 0;

    // ---- дульный свет ----
    this.light = new THREE.PointLight(0xffb050, 0, 16, 2);
    scene.add(this.light);
    this.lightT = 0;

    // ---- декали ----
    this.holes = []; this.holeI = 0;
    const holeMat = new THREE.MeshBasicMaterial({ map: tex.hole, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), holeMat);
      m.visible = false; m.renderOrder = 2; scene.add(m); this.holes.push(m);
    }
    this.bloods = []; this.bloodI = 0;
    const bloodMat = new THREE.MeshBasicMaterial({ map: tex.splat, color: 0x7d0f0a, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bloodMat);
      m.visible = false; m.renderOrder = 2; scene.add(m); this.bloods.push(m);
    }

    // ---- трассеры ----
    this.tracers = [];
    for (let i = 0; i < 20; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      l.visible = false; l.frustumCulled = false; scene.add(l);
      this.tracers.push({ l, life: 0 });
    }
    this.tracerI = 0;
    this.time = 0;
    this.cameraPos = new THREE.Vector3(0, 1.6, 0);
    this._cam = null;
  }

  setCamera(cam) { this._cam = cam; }

  setBudget(b) { this.budget = b; }

  // ======== воксели ========
  voxel(x, y, z, vx, vy, vz, color, size, ttl, { bounce = 0.4, grav = 1 } = {}) {
    if (this.count >= this.MAX) {
      // вытесняем самый старый
      this._kill(0);
    }
    const i = this.count++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = ttl; this.ttl[i] = ttl; this.size[i] = size;
    this.spin[i] = rand(-6, 6); this.phase[i] = rand(0, 6.28);
    this.bounce[i] = bounce; this.grav[i] = grav; this.rest[i] = 0;
    this.colors[i * 3] = color.r; this.colors[i * 3 + 1] = color.g; this.colors[i * 3 + 2] = color.b;
  }
  _kill(i) {
    const last = --this.count;
    if (i !== last) {
      const a = ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'life', 'ttl', 'size', 'spin', 'phase', 'bounce', 'grav'];
      for (const k of a) this[k][i] = this[k][last];
      this.rest[i] = this.rest[last];
      for (let c = 0; c < 3; c++) this.colors[i * 3 + c] = this.colors[last * 3 + c];
    }
  }
  _c(hex) { return new THREE.Color(hex); }

  blood(p, dir, n = 36, power = 1.6) {
    n = Math.round(n * this.budget);
    const cols = [this._c(0xc81410), this._c(0x9e1210), this._c(0xe82828), this._c(0x5a0808), this._c(0x7d0a0a)];
    for (let i = 0; i < n; i++) {
      this.voxel(
        p.x + rand(-0.08, 0.08), p.y + rand(-0.08, 0.08), p.z + rand(-0.08, 0.08),
        dir.x * rand(2.5, 6.5) * power + rand(-2.5, 2.5), rand(0.8, 4.2) * power, dir.z * rand(2.5, 6.5) * power + rand(-2.5, 2.5),
        pick(cols), rand(0.045, 0.095), rand(1.2, 2.8)
      );
    }
    // при каждом ранении оставляем след крови на полу!
    if (Math.random() < 0.6) {
      this.bloodFloor(p.x + rand(-0.3, 0.3), p.z + rand(-0.3, 0.3), rand(0.5, 0.95));
    }
  }
  gib(p, big = false) {
    const n = Math.round((big ? 90 : 60) * this.budget) + 10;
    const meat = [this._c(0xa11414), this._c(0x7d0f0a), this._c(0xd42a2a)];
    const bone = [this._c(0xd8cfc0), this._c(0xbfb5a2), this._c(0x8f8676)];
    for (let i = 0; i < n; i++) {
      const isBone = Math.random() < 0.3;
      const col = isBone ? pick(bone) : pick(meat);
      const a = rand(0, Math.PI * 2), up = rand(2.5, big ? 9 : 6.5);
      this.voxel(
        p.x + rand(-0.25, 0.25), p.y + rand(0.2, big ? 2.0 : 1.5), p.z + rand(-0.25, 0.25),
        Math.cos(a) * rand(0.5, 4.5), up, Math.sin(a) * rand(0.5, 4.5),
        col, rand(0.05, big ? 0.19 : 0.14), rand(4, 8), { bounce: 0.35 }
      );
    }
    // лужа под телом
    this.bloodFloor(p.x, p.z, big ? rand(1.8, 2.6) : rand(1.1, 1.8));
  }
  dissolve(p, radius, height) {
    // воксельный распад трупа после анимации смерти
    const n = Math.round(46 * this.budget);
    const cols = [this._c(0xd8cfc0), this._c(0xbfb5a2), this._c(0x7d0f0a), this._c(0x3a3226)];
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * radius;
      this.voxel(
        p.x + Math.cos(a) * r, p.y + rand(0.1, height), p.z + Math.sin(a) * r,
        Math.cos(a) * rand(0.4, 2), rand(1, 3.2), Math.sin(a) * rand(0.4, 2),
        pick(cols), rand(0.05, 0.12), rand(3, 6), { bounce: 0.3 }
      );
    }
    this.bloodFloor(p.x, p.z, rand(0.9, 1.5));
  }
  impact(p, n) {
    const k = Math.round(10 * this.budget);
    const spark = this._c(0xffcf60), dark = this._c(0x5a5a60), orange = this._c(0xff7a20);
    for (let i = 0; i < k; i++) {
      const v = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).add(n.clone().multiplyScalar(1.6)).normalize().multiplyScalar(rand(2, 7));
      this.voxel(p.x, p.y, p.z, v.x, v.y + 1, v.z, Math.random() < 0.55 ? spark : (Math.random() < 0.5 ? dark : orange), rand(0.02, 0.05), rand(0.3, 0.8), { grav: 1.4, bounce: 0.3 });
    }
    this.smokePuff(p, 1, 0x777068);
    this.decal(this.holes, p, n, rand(0.12, 0.2));
  }
  explosion(p) {
    const fire = [this._c(0xff8a30), this._c(0xffd060), this._c(0xff4410)];
    const n = Math.round(36 * this.budget);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), up = rand(1, 7);
      this.voxel(p.x, p.y + 0.1, p.z, Math.cos(a) * rand(1, 6), up, Math.sin(a) * rand(1, 6),
        pick(fire), rand(0.05, 0.14), rand(0.4, 1.1), { grav: 0.7, bounce: 0.2 });
    }
    const dark = this._c(0x2c2828);
    for (let i = 0; i < Math.round(10 * this.budget); i++)
      this.voxel(p.x, p.y + 0.2, p.z, rand(-2, 2), rand(2, 5), rand(-2, 2), dark, rand(0.08, 0.16), rand(1.5, 2.5), { grav: 0.25, bounce: 0 });
    this.smokePuff(p, 4, 0x555050);
    this.flash(p, 0xffa040, 3.2, 0.14);
    this._pulseLight(p, 90, 0xff7030);
  }
  muzzle(p, dir) {
    this.flash(p, 0xffd890, rand(0.2, 0.28), 0.05);
    this._pulseLight(p, 40, 0xffa850);
    // дым: не каждый выстрел, иначе завешивает экран
    if ((this._shotN = (this._shotN || 0) + 1) % 3 === 0)
      this.smokePuff(_v3.copy(p).addScaledVector(dir, 0.25), 0.7, 0x9a908a, 0.22);
    const sp = Math.round(3 * this.budget);
    const spark = this._c(0xffd870);
    for (let i = 0; i < sp; i++)
      this.voxel(p.x, p.y, p.z, dir.x * rand(4, 9) + rand(-1.5, 1.5), rand(-0.5, 2), dir.z * rand(4, 9) + rand(-1.5, 1.5), spark, rand(0.02, 0.04), rand(0.12, 0.3), { grav: 0.6, bounce: 0 });
  }
  casing(p, rightDir) {
    const brass = this._c(0xc9a227);
    this.voxel(p.x, p.y, p.z,
      rightDir.x * rand(1.4, 2.6) + rand(-0.4, 0.4), rand(1.6, 2.8), rightDir.z * rand(1.4, 2.6) + rand(-0.4, 0.4),
      brass, 0.032, rand(3.5, 5), { bounce: 0.45 });
  }
  portal(p) {
    const red = [this._c(0xff2418), this._c(0x8c0f0a), this._c(0xff7050)];
    const n = Math.round(26 * this.budget);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), r = rand(1.4, 3);
      const sx = p.x + Math.cos(a) * r, sz = p.z + Math.sin(a) * r;
      // воксели влетают к центру (имплозия)
      this.voxel(sx, rand(0.2, 2.2), sz, -Math.cos(a) * rand(2, 5), rand(-1, 2), -Math.sin(a) * rand(2, 5),
        pick(red), rand(0.04, 0.1), rand(0.5, 0.9), { grav: 0.2, bounce: 0 });
    }
    this.flash(new THREE.Vector3(p.x, p.y + 1, p.z), 0xff3020, 1.6, 0.2);
  }
  splash(p) {
    const cols = [this._c(0x9a30ff), this._c(0x5b0f9e), this._c(0xd070ff)];
    const n = Math.round(20 * this.budget);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      this.voxel(p.x, p.y, p.z, Math.cos(a) * rand(1, 5), rand(1, 5), Math.sin(a) * rand(1, 5), pick(cols), rand(0.03, 0.08), rand(0.5, 1.2));
    }
  }

  smokePuff(p, scale = 1, color = 0x9a908a, opacity = 0.4) {
    // не спавним дым вплотную к камере — закрывает экран «пеленой»
    const o = this.smokes[this.smokeI = (this.smokeI + 1) % this.smokes.length];
    o.s.visible = true;
    o.s.position.copy(p);
    o.minDist = 0.45; // ближе к камере скрываем в update
    o.s.scale.setScalar(rand(0.25, 0.45) * scale);
    o.s.material.color.set(color);
    o.s.material.opacity = o.op = opacity;
    o.s.material.rotation = rand(0, 6.28);
    o.vel.set(rand(-0.5, 0.5), rand(0.6, 1.4), rand(-0.5, 0.5));
    o.grow = rand(1.4, 2.4) * scale;
    o.ttl = o.life = rand(0.5, 0.9);
  }
  flash(p, color, scale, dur) {
    const o = this.flashes[this.flashI = (this.flashI + 1) % this.flashes.length];
    o.s.visible = true;
    o.s.position.copy(p);
    o.s.material.color.set(color);
    o.s.scale.setScalar(scale);
    o.ttl = o.life = dur;
  }
  _pulseLight(p, intensity, color) {
    this.light.position.copy(p);
    this.light.color.set(color);
    this.light.intensity = intensity;
    this.lightT = 0.07;
  }
  tracer(a, b) {
    const o = this.tracers[this.tracerI = (this.tracerI + 1) % this.tracers.length];
    const pos = o.l.geometry.attributes.position;
    pos.setXYZ(0, a.x, a.y, a.z); pos.setXYZ(1, b.x, b.y, b.z);
    pos.needsUpdate = true;
    o.l.visible = true; o.l.material.opacity = 0.85;
    o.life = 0.07;
  }
  decal(pool, p, n, size) {
    const m = pool[pool === this.holes ? (this.holeI = (this.holeI + 1) % pool.length) : (this.bloodI = (this.bloodI + 1) % pool.length)];
    m.visible = true;
    m.position.copy(p).addScaledVector(n, 0.02);
    m.scale.setScalar(size);
    m.lookAt(_v3.copy(p).add(n));
    m.rotateZ(rand(0, Math.PI * 2));
  }
  bloodFloor(x, z, size) {
    this.decal(this.bloods, _v3.set(x, 0.021, z), UP, size);
  }

  clear() {
    this.count = 0; this.mesh.count = 0;
    this.smokes.forEach(o => { o.s.visible = false; o.life = 0; });
    this.flashes.forEach(o => { o.s.visible = false; o.life = 0; });
    this.holes.forEach(m => m.visible = false);
    this.bloods.forEach(m => m.visible = false);
    this.tracers.forEach(o => { o.l.visible = false; o.life = 0; });
    this.light.intensity = 0;
  }

  update(dt) {
    this.time += dt;
    if (this._cam) this._cam.getWorldPosition(this.cameraPos);
    // воксели
    let n = this.count;
    for (let i = 0; i < n; i++) {
      if (this.life[i] <= 0 || !isFinite(this.px[i]) || !isFinite(this.py[i]) || !isFinite(this.size[i])) { this._kill(i); i--; n--; continue; }
      if (!this.rest[i]) {
        this.vy[i] -= 22 * this.grav[i] * dt;
        this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
        const half = this.size[i] * 0.5;
        if (this.py[i] < half && this.vy[i] < 0) {
          this.py[i] = half;
          this.vy[i] *= -this.bounce[i];
          this.vx[i] *= 0.55; this.vz[i] *= 0.55;
          if (Math.abs(this.vy[i]) < 0.7) { this.rest[i] = 1; this.vy[i] = 0; }
        }
      }
      this.life[i] -= dt;
      const k = Math.min(1, this.life[i] / (this.ttl[i] * 0.25));
      const s = this.size[i] * k;
      _e.set(this.phase[i] + this.spin[i] * this.time, this.phase[i] * 1.7 + this.spin[i] * 1.3 * this.time, 0);
      _q.setFromEuler(_e);
      _s3.set(s, s, s);
      _m4.compose(_v3.set(this.px[i], this.py[i], this.pz[i]), _q, _s3);
      this.mesh.setMatrixAt(i, _m4);
      this.mesh.instanceColor.array[i * 3] = this.colors[i * 3];
      this.mesh.instanceColor.array[i * 3 + 1] = this.colors[i * 3 + 1];
      this.mesh.instanceColor.array[i * 3 + 2] = this.colors[i * 3 + 2];
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;

    // дым
    const cp = this.cameraPos;
    for (const o of this.smokes) {
      if (o.life <= 0) { if (o.s.visible) o.s.visible = false; continue; }
      o.life -= dt;
      o.s.position.addScaledVector(o.vel, dt);
      o.vel.y += 0.4 * dt;
      o.s.scale.addScalar(o.grow * dt);
      o.s.material.opacity = o.op * Math.max(0, o.life / o.ttl);
      // защита от «пелены»: спрайт ближе 0.5м к камере не показываем
      const dx = o.s.position.x - cp.x, dy = o.s.position.y - cp.y, dz = o.s.position.z - cp.z;
      if (dx * dx + dy * dy + dz * dz < 0.25) { o.s.visible = false; continue; }
      if (o.life <= 0) o.s.visible = false;
    }
    // вспышки
    for (const o of this.flashes) {
      if (o.life <= 0) { if (o.s.visible) o.s.visible = false; continue; }
      o.life -= dt;
      o.s.material.opacity = Math.max(0, o.life / o.ttl);
      if (o.life <= 0) o.s.visible = false;
    }
    // свет
    if (this.lightT > 0) {
      this.lightT -= dt;
      this.light.intensity *= Math.max(0, 1 - dt * 22);
      if (this.lightT <= 0) this.light.intensity = 0;
    }
    // трассеры
    for (const o of this.tracers) {
      if (o.life <= 0) { if (o.l.visible) o.l.visible = false; continue; }
      o.life -= dt;
      o.l.material.opacity = Math.max(0, o.life / 0.07) * 0.85;
      if (o.life <= 0) o.l.visible = false;
    }
  }
}
