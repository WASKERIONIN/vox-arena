# ВОКСЕЛЬНАЯ БОЙНЯ — Arena Prototype 0.1

Брутальный воксельный FPS-прототип на Three.js в одном HTML-файле.
PS1-стиль хоррор + яркие неоновые акценты, воксельные эффекты (кровь, гибсы, искры,
дым, гильзы, дырки от пуль), волны врагов, синтезированный саундтрек.

## Как запустить

**Вариант 1 (самый простой):** открыть `release/index.html` в любом браузере
(Chrome/Edge/Firefox). Всё в одном файле — интернет не нужен.

**Вариант 2 (локальный сервер):**
```bash
cd vox-arena
python3 -m http.server 8000
# открыть http://localhost:8000/release/index.html
```
Локальный сервер нужен только для полноценного захвата мыши (pointer lock)
внутри встроенных превью некоторых платформ. Обычный браузер — открывайте файл напрямую.

## Управление

| Клавиша | Действие |
|---|---|
| `W A S D` | движение |
| `Мышь` | обзор (клик по экрану захватывает курсор) |
| `ЛКМ` | огонь |
| `R` | перезарядка |
| `Shift` | спринт |
| `Пробел` | прыжок |
| `Esc` | пауза / выход из захвата мыши |

Хедшот (верхняя часть черепа) — ×2.6 урона. Красные аптечки +30 брони.
Шкала стиля (D→C→B→A→S→ULTRA) растёт за убийства и хедшоты, гаснет со временем.

## Сборка из исходников

```bash
cd vox-arena
npm install          # three, esbuild, @gltf-transform/*, sharp
node tools/build.mjs # соберёт release/index.html (ассеты инлайнятся в base64)
```

Тесты (headless Chrome, playwright):
```bash
npx playwright install chromium --with-deps
node tools/smoke2.mjs   # полный цикл: волны, смерть, рестарт
node tools/debug.mjs    # телеметрия волны
```

## Структура

```
src/
  main.js          — состояние игры, цикл, ввод
  arena.js         — арена, коллизии, лучи против мира, аптечки
  enemies.js       — 4 типа врагов (KayKit Skeletons), ИИ, стиринг, снаряды
  player.js        — движение, оружие, отдача
  weapon-model.js  — процедурная вьюмодель винтовки (экструзии)
  fx.js            — воксельные частицы (InstancedMesh), дым, декали, трассеры
  waves.js         — режиссёр волн
  audio.js         — SFX + музыка на WebAudio (без файлов)
  ps1.js           — низкое разрешение рендера + nearest
  textures.js      — процедурные PS1-текстуры
  hud.js           — HUD, меню, настройки (на русском)
tools/
  optimize.mjs     — пережатие GLB (только нужные анимации, текстура 256px)
  build.mjs        — единый HTML-билд
assets/processed/  — ужатые GLB (KayKit Skeletons, CC0)
```

## Лицензии

- Модели врагов: [KayKit — Character Pack Skeletons](https://kaylousberg.itch.io/kaykit-skeletons)
  от Kay Lousberg — **CC0** (public domain), `assets/processed/LICENSE-kaykit.txt`.
- Код игры — без ограничений, делайте что хотите.
- Звук генерируется процедурно в реальном времени (WebAudio), аудиофайлов нет.
