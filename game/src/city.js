// r26 — the city: beach road, sea, Kenney GLB buildings, real trees,
// PBR road/sand, lamps, race gates, COFFEE SHOP storefront. One seed builds all.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { fork, range, pick, chance } from './rng.js';
import { blobShadow } from './fx.js';

export function createPlan(seed = 20261124) {
  const rng = fork(seed, 'city');
  const plan = {
    seed,
    road: { x0: -170, x1: 170, z: 0, halfW: 7 },
    beach: { z0: -14, z1: -46 },
    sea: { z1: -46 },
    buildings: [],
    houses: [],
    palms: [],
    trees: [],
    lamps: [],
    gates: [],
    shops: [],
    colliders: [],
    districts: [
      { name: 'Pantai Senja', x0: -170, x1: 170, z0: -46, z1: 40, color: '#e8a04c' },
      { name: 'Kampung Nelayan', x0: -170, x1: -40, z0: 40, z1: 130, color: '#7fb069' },
      { name: 'Kota Lama', x0: -40, x1: 170, z0: 40, z1: 130, color: '#5b8dd9' },
    ],
  };
  // Deret gedung komersial di sisi kanan jalan (z 12..58), dua baris.
  const commNames = ['building-a', 'building-b', 'building-c', 'building-d', 'building-e', 'building-f', 'building-g', 'building-h'];
  const skyNames = ['building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c'];
  let x = -158;
  let row = 0;
  while (x < 158) {
    const w = range(rng, 12, 20);
    const tall = chance(rng, 0.16);
    const name = tall ? pick(rng, skyNames) : pick(rng, commNames);
    const z = 16 + row * 22 + range(rng, -2, 2);
    plan.buildings.push({ file: name, x: x + w / 2, z, w, h: tall ? range(rng, 26, 40) : range(rng, 9, 18), rot: 0 });
    plan.colliders.push({ x: x + w / 2, z, hw: w / 2, hd: 6 });
    x += w + range(rng, 4, 9);
    if (x > 150 && row === 0) { x = -158; row = 1; }
  }
  // Rumah suburban satu blok ke belakang (z 70..120).
  const houseNames = ['building-type-a', 'building-type-b', 'building-type-c', 'building-type-d', 'building-type-e', 'building-type-f'];
  for (let hx = -150; hx < 150; hx += range(rng, 18, 26)) {
    for (const hz of [76, 104]) {
      plan.houses.push({ file: pick(rng, houseNames), x: hx + range(rng, -3, 3), z: hz + range(rng, -3, 3), rot: chance(rng, 0.5) ? 0 : Math.PI });
      plan.colliders.push({ x: hx, z: hz, hw: 6, hd: 5 });
    }
  }
  // Palem di tepi pantai + trotoar; jacaranda di median jalan.
  for (let px = -165; px <= 165; px += 11) {
    if (chance(rng, 0.85)) plan.palms.push({ x: px + range(rng, -1.5, 1.5), z: -12.5, lean: range(rng, -0.06, 0.1), s: range(rng, 0.9, 1.25) });
    if (chance(rng, 0.6)) plan.palms.push({ x: px + 5 + range(rng, -1.5, 1.5), z: 9.5, lean: range(rng, -0.05, 0.05), s: range(rng, 0.85, 1.1) });
  }
  for (let tx = -140; tx <= 140; tx += 35) plan.trees.push({ x: tx + range(rng, -6, 6), z: 9.5, s: range(rng, 0.38, 0.5) });
  for (let lx = -160; lx <= 160; lx += 20) plan.lamps.push({ x: lx, z: 8.2 });
  // Lima gate balapan melintang jalan.
  for (let i = 0; i < 5; i++) plan.gates.push({ x: -120 + i * 60, z: 0, index: i });
  // COFFEE SHOP: kedai kopi tempat misi bicara, di trotoar kanan.
  plan.shops.push({ name: 'COFFEE SHOP', x: 22, z: 13.5, w: 16, h: 7 });
  return plan;
}

export function districtAt(plan, x, z) {
  for (const d of plan.districts) if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return d;
  return plan.districts[0];
}
export function streetAt(plan, x, z) {
  if (z < -14) return 'PANTAI SENJA';
  if (z < 10) return 'JL. PANTAI SENJA';
  if (z < 40) return 'JL. MERCUSUAR';
  return x < -40 ? 'GG. NELAYAN' : 'JL. KOTA LAMA';
}

