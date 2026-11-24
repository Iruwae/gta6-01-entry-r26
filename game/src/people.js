// r26 — people: blocky GLB NPCs + pedestrians, dialogue staging.
// GLB gagal -> figur primitif (kepala, badan, lengan, kaki) dengan warna baju variasi.
import * as THREE from 'three';
import { loadGLB, normalizeGLB } from './city.js';
import { blobShadow, canvasTexture, drawPortrait } from './fx.js';
import { fork, pick, range } from './rng.js';

const NAMES = ['Dimas', 'Sari', 'Budi', 'Rina', 'Agus', 'Maya', 'Joko', 'Lestari', 'Fajar', 'Nina', 'Eko', 'Putri'];
const SHIRTS = [0xd94f4f, 0x4f7dd9, 0x4fd97a, 0xe8b13c, 0x9b59d0, 0x2dd4bf, 0xf2f2f2, 0x333a4a];
const LINES = {
  Dimas: [
    'Sunset di Pantai Senja. Gaspol ke gate pertama, Rak!',
    'Polisi sudah di belakangmu. Jangan berhenti di lampu merah.',
    'Menang balapan ini, nama kita naik di seluruh Pantai Senja.',
  ],
  Sari: ['Kopi susu satu, duduk di depan toko ya.', 'Hati-hati di jalan, ombak lagi besar sore ini.'],
  Budi: ['Ikan hari ini segar, baru naik dari perahu.', 'Besok pagi lelang di dermaga, datang ya.'],
};

function fallbackPerson(shirt) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.85 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x2e3440, roughness: 0.95 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), skin);
  head.position.y = 1.52; head.castShadow = true; g.add(head);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), shirtMat);
  torso.position.y = 1.02; torso.castShadow = true; g.add(torso);
  for (const sx of [-0.32, 0.32]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.58, 0.13), shirtMat);
    arm.position.set(sx, 1.02, 0); arm.castShadow = true; g.add(arm);
  }
  for (const sx of [-0.14, 0.14]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.68, 0.18), pantsMat);
    leg.position.set(sx, 0.34, 0); leg.castShadow = true; g.add(leg);
  }
  return g;
}

export async function loadPersonModel(renderer, file) {
  const src = await loadGLB(renderer, `./assets/chars/${file}.glb`);
  if (!src) return null;
  const { group } = normalizeGLB(src.clone(true), { h: 1.75 });
  return group;
}

export async function spawnPeople(scene, renderer, plan, count = 14) {
  const rng = fork(20261124, 'people');
  const files = ['character-a', 'character-b', 'character-c', 'character-d', 'character-e', 'character-f', 'character-g', 'character-h', 'character-i', 'character-j'];
  const people = [];
  const models = new Map();
  for (let i = 0; i < count; i++) {
    const file = files[i % files.length];
    if (!models.has(file)) models.set(file, loadPersonModel(renderer, file));
    const mesh = await models.get(file);
    const shirt = pick(rng, SHIRTS);
    const name = NAMES[i % NAMES.length];
    const g = new THREE.Group();
    let body;
    if (mesh) { body = mesh.clone(true); }
    else { body = fallbackPerson(shirt); }
    g.add(body);
    const onBeach = i % 3 === 0;
    const x = range(rng, -150, 150);
    const z = onBeach ? range(rng, -26, -16) : range(rng, 8.5, 12);
    g.position.set(x, 0, z);
    g.rotation.y = range(rng, 0, Math.PI * 2);
    scene.add(g);
    const blob = blobShadow(0.55, 0.35);
    blob.position.set(x, 0.03, z);
    scene.add(blob);
    people.push({
      name, group: g, blob, shirt, x, z,
      heading: g.rotation.y, speed: range(rng, 0.6, 1.4),
      walkPhase: range(rng, 0, 6), baseY: 0,
      homeX: x, homeZ: z, dir: chance(rng, 0.5) ? 1 : -1,
    });
  }
  return people;
}

// Pengunjung tetap coffee shop: berdiri di sekitar meja, diam (tidak jalan),
// dengan name tag supaya kelihatan di shot s2. Spots: { name, file, x, z, rot }.
export async function spawnShopRegulars(scene, renderer, spots) {
  const out = [];
  for (const s of spots) {
    const mesh = await loadPersonModel(renderer, s.file);
    const g = new THREE.Group();
    const body = mesh ? mesh.clone(true) : fallbackPerson(0x2dd4bf);
    g.add(body);
    const tag = makeNameTag(s.name);
    tag.position.y = 2.3;
    g.add(tag);
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.rot ?? 0;
    scene.add(g);
    const blob = blobShadow(0.55, 0.35);
    blob.position.set(s.x, 0.03, s.z);
    scene.add(blob);
    out.push({ name: s.name, group: g, blob, tag });
  }
  return out;
}

export function stepPeople(people, dt, t) {
  for (const p of people) {
    p.walkPhase += dt * p.speed * 4;
    p.x += Math.sin(p.heading) * p.speed * dt * 0.4;
    if (p.x > p.homeX + 12) p.heading = Math.PI;
    if (p.x < p.homeX - 12) p.heading = 0;
    p.group.position.set(p.x, Math.abs(Math.sin(p.walkPhase)) * 0.03, p.z);
    p.group.rotation.y = p.heading;
    p.group.rotation.z = Math.sin(p.walkPhase) * 0.03;
    p.blob.position.set(p.x, 0.03, p.z);
  }
}

export function makeNameTag(name) {
  const tex = canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = 'rgba(10,10,26,0.78)';
    g.beginPath(); g.roundRect(4, 6, w - 8, h - 12, 14); g.fill();
    g.fillStyle = '#7dd8c8'; g.font = '700 30px sans-serif'; g.textAlign = 'center';
    g.fillText(name, w / 2, 42);
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(2.4, 0.6, 1);
  return sprite;
}
export function makePortrait(name) {
  const palette = { Dimas: ['#c98d5f', '#1c1c22', '#2dd4bf'], Sari: ['#e8b48a', '#3a2418', '#d94f4f'], Raka: ['#d9a066', '#14100c', '#4f7dd9'] };
  const [skin, hair, shirt] = palette[name] || palette.Raka;
  return canvasTexture(64, 64, (g, w, h) => drawPortrait(g, w, h, skin, hair, shirt));
}
function chance(rng, p) { return rng() < p; }
export { LINES };
