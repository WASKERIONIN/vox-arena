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
      'reload-note', 'wave-label', 'kills-label', 'score-label', 'style-rank', 'style-bar-fill',
      'style-event', 'banner', 'banner-main', 'banner-sub', 'countdown', 'hint', 'fps',
      'damage-flash', 'lowhp', 'vignette', 'menu', 'settings', 'help', 'pause', 'death',
      'death-stats', 'loading', 'fallback-note', 'settings-rows', 'fade']) this.els[id] = $(id);
    this.settings = settings;
    this.applyFns = applyFns;
    this._bannerT = null; this._hmT = null; this._eventT = null;
    this._buildSettings();
    this._bind();
  }

  // принудительная очистка вспышек/оверлеев (защита от «пелены»)
  forceClearOverlays() {
    const d = this.els['damage-flash'];
    d.style.transition = 'none'; d.style.opacity = '0';
    this.els.lowhp.style.opacity = '0';
    this.els.hitmarker.classList.remove('show');
    this.els.countdown.textContent = '';
    this.els.banner.classList.remove('show');
  }
  // чёрный фейд: при смерти накрываем экран, при старте убираем
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
  }
  setHP(hp, max) {
    this.els['hp-bar-fill'].style.width = (100 * hp / max) + '%';
    this.els['hp-num'].textContent = Math.ceil(hp);
    this.els['lowhp'].style.opacity = hp < 35 ? (0.5 + 0.5 * Math.sin(performance.now() / 180)) * (1 - hp / 35) : 0;
  }
  setAmmo(n, size, reloading) {
    this.els['ammo-num'].textContent = n;
    this.els['ammo-mag'].textContent = '/ ∞';
    this.els['reload-note'].textContent = reloading ? 'ПЕРЕЗАРЯДКА…' : (n === 0 ? 'R — ПЕРЕЗАРЯДКА' : '');
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