// ---------------------------------------------------------------- textures
function tex(loader, url, srgb = true, rx = 1, ry = 1) {
  const t = loader.load(url);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  return t;
}
function stripeTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ff8a5c' : '#fff3e0'; g.fillRect(i * 16, 0, 16, 64); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function signTexture(text, sub, bg = '#7c2d12', fg = '#fff7ed') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  g.fillStyle = fg; g.font = '900 64px Georgia, serif'; g.textAlign = 'center';
  g.fillText(text, 256, 74);
  g.font = '700 26px sans-serif'; g.fillStyle = '#ffd9a0';
  g.fillText(sub, 256, 112);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- GLB helpers
const glbCache = new Map();
export async function loadGLB(renderer, url) {
  if (glbCache.has(url)) return glbCache.get(url);
  const p = (async () => {
    try {
      const { KTX2Loader } = await import('three/addons/loaders/KTX2Loader.js');
      const { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js');
      const ktx = new KTX2Loader();
      ktx.setTranscoderPath('./vendor/addons/libs/basis/');
      ktx.detectSupport(renderer);
      const l = new GLTFLoader();
      l.setKTX2Loader(ktx);
      l.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await l.loadAsync(url);
      return gltf.scene;
    } catch (err) {
      console.warn('[city] GLB gagal:', url, err.message);
      return null;
    }
  })();
  glbCache.set(url, p);
  return p;
}
// Normalisasi: putar supaya sumbu panjang = Z, skala ke target, alas di y=0.
export function normalizeGLB(scene, target) {
  const wrap = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(scene);
  wrap.add(inner);
  let box = new THREE.Box3().setFromObject(inner);
  const size = new THREE.Vector3(); box.getSize(size);
  if (target.long && size.x > size.z) inner.rotation.y = Math.PI / 2;
  box = new THREE.Box3().setFromObject(inner);
  box.getSize(size);
  let s = 1;
  if (target.h) s = target.h / Math.max(size.y, 0.01);
  else if (target.long) s = target.long / Math.max(size.z, 0.01);
  else if (target.w) s = target.w / Math.max(size.x, 0.01);
  inner.scale.setScalar(s);
  box = new THREE.Box3().setFromObject(inner);
  const c = new THREE.Vector3(); box.getCenter(c);
  inner.position.x -= c.x;
  inner.position.z -= c.z;
  inner.position.y -= box.min.y;
  wrap.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: wrap, size: new THREE.Vector3(size.x * s, size.y * s, size.z * s) };
}

// Gedung darurat bila GLB gagal: kotak PBR + jendela kanvas (tidak pernah kosong).
function fallbackBuilding(w, h, d, facadeTex) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ map: facadeTex || null, color: facadeTex ? 0xffffff : 0xd8b48a, roughness: 0.85, metalness: 0.05 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  box.position.y = h / 2; box.castShadow = true; box.receiveShadow = true;
  g.add(box);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4), new THREE.MeshStandardMaterial({ color: 0x4a3a32, roughness: 0.95 }));
  roof.position.y = h + 0.25; g.add(roof);
  return g;
}
function fallbackPalm(h = 7) {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6b45, roughness: 1 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, h, 7), trunkMat);
  trunk.position.y = h / 2; trunk.rotation.z = 0.05; trunk.castShadow = true;
  g.add(trunk);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f8f4f, roughness: 0.9, side: THREE.DoubleSide });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.6), leafMat);
    frond.position.set(Math.cos(a) * 0.9, h + 0.2, Math.sin(a) * 0.9);
    frond.rotation.set(Math.sin(a) * 0.9, a, -Math.cos(a) * 0.9);
    frond.castShadow = true;
    g.add(frond);
  }
  return g;
}

