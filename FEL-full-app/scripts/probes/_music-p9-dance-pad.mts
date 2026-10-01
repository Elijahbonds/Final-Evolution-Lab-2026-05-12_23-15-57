// MUSIC-SUITE P9 (2026-09-29), moves-and-pads — the phone DANCE PAD and a DANCE CARD, end to end in a browser: the real
// Cypher (/dev/mode/dance on the lane's :3121 — every /play route is auth-gated and the dev database is down) as the HOST,
// with a dance card already on the device the way My Creations' DANCE IT leaves it (localStorage fel:danceCardPlay) and
// opened by its link (?card=<id>); the real phone page (/controller/<code>, a 390 px touch context) as the PHONE, joined
// over the real controller link (signaling on the dev server's in-memory store, a WebRTC data channel between the pages).
// Checks:
//   1. the pick screen opens ON the card (its name and tempo in the banner), not started;
//   2. the room's pairing badge is lazy (no room POST until tapped) and the phone gets the dance pad: the d-pad and
//      TOP ROCK · TWO STEP · ARM WAVE · SPIN (paired on the READY screen, as a player would, before START);
//   3. the phone's d-pad is the song pick: ▶ leaves the card (the list wraps to the first song), ◀ comes back, ▲ turns
//      free dance on and ▲ again off;
//   4. TOP ROCK on the phone starts the card: the count-in locks in card:<id> at the card's tempo, with its looped routine;
//   5. phone presses reach the judge while the card plays (judgements on the HUD); the lane names the captured moves.
// Usage: node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p9-dance-pad.mts   (BASE, OUT env override)
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p9/dance-pad';
fs.mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
  '--disable-features=WebRtcHideLocalIpsWithMdns'];
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[p9-pad +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { base: BASE, at: new Date().toISOString(), frames: {}, pageErrors: [] as string[], console: [] as string[], checks: [] as Any[] };
const check = (name: string, pass: boolean, got: unknown, want: unknown) => { R.checks.push({ name, pass, got, want }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(got).slice(0, 300)); };
const frame = async (p: Page, name: string) => { const path = `${OUT}/p9pad-${name}.png`; await p.screenshot({ path }); R.frames[name] = path; };

const CARD = {
  v: 1, id: 'p9-probe-card', title: 'Probe Routine', bpm: 100,
  sequence: [
    { clipId: 'dance_toprock_kick', beat: 0, holdBeats: 4, mirrored: false },
    { clipId: 'dance_pop_moonwalk', beat: 4, holdBeats: 4, mirrored: false },
    { clipId: 'dance_pop_robot', beat: 8, holdBeats: 4, mirrored: true },
    { clipId: 'dance_freeze_side', beat: 12, holdBeats: 4, mirrored: false },
  ],
};
const HOST_INIT = `
window.__name = window.__name || function (f) { return f; };
try { localStorage.setItem('fel:danceCardPlay', ${JSON.stringify(JSON.stringify(CARD))}); } catch (e) {}
(() => {
  const mk = () => ({ pressed: false, touched: false, value: 0 });
  const pad = { index: 0, id: 'fake (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: Date.now(), buttons: Array.from({ length: 17 }, mk) };
  navigator.getGamepads = () => [pad];
  window.__padBtn = (i, v) => { pad.buttons[i] = { pressed: v > 0.1, touched: v > 0, value: v }; pad.timestamp = Date.now(); };
})();`;
const VIBE = `window.__VIBES = 0; try { Object.defineProperty(navigator, 'vibrate', { value: () => { window.__VIBES++; return true; }, configurable: true }); } catch (e) {}`;

const hud = (p: Page): Promise<Any> => p.evaluate(() => { try { return JSON.parse(document.querySelector('pre')?.textContent ?? '{}'); } catch { return {}; } });

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ARGS });
  try {
    const hostCtx: BrowserContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await hostCtx.addInitScript({ content: HOST_INIT });
    const host = await hostCtx.newPage();
    host.on('pageerror', (e) => { R.pageErrors.push(`host: ${String(e).slice(0, 300)}`); });
    host.on('console', (m) => { const s = m.text(); if (/FEL-DANCE\] track|FEL-DANCE\] count-in/.test(s)) { R.console.push(s.slice(0, 300)); log('CON', s.slice(0, 200)); } });
    let roomPosts = 0;
    host.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/api/controller-link/rooms')) roomPosts++; });
    await host.goto(`${BASE}/dev/mode/dance?card=${CARD.id}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await host.waitForFunction(() => /· ready|· playing/.test(document.querySelector('pre')?.previousElementSibling?.textContent ?? ''), undefined, { timeout: 240000 });
    // the phone pairs on the READY screen, before START (the pick screen starts its focused song after PICK_TIMEOUT_SEC idle)
    // 2. the lazy badge → a room → the phone
    check('2a. the pad badge opens no room until it is tapped', roomPosts === 0, { roomPosts }, 0);
    await host.locator('[data-testid="host-lobby-badge"]').first().click();
    await host.waitForSelector('[data-testid="host-lobby-panel"]', { timeout: 30000 });
    await host.getByRole('button', { name: 'Close controller link' }).click();
    await host.waitForFunction(() => /· [A-Z0-9]{4,8}$/.test((document.querySelector('[data-testid="host-lobby-badge"]')?.textContent ?? '').trim()), undefined, { timeout: 60000 });
    const badge = ((await host.locator('[data-testid="host-lobby-badge"]').first().textContent()) ?? '').trim();
    const code = /· ([A-Z0-9]{4,8})$/.exec(badge)?.[1] ?? '';
    check('2b. tapped, it opens one room (2 under dev StrictMode) with a code', !!code && roomPosts >= 1 && roomPosts <= 2, { code, roomPosts }, 'a code');
    const phoneCtx: BrowserContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await phoneCtx.addInitScript({ content: VIBE });
    const phone = await phoneCtx.newPage();
    phone.on('pageerror', (e) => { R.pageErrors.push(`phone: ${String(e).slice(0, 300)}`); });
    await phone.goto(`${BASE}/controller/${code}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
    await phone.getByRole('button', { name: 'JOIN' }).waitFor({ timeout: 120000 });
    await phone.getByRole('button', { name: 'JOIN' }).click();
    await phone.waitForFunction(() => /Connected/.test(document.querySelector('header')?.textContent ?? ''), undefined, { timeout: 60000 });
    await phone.getByRole('button', { name: 'SPIN', exact: true }).waitFor({ timeout: 30000 });
    const labels = await phone.locator('main button').allTextContents();
    check('2c. the phone is the dance pad: the song-pick d-pad, then the four moves', labels.join('|') === ['▲', '◀', '▶', '▼', 'TOP ROCK', 'TWO STEP', 'ARM WAVE', 'SPIN'].join('|'), labels, '▲◀▶▼ + TOP ROCK · TWO STEP · ARM WAVE · SPIN');
    await frame(phone, 'phone-dance-pad');
    const btn = (name: string) => phone.getByRole('button', { name, exact: true });

    await host.evaluate(() => (window as Any).__padBtn(9, 1)); await host.waitForTimeout(120); await host.evaluate(() => (window as Any).__padBtn(9, 0));
    await host.waitForFunction(() => typeof (window as Any).__FEL_DEV__?.danceMove === 'function', undefined, { timeout: 60000 });
    await host.waitForTimeout(700);
    const h1 = await hud(host);
    check('1. the pick screen opens ON the card: its name and its own tempo, not started', /PROBE ROUTINE/.test(String(h1.banner)) && /100 BPM/.test(String(h1.banner)) && !R.console.some((c: string) => /track card:/.test(c)), { banner: h1.banner, round: h1.round }, 'PROBE ROUTINE · 100 BPM, no count-in');
    await frame(host, 'host-pick-card');

    // 3. the song pick
    await btn('▶').tap(); await host.waitForTimeout(400);
    const h2 = await hud(host);
    await btn('◀').tap(); await host.waitForTimeout(400);
    const h3 = await hud(host);
    await btn('▲').tap(); await host.waitForTimeout(400);
    const h4 = await hud(host);
    await frame(host, 'host-free-dance-on');
    await btn('▲').tap(); await host.waitForTimeout(400);
    const h5 = await hud(host);
    check('3. the d-pad picks the song (▶ wraps off the card, ◀ back) and ▲ toggles free dance', !/PROBE ROUTINE/.test(String(h2.banner)) && /PROBE ROUTINE/.test(String(h3.banner)) && JSON.stringify(h4) !== JSON.stringify(h3) && JSON.stringify(h5.banner) === JSON.stringify(h3.banner),
      { right: h2.banner, left: h3.banner, freeOn: [h4.banner, h4.round, h4.hint], freeOff: h5.banner }, 'song changes and comes back; free dance on then off');

    // 4. TOP ROCK starts the card
    await btn('TOP ROCK').tap();
    await host.waitForFunction(() => false, undefined, { timeout: 1500 }).catch(() => 0);
    const lock = R.console.find((c: string) => /track card:p9-probe-card/.test(c)) ?? '';
    check('4. TOP ROCK starts the card at its own tempo, its routine looped (4 moves × passes)', /card:p9-probe-card 100bpm 16 bars/.test(lock) && /· 16 steps/.test(lock), lock, '[FEL-DANCE] track card:p9-probe-card 100bpm 16 bars … 16 steps');

    // 5. phone presses reach the judge; the lane names the captured moves
    const names = new Set<string>();
    const judged: string[] = [];
    for (let i = 0; i < 14; i++) {
      await btn(i % 2 ? 'TWO STEP' : 'TOP ROCK').tap();
      await host.waitForTimeout(600);   // a beat at 100 BPM
      const h = await hud(host);
      for (const c of Array.isArray(h.cues) ? h.cues : []) names.add(String(c.name));
      if (h.banner) judged.push(String(h.banner));
      if (i === 7) await frame(host, 'host-card-playing');
    }
    const hEnd = await hud(host);
    const vibes = await phone.evaluate(() => (window as Any).__VIBES);
    check('5a. phone presses are judged (judgement banners, a score)', judged.some((b) => /PERFECT|GREAT|GOOD|MISS/.test(b)) && Number(hEnd.score) >= 0, { banners: judged.slice(0, 10), score: hEnd.score, combo: hEnd.combo }, 'judgements on the HUD');
    check('5b. the lane names the card\'s captured moves', ['Kick Step', 'Moonwalk', 'Robot', 'Side Freeze'].some((n) => names.has(n)), [...names], 'Kick Step / Moonwalk / Robot / Side Freeze');
    check('5c. the move buttons buzz on each press, the d-pad does not (P5\'s opt-in hint)', vibes === 15, { vibes }, '15 (TOP ROCK to start + 14 in play; the four d-pad taps never buzz)');
    await frame(phone, 'phone-after');
    await phoneCtx.close();
    await hostCtx.close();
  } catch (e) { R.fatal = String((e as Error)?.stack ?? e).slice(0, 1500); console.error(e); }
  finally {
    await browser.close();
    R.pass = R.checks.filter((c: Any) => c.pass).length; R.total = R.checks.length;
    R.runtimeSec = Math.round((Date.now() - t0) / 1000);
    fs.writeFileSync(`${OUT}/p9-dance-pad-proof.json`, JSON.stringify(R, null, 2));
    log('wrote', `${OUT}/p9-dance-pad-proof.json`, `${R.pass}/${R.total}`);
  }
}
main();
