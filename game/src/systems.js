// r26 — systems: missions, wanted + dispatch, combat, respect,
// save, HUD, minimap, radio. Semua angka mengikuti pola pemenang (top-3).
import * as THREE from 'three';
import { clamp, lerp, rupiah } from './rng.js';
import { makeExplosion, updateExplosion, removeExplosion } from './fx.js';

export const WEAPONS = [
  { key: '1', name: 'Tangan Kosong', short: 'FISTS', dmg: 14, interval: 0.38, range: 2.2, clip: Infinity, ammo: Infinity, reserve: Infinity, price: 0 },
  { key: '2', name: 'Pistol Kancil 9', short: 'PISTOL', dmg: 24, interval: 0.26, range: 90, clip: 12, ammo: 12, reserve: 36, price: 450000 },
  { key: '3', name: 'SMG Sanca', short: 'SMG', dmg: 15, interval: 0.085, range: 80, clip: 30, ammo: 30, reserve: 120, price: 1400000 },
  { key: '4', name: 'Shotgun Ombak', short: 'SHOTGUN', dmg: 13, pellets: 8, interval: 0.85, range: 38, clip: 6, ammo: 6, reserve: 24, price: 1900000 },
  { key: '5', name: 'Rifle Rajawali', short: 'RIFLE', dmg: 31, interval: 0.12, range: 150, clip: 30, ammo: 30, reserve: 120, price: 3600000 },
];
export const RANKS = [
  { name: 'Pemula', rp: 0 },
  { name: 'Jalanan', rp: 200 },
  { name: 'Pahlawan Pantai', rp: 600 },
  { name: 'Raja Senja', rp: 1200 },
  { name: 'Legenda Pantai', rp: 2200 },
];
export const WANTED_HEAT = [0, 10, 28, 60, 110, 180];
export const MISSIONS = [
  { id: 'race', title: 'BALAPAN SENJA', step: 'Lewati semua 5 gate di Jl. Pantai Senja', next: 'Berikutnya: ketemu Dimas di coffee shop', reward: 450000, rp: 120 },
  { id: 'talk', title: 'KETEMU DIMAS', step: 'Temui Dimas di depan coffee shop', next: 'Berikutnya: antar paket ke dermaga', reward: 150000, rp: 60 },
  { id: 'deliver', title: 'ANTAR PAKET', step: 'Antar paket ke ujung dermaga barat', next: 'Berikutnya: balapan ulang, atau jalan-jalan', reward: 300000, rp: 90 },
];
export const RADIO = [
  'Gelombang Dangdut 98.7 · Dusk for Two — DJ Yuyun',
  'Gelombang Dangdut 98.7 · Ombak Rindu — Sari Melati',
  'Radio Pantai 101.2 · Senja di Dermaga — The Kancil',
  'Radio Pantai 101.2 · Kopi Pahit — Budi Rock',
];

export function makeState() {
  return {
    money: 9870000, xp: 1900, rp: 1900, rank: 2,
    health: 100, armour: 60, kills: 0, jobs: 0, earned: 9870000, coins: 12,
    wanted: 0, heat: 0, weapon: 1, lastShot: 0,
    mission: 0, missionStep: 0, gatesPassed: 0, raceTime: 0, racing: false,
    standing: { 'Pantai Senja': 64, 'Kampung Nelayan': 42, 'Kota Lama': 31 },
    notices: [], radioIdx: 0, radioT: 0,
    carsOwned: ['Rajawali GT'],
  };
}
export function rankOf(rp) {
  let r = 0;
  for (let i = 0; i < RANKS.length; i++) if (rp >= RANKS[i].rp) r = i;
  return r;
}
export function addMoney(state, n, why) {
  state.money += n; state.earned += n;
  notice(state, `+${rupiah(n)}${why ? ' — ' + why : ''}`, 'good');
}
export function addRP(state, n) {
  state.rp += n; state.xp += n;
  const r = rankOf(state.rp);
  if (r > state.rank) { state.rank = r; notice(state, `Naik pangkat: ${RANKS[r].name}!`, 'good'); }
}
export function notice(state, text, kind = 'info') {
  state.notices.push({ text, kind, t: 0 });
  if (state.notices.length > 4) state.notices.shift();
}
export function addHeat(state, n) {
  state.heat += n;
  let w = 0;
  for (let i = 0; i < WANTED_HEAT.length; i++) if (state.heat >= WANTED_HEAT[i]) w = i;
  if (w > state.wanted) { state.wanted = w; notice(state, `Bintang dicari naik: ${w} bintang!`, 'bad'); }
}
export function decayHeat(state, dt) {
  if (state.heat > 0) {
    state.heat = Math.max(0, state.heat - 0.4 * dt);
    let w = 0;
    for (let i = 0; i < WANTED_HEAT.length; i++) if (state.heat >= WANTED_HEAT[i]) w = i;
    state.wanted = w;
  }
}

