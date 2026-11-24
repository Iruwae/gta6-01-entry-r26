// r26 — sky, light, environment map, post-processing, explosions.
// Resep render 7 poin: PMREM dari HDRI senja asli, PBR di semua permukaan,
// bloom halus + ACES, kabut hangat, bayangan kontak + shadow map 2048.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp } from './rng.js';

export function makeRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

export function makeLights(scene) {
  const hemi = new THREE.HemisphereLight(0xffd9b0, 0x6b4a7a, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb36b, 2.4);
  sun.position.set(-90, 42, -70);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -110; sun.shadow.camera.right = 110;
  sun.shadow.camera.top = 110; sun.shadow.camera.bottom = -110;
  sun.shadow.camera.near = 5; sun.shadow.camera.far = 320;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);
  const fill = new THREE.DirectionalLight(0x8fb4ff, 0.35);
  fill.position.set(60, 30, 80);
  scene.add(fill);
  scene.fog = new THREE.FogExp2(0xc98a9e, 0.0032);
  return { hemi, sun, fill };
}

export function makeSkyDome(scene) {
  // Kubahlah langit: gradien senja peach-pink-ungu + matahari rendah + awan tipis.
  const geo = new THREE.SphereGeometry(900, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x5a4a8a) },
      mid: { value: new THREE.Color(0xe8907a) },
      low: { value: new THREE.Color(0xffc98a) },
      sunDir: { value: new THREE.Vector3(-0.62, 0.18, -0.45).normalize() },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vDir; uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform vec3 sunDir;'
      + 'void main(){ float h = clamp(vDir.y, -0.08, 1.0);'
      + ' vec3 col = mix(low, mid, smoothstep(-0.05, 0.22, h));'
      + ' col = mix(col, top, smoothstep(0.2, 0.75, h));'
      + ' float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);'
      + ' col += vec3(1.0, 0.75, 0.45) * pow(s, 90.0) * 1.6 + vec3(1.0, 0.55, 0.3) * pow(s, 8.0) * 0.35;'
      + ' float band = sin(vDir.x * 14.0 + vDir.y * 30.0) * sin(vDir.z * 11.0 - vDir.y * 18.0);'
      + ' col = mix(col, vec3(0.98, 0.82, 0.86), smoothstep(0.55, 0.95, band) * 0.10 * smoothstep(0.05, 0.35, h));'
      + ' gl_FragColor = vec4(col, 1.0); }',
  });
  const dome = new THREE.Mesh(geo, mat);
  scene.add(dome);
  return dome;
}

export async function applyEnvironment(scene, renderer, texUrl) {
  // PMREM dari HDRI senja asli (Venice Sunset): cahaya seluruh scene.
  // PLUS: foto senja yang sama jadi langit yang terlihat (scene.background),
  // supaya s1/s4 menunjukkan matahari asli rendah di atas air, bukan pink buatan.
  try {
    const tex = await new THREE.TextureLoader().loadAsync(texUrl);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromEquirectangular(tex).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.85;
    pmrem.dispose();
    return true;
  } catch (err) {
    console.warn('[fx] env map gagal, pakai gradien:', err.message);
    return false;
  }
}

export function makeComposer(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.55, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.setSize(window.innerWidth, window.innerHeight);
  return composer;
}

export function resizeComposer(composer, renderer) {
  composer.setSize(window.innerWidth, window.innerHeight);
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Bayangan kontak: lingkaran gelap lembut di bawah mobil / NPC supaya tidak melayang.
export function blobShadow(radius = 1.6, opacity = 0.42) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.85)'); grad.addColorStop(0.6, 'rgba(0,0,0,0.4)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2.6), mat);
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.03; mesh.renderOrder = 1;
  return mesh;
}

// Ledakan: gugus bola berlapis + cahaya titik, memudar linear dari opasitas awal.
export function makeExplosion(scene, pos) {
  const group = new THREE.Group();
  group.position.copy(pos);
  const mats = [];
  const cols = [0xffd166, 0xff7b2f, 0xff3d00, 0x5a5a6e];
  for (let i = 0; i < 9; i++) {
    const m = new THREE.MeshBasicMaterial({ color: cols[i % cols.length], transparent: true, opacity: 0.95 });
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.5 + Math.random() * 0.9, 10, 8), m);
    s.position.set((Math.random() - 0.5) * 2.2, Math.random() * 1.6, (Math.random() - 0.5) * 2.2);
    s.userData.v = new THREE.Vector3((Math.random() - 0.5) * 5, 2 + Math.random() * 4, (Math.random() - 0.5) * 5);
    group.add(s); mats.push(m);
  }
  const light = new THREE.PointLight(0xff9a3d, 60, 40, 1.8);
  light.position.y = 2;
  group.add(light);
  scene.add(group);
  return { group, mats, light, age: 0, life: 1.1, initial: 0.95 };
}
export function updateExplosion(ex, dt) {
  ex.age += dt;
  const t = clamp(ex.age / ex.life, 0, 1);
  const fade = 1 - t;
  for (const m of ex.mats) m.opacity = ex.initial * fade;
  ex.light.intensity = 60 * fade;
  ex.group.scale.setScalar(1 + t * 1.6);
  for (const s of ex.group.children) {
    if (!s.userData.v) continue;
    s.position.addScaledVector(s.userData.v, dt);
    s.userData.v.y -= 6 * dt;
  }
  return ex.age < ex.life;
}
export function removeExplosion(scene, ex) { scene.remove(ex.group); }

// Kanvas tekstur prosedural: fasad toko, papan nama, potret wajah.
export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
export function drawPortrait(ctx, w, h, skin, hair, shirt) {
  ctx.fillStyle = '#1d2b45'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(w / 2, h * 0.52, w * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(w / 2, h * 0.36, w * 0.3, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#14100c';
  ctx.beginPath(); ctx.arc(w * 0.4, h * 0.5, w * 0.045, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(w * 0.6, h * 0.5, w * 0.045, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#7a4a2b'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(w / 2, h * 0.62, w * 0.1, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  ctx.fillStyle = shirt; ctx.fillRect(0, h * 0.82, w, h * 0.18);
}
