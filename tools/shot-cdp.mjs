// r26 shot tool (CDP): serves game/, loads each staged scene in the headless
// shell, waits for boot (real time, not virtual-time), screenshots via CDP,
// converts to JPEG until each is <= 256 KiB.
// Usage: node tools/shot-cdp.mjs [s1|s2|s3|s4] (default: all four)
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';

const run = promisify(execFile);
const SHOTS = { s1: 's1-chase.jpg', s2: 's2-shootout.jpg', s3: 's3-stats.jpg', s4: 's4-title.jpg' };
const SHELL = `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell`;
const PORT = 8901;
const CDP = 9223;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitServer(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return true; } catch { /* retry */ }
    await sleep(250);
  }
  return false;
}
async function getWsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error('no CDP target');
}
async function toJpeg(png, out) {
  for (const q of [85, 70, 55, 45, 35]) {
    await run('python3', ['-c', `from PIL import Image; Image.open(${JSON.stringify(png)}).convert('RGB').save(${JSON.stringify(out)}, quality=${q})`]);
    const { size } = await import('node:fs').then((fs) => fs.promises.stat(out));
    console.log(`  -> ${out} q${q} ${size} bytes`);
    if (size <= 262144) return size;
  }
  const { size } = await import('node:fs').then((fs) => fs.promises.stat(out));
  return size;
}

const want = process.argv[2] ? [process.argv[2]] : Object.keys(SHOTS);
const server = spawn('node', ['serve.ts', '--port', String(PORT)], { stdio: 'ignore' });
const ok = await waitServer(`http://127.0.0.1:${PORT}/index.html`);
if (!ok) { console.error('server tidak naik'); server.kill(); process.exit(1); }
const shell = spawn(SHELL, ['--no-sandbox', '--disable-gpu', '--window-size=1280,800', `--remote-debugging-port=${CDP}`, 'about:blank'], { stdio: 'ignore' });
const ws = new WebSocket(await getWsUrl());
let id = 0; const pending = new Map(); const logs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled') logs.push(`[console.${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  if (m.method === 'Runtime.exceptionThrown') logs.push('[EXCEPTION] ' + JSON.stringify(m.params.exceptionDetails).slice(0, 300));
};
await new Promise((r) => { ws.onopen = r; });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
const results = {};
for (const name of want) {
  logs.length = 0;
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?shot=${name}` });
  let ready = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    await sleep(3000);
    const r = await send('Runtime.evaluate', { expression: `({loading: document.getElementById('loading')?.style.display, hasGame: !!window.__game, mode: window.__game?.mode})`, returnByValue: true });
    const v = r.result?.result?.value;
    if (v && v.loading === 'none' && v.hasGame) { ready = true; break; }
  }
  console.log(`${name}: ready=${ready} mode=${''} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  await sleep(2500);
  const png = `/tmp/r26-${name}.png`;
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot.result?.data) {
    writeFileSync(png, Buffer.from(shot.result.data, 'base64'));
    results[name] = await toJpeg(png, `screenshots/${SHOTS[name]}`);
  } else { results[name] = -1; }
  for (const l of logs.filter((x) => /EXCEPTION|updateHUD gagal|\[hud\]|GLB gagal|mobil pemain/.test(x)).slice(0, 8)) console.log('  ' + l);
}
shell.kill(); server.kill();
console.log(JSON.stringify(results));
process.exit(0);
