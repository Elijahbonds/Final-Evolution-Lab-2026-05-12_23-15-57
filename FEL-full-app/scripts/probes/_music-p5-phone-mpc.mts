// MUSIC-SUITE P5 (2026-09-25), phone-mpc — the phone as an MPC pad, measured end to end in a browser: the real Academy
// (/dev/music, no GameShell, database offline) as the HOST and the real phone page (/controller/<code>, a 390 px touch
// context) as the PHONE, joined over the real controller link (signaling on the dev server's in-memory store, then a
// WebRTC data channel between the two pages). Touches are CDP touch events with a FORCE and a RADIUS, so the phone's
// velocity rule reads real PointerEvent.pressure / width / height. Checks:
//   1. the room is NOT opened on a STUDIO-only visit; it opens on FLIP (one POST /api/controller-link/rooms);
//   2. a pad hit on FLIP plays through FlipPad at 0.9 × the MEASURED velocity (the first touch: fixed 0.9), through the
//      row's strip (never straight to the speakers); the phone buzzed once per hit (navigator.vibrate(12));
//   3. switch to STUDIO / LIBRARY / LISTEN and back: still ONE room (no new POST), the phone still "Connected", and a pad
//      hit on each tab still sounds — played by the room (how: 'played');
//   4. BANK B on the phone: the room's bank is B, a hit plays bank B's chop, FLIP opens on B;
//   5. PLAY / REC / pad hits / STOP from the phone on the STUDIO tab: the transport runs, the REC chip shows, the hits
//      land in the grid with their velocities (the saved project), STOP stops it;
//   6. every tap is moved back by half the measured round trip (atSec = arrival − min(rtt/2, 50 ms)); two pages on one
//      machine have a ~0 ms round trip, so every data-channel message is held NET_MS (default 20) each way, and the
//      correction is compared with the one-way delay the tap really crossed.
// Note: two pages at once (the host and the tiny phone page) — the link needs both ends.
// Usage: node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p5-phone-mpc.mts   (BASE, OUT env override)
import { chromium, type BrowserContext, type CDPSession, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p5/phone';
fs.mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
  '--disable-features=WebRtcHideLocalIpsWithMdns'];   // two headless pages on one machine: plain host candidates, no mDNS
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[p5phone +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { base: BASE, at: new Date().toISOString(), frames: {}, pageErrors: [] as string[], checks: [] as Any[], hits: [] as Any[] };
const check = (name: string, pass: boolean, got: unknown, want: unknown) => { R.checks.push({ name, pass, got, want }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(got)); };
const frame = async (p: Page, name: string, full = true) => { const path = `${OUT}/p5phone-${name}.png`; await p.screenshot({ path, fullPage: full }); R.frames[name] = path; };
const STUDIO_TIER = `try { if (!localStorage.getItem('fel-music-progress')) localStorage.setItem('fel-music-progress', '{"patternsMade":1,"sectionsSaved":2,"chainEntries":2}'); } catch {}`;
// every AudioBufferSourceNode.start on the host: its buffer, the gain it goes through, and whether it reaches the speakers
const AUDIO_SPY = `(() => {
  const L = []; window.__AUDIO_LOG__ = L;
  const oc = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (d, ...r) { try { this.__to = d; } catch (e) {} return oc.call(this, d, ...r); };
  const os = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (when, ...r) {
    try {
      const b = this.buffer, g = this.__to, s = g && g.__to, dst = this.context.destination;
      L.push({ t: this.context.currentTime, len: b ? b.length : -1, gain: g && g.gain ? Math.round(g.gain.value * 10000) / 10000 : null, toSpeakers: g === dst || s === dst });
      if (L.length > 4000) L.splice(0, 1000);
    } catch (e) {}
    return os.call(this, when, ...r);
  };
})();`;
// the phone's vibrator, counted
const VIBE_SPY = `(() => { const V = []; window.__VIBE__ = V; try { Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (p) => { V.push(p); return true; } }); } catch (e) {} })();`;
// A NETWORK: both pages are on one machine (a round trip of 0-1 ms), so the round-trip correction would be measured on
// nothing. Every JSON message on the data channel is held NET_MS each way — the phone's inputs and pongs, the host's
// pings — so the host measures a ~2 × NET_MS round trip and a tap really arrives NET_MS after the finger.
const NET_MS = Number(process.env.NET_MS ?? 20);
const NET_DELAY = (what: 'all' | 'ping') => `(() => { const S = []; window.__NET__ = S; const os = RTCDataChannel.prototype.send; RTCDataChannel.prototype.send = function (d) {
  if (typeof d === 'string' && (${what === 'all' ? 'true' : `d.indexOf('"type":"ping"') >= 0`})) { const ch = this; const q = Date.now(); setTimeout(() => { S.push({ kind: (d.match(/"type":"(\\w+)"/) || [])[1], queued: q, sent: Date.now() }); if (S.length > 500) S.splice(0, 100); try { os.call(ch, d); } catch (e) {} }, ${NET_MS}); return; }
  return os.call(this, d); }; })();`;

const qa = (p: Page, id: string) => p.locator(`[data-qa="${id}"]`);
const btn = (p: Page, name: string | RegExp) => p.getByRole('button', { name, exact: typeof name === 'string' }).first();
const audioLog = (p: Page) => p.evaluate(() => ((window as Any).__AUDIO_LOG__ as Any[]).slice());
const clearLog = (p: Page) => p.evaluate(() => { ((window as Any).__AUDIO_LOG__ as Any[]).length = 0; });
const phoneState = (p: Page) => p.evaluate(() => (window as Any).__FEL_PHONE__ ?? null);
const tab = async (p: Page, name: 'STUDIO' | 'FLIP' | 'LIBRARY' | 'LISTEN') => { await btn(p, name).click(); await p.waitForTimeout(350); };

/** One touch on a phone button: a CDP touch with this force and radius (Chrome turns it into pointerdown with pressure / width / height). */
async function touch(phone: Page, cdp: CDPSession, label: string, force: number, radius: number): Promise<void> {
  const b = phone.getByRole('button', { name: label, exact: true }).first();
  const box = (await b.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, force, radiusX: radius, radiusY: radius, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
/** Touch a phone pad and read what the host did with it. */
async function hit(host: Page, phone: Page, cdp: CDPSession, label: string, force: number, radius: number, what: string): Promise<Any> {
  const before = (await phoneState(host))?.hits ?? 0;
  await clearLog(host);
  await touch(phone, cdp, label, force, radius);
  await host.waitForFunction((n) => ((window as Any).__FEL_PHONE__?.hits ?? 0) > n, before, { timeout: 8000 }).catch(() => undefined);
  await host.waitForTimeout(120);
  const st = await phoneState(host);
  const audio = (await audioLog(host)).filter((a: Any) => a.len > 0);
  const row = { what, label, force, radius, last: st?.last ?? null, bank: st?.bank ?? null, audio };
  R.hits.push(row);
  return row;
}
const oneWay = (rtt: number | null): number => (rtt && rtt > 0 ? Math.min(rtt / 2, 50) / 1000 : 0);

async function run(browser: Any): Promise<void> {
  const hostCtx: BrowserContext = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await hostCtx.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
  await hostCtx.addInitScript({ content: STUDIO_TIER });
  await hostCtx.addInitScript({ content: AUDIO_SPY });
  await hostCtx.addInitScript({ content: NET_DELAY('ping') });
  const host = await hostCtx.newPage();
  host.on('pageerror', (e) => R.pageErrors.push(`host: ${String(e).slice(0, 300)}`));
  let roomPosts = 0;
  host.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/api/controller-link/rooms')) roomPosts++; });

  await host.goto(`${BASE}/dev/music?stage=studio`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  const start = host.getByRole('button', { name: 'TAP TO START' });
  await start.waitFor({ timeout: 240000 });
  await start.click();
  await host.waitForFunction(() => !!(window as Any).__FEL_GRID__, undefined, { timeout: 60000 });
  await host.waitForTimeout(1500);
  check('1a. a STUDIO-only visit opens no phone room (as before)', roomPosts === 0 && (await qa(host, 'phone-room').count()) === 0, { roomPosts }, { roomPosts: 0 });

  // FLIP: the lesson puts the FEL theme on bank A; a second source on bank B
  await tab(host, 'FLIP');
  await host.waitForFunction(() => { const f = (window as Any).__FEL_FLIP__; return f && f.decoded && f.slices > 0; }, undefined, { timeout: 90000 });
  const bankA = await host.evaluate(() => (window as Any).__FEL_FLIP__);
  await qa(host, 'flip-bank-B').click();
  await qa(host, 'flip-shelf-loops').click();
  await btn(host, 'Pocket Bass').click();
  await host.waitForFunction(() => { const f = (window as Any).__FEL_FLIP__; return f && f.bank === 'B' && f.decoded && f.slices > 0 && f.banks?.[1]; }, undefined, { timeout: 90000 });
  await qa(host, 'flip-bank-A').click();
  await host.waitForTimeout(400);
  await host.waitForFunction(() => /^[A-Z0-9]{4,8} ·/.test(document.querySelector('[data-testid="host-lobby-badge"]')?.textContent ?? ''), undefined, { timeout: 60000 });
  const badge = (await host.locator('[data-testid="host-lobby-badge"]').first().textContent()) ?? '';
  const code = /^([A-Z0-9]{4,8}) ·/.exec(badge)?.[1] ?? '';
  // next dev runs React StrictMode (the app router's default): a mount's effects run, clean up and run again, so the
  // FLIP visit's room is created twice in dev (the first disposed at once) — a production build creates one
  const postsAtFlip = roomPosts;
  check('1b. FLIP opens the phone room (a code on the badge; 1 POST, 2 under dev StrictMode)', postsAtFlip >= 1 && postsAtFlip <= 2 && !!code, { roomPosts, code, bankA: bankA.source, bankB: (await host.evaluate(() => (window as Any).__FEL_FLIP__.banks)) }, { roomPosts: '1 (2 in dev)' });

  // THE PHONE
  const phoneCtx: BrowserContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await phoneCtx.addInitScript({ content: VIBE_SPY });
  await phoneCtx.addInitScript({ content: NET_DELAY('all') });
  const phone = await phoneCtx.newPage();
  phone.on('pageerror', (e) => R.pageErrors.push(`phone: ${String(e).slice(0, 300)}`));
  const cdp = await phoneCtx.newCDPSession(phone);
  await phone.goto(`${BASE}/controller/${code}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await phone.getByRole('button', { name: 'JOIN' }).waitFor({ timeout: 120000 });
  await phone.getByRole('button', { name: 'JOIN' }).click();
  await phone.waitForFunction(() => /Connected/.test(document.querySelector('header')?.textContent ?? ''), undefined, { timeout: 60000 });
  await phone.getByRole('button', { name: '16', exact: true }).waitFor({ timeout: 30000 });
  await host.waitForFunction(() => Number(document.querySelector('[data-qa="phone-room"]')?.getAttribute('data-phones') ?? 0) === 1, undefined, { timeout: 30000 });
  await host.waitForTimeout(2600);   // a few pings: the round trip is measured
  const phoneLabels = await phone.locator('main button').allTextContents();
  check('2a. the phone is an MPC: BANK A–D, 16 pads, PLAY / STOP / REC', phoneLabels.join('|') === ['BANK A', 'BANK B', 'BANK C', 'BANK D', ...Array.from({ length: 16 }, (_, i) => String(i + 1)), '▶ PLAY', '■ STOP', '● REC'].join('|'), phoneLabels, 'BANK A–D, 1–16, PLAY/STOP/REC');
  await frame(phone, 'phone-mpc', false);

  // 2. pads on FLIP, with a measured velocity after the first touch
  const h1 = await hit(host, phone, cdp, '1', 0.5, 10, 'flip: first touch (nothing measured yet)');
  const h2 = await hit(host, phone, cdp, '2', 0.25, 10, 'flip: pressure varies now');
  const h3 = await hit(host, phone, cdp, '3', 0.81, 10, 'flip: firm');
  const g = (h: Any) => h.audio[0]?.gain ?? null;
  check('2b. FLIP: the first hit plays at the fixed 0.9 (no velocity invented)', h1.last?.how === 'flippad' && h1.last?.velocity === null && g(h1) === 0.9, { how: h1.last?.how, v: h1.last?.velocity, gain: g(h1) }, { how: 'flippad', v: null, gain: 0.9 });
  check('2c. FLIP: a measured press plays at 0.9 × sqrt(force) (0.25 → 0.45, 0.81 → 0.81)', h2.last?.velocity === 0.5 && Math.abs(g(h2) - 0.45) < 1e-3 && h3.last?.velocity === 0.9 && Math.abs(g(h3) - 0.81) < 1e-3,
    { v2: h2.last?.velocity, gain2: g(h2), v3: h3.last?.velocity, gain3: g(h3) }, { v2: 0.5, gain2: 0.45, v3: 0.9, gain3: 0.81 });
  check('2d. a phone hit goes through the desk, never straight to the speakers', [h1, h2, h3].every((h) => h.audio.length > 0 && h.audio.every((a: Any) => !a.toSpeakers)), [h1, h2, h3].map((h) => h.audio.map((a: Any) => a.toSpeakers)), 'all false');
  R.phoneNet = (await phone.evaluate(() => ((window as Any).__NET__ as Any[]).filter((x) => x.kind === 'input').slice(-3))).map((x: Any) => ({ ...x, heldMs: x.sent - x.queued }));
  R.phoneNetPong = (await phone.evaluate(() => ((window as Any).__NET__ as Any[]).filter((x) => x.kind === 'pong').slice(-3))).map((x: Any) => ({ heldMs: x.sent - x.queued }));
  const vib1 = await phone.evaluate(() => ((window as Any).__VIBE__ as number[]).slice());
  check('2e. the phone buzzed once per hit, 12 ms', vib1.length === 3 && vib1.every((v) => v === 12), vib1, [12, 12, 12]);
  const feel = await phone.locator('[data-testid="pad-feel"]').textContent().catch(() => null);
  check('2f. the phone says what it measures', /velocity: how hard you press/.test(feel ?? ''), feel, 'buzz on each hit · velocity: how hard you press');
  // the network a tap crossed: the NET_MS hold + the channel and the host (the phone's actual send → the host's handler).
  // The hold is a JS timer, which fires 10-15 ms late right after a touch while the phone's thread is busy; that is the
  // simulation's, not a network's (a real send is not a timer), so it is reported (timerLateMs) and not counted.
  const rtts = [h1, h2, h3].map((h, i) => {
    const net = R.phoneNet[i];
    return { rtt: h.last?.rttMs, arrival: h.last?.arrivalSec, at: h.last?.atSec, correctionMs: Math.round((h.last?.arrivalSec - h.last?.atSec) * 10000) / 10,
      networkOneWayMs: net && h.last ? NET_MS + (h.last.arrivedAt - net.sent) : null, timerLateMs: net ? net.heldMs - NET_MS : null, uncorrectedLateMs: h.last ? h.last.arrivedAt - h.last.sentAt : null };
  });
  check('6a. each tap is moved back by half the measured round trip (capped at 50 ms)', rtts.every((r) => typeof r.rtt === 'number' && r.rtt > 0 && Math.abs((r.arrival - r.at) - oneWay(r.rtt)) < 1e-6), rtts, 'arrival − at = min(rtt/2, 50 ms)');
  check(`6b. with ${NET_MS} ms each way, the correction lands within 3 ms of the network's one-way delay`, rtts.every((r) => r.networkOneWayMs !== null && Math.abs(r.correctionMs - r.networkOneWayMs) <= 3), rtts.map((r) => ({ correction: r.correctionMs, network: r.networkOneWayMs, timerLate: r.timerLateMs })), `|correction − network one-way| ≤ 3 ms (uncorrected: every tap ~${NET_MS} ms late)`);

  // 3. other tabs: the same room, the phone still connected, the pads still sound (played by the room)
  const perTab: Any[] = [];
  for (const t of ['STUDIO', 'LIBRARY', 'LISTEN', 'FLIP', 'STUDIO'] as const) {
    await tab(host, t);
    const conn = await phone.evaluate(() => document.querySelector('header')?.textContent ?? '');
    const h = await hit(host, phone, cdp, '2', 0.6, 10, `tab ${t}`);
    perTab.push({ tab: t, roomPosts, phone: conn, how: h.last?.how, view: h.last?.view, sounded: h.audio.length, gain: g(h) });
  }
  const codeAfter = /^([A-Z0-9]{4,8}) ·/.exec((await host.locator('[data-testid="host-lobby-badge"]').first().textContent()) ?? '')?.[1] ?? '';
  check('3a. tab switches never close the room (no new room POST, the same code) and the phone stays connected', roomPosts === postsAtFlip && codeAfter === code && perTab.every((r) => /Connected/.test(r.phone)), { roomPosts, postsAtFlip, code, codeAfter, perTab: perTab.map((r) => [r.tab, r.phone]) }, { newPosts: 0, phone: 'Connected' });
  check('3b. a pad hit sounds on EVERY tab — FlipPad on FLIP, the room elsewhere', perTab.every((r) => r.sounded > 0 && r.how === (r.tab === 'FLIP' ? 'flippad' : 'played')), perTab.map((r) => [r.tab, r.how, r.sounded, r.gain]), 'sounded on each');
  await frame(host, 'host-studio-phone-connected', false);

  // 4. BANK B from the phone on the STUDIO tab
  const aLen = perTab[perTab.length - 1];
  const hA = await hit(host, phone, cdp, '1', 0.6, 10, 'studio: bank A pad 1');
  await touch(phone, cdp, 'BANK B', 0.5, 10);
  await host.waitForFunction(() => (window as Any).__FEL_PHONE__?.bank === 'B', undefined, { timeout: 5000 }).catch(() => undefined);
  await host.waitForTimeout(900);   // the room bakes bank B's pads ahead
  const hB = await hit(host, phone, cdp, '1', 0.6, 10, 'studio: bank B pad 1');
  check('4a. BANK B on the phone: the room plays bank B\'s pad 1 (another chop)', hB.last?.how === 'played' && hB.bank === 'B' && hB.audio.length > 0 && hA.audio.length > 0 && hB.audio[0].len !== hA.audio[0].len,
    { bankALen: hA.audio[0]?.len, bankBLen: hB.audio[0]?.len, bank: hB.bank }, 'different chops, bank B');
  await tab(host, 'FLIP');
  const fB = await host.evaluate(() => (window as Any).__FEL_FLIP__?.bank);
  check('4b. FLIP opens on the bank the phone picked', fB === 'B', fB, 'B');
  void aLen;

  // 5. transport + REC from the phone, on the STUDIO tab
  await tab(host, 'STUDIO');
  await touch(phone, cdp, '● REC', 0.5, 10);
  await host.waitForTimeout(300);
  const chip = await qa(host, 'phone-rec-chip').count();
  await touch(phone, cdp, '▶ PLAY', 0.5, 10);
  await host.waitForFunction(() => !!(window as Any).__FEL_FLIP_ROOM__?.clock(), undefined, { timeout: 8000 }).catch(() => undefined);
  const running = await host.evaluate(() => !!(window as Any).__FEL_FLIP_ROOM__?.clock());
  await host.waitForTimeout(2600);   // past any count-in
  const recHits: Any[] = [];
  for (const [label, force] of [['1', 0.3], ['2', 0.9], ['3', 0.5], ['4', 0.7]] as const) { recHits.push(await hit(host, phone, cdp, label, force, 10, `studio rec: pad ${label}`)); await host.waitForTimeout(260); }
  await frame(host, 'host-studio-rec', false);
  await touch(phone, cdp, '■ STOP', 0.5, 10);
  await host.waitForTimeout(500);
  const stopped = await host.evaluate(() => !(window as Any).__FEL_FLIP_ROOM__?.clock());
  await host.waitForFunction(() => /Saved on this device ·/.test(document.querySelector('[data-qa="save-status"]')?.textContent ?? ''), undefined, { timeout: 8000 }).catch(() => undefined);
  await host.waitForTimeout(800);
  const stored = await host.evaluate(() => new Promise<Any>((res) => {
    const pid = (window as Any).__FEL_PROJECT__?.id;
    const r = indexedDB.open('fel-studio', 1);
    r.onsuccess = () => { const db = r.result; const q = db.transaction('projects', 'readonly').objectStore('projects').get(pid); q.onsuccess = () => { db.close(); res(q.result ?? null); }; };
    r.onerror = () => res(null);
  }));
  const proj = stored?.body ?? stored?.project ?? stored;
  const flipTracks = (proj?.tracks ?? []).filter((t: Any) => /^flip_/.test(t.sampleId)).map((t: Any) => ({
    id: t.sampleId, lit: (t.pattern ?? []).map((on: boolean, i: number) => (on ? i : -1)).filter((i: number) => i >= 0),
    vels: t.vels ? (t.pattern ?? []).map((on: boolean, i: number) => (on ? t.vels[i] : null)).filter((v: number | null) => v !== null) : null,
  }));
  const vRec = recHits.map((h) => h.last?.velocity);
  const allVels = flipTracks.flatMap((t: Any) => t.vels ?? []);
  check('5a. REC from the phone arms ARM REC and the STUDIO tab says so', chip === 1, chip, 1);
  check('5b. PLAY from the phone starts the transport; STOP stops it', running && stopped, { running, stopped }, { running: true, stopped: true });
  check('5c. pad hits on the STUDIO tab land in the grid, with the velocities the phone measured', flipTracks.some((t: Any) => t.lit.length > 0) && vRec.filter((v) => typeof v === 'number').every((v) => allVels.some((x: number) => Math.abs(x - v) < 1e-6)),
    { flipTracks, measured: vRec }, 'lit steps; stored vels include each measured velocity');
  // the bank on the phone's pads is baked ahead (and again after each recorded hit lets the chop cache go): no hit waits
  const toast = await host.evaluate(() => document.body.innerText.match(/Phone: bank [A-D] was still loading[^\n]*/)?.[0] ?? null);
  check('5d. every STUDIO-tab hit found its chop already baked (none waited, none dropped)', recHits.every((h) => h.last?.how === 'played' && h.audio.length > 0) && !toast, { how: recHits.map((h) => h.last?.how), sounded: recHits.map((h) => h.audio.length), toast }, 'played ×4, no loading line');

  R.roomPosts = roomPosts;
  R.phoneVibes = await phone.evaluate(() => ((window as Any).__VIBE__ as number[]).length);
  await phoneCtx.close();
  await hostCtx.close();
}

const browser = await chromium.launch({ executablePath: chromiumExe(), args: ARGS, headless: true });
try { await run(browser); } catch (e) { R.error = String((e as Error)?.stack ?? e).slice(0, 2000); log('ERROR', R.error); } finally { await browser.close(); }
R.passed = R.checks.filter((c: Any) => c.pass).length;
R.total = R.checks.length;
fs.writeFileSync(`${OUT}/p5phone-proof.json`, JSON.stringify(R, null, 1));
log(`${R.passed}/${R.total} checks, ${R.pageErrors.length} page errors → ${OUT}/p5phone-proof.json`);
