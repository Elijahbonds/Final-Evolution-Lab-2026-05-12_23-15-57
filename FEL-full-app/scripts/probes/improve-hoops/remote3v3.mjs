// improve-hoops-2 phase 10 (2026-11-22): does a REMOTE human's 3v3 body pass and shoot on his own buttons? Two browser pages, one
// shared 3v3 game, against a LOCAL netd (today's, or the pre-party one production runs: NETD=old).
//
//   node remote3v3.mjs <outDir> <tag>
//   env: PORT=3881 (the rig site, scripts/probes/gameplay-clean/serve.mjs via with-sites.sh) NETD_PORT=3882 NETD=current|old
//        BUDGET_S=420 (how long to try) VW=480 VH=270
//
// The page is the gameplay-clean rig (scripts/probes/gameplay-clean/entry.tsx: the real /play/threevthree loader). Its bundle reads
// process.env at run time, so NEXT_PUBLIC_NETD_URL is put there by an init script (the site is the plain rig build). The host is peer
// `hP` (canonical 0: runs the game), the guest `net1` (canonical 3: the host's foe0 — "2 humans are 1-on-1 with bots").
// The host page plays its own offence (run at the rim, Square held and let go) until the rivals have the ball; the GUEST then presses
// J (pass) the first time his body has it and L (Square) the next. Read off the host's console (the runner): "[3V3-NET] foe0 (a remote
// human) has the ball / passes to … / goes up: …" and the rival release / dunk lines that follow. PASS = the pass left and the shot
// went up on the guest's presses. Each page's shared-game role is read from window.__felNet.
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../../../package.json', import.meta.url).pathname);
const { chromium } = require('playwright-core');

