import { PRESETS, clamp } from './config.js';
import { MAPS } from './arena.js';

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
    for (const id of [
      'hud', 'crosshair', 'hitmarker', 'hp-bar-fill', 'hp-num', 'ammo-num', 'ammo-mag',
      'weapon-name', 'slot-1', 'slot-2', 'flashlight-status',
      'reload-note', 'wave-label', 'kills-label', 'score-label', 'style-rank', 'style-bar-fill',
      'style-event', 'banner', 'banner-main', 'banner-sub', 'countdown', 'hint', 'fps',
      'damage-flash', 'lowhp', 'vignette', 'menu', 'settings', 'help', 'pause', 'death',
      'death-stats', 'loading', 'fallback-note', 'settings-rows', 'fade',
      'map-desc', 'map-arena', 'map-catacombs',
      'mode-desc', 'mode-waves', 'mode-sandbox',
      'sandbox-panel', 'sb-zombie', 'sb-minion', 'sb-rogue', 'sb-warrior', 'sb-mage', 'sb-ai-toggle', 'sb-clear'
    ]) {
      this.els[id] = $(id);
    }

    this.settings = settings;
    this.applyFns = applyFns;
    this._bannerT = null;
    this._hmT = null;
    this._eventT = null;

    this.selectedMap = 'arena'; // По умолчанию классическая арена
    this.gameMode = 'waves'; // 'waves' | 'sandbox'
    this.aiEnabledInSandbox = false; // По умолчанию в песочнице ИИ выключен для превью

    this._buildSettings();
    this._bind();
    this.selectMap('arena');
    this.selectMode('waves');
  }

  selectMap(mapId) {
    if (!MAPS[mapId]) return;
    this.selectedMap = mapId;

    document.querySelectorAll('.map-btn').forEach(btn => {
      btn.classList.toggle('active-tab', btn.dataset.map === mapId);
    });

    if (this.els['map-desc']) {
      this.els['map-desc'].textContent = MAPS[mapId].desc;
    }

    if (this.onMapSelect) {
      this.onMapSelect(mapId);
    }
  }

  selectMode(mode) {
    this.gameMode = mode;

    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active-tab', btn.dataset.mode === mode);
    });

    if (this.els['mode-desc']) {
      this.els['mode-desc'].textContent = mode === 'waves'
        ? 'Классическое выживание против нарастающих волн тварей.'
        : 'Свободный спавн любых тварей в центре арены с вкл/выкл ИИ для проверки анимаций и анатомии.';
    }

    if (this.onModeSelect) {
      this.onModeSelect(mode);
    }
  }

  setSandboxAIToggle(enabled) {
    this.aiEnabledInSandbox = enabled;
    const btn = this.els['sb-ai-toggle'];
    if (btn) {
      if (enabled) {
        btn.innerHTML = '<kbd>9</kbd> ИИ: ВКЛ (БОЕВОЙ)';
        btn.style.color = '#ff5544';
        btn.style.borderColor = '#991111';
      } else {
        btn.innerHTML = '<kbd>9</kbd> ИИ: ВЫКЛ (МАНЕКЕН)';
        btn.style.color = '#77ff88';
        btn.style.borderColor = '#387038';
      }
    }
  }

  // принудительная очистка вспышек/оверлеев
  forceClearOverlays() {
    const d = this.els['damage-flash'];
    if (d) {
      d.style.transition = 'none';
      d.style.opacity = '0';
    }
    if (this.els.lowhp) this.els.lowhp.style.opacity = '0';
    if (this.els.hitmarker) this.els.hitmarker.classList.remove('show');
    if (this.els.countdown) this.els.countdown.textContent = '';
    if (this.els.banner) this.els.banner.classList.remove('show');
  }

  fadeToBlack() {
    const f = this.els.fade;
    if (!f) return;
    f.style.transition = 'opacity .55s';
    f.style.opacity = '1';
  }

  fadeFromBlack() {
    const f = this.els.fade;
    if (!f) return;
    f.style.transition = 'none';
    f.style.opacity = '1';
    requestAnimationFrame(() => {
      f.style.transition = 'opacity .45s';
      f.style.opacity = '0';
    });
  }

  screen(id) {
    for (const s of ['menu', 'settings', 'help', 'pause', 'death', 'loading']) {
      if (this.els[s]) this.els[s].classList.toggle('hidden', s !== id);
    }
  }

  noScreen() {
    for (const s of ['menu', 'settings', 'help', 'pause', 'death', 'loading']) {
      if (this.els[s]) this.els[s].classList.add('hidden');
    }
  }

  _bind() {
    const click = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', e => { e.stopPropagation(); fn(); });
    };

    click('btn-play', () => this.onPlay && this.onPlay(this.selectedMap, this.gameMode));
    click('btn-resume', () => this.onResume && this.onResume());
    click('btn-quit', () => this.onQuit && this.onQuit());
    click('btn-restart', () => this.onRestart && this.onRestart(this.selectedMap, this.gameMode));
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

    // Селектор режима игры
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this.selectMode(btn.dataset.mode);
      });
    });

    // Селектор карт
    document.querySelectorAll('.map-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this.selectMap(btn.dataset.map);
      });
    });

    // Кнопки песочницы
    click('sb-zombie', () => this.onSpawn && this.onSpawn('zombie'));
    click('sb-minion', () => this.onSpawn && this.onSpawn('minion'));
    click('sb-rogue', () => this.onSpawn && this.onSpawn('rogue'));
    click('sb-warrior', () => this.onSpawn && this.onSpawn('warrior'));
    click('sb-mage', () => this.onSpawn && this.onSpawn('mage'));
    click('sb-ai-toggle', () => this.onToggleAI && this.onToggleAI());
    click('sb-clear', () => this.onClearEnemies && this.onClearEnemies());

    document.querySelectorAll('.preset').forEach(b => b.addEventListener('click', () => {
      const p = PRESETS[+b.dataset.q];
      Object.assign(this.settings, p);
      save();
      this.applyFns.all();
      this._buildSettings();
    }));

    const self = this;
    function save() {
      import('./config.js').then(m => m.saveSettings(self.settings));
    }
  }

  // ---- панель настроек ----
  _buildSettings() {
    const S = this.settings, rows = this.els['settings-rows'];
    if (!rows) return;
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
  showGame(on, mode = 'waves') {
    if (this.els.hud) this.els.hud.classList.toggle('hidden', !on);
    if (this.els.vignette) this.els.vignette.classList.toggle('hidden', !on);
    if (this.els['sandbox-panel']) {
      this.els['sandbox-panel'].classList.toggle('hidden', !on || mode !== 'sandbox');
    }
    if (mode === 'sandbox') {
      if (this.els['wave-label']) this.els['wave-label'].textContent = 'ПЕСОЧНИЦА';
      if (this.els['kills-label']) this.els['kills-label'].textContent = 'БЕСТИАРИЙ';
      if (this.els['score-label']) this.els['score-label'].textContent = 'ПРЕВЬЮ';
    }
  }

  setHP(hp, max) {
    if (this.els['hp-bar-fill']) this.els['hp-bar-fill'].style.width = (100 * hp / max) + '%';
    if (this.els['hp-num']) this.els['hp-num'].textContent = Math.ceil(hp);
    if (this.els['lowhp']) {
      this.els['lowhp'].style.opacity = hp < 35 ? (0.5 + 0.5 * Math.sin(performance.now() / 180)) * (1 - hp / 35) : 0;
    }
  }

  setAmmo(n, size, reloading, isShotgun = false) {
    if (this.els['ammo-num']) this.els['ammo-num'].textContent = n;
    if (this.els['ammo-mag']) this.els['ammo-mag'].textContent = '/ ' + (isShotgun ? '2' : '30');
    if (this.els['reload-note']) {
      this.els['reload-note'].textContent = reloading ? 'ПЕРЕЗАРЯДКА…' : (n === 0 ? 'R — ПЕРЕЗАРЯДКА' : '');
    }
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

  setWave(n) { if (this.els['wave-label']) this.els['wave-label'].textContent = 'ВОЛНА ' + n; }
  setKills(n) { if (this.els['kills-label']) this.els['kills-label'].textContent = 'УБИТО: ' + n; }
  setScore(n) { if (this.els['score-label']) this.els['score-label'].textContent = 'ОЧКИ: ' + n; }

  banner(main, sub = '') {
    const b = this.els.banner;
    if (!b) return;
    if (this.els['banner-main']) this.els['banner-main'].textContent = main;
    if (this.els['banner-sub']) this.els['banner-sub'].textContent = sub;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }

  countdown(sec, nextWave) {
    if (!this.els.countdown) return;
    if (sec <= 0) { this.els.countdown.textContent = ''; return; }
    this.els.countdown.textContent = sec > 60 ? '' : 'ВОЛНА ' + nextWave + ' · ' + Math.ceil(sec);
  }

  hitmarker(kill) {
    const h = this.els.hitmarker;
    if (!h) return;
    h.classList.toggle('kill', !!kill);
    h.classList.add('show');
    clearTimeout(this._hmT);
    this._hmT = setTimeout(() => h.classList.remove('show'), kill ? 160 : 70);
  }

  styleEvent(text) {
    if (!this.els['style-event']) return;
    this.els['style-event'].textContent = text;
    clearTimeout(this._eventT);
    this._eventT = setTimeout(() => {
      if (this.els['style-event']) this.els['style-event'].textContent = '';
    }, 900);
  }

  setStyle(pts) {
    let r = RANKS[0];
    for (const rk of RANKS) if (pts >= rk.min) r = rk;
    const next = RANKS[RANKS.indexOf(r) + 1];
    const frac = next ? clamp((pts - r.min) / (next.min - r.min), 0, 1) : 1;
    if (this.els['style-rank']) {
      this.els['style-rank'].textContent = r.name;
      this.els['style-rank'].style.color = r.color;
    }
    if (this.els['style-bar-fill']) {
      this.els['style-bar-fill'].style.color = r.color;
      this.els['style-bar-fill'].style.width = (frac * 100) + '%';
    }
  }

  damageFlash() {
    const d = this.els['damage-flash'];
    if (!d) return;
    d.style.transition = 'none';
    d.style.opacity = '1';
    requestAnimationFrame(() => {
      d.style.transition = 'opacity .4s';
      d.style.opacity = '0';
    });
  }

  hint(text) { if (this.els.hint) this.els.hint.textContent = text; }

  fallback(text) {
    const f = this.els['fallback-note'];
    if (!f) return;
    if (!text) { f.classList.add('hidden'); return; }
    f.classList.remove('hidden'); f.textContent = text;
  }

  fps(v) { if (this.els.fps) this.els.fps.textContent = v + ' FPS'; }
  showFps(on) { if (this.els.fps) this.els.fps.classList.toggle('hidden', !on); }

  death(stats) {
    if (this.els['death-stats']) {
      this.els['death-stats'].innerHTML =
        `ВОЛНА ДОСТИГНУТА: <b>${stats.wave}</b><br>УБИТО ВРАГОВ: <b>${stats.kills}</b><br>` +
        `ТОЧНОСТЬ: <b>${stats.acc}%</b> · ХЕДШОТОВ: <b>${stats.headshots}</b><br>ОЧКИ СТИЛЯ: <b>${stats.score}</b>`;
    }
    this.screen('death');
  }
}
