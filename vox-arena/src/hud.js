import { DEFAULTS, PRESETS, PARTICLE_BUDGET, clamp } from './config.js';

const $ = id => document.getElementById(id);

const RANKS = [
  { min: 0, name: 'D', color: '#8a8a8a' },
  { min: 250, name: 'C', color: '#7fb0ff' },
  { min: 700, name: 'B', color: '#59d959' },
  { min: 1400, name: 'A', color: '#ffd23a' },
  { min: 2400, name: 'S', color: '#ff7a20' },
  { min: 3800, name: 'ULTRA', color: '#ff2418' },
];

export class HUD {
  constructor(settings, applyFns) {
    this.els = {};
    for (const id of ['hud', 'crosshair', 'hitmarker', 'hp-bar-fill', 'hp-num', 'ammo-num', 'ammo-mag',
      'weapon-name', 'slot-1', 'slot-2', 'flashlight-status',
      'reload-note', 'wave-label', 'kills-label', 'score-label', 'style-rank', 'style-bar-fill',
      'style-event', 'banner', 'banner-main', 'banner-sub', 'countdown', 'hint', 'fps',
      'damage-flash', 'lowhp', 'vignette', 'menu', 'settings', 'help', 'pause', 'death',
      'death-stats', 'loading', 'fallback-note', 'settings-rows', 'fade']) this.els[id] = $(id);
    this.settings = settings;
    this.applyFns = applyFns;
    this._bannerT = null; this._hmT = null; this._eventT = null;

    // Высококачественная система органических PS1-брызг крови на экран
    this.bloodCanvas = $('blood-canvas');
    this.bloodCtx = this.bloodCanvas ? this.bloodCanvas.getContext('2d') : null;
    this.splatters = [];
    this._initBloodCanvas();

    this._buildSettings();
    this._bind();
  }

  _initBloodCanvas() {
    if (!this.bloodCanvas) return;
    const resize = () => {
      // Пикселизированное ретро-разрешение для аутентичного PS1-стиля
      const aspect = window.innerWidth / (window.innerHeight || 1);
      this.bloodCanvas.width = Math.floor(320 * (aspect / 1.77));
      this.bloodCanvas.height = 240;
    };
    window.addEventListener('resize', resize);
    resize();
  }

  // Генерация органического многослойного кровавого пятна
  _createSplatter(x, y, baseRadius, type = 'splotch') {
    const numPts = Math.floor(10 + Math.random() * 8);
    const pts = [];
    for (let i = 0; i < numPts; i++) {
      const a = (i / numPts) * Math.PI * 2;
      // Неровные органические выступы и шипы брызг
      const spike = Math.random() < 0.35 ? (1.5 + Math.random() * 1.3) : (0.6 + Math.random() * 0.55);
      const r = baseRadius * spike;
      pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }

    // Сателлитные капли (мелкие брызги вокруг эпицентра)
    const satellites = [];
    const numSats = Math.floor(4 + Math.random() * 8);
    for (let i = 0; i < numSats; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = baseRadius * (1.2 + Math.random() * 2.2);
      satellites.push({
        x: Math.cos(a) * d,
        y: Math.sin(a) * d,
        r: Math.max(1.2, baseRadius * (0.08 + Math.random() * 0.18)),
      });
    }

    // Гравитационные струйки крови, стекающие вниз
    const drips = [];
    if (Math.random() < 0.65 || baseRadius > 16) {
      const numDrips = Math.random() < 0.4 ? 2 : 1;
      for (let d = 0; d < numDrips; d++) {
        drips.push({
          xOff: (Math.random() - 0.5) * baseRadius * 0.8,
          targetLen: baseRadius * (1.5 + Math.random() * 3.5),
          curLen: 0,
          speed: 18 + Math.random() * 26,
          width: Math.max(1.5, baseRadius * (0.14 + Math.random() * 0.12)),
          wobble: Math.random() * 10,
        });
      }
    }

    return {
      x, y, baseRadius, pts, satellites, drips,
      type,
      alpha: 0.92 + Math.random() * 0.08,
      life: 3.2 + Math.random() * 1.6,
      maxLife: 4.8,
    };
  }