const [OUT, TAG] = process.argv.slice(2);
if (!OUT || !TAG) { console.error('usage: node remote3v3.mjs <outDir> <tag>'); process.exit(2); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PORT = process.env.PORT ?? '3881', NETD_PORT = Number(process.env.NETD_PORT ?? 3882), OLD = process.env.NETD === 'old';
const BUDGET = Number(process.env.BUDGET_S ?? 420) * 1000, VW = Number(process.env.VW ?? 480), VH = Number(process.env.VH ?? 270);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// the local netd
const netdDir = path.join(ROOT, 'server/netd');
const oldFile = path.join(netdDir, 'src/.probe-old-index.ts');
if (OLD) fs.writeFileSync(oldFile, execFileSync('git', ['show', '6c438074^:FEL-full-app/server/netd/src/index.ts'], { cwd: ROOT, encoding: 'utf8' }));
const netd = spawn(process.execPath, ['--import', 'tsx', OLD ? 'src/.probe-old-index.ts' : 'src/index.ts'], { cwd: netdDir, env: { ...process.env, PORT: String(NETD_PORT) }, stdio: ['ignore', fs.openSync(path.join(OUT, `${TAG}-netd.log`), 'w'), fs.openSync(path.join(OUT, `${TAG}-netd.err`), 'w')] });
const stop = () => { try { netd.kill(); } catch { /* gone */ } try { if (OLD) fs.unlinkSync(oldFile); } catch { /* none */ } };
process.on('exit', stop);
for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${NETD_PORT}/healthz`)).ok) break; } catch { /* not yet */ } await sleep(250); }

const row = { tag: TAG, netd: OLD ? 'old' : 'current', host: [], guest: [], errors: [] };
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const room = `ih${Date.now() % 100000}`;
const INIT = `globalThis.process = { env: { NODE_ENV: 'production', NEXT_PUBLIC_NETD_URL: 'ws://127.0.0.1:${NETD_PORT}' } };`
  // FAST: the render watchdog's 64x64 luma sample reads a lit frame (hoops-gap drive.mjs WD_OFF), so an undrawn canvas is not "black"
  + (process.env.FAST !== '0' ? `{ const gid = CanvasRenderingContext2D.prototype.getImageData; CanvasRenderingContext2D.prototype.getImageData = function (x, y, w, h, ...r) { const d = gid.call(this, x, y, w, h, ...r); if (w === 64 && h === 64) d.data.fill(128); return d; }; }` : '');
async function open(peer, sink) {
  const ctx = await b.newContext({ viewport: { width: VW, height: VH } });
  await ctx.addInitScript({ content: INIT });
  const p = await ctx.newPage();
  p.on('console', (m) => { const t = m.text(); if (/3V3-|FEL-NET|load failed/.test(t) && !/3V3-PP|3V3-PACE|3V3-STICK|3V3-HANDLE/.test(t) && sink.length < 1500) sink.push(`${Math.round((Date.now() - T0) / 100) / 10} ${t.slice(0, 200)}`); });
  p.on('pageerror', (e) => row.errors.push(`${peer}: ${String(e).slice(0, 200)}`));
  await p.goto(`http://127.0.0.1:${PORT}/index.html?mode=threevthree&net=${room}&peer=${peer}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  return p;
}
const T0 = Date.now();
const phase = (p) => p.evaluate(() => window.__sessionStore?.view().phase ?? null).catch(() => null);
// One page loads at a time: a 3v3 load blocks a page's main thread for tens of seconds on this rig, and a page that cannot answer
// netd's heartbeat is dropped (it rejoins after its load). The host loads first, so it is the room's first page and runs the game.
const host = await open('hP', row.host);
for (let t = Date.now(); Date.now() - t < 240000; await sleep(500)) { if ((await phase(host)) === 'ready') break; }
row.hostReadyS = Math.round((Date.now() - T0) / 100) / 10;
const guest = await open('net1', row.guest);
for (let t = Date.now(); Date.now() - t < 240000; await sleep(500)) { if ((await phase(guest)) === 'ready') break; }
row.guestReadyS = Math.round((Date.now() - T0) / 100) / 10;
// both in the room, seeing each other
const net = (p) => p.evaluate(() => window.__felNet ? { role: window.__felNet.role, peers: window.__felNet.peers, status: window.__felNet.status } : null).catch(() => null);
for (let t = Date.now(); Date.now() - t < 60000; await sleep(500)) { const a = await net(host), g = await net(guest); if (a?.status === 'open' && g?.status === 'open' && a.peers.includes('net1') && g.peers.includes('hP')) break; }
for (const p of [host, guest]) { const btn = p.locator('button', { hasText: /tap to start/i }).first(); if (await btn.count()) await btn.click({ timeout: 10000 }).catch(() => {}); }
await sleep(3000);
// FAST=1 (default): the GPU draws are skipped on both pages (the hoops-gap rig's NODRAW) — the game still runs every frame, on this
// software GPU about ten times as many of them; the rig's production page publishes the scene (an agent run: lib/agentRunHooks)
if (process.env.FAST !== '0') for (const p of [host, guest]) await p.evaluate(() => { const e = window.__FEL_DEV__?.scene?.getEngine(); if (e) { e.drawElementsType = () => {}; e.drawArraysType = () => {}; } return !!e; }).then((ok) => { row.fast = (row.fast ?? 0) + (ok ? 1 : 0); }).catch(() => {});
row.phases = { host: await phase(host), guest: await phase(guest) };
for (const p of [host, guest]) await p.evaluate(() => { window.__btn = { A: 0, X: 0 }; window.__FEL_DEV__?.input?.on?.((e) => { if (e.t === 'button' && e.pressed && (e.btn === 'A' || e.btn === 'X')) window.__btn[e.btn]++; }); }).catch(() => {});
row.roles = { host: await net(host), guest: await net(guest) };
// the page that runs the game logs the remote human's plays; the other page is the remote human (either way his body is the
// runner's foe0: the seats alternate teams). Re-read each round: a rejoin can move who runs it.
let runner = host, human = guest, runLog = row.host;
const pickRunner = async () => { const g = await net(guest); if (g?.role === 'run' && (await net(host))?.role !== 'run') { runner = guest; human = host; runLog = row.guest; } else { runner = host; human = guest; runLog = row.host; } };
await pickRunner(); row.runner = runner === host ? 'host' : 'guest';
const has = (re) => runLog.some((l) => re.test(l));
// two pages in one browser: a key reaches a page only while it is the focused one (cur1–cur3: no press of either page landed), so
// each press brings its page to the front first, and the press is counted on the page's own input bus
const front = async (p) => { await p.bringToFront().catch(() => {}); await p.evaluate(() => window.focus()).catch(() => {}); };
const key = async (p, k, ms = 120) => { await front(p); await p.keyboard.down(k).catch(() => {}); await sleep(ms); await p.keyboard.up(k).catch(() => {}); };
let passed = false, shot = false, haveSeen = 0;
const end = Date.now() + BUDGET;
while (Date.now() < end && !(passed && shot)) {
  await pickRunner();
  const seen = runLog.filter((l) => /foe0 \(a remote human\) has the ball/.test(l)).length;
  if (seen > haveSeen) {   // the guest's body has it: his press
    haveSeen = seen;
    await sleep(1200);
    if (!passed) { await key(human, 'j'); await sleep(2500); passed = has(/foe0 \(a remote human\) passes to/); }
    else { await key(human, 'l', 600); await sleep(4000); shot = has(/foe0 \(a remote human\) goes up/); }
    continue;
  }
  // the host plays offence: at the rim and up (W toward the rim), so possessions change hands
  await front(runner); await runner.keyboard.down('w').catch(() => {}); await sleep(1800); await runner.keyboard.up('w').catch(() => {});
  await key(runner, 'l', 500);
  // the remote human, off the ball, calls for it now and then (the call-for-ball path)
  if (!passed && Math.random() < 0.2) await key(human, 'j');
  await sleep(1500);
}
row.passed = passed; row.shot = shot;
row.calledForIt = has(/\(a remote human\) calls for it/);
row.releaseAfterShot = shot && runLog.some((l) => /rival release|rival dunk|3V3-RIM\] rival shot/.test(l));
row.pass = passed && shot;
row.wallS = Math.round((Date.now() - T0) / 1000);
row.phasesEnd = { host: await phase(host), guest: await phase(guest) };
row.busPresses = { host: await host.evaluate(() => window.__btn ?? null).catch(() => null), guest: await guest.evaluate(() => window.__btn ?? null).catch(() => null) };
row.netStats = { host: await host.evaluate(() => window.__felNet?.stats ?? null).catch(() => null), guest: await guest.evaluate(() => window.__felNet?.stats ?? null).catch(() => null) };
await host.screenshot({ path: path.join(OUT, `${TAG}-host.jpg`), type: 'jpeg', quality: 60 }).catch(() => {});
await guest.screenshot({ path: path.join(OUT, `${TAG}-guest.jpg`), type: 'jpeg', quality: 60 }).catch(() => {});
fs.writeFileSync(path.join(OUT, `${TAG}.json`), JSON.stringify(row, null, 1));
console.log(`${TAG} netd ${row.netd}: ${row.pass ? 'PASS' : 'FAIL'} — pass ${passed}, shot ${shot}, called ${row.calledForIt}, roles ${JSON.stringify(row.roles)}, ${row.errors.length} page errors, ${row.wallS} s`);
await b.close();
stop();
