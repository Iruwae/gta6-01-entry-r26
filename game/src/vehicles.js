// r26 — vehicles: real GLB cars (tevy rally hero + Kenney fleet),
// arcade physics, traffic, police pursuit. GLB fails -> primitive fallback.
import * as THREE from 'three';
import { loadGLB, normalizeGLB } from './city.js';
import { blobShadow } from './fx.js';
import { clamp, fork, pick, range } from './rng.js';

const CAR_DEFS = [
  { name: 'Rajawali GT', file: null, top: 56, accel: 15, grip: 9.0, health: 1200, value: 4200 },
  { name: 'Sedan Kota', file: 'sedan', top: 42, accel: 10, grip: 7.5, health: 1000, value: 1200 },
  { name: 'Taksi Senja', file: 'taxi', top: 43, accel: 10.5, grip: 7.5, health: 1000, value: 1400 },
  { name: 'SUV Pantai', file: 'suv', top: 44, accel: 9, grip: 7.0, health: 1400, value: 2200 },
  { name: 'Sport Hatchback', file: 'hatchback-sports', top: 50, accel: 13, grip: 8.5, health: 900, value: 2800 },
  { name: 'Ambulans', file: 'ambulance', top: 40, accel: 8, grip: 6.5, health: 1600, value: 0 },
  { name: 'Interceptor', file: 'police', top: 53, accel: 13.5, grip: 8.8, health: 1500, value: 0 },
];
const KENNEY_URL = (f) => `./assets/cars/${f}.glb`;

function fallbackCarMesh(color = 0xc0392b) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2b3c, roughness: 0.1, metalness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 4.2), paint);
  body.position.y = 0.55; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glass);
  cabin.position.set(0, 1.1, -0.2); cabin.castShadow = true; g.add(cabin);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
  const wheels = [];
  for (const [wx, wz] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12), wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.36, wz); w.castShadow = true;
    g.add(w); wheels.push(w);
  }
  const hl = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.1), new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffedb0, emissiveIntensity: 1.2 }));
  hl.position.set(0, 0.62, 2.12); g.add(hl);
  const tl2 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.1), new THREE.MeshStandardMaterial({ color: 0x881111, emissive: 0xff2222, emissiveIntensity: 1.0 }));
  tl2.position.set(0, 0.62, -2.12); g.add(tl2);
  return { group: g, wheels, steer: [] };
}

function findWheels(scene) {
  const wheels = [];
  const steer = [];
  scene.traverse((o) => {
    const n = (o.name || '').toLowerCase();
    if (o.isMesh && /wheel|tire|tyre/.test(n)) {
      wheels.push(o);
      if (/front|fl|fr/.test(n)) steer.push(o);
    }
  });
  return { wheels, steer };
}

export async function loadCarModel(renderer, def) {
  if (!def.file) {
    const src = await loadGLB(renderer, './rally-car.glb');
    if (src) {
      const { group } = normalizeGLB(src.clone(true), { long: 4.05 });
      const { wheels, steer } = findWheels(group);
      return { group, wheels, steer, glb: true };
    }
    return { ...fallbackCarMesh(0xdfe8f0), glb: false };
  }
  const src = await loadGLB(renderer, KENNEY_URL(def.file));
  if (src) {
    const { group } = normalizeGLB(src.clone(true), { long: 4.0 });
    const { wheels, steer } = findWheels(group);
    return { group, wheels, steer, glb: true };
  }
  const color = def.file === 'police' ? 0xf2f2f2 : def.file === 'taxi' ? 0xf7c948 : 0x5b8dd9;
  return { ...fallbackCarMesh(color), glb: false };
}

export function makeCar(renderer, def, x, z, heading) {
  const car = {
    def, pos: new THREE.Vector3(x, 0, z), position: null,
    heading, speed: 0, steer: 0, health: def.health, maxHealth: def.health,
    mesh: null, wheels: [], steerNodes: [], blob: null, glb: false, kind: def.file || 'rally',
  };
  car.position = car.pos;
  return car;
}

