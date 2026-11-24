// r26 — boot, loop, kamera, mode, staging screenshot.
// Satu file komposer: merakit renderer, kota, mobil, orang, dan semua sistem.
import * as THREE from 'three';
import { createPlan, buildCity, districtAt, streetAt, loadGLB, normalizeGLB } from './city.js';
import { makeRenderer, makeLights, makeSkyDome, applyEnvironment, makeComposer, resizeComposer, blobShadow, canvasTexture } from './fx.js';
import { CAR_DEFS, makeCar, attachCarMesh, loadCarModel, stepCarPhysics, makeTrafficCar, attachTraffic, stepTraffic, makePoliceInterceptor, stepPolice } from './vehicles.js';
import { spawnPeople, spawnShopRegulars, stepPeople, makeNameTag, makePortrait, LINES, loadPersonModel } from './people.js';
import { WEAPONS, RANKS, MISSIONS, RADIO, makeState, rankOf, addMoney, addRP, notice, addHeat, decayHeat, makePlayer, attachPlayerMesh, stepPlayerOnFoot, makeCombat, shoot, updateCombat, reloadWeapon, missionObjective, stepMission, completeMission, startRace, UNITS, dispatchRows, updateHUD, drawMinimap, saveGame, loadGame, stepRadio } from './systems.js';
import { GAME_SEED, clamp, lerp, rupiah } from './rng.js';