// ---------------------------------------------------------------- build city
export async function buildCity(scene, renderer, plan, onProgress) {
  const group = new THREE.Group();
  scene.add(group);
  const tl = new THREE.TextureLoader();
  const loaded = { glb: [], fallback: [] };
  const tick = (p, msg) => { if (onProgress) onProgress(p, msg); };
  tick(0.05, 'Memuat tekstur PBR…');
  const asphalt = {
    map: tex(tl, './tex6-asphalt.jpg', true, 40, 3),
    normalMap: tex(tl, './tex6-asphalt-nor.jpg', false, 40, 3),
    roughnessMap: tex(tl, './tex6-asphalt-rough.jpg', false, 40, 3),
  };
  const sand = {
    map: tex(tl, './tex6-sand.jpg', true, 24, 4),
    normalMap: tex(tl, './tex6-sand-nor.jpg', false, 24, 4),
    roughnessMap: tex(tl, './tex6-sand-rough.jpg', false, 24, 4),
  };
  const paving = {
    map: tex(tl, './tex6-paving.jpg', true, 30, 8),
    normalMap: tex(tl, './tex6-paving-nor.jpg', false, 30, 8),
    roughnessMap: tex(tl, './tex6-paving-rough.jpg', false, 30, 8),
  };
  const facadeTex = {
    brick: tl.load('./tex6-facade-brick.png'),
    concrete: tl.load('./tex6-facade-concrete.png'),
    glass: tl.load('./tex6-facade-glass.png'),
    shop: tl.load('./tex6-facade-shop.png'),
  };
  for (const t of Object.values(facadeTex)) { t.colorSpace = THREE.SRGBColorSpace; }

  // Tanah, jalan, trotoar, pantai, laut, pulau.
  const landMat = new THREE.MeshStandardMaterial({ ...paving, roughness: 0.95, metalness: 0 });
  const land = new THREE.Mesh(new THREE.PlaneGeometry(420, 320), landMat);
  land.rotation.x = -Math.PI / 2; land.position.set(0, 0, 30); land.receiveShadow = true;
  group.add(land);
  const roadMat = new THREE.MeshStandardMaterial({ ...asphalt, roughness: 0.95, metalness: 0.02 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(344, 14.6), roadMat);
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0.02, 0); road.receiveShadow = true;
  group.add(road);
  // Marka: garis tengah putus-putus + zebra di tiap gate.
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf5f0dc });
  for (let x = -168; x < 168; x += 8) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.28), lineMat);
    dash.rotation.x = -Math.PI / 2; dash.position.set(x, 0.05, 0);
    group.add(dash);
  }
  const beachMat = new THREE.MeshStandardMaterial({ ...sand, roughness: 1, metalness: 0 });
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(360, 34), beachMat);
  beach.rotation.x = -Math.PI / 2; beach.position.set(0, 0.01, -30); beach.receiveShadow = true;
  group.add(beach);
  const seaMat = new THREE.MeshStandardMaterial({ color: 0x2e7d8c, roughness: 0.18, metalness: 0.35, envMapIntensity: 1.4 });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 420), seaMat);
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.6, -260);
  group.add(sea);
  // Langit yang terlihat = foto senja asli (scene.background, dipasang di fx.js).
  // tex6-sky.jpg hanya cadangan bila equirect gagal — bukan backdrop di sini.
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x8a6a72, roughness: 1, fog: true });
  for (const [hx, hz, hr, hh] of [[-190, -190, 70, 34], [-40, -230, 95, 46], [150, -200, 80, 38]]) {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(hr, hh, 9), hillMat);
    hill.position.set(hx, hh / 2 - 2, hz);
    group.add(hill);
  }
  tick(0.2, 'Membangun gedung…');
  // Gedung komersial GLB (Kenney) + fallback kotak.
  const commCache = new Map();
  for (const b of plan.buildings) {
    const url = `./assets/bcomm/${b.file}.glb`;
    if (!commCache.has(b.file)) commCache.set(b.file, loadGLB(renderer, url));
    const src = await commCache.get(b.file);
    let obj;
    if (src) {
      const n = normalizeGLB(src.clone(true), { w: b.w, h: b.h });
      obj = n.group;
      loaded.glb.push(b.file);
    } else {
      obj = fallbackBuilding(b.w, b.h, 12, pick([facadeTex.brick, facadeTex.glass, facadeTex.concrete]));
      loaded.fallback.push(b.file);
    }
    obj.position.set(b.x, 0, b.z);
    obj.rotation.y = Math.PI;
    group.add(obj);
    const blob = blobShadow(Math.max(b.w, 8) / 2, 0.3);
    blob.position.set(b.x, 0.04, b.z);
    group.add(blob);
  }
  // Rumah suburban GLB.
  const subCache = new Map();
  for (const h of plan.houses) {
    const url = `./assets/bsub/${h.file}.glb`;
    if (!subCache.has(h.file)) subCache.set(h.file, loadGLB(renderer, url));
    const src = await subCache.get(h.file);
    let obj;
    if (src) { obj = normalizeGLB(src.clone(true), { w: 11, h: 7 }).group; loaded.glb.push(h.file); }
    else { obj = fallbackBuilding(11, 6.5, 9, facadeTex.brick); loaded.fallback.push(h.file); }
    obj.position.set(h.x, 0, h.z);
    obj.rotation.y = h.rot + Math.PI;
    group.add(obj);
  }
  tick(0.45, 'Menanam palem & jacaranda…');
  // Palem GLB di tepi pantai + trotoar.
  const palmSrc = await loadGLB(renderer, './assets/trees/palm.glb');
  for (const p of plan.palms) {
    let obj;
    if (palmSrc) { obj = normalizeGLB(palmSrc.clone(true), { h: 7 * p.s }).group; }
    else { obj = fallbackPalm(7 * p.s); }
    obj.position.set(p.x, 0, p.z);
    obj.rotation.z = p.lean;
    obj.rotation.y = Math.random() * Math.PI * 2;
    group.add(obj);
  }
  if (palmSrc) loaded.glb.push('palm'); else loaded.fallback.push('palm');
  // Jacaranda pangkas di median jalan.
  const jacSrc = await loadGLB(renderer, './jacaranda-trim.glb');
  for (const t of plan.trees) {
    if (!jacSrc) break;
    const obj = normalizeGLB(jacSrc.clone(true), { h: 10 }).group;
    obj.scale.setScalar(t.s / 0.44);
    obj.position.set(t.x, 0, t.z);
    obj.rotation.y = Math.random() * Math.PI * 2;
    group.add(obj);
  }
  if (jacSrc) loaded.glb.push('jacaranda-trim'); else loaded.fallback.push('jacaranda-trim');
  tick(0.65, 'Memasang lampu & gate balapan…');
  // Lampu jalan: tiang + kepala menyala.
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2e3440, roughness: 0.6, metalness: 0.6 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffc86b, emissiveIntensity: 1.6 });
  for (const l of plan.lamps) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 7.2, 6), poleMat);
    pole.position.y = 3.6; pole.castShadow = true; g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.6), poleMat);
    arm.position.set(0, 7.1, -0.7); g.add(arm);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.9), headMat);
    head.position.set(0, 7.0, -1.4); g.add(head);
    g.position.set(l.x, 0, l.z);
    group.add(g);
  }
  // Gate balapan: tiang + balok teal tembus pandang.
  const gates = [];
  for (const gt of plan.gates) {
    const g = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: 0x123a3a, roughness: 0.4, metalness: 0.4, emissive: 0x0e7490, emissiveIntensity: 0.5 });
    for (const sx of [-7.4, 7.4]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 9, 8), postMat);
      post.position.set(sx, 4.5, 0); post.castShadow = true; g.add(post);
    }
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x2dd4bf, emissive: 0x2dd4bf, emissiveIntensity: 1.4, transparent: true, opacity: 0.55 });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(15.4, 1.1, 0.8), beamMat);
    beam.position.y = 8.6; g.add(beam);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(15, 8.4), new THREE.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
    glow.position.y = 4.4; g.add(glow);
    g.position.set(gt.x, 0, gt.z);
    group.add(g);
    gates.push({ ...gt, group: g, beamMat, passed: false });
  }
  // COFFEE SHOP: kedai kopi + papan nama + meja, kursi, lampu gantung hangat.
  const shop = plan.shops[0];
  const shopGroup = new THREE.Group();
  const shopBody = new THREE.Mesh(new THREE.BoxGeometry(shop.w, shop.h, 9), new THREE.MeshStandardMaterial({ color: 0xe8c39a, roughness: 0.85 }));
  shopBody.position.y = shop.h / 2; shopBody.castShadow = true; shopBody.receiveShadow = true;
  shopGroup.add(shopBody);
  const winMat = new THREE.MeshStandardMaterial({ color: 0x4a3220, emissive: 0xffb36b, emissiveIntensity: 0.55, roughness: 0.25, metalness: 0.1 });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(shop.w - 2, 3.6), winMat);
  win.position.set(0, 2.4, -4.55); win.rotation.y = Math.PI;
  shopGroup.add(win);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshStandardMaterial({ map: signTexture('COFFEE SHOP', 'COFFEE • TEA • SNACKS'), roughness: 0.7 }));
  sign.position.set(0, 6.4, -4.7); sign.rotation.y = Math.PI;
  shopGroup.add(sign);
  const awn = new THREE.Mesh(new THREE.BoxGeometry(shop.w, 0.25, 3), new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.8 }));
  awn.position.set(0, 4.6, -5.6);
  shopGroup.add(awn);
  // Teras kopi: counter kayu + meja bundar + kursi + cangkir + lampu gantung.
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.8 });
  const woodTopMat = new THREE.MeshStandardMaterial({ color: 0xc9a06a, roughness: 0.6 });
  const counter = new THREE.Mesh(new THREE.BoxGeometry(7, 1.05, 1.2), woodMat);
  counter.position.set(-4.5, 0.53, -5.8); counter.castShadow = true; shopGroup.add(counter);
  const counterTop = new THREE.Mesh(new THREE.BoxGeometry(7.3, 0.08, 1.4), woodTopMat);
  counterTop.position.set(-4.5, 1.1, -5.8); shopGroup.add(counterTop);
  const tableMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.75 });
  const stoolMat = new THREE.MeshStandardMaterial({ color: 0x2dd4bf, roughness: 0.7 });
  const cupMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.4 });
  const coffeeMat = new THREE.MeshStandardMaterial({ color: 0x4a2c14, roughness: 0.3 });
  function cafeTable(tx, tz) {
    const t = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.07, 18), tableMat);
    top.position.y = 0.74; top.castShadow = true; t.add(top);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.74, 8), tableMat);
    leg.position.y = 0.37; t.add(leg);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.06, 12), tableMat);
    base.position.y = 0.03; t.add(base);
    for (const [sx, sz] of [[-0.9, 0.5], [0.9, -0.4]]) {
      const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.45, 12), stoolMat);
      stool.position.set(sx, 0.23, sz); stool.castShadow = true; t.add(stool);
    }
    for (const [cx, cz] of [[-0.3, 0.2], [0.35, -0.25]]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.13, 10), cupMat);
      cup.position.set(cx, 0.84, cz); t.add(cup);
      const cof = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 10), coffeeMat);
      cof.position.set(cx, 0.9, cz); t.add(cof);
    }
    t.position.set(tx, 0, tz);
    return t;
  }
  shopGroup.add(cafeTable(-1.2, -7.3));
  shopGroup.add(cafeTable(5.6, -6.7));
  const cordMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffc98a, emissive: 0xff9a3c, emissiveIntensity: 2.2, roughness: 0.4 });
  for (const lx of [-4, 0, 4]) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), cordMat);
    cord.position.set(lx, 4.35, -6.8); shopGroup.add(cord);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), lampMat);
    bulb.position.set(lx, 4.05, -6.8); shopGroup.add(bulb);
  }
  const shopLight = new THREE.PointLight(0xffb36b, 26, 26, 1.6);
  shopLight.position.set(0, 5, -8);
  shopGroup.add(shopLight);
  shopGroup.position.set(shop.x, 0, shop.z);
  group.add(shopGroup);
  // Payung pantai + perahu.
  const umbTex = stripeTexture();
  for (let i = 0; i < 8; i++) {
    const ux = -150 + i * 42 + (i % 2) * 12;
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), poleMat);
    pole.position.y = 1.2; g.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.1, 0.9, 10), new THREE.MeshStandardMaterial({ map: umbTex, roughness: 0.85 }));
    top.position.y = 2.7; top.castShadow = true; g.add(top);
    const towel = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), new THREE.MeshStandardMaterial({ map: umbTex, roughness: 0.9 }));
    towel.rotation.x = -Math.PI / 2; towel.position.set(1.6, 0.06, 0.6); towel.rotation.z = 0.4;
    g.add(towel);
    g.position.set(ux, 0, -24 - (i % 3) * 4);
    group.add(g);
  }
  const boatMat = new THREE.MeshStandardMaterial({ color: 0xf3e5c8, roughness: 0.7 });
  for (const [bx, bz, br] of [[-90, -34, 0.4], [70, -38, -0.3]]) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(5, 1, 1.8), boatMat);
    hull.position.y = 0.5; boat.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 6), poleMat);
    mast.position.y = 2.2; boat.add(mast);
    boat.position.set(bx, 0, bz); boat.rotation.y = br;
    group.add(boat);
  }
  tick(0.9, 'Kota selesai.');
  return { group, gates, shopPos: new THREE.Vector3(shop.x, 0, shop.z - 7), loaded };
}