  // Добавление сочных брызг на экран
  addScreenBlood(intensity = 1.0, normX = null, normY = null) {
    if (!this.bloodCtx || !this.bloodCanvas) return;
    const w = this.bloodCanvas.width, h = this.bloodCanvas.height;

    const cx = normX !== null ? normX * w : (w * 0.5 + (Math.random() - 0.5) * w * 0.65);
    const cy = normY !== null ? normY * h : (h * 0.5 + (Math.random() - 0.5) * h * 0.65);

    const count = Math.floor((3 + Math.random() * 4) * intensity);
    for (let i = 0; i < count; i++) {
      const ox = cx + (Math.random() - 0.5) * w * 0.35 * (i > 0 ? 1 : 0.2);
      const oy = cy + (Math.random() - 0.5) * h * 0.35 * (i > 0 ? 1 : 0.2);
      const rad = (i === 0 ? (16 + Math.random() * 18) : (6 + Math.random() * 12)) * (0.8 + intensity * 0.4);
      this.splatters.push(this._createSplatter(ox, oy, rad));
    }

    // Ограничиваем количество одновременных пятен для производительности
    if (this.splatters.length > 28) {
      this.splatters.splice(0, this.splatters.length - 28);
    }
  }

  updateBlood(dt) {
    if (!this.bloodCtx || !this.bloodCanvas || this.splatters.length === 0) return;
    const ctx = this.bloodCtx;
    ctx.clearRect(0, 0, this.bloodCanvas.width, this.bloodCanvas.height);

    for (let i = this.splatters.length - 1; i >= 0; i--) {
      const s = this.splatters[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.splatters.splice(i, 1);
        continue;
      }

      // Стекание струек
      for (const dr of s.drips) {
        if (dr.curLen < dr.targetLen) {
          dr.curLen = Math.min(dr.targetLen, dr.curLen + dr.speed * dt);
        }
      }

      const fade = Math.min(1, s.life / 0.9);
      const curAlpha = s.alpha * fade;

      // ======================================================================
      // 1. Тёмный запекшийся кровавый контур (Dark Coagulated Rim)
      // ======================================================================
      ctx.save();
      ctx.translate(s.x, s.y);

      // Струйки крови (тёмный подслой)
      for (const dr of s.drips) {
        if (dr.curLen > 1) {
          ctx.beginPath();
          ctx.lineWidth = dr.width + 1.2;
          ctx.strokeStyle = `rgba(32, 2, 2, ${curAlpha * 0.95})`;
          ctx.moveTo(dr.xOff, 0);
          const midY = dr.curLen * 0.5;
          const wobbleX = Math.sin(dr.wobble + dr.curLen * 0.1) * 2;
          ctx.quadraticCurveTo(dr.xOff + wobbleX, midY, dr.xOff, dr.curLen);
          ctx.stroke();

          // Капля на конце струи
          ctx.beginPath();
          ctx.fillStyle = `rgba(32, 2, 2, ${curAlpha * 0.95})`;
          ctx.arc(dr.xOff, dr.curLen, dr.width * 1.35, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Основное неровное тело кляксы
      ctx.beginPath();
      for (let p = 0; p < s.pts.length; p++) {
        const pt = s.pts[p];
        if (p === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(38, 3, 3, ${curAlpha * 0.95})`;
      ctx.fill();

      // Сателлитные брызги (тёмный слой)
      for (const sat of s.satellites) {
        ctx.beginPath();
        ctx.arc(sat.x, sat.y, sat.r + 0.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(38, 3, 3, ${curAlpha * 0.95})`;
        ctx.fill();
      }

      // ======================================================================
      // 2. Густая артериальная плоть крови (Rich Crimson Core)
      // ======================================================================
      for (const dr of s.drips) {
        if (dr.curLen > 1) {
          ctx.beginPath();
          ctx.lineWidth = dr.width;
          ctx.strokeStyle = `rgba(138, 10, 8, ${curAlpha})`;
          ctx.moveTo(dr.xOff, 0);
          const midY = dr.curLen * 0.5;
          const wobbleX = Math.sin(dr.wobble + dr.curLen * 0.1) * 2;
          ctx.quadraticCurveTo(dr.xOff + wobbleX, midY, dr.xOff, dr.curLen);
          ctx.stroke();

          ctx.beginPath();
          ctx.fillStyle = `rgba(138, 10, 8, ${curAlpha})`;
          ctx.arc(dr.xOff, dr.curLen, dr.width * 1.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.beginPath();
      for (let p = 0; p < s.pts.length; p++) {
        const pt = s.pts[p];
        const sc = 0.82;
        if (p === 0) ctx.moveTo(pt.x * sc, pt.y * sc);
        else ctx.lineTo(pt.x * sc, pt.y * sc);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(152, 14, 12, ${curAlpha})`;
      ctx.fill();

      for (const sat of s.satellites) {
        ctx.beginPath();
        ctx.arc(sat.x, sat.y, sat.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(152, 14, 12, ${curAlpha})`;
        ctx.fill();
      }

      // ======================================================================
      // 3. Свежие мокрые блики (Glossy Highlights)
      // ======================================================================
      ctx.beginPath();
      for (let p = 0; p < s.pts.length; p += 2) {
        const pt = s.pts[p];
        const sc = 0.45;
        if (p === 0) ctx.moveTo(pt.x * sc, pt.y * sc);
        else ctx.lineTo(pt.x * sc, pt.y * sc);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(215, 45, 35, ${curAlpha * 0.75})`;
      ctx.fill();

      // Маленькая белесая влажная точка на верхнем крае
      ctx.beginPath();
      ctx.arc(-s.baseRadius * 0.22, -s.baseRadius * 0.22, Math.max(1, s.baseRadius * 0.12), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 160, 150, ${curAlpha * 0.6})`;
      ctx.fill();

      ctx.restore();
    }
  }

  clearBlood() {
    this.splatters.length = 0;
    if (this.bloodCtx && this.bloodCanvas) {
      this.bloodCtx.clearRect(0, 0, this.bloodCanvas.width, this.bloodCanvas.height);
    }
  }

  // принудительная очистка вспышек/оверлеев
  forceClearOverlays() {
    const d = this.els['damage-flash'];
    d.style.transition = 'none'; d.style.opacity = '0';
    this.els.lowhp.style.opacity = '0';
    this.els.hitmarker.classList.remove('show');
    this.els.countdown.textContent = '';
    this.els.banner.classList.remove('show');
    this.clearBlood();
  }

  fadeToBlack() {
    const f = this.els.fade;
    if (!f) return;
    f.style.transition = 'opacity .55s'; f.style.opacity = '1';
  }
  fadeFromBlack() {
    const f = this.els.fade;
    if (!f) return;
    f.style.transition = 'none'; f.style.opacity = '1';
    requestAnimationFrame(() => { f.style.transition = 'opacity .45s'; f.style.opacity = '0'; });
  }

  screen(id) { for (const s of ['menu', 'settings', 'help', 'pause', 'death', 'loading']) this.els[s].classList.toggle('hidden', s !== id); }
  noScreen() { for (const s of ['menu', 'settings', 'help', 'pause', 'death', 'loading']) this.els[s].classList.add('hidden'); }

  _bind() {
    const click = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', e => { e.stopPropagation(); fn(); });
    };
    click('btn-play', () => this.onPlay && this.onPlay());
    click('btn-resume', () => this.onResume && this.onResume());
    click('btn-quit', () => this.onQuit && this.onQuit());
    click('btn-restart', () => this.onRestart && this.onRestart());
    click('btn-death-menu', () => this.onQuit && this.onQuit());
    click('btn-settings', () => this.screen('settings'));
    click('btn-pause-settings', () => this.screen('settings'));
    click('btn-settings-close', () => {
      if (this.onSettingsClose) this.onSettingsClose();
      else this.screen('menu');
    });
    click('btn-help', () => this.screen('help'));
    click('btn-help-close', () => this.screen('menu'));
    click('btn-fullscreen', () => {
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen();
      } catch (e) { }
    });
    document.querySelectorAll('.preset').forEach(b => b.addEventListener('click', () => {
      const p = PRESETS[+b.dataset.q];
      Object.assign(this.settings, p);
      save();
      this.applyFns.all();
      this._buildSettings();
    }));
    const self = this;
    function save() { import('./config.js').then(m => m.saveSettings(self.settings)); }
  }

  // ---- панель настроек ----
  _buildSettings() {
    const S = this.settings, rows = this.els['settings-rows'];
    rows.innerHTML = '';
    const addSlider = (label, key, min, max, step, fmt, onChange) => {
      const r = document.createElement('div'); r.className = 'set-row';
      const val = document.createElement('span'); val.className = 'val mono';
      const input = document.createElement('input');
      input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = S[key];
      const upd = () => { val.textContent = fmt(+input.value); };
      input.addEventListener('input', () => {
        S[key] = +input.value; upd(); saveSettings();
        onChange && onChange(+input.value);
      });
      upd();
      const lab = document.createElement('label'); lab.textContent = label;
      const ctrl = document.createElement('div'); ctrl.className = 'set-ctrl';
      ctrl.append(input, val);
      r.append(lab, ctrl); rows.append(r);
    };
    const addToggle = (label, key, onChange) => {
      const r = document.createElement('div'); r.className = 'set-row';
      const lab = document.createElement('label'); lab.textContent = label;
      const t = document.createElement('div'); t.className = 'toggle' + (S[key] ? ' on' : '');
      t.addEventListener('click', () => {
        S[key] = !S[key]; t.classList.toggle('on', S[key]); saveSettings();
        onChange && onChange(S[key]);
      });
      r.append(lab, t); rows.append(r);
    };
    const addSelect = (label, key, opts, onChange) => {
      const r = document.createElement('div'); r.className = 'set-row';
      const lab = document.createElement('label'); lab.textContent = label;
      const c = document.createElement('select');
      c.style.cssText = 'background:#150a08;color:#e8ddc8;border:1px solid #6b2015;padding:4px 8px;font-family:inherit;cursor:pointer;';
      for (const [v, name] of opts) {
        const o = document.createElement('option'); o.value = v; o.textContent = name;
        if (S[key] === v) o.selected = true; c.append(o);
      }
      c.addEventListener('change', () => { S[key] = +c.value; saveSettings(); onChange && onChange(+c.value); });
      r.append(lab, c); rows.append(r);
    };
    function saveSettings() { import('./config.js').then(m => m.saveSettings(S)); }

    addSelect('Разрешение рендера (PS1-пиксели)', 'pixelScale',
      [[0.2, '20% (макс. ретро)'], [0.25, '25%'], [0.35, '35%'], [0.5, '50%'], [0.75, '75%'], [1, '100%']],
      v => this.applyFns.pixelScale(v));
    addSelect('Детализация эффектов', 'particles',
      [[0, 'НИЗКО'], [1, 'СРЕДНЕ'], [2, 'ВЫСОКО']],
      v => this.applyFns.particles(v));
    addSlider('Яркость', 'brightness', 0.6, 1.6, 0.05, v => v.toFixed(2) + 'x', v => this.applyFns.brightness(v));
    addSlider('Поле зрения', 'fov', 70, 110, 1, v => v + '°', v => this.applyFns.fov(v));
    addSlider('Чувствительность мыши', 'sensitivity', 0.3, 2.5, 0.05, v => v.toFixed(2), v => this.applyFns.sensitivity(v));
    addToggle('Туман', 'fog', v => this.applyFns.fog(v));
    addToggle('Покачивание камеры', 'bob', v => this.applyFns.bob(v));
    addToggle('Тряска камеры', 'shake', v => this.applyFns.shake(v));
    addToggle('Счётчик FPS', 'showFps', v => this.applyFns.showFps(v));
    addSlider('Громкость музыки', 'musicVol', 0, 1, 0.05, v => Math.round(v * 100) + '%', v => this.applyFns.musicVol(v));
    addSlider('Громкость звуков', 'sfxVol', 0, 1, 0.05, v => Math.round(v * 100) + '%', v => this.applyFns.sfxVol(v));
  }

  // ---- в бою ----
  showGame(on) {
    this.els.hud.classList.toggle('hidden', !on);
    this.els.vignette.classList.toggle('hidden', !on);
    if (!on) this.clearBlood();
  }
  setHP(hp, max) {
    this.els['hp-bar-fill'].style.width = (100 * hp / max) + '%';
    this.els['hp-num'].textContent = Math.ceil(hp);
    this.els['lowhp'].style.opacity = hp < 35 ? (0.5 + 0.5 * Math.sin(performance.now() / 180)) * (1 - hp / 35) : 0;
  }
  setAmmo(n, size, reloading, isShotgun = false) {
    this.els['ammo-num'].textContent = n;
    this.els['ammo-mag'].textContent = '/ ' + (isShotgun ? '2' : '30');
    this.els['reload-note'].textContent = reloading ? 'ПЕРЕЗАРЯДКА…' : (n === 0 ? 'R — ПЕРЕЗАРЯДКА' : '');
  }
  setWeaponSlot(slotIndex) {
    if (this.els['slot-1']) this.els['slot-1'].classList.toggle('active', slotIndex === 0);
    if (this.els['slot-2']) this.els['slot-2'].classList.toggle('active', slotIndex === 1);
    if (this.els['weapon-name']) {
      this.els['weapon-name'].textContent = slotIndex === 0
        ? 'ШТУРМОВОЙ АВТОМАТ «СЕКТОР-9» · 6.8 ММ'
        : 'ДВУСТВОЛЬНЫЙ ОБРЕЗ «ПАЛАЧ» · 12 КАЛИБР';
    }
  }
  setFlashlight(isOn) {
    if (this.els['flashlight-status']) {
      this.els['flashlight-status'].innerHTML = `<kbd>T</kbd> ФОНАРЬ: ${isOn ? '<b style="color:#77ff88">ВКЛ</b>' : '<b style="color:#888">ВЫКЛ</b>'}`;
      this.els['flashlight-status'].classList.toggle('off', !isOn);
    }
  }
  setWave(n) { this.els['wave-label'].textContent = 'ВОЛНА ' + n; }
  setKills(n) { this.els['kills-label'].textContent = 'УБИТО: ' + n; }
  setScore(n) { this.els['score-label'].textContent = 'ОЧКИ: ' + n; }
  banner(main, sub = '') {
    const b = this.els.banner;
    this.els['banner-main'].textContent = main;
    this.els['banner-sub'].textContent = sub;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }
  countdown(sec, nextWave) {
    if (sec <= 0) { this.els.countdown.textContent = ''; return; }
    this.els.countdown.textContent = sec > 60 ? '' : 'ВОЛНА ' + nextWave + ' · ' + Math.ceil(sec);
  }
  hitmarker(kill) {
    const h = this.els.hitmarker;
    h.classList.toggle('kill', !!kill);
    h.classList.add('show');
    clearTimeout(this._hmT);
    this._hmT = setTimeout(() => h.classList.remove('show'), kill ? 160 : 70);
  }
  styleEvent(text) {
    this.els['style-event'].textContent = text;
    clearTimeout(this._eventT);
    this._eventT = setTimeout(() => this.els['style-event'].textContent = '', 900);
  }
  setStyle(pts) {
    let r = RANKS[0];
    for (const rk of RANKS) if (pts >= rk.min) r = rk;
    const next = RANKS[RANKS.indexOf(r) + 1];
    const frac = next ? clamp((pts - r.min) / (next.min - r.min), 0, 1) : 1;
    this.els['style-rank'].textContent = r.name;
    this.els['style-rank'].style.color = r.color;
    this.els['style-bar-fill'].style.color = r.color;
    this.els['style-bar-fill'].style.width = (frac * 100) + '%';
  }
  damageFlash() {
    const d = this.els['damage-flash'];
    d.style.transition = 'none'; d.style.opacity = '1';
    requestAnimationFrame(() => { d.style.transition = 'opacity .5s'; d.style.opacity = '0'; });
  }
  hint(text) { this.els.hint.textContent = text; }
  fallback(text) {
    const f = this.els['fallback-note'];
    if (!text) { f.classList.add('hidden'); return; }
    f.classList.remove('hidden'); f.textContent = text;
  }
  fps(v) { this.els.fps.textContent = v + ' FPS'; }
  showFps(on) { this.els.fps.classList.toggle('hidden', !on); }
  death(stats) {
    this.els['death-stats'].innerHTML =
      `ВОЛНА ДОСТИГНУТА: <b>${stats.wave}</b><br>УБИТО ВРАГОВ: <b>${stats.kills}</b><br>` +
      `ТОЧНОСТЬ: <b>${stats.acc}%</b> · ХЕДШОТОВ: <b>${stats.headshots}</b><br>ОЧКИ СТИЛЯ: <b>${stats.score}</b>`;
    this.screen('death');
  }
}