// ------------------------------------------------------------- player on foot
export function makePlayer(x, z) {
  const p = {
    pos: new THREE.Vector3(x, 0, z), position: null,
    heading: 0, speed: 0, inCar: false, car: null, health: 100,
    mesh: null, blob: null, walkPhase: 0,
  };
  p.position = p.pos;
  return p;
}
export function attachPlayerMesh(scene, player, mesh, blob) {
  player.mesh = mesh; player.blob = blob;
  scene.add(mesh); scene.add(blob);
}
export function stepPlayerOnFoot(player, input, dt, colliders, camYaw) {
  const fwd = (input.held.has('KeyW') || input.held.has('ArrowUp') ? 1 : 0) - (input.held.has('KeyS') || input.held.has('ArrowDown') ? 1 : 0);
  const strafe = (input.held.has('KeyD') || input.held.has('ArrowRight') ? 1 : 0) - (input.held.has('KeyA') || input.held.has('ArrowLeft') ? 1 : 0);
  const speed = 6;
  const mx = Math.sin(camYaw) * fwd + Math.cos(camYaw) * strafe;
  const mz = Math.cos(camYaw) * fwd - Math.sin(camYaw) * strafe;
  const len = Math.hypot(mx, mz) || 1;
  const nx = player.pos.x + (mx / len) * speed * dt * (fwd || strafe ? 1 : 0);
  const nz = player.pos.z + (mz / len) * speed * dt * (fwd || strafe ? 1 : 0);
  let blocked = false;
  for (const c of colliders) {
    if (Math.abs(nx - c.x) < c.hw + 0.5 && Math.abs(nz - c.z) < c.hd + 0.5) { blocked = true; break; }
  }
  if (!blocked) { player.pos.x = clamp(nx, -168, 168); player.pos.z = clamp(nz, -44, 128); }
  if (fwd || strafe) {
    player.heading = Math.atan2(mx, mz);
    player.walkPhase += dt * 9;
  }
  if (player.mesh) {
    player.mesh.position.set(player.pos.x, Math.abs(Math.sin(player.walkPhase)) * 0.04, player.pos.z);
    player.mesh.rotation.y = player.heading;
  }
  if (player.blob) player.blob.position.set(player.pos.x, 0.03, player.pos.z);
  return player;
}

// ------------------------------------------------------------- combat
export function makeCombat(scene) {
  return { scene, tracers: [], explosions: [], ray: new THREE.Raycaster() };
}
export function shoot(combat, state, origin, dir, people, cars) {
  const now = performance.now() / 1000;
  const w = WEAPONS[state.weapon];
  if (now - state.lastShot < w.interval) return false;
  if (w.ammo !== Infinity && w.ammo <= 0) { notice(state, 'Peluru habis! Tekan R untuk isi ulang.', 'bad'); state.lastShot = now; return false; }
  state.lastShot = now;
  if (w.ammo !== Infinity) w.ammo--;
  combat.ray.set(origin, dir);
  combat.ray.far = w.range;
  const targets = [];
  for (const p of people) targets.push(p.group);
  for (const c of cars) if (c.mesh) targets.push(c.mesh);
  const hits = combat.ray.intersectObjects(targets, true);
  const end = hits.length ? hits[0].point : origin.clone().addScaledVector(dir, w.range);
  const geo = new THREE.BufferGeometry().setFromPoints([origin, end]);
  const mat = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 });
  const line = new THREE.Line(geo, mat);
  combat.scene.add(line);
  combat.tracers.push({ line, mat, t: 0 });
  if (hits.length) {
    let obj = hits[0].object;
    while (obj && !obj.userData.hit) obj = obj.parent;
    const person = people.find((p) => p.group === obj || p.group.children.includes(obj));
    if (person) {
      state.kills++;
      addHeat(state, 14);
      notice(state, `${person.name} tumbang. Polisi menuju lokasimu!`, 'bad');
      const ex = makeExplosion(combat.scene, hits[0].point);
      combat.explosions.push(ex);
      person.group.visible = false;
      setTimeout(() => { person.group.visible = true; }, 9000);
    } else {
      const car = cars.find((c) => c.mesh === obj);
      if (car) { car.health -= w.dmg * 1.5; if (car.health <= 0 && !car.wrecked) { car.wrecked = true; combat.explosions.push(makeExplosion(combat.scene, car.pos.clone().setY(1))); addHeat(state, 12); } }
    }
  } else {
    addHeat(state, 0.4);
  }
  return true;
}
export function updateCombat(combat, dt) {
  for (const tr of combat.tracers) { tr.t += dt; tr.mat.opacity = Math.max(0, 0.9 - tr.t / 0.07); }
  combat.tracers = combat.tracers.filter((tr) => {
    if (tr.t > 0.07) { combat.scene.remove(tr.line); tr.line.geometry.dispose(); tr.mat.dispose(); return false; }
    return true;
  });
  combat.explosions = combat.explosions.filter((ex) => {
    const alive = updateExplosion(ex, dt);
    if (!alive) removeExplosion(combat.scene, ex);
    return alive;
  });
}
export function reloadWeapon(state) {
  const w = WEAPONS[state.weapon];
  if (w.ammo === Infinity || w.reserve <= 0 || w.ammo === w.clip) return;
  const need = w.clip - w.ammo;
  const take = Math.min(need, w.reserve);
  w.ammo += take; w.reserve -= take;
  notice(state, `${w.name} diisi ulang (${w.ammo}/${w.reserve}).`, 'info');
}

