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
    this._noise(0.16, { freq: 2200, q: 0.7, gain: 0.9, sweepTo: 300, type: 'lowpass' });
    this._noise(0.05, { freq: 5200, q: 1.2, gain: 0.5 });
    this._tone('square', 150, 55, 0.09, 0.5);
    this._tone('sawtooth', 700, 120, 0.05, 0.18);
    this._tone('square', 2400, 2000, 0.02, 0.05, 0.06); // щелчок гильзы
  }
  dry() { this._tone('square', 1800, 1400, 0.03, 0.12); }
  reload() {
    this._tone('square', 900, 500, 0.04, 0.14, 0);
    this._noise(0.06, { freq: 1400, gain: 0.25, at: 0.35 });
    this._tone('square', 700, 1100, 0.05, 0.18, 0.85);
    this._noise(0.05, { freq: 2200, gain: 0.3, at: 1.2 });
  }
  hit() { this._noise(0.09, { freq: 500, q: 1, gain: 0.5, type: 'lowpass' }); this._tone('sine', 220, 90, 0.08, 0.4); }
  headshot() { this._tone('square', 1500, 2400, 0.05, 0.2); this._noise(0.06, { freq: 900, gain: 0.3 }); }
  gib() {
    this._noise(0.34, { freq: 700, q: 0.8, gain: 0.9, sweepTo: 90, type: 'lowpass' });
    this._tone('sine', 160, 40, 0.25, 0.6);
    this._noise(0.12, { freq: 1600, gain: 0.35, at: 0.07 });
  }
  boneCrack() { this._noise(0.08, { freq: 2600, q: 3, gain: 0.4 }); this._tone('triangle', 400, 90, 0.07, 0.3); }
  hurt() { this._tone('sawtooth', 240, 80, 0.16, 0.4); this._noise(0.12, { freq: 400, gain: 0.35, type: 'lowpass' }); }
  pickup() { this._tone('sine', 620, 620, 0.07, 0.3); this._tone('sine', 930, 930, 0.12, 0.3, 0.07); }
  waveHorn() {
    this._tone('sawtooth', 98, 98, 0.9, 0.32); this._tone('sawtooth', 147, 147, 0.9, 0.22);
    this._tone('sawtooth', 196, 185, 0.9, 0.14);
    this._noise(0.8, { freq: 300, gain: 0.15, type: 'lowpass' });
  }
  waveClear() { [440, 554, 659].forEach((f, i) => this._tone('square', f, f, 0.14, 0.16, i * 0.09)); }
  growl(pitch = 90) { this._tone('sawtooth', pitch, pitch * 0.6, 0.3, 0.3); this._noise(0.25, { freq: 250, gain: 0.2, type: 'lowpass' }); }
  swing() { this._noise(0.12, { freq: 900, q: 2, gain: 0.3, sweepTo: 250 }); }
  explosion() {
    this._noise(0.5, { freq: 2800, gain: 1.0, sweepTo: 60, type: 'lowpass' });
    this._tone('sine', 130, 28, 0.5, 0.8);
    this._noise(0.25, { freq: 5000, gain: 0.4, at: 0.02 });
  }
  portal() { this._tone('sawtooth', 60, 440, 0.4, 0.18); this._noise(0.4, { freq: 800, gain: 0.2, sweepTo: 2400 }); }
  click() { this._tone('square', 1100, 900, 0.03, 0.1); }

  // ---- Музыка: 150 BPM, тёмный индастриал-луп ----
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true; this._step = 0; this._nextT = this._t() + 0.1;
    const bpm = 150, stepDur = 60 / bpm / 4;
    const bassPat = [41.2, 0, 41.2, 41.2, 0, 49.0, 0, 41.2, 41.2, 0, 30.9, 0, 36.7, 0, 41.2, 55.0];
    const mt = this.music; // маршрут в music-шину
    const sched = () => {
      if (!this.musicOn) return;
      while (this._nextT < this._t() + 0.15) {
        const s = this._step % 16, t = this._nextT, bar = (this._step / 16) | 0;
        // бочка
        if (s % 4 === 0) {
          const o = this.ctx.createOscillator(), g = this.ctx.createGain();
          o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.1);
          g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
          o.connect(g); g.connect(mt); o.start(t); o.stop(t + 0.2);
        }
        // снейр
        if (s === 4 || s === 12) {
          const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf;
          const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1400;
          const g = this.ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
          n.connect(f); f.connect(g); g.connect(mt); n.start(t); n.stop(t + 0.15);
        }
        // хэты
        if (s % 2 === 1) {
          const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf; n.playbackRate.value = 1.8;
          const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
          const g = this.ctx.createGain(); g.gain.setValueAtTime(s % 4 === 3 ? 0.16 : 0.09, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
          n.connect(f); f.connect(g); g.connect(mt); n.start(t); n.stop(t + 0.06);
        }
        // бас (пилящий, сDrive)
        const bf = bassPat[s];
        if (bf) {
          const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
          o.type = 'sawtooth'; o.frequency.value = bf * 2;
          f.type = 'lowpass'; f.frequency.setValueAtTime(520, t); f.frequency.exponentialRampToValueAtTime(120, t + 0.12); f.Q.value = 4;
          g.gain.setValueAtTime(0.34, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
          o.connect(f); f.connect(g); g.connect(mt); o.start(t); o.stop(t + 0.16);
        }
        // аккордовый стаб каждые 2 такта
        if (s === 0 && bar % 2 === 0) {
          [164.8, 196, 233.1].forEach(fr => {
            const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
            o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = (Math.random() - 0.5) * 14;
            f.type = 'lowpass'; f.frequency.value = 1100;
            g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.11, t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
            o.connect(f); f.connect(g); g.connect(mt); o.start(t); o.stop(t + 1.5);
          });
        }
        this._nextT += stepDur; this._step++;
      }
    };
    this._schedTimer = setInterval(sched, 40);
  }
  stopMusic() {
    this.musicOn = false;
    if (this._schedTimer) { clearInterval(this._schedTimer); this._schedTimer = null; }
  }
}