const $ = (id) => document.getElementById(id);
const ui = {};
function collectUI() {
  for (const id of ['hud', 'race-panel', 'race-name', 'race-sub', 'gate-now', 'race-time', 'money-box', 'money', 'xp-bar', 'xp-fill', 'xp-line', 'wanted', 'weapon-panel', 'weapon-main', 'weapon-icon', 'weapon-name', 'weapon-ammo', 'weapon-slots', 'crew-chip', 'crew-key', 'crew-name', 'crew-role', 'dispatch-panel', 'dispatch-rows', 'mission-panel', 'mission-title', 'mission-step', 'mission-next', 'district', 'district-name', 'district-street', 'minimap-wrap', 'minimap', 'objective-line', 'objective-dist', 'bars', 'health-fill', 'armour-fill', 'dialogue', 'portrait', 'dialogue-name', 'dialogue-text', 'speedo', 'speedo-arc', 'speedo-num', 'speedo-unit', 'speedo-car', 'condition', 'condition-bar', 'condition-fill', 'condition-num', 'radio-line', 'radio-text', 'notices', 'crosshair', 'title-screen', 'title-inner', 'title-menu', 'pause-screen', 'stats-panel', 'stats-grid', 'district-bars', 'loading', 'loading-fill', 'loading-text']) {
    ui[id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = $(id);
  }
  ui.minimapCtx = ui.minimap.getContext('2d');
  ui.portraitCtx = ui.portrait.getContext('2d');
  // Alias: id HTML-nya speedo-*, tapi updateHUD memakai speedNum/speedCar.
  ui.speedNum = ui.speedoNum;
  ui.speedCar = ui.speedoCar;
}

// Input: held/pressed Sets dengan down()/hit(), seperti API cap tool.
const input = {
  held: new Set(), pressed: new Set(),
  down(code) { return this.held.has(code); },
  hit(code) { return this.pressed.has(code); },
  clearPressed() { this.pressed.clear(); },
};
window.addEventListener('keydown', (e) => {
  if (!e.repeat) input.pressed.add(e.code);
  input.held.add(e.code);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => input.held.delete(e.code));
window.addEventListener('mousedown', (e) => { if (e.button === 0) { input.pressed.add('Mouse0'); input.held.add('Mouse0'); } });
window.addEventListener('mouseup', (e) => { if (e.button === 0) input.held.delete('Mouse0'); });

const G = {
  mode: 'loading', seed: GAME_SEED, plan: null, scene: null, camera: null,
  renderer: null, composer: null, state: makeState(), player: null, car: null,
  traffic: [], police: null, policeActive: false, people: [], dimas: null, regulars: [],
  city: null, combat: null, camYaw: 0, camPos: new THREE.Vector3(), camTarget: new THREE.Vector3(),
  t: 0, shotMode: null, ready: null, resolveReady: null, dialogIdx: 0, dialogT: 0,
};
G.ready = new Promise((res) => { G.resolveReady = res; });

function setLoading(p, msg) {
  ui.loadingFill.style.width = `${Math.round(p * 100)}%`;
  ui.loadingText.textContent = msg;
}

async function boot() {
  collectUI();
  const params = new URLSearchParams(location.search);
  G.shotMode = params.get('shot');
  const canvas = $('scene');
  const renderer = makeRenderer(canvas);
  if (G.shotMode) renderer.setPixelRatio(1);
  G.renderer = renderer;
  const scene = new THREE.Scene();
  G.scene = scene;
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
  G.camera = camera;
  camera.position.set(-30, 8, 24);
  camera.lookAt(0, 2, 0);
  makeLights(scene);
  setLoading(0.08, 'Memuat langit senja asli…');
  const envOk = await applyEnvironment(scene, renderer, './tex6-env.jpg');
  if (!envOk) makeSkyDome(scene);
  setLoading(0.16, 'Membangun kota…');
  const plan = createPlan(G.seed);
  G.plan = plan;
  const city = await buildCity(scene, renderer, plan, (p, msg) => setLoading(0.16 + p * 0.4, msg));
  G.city = city;
  console.log('[r26] GLB dimuat:', city.loaded.glb.join(', ') || '(tidak ada)');
  console.log('[r26] fallback primitif:', city.loaded.fallback.join(', ') || '(tidak ada)');
  G.combat = makeCombat(scene);
  setLoading(0.62, 'Menyiapkan mobil rally…');
  const player = makePlayer(22, 6);
  G.player = player;
  const rallyDef = CAR_DEFS[0];
  const car = makeCar(renderer, rallyDef, -40, -3.4, Math.PI / 2);
  G.car = car;
  const rallyModel = await loadCarModel(renderer, rallyDef);
  attachCarMesh(scene, car, rallyModel);
  console.log('[r26] mobil pemain GLB:', rallyModel.glb ? 'rally-car.glb' : 'FALLBACK primitif');
  const pMesh = await loadPersonModel(renderer, 'character-a');
  const pGroup = pMesh || (() => { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.7, 0.3), new THREE.MeshStandardMaterial({ color: 0x4f7dd9, roughness: 0.9 })); m.position.y = 0.85; g.add(m); return g; })();
  attachPlayerMesh(scene, player, pGroup, blobShadow(0.55, 0.35));
  player.mesh.visible = false;
  setLoading(0.74, 'Mengisi lalu lintas…');
  const trafficDefs = CAR_DEFS.slice(1, 6);
  for (let i = 0; i < 8; i++) {
    const dir = i % 2 === 0 ? Math.PI / 2 : -Math.PI / 2;
    const lane = dir > 0 ? 3.4 : -3.4;
    const tc = makeTrafficCar(renderer, scene, trafficDefs, -150 + i * 42, lane, dir, 10 + (i % 4) * 2);
    await attachTraffic(scene, renderer, tc);
    G.traffic.push(tc);
  }
  setLoading(0.84, 'Mengundang warga…');
  G.people = await spawnPeople(scene, renderer, plan, 14);
  G.dimas = G.people.find((p) => p.name === 'Dimas') || G.people[0];
  const tag = makeNameTag('Dimas');
  tag.position.y = 2.3;
  G.dimas.group.add(tag);
  G.dimas.tag = tag;
  tag.visible = false;
  G.regulars = await spawnShopRegulars(scene, renderer, [
    { name: 'Ratna', file: 'character-c', x: 19.8, z: 7.4, rot: Math.PI },
    { name: 'Agus', file: 'character-d', x: 24.8, z: 7.2, rot: Math.PI },
    { name: 'Hendra', file: 'character-e', x: 26.6, z: 7.9, rot: Math.PI },
  ]);
  setLoading(0.94, 'Menyalakan HUD…');
  bindMenus();
  startRace(G.state, city.gates);
  setMode('title');
  ui.loading.style.display = 'none';
  setLoading(1, 'Siap.');
  if (G.shotMode) await stageShot(G.shotMode);
  G.resolveReady(true);
  console.log('[r26] boot selesai, mode:', G.mode, 'shot:', G.shotMode || '-');
}