// ------------------------------------------------------------- missions
export function missionObjective(state) { return MISSIONS[state.mission]; }
export function stepMission(state, playerPos, gates, talkPos, deliverPos) {
  const m = MISSIONS[state.mission];
  if (!m) return;
  if (m.id === 'race') {
    state.racing = true;
    const next = gates.find((g) => !g.passed);
    if (next) {
      const dx = playerPos.x - next.x;
      if (Math.abs(dx) < 4 && Math.abs(playerPos.z) < 8) {
        next.passed = true; state.gatesPassed++;
        next.beamMat.emissiveIntensity = 0.25;
        notice(state, `Gate ${state.gatesPassed}/5 dilewati!`, 'good');
        if (state.gatesPassed >= 5) completeMission(state);
      }
    }
  } else if (m.id === 'talk') {
    const d = Math.hypot(playerPos.x - talkPos.x, playerPos.z - talkPos.z);
    if (d < 4) completeMission(state);
  } else if (m.id === 'deliver') {
    const d = Math.hypot(playerPos.x - deliverPos.x, playerPos.z - deliverPos.z);
    if (d < 4) completeMission(state);
  }
}
export function completeMission(state) {
  const m = MISSIONS[state.mission];
  addMoney(state, m.reward, m.title);
  addRP(state, m.rp);
  state.jobs++;
  notice(state, `Misi selesai: ${m.title}!`, 'good');
  state.mission = Math.min(state.mission + 1, MISSIONS.length - 1);
  state.gatesPassed = 0;
  state.racing = false;
}
export function startRace(state, gates) {
  for (const g of gates) { g.passed = false; g.beamMat.emissiveIntensity = 1.4; }
  state.gatesPassed = 0; state.raceTime = 0; state.racing = true;
}

