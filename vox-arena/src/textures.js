import * as THREE from 'three';
import { rand } from './config.js';

// Процедурные PS1-текстуры (canvas), фильтрация nearest
function makeTex(size, draw, { repeat, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function noise(g, size, n, alpha, light = false) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * size, y = Math.random() * size, s = 1 + Math.random() * 2;
    g.fillStyle = light
      ? `rgba(255,255,255,${Math.random() * alpha})`
      : `rgba(0,0,0,${Math.random() * alpha})`;
    g.fillRect(x, y, s, s);
  }
}

export function makeTextures() {
  const T = {};

  T.floor = makeTex(256, (g, s) => {
    g.fillStyle = '#2a2c33'; g.fillRect(0, 0, s, s);
    const tile = 64;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const px = x * tile, py = y * tile;
      const v = 38 + Math.random() * 18;
      g.fillStyle = `rgb(${v},${v + 3},${v + 8})`; g.fillRect(px + 1, py + 1, tile - 2, tile - 2);
      g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(px + 1, py + 1, tile - 2, 2);
      g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(px, py + tile - 2, tile, 2);
      g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(px + tile - 2, py, 2, tile);
      // болты по углам
      g.fillStyle = '#0c0d10';
      g.fillRect(px + 5, py + 5, 3, 3); g.fillRect(px + tile - 8, py + 5, 3, 3);
      g.fillRect(px + 5, py + tile - 8, 3, 3); g.fillRect(px + tile - 8, py + tile - 8, 3, 3);
    }
    // красные метки и подтёки
    g.fillStyle = 'rgba(150,20,12,.5)';
    g.fillRect(64, 30, 40, 4); g.fillRect(190, 120, 4, 50);
    for (let i = 0; i < 5; i++) {
      g.fillStyle = `rgba(${90 + Math.random() * 60},10,8,${0.12 + Math.random() * 0.2})`;
      const x = Math.random() * s, y = Math.random() * s, r = 6 + Math.random() * 22;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    noise(g, s, 900, 0.16); noise(g, s, 250, 0.05, true);
  }, { repeat: [16, 16] });

  T.wall = makeTex(256, (g, s) => {
    g.fillStyle = '#232025'; g.fillRect(0, 0, s, s);
    const panelW = 64;
    for (let x = 0; x < 4; x++) {
      const px = x * panelW;
      const v = 30 + Math.random() * 10;
      g.fillStyle = `rgb(${v},${v - 3},${v - 2})`; g.fillRect(px + 2, 8, panelW - 4, s - 16);
      g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(px + 2, 8, panelW - 4, 3);
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(px, 0, 2, s);
      // заклёпки
      g.fillStyle = '#101014';
      for (let y = 18; y < s - 12; y += 44) { g.fillRect(px + 8, y, 4, 4); g.fillRect(px + panelW - 12, y, 4, 4); }
      // ржавые потёки
      for (let i = 0; i < 3; i++) {
        g.fillStyle = `rgba(${70 + Math.random() * 40},${30 + Math.random() * 15},12,${0.1 + Math.random() * 0.15})`;
        const rx = px + 10 + Math.random() * (panelW - 20);
        g.fillRect(rx, 10 + Math.random() * 40, 3 + Math.random() * 5, 60 + Math.random() * 120);
      }
    }
    g.fillStyle = 'rgba(140,20,10,.35)'; g.fillRect(30, 200, 60, 3);
    noise(g, s, 700, 0.14); noise(g, s, 200, 0.04, true);
  }, { repeat: [8, 1] });

  T.hazard = makeTex(128, (g, s) => {
    g.fillStyle = '#141210'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#d8a418';
    g.save(); g.translate(s / 2, s / 2); g.rotate(Math.PI / 4); g.translate(-s, -s);
    for (let x = -s; x < s * 2; x += 32) g.fillRect(x, -s, 16, s * 3);
    g.restore();
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, s, 6); g.fillRect(0, s - 6, s, 6);
    noise(g, s, 400, 0.3);
  }, { repeat: [12, 1] });

  T.crate = makeTex(128, (g, s) => {
    g.fillStyle = '#2a2722'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#343026'; g.fillRect(6, 6, s - 12, s - 12);
    g.strokeStyle = '#191713'; g.lineWidth = 6; g.strokeRect(8, 8, s - 16, s - 16);
    g.fillStyle = '#191713';
    g.fillRect(s / 2 - 3, 12, 6, s - 24); g.fillRect(12, s / 2 - 3, s - 24, 6);
    g.fillStyle = '#101010';
    [[14, 14], [s - 20, 14], [14, s - 20], [s - 20, s - 20]].forEach(p => g.fillRect(p[0], p[1], 6, 6));
    g.fillStyle = 'rgba(216,164,24,.85)'; g.font = 'bold 26px monospace';
    g.fillText('07', 22, 40);
    g.fillStyle = 'rgba(150,20,12,.5)'; g.fillRect(70, 90, 40, 5);
    noise(g, s, 350, 0.2);
  });

  T.platform = makeTex(128, (g, s) => {
    g.fillStyle = '#1e2126'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#262a31'; g.fillRect(4, 4, s - 8, s - 8);
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(4, 4, s - 8, 4);
    g.fillStyle = '#101216';
    for (let i = 0; i < 4; i++) g.fillRect(10 + i * 30, 10, 5, 5), g.fillRect(10 + i * 30, s - 15, 5, 5);
    g.fillStyle = 'rgba(255,36,24,.55)'; g.font = 'bold 20px monospace'; g.fillText('A-1', 44, 70);
    noise(g, s, 300, 0.15);
  });

  T.sky = makeTex(512, (g, s) => {
    const grd = g.createLinearGradient(0, 0, 0, s);
    grd.addColorStop(0, '#0d0409'); grd.addColorStop(0.55, '#26070f');
    grd.addColorStop(0.8, '#571016'); grd.addColorStop(1, '#7a1a12');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    // кровавое солнце
    const sx = s * 0.68, sy = s * 0.78;
    for (let r = 90; r > 10; r -= 4) {
      g.fillStyle = `rgba(255,${60 - (90 - r) * 0.3},20,${0.05 + (90 - r) * 0.004})`;
      g.beginPath(); g.arc(sx, sy, r, 0, 7); g.fill();
    }
    g.fillStyle = '#ff5636'; g.beginPath(); g.arc(sx, sy, 34, 0, 7); g.fill();
    g.fillStyle = '#ffd0a0'; g.beginPath(); g.arc(sx, sy, 24, 0, 7); g.fill();
    // дымка-полосы
    for (let i = 0; i < 24; i++) {
      g.fillStyle = `rgba(20,4,8,${0.06 + Math.random() * 0.1})`;
      g.fillRect(0, s * 0.6 + Math.random() * s * 0.4, s, 2 + Math.random() * 8);
    }
    noise(g, s, 500, 0.1, true);
  });

  T.splat = makeTex(128, (g, s) => {
    g.clearRect(0, 0, s, s);
    const blob = (x, y, r, a) => { g.fillStyle = `rgba(255,255,255,${a})`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
    blob(s / 2, s / 2, 26, 0.95);
    for (let i = 0; i < 26; i++) {
      const ang = Math.random() * Math.PI * 2, d = 10 + Math.random() * 44;
      blob(s / 2 + Math.cos(ang) * d, s / 2 + Math.sin(ang) * d, 2 + Math.random() * 9, 0.5 + Math.random() * 0.5);
    }
  });

  T.hole = makeTex(64, (g, s) => {
    g.clearRect(0, 0, s, s);
    const grd = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, 26);
    grd.addColorStop(0, 'rgba(8,8,10,.95)'); grd.addColorStop(0.45, 'rgba(30,30,34,.8)');
    grd.addColorStop(0.8, 'rgba(60,60,66,.25)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(s / 2, s / 2, 28, 0, 7); g.fill();
    g.strokeStyle = 'rgba(90,90,96,.5)'; g.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      g.beginPath(); g.moveTo(s / 2, s / 2);
      g.lineTo(s / 2 + Math.cos(a) * (10 + Math.random() * 12), s / 2 + Math.sin(a) * (10 + Math.random() * 12));
      g.stroke();
    }
  });

  T.smoke = makeTex(64, (g, s) => {
    g.clearRect(0, 0, s, s);
    const grd = g.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, 30);
    grd.addColorStop(0, 'rgba(255,255,255,.9)'); grd.addColorStop(0.6, 'rgba(255,255,255,.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(s / 2, s / 2, 30, 0, 7); g.fill();
  });

  T.flash = makeTex(64, (g, s) => {
    g.clearRect(0, 0, s, s);
    g.translate(s / 2, s / 2);
    g.fillStyle = 'rgba(255,240,180,.95)';
    for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 4); g.fillRect(-28, -3, 56, 6); }
    const grd = g.createRadialGradient(0, 0, 2, 0, 0, 22);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.5, 'rgba(255,190,80,.9)');
    grd.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(0, 0, 22, 0, 7); g.fill();
  });

  T.glow = makeTex(64, (g, s) => {
    g.clearRect(0, 0, s, s);
    const grd = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, 30);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,.5)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(s / 2, s / 2, 30, 0, 7); g.fill();
  });

  T.shadow = makeTex(64, (g, s) => {
    g.clearRect(0, 0, s, s);
    const grd = g.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, 28);
    grd.addColorStop(0, 'rgba(0,0,0,.85)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(s / 2, s / 2, 28, 0, 7); g.fill();
  });

  // --- боди-хоррор: мясо ---
  T.flesh = makeTex(128, (g, s) => {
    g.fillStyle = '#3d1410'; g.fillRect(0, 0, s, s);
    const fibers = ['#4f1a12', '#5c2015', '#6b2818', '#7a3320', '#300d0a', '#8a3a24'];
    for (let i = 0; i < 260; i++) {
      g.strokeStyle = fibers[(Math.random() * fibers.length) | 0];
      g.globalAlpha = 0.25 + Math.random() * 0.5;
      g.lineWidth = 1 + Math.random() * 2;
      const x = Math.random() * s, y = Math.random() * s;
      const len = 8 + Math.random() * 34, a = Math.random() * 0.7 - 0.35;
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.sin(a) * len * 0.5 + (Math.random() * 8 - 4), y - len * 0.6, x + Math.sin(a) * len, y - len);
      g.stroke();
    }
    // вены
    g.globalAlpha = 1;
    for (let i = 0; i < 14; i++) {
      g.strokeStyle = Math.random() < 0.5 ? '#200605' : '#5a1410';
      g.lineWidth = 1;
      let x = Math.random() * s, y = Math.random() * s;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += Math.random() * 26 - 13; y += 8 + Math.random() * 18; g.lineTo(x, y); }
      g.stroke();
    }
    // гниль и мокрый блеск
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(${10 + Math.random() * 20},${4},${4},${0.15 + Math.random() * 0.25})`;
      const x = Math.random() * s, y = Math.random() * s, r = 2 + Math.random() * 10;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    noise(g, s, 500, 0.22); noise(g, s, 120, 0.05, true);
  }, { repeat: [2, 2] });

  // --- мембрана плода (летающий паразит) ---
  T.membrane = makeTex(128, (g, s) => {
    g.fillStyle = '#241018'; g.fillRect(0, 0, s, s);
    const cols = ['#331524', '#401b2e', '#2a0f1b', '#4e2138', '#1c0a12'];
    for (let i = 0; i < 200; i++) {
      g.fillStyle = cols[(Math.random() * cols.length) | 0];
      g.globalAlpha = 0.2 + Math.random() * 0.4;
      const x = Math.random() * s, y = Math.random() * s, r = 3 + Math.random() * 16;
      g.beginPath(); g.ellipse(x, y, r, r * (0.4 + Math.random() * 0.8), Math.random() * 3, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    // просвечивающие органы
    for (let i = 0; i < 7; i++) {
      const x = 16 + Math.random() * (s - 32), y = 16 + Math.random() * (s - 32);
      const grd = g.createRadialGradient(x, y, 1, x, y, 14);
      grd.addColorStop(0, 'rgba(150,40,90,.5)'); grd.addColorStop(1, 'rgba(60,15,40,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, 14, 0, 7); g.fill();
    }
    // складки
    g.strokeStyle = 'rgba(10,4,8,.8)';
    for (let i = 0; i < 10; i++) {
      g.lineWidth = 1 + Math.random();
      let x = Math.random() * s, y = 0;
      g.beginPath(); g.moveTo(x, y);
      while (y < s) { y += 6 + Math.random() * 10; x += Math.random() * 16 - 8; g.lineTo(x, y); }
      g.stroke();
    }
    noise(g, s, 380, 0.2);
  }, { repeat: [2, 2] });

  // ==========================================================================
  // НАУЧНО-ФАНТАСТИЧЕСКИЕ ТЕКСТУРЫ КОСМИЧЕСКОГО КОРАБЛЯ «ЭРЕБ-7»
  // ==========================================================================

  // 1. Обшивка и титановые переборки звездолёта (Hull Plating)
  T.hull = makeTex(256, (g, s) => {
    g.fillStyle = '#1e2127'; g.fillRect(0, 0, s, s);
    const panelW = 64;
    for (let x = 0; x < 4; x++) {
      const px = x * panelW;
      const v = 32 + Math.random() * 12;
      g.fillStyle = `rgb(${v},${v + 4},${v + 8})`;
      g.fillRect(px + 2, 4, panelW - 4, s - 8);
      g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(px + 2, 4, panelW - 4, 3);
      g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(px, 0, 2, s);

      // Внутренние технологические вырезы и сервисные слоты
      g.fillStyle = '#121418';
      g.fillRect(px + 12, 32, panelW - 24, 80);
      g.strokeStyle = '#2d333d'; g.lineWidth = 2;
      g.strokeRect(px + 12, 32, panelW - 24, 80);

      // Крепёжные винты и заклёпки
      g.fillStyle = '#0b0d10';
      for (let y = 14; y < s - 10; y += 36) {
        g.fillRect(px + 6, y, 4, 4);
        g.fillRect(px + panelW - 10, y, 4, 4);
      }
    }
    // Предупреждающие жёлто-чёрные полосы на нижней кромке
    for (let x = 0; x < s; x += 32) {
      g.fillStyle = '#d8a418'; g.fillRect(x, s - 12, 16, 12);
      g.fillStyle = '#151515'; g.fillRect(x + 16, s - 12, 16, 12);
    }
    noise(g, s, 600, 0.14); noise(g, s, 150, 0.04, true);
  }, { repeat: [4, 1] });

  // 2. Решётчатый металлический настил пола (Floor Grate)
  T.grate = makeTex(128, (g, s) => {
    g.fillStyle = '#0e1014'; g.fillRect(0, 0, s, s);
    const step = 16;
    for (let y = 0; y < s; y += step) {
      for (let x = 0; x < s; x += step) {
        g.fillStyle = '#22262e';
        g.fillRect(x + 2, y + 2, step - 4, step - 4);
        g.fillStyle = '#07080a'; // глубина под решёткой
        g.fillRect(x + 5, y + 5, step - 10, step - 10);
      }
    }
    // Рамка по периметру
    g.strokeStyle = '#383e4a'; g.lineWidth = 4;
    g.strokeRect(2, 2, s - 4, s - 4);
    noise(g, s, 400, 0.18);
  }, { repeat: [8, 8] });

  // 3. Бронированная гермодверь / шлюзовые створки (Bulkhead Door)
  T.bulkhead = makeTex(256, (g, s) => {
    g.fillStyle = '#22262d'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#2d333d'; g.fillRect(8, 8, s - 16, s - 16);

    // Усиленные ребра жесткости крест-накрест
    g.strokeStyle = '#14171c'; g.lineWidth = 14;
    g.strokeRect(16, 16, s - 32, s - 32);
    g.beginPath(); g.moveTo(24, 24); g.lineTo(s - 24, s - 24); g.stroke();
    g.beginPath(); g.moveTo(s - 24, 24); g.lineTo(24, s - 24); g.stroke();

    // Центральный гидравлический замок
    g.fillStyle = '#15181f'; g.fillRect(s / 2 - 28, s / 2 - 28, 56, 56);
    g.strokeStyle = '#4a5363'; g.lineWidth = 4; g.strokeRect(s / 2 - 28, s / 2 - 28, 56, 56);

    // Индикатор замка (зеленый / красный)
    g.fillStyle = '#00ff66'; g.beginPath(); g.arc(s / 2, s / 2, 8, 0, 7); g.fill();
    g.fillStyle = 'rgba(0,255,100,0.4)'; g.beginPath(); g.arc(s / 2, s / 2, 16, 0, 7); g.fill();

    // Маркировка отсека
    g.fillStyle = '#d8a418'; g.font = 'bold 20px monospace';
    g.fillText('SEC-01', 32, 50);

    // Диагональные предупреждающие полосы
    for (let x = 0; x < s; x += 32) {
      g.fillStyle = '#d8a418'; g.fillRect(x, s - 24, 16, 16);
      g.fillStyle = '#101010'; g.fillRect(x + 16, s - 24, 16, 16);
    }
    noise(g, s, 500, 0.16);
  });

  // 4. Зелёный/янтарный CRT-терминал с данными (Computer Screen)
  T.screen = makeTex(256, (g, s) => {
    g.fillStyle = '#06140c'; g.fillRect(0, 0, s, s);

    // Сканлайны ЭЛТ-монитора
    for (let y = 0; y < s; y += 4) {
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y, s, 2);
    }

    // Рамка экрана
    g.strokeStyle = '#1a5c32'; g.lineWidth = 6; g.strokeRect(6, 6, s - 12, s - 12);

    // Текст консоли
    g.fillStyle = '#33ff77'; g.font = 'bold 15px monospace';
    g.fillText('> EREBUS OS v4.82', 20, 32);
    g.fillStyle = '#ff4433';
    g.fillText('! BIOHAZARD DETECTED', 20, 58);
    g.fillStyle = '#22dd66'; g.font = '12px monospace';
    g.fillText('CRYO-BAY: FAULT', 20, 84);
    g.fillText('ATMOSPHERE: 82% O2/N2', 20, 104);
    g.fillText('SECURITY: LOCKDOWN', 20, 124);
    g.fillText('REACTOR: STANDBY [32%]', 20, 144);
    g.fillText('CREW VITALS: OFFLINE', 20, 164);

    // Биосхема / радар в нижнем углу
    g.strokeStyle = '#33ff77'; g.lineWidth = 2;
    g.strokeRect(140, 175, 95, 65);
    g.fillStyle = '#ff3322';
    g.beginPath(); g.arc(170, 205, 5, 0, 7); g.fill();
    g.beginPath(); g.arc(205, 220, 4, 0, 7); g.fill();

    // Свечение люминофора
    const grd = g.createRadialGradient(s / 2, s / 2, 40, s / 2, s / 2, 120);
    grd.addColorStop(0, 'rgba(51,255,119,0.12)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
  });

  // 5. Замороженное стекло стазис-капсулы (Cryo Pod Glass)
  T.cryoGlass = makeTex(128, (g, s) => {
    g.fillStyle = '#122530'; g.fillRect(0, 0, s, s);
    // Кристаллы льда и морозный узор
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = 'rgba(180,230,255,0.45)';
      g.lineWidth = 1 + Math.random() * 2;
      const x = Math.random() * s, y = Math.random() * s;
      g.beginPath(); g.moveTo(x, y);
      g.lineTo(x + rand(-16, 16), y + rand(-16, 16));
      g.stroke();
    }
    // Цифровые метки стазиса
    g.fillStyle = '#55ffff'; g.font = 'bold 16px monospace';
    g.fillText('STASIS-04', 16, 30);
    g.fillStyle = 'rgba(100,220,255,0.7)'; g.font = '11px monospace';
    g.fillText('VITALS: 44 BPM', 16, 50);
    g.fillText('TEMP: -18.4 C', 16, 68);

    // Градиент заиндевения
    const grd = g.createLinearGradient(0, 0, 0, s);
    grd.addColorStop(0, 'rgba(140,210,255,0.5)');
    grd.addColorStop(0.5, 'rgba(80,160,200,0.2)');
    grd.addColorStop(1, 'rgba(140,210,255,0.5)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    noise(g, s, 300, 0.2, true);
  });

  // 6. Медицинский стол из нержавеющей стали (Med Table)
  T.medtable = makeTex(128, (g, s) => {
    g.fillStyle = '#4a5058'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#606872'; g.fillRect(4, 4, s - 8, s - 8);
    // Блики шлифованного металла
    for (let y = 8; y < s - 8; y += 12) {
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(4, y, s - 8, 4);
    }
    // Кровавый подтёк и след руки
    g.fillStyle = 'rgba(140,15,10,0.65)';
    g.beginPath(); g.arc(75, 60, 18, 0, 7); g.fill();
    g.fillRect(72, 60, 8, 35);
    noise(g, s, 300, 0.15);
  });

  // 7. Электронная ключ-карта доступа (Security Keycard)
  T.keycard = makeTex(64, (g, s) => {
    g.fillStyle = '#182028'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#22384a'; g.fillRect(4, 4, s - 8, s - 8);
    // Золотой чип
    g.fillStyle = '#e8b830'; g.fillRect(10, 14, 18, 22);
    // Полоса уровня допуска (красный допуск)
    g.fillStyle = '#ff2418'; g.fillRect(32, 14, 22, 8);
    g.fillStyle = '#ffffff'; g.font = 'bold 9px monospace';
    g.fillText('LVL-1', 32, 34);
    noise(g, s, 150, 0.15);
  });

  // 8. Открытый космос с туманностью и планетой (Deep Space Vista)
  T.space = makeTex(512, (g, s) => {
    g.fillStyle = '#030206'; g.fillRect(0, 0, s, s);

    // Звёздная россыпь
    for (let i = 0; i < 400; i++) {
      const x = Math.random() * s, y = Math.random() * s;
      const r = Math.random() < 0.9 ? 1 : 2;
      const a = 0.4 + Math.random() * 0.6;
      g.fillStyle = Math.random() < 0.2 ? `rgba(180,210,255,${a})` : `rgba(255,255,255,${a})`;
      g.fillRect(x, y, r, r);
    }

    // Красочная туманность
    const grdNeb = g.createRadialGradient(s * 0.65, s * 0.4, 30, s * 0.65, s * 0.4, 220);
    grdNeb.addColorStop(0, 'rgba(180,40,90,0.45)');
    grdNeb.addColorStop(0.4, 'rgba(60,20,100,0.3)');
    grdNeb.addColorStop(0.8, 'rgba(20,10,40,0.15)');
    grdNeb.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grdNeb; g.fillRect(0, 0, s, s);

    // Газовый гигант на горизонте
    const px = s * 0.28, py = s * 0.65, pr = 85;
    const grdPlanet = g.createRadialGradient(px - 30, py - 30, 10, px, py, pr);
    grdPlanet.addColorStop(0, '#c48550');
    grdPlanet.addColorStop(0.5, '#7a3e20');
    grdPlanet.addColorStop(0.9, '#2a1208');
    grdPlanet.addColorStop(1, '#050204');
    g.fillStyle = grdPlanet; g.beginPath(); g.arc(px, py, pr, 0, 7); g.fill();

    // Кольца планеты
    g.strokeStyle = 'rgba(210,170,120,0.35)'; g.lineWidth = 5;
    g.beginPath(); g.ellipse(px, py, pr * 1.7, 22, -0.3, 0, 7); g.stroke();
  });

  return T;
}