// ---------------------------------------------------------------- modes
function setMode(mode) {
  G.mode = mode;
  ui.titleScreen.classList.toggle('hidden', mode !== 'title');
  ui.pauseScreen.classList.toggle('hidden', mode !== 'pause');
  ui.hud.classList.toggle('hidden', mode === 'title');
  ui.dialogue.classList.toggle('hidden', mode !== 'dialogue');
  ui.crewChip.classList.toggle('hidden', !(mode === 'play' && G.player.inCar));
  ui.dispatchPanel.classList.toggle('hidden', !(mode === 'play' && G.state.wanted > 0));
  if (mode === 'pause') renderStats();
}
function bindMenus() {
  document.querySelectorAll('#title-menu [data-act]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.act === 'new') { resetGame(); setMode('play'); enterCar(); }
    if (b.dataset.act === 'continue') { if (!loadGame(G.state, 1)) resetGame(); setMode('play'); enterCar(); }
  }));
  document.querySelectorAll('#slots [data-slot]').forEach((b) => b.addEventListener('click', () => {
    if (loadGame(G.state, Number(b.dataset.slot))) { setMode('play'); enterCar(); }
    else notice(G.state, `SLOT ${b.dataset.slot} masih kosong.`, 'info');
  }));
  document.querySelectorAll('#pause-menu [data-act]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.act === 'resume') setMode('play');
    if (b.dataset.act === 'save') { saveGame(G.state, 1); renderStats(); }
    if (b.dataset.act === 'quit') setMode('title');
    if (b.dataset.act === 'garage') notice(G.state, 'Garage Shop: Rajawali GT sudah milikmu. Bengkel buka setelah misi 2.', 'info');
  }));
  window.addEventListener('resize', () => {
    G.camera.aspect = window.innerWidth / window.innerHeight;
    G.camera.updateProjectionMatrix();
    resizeComposer(G.composer, G.renderer);
  });
}
function resetGame() {
  const keep = G.state;
  Object.assign(G.state, makeState());
  G.state.money = keep.money; G.state.earned = keep.earned;
  G.player.pos.set(22, 0, 6); G.player.inCar = false;
  G.car.pos.set(-40, 0, -3.4); G.car.heading = Math.PI / 2; G.car.speed = 0;
  startRace(G.state, G.city.gates);
}
function enterCar() {
  G.player.inCar = true;
  G.player.mesh.visible = false;
  G.player.car = G.car;
  G.camYaw = G.car.heading;
}
function exitCar() {
  G.player.inCar = false;
  G.player.mesh.visible = true;
  const s = Math.sin(G.car.heading), c = Math.cos(G.car.heading);
  G.player.pos.set(G.car.pos.x - c * 2.4, 0, G.car.pos.z + s * 2.4);
  G.player.heading = G.car.heading;
  G.player.car = null;
}
function renderStats() {
  const s = G.state;
  ui.statsGrid.innerHTML = [
    ['Uang', rupiah(s.money)], ['Pangkat', RANKS[s.rank].name], ['Misi selesai', s.jobs],
    ['Mobil', s.carsOwned.join(', ')], ['Kalah lawan', s.kills], ['Total didapat', rupiah(s.earned)],
    ['Koin', s.coins], ['Bintang dicari', `${s.wanted} ★`],
  ].map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('');
  ui.districtBars.innerHTML = '<div class="panel-title">PETA — BERDIRI DI DISTRIK</div>' + Object.entries(s.standing).map(([d, v]) => `<div class="db"><span>${d}</span><i><b style="width:${v}%"></b></i><span>${v}</span></div>`).join('');
}

// ---------------------------------------------------------------- camera
function snapCamera() {
  updateCamera(1);
  G.camera.position.copy(G.camPos);
  G.camera.lookAt(G.camTarget);
}
G.snapCamera = snapCamera;
function updateCamera(dt) {
  const cam = G.camera;
  if (G.mode === 'title') {
    const a = G.t * 0.045;
    G.camPos.set(Math.sin(a) * 58, 16 + Math.sin(a * 0.6) * 4, -20 + Math.cos(a) * 42);
    G.camTarget.set(0, 4, -6);
  } else if (G.player.inCar) {
    const car = G.car;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const bx = car.pos.x - fx * 11.5, bz = car.pos.z - fz * 11.5;
    G.camPos.set(bx, 4.4, bz);
    G.camTarget.set(car.pos.x + fx * 9, 1.6, car.pos.z + fz * 9);
  } else {
    const p = G.player;
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    G.camPos.set(p.pos.x - fx * 5.2, 2.8, p.pos.z - fz * 5.2);
    G.camTarget.set(p.pos.x + fx * 4, 1.5, p.pos.z + fz * 4);
  }
  const k = Math.min(1, dt * 4.5);
  cam.position.lerp(G.camPos, k);
  const look = G.camTarget.clone();
  cam.lookAt(look);
  cam.snap = snapCamera;
}