export function attachCarMesh(scene, car, model) {
  car.mesh = model.group;
  car.wheels = model.wheels || [];
  car.steerNodes = model.steer || [];
  car.glb = model.glb;
  car.mesh.position.copy(car.pos);
  car.mesh.rotation.y = car.heading;
  scene.add(car.mesh);
  car.blob = blobShadow(1.7, 0.4);
  scene.add(car.blob);
  return car;
}

// Fisika arcade: gas/rem, setir menyempit dengan kecepatan, drift, handbrake.
export function stepCarPhysics(car, input, dt, colliders) {
  const def = car.def;
  const fwd = input.held.has('KeyW') || input.held.has('ArrowUp');
  const back = input.held.has('KeyS') || input.held.has('ArrowDown');
  const left = input.held.has('KeyA') || input.held.has('ArrowLeft');
  const right = input.held.has('KeyD') || input.held.has('ArrowRight');
  const brake = input.held.has('Space');
  const spd = car.speed;
  if (fwd) car.speed += def.accel * dt * (spd < 0 ? 2.2 : 1);
  if (back) car.speed -= (spd > 0.5 ? 26 : def.accel * 0.6) * dt;
  if (brake) car.speed -= Math.sign(spd) * 30 * dt;
  if (!fwd && !back) car.speed -= Math.sign(spd) * Math.min(Math.abs(spd), 6 * dt);
  car.speed = clamp(car.speed, -14, def.top);
  if (Math.abs(car.speed) < 0.05 && !fwd && !back) car.speed = 0;
  const maxSteer = 0.52 - Math.min(Math.abs(spd) / def.top, 1) * 0.46;
  const target = (left ? 1 : 0) - (right ? 1 : 0);
  car.steer += (target * maxSteer - car.steer) * Math.min(1, dt * 8);
  const yawRate = clamp(car.steer * (0.9 + Math.min(Math.abs(spd), 20) * 0.06), -2.3, 2.3) * (brake ? 1.5 : 1);
  car.heading += yawRate * dt * Math.sign(spd || 1) * clamp(Math.abs(spd) / 6, 0, 1);
  const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
  const hit = collideCircle(nx, nz, 1.5, colliders);
  if (!hit) { car.pos.x = nx; car.pos.z = nz; }
  else {
    car.pos.x = hit.x; car.pos.z = hit.z;
    if (Math.abs(car.speed) > 4) { car.health -= car.speed * car.speed * 0.5; car.speed *= -0.25; }
    else car.speed *= 0.4;
  }
  car.pos.x = clamp(car.pos.x, -168, 168);
  car.pos.z = clamp(car.pos.z, -44, 128);
  if (car.mesh) {
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.heading;
    // Miring bodi: roll saat belok, pitch saat gas/rem, bob suspensi halus.
    car.mesh.rotation.z = clamp(-car.steer * 0.5 * Math.min(Math.abs(spd) / 20, 1), -0.06, 0.06);
    car.mesh.rotation.x = clamp((fwd ? -0.012 : 0) + (back || brake ? 0.014 : 0), -0.02, 0.02);
    car.mesh.position.y = Math.sin(performance.now() * 0.006) * 0.012 * Math.min(Math.abs(spd) / 20, 1);
    const spin = (car.speed * dt) / 0.36;
    for (const w of car.wheels) w.rotation.x += spin;
    for (const s of car.steerNodes) s.rotation.y = car.steer * 0.9;
  }
  if (car.blob) { car.blob.position.set(car.pos.x, 0.03, car.pos.z); car.blob.rotation.z = -car.heading; }
  return car;
}

export function collideCircle(x, z, r, colliders) {
  for (const c of colliders) {
    const dx = x - c.x, dz = z - c.z;
    const px = Math.max(-c.hw, Math.min(c.hw, dx));
    const pz = Math.max(-c.hd, Math.min(c.hd, dz));
    const ox = dx - px, oz = dz - pz;
    const d2 = ox * ox + oz * oz;
    if (d2 < r * r) {
      const d = Math.sqrt(d2) || 0.01;
      return { x: c.x + px + (ox / d) * r, z: c.z + pz + (oz / d) * r };
    }
  }
  return null;
}

