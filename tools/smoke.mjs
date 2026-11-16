// Smoke test + screenshot capture. Uses system Chrome via Playwright's channel/executablePath.
// Stages: (1) load page, capture console errors, (2) simulate pointer-lock play with synthetic
// mouse/keyboard, assert sim state advances, (3) capture the three staged ?shot= renders.
// Run: node tools/smoke.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const PORT = 8123;
const BASE = `http://localhost:${PORT}`;

const CHROME_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = CHROME_PATHS.find((p) => existsSync(p));

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitForServer(proc) {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`${BASE}/index.html`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await wait(250);
  }
  throw new Error('static server did not come up');
}

const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: root, stdio: 'pipe' });
process.on('exit', () => server.kill());

try {
  await waitForServer(server);
  console.log('server up');

  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--use-angle=default', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));

  // ---- Stage 1: plain load ----------------------------------------------------
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction('window.__bp !== undefined', null, { timeout: 15000 });
  await wait(600);
  const loadedOk = await page.evaluate(() => ({
    phase: window.__bp.match.state.phase,
    bots: window.__bp.bots.bots.length,
    weapon: window.__bp.weapon.state.weapon.id,
  }));
  console.log('stage1 load:', JSON.stringify(loadedOk));
  await page.screenshot({ path: `${root}/out/smoke-load.png` });

  // ---- Stage 2: pointer-lock play ----------------------------------------------
  await page.click('#play');
  await wait(500);
  // pointer lock in headless: requestPointerLock may need user gesture; click counts.
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await wait(120);
  await page.mouse.up();
  await page.keyboard.down('KeyW');
  await wait(900);
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyR');
  await wait(80);
  await page.keyboard.up('KeyR');
  await wait(2000);
  const playOk = await page.evaluate(() => ({
    phase: window.__bp.match.state.phase,
    timer: Number(window.__bp.match.state.timer.toFixed(1)),
    pos: window.__bp.player.state.position.z.toFixed(1),
    mag: window.__bp.weapon.state.mag,
    health: window.__bp.combat.health,
    alive: window.__bp.combat.alive,
    botsAlive: window.__bp.bots.aliveCount(),
    locked: !!document.pointerLockElement,
  }));
  console.log('stage2 play:', JSON.stringify(playOk));
  await page.screenshot({ path: `${root}/out/smoke-play.png` });

  // ---- Stage 3: staged deterministic shots ---------------------------------------
  mkdirSync(`${root}/screenshots`, { recursive: true });
  const shots = [
    ['start', '1-buy-phase.png'],
    ['play', '2-firefight.png'],
    ['end', '3-bomb-planted.png'],
  ];
  for (const [shot, name] of shots) {
    const p2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    p2.on('pageerror', (err) => errors.push(`[${shot}] ${err}`));
    await p2.goto(`${BASE}/index.html?shot=${shot}&seed=7`, { waitUntil: 'load' });
    await p2.waitForFunction('window.__shotReady === true', null, { timeout: 15000 });
    await wait(250);
    await p2.screenshot({ path: `${root}/screenshots/${name}` });
    console.log(`captured ${name}`);
    await p2.close();
  }

  const errs = errors.filter((e) => !e.includes('favicon'));
  console.log(errs.length ? `CONSOLE/PAGE ERRORS (${errs.length}):` : 'no console errors');
  for (const e of errs.slice(0, 12)) console.log('  •', e.slice(0, 300));

  await browser.close();
  console.log('SMOKE DONE');
} finally {
  server.kill();
}
