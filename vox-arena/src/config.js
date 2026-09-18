// Настройки графики/игры + сохранение (устойчиво к отсутствию localStorage)
export const DEFAULTS = {
  pixelScale: 0.35,   // внутреннее разрешение рендера (PS1-пиксели)
  fov: 95,
  brightness: 1.0,
  fog: true,
  particles: 1,       // 0 низкие, 1 средние, 2 высокие
  bob: true,
  shake: true,
  sensitivity: 1.0,
  showFps: false,
  musicVol: 0.55,
  sfxVol: 0.85,
};
export const PARTICLE_BUDGET = [0.5, 1, 1.8]; // множитель количества эффектов
export const PRESETS = [
  { pixelScale: 0.25, particles: 0, fog: true,  bob: false, shake: false },
  { pixelScale: 0.35, particles: 1, fog: true,  bob: true,  shake: true  },
  { pixelScale: 0.5,  particles: 2, fog: true,  bob: true,  shake: true  },
];
const KEY = 'voxslaughter_settings_v1';

export function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch (e) { return { ...DEFAULTS }; }
}
export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* приватный режим — ок */ }
}
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = arr => arr[(Math.random() * arr.length) | 0];
