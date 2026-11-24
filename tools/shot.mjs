// r26 shot tool: serves game/, screenshots each staged scene with the
// Playwright headless shell, converts to JPEG until each is <= 256 KiB.
// Usage: node tools/shot.mjs [s1|s2|s3|s4] (default: all four)
import { spawn, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';

const run = promisify(execFile);
const SHOTS = {
  s1: 's1-chase.jpg', s2: 's2-shootout.jpg', s3: 's3-stats.jpg', s4: 's4-title.jpg',
};
const SHELL = `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell`;
const PORT = 8901;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function waitServer(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return true; } catch { /* retry */ }
    await sleep(250);
  }
  return false;
}
async function shotOne(name, out) {
  const png = `/tmp/r26-${name}.png`;
  const url = `http://127.0.0.1:${PORT}/?shot=${name}`;
  await run(SHELL, ['--no-sandbox', '--disable-gpu', '--window-size=1280,800', '--virtual-time-budget=25000', `--screenshot=${png}`, url], { timeout: 180000 });
  // PNG -> JPEG, turunkan kualitas sampai <= 256 KiB.
  for (const q of [85, 70, 55, 45, 35]) {
    await run('python3', ['-c', `from PIL import Image; im=Image.open(${JSON.stringify(png)}).convert('RGB'); im.save(${JSON.stringify(out)}, quality=${q}); print(${JSON.stringify(out)})`]);
    const { size } = await import('node:fs').then((fs) => fs.promises.stat(out));
    console.log(`${name} -> ${out} q${q} ${size} bytes`);
    if (size <= 262144) return size;
  }
  const { size } = await import('node:fs').then((fs) => fs.promises.stat(out));
  return size;
}
const want = process.argv[2] ? [process.argv[2]] : Object.keys(SHOTS);
if (!existsSync(SHELL)) { console.error('headless shell tidak ada:', SHELL); process.exit(1); }
const server = spawn('node', ['serve.ts', '--port', String(PORT)], { stdio: 'inherit' });
const ok = await waitServer(`http://127.0.0.1:${PORT}/index.html`);
if (!ok) { console.error('server tidak naik'); server.kill(); process.exit(1); }
const results = {};
for (const name of want) {
  const out = `screenshots/${SHOTS[name]}`;
  try { results[name] = await shotOne(name, out); }
  catch (err) { console.error(name, 'GAGAL:', err.message); results[name] = -1; }
}
server.kill();
console.log(JSON.stringify(results));
