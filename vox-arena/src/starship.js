import * as THREE from 'three';
import { rand } from './config.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export class StarshipLevel {
  constructor(scene, T, propsMgr = null) {
    this.scene = scene;
    this.T = T;
    this.propsMgr = propsMgr;

    this.colliders = [];
    this.lights = [];
    this.meshes = [];
    this.doors = [];
    this.interactables = [];
    this.terminals = [];
    this.steamEmitters = [];
    this.sparkEmitters = [];
    this.enemiesSpawned = [];
    this.spawnPoints = [];

    // Состояние корабля и задач
    this.reactorPowered = false;
    this.hasKeycard = false;
    this.hasRifle = false;
    this.hasShotgun = false;
    this.podOpened = false;
    this.objectiveIndex = 0;

    // Сюжетные цели
    this.objectives = [
      'ПОКИНУТЬ СТАЗИС-КАПСУЛУ [E / ПРОБЕЛ]',
      'ОСМОТРЕТЬ МЕДБЛОК И ЗАБРАТЬ АВТОМАТ СО СТОЛА',
      'ОТКРЫТЬ ШЛЮЗ И НАЙТИ КЛЮЧ-КАРТУ ОХРАННИКА',
      'ОТПЕРЕТЬ ОРУЖЕЙНЫЙ АРСЕНАЛ И ЗАБРАТЬ ОБРЕЗ «ПАЛАЧ»',
      'ПРОБИТЬСЯ В ИНЖЕНЕРНЫЙ СЕКТОР И ПЕРЕЗАПУСТИТЬ РЕАКТОР',
      'ПРОЙТИ НА КОМАНДНЫЙ МОСТИК И ЗАПУСТИТЬ СПАСАТЕЛЬНЫЙ ЧЕЛНОК',
      'МИССИЯ ВЫПОЛНЕНА: ЭВАКУАЦИЯ УСПЕШНА!',
    ];

    this._buildStarship();
  }

  get currentObjective() {
    return this.objectives[Math.min(this.objectiveIndex, this.objectives.length - 1)];
  }

  advanceObjective(toIndex, sfx, hud) {
    if (toIndex > this.objectiveIndex) {
      this.objectiveIndex = toIndex;
      if (sfx) sfx.keycardBeep();
      if (hud) {
        hud.banner('ОБНОВЛЕНИЕ ЗАДАЧИ', this.currentObjective);
        hud.styleEvent('ЗАДАЧА ОБНОВЛЕНА');
      }
    }
  }

  _addBox(cx, baseY, cz, sx, sy, sz, mat, { collide = true, texRepeat = null } = {}) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    let m = mat;
    if (texRepeat && mat.map) {
      m = mat.clone();
      m.map = mat.map.clone();
      m.map.repeat.set(texRepeat[0], texRepeat[1]);
      m.map.needsUpdate = true;
    }
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(cx, baseY + sy / 2, cz);
    this.scene.add(mesh);
    this.meshes.push(mesh);
    if (collide) {
      this.colliders.push({
        min: V3(cx - sx / 2, baseY, cz - sz / 2),
        max: V3(cx + sx / 2, baseY + sy, cz + sz / 2),
      });
    }
    return mesh;
  }

  _buildStarship() {
    const T = this.T;
    const lam = (map, color = 0xffffff, extra = {}) => new THREE.MeshLambertMaterial({ map, color, ...extra });

    const hullMat = lam(T.hull, 0xa0a8b4);
    const wallMat = lam(T.wall, 0x888c94);
    const grateMat = lam(T.grate, 0x78808a);
    const platMat = lam(T.platform, 0x6a707a);
    const darkMetal = lam(T.platform, 0x30343a);
    const hazardMat = lam(T.hazard, 0xcca020);
    const bulkheadMat = lam(T.bulkhead, 0x9098a0);
    const screenMat = new THREE.MeshBasicMaterial({ map: T.screen });
    const cryoGlassMat = new THREE.MeshBasicMaterial({ map: T.cryoGlass, transparent: true, opacity: 0.85, side: THREE.DoubleSide });

    // Окружающий космос и туманность вокруг корабля
    const spaceSphere = new THREE.Mesh(
      new THREE.SphereGeometry(320, 16, 12),
      new THREE.MeshBasicMaterial({ map: T.space, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    this.scene.add(spaceSphere);
    this.meshes.push(spaceSphere);

    // Базовый эмбиентный свет космической станции
    const amb = new THREE.AmbientLight(0x18121a, 0.45);
    this.scene.add(amb);
    this.lights.push(amb);

    const hemi = new THREE.HemisphereLight(0x354050, 0x10080c, 0.45);
    this.scene.add(hemi);
    this.lights.push(hemi);

    // ========================================================================
    // 1. СЕКТОР 01: СТАЗИС-ОТСЕК И МЕДБЛОК (CRYO-BAY) [X: -7..7, Z: -7..7]
    // ========================================================================
    const cryoFloor = this._addBox(0, 0, 0, 14, 0.2, 14, grateMat, { collide: false, texRepeat: [4, 4] });
    const cryoCeil = this._addBox(0, 4.4, 0, 14, 0.4, 14, darkMetal, { collide: false });

    // Стены медблока
    this._addBox(-7, 0, 0, 0.6, 4.4, 14, hullMat, { texRepeat: [3, 1] });
    this._addBox(7, 0, 0, 0.6, 4.4, 14, hullMat, { texRepeat: [3, 1] });
    this._addBox(0, 0, -7, 14, 4.4, 0.6, hullMat, { texRepeat: [3, 1] });

    // Южная стена медблока с дверным проемом в шлюз
    this._addBox(-4.7, 0, 7, 4.6, 4.4, 0.6, hullMat);
    this._addBox(4.7, 0, 7, 4.6, 4.4, 0.6, hullMat);
    this._addBox(0, 3.2, 7, 4.8, 1.2, 0.6, hazardMat);

    // Аварийный красный свет медблока
    const cryoLight = new THREE.PointLight(0xff2a18, 22, 14, 2);
    cryoLight.position.set(0, 3.8, 0);
    this.scene.add(cryoLight);
    this.lights.push(cryoLight);

    // ---- КАПСУЛА ПРОБУЖДЕНИЯ ИГРОКА (STASIS-04) ----
    const podGroup = new THREE.Group();
    podGroup.position.set(0, 0, 0);

    const podBase = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.65, 2.4), darkMetal);
    podBase.position.set(0, 0.325, 0);
    const podBed = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.15, 1.9), lam(T.platform, 0x444850));
    podBed.position.set(0, 0.68, 0);
    const podHead = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 0.4), darkMetal);
    podHead.position.set(0, 1.2, -1.0);
    const podScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), screenMat);
    podScreen.position.set(0, 1.3, -0.79);

    // Подвижный стеклянный колпак стазис-капсулы
    const canopyGroup = new THREE.Group();
    canopyGroup.position.set(0, 0.7, 0);
    const canopyGlass = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 2.0), cryoGlassMat);
    canopyGlass.position.set(0, 0.55, 0);
    const canopyFrame = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.08, 2.06), hazardMat);
    canopyFrame.position.set(0, 0.04, 0);
    canopyGroup.add(canopyGlass, canopyFrame);

    podGroup.add(podBase, podBed, podHead, podScreen, canopyGroup);
    this.scene.add(podGroup);
    this.meshes.push(podGroup);

    this.playerPodCanopy = canopyGroup;

    // Интерактивный триггер выхода из капсулы
    this.interactables.push({
      id: 'cryo_pod_04',
      type: 'cryo_pod',
      pos: V3(0, 1.0, 0),
      radius: 2.2,
      prompt: '[E / ПРОБЕЛ] АВАРИЙНЫЙ ВЫХОД ИЗ СТАЗИС-КАПСУЛЫ',
      usable: true,
      mesh: podGroup,
      onUse: (player, level, sfx, hud, fx) => {
        if (level.podOpened) return;
        level.podOpened = true;
        this.prompt = '';
        if (sfx) {
          sfx.cryoHiss();
          sfx.heartbeat();
        }
        if (fx) {
          // Крио-пар, вырывающийся наружу
          for (let i = 0; i < 8; i++) {
            fx.steam(V3(rand(-0.6, 0.6), 0.7, rand(-0.9, 0.9)), V3(rand(-0.5, 0.5), rand(1.2, 2.4), rand(-0.5, 0.5)));
          }
        }
        // Плавный подъем колпака
        const startY = canopyGroup.position.y;
        let t = 0;
        const liftInterval = setInterval(() => {
          t += 0.05;
          canopyGroup.position.y = startY + Math.min(1, t) * 1.8;
          if (t >= 1) clearInterval(liftInterval);
        }, 30);

        level.advanceObjective(1, sfx, hud);
      },
    });

    // Другие стазис-капсулы вдоль стен медблока
    const otherPods = [
      { x: -5.0, z: -4.0, broken: false },
      { x: -5.0, z: 0.0, broken: true },
      { x: -5.0, z: 4.0, broken: false },
      { x: 5.0, z: -4.0, broken: true },
      { x: 5.0, z: 4.0, broken: false },
    ];
    for (const p of otherPods) {
      const g = new THREE.Group(); g.position.set(p.x, 0, p.z);
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.65, 2.4), darkMetal); b.position.set(0, 0.325, 0);
      const h = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 0.4), darkMetal); h.position.set(0, 1.2, -1.0);
      g.add(b, h);
      if (!p.broken) {
        const gl = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 2.0), cryoGlassMat); gl.position.set(0, 1.25, 0);
        g.add(gl);
      } else {
        // Разбитая капсула с кровавыми подтеками
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshBasicMaterial({ color: 0xaa1111 }));
        scr.position.set(0, 1.3, -0.79);
        g.add(scr);
      }
      this.scene.add(g); this.meshes.push(g);
      this.colliders.push({ min: V3(p.x - 0.8, 0, p.z - 1.2), max: V3(p.x + 0.8, 2.2, p.z + 1.2) });
    }

    // Медицинский стол с первым оружием и терминалом
    const medTable = this._addBox(3.0, 0, -2.5, 2.2, 0.9, 1.2, lam(T.medtable));
    const medScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.65), screenMat);
    medScreen.position.set(3.0, 1.8, -6.65);
    this.scene.add(medScreen); this.meshes.push(medScreen);

    // Терминал медблока (Log #1)
    this.interactables.push({
      id: 'term_medbay',
      type: 'terminal',
      pos: V3(3.0, 1.5, -6.2),
      radius: 2.2,
      prompt: '[E] ПРОЧИТАТЬ АУДИОЛОГ МЕДСЛУЖБЫ',
      title: 'МЕДИЦИНСКИЙ ОТСЕК · ЗАПИСЬ Д-РА ЧЕН',
      logText:
        'Д-р Чен (старший ксенобиолог):\n' +
        '«...03:14 по бортовому времени. Внезапная мутация образца Кси-4 во время крио-консервации.\n' +
        'Биомасса пробила бронестекло капсулы 02 и ушла в вентиляцию.\n' +
        'Офицер Вэнс объявил протокол изоляции и запер арсенал (ключ-карта у него на посту охраны).\n' +
        'Если вы очнулись — берите штурмовой автомат со стола и ищите Вэнса в шлюзовом отсеке!»',
      usable: true,
      onUse: (player, level, sfx, hud) => {
        if (sfx) sfx.terminalBeep();
        if (hud) hud.showTerminal(this.title, this.logText);
      },
    });

    // Пикап оружия: Автомат «Сектор-9» на медицинском столе
    const rifleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 0.15), lam(T.platform, 0x334455));
    rifleMesh.position.set(3.0, 1.05, -2.5);
    this.scene.add(rifleMesh); this.meshes.push(rifleMesh);

    this.interactables.push({
      id: 'pickup_rifle',
      type: 'pickup_weapon',
      pos: V3(3.0, 1.0, -2.5),
      radius: 1.8,
      prompt: '[E] ЗАБРАТЬ ШТУРМОВОЙ АВТОМАТ «СЕКТОР-9» И ФОНАРЬ',
      usable: true,
      mesh: rifleMesh,
      onUse: (player, level, sfx, hud) => {
        level.hasRifle = true;
        this.usable = false;
        rifleMesh.visible = false;
        player.switchWeapon(0, sfx, hud);
        player.flashlightOn = true;
        player.spotLight.intensity = 5.8;
        player.spillLight.intensity = 2.4;
        if (sfx) sfx.weaponSwitch();
        if (hud) {
          hud.setFlashlight(true);
          hud.banner('ОРУЖИЕ ПОЛУЧЕНО', 'ШТУРМОВОЙ АВТОМАТ «СЕКТОР-9» · 6.8 ММ');
          hud.styleEvent('«СЕКТОР-9» + ФОНАРЬ');
        }
        level.advanceObjective(2, sfx, hud);
      },
    });

    // ========================================================================
    // 2. СЕКТОР 02: ДЕКОНТАМИНАЦИОННЫЙ ШЛЮЗ И ПОСТ ОХРАНЫ [Z: 7..19]
    // ========================================================================
    this._addBox(0, 0, 13, 5.2, 0.2, 12, grateMat, { collide: false, texRepeat: [2, 4] });
    this._addBox(0, 4.4, 13, 5.2, 0.4, 12, darkMetal, { collide: false });
    this._addBox(-2.6, 0, 13, 0.6, 4.4, 12, hullMat, { texRepeat: [3, 1] });
    this._addBox(2.6, 0, 13, 0.6, 4.4, 12, hullMat, { texRepeat: [3, 1] });

    // Оранжевый пульсирующий свет шлюза
    const airlockLight = new THREE.PointLight(0xff7722, 24, 12, 2);
    airlockLight.position.set(0, 3.8, 13);
    this.scene.add(airlockLight); this.lights.push(airlockLight);

    // Гермодверь #1 (Медблок <-> Шлюз) на Z = 7.0
    this._createSlidingDoor('door_medbay', 0, 0, 7.0, 3.8, 3.4, bulkheadMat, false);

    // Гермодверь #2 (Шлюз <-> Главный коридор) на Z = 19.0
    this._createSlidingDoor('door_airlock_exit', 0, 0, 19.0, 3.8, 3.4, bulkheadMat, false);

    // Труп охранника и Ключ-карта Допуска LVL-1 в шлюзе
    const guardBody = this._addBox(-1.6, 0, 15.0, 0.9, 0.4, 1.4, lam(T.platform, 0x223344), { collide: false });
    const keycardMesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.06, 0.22), new THREE.MeshBasicMaterial({ map: T.keycard }));
    keycardMesh.position.set(-1.6, 0.48, 15.0);
    this.scene.add(keycardMesh); this.meshes.push(keycardMesh);

    this.interactables.push({
      id: 'pickup_keycard',
      type: 'pickup_keycard',
      pos: V3(-1.6, 0.5, 15.0),
      radius: 1.8,
      prompt: '[E] ВЗЯТЬ КЛЮЧ-КАРТУ ОФИЦЕРА ВЭНСА (LVL-1)',
      usable: true,
      mesh: keycardMesh,
      onUse: (player, level, sfx, hud) => {
        level.hasKeycard = true;
        this.usable = false;
        keycardMesh.visible = false;
        if (sfx) sfx.keycardBeep();
        if (hud) {
          hud.banner('КЛЮЧ-КАРТА ПОЛУЧЕНА', 'ДОСТУП УРОВНЯ 1: ОРУЖЕЙНЫЙ АРСЕНАЛ И ИНЖЕНЕРНЫЙ БЛОК');
          hud.styleEvent('КЛЮЧ-КАРТА LVL-1');
        }
        level.advanceObjective(3, sfx, hud);
      },
    });

    // ========================================================================
    // 3. СЕКТОР 03: ЦЕНТРАЛЬНАЯ МАГИСТРАЛЬ И КОРИДОРЫ [X: -26..26, Z: 19..37]
    // ========================================================================
    // Главный поперечный коридор
    this._addBox(0, 0, 26, 44, 0.2, 8, grateMat, { collide: false, texRepeat: [11, 2] });
    this._addBox(0, 4.4, 26, 44, 0.4, 8, darkMetal, { collide: false });
    this._addBox(0, 0, 22, 44, 4.4, 0.6, hullMat, { texRepeat: [11, 1] });
    this._addBox(0, 0, 30, 44, 4.4, 0.6, hullMat, { texRepeat: [11, 1] });

    // Освещение центрального узла
    const hubLightE = new THREE.PointLight(0xff3322, 22, 14, 2); hubLightE.position.set(12, 3.8, 26); this.scene.add(hubLightE); this.lights.push(hubLightE);
    const hubLightW = new THREE.PointLight(0xff3322, 22, 14, 2); hubLightW.position.set(-12, 3.8, 26); this.scene.add(hubLightW); this.lights.push(hubLightW);

    // ========================================================================
    // 4. СЕКТОР 04: ОРУЖЕЙНЫЙ АРСЕНАЛ (ARMORY) [X: 16..30, Z: 6..22]
    // ========================================================================
    this._addBox(22, 0, 14, 12, 0.2, 14, platMat, { collide: false, texRepeat: [3, 3] });
    this._addBox(22, 4.4, 14, 12, 0.4, 14, darkMetal, { collide: false });
    this._addBox(28, 0, 14, 0.6, 4.4, 14, hullMat);
    this._addBox(22, 0, 7, 12, 4.4, 0.6, hullMat);
    this._addBox(16, 0, 10, 0.6, 4.4, 6, hullMat);
    this._addBox(16, 0, 18, 0.6, 4.4, 6, hullMat);

    // Дверь в Арсенал (требует Ключ-карту LVL-1)
    this._createSlidingDoor('door_armory', 16, 0, 14, 0.6, 3.4, bulkheadMat, true, 'X');

    // Освещение арсенала
    const armoryLight = new THREE.PointLight(0xffaa44, 26, 14, 2);
    armoryLight.position.set(22, 3.8, 14);
    this.scene.add(armoryLight); this.lights.push(armoryLight);

    // Оружейная стойка с обрезом «Палач»
    const rack = this._addBox(26.5, 0, 14, 0.8, 2.0, 3.2, darkMetal);
    const shotgunMesh = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.22, 0.16), lam(T.platform, 0x884422));
    shotgunMesh.position.set(25.9, 1.2, 14);
    this.scene.add(shotgunMesh); this.meshes.push(shotgunMesh);

    this.interactables.push({
      id: 'pickup_shotgun',
      type: 'pickup_weapon',
      pos: V3(25.9, 1.2, 14),
      radius: 2.0,
      prompt: '[E] ЗАБРАТЬ ДВУСТВОЛЬНЫЙ ОБРЕЗ «ПАЛАЧ» (12 КАЛИБР)',
      usable: true,
      mesh: shotgunMesh,
      onUse: (player, level, sfx, hud) => {
        level.hasShotgun = true;
        this.usable = false;
        shotgunMesh.visible = false;
        player.switchWeapon(1, sfx, hud);
        if (sfx) sfx.weaponSwitch();
        if (hud) {
          hud.banner('ТЯЖЕЛОЕ ОРУЖИЕ НАЙДЕНО', 'ДВУСТВОЛЬНЫЙ ОБРЕЗ «ПАЛАЧ» · 12 КАЛИБР');
          hud.styleEvent('«ПАЛАЧ» В РУКАХ!');
        }
        level.advanceObjective(4, sfx, hud);
      },
    });

    // Терминал арсенала (Log #2)
    this.interactables.push({
      id: 'term_armory',
      type: 'terminal',
      pos: V3(22.0, 1.5, 7.8),
      radius: 2.0,
      prompt: '[E] ПРОЧИТАТЬ ЗАПИСЬ НАЧАЛЬНИКА ОХРАНЫ',
      title: 'ОРУЖЕЙНАЯ · ПОСЛЕДНИЙ РАПОРТ ВЭНСА',
      logText:
        'Офицер Вэнс (начальник охраны):\n' +
        '«Они проломили решётки вентиляции реакторного зала...\n' +
        'Реактор перешёл в аварийный сброс, энергощиты мостика заблокированы.\n' +
        'Дробовик "Палач" эффективнее всего против бронированных особей — цельтесь в суставы ног и головы!\n' +
        'Нужно добраться до консоли реактора в Западном секторе и перезапустить турбину питания!»',
      usable: true,
      onUse: (player, level, sfx, hud) => {
        if (sfx) sfx.terminalBeep();
        if (hud) hud.showTerminal(this.title, this.logText);
      },
    });

    // ========================================================================
    // 5. СЕКТОР 05: ИНЖЕНЕРНЫЙ СЕКТОР И РЕАКТОР [X: -38..-16, Z: 10..34]
    // ========================================================================
    this._addBox(-27, 0, 22, 18, 0.2, 18, grateMat, { collide: false, texRepeat: [4, 4] });
    this._addBox(-27, 6.0, 22, 18, 0.4, 18, darkMetal, { collide: false });
    this._addBox(-36, 0, 22, 0.6, 6.0, 18, hullMat);
    this._addBox(-27, 0, 13, 18, 6.0, 0.6, hullMat);
    this._addBox(-27, 0, 31, 18, 6.0, 0.6, hullMat);
    this._addBox(-18, 0, 17, 0.6, 6.0, 8, hullMat);
    this._addBox(-18, 0, 27, 0.6, 6.0, 8, hullMat);

    // Дверь в Инженерный отсек (требует Keycard LVL-1)
    this._createSlidingDoor('door_engineering', -18, 0, 22, 0.6, 3.4, bulkheadMat, true, 'X');

    // Массивный гудящий реактор в центре зала
    const reactorCylinder = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 5.5, 12), darkMetal);
    reactorCylinder.position.set(-27, 2.75, 22);
    this.scene.add(reactorCylinder); this.meshes.push(reactorCylinder);
    this.colliders.push({ min: V3(-29.4, 0, 19.6), max: V3(-24.6, 6.0, 24.4) });

    const coreLight = new THREE.PointLight(0xff2211, 35, 18, 2);
    coreLight.position.set(-27, 3.2, 22);
    this.scene.add(coreLight); this.lights.push(coreLight);
    this.reactorLight = coreLight;

    // Консоль перезапуска реактора
    const reactConsole = this._addBox(-34.5, 0, 22, 1.2, 1.2, 1.8, darkMetal);
    const reactScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), screenMat);
    reactScreen.position.set(-33.8, 1.6, 22);
    reactScreen.rotation.y = Math.PI / 2;
    this.scene.add(reactScreen); this.meshes.push(reactScreen);

    this.interactables.push({
      id: 'reactor_switch',
      type: 'reactor_switch',
      pos: V3(-33.8, 1.2, 22),
      radius: 2.2,
      prompt: '[E] ПЕРЕЗАПУСТИТЬ ТУРБИНУ РЕАКТОРА',
      usable: true,
      mesh: reactConsole,
      onUse: (player, level, sfx, hud, fx) => {
        if (level.reactorPowered) return;
        level.reactorPowered = true;
        this.usable = false;

        // Переключение света реактора в ярко-синий плазменный режим
        level.reactorLight.color.setHex(0x3399ff);
        level.reactorLight.intensity = 55;

        if (sfx) {
          sfx.portal();
          sfx.keycardBeep();
        }
        if (hud) {
          hud.banner('ПИТАНИЕ ВОССТАНОВЛЕНО', 'ДВЕРИ НА КОМАНДНЫЙ МОСТИК РАЗБЛОКИРОВАНЫ');
          hud.styleEvent('РЕАКТОР АКТИВЕН!');
        }
        level.advanceObjective(5, sfx, hud);
      },
    });

    // ========================================================================
    // 6. СЕКТОР 06: КОМАНДНЫЙ МОСТИК И ЧЕЛНОК (BRIDGE) [X: -8..8, Z: 30..52]
    // ========================================================================
    this._addBox(0, 0, 42, 16, 0.2, 20, grateMat, { collide: false, texRepeat: [4, 5] });
    this._addBox(0, 5.0, 42, 16, 0.4, 20, darkMetal, { collide: false });
    this._addBox(-8, 0, 42, 0.6, 5.0, 20, hullMat);
    this._addBox(8, 0, 42, 0.6, 5.0, 20, hullMat);
    this._addBox(0, 0, 30, 6, 5.0, 0.6, hullMat);
    this._addBox(-5.5, 0, 30, 5, 5.0, 0.6, hullMat);
    this._addBox(5.5, 0, 30, 5, 5.0, 0.6, hullMat);

    // Гермодверь на мостик (открывается после перезапуска реактора)
    this._createSlidingDoor('door_bridge', 0, 0, 30, 4.0, 3.4, bulkheadMat, true, 'Z', true);

    // Панорамный иллюминатор мостика с видом в открытый космос (на Z = 52)
    const windowFrame = this._addBox(0, 0, 52, 14, 1.0, 0.6, darkMetal);
    const windowTop = this._addBox(0, 4.2, 52, 14, 0.8, 0.6, darkMetal);
    const windowL = this._addBox(-6.8, 1.0, 52, 0.6, 3.2, 0.6, darkMetal);
    const windowR = this._addBox(6.8, 1.0, 52, 0.6, 3.2, 0.6, darkMetal);

    // Консоли управления мостика
    const bridgeNav = this._addBox(0, 0, 46, 4.0, 1.1, 1.6, darkMetal);
    const bridgeScreen = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.9), screenMat);
    bridgeScreen.position.set(0, 1.6, 46.85);
    this.scene.add(bridgeScreen); this.meshes.push(bridgeScreen);

    const bridgeLight = new THREE.PointLight(0x4488ff, 32, 16, 2);
    bridgeLight.position.set(0, 4.2, 44);
    this.scene.add(bridgeLight); this.lights.push(bridgeLight);

    // Консоль запуска спасательного челнока (ФИНАЛ ИГРЫ)
    this.interactables.push({
      id: 'escape_shuttle',
      type: 'escape_switch',
      pos: V3(0, 1.2, 46.0),
      radius: 2.2,
      prompt: '[E] ЗАПУСТИТЬ СПАСАТЕЛЬНЫЙ ЧЕЛНОК «СПАС-1»',
      usable: true,
      mesh: bridgeNav,
      onUse: (player, level, sfx, hud) => {
        this.usable = false;
        if (sfx) {
          sfx.portal();
          sfx.alarmKlaxon();
        }
        if (hud) {
          hud.banner('ЭВАКУАЦИЯ УСПЕШНА!', 'ВЫ СПАСЛИСЬ С ЗВЕЗДОЛЁТА «ЭРЕБ-7»');
          hud.styleEvent('МИССИЯ ВЫПОЛНЕНА!');
        }
        level.advanceObjective(6, sfx, hud);
      },
    });

    // Расстановка физических контейнеров и ящиков на корабле
    if (this.propsMgr) {
      const shipCrates = [
        // В арсенале
        [20, 0, 10, 1.4], [21.5, 0, 10, 1.1], [20.7, 1.4, 10, 0.9],
        [24, 0, 18, 1.5], [24, 1.5, 18, 1.1],
        // В коридорах
        [-6, 0, 24, 1.3], [7, 0, 28, 1.2], [-14, 0, 27, 1.4],
        // В реакторном зале
        [-22, 0, 16, 1.6], [-32, 0, 28, 1.5], [-32, 1.5, 28, 1.0],
      ];
      for (const [x, y, z, s] of shipCrates) {
        this.propsMgr.addCrate(x, y, z, s, s, s);
      }
    }

    // Точки спавна монстров для органичного размещения по отсекам
    this.spawnPoints = [
      // Шлюз и коридор
      V3(0, 0, 17),
      V3(4, 0, 26),
      V3(-8, 0, 26),
      V3(14, 0, 26),
      // Арсенал
      V3(22, 0, 16),
      // Инженерный сектор
      V3(-24, 0, 20),
      V3(-30, 0, 24),
      // Мостик
      V3(0, 0, 38),
      V3(-4, 0, 44),
      V3(4, 0, 44),
    ];
  }

  // Создание раздвижной гермодвери
  _createSlidingDoor(id, cx, baseY, cz, width, height, mat, locked = false, axis = 'Z', requiresReactor = false) {
    const doorGroup = new THREE.Group();
    doorGroup.position.set(cx, baseY, cz);

    const halfW = width / 2;
    const gL = new THREE.BoxGeometry(axis === 'X' ? 0.4 : halfW, height, axis === 'X' ? halfW : 0.4);
    const gR = gL.clone();

    const doorL = new THREE.Mesh(gL, mat);
    const doorR = new THREE.Mesh(gR, mat);

    if (axis === 'X') {
      doorL.position.set(0, height / 2, -halfW / 2);
      doorR.position.set(0, height / 2, halfW / 2);
    } else {
      doorL.position.set(-halfW / 2, height / 2, 0);
      doorR.position.set(halfW / 2, height / 2, 0);
    }

    doorGroup.add(doorL, doorR);
    this.scene.add(doorGroup);
    this.meshes.push(doorGroup);

    const collider = {
      min: V3(cx - (axis === 'X' ? 0.3 : width / 2), baseY, cz - (axis === 'X' ? width / 2 : 0.3)),
      max: V3(cx + (axis === 'X' ? 0.3 : width / 2), baseY + height, cz + (axis === 'X' ? width / 2 : 0.3)),
      doorId: id,
    };
    this.colliders.push(collider);

    const doorObj = {
      id,
      group: doorGroup,
      doorL, doorR,
      collider,
      axis,
      width,
      isOpen: false,
      isOpening: false,
      isLocked: locked,
      requiresReactor,
      openAmount: 0,
    };
    this.doors.push(doorObj);

    // Добавляем интерактивный триггер двери
    this.interactables.push({
      id: 'interact_' + id,
      type: 'door',
      pos: V3(cx, baseY + 1.2, cz),
      radius: 2.8,
      prompt: () => {
        if (doorObj.isOpen) return '[E] ЗАКРЫТЬ ГЕРМОДВЕРЬ';
        if (doorObj.requiresReactor && !this.reactorPowered) return '🔒 ЗАБЛОКИРОВАНО: ТРЕБУЕТСЯ ПИТАНИЕ РЕАКТОРА';
        if (doorObj.isLocked && !this.hasKeycard) return '🔒 ЗАБЛОКИРОВАНО: ТРЕБУЕТСЯ КЛЮЧ-КАРТА LVL-1';
        return '[E] ОТКРЫТЬ ГЕРМОДВЕРЬ';
      },
      usable: true,
      onUse: (player, level, sfx, hud) => {
        if (doorObj.requiresReactor && !level.reactorPowered) {
          if (sfx) sfx.doorLocked();
          if (hud) hud.styleEvent('НЕТ ПИТАНИЯ РЕАКТОРА!');
          return;
        }
        if (doorObj.isLocked && !level.hasKeycard) {
          if (sfx) sfx.doorLocked();
          if (hud) hud.styleEvent('ТРЕБУЕТСЯ КЛЮЧ-КАРТА LVL-1!');
          return;
        }
        this.toggleDoor(doorObj, sfx, hud);
      },
    });

    return doorObj;
  }

  toggleDoor(door, sfx, hud) {
    door.isOpen = !door.isOpen;
    if (sfx) sfx.doorHydraulic();

    const targetOpen = door.isOpen ? 1 : 0;
    const startOpen = door.openAmount;
    let t = 0;

    const anim = setInterval(() => {
      t += 0.08;
      door.openAmount = startOpen + (targetOpen - startOpen) * Math.min(1, t);
      const shift = door.openAmount * (door.width * 0.48);

      if (door.axis === 'X') {
        door.doorL.position.z = -door.width / 4 - shift;
        door.doorR.position.z = door.width / 4 + shift;
      } else {
        door.doorL.position.x = -door.width / 4 - shift;
        door.doorR.position.x = door.width / 4 + shift;
      }

      if (t >= 1) {
        clearInterval(anim);
        // Отключаем/включаем коллизию открытой двери
        if (door.isOpen) {
          const idx = this.colliders.indexOf(door.collider);
          if (idx >= 0) this.colliders.splice(idx, 1);
        } else {
          if (!this.colliders.includes(door.collider)) {
            this.colliders.push(door.collider);
          }
        }
      }
    }, 30);
  }

  // Поиск ближайшего интерактивного объекта в луче взгляда игрока
  checkInteraction(playerPos, cameraFwd, maxDist = 2.8) {
    let best = null;
    let bestDist = maxDist;

    for (const item of this.interactables) {
      if (!item.usable) continue;
      const dx = item.pos.x - playerPos.x;
      const dy = item.pos.y - playerPos.y;
      const dz = item.pos.z - playerPos.z;
      const dist = Math.hypot(dx, dy, dz);

      if (dist <= (item.radius || 2.4) && dist < bestDist) {
        if (item.type === 'cryo_pod' && !this.podOpened) {
          // Внутри капсулы можно нажать E или Пробел в любую сторону для открытия
          bestDist = dist;
          best = item;
          continue;
        }
        const dot = (dx * cameraFwd.x + dy * cameraFwd.y + dz * cameraFwd.z) / (dist || 1);
        if (dot > 0.35) {
          bestDist = dist;
          best = item;
        }
      }
    }
    return best;
  }

  // Физика пола и стен
  groundTopAt(x, z, footY) {
    let best = 0;
    const STEP = 0.7;
    for (const c of this.colliders) {
      if (x >= c.min.x - 0.01 && x <= c.max.x + 0.01 && z >= c.min.z - 0.01 && z <= c.max.z + 0.01) {
        if (c.max.y <= footY + STEP && c.max.y > best) best = c.max.y;
      }
    }
    return best;
  }

  clampCircle(pos, r, footY, height) {
    const STEP = 0.7;
    for (const c of this.colliders) {
      if (c.max.y - footY <= STEP) continue;
      if (footY + height < c.min.y) continue;
      const nx = Math.max(c.min.x, Math.min(pos.x, c.max.x));
      const nz = Math.max(c.min.z, Math.min(pos.z, c.max.z));
      let dx = pos.x - nx, dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2), push = (r - d) / d;
        pos.x += dx * push; pos.z += dz * push;
      }
    }
  }

  raycastWorld(o, d, maxDist) {
    let bestT = maxDist, normal = null;
    for (const c of this.colliders) {
      let tmin = 0, tmax = bestT, nAxis = -1, nSign = 0;
      let ok = true;
      for (let a = 0; a < 3; a++) {
        const ax = ['x', 'y', 'z'][a];
        const mn = c.min[ax], mx = c.max[ax], oo = o[ax], dd = d[ax];
        if (Math.abs(dd) < 1e-9) { if (oo < mn || oo > mx) { ok = false; break; } continue; }
        let t1 = (mn - oo) / dd, t2 = (mx - oo) / dd, sgn = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sgn = 1; }
        if (t1 > tmin) { tmin = t1; nAxis = a; nSign = sgn; }
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) { ok = false; break; }
      }
      if (ok && tmin < bestT && tmin > 0.001) {
        bestT = tmin; normal = new THREE.Vector3();
        if (nAxis >= 0) normal[['x', 'y', 'z'][nAxis]] = nSign; else normal.copy(d).negate();
      }
    }
    if (d.y < -1e-6) {
      const t = -o.y / d.y;
      if (t > 0.001 && t < bestT && Math.abs(o.x + d.x * t) < 45 && Math.abs(o.z + d.z * t) < 60) {
        bestT = t; normal = V3(0, 1, 0);
      }
    }
    return normal ? { dist: bestT, point: o.clone().addScaledVector(d, bestT), normal } : null;
  }

  populateEnemies(enemyMgr) {
    if (!enemyMgr) return;
    // Органичное размещение монстров по отсекам космического корабля
    enemyMgr.spawn('zombie', 0, 16, 1, true);   // Зомби в шлюзе
    enemyMgr.spawn('minion', 8, 26, 1, true);   // Скороход в коридоре
    enemyMgr.spawn('zombie', -10, 26, 1, true); // Зомби в коридоре
    enemyMgr.spawn('rogue', 22, 16, 1, true);   // Резак в арсенале
    enemyMgr.spawn('warrior', -27, 26, 1, true);// Клещ-мутант в реакторном зале
    enemyMgr.spawn('zombie', -23, 17, 1, true); // Зомби-инженер
    enemyMgr.spawn('mage', 0, 42, 1, true);     // Летающий Плод на мостике
    enemyMgr.spawn('rogue', -4, 46, 1, true);   // Охранный Резак на мостике
  }

  update(dt, time, playerPos) {
    // Анимация пульсации света реактора
    if (this.reactorLight) {
      if (this.reactorPowered) {
        this.reactorLight.intensity = 45 + Math.sin(time * 6) * 10;
      } else {
        this.reactorLight.intensity = 22 + Math.sin(time * 3) * 8;
      }
    }
  }

  updatePickups(dt, time, playerPos, onPickup) {
    this.update(dt, time, playerPos);
  }

  resetPickups() {}

  clear() {
    for (const m of this.meshes) this.scene.remove(m);
    for (const l of this.lights) this.scene.remove(l);
    this.meshes.length = 0;
    this.lights.length = 0;
    this.colliders.length = 0;
    this.interactables.length = 0;
    this.doors.length = 0;
  }
}