// ------------------------------------------------------------- dispatch + HUD
export const UNITS = [
  { call: 'PD-01 Elang', tactic: 'PURSUIT' },
  { call: 'PD-02 Rajawali', tactic: 'FLANK' },
  { call: 'PD-03 Kancil', tactic: 'RAM' },
  { call: 'PD-04 Garuda', tactic: 'ROADBLOCK' },
  { call: 'Air-1 Helikopter', tactic: 'SEARCH' },
];
export function dispatchRows(state, playerPos, policePos) {
  const n = Math.min(1 + state.wanted, 5);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const u = UNITS[i];
    const d = policePos && i === 0 ? Math.hypot(playerPos.x - policePos.x, playerPos.z - policePos.z) : 60 + i * 47 + Math.sin(performance.now() / 900 + i) * 12;
    rows.push({ call: u.call, tactic: u.tactic, dist: Math.max(4, Math.round(d)) });
  }
  return rows;
}
export function updateHUD(state, ui, player, car, speedKmh, districtName, streetName, camYaw) {
  ui.money.textContent = rupiah(state.money);
  ui.xpFill.style.width = `${(state.xp % 1000) / 10}%`;
  ui.xpLine.textContent = `${RANKS[state.rank].name} · ${state.xp} XP`;
  ui.wanted.classList.toggle('hidden', state.wanted === 0);
  ui.wanted.textContent = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
  const w = WEAPONS[state.weapon];
  ui.weaponName.textContent = w.name;
  ui.weaponAmmo.textContent = w.ammo === Infinity ? '∞' : `${w.ammo} / ${w.reserve}`;
  ui.weaponSlots.innerHTML = WEAPONS.map((x, i) => `<span class="${i === state.weapon ? 'on' : ''}">${i + 1} ${x.short}</span>`).join('');
  const m = MISSIONS[state.mission];
  ui.missionTitle.textContent = m.title;
  ui.missionStep.textContent = m.id === 'race' ? `Gate ${state.gatesPassed}/5 — ${m.step}` : m.step;
  ui.missionNext.textContent = m.next;
  ui.districtName.textContent = districtName;
  ui.districtStreet.textContent = streetName;
  ui.speedNum.textContent = Math.round(speedKmh);
  ui.speedCar.textContent = car ? car.def.name.toUpperCase() : 'JALAN KAKI';
  const cond = car ? Math.max(4, Math.round((car.health / car.maxHealth) * 1000) / 10) : 100;
  ui.conditionNum.textContent = cond.toFixed(1);
  ui.conditionFill.style.width = `${cond}%`;
  ui.healthFill.style.width = `${clamp(state.health, 0, 100)}%`;
  ui.armourFill.style.width = `${clamp(state.armour, 0, 100)}%`;
  ui.speedoArc.style.strokeDashoffset = String(220 - (clamp(speedKmh, 0, 200) / 200) * 220);
  ui.racePanel.classList.toggle('hidden', !state.racing);
  ui.gateNow.textContent = String(Math.min(state.gatesPassed + 1, 5));
  ui.raceTime.textContent = state.raceTime.toFixed(1).replace('.', ',');
  ui.notices.innerHTML = state.notices.slice(-3).map((n) => `<div class="${n.kind}">${n.text}</div>`).join('');
}
export function drawMinimap(ctx, plan, playerPos, heading, policePos, gates, missionTarget) {
  const S = 220, C = S / 2;
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.beginPath(); ctx.arc(C, C, C - 2, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#0c1420'; ctx.fillRect(0, 0, S, S);
  const k = S / 400;
  const X = (x) => C + x * k, Z = (z) => C + (z - 30) * k;
  ctx.fillStyle = '#2e7d8c'; ctx.fillRect(0, 0, S, Z(-46));
  ctx.fillStyle = '#d9c08a'; ctx.fillRect(0, Z(-46), S, Z(-14) - Z(-46));
  ctx.fillStyle = '#3a3f4a'; ctx.fillRect(0, Z(-7), S, Z(7) - Z(-7));
  ctx.fillStyle = '#20242e';
  for (const b of plan.buildings) ctx.fillRect(X(b.x - b.w / 2), Z(b.z - 6), b.w * k, 12 * k);
  for (const h of plan.houses) ctx.fillRect(X(h.x - 5), Z(h.z - 4), 10 * k, 8 * k);
  for (const g of gates) {
    ctx.fillStyle = g.passed ? '#155e52' : '#2dd4bf';
    ctx.beginPath(); ctx.arc(X(g.x), Z(g.z), g.passed ? 3 : 5, 0, Math.PI * 2); ctx.fill();
  }
  if (missionTarget) {
    ctx.fillStyle = '#ffd166';
    ctx.beginPath(); ctx.arc(X(missionTarget.x), Z(missionTarget.z), 6, 0, Math.PI * 2); ctx.fill();
  }
  if (policePos) {
    ctx.fillStyle = '#ff4444';
    ctx.beginPath(); ctx.arc(X(policePos.x), Z(policePos.z), 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.save();
  ctx.translate(X(playerPos.x), Z(playerPos.z));
  ctx.rotate(Math.atan2(Math.sin(heading), Math.cos(heading)) + Math.PI);
  ctx.fillStyle = '#4ade80';
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.restore();
}

// ------------------------------------------------------------- save / radio
export function saveGame(state, slot) {
  try {
    localStorage.setItem(`senja-save-${slot}`, JSON.stringify({ money: state.money, xp: state.xp, rp: state.rp, rank: state.rank, mission: state.mission, jobs: state.jobs, earned: state.earned }));
    notice(state, `Tersimpan di SLOT ${slot}.`, 'good');
    return true;
  } catch { return false; }
}
export function loadGame(state, slot) {
  try {
    const raw = localStorage.getItem(`senja-save-${slot}`);
    if (!raw) return false;
    const d = JSON.parse(raw);
    Object.assign(state, d);
    notice(state, `Lanjutan SLOT ${slot} dimuat.`, 'good');
    return true;
  } catch { return false; }
}
export function stepRadio(state, dt, ui) {
  state.radioT += dt;
  if (state.radioT > 25) {
    state.radioT = 0;
    state.radioIdx = (state.radioIdx + 1) % RADIO.length;
    ui.radioText.textContent = RADIO[state.radioIdx];
  }
}

