import { rand, pick } from './config.js';

// Волны: состав контролируется номером волны, спавн — по очереди из случайных точек спавна карты
export class Waves {
  constructor(enemies, arena, hooks) {
    this.enemies = enemies;
    this.arena = arena;
    this.hooks = hooks || {};
    this.num = 0;
    this.state = 'idle';
    this.t = 0;
    this.queue = [];
    this.spawnT = 0;
    this.pending = [];
    this.totalThisWave = 0;
  }

  setArena(arena) {
    this.arena = arena;
  }

  reset() {
    this.num = 0;
    this.queue = [];
    this.pending = [];
    this.state = 'intermission';
    this.t = 3.5;
    this.hooks.countdown && this.hooks.countdown(3.5, 1);
  }

  startIntermission(sec) {
    this.state = 'intermission';
    this.t = sec;
  }

  _composition(n) {
    const q = [];
    const push = (t, c) => { for (let i = 0; i < c; i++) q.push(t); };
    push('minion', 4 + n * 2);
    if (n >= 2) push('rogue', 1 + Math.floor(n * 0.8));
    if (n >= 3) push('mage', Math.floor((n - 1) / 2));
    if (n >= 4) push('warrior', Math.floor(n / 2) - 1);
    // перемешиваем
    q.sort(() => Math.random() - 0.5);
    const cap = 30;
    return q.slice(0, cap);
  }

  _startWave() {
    this.num++;
    this.queue = this._composition(this.num);
    this.totalThisWave = this.queue.length;
    this.spawnT = 0.5;
    this.state = 'combat';
    this.hooks.waveStart && this.hooks.waveStart(this.num, this.totalThisWave);
  }

  update(dt) {
    if (this.state === 'intermission') {
      this.t -= dt;
      this.hooks.countdown && this.hooks.countdown(Math.max(0, this.t), this.num + 1);
      if (this.t <= 0) this._startWave();
      return;
    }
    if (this.state !== 'combat') return;

    // отложенный спавн (портал -> враг)
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      if (p.t <= 0) {
        this.enemies.spawn(p.type, p.x, p.z, this.num);
        this.pending.splice(i, 1);
      }
    }

    if (this.queue.length > 0) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = Math.max(0.22, 0.85 - this.num * 0.04) + rand(0, 0.2);
        const type = this.queue.shift();
        const sp = pick(this.arena.spawnPoints) || { x: 0, z: 0 };
        const px = sp.x + rand(-1.2, 1.2), pz = sp.z + rand(-1.2, 1.2);
        this.hooks.portal && this.hooks.portal(px, pz);
        this.pending.push({ type, x: px, z: pz, t: 0.45 });
      }
    } else if (this.pending.length === 0 && this.enemies.aliveCount === 0) {
      this.hooks.waveClear && this.hooks.waveClear(this.num);
      this.startIntermission(7);
    } else if (this.pending.length === 0 && this.queue.length === 0) {
      // предохранитель: если враги застряли и ничего не меняется
      const alive = this.enemies.aliveCount;
      if (alive === this._lastAlive) this.stallT = (this.stallT || 0) + dt;
      else this.stallT = 0;
      this._lastAlive = alive;
      if (this.stallT > 30) {
        this.stallT = 0;
        this.enemies.killAllInstant();
      }
    }
  }
}