// ---------------------------------------------------------------- staging
async function stageShot(name) {
  const s = G.state;
  if (name === 's1') {
    resetGame();
    setMode('play');
    enterCar();
    G.car.pos.set(-40, 0, -3.4); G.car.heading = Math.PI / 2; G.car.speed = 35;
    G.camYaw = Math.PI / 2;
    s.racing = true; s.raceTime = 5.7; s.gatesPassed = 0;
    s.wanted = 2; s.heat = 28;
    await spawnPoliceAt(-44, -8.5);
    startDialogue('Dimas', LINES.Dimas[0]);
    snapCamera();
  } else if (name === 's2') {
    resetGame();
    setMode('dialogue');
    s.racing = false;
    exitCar();
    G.player.pos.set(20.5, 0, 2.0); G.player.heading = 0;
    G.player.mesh.visible = true;
    G.dimas.group.position.set(22.5, 0, 7.6);
    G.dimas.group.rotation.y = Math.PI + 0.35;
    G.dimas.x = 22.5; G.dimas.z = 7.6; G.dimas.homeX = 22.5; G.dimas.homeZ = 7.6;
    G.dimas.tag.visible = true;
    G.dimas.group.children.forEach((c) => { if (c.isSprite) c.visible = true; });
    startDialogue('Dimas', LINES.Dimas[1]);
    G.camYaw = 0;
    snapCamera();
  } else if (name === 's3') {
    resetGame();
    setMode('pause');
  } else if (name === 's4') {
    setMode('title');
    // G.t=112 -> sudut orbit a=5.04: kamera di BARAT kota, melihat ke TIMUR
    // (+X) tepat ke arah matahari terbenam — langit senja emas memenuhi frame.
    G.t = 112;
    snapCamera();
  }
  // Satu langkah simulasi supaya HUD + minimap terisi, lalu BEKU: komposisi
  // shot tidak boleh hanyut sebelum screenshot (mobil 35 m/s + polisi kejar).
  fixedStep(1 / 60);
  if (name === 's2') {
    // S2 bersih: panel balapan disembunyikan, mobil lalu lintas di dekat teras
    // disembunyikan supaya Dimas + meja kopi tidak tertutup.
    ui.racePanel.classList.add('hidden');
    for (const tc of G.traffic) if (tc.mesh && Math.hypot(tc.pos.x - 22, tc.pos.z - 2) < 16) tc.mesh.visible = false;
    // stepPeople di fixedStep tadi mengembalikan Dimas ke posisi spawn acak —
    // kembalikan ke posisi staging (depan coffee shop, menghadap pemain).
    G.dimas.group.position.set(22.5, 0, 7.6);
    G.dimas.group.rotation.y = Math.PI + 0.35;
  }
  G.frozen = true;
  console.log('[r26] staged:', name);
}
function startDialogue(name, text) {
  G.dialogIdx = 0;
  ui.dialogueName.textContent = name;
  ui.dialogueText.textContent = text;
  const tex = makePortrait(name);
  ui.portraitCtx.clearRect(0, 0, 64, 64);
  ui.portraitCtx.drawImage(tex.image, 0, 0, 64, 64);
  ui.dialogue.classList.remove('hidden');
}
async function spawnPoliceAt(x, z) {
  if (G._policeLoading) return;
  G._policeLoading = true;
  if (!G.police) G.police = await makePoliceInterceptor(G.scene, G.renderer, x, z);
  G.police.pos.set(x, 0, z);
  G.police.heading = Math.PI / 2;
  G.policeActive = true;
}

