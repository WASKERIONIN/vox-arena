// Синтезированный звук: SFX + мрачный техно-лупер на WebAudio (без файлов)
export class AudioSys {
  constructor() {
    this.ctx = null; this.master = null; this.sfx = null; this.music = null;
    this.musicOn = false; this._schedTimer = null; this._step = 0; this._nextT = 0;
    this.sfxVol = 0.85; this.musicVol = 0.55;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 8;
    this.master = this.ctx.createGain(); this.master.gain.value = 0.9;
    this.sfx = this.ctx.createGain(); this.sfx.gain.value = this.sfxVol;
    this.music = this.ctx.createGain(); this.music.gain.value = this.musicVol;
    this.sfx.connect(this.master); this.music.connect(this.master);
    this.master.connect(this.comp); this.comp.connect(this.ctx.destination);
    // общий буфер шума
    const len = this.ctx.sampleRate * 1.2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  setVolumes(sfxV, musV) {
    this.sfxVol = sfxV; this.musicVol = musV;
    if (this.sfx) this.sfx.gain.value = sfxV;
    if (this.music) this.music.gain.value = musV;
  }
  _t() { return this.ctx.currentTime; }
  _noise(dur, { freq = 1000, q = 1, type = 'bandpass', gain = 1, sweepTo = null, at = 0 } = {}) {
    if (!this.ctx) return;
    const t = this._t() + at;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfx);
    src.start(t); src.stop(t + dur + 0.05);
  }
  _tone(type, f0, f1, dur, gain, at = 0, dest = null) {
    if (!this.ctx) return;
    const t = this._t() + at;
    const o = this.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest || this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // ---- SFX ----
  shot() {
    // Выстрел 7.62мм автомата: мощный пороховой хлопок, глухой бас и лязг затвора
    this._noise(0.18, { freq: 1800, q: 0.8, gain: 1.0, sweepTo: 140, type: 'lowpass' });
    this._noise(0.04, { freq: 4800, q: 2.0, gain: 0.65 });
    this._tone('sine', 210, 42, 0.16, 0.75);
    this._tone('triangle', 480, 85, 0.08, 0.35);
    this._noise(0.06, { freq: 2800, q: 2.5, gain: 0.22, at: 0.04 }); // лязг затвора
  }

  shotgun() {
    // Сокрушительный громовой выстрел 12-го калибра: оглушительный взрыв пороха, треск дроби и глубокий суб-бас
    this._noise(0.38, { freq: 3600, q: 0.5, gain: 1.45, sweepTo: 50, type: 'lowpass' });
    this._noise(0.08, { freq: 7200, q: 1.2, gain: 0.95 });
    this._tone('sine', 160, 22, 0.42, 1.25);
    this._tone('sawtooth', 380, 32, 0.26, 0.7);
    this._noise(0.5, { freq: 320, gain: 0.6, sweepTo: 30, type: 'lowpass', at: 0.03 });
  }

  shotgunReload() {
    // Реалистичная тяжелая перезарядка переломного обреза:
    // 1) Отпирание рычага и перелом тяжелых стальных стволов (t = 0.0s)
    this._noise(0.06, { freq: 2600, q: 2.5, gain: 0.4, type: 'bandpass' });
    this._tone('triangle', 520, 240, 0.07, 0.35, 0);
    this._tone('sine', 180, 65, 0.12, 0.45, 0.03); // глухой ход шарнира
    this._noise(0.09, { freq: 950, q: 1.2, gain: 0.3, at: 0.05, sweepTo: 300 });

    // 2) Выброс стреляных латунных гильз пружинным экстрактором (t = 0.34s)
    this._noise(0.04, { freq: 4200, q: 3.0, gain: 0.55, at: 0.34 }); // щелчок пружины
    this._tone('sine', 1650, 1400, 0.05, 0.22, 0.34); // металлический дзинь гильзы 1
    this._tone('sine', 1920, 1600, 0.05, 0.18, 0.38); // металлический дзинь гильзы 2
    this._noise(0.06, { freq: 1800, q: 2.0, gain: 0.25, at: 0.42 });

    // 3) Вставка двух свежих патронов в патронники казённика (t = 0.75s, 0.98s)
    // Первый патрон: скольжение пластика по стали + глухой упор латунной закраины
    this._noise(0.07, { freq: 1600, q: 2.2, gain: 0.35, at: 0.76, type: 'bandpass' });
    this._tone('triangle', 340, 160, 0.06, 0.38, 0.78);
    this._tone('sine', 140, 50, 0.08, 0.45, 0.80);

    // Второй патрон: вход в соседний ствол с четкой посадкой
    this._noise(0.07, { freq: 1800, q: 2.2, gain: 0.35, at: 0.96, type: 'bandpass' });
    this._tone('triangle', 380, 180, 0.06, 0.4, 0.98);
    this._tone('sine', 150, 55, 0.08, 0.45, 1.00);

    // 4) Мощное, тяжелое захлопывание и блокировка стволов (t = 1.35s) — «ХЛОП-КЛАК!»
    this._noise(0.05, { freq: 4800, q: 1.8, gain: 0.7, at: 1.35 }); // щелчок стального замка
    this._tone('triangle', 640, 190, 0.1, 0.6, 1.35); // резонанс стали
    this._tone('sine', 160, 38, 0.2, 0.85, 1.35);     // глухой удар запирания
    this._noise(0.14, { freq: 650, q: 1.0, gain: 0.65, at: 1.36, sweepTo: 70, type: 'lowpass' });
  }

  weaponSwitch() {
    // Тяжелый лязг оружейного металла и антабок
    this._noise(0.06, { freq: 2400, q: 2.5, gain: 0.35, type: 'bandpass' });
    this._tone('triangle', 450, 180, 0.07, 0.3, 0);
    this._noise(0.08, { freq: 1200, q: 1.5, gain: 0.3, at: 0.06 });
    this._tone('sine', 220, 90, 0.09, 0.35, 0.08);
  }

  kick() {
    // Тяжелый свист выпада ноги + сокрушительный удар подошвой армейского ботинка
    this._noise(0.12, { freq: 900, gain: 0.45, sweepTo: 220, type: 'bandpass' });
    this._noise(0.24, { freq: 380, q: 1.5, gain: 1.0, sweepTo: 45, type: 'lowpass', at: 0.07 });
    this._tone('sine', 150, 30, 0.28, 0.9, 0.07);
    this._tone('triangle', 280, 70, 0.14, 0.5, 0.07);
  }

  dry() {
    // Сухой щелчок бойка по пустому патроннику
    this._noise(0.03, { freq: 3600, q: 3.0, gain: 0.45 });
    this._tone('triangle', 850, 320, 0.04, 0.3);
  }

  reload() {
    // Перезарядка штурмового автомата: выброс магазина + защёлкивание нового + затвор
    this._noise(0.05, { freq: 2200, q: 2.0, gain: 0.35, at: 0 }); // защелка
    this._tone('triangle', 480, 200, 0.06, 0.3, 0);
    this._noise(0.08, { freq: 1100, gain: 0.3, at: 0.32 }); // извлечение магазина
    // Вставка полного магазина (четкий щелчок фиксатора)
    this._noise(0.07, { freq: 2800, q: 2.5, gain: 0.45, at: 0.82 });
    this._tone('triangle', 560, 220, 0.08, 0.4, 0.82);
    this._tone('sine', 180, 60, 0.12, 0.5, 0.83);
    // Досылание патрона (спуск затвора из затворной задержки)
    this._noise(0.06, { freq: 4200, q: 2.0, gain: 0.55, at: 1.18 });
    this._tone('triangle', 720, 280, 0.08, 0.5, 1.18);
    this._tone('sine', 190, 70, 0.1, 0.5, 1.19);
  }
  hit() {
    // Влажный мясной шлепок пули о плоть
    this._noise(0.08, { freq: 1100, q: 1.4, gain: 0.55, type: 'bandpass' });
    this._tone('sine', 160, 45, 0.09, 0.45);
  }

  headshot() {
    // Хруст черепной коробки + мокрый разрыв мозговых тканей
    this._noise(0.12, { freq: 3200, q: 2.2, gain: 0.65, sweepTo: 220, type: 'bandpass' });
    this._tone('triangle', 380, 75, 0.12, 0.5);
    this._tone('sine', 180, 40, 0.16, 0.65);
  }

  gib() {
    // Сокрушительный взрыв плоти на ошмётки
    this._noise(0.36, { freq: 1100, q: 0.8, gain: 1.1, sweepTo: 70, type: 'lowpass' });
    this._tone('sine', 140, 30, 0.28, 0.75);
    this._noise(0.14, { freq: 2400, q: 2.0, gain: 0.5, at: 0.05 });
  }

  boneCrack() {
    // Сухой ломкий хруст кости
    this._noise(0.07, { freq: 3200, q: 3.5, gain: 0.5, type: 'bandpass' });
    this._tone('triangle', 520, 110, 0.06, 0.35);
  }

  woodHit() {
    // Звук попадания пули в дерево: сухой треск + глухой резонанс
    this._noise(0.07, { freq: 1900, q: 2.2, gain: 0.45, type: 'bandpass' });
    this._tone('triangle', 320, 110, 0.08, 0.35);
  }

  crateThud(speed = 1.0) {
    // Глухой тяжелый удар деревянного ящика о пол/стену
    const vol = Math.min(1.0, 0.45 * speed);
    this._noise(0.14, { freq: 380, q: 1.4, gain: 0.7 * vol, sweepTo: 70, type: 'lowpass' });
    this._tone('sine', 130, 38, 0.18, 0.6 * vol);
    this._tone('triangle', 240, 60, 0.06, 0.35 * vol);
  }

  woodSnap() {
    // Сокрушительный раскол ящика в щепки
    this._noise(0.25, { freq: 2400, q: 1.2, gain: 0.85, sweepTo: 140, type: 'lowpass' });
    this._tone('sawtooth', 360, 60, 0.22, 0.5);
    this._noise(0.12, { freq: 3800, gain: 0.45, at: 0.02 });
  }

  crateSlide() {
    // Шуршание трения ящика о пол
    this._noise(0.12, { freq: 550, q: 1.8, gain: 0.25, type: 'bandpass' });
  }

  limbSever() {
    // сочный мокрый отрыв плоти + хруст кости + глухой удар
    this._noise(0.28, { freq: 1200, q: 0.8, gain: 0.9, sweepTo: 120, type: 'lowpass' });
    this._tone('sawtooth', 280, 50, 0.2, 0.5);
    this._noise(0.14, { freq: 2800, q: 2.2, gain: 0.45, at: 0.02, sweepTo: 400 });
    this._tone('sine', 95, 30, 0.35, 0.65, 0.05);
  }

  thud() {
    // глухой удар тела об пол при падении
    this._noise(0.18, { freq: 350, q: 1.2, gain: 0.75, sweepTo: 60, type: 'lowpass' });
    this._tone('sine', 110, 32, 0.22, 0.7);
  }

  corpseBoil() {
    // бурление / бульканье трупа перед взрывом
    this._noise(0.15, { freq: 1800, q: 4.5, gain: 0.35, sweepTo: 600, type: 'bandpass' });
    this._tone('sine', 380, 180, 0.08, 0.22);
  }

  monsterGetup() {
    // злобный сиплый рык при подъёме на ноги
    this._tone('sawtooth', 75, 140, 0.45, 0.35);
    this._noise(0.4, { freq: 450, gain: 0.28, sweepTo: 180, type: 'lowpass' });
  }

  hurt() {
    this._tone('sawtooth', 240, 80, 0.16, 0.4);
    this._noise(0.12, { freq: 400, gain: 0.35, type: 'lowpass' });
  }

  pickup() {
    // Мрачный щелчок аптечки / впрыск стимулятора
    this._noise(0.06, { freq: 2200, q: 2.5, gain: 0.3 });
    this._tone('triangle', 320, 580, 0.1, 0.25);
  }

  waveHorn() {
    this._tone('sawtooth', 98, 98, 0.9, 0.32);
    this._tone('sawtooth', 147, 147, 0.9, 0.22);
    this._tone('sawtooth', 196, 185, 0.9, 0.14);
    this._noise(0.8, { freq: 300, gain: 0.15, type: 'lowpass' });
  }

  waveClear() {
    // Зловещий затихающий резонанс вместо аркадных колокольчиков
    this._tone('triangle', 180, 90, 0.5, 0.25);
    this._noise(0.4, { freq: 450, gain: 0.2, type: 'lowpass' });
  }
  growl(pitch = 90) { this._tone('sawtooth', pitch, pitch * 0.6, 0.3, 0.3); this._noise(0.25, { freq: 250, gain: 0.2, type: 'lowpass' }); }
  swing() { this._noise(0.12, { freq: 900, q: 2, gain: 0.3, sweepTo: 250 }); }
  explosion() {
    this._noise(0.5, { freq: 2800, gain: 1.0, sweepTo: 60, type: 'lowpass' });
    this._tone('sine', 130, 28, 0.5, 0.8);
    this._noise(0.25, { freq: 5000, gain: 0.4, at: 0.02 });
  }
  portal() { this._tone('sawtooth', 60, 440, 0.4, 0.18); this._noise(0.4, { freq: 800, gain: 0.2, sweepTo: 2400 }); }
  click() { this._tone('square', 1100, 900, 0.03, 0.1); }

  // ==========================================================================
  // НАУЧНО-ФАНТАСТИЧЕСКИЕ ЗВУКИ: КОРАБЛЬ «ЭРЕБ-7»
  // ==========================================================================

  cryoHiss() {
    // Стравливание криогенного газа под давлением + тяжелый щелчок пневмозамка
    this._noise(1.4, { freq: 3200, q: 1.2, gain: 0.75, sweepTo: 450, type: 'bandpass' });
    this._noise(0.6, { freq: 6500, q: 0.8, gain: 0.5, sweepTo: 1200, type: 'highpass' });
    this._tone('triangle', 340, 90, 0.22, 0.5, 0.05); // отпирание замка
    this._tone('sine', 120, 40, 0.35, 0.7, 0.08);     // сдвиг колпака
  }

  doorHydraulic() {
    // Тяжелый ход гидравлических поршней и скольжение стальной бронедвери
    this._noise(0.85, { freq: 850, q: 1.5, gain: 0.5, sweepTo: 220, type: 'bandpass' });
    this._tone('triangle', 140, 110, 0.75, 0.35);
    this._tone('sine', 85, 45, 0.9, 0.55);
    this._noise(0.12, { freq: 2400, q: 2.0, gain: 0.45, at: 0.78 }); // щелчок доводчика
  }

  doorLocked() {
    // Двойной отказ электронного замка (Error Beep)
    this._tone('square', 220, 220, 0.09, 0.25, 0);
    this._tone('square', 180, 180, 0.12, 0.25, 0.12);
  }

  terminalBeep() {
    // Чириканье клавиатуры и загрузка данных ЭЛТ-консоли
    this._tone('sine', 1400, 1800, 0.04, 0.22, 0);
    this._tone('sine', 1800, 2200, 0.04, 0.22, 0.06);
    this._tone('sine', 1600, 1950, 0.05, 0.25, 0.12);
    this._noise(0.08, { freq: 4200, gain: 0.15, at: 0.02 });
  }

  keycardBeep() {
    // Подтверждение доступа ключ-карты (High Access Granted)
    this._tone('triangle', 660, 660, 0.08, 0.35, 0);
    this._tone('triangle', 880, 880, 0.08, 0.35, 0.09);
    this._tone('sine', 1320, 1320, 0.14, 0.4, 0.18);
  }

  steamHiss() {
    // Короткий выброс перегретого пара из пробитой трубы
    this._noise(0.45, { freq: 4200, q: 1.5, gain: 0.6, sweepTo: 1800, type: 'bandpass' });
    this._noise(0.2, { freq: 7000, q: 0.9, gain: 0.4, type: 'highpass' });
  }

  heartbeat() {
    // Глухой, низкий удар сердца при пробуждении
    this._thud(this._t(), 0.75, 62);
    this._thud(this._t() + 0.26, 0.45, 52);
  }

  alarmKlaxon() {
    // Воющий тон аварийной тревоги корабля
    this._tone('sawtooth', 440, 220, 0.6, 0.25);
    this._noise(0.5, { freq: 650, gain: 0.2, sweepTo: 180, type: 'lowpass' });
  }

  // ---- Музыка: мрачный хоррор-эмбиент (дроны + сердцебиение + свеллы) ----
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    const C = this.ctx, mt = this.music, t0 = this._t();
    const drones = [];
    const mk = (type, freq, detune, gain, lp) => {
      const o = C.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
      const g = C.createGain(); g.gain.value = 0.0001;
      let head = o;
      if (lp) { const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; head.connect(f); head = f; }
      head.connect(g); g.connect(mt); o.start();
      g.gain.linearRampToValueAtTime(gain, t0 + 3);
      drones.push({ o, g });
      return { o, g };
    };
    // расстроённая пара E1/F1 — медленный «пульс» бит (~2.4 Гц), низкий суб и обертона
    const dE1 = mk('sine', 41.2, 0, 0.16);
    const dF1 = mk('sine', 43.65, 4, 0.14);
    mk('triangle', 82.4, -7, 0.045, 420);
    mk('sine', 20.6, 0, 0.11);
    // медленное «дыхание» на паре низких
    const lfo = C.createOscillator(); lfo.frequency.value = 0.09;
    const lfoG = C.createGain(); lfoG.gain.value = 0.05;
    lfo.connect(lfoG); lfoG.connect(dE1.g.gain); lfoG.connect(dF1.g.gain);
    lfo.start(); drones.push({ o: lfo, g: lfoG });
    // «ветер»: зацикленный шум через медленно дрейфующий lowpass
    const wind = C.createBufferSource(); wind.buffer = this.noiseBuf; wind.loop = true; wind.playbackRate.value = 0.35;
    const wf = C.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 240; wf.Q.value = 0.6;
    const wg = C.createGain(); wg.gain.value = 0.0001;
    wind.connect(wf); wf.connect(wg); wg.connect(mt); wind.start();
    wg.gain.linearRampToValueAtTime(0.05, t0 + 4);
    const wlfo = C.createOscillator(); wlfo.frequency.value = 0.05;
    const wlfoG = C.createGain(); wlfoG.gain.value = 130;
    wlfo.connect(wlfoG); wlfoG.connect(wf.frequency); wlfo.start();
    drones.push({ o: wind, g: wg }, { o: wlfo, g: wlfoG });
    this._drones = drones;
    // планировщик событий: сердцебиение, свеллы, диссонансные удары
    this._hbT = t0 + 1.2;
    this._swellT = t0 + 5;
    this._gongT = t0 + 13;
    const sched = () => {
      if (!this.musicOn) return;
      const now = this._t();
      while (this._hbT < now + 0.2) {
        this._thud(this._hbT, 0.45, 55);
        this._thud(this._hbT + 0.3, 0.26, 48);
        this._hbT += 1.05;
      }
      if (this._swellT < now + 0.2) { this._swell(this._swellT); this._swellT = now + 7 + Math.random() * 8; }
      if (this._gongT < now + 0.2) { this._gong(this._gongT); this._gongT = now + 11 + Math.random() * 14; }
    };
    this._schedTimer = setInterval(sched, 60);
  }
  _thud(t, gain, f0) {
    const C = this.ctx;
    const o = C.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.16);
    const g = C.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(this.music); o.start(t); o.stop(t + 0.3);
  }
  _swell(t) {
    const C = this.ctx;
    const n = C.createBufferSource(); n.buffer = this.noiseBuf; n.playbackRate.value = 0.5;
    const f = C.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(180, t);
    f.frequency.linearRampToValueAtTime(700, t + 2);
    f.frequency.linearRampToValueAtTime(140, t + 4.5);
    const g = C.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 1.8);
    g.gain.linearRampToValueAtTime(0.0001, t + 4.6);
    n.connect(f); f.connect(g); g.connect(this.music);
    n.start(t); n.stop(t + 5);
  }
  _gong(t) {
    const C = this.ctx;
    // диссонансная минимая секунда (E3/Bb3) + низкий бой, долгий спад
    [233.08, 246.94].forEach(fr => {
      const o = C.createOscillator(); o.type = 'triangle'; o.frequency.value = fr;
      o.detune.value = (Math.random() - 0.5) * 10;
      const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      const g = C.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.045, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.8);
      o.connect(f); f.connect(g); g.connect(this.music);
      o.start(t); o.stop(t + 4);
    });
    const b = C.createOscillator(); b.type = 'sine';
    b.frequency.setValueAtTime(70, t); b.frequency.exponentialRampToValueAtTime(32, t + 1.4);
    const bg = C.createGain();
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.linearRampToValueAtTime(0.11, t + 0.05);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    b.connect(bg); bg.connect(this.music); b.start(t); b.stop(t + 2.4);
  }
  stopMusic() {
    this.musicOn = false;
    if (this._schedTimer) { clearInterval(this._schedTimer); this._schedTimer = null; }
    if (this._drones) {
      const t = this._t();
      const list = this._drones; this._drones = null;
      for (const r of list) {
        try {
          if (r.g) {
            r.g.gain.cancelScheduledValues(t);
            r.g.gain.setValueAtTime(Math.max(0.0001, r.g.gain.value), t);
            r.g.gain.linearRampToValueAtTime(0.0001, t + 0.5);
          }
          setTimeout(() => { try { r.o.stop(); } catch (e) { } try { r.o.disconnect(); } catch (e) { } }, 700);
        } catch (e) { }
      }
    }
  }
}
