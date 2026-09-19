import * as THREE from 'three';
import { rand } from './config.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export class StarshipLevel {
  constructor(scene, T, propsMgr = null) {
    this.scene = scene;
    this.T = T;
    this.propsMgr = propsMgr;

    this.colliders = [];
    this.podColliders = [];
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
      'ОСМОТРЕТЬ МЕДБЛОК И ЗАБРАТЬ ШТУРМОВОЙ АВТОМАТ СО СТОЛА',
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
        hud.setObjective(this.currentObjective);
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
    // 1. СЕКТОР 01: СТАЗИС-ОТСЕК И МЕДБЛОК (CRYO-BAY) [X: -8..8, Z: -8..8, Y: 0..4.4]
    // ========================================================================
    // Пол и потолок медблока
    this._addBox(0, 0, 0, 16, 0.2, 16, grateMat, { collide: false, texRepeat: [4, 4] });
    this._addBox(0, 4.4, 0, 16, 0.4, 16, darkMetal, { collide: false });

    // Стены медблока (Север, Запад, Восток)
    this._addBox(0, 0, -8, 16, 4.4, 0.6, hullMat, { texRepeat: [4, 1] });
    this._addBox(-8, 0, 0, 0.6, 4.4, 16, hullMat, { texRepeat: [4, 1] });
    this._addBox(8, 0, 0, 0.6, 4.4, 16, hullMat, { texRepeat: [4, 1] });

    // Южная стена медблока с дверным проемом шириной 4.0м в шлюз на Z = 8
    this._addBox(-5.0, 0, 8, 6.0, 4.4, 0.6, hullMat);
    this._addBox(5.0, 0, 8, 6.0, 4.4, 0.6, hullMat);
    this._addBox(0, 3.2, 8, 4.0, 1.2, 0.6, hazardMat);

    // Аварийный красный свет медблока
    const cryoLight = new THREE.PointLight(0xff2a18, 24, 16, 2);
    cryoLight.position.set(0, 3.8, 0);
    this.scene.add(cryoLight);
    this.lights.push(cryoLight);

    // ---- КАПСУЛА ПРОБУЖДЕНИЯ ИГРОКА (STASIS-04) В ЦЕНТРЕ (0, 0, 0) ----
    const podGroup = new THREE.Group();
    podGroup.position.set(0, 0, 0);

    const podBase = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 2.4), darkMetal);
    podBase.position.set(0, 0.275, 0);
    const podBed = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 2.0), lam(T.platform, 0x444850));
    podBed.position.set(0, 0.58, 0);
    const podHead = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.8, 0.4), darkMetal);
    podHead.position.set(0, 1.1, -1.0);
    const podScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), screenMat);
    podScreen.position.set(0, 1.3, -0.79);

    // Подвижный стеклянный колпак стазис-капсулы
    const canopyGroup = new THREE.Group();
    canopyGroup.position.set(0, 0.65, 0);
    const canopyGlass = new THREE.Mesh(new THREE.BoxGeometry(1.36, 1.15, 2.05), cryoGlassMat);
    canopyGlass.position.set(0, 0.575, 0);
    const canopyFrame = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.08, 2.12), hazardMat);
    canopyFrame.position.set(0, 0.04, 0);
    canopyGroup.add(canopyGlass, canopyFrame);

    podGroup.add(podBase, podBed, podHead, podScreen, canopyGroup);
    this.scene.add(podGroup);
    this.meshes.push(podGroup);

    this.playerPodCanopy = canopyGroup;

    // Временные физические стенки закрытой капсулы (блокируют выход пока колпак не поднят)
    const addPodCol = (cx, cy, cz, sx, sy, sz) => {
      const c = { min: V3(cx - sx / 2, cy, cz - sz / 2), max: V3(cx + sx / 2, cy + sy, cz + sz / 2) };
      this.colliders.push(c);
      this.podColliders.push(c);
    };
    addPodCol(-0.75, 0, 0, 0.2, 2.2, 2.4);  // левая стенка
    addPodCol(0.75, 0, 0, 0.2, 2.2, 2.4);   // правая стенка
    addPodCol(0, 0, -1.15, 1.6, 2.2, 0.2);  // задняя стенка
    addPodCol(0, 0, 1.15, 1.6, 2.2, 0.2);   // передняя стенка

    // Интерактивный триггер выхода из капсулы
    this.interactables.push({
      id: 'cryo_pod_04',
      type: 'cryo_pod',
      pos: V3(0, 1.0, 0),
      radius: 2.8,
      prompt: '[E / ПРОБЕЛ] АВАРИЙНЫЙ ВЫХОД ИЗ СТАЗИС-КАПСУЛЫ',
      usable: true,
      mesh: podGroup,
      onUse: (player, level, sfx, hud, fx) => {
        this.openPod(player, sfx, hud, fx);
      },
    });

    // Другие стазис-капсулы вдоль стен медблока
    const otherPods = [
      { x: -5.5, z: -4.0, broken: false },
      { x: -5.5, z: 0.0, broken: true },
      { x: -5.5, z: 4.0, broken: false },
      { x: 5.5, z: -4.0, broken: true },
      { x: 5.5, z: 4.0, broken: false },
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
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshBasicMaterial({ color: 0xaa1111 }));
        scr.position.set(0, 1.3, -0.79);
        g.add(scr);
      }
      this.scene.add(g); this.meshes.push(g);
      this.colliders.push({ min: V3(p.x - 0.8, 0, p.z - 1.2), max: V3(p.x + 0.8, 2.2, p.z + 1.2) });
    }

    // Медицинский стол с первым оружием и терминалом
    const medTable = this._addBox(4.0, 0, -2.5, 2.4, 0.9, 1.4, lam(T.medtable));
    const medScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), screenMat);
    medScreen.position.set(4.0, 1.8, -7.65);
    this.scene.add(medScreen); this.meshes.push(medScreen);

    // Терминал медблока (Log #1)
    const termMedObj = {
      id: 'term_medbay',
      type: 'terminal',
      pos: V3(4.0, 1.5, -7.0),
      radius: 3.2,
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
        if (hud) hud.showTerminal(termMedObj.title, termMedObj.logText);
      },
    };
    this.interactables.push(termMedObj);

    // Пикап оружия: Автомат «Сектор-9» на медицинском столе
    const rifleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.28, 0.16), lam(T.platform, 0x446688));
    rifleMesh.position.set(4.0, 1.05, -2.5);
    this.scene.add(rifleMesh); this.meshes.push(rifleMesh);

    const pickupRifleObj = {
      id: 'pickup_rifle',
      type: 'pickup_weapon',
      pos: V3(4.0, 1.0, -2.5),
      radius: 3.2,
      prompt: '[E] ВЗЯТЬ ШТУРМОВОЙ АВТОМАТ «СЕКТОР-9» И ФОНАРЬ',
      usable: true,
      mesh: rifleMesh,
      onUse: (player, level, sfx, hud) => {
        level.hasRifle = true;
        pickupRifleObj.usable = false;
        rifleMesh.visible = false;
        player.unlockWeapon(0, sfx, hud);
        player.flashlightOn = true;
        player.spotLight.intensity = 5.8;
        player.spillLight.intensity = 2.4;
        if (hud) {
          hud.setFlashlight(true);
          hud.banner('ОРУЖИЕ ПОЛУЧЕНО', 'ШТУРМОВОЙ АВТОМАТ «СЕКТОР-9» · 6.8 ММ');
          hud.styleEvent('«СЕКТОР-9» + ФОНАРЬ');
        }
        level.advanceObjective(2, sfx, hud);
      },
    };
    this.interactables.push(pickupRifleObj);

    // ========================================================================
    // 2. СЕКТОР 02: ДЕКОНТАМИНАЦИОННЫЙ ШЛЮЗ И ПОСТ ОХРАНЫ [X: -3.5..3.5, Z: 8..20, Y: 0..4.4]
    // ========================================================================
    // Пол и потолок шлюза (стык с Z=8 медблока и Z=20 магистрали)
    this._addBox(0, 0, 14, 7.0, 0.2, 12, grateMat, { collide: false, texRepeat: [2, 4] });
    this._addBox(0, 4.4, 14, 7.0, 0.4, 12, darkMetal, { collide: false });

    // Боковые стены шлюза
    this._addBox(-3.5, 0, 14, 0.6, 4.4, 12, hullMat, { texRepeat: [3, 1] });
    this._addBox(3.5, 0, 14, 0.6, 4.4, 12, hullMat, { texRepeat: [3, 1] });

    // Оранжевый пульсирующий свет шлюза
    const airlockLight = new THREE.PointLight(0xff7722, 26, 14, 2);
    airlockLight.position.set(0, 3.8, 14);
    this.scene.add(airlockLight); this.lights.push(airlockLight);

    // Гермодверь #1 (Медблок <-> Шлюз) на Z = 8.0
    this._createSlidingDoor('door_medbay', 0, 0, 8.0, 4.0, 3.2, bulkheadMat, false, 'Z');

    // Гермодверь #2 (Шлюз <-> Главный коридор) на Z = 20.0
    this._createSlidingDoor('door_airlock_exit', 0, 0, 20.0, 4.0, 3.2, bulkheadMat, false, 'Z');

    // Труп охранника и Ключ-карта Допуска LVL-1 в шлюзе
    const guardBody = this._addBox(-2.2, 0, 15.0, 0.9, 0.4, 1.4, lam(T.platform, 0x223344), { collide: false });
    const keycardMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.26), new THREE.MeshBasicMaterial({ map: T.keycard }));
    keycardMesh.position.set(-2.2, 0.48, 15.0);
    this.scene.add(keycardMesh); this.meshes.push(keycardMesh);

    const pickupKeycardObj = {
      id: 'pickup_keycard',
      type: 'pickup_keycard',
      pos: V3(-2.2, 0.5, 15.0),
      radius: 3.2,
      prompt: '[E] ВЗЯТЬ КЛЮЧ-КАРТУ ОФИЦЕРА ВЭНСА (LVL-1)',
      usable: true,
      mesh: keycardMesh,
      onUse: (player, level, sfx, hud) => {
        level.hasKeycard = true;
        pickupKeycardObj.usable = false;
        keycardMesh.visible = false;
        if (sfx) sfx.keycardBeep();
        if (hud) {
          hud.banner('КЛЮЧ-КАРТА ПОЛУЧЕНА', 'ДОСТУП УРОВНЯ 1: ОРУЖЕЙНЫЙ АРСЕНАЛ И ИНЖЕНЕРНЫЙ БЛОК');
          hud.styleEvent('КЛЮЧ-КАРТА LVL-1');
        }
        level.advanceObjective(3, sfx, hud);
      },
    };
    this.interactables.push(pickupKeycardObj);

    // ========================================================================
    // 3. СЕКТОР 03: ЦЕНТРАЛЬНАЯ МАГИСТРАЛЬ И КОРИДОРЫ [X: -38..30, Z: 20..32, Y: 0..4.4]
    // ========================================================================
    // Непрерывный пол и потолок главной магистрали (от Инженерного до Арсенала)
    this._addBox(-4.0, 0, 26, 68, 0.2, 12, grateMat, { collide: false, texRepeat: [17, 3] });
    this._addBox(-4.0, 4.4, 26, 68, 0.4, 12, darkMetal, { collide: false });

    // Восточная стена коридора (на X = 30)
    this._addBox(30, 0, 26, 0.6, 4.4, 12, hullMat);

    // Северная стена коридора (на Z = 20):
    // Западная часть: от X = -38 до X = -2.0
    this._addBox(-20.0, 0, 20, 36, 4.4, 0.6, hullMat);
    // Проем шлюза на X [-2.0, 2.0]
    // Средняя часть: от X = 2.0 до X = 18.0
    this._addBox(10.0, 0, 20, 16, 4.4, 0.6, hullMat);
    // Проем в Арсенал на X [18.0, 22.0] с перемычкой Y [3.2, 4.4]
    this._addBox(20.0, 3.2, 20, 4.0, 1.2, 0.6, hazardMat);
    // Восточная часть: от X = 22.0 до X = 30.0
    this._addBox(26.0, 0, 20, 8, 4.4, 0.6, hullMat);

    // Южная стена коридора (на Z = 32):
    // Западная часть: от X = -38 до X = -2.0
    this._addBox(-20.0, 0, 32, 36, 4.4, 0.6, hullMat);
    // Проем на Мостик на X [-2.0, 2.0] с перемычкой Y [3.2, 4.4]
    this._addBox(0.0, 3.2, 32, 4.0, 1.2, 0.6, hazardMat);
    // Восточная часть: от X = 2.0 до X = 30.0
    this._addBox(16.0, 0, 32, 28, 4.4, 0.6, hullMat);

    // Освещение центрального узла
    const hubLightE = new THREE.PointLight(0xff3322, 26, 16, 2); hubLightE.position.set(12, 3.8, 26); this.scene.add(hubLightE); this.lights.push(hubLightE);
    const hubLightW = new THREE.PointLight(0xff3322, 26, 16, 2); hubLightW.position.set(-14, 3.8, 26); this.scene.add(hubLightW); this.lights.push(hubLightW);

    // ========================================================================
    // 4. СЕКТОР 04: ОРУЖЕЙНЫЙ АРСЕНАЛ (ARMORY) [X: 16..30, Z: 6..20, Y: 0..4.4]
    // ========================================================================
    // Пол и потолок арсенала
    this._addBox(23, 0, 13, 14, 0.2, 14, platMat, { collide: false, texRepeat: [3, 3] });
    this._addBox(23, 4.4, 13, 14, 0.4, 14, darkMetal, { collide: false });

    // Стены арсенала (Север, Запад, Восток)
    this._addBox(23, 0, 6, 14, 4.4, 0.6, hullMat);
    this._addBox(16, 0, 13, 0.6, 4.4, 14, hullMat);
    this._addBox(30, 0, 13, 0.6, 4.4, 14, hullMat);

    // Дверь в Арсенал на Z = 20 (требует Ключ-карту LVL-1)
    this._createSlidingDoor('door_armory', 20, 0, 20, 4.0, 3.2, bulkheadMat, true, 'Z');

    // Освещение арсенала
    const armoryLight = new THREE.PointLight(0xffaa44, 28, 16, 2);
    armoryLight.position.set(23, 3.8, 13);
    this.scene.add(armoryLight); this.lights.push(armoryLight);

    // Оружейная стойка с обрезом «Палач»
    const rack = this._addBox(28.5, 0, 13, 0.8, 2.0, 3.2, darkMetal);
    const shotgunMesh = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.25, 0.18), lam(T.platform, 0x994422));
    shotgunMesh.position.set(27.8, 1.2, 13);
    this.scene.add(shotgunMesh); this.meshes.push(shotgunMesh);

    const pickupShotgunObj = {
      id: 'pickup_shotgun',
      type: 'pickup_weapon',
      pos: V3(27.8, 1.2, 13),
      radius: 3.2,
      prompt: '[E] ВЗЯТЬ ДВУСТВОЛЬНЫЙ ОБРЕЗ «ПАЛАЧ» (12 КАЛИБР)',
      usable: true,
      mesh: shotgunMesh,
      onUse: (player, level, sfx, hud) => {
        level.hasShotgun = true;
        pickupShotgunObj.usable = false;
        shotgunMesh.visible = false;
        player.unlockWeapon(1, sfx, hud);
        if (hud) {
          hud.banner('ТЯЖЕЛОЕ ОРУЖИЕ НАЙДЕНО', 'ДВУСТВОЛЬНЫЙ ОБРЕЗ «ПАЛАЧ» · 12 КАЛИБР');
          hud.styleEvent('«ПАЛАЧ» В РУКАХ!');
        }
        level.advanceObjective(4, sfx, hud);
      },
    };
    this.interactables.push(pickupShotgunObj);

    // Терминал арсенала (Log #2)
    const termArmoryObj = {
      id: 'term_armory',
      type: 'terminal',
      pos: V3(23.0, 1.5, 6.8),
      radius: 3.2,
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
        if (hud) hud.showTerminal(termArmoryObj.title, termArmoryObj.logText);
      },
    };
    this.interactables.push(termArmoryObj);

    // ========================================================================
    // 5. СЕКТОР 05: ИНЖЕНЕРНЫЙ СЕКТОР И РЕАКТОР [X: -56..-38, Z: 16..36, Y: 0..6.0]
    // ========================================================================
    // Пол и потолок инженерного зала (высокий потолок 6.0м)
    this._addBox(-47, 0, 26, 18, 0.2, 20, grateMat, { collide: false, texRepeat: [4, 5] });
    this._addBox(-47, 6.0, 26, 18, 0.4, 20, darkMetal, { collide: false });

    // Стены инженерного зала (Запад, Север, Юг)
    this._addBox(-56, 0, 26, 0.6, 6.0, 20, hullMat);
    this._addBox(-47, 0, 16, 18, 6.0, 0.6, hullMat);
    this._addBox(-47, 0, 36, 18, 6.0, 0.6, hullMat);

    // Восточная стена на X = -38 (с дверным проемом шириной 4.0м на Z = 26)
    this._addBox(-38, 0, 20, 0.6, 6.0, 8, hullMat);
    this._addBox(-38, 0, 32, 0.6, 6.0, 8, hullMat);
    this._addBox(-38, 3.2, 26, 0.6, 2.8, 4.0, hazardMat);

    // Дверь в Инженерный отсек на X = -38 (требует Keycard LVL-1)
    this._createSlidingDoor('door_engineering', -38, 0, 26, 4.0, 3.2, bulkheadMat, true, 'X');

    // Массивный гудящий реактор в центре зала
    const reactorCylinder = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 5.8, 16), darkMetal);
    reactorCylinder.position.set(-47, 2.9, 26);
    this.scene.add(reactorCylinder); this.meshes.push(reactorCylinder);
    this.colliders.push({ min: V3(-49.8, 0, 23.2), max: V3(-44.2, 6.0, 28.8) });

    const coreLight = new THREE.PointLight(0xff2211, 40, 22, 2);
    coreLight.position.set(-47, 3.2, 26);
    this.scene.add(coreLight); this.lights.push(coreLight);
    this.reactorLight = coreLight;

    // Консоль перезапуска реактора на западной стене
    const reactConsole = this._addBox(-54.5, 0, 26, 1.4, 1.2, 2.0, darkMetal);
    const reactScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), screenMat);
    reactScreen.position.set(-53.7, 1.6, 26);
    reactScreen.rotation.y = Math.PI / 2;
    this.scene.add(reactScreen); this.meshes.push(reactScreen);

    const reactSwitchObj = {
      id: 'reactor_switch',
      type: 'reactor_switch',
      pos: V3(-53.7, 1.2, 26),
      radius: 3.2,
      prompt: '[E] ПЕРЕЗАПУСТИТЬ ТУРБИНУ РЕАКТОРА',
      usable: true,
      mesh: reactConsole,
      onUse: (player, level, sfx, hud, fx) => {
        if (level.reactorPowered) return;
        level.reactorPowered = true;
        reactSwitchObj.usable = false;

        // Переключение света реактора в ярко-синий плазменный режим
        level.reactorLight.color.setHex(0x3399ff);
        level.reactorLight.intensity = 60;

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
    };
    this.interactables.push(reactSwitchObj);

    // ========================================================================
    // 6. СЕКТОР 06: КОМАНДНЫЙ МОСТИК И ЧЕЛНОК (BRIDGE) [X: -10..10, Z: 32..54, Y: 0..5.0]
    // ========================================================================
    // Пол и потолок мостика
    this._addBox(0, 0, 43, 20, 0.2, 22, grateMat, { collide: false, texRepeat: [4, 5] });
    this._addBox(0, 5.0, 43, 20, 0.4, 22, darkMetal, { collide: false });

    // Боковые стены мостика (Запад, Восток)
    this._addBox(-10, 0, 43, 0.6, 5.0, 22, hullMat);
    this._addBox(10, 0, 43, 0.6, 5.0, 22, hullMat);

    // Северная стена на Z = 32 (с проемом шириной 4.0м на X = 0)
    this._addBox(-6.0, 0, 32, 8.0, 5.0, 0.6, hullMat);
    this._addBox(6.0, 0, 32, 8.0, 5.0, 0.6, hullMat);

    // Гермодверь на мостик на Z = 32 (открывается после перезапуска реактора)
    this._createSlidingDoor('door_bridge', 0, 0, 32, 4.0, 3.2, bulkheadMat, true, 'Z', true);

    // Панорамный иллюминатор мостика с видом в открытый космос (на Z = 54)
    const windowFrame = this._addBox(0, 0, 54, 18, 1.0, 0.6, darkMetal);
    const windowTop = this._addBox(0, 4.2, 54, 18, 0.8, 0.6, darkMetal);
    const windowL = this._addBox(-8.8, 1.0, 54, 0.6, 3.2, 0.6, darkMetal);
    const windowR = this._addBox(8.8, 1.0, 54, 0.6, 3.2, 0.6, darkMetal);

    // Консоли управления мостика
    const bridgeNav = this._addBox(0, 0, 48, 4.4, 1.1, 1.6, darkMetal);
    const bridgeScreen = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), screenMat);
    bridgeScreen.position.set(0, 1.6, 48.85);
    this.scene.add(bridgeScreen); this.meshes.push(bridgeScreen);

    const bridgeLight = new THREE.PointLight(0x4488ff, 34, 18, 2);
    bridgeLight.position.set(0, 4.2, 45);
    this.scene.add(bridgeLight); this.lights.push(bridgeLight);

    // Консоль запуска спасательного челнока (ФИНАЛ ИГРЫ)
    const escapeShuttleObj = {
      id: 'escape_shuttle',
      type: 'escape_switch',
      pos: V3(0, 1.2, 48.0),
      radius: 3.2,
      prompt: '[E] ЗАПУСТИТЬ СПАСАТЕЛЬНЫЙ ЧЕЛНОК «СПАС-1»',
      usable: true,
      mesh: bridgeNav,
      onUse: (player, level, sfx, hud) => {
        escapeShuttleObj.usable = false;
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
    };
    this.interactables.push(escapeShuttleObj);

    // Физические контейнеры и ящики
    if (this.propsMgr) {
      const shipCrates = [
        [20, 0, 10, 1.4], [21.5, 0, 10, 1.1], [20.7, 1.4, 10, 0.9],
        [25, 0, 17, 1.5], [25, 1.5, 17, 1.1],
        [-8, 0, 24, 1.3], [8, 0, 28, 1.2], [-16, 0, 27, 1.4],
        [-40, 0, 20, 1.6], [-52, 0, 30, 1.5], [-52, 1.5, 30, 1.0],
      ];
      for (const [x, y, z, s] of shipCrates) {
        this.propsMgr.addCrate(x, y, z, s, s, s);
      }
    }
  }

  // Открытие стазис-капсулы
  openPod(player, sfx, hud, fx) {
    if (this.podOpened) return;
    this.podOpened = true;

    // Удаляем временные стенки капсулы, чтобы игрок мог свободно выйти
    for (const c of this.podColliders) {
      const idx = this.colliders.indexOf(c);
      if (idx >= 0) this.colliders.splice(idx, 1);
    }
    this.podColliders.length = 0;

    const podItem = this.interactables.find(i => i.id === 'cryo_pod_04');
    if (podItem) podItem.usable = false;

    if (sfx) {
      sfx.cryoHiss();
      sfx.heartbeat();
    }
    if (fx) {
      for (let i = 0; i < 10; i++) {
        fx.steam(V3(rand(-0.6, 0.6), 0.7, rand(-0.9, 0.9)), V3(rand(-0.5, 0.5), rand(1.2, 2.4), rand(-0.5, 0.5)));
      }
    }

    if (this.playerPodCanopy) {
      const startY = this.playerPodCanopy.position.y;
      let t = 0;
      const liftInterval = setInterval(() => {
        t += 0.05;
        this.playerPodCanopy.position.y = startY + Math.min(1, t) * 1.8;
        if (t >= 1) clearInterval(liftInterval);
      }, 30);
    }

    this.advanceObjective(1, sfx, hud);
  }

  // Создание раздвижной гермодвери (створки шириной halfW перекрывают весь проем с 0 зазоров)
  _createSlidingDoor(id, cx, baseY, cz, width, height, mat, locked = false, axis = 'Z', requiresReactor = false) {
    const doorGroup = new THREE.Group();
    doorGroup.position.set(cx, baseY, cz);

    const halfW = width / 2 + 0.1; // небольшой нахлест для 100% герметичности без щелей
    const depth = 0.45;
    const gL = new THREE.BoxGeometry(axis === 'X' ? depth : halfW, height, axis === 'X' ? halfW : depth);
    const gR = gL.clone();

    const doorL = new THREE.Mesh(gL, mat);
    const doorR = new THREE.Mesh(gR, mat);

    if (axis === 'X') {
      doorL.position.set(0, height / 2, -width / 4);
      doorR.position.set(0, height / 2, width / 4);
    } else {
      doorL.position.set(-width / 4, height / 2, 0);
      doorR.position.set(width / 4, height / 2, 0);
    }

    doorGroup.add(doorL, doorR);
    this.scene.add(doorGroup);
    this.meshes.push(doorGroup);

    const collider = {
      min: V3(cx - (axis === 'X' ? depth / 2 : width / 2), baseY, cz - (axis === 'X' ? width / 2 : depth / 2)),
      max: V3(cx + (axis === 'X' ? depth / 2 : width / 2), baseY + height, cz + (axis === 'X' ? width / 2 : depth / 2)),
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
      radius: 3.5,
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

  // Поиск ближайшего интерактивного объекта в луче взгляда игрока (щедрый и удобный радиус)
  checkInteraction(playerPos, cameraFwd, maxDist = 3.6) {
    if (!this.podOpened) {
      const pod = this.interactables.find(i => i.id === 'cryo_pod_04');
      if (pod && pod.usable) return pod;
    }

    let best = null;
    let bestScore = -999;

    for (const item of this.interactables) {
      if (!item.usable) continue;
      const dx = item.pos.x - playerPos.x;
      const dy = item.pos.y - playerPos.y;
      const dz = item.pos.z - playerPos.z;
      const dist = Math.hypot(dx, dy, dz);

      const maxR = item.radius || maxDist;
      if (dist <= maxR) {
        // Угол взгляда
        const dot = (dx * cameraFwd.x + dy * cameraFwd.y + dz * cameraFwd.z) / (dist || 1);
        if (dot > 0.15 || dist < 1.8) {
          const score = (dot * 2.0) - (dist * 0.5);
          if (score > bestScore) {
            bestScore = score;
            best = item;
          }
        }
      }
    }
    return best;
  }

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
    return normal ? { dist: bestT, point: o.clone().addScaledVector(d, bestT), normal } : null;
  }

  populateEnemies(enemyMgr) {
    if (!enemyMgr) return;
    enemyMgr.spawn('zombie', 0, 16, 1, true);    // Зомби в шлюзе
    enemyMgr.spawn('minion', 8, 26, 1, true);    // Скороход в восточном коридоре
    enemyMgr.spawn('zombie', -14, 26, 1, true);  // Зомби в западном коридоре
    enemyMgr.spawn('rogue', 23, 14, 1, true);    // Резак в арсенале
    enemyMgr.spawn('warrior', -47, 26, 1, true); // Клещ-мутант в реакторном зале
    enemyMgr.spawn('zombie', -42, 20, 1, true);  // Зомби-инженер
    enemyMgr.spawn('mage', 0, 44, 1, true);      // Летающий Плод на мостике
    enemyMgr.spawn('rogue', -5, 48, 1, true);    // Охранный Резак на мостике
  }

  update(dt, time, playerPos) {
    if (this.reactorLight) {
      if (this.reactorPowered) {
        this.reactorLight.intensity = 50 + Math.sin(time * 6) * 12;
      } else {
        this.reactorLight.intensity = 24 + Math.sin(time * 3) * 8;
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
    this.podColliders.length = 0;
    this.interactables.length = 0;
    this.doors.length = 0;
  }
}