// ---------------------------------------------------------------- fixed step
function fixedStep(dt) {
  G.t += dt;
  const s = G.state;
  if (G.mode === 'play' || G.mode === 'dialogue') {
    if (input.hit('Escape')) { setMode('pause'); input.clearPressed(); return; }
    if (G.player.inCar) {
      stepCarPhysics(G.car, input, dt, G.plan.colliders);
      if (input.hit('KeyE')) exitCar();
      if (input.hit('KeyQ')) stepRadio(s, 25, ui);
    } else {
      stepPlayerOnFoot(G.player, input, dt, G.plan.colliders, G.camYaw);
      if (input.hit('KeyE')) {
        const d = Math.hypot(G.player.pos.x - G.car.pos.x, G.player.pos.z - G.car.pos.z);
        if (d < 4.5) enterCar();
        else {
          const dd = Math.hypot(G.player.pos.x - G.dimas.group.position.x, G.player.pos.z - G.dimas.group.position.z);
          if (dd < 4) { setMode('dialogue'); startDialogue('Dimas', LINES.Dimas[2]); }
        }
      }
    }
    for (let i = 1; i <= 5; i++) if (input.hit(`Digit${i}`)) s.weapon = i - 1;
    if (input.hit('KeyR')) reloadWeapon(s);
    if ((input.hit('Mouse0') || input.held.has('Mouse0')) && !G.player.inCar) {
      const dir = new THREE.Vector3();
      G.camera.getWorldDirection(dir);
      const origin = G.camera.position.clone();
      shoot(G.combat, s, origin, dir, G.people, G.traffic);
    }
    if (s.racing) s.raceTime += dt;
    stepMission(s, G.player.inCar ? G.car.pos : G.player.pos, G.city.gates, G.dimas.group.position, new THREE.Vector3(-150, 0, -20));
    decayHeat(s, dt);
    for (const tc of G.traffic) stepTraffic(tc, dt, G.player.inCar ? G.car.pos : G.player.pos);
    if (s.wanted >= 1 && !G.policeActive) spawnPoliceAt(G.car.pos.x - 14, G.car.pos.z);
    if (G.policeActive && G.police) stepPolice(G.police, G.player.inCar ? G.car.pos : G.player.pos, dt, G.t);
    stepPeople(G.people, dt, G.t);
    updateCombat(G.combat, dt);
    stepRadio(s, dt, ui);
    for (const g of G.city.gates) if (!g.passed) g.beamMat.emissiveIntensity = 1.1 + Math.sin(G.t * 4) * 0.45;
    const rows = dispatchRows(s, G.player.inCar ? G.car.pos : G.player.pos, G.police ? G.police.pos : null);
    ui.dispatchRows.innerHTML = rows.map((r) => `<div class="u"><span>${r.call}</span><span class="tactic">${r.tactic}</span><span class="dist">${r.dist} m</span></div>`).join('');
    ui.dispatchPanel.classList.toggle('hidden', s.wanted === 0);
    const pp = G.player.inCar ? G.car.pos : G.player.pos;
    const d = districtAt(G.plan, pp.x, pp.z);
    const speedKmh = Math.abs(G.player.inCar ? G.car.speed * 3.6 : 0);
    try { updateHUD(s, ui, G.player, G.player.inCar ? G.car : null, speedKmh, d.name, streetAt(G.plan, pp.x, pp.z)); } catch (e) { if (!G._hudErr) { G._hudErr = 1; console.error('[r26] updateHUD gagal:', e.message); } }
    const target = s.mission === 0 ? G.city.gates.find((g) => !g.passed) : s.mission === 1 ? G.dimas.group.position : new THREE.Vector3(-150, 0, -20);
    const tp = target ? (target.x !== undefined ? target : new THREE.Vector3(target.x, 0, target.z)) : null;
    const tdist = tp ? Math.round(Math.hypot(pp.x - tp.x, pp.z - tp.z)) : 0;
    ui.objectiveDist.textContent = `${tdist} m`;
    drawMinimap(ui.minimapCtx, G.plan, pp, G.player.inCar ? G.car.heading : G.player.heading, G.policeActive && G.police ? G.police.pos : null, G.city.gates, tp);
    G.camYaw = G.player.inCar ? G.car.heading : G.player.heading;
  } else if (G.mode === 'title') {
    for (const tc of G.traffic) stepTraffic(tc, dt, G.car.pos);
    stepPeople(G.people, dt, G.t);
  }
  input.clearPressed();
}

// ---------------------------------------------------------------- loop + API
let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.mode !== 'pause' && !G.frozen) {
    acc += dt;
    let n = 0;
    while (acc >= 1 / 60 && n < 4) { fixedStep(1 / 60); acc -= 1 / 60; n++; }
    if (n === 4) acc = 0;
    updateCamera(dt);
  }
  G.composer.render();
}
window.__game = {
  fixedStep, ready: G.ready, game: G,
  stage: stageShot,
  freeze() { G.frozen = true; },
  get mode() { return G.mode; },
};
window.addEventListener('error', (e) => { console.error('[r26] window error:', e.message); });
boot().then(() => {
  G.composer = makeComposer(G.renderer, G.scene, G.camera);
  requestAnimationFrame(frame);
}).catch((err) => {
  console.error('[r26] boot gagal:', err);
  setLoading(1, 'Gagal memuat: ' + err.message);
});