// ---------------------------------------------------------------- traffic
export function makeTrafficCar(renderer, scene, defs, x, z, heading, speed) {
  const def = defs[Math.floor(Math.random() * defs.length)];
  const car = makeCar(renderer, def, x, z, heading);
  car.speed = speed;
  car.traffic = true;
  car.lane = z > 0 ? 3.4 : -3.4;
  return car;
}
export async function attachTraffic(scene, renderer, car) {
  const model = await loadCarModel(renderer, car.def);
  attachCarMesh(scene, car, model);
  return car;
}
export function stepTraffic(car, dt, playerPos) {
  // Laju lurus di jalurnya (jalan membujur sumbu X); putar balik di ujung.
  car.speed = clamp(car.speed, 8, 16);
  car.pos.x += Math.sin(car.heading) * car.speed * dt;
  car.pos.z += (car.lane - car.pos.z) * Math.min(1, dt * 1.5);
  if (car.pos.x > 168) { car.pos.x = 168; car.heading = -Math.PI / 2; car.lane = -3.4; }
  if (car.pos.x < -168) { car.pos.x = -168; car.heading = Math.PI / 2; car.lane = 3.4; }
  const dx = car.pos.x - playerPos.x, dz = car.pos.z - playerPos.z;
  if (dx * dx + dz * dz < 30) car.speed = Math.max(4, car.speed - 20 * dt);
  if (car.mesh) {
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.heading;
    const spin = (car.speed * dt) / 0.36;
    for (const w of car.wheels) w.rotation.x += spin;
  }
  if (car.blob) { car.blob.position.set(car.pos.x, 0.03, car.pos.z); car.blob.rotation.z = -car.heading; }
}

// ---------------------------------------------------------------- police
export async function makePoliceInterceptor(scene, renderer, x, z) {
  const def = CAR_DEFS.find((d) => d.file === 'police');
  const car = makeCar(renderer, def, x, z, 0);
  car.police = true;
  const model = await loadCarModel(renderer, def);
  attachCarMesh(scene, car, model);
  // Light bar merah-biru di atap (primitif menyala, berkedip di update).
  const barMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4), barMat);
  bar.position.y = 1.45; car.mesh.add(bar);
  const redMat = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 2 });
  const bluMat = new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 2 });
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.42), redMat);
  red.position.set(-0.28, 1.56, 0); car.mesh.add(red);
  const blu = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.42), bluMat);
  blu.position.set(0.28, 1.56, 0); car.mesh.add(blu);
  car.lightRed = redMat; car.lightBlu = bluMat;
  return car;
}
export function stepPolice(car, targetPos, dt, t) {
  // Kejar dengan lead: bidik titik di depan target, setir halus, lampu berkedip.
  const dx = targetPos.x - car.pos.x, dz = targetPos.z - car.pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  const want = Math.atan2(dx, dz);
  let dh = want - car.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  car.heading += clamp(dh, -1.4 * dt, 1.4 * dt);
  const targetSpeed = dist > 26 ? car.def.top : dist > 10 ? 30 : 18;
  car.speed += clamp(targetSpeed - car.speed, -20 * dt, 12 * dt);
  car.pos.x += Math.sin(car.heading) * car.speed * dt;
  car.pos.z += Math.cos(car.heading) * car.speed * dt;
  car.pos.z = clamp(car.pos.z, -6.5, 6.5);
  if (car.mesh) {
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.heading;
    const spin = (car.speed * dt) / 0.36;
    for (const w of car.wheels) w.rotation.x += spin;
  }
  if (car.blob) { car.blob.position.set(car.pos.x, 0.03, car.pos.z); car.blob.rotation.z = -car.heading; }
  const phase = Math.floor(t * 6) % 2 === 0;
  if (car.lightRed) { car.lightRed.emissiveIntensity = phase ? 3.2 : 0.25; car.lightBlu.emissiveIntensity = phase ? 0.25 : 3.2; }
  return dist;
}
export { CAR_DEFS };

