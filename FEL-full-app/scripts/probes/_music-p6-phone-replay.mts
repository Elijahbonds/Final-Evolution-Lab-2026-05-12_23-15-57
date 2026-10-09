// MUSIC-SUITE P6 phone-replay (2026-09-26) — the two P5 phone follow-ups, measured end to end in a browser: the real
// Academy (/dev/music, no GameShell, database offline) as the HOST, and the real phone page (/controller/<code>, a 390 px
// touch context) as the PHONE, over the real controller link (signaling on the dev server's store, then WebRTC).
//   A. THE PHONE SEES THE ROOM: after joining, the phone draws the room's chips (bank + what is on it, PLAYING/STOPPED, REC)
//      and lights the live bank / PLAY / REC; each phone press (BANK B, REC, PLAY, STOP) and a change made on the TV (the
//      host's own PLAY) reaches the phone; the time from a press to the phone's redraw is measured.
//   B. THE PHONE THROUGH REPLAY (decision #36): a PERFORM set played with the phone paired, END SET → the stand-in card
//      (which does what GameShell's REPLAY does: the registered restart first, else a remount) → REPLAY: in place (no
//      remount, no splash), the SAME room code, no new room POST, the phone still Connected and its pads still sound,
//      PERFORM reset (score 0, transport stopped, REC off), the project kept — and the phone starts the next set.
//   C. BEFORE (?replay=remount forces the old remount on a second host page): the splash comes back, and the phone is
//      left on the dead room (the code on the badge changes after TAP TO START + FLIP).
// Two pages at once (host + phone) — the link needs both ends; C reuses the phone context on a second host page.
// Usage: node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p6-phone-replay.mts   (BASE, OUT env override)
import { chromium, type BrowserContext, type CDPSession, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p6/phone-replay';
fs.mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
  '--disable-features=WebRtcHideLocalIpsWithMdns'];
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[p6phone +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { base: BASE, at: new Date().toISOString(), frames: {}, pageErrors: [] as string[], checks: [] as Any[], stateLatencyMs: [] as Any[] };
const check = (name: string, pass: boolean, got: unknown, want: unknown) => { R.checks.push({ name, pass, got, want }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(got)); };
const frame = async (p: Page, name: string, full = false) => { const path = `${OUT}/p6phone-${name}.png`; await p.screenshot({ path, fullPage: full }); R.frames[name] = path; };
const STUDIO_TIER = `try { if (!localStorage.getItem('fel-music-progress')) localStorage.setItem('fel-music-progress', '{"patternsMade":1,"sectionsSaved":2,"chainEntries":2}'); } catch {}`;
const AUDIO_SPY = `(() => {
  const L = []; window.__AUDIO_LOG__ = L;
  const os = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (when, ...r) { try { L.push({ t: this.context.currentTime, len: this.buffer ? this.buffer.length : -1 }); if (L.length > 4000) L.splice(0, 1000); } catch (e) {} return os.call(this, when, ...r); };
})();`;

const qa = (p: Page, id: string) => p.locator(`[data-qa="${id}"]`);
const btn = (p: Page, name: string | RegExp) => p.getByRole('button', { name, exact: typeof name === 'string' }).first();
const tab = async (p: Page, name: 'STUDIO' | 'FLIP') => { await btn(p, name).click(); await p.waitForTimeout(350); };
const badgeCode = async (p: Page): Promise<string> => /^([A-Z0-9]{4,8}) ·/.exec((await p.locator('[data-testid="host-lobby-badge"]').first().textContent().catch(() => '')) ?? '')?.[1] ?? '';
const phoneHeader = (p: Page) => p.evaluate(() => document.querySelector('header')?.textContent ?? '');
/** What the phone draws of the room: its chips (text + filled) and the labels of its lit buttons. */
const phoneView = (p: Page) => p.evaluate(() => ({
  chips: [...document.querySelectorAll('[data-testid="room-state"] span')].map((s) => `${s.textContent}${s.getAttribute('data-on') ? '*' : ''}`),
  lit: [...document.querySelectorAll('main button[data-lit="true"]')].map((b) => b.textContent),
}));
async function touch(phone: Page, cdp: CDPSession, label: string): Promise<void> {
  const b = phone.getByRole('button', { name: label, exact: true }).first();
  const box = (await b.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, force: 0.5, radiusX: 10, radiusY: 10, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
/** Wait until the phone draws `want` (chips joined by ' | '); returns the ms it took from `since`, or null (timeout). */
async function phoneShows(phone: Page, want: RegExp, since: number, what: string): Promise<number | null> {
  const ok = await phone.waitForFunction((src) => new RegExp(src).test([...document.querySelectorAll('[data-testid="room-state"] span')].map((s) => s.textContent).join(' | ')), want.source, { timeout: 8000, polling: 16 }).then(() => true).catch(() => false);
  const ms = ok ? Date.now() - since : null;
  R.stateLatencyMs.push({ what, ms });
  return ms;
}
async function pairPhone(browser: Any, host: Page, code: string): Promise<{ phoneCtx: BrowserContext; phone: Page; cdp: CDPSession }> {
  const phoneCtx: BrowserContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const phone = await phoneCtx.newPage();
  phone.on('pageerror', (e) => R.pageErrors.push(`phone: ${String(e).slice(0, 300)}`));
  const cdp = await phoneCtx.newCDPSession(phone);
  await phone.goto(`${BASE}/controller/${code}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await phone.getByRole('button', { name: 'JOIN' }).waitFor({ timeout: 120000 });
  await phone.getByRole('button', { name: 'JOIN' }).click();
  await phone.waitForFunction(() => /Connected/.test(document.querySelector('header')?.textContent ?? ''), undefined, { timeout: 60000 });
  await phone.getByRole('button', { name: '16', exact: true }).waitFor({ timeout: 30000 });
  await host.waitForFunction(() => Number(document.querySelector('[data-qa="phone-room"]')?.getAttribute('data-phones') ?? 0) === 1, undefined, { timeout: 30000 });
  return { phoneCtx, phone, cdp };
}
/** A host page on /dev/music, past its splash, the phone room opened on FLIP (the FEL-theme lesson fills bank A). */
async function openHost(browser: Any, query: string): Promise<{ hostCtx: BrowserContext; host: Page; posts: () => number }> {
  const hostCtx: BrowserContext = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await hostCtx.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
  await hostCtx.addInitScript({ content: STUDIO_TIER });
  await hostCtx.addInitScript({ content: AUDIO_SPY });
  const host = await hostCtx.newPage();
  host.on('pageerror', (e) => R.pageErrors.push(`host: ${String(e).slice(0, 300)}`));
  let roomPosts = 0;
  host.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/api/controller-link/rooms')) roomPosts++; });
  await host.goto(`${BASE}/dev/music?${query}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  const start = host.getByRole('button', { name: 'TAP TO START' });
  await start.waitFor({ timeout: 240000 });
  await start.click();
  await host.waitForFunction(() => !!(window as Any).__FEL_GRID__, undefined, { timeout: 60000 });
  await tab(host, 'FLIP');
  await host.waitForFunction(() => { const f = (window as Any).__FEL_FLIP__; return f && f.decoded && f.slices > 0; }, undefined, { timeout: 90000 });
  await host.waitForFunction(() => /^[A-Z0-9]{4,8} ·/.test(document.querySelector('[data-testid="host-lobby-badge"]')?.textContent ?? ''), undefined, { timeout: 60000 });
  return { hostCtx, host, posts: () => roomPosts };
}
const gridHits = (p: Page) => p.evaluate(() => { const e = (window as Any).__FEL_STUDIO__?.engine(); return e ? e.tracks.map((t: Any) => `${t.sampleId}:${t.hits}`).join(',') : null; });
const running = (p: Page) => p.evaluate(() => !!(window as Any).__FEL_STUDIO__?.engine()?.running);

async function run(browser: Any): Promise<void> {
  // ── A. the phone sees the room ─────────────────────────────────────────────────────────────────────────────────────
  const { hostCtx, host, posts } = await openHost(browser, 'stage=studio');
  const code = await badgeCode(host);
  const bankA = await host.evaluate(() => (window as Any).__FEL_FLIP__?.source ?? null);
  const { phoneCtx, phone, cdp } = await pairPhone(browser, host, code);
  const tJoin = Date.now();
  await phoneShows(phone, /^BANK A · /, tJoin, 'on join');
  const v0 = await phoneView(phone);
  check('A1. on join the phone draws the room: bank A (and what is on it), STOPPED, REC OFF — BANK A lit', /^BANK A · \S/.test(v0.chips[0] ?? '') && v0.chips[1] === '■ STOPPED' && v0.chips[2] === '○ REC OFF' && v0.lit.join('|') === 'BANK A', { ...v0, bankA }, { chips: ['BANK A · <source>', '■ STOPPED', '○ REC OFF'], lit: ['BANK A'] });
  await frame(phone, 'phone-joined');

  let t = Date.now(); await touch(phone, cdp, 'BANK B');
  const msBank = await phoneShows(phone, /^BANK B · /, t, 'BANK B pressed on the phone');
  const vB = await phoneView(phone);
  check('A2. BANK B on the phone: the phone shows BANK B lit and what is on it', msBank !== null && vB.lit.join('|') === 'BANK B' && /^BANK B · /.test(vB.chips[0]), { ...vB, ms: msBank }, { lit: ['BANK B'] });
  t = Date.now(); await touch(phone, cdp, 'BANK A');
  await phoneShows(phone, /^BANK A · /, t, 'BANK A pressed on the phone');

  await tab(host, 'STUDIO');
  t = Date.now(); await touch(phone, cdp, '● REC');
  const msRec = await phoneShows(phone, /● REC ARMED/, t, 'REC pressed on the phone');
  const vR = await phoneView(phone);
  t = Date.now(); await touch(phone, cdp, '▶ PLAY');
  const msPlay = await phoneShows(phone, /▶ PLAYING \| ● RECORDING/, t, 'PLAY pressed on the phone');
  const vP = await phoneView(phone);
  await frame(phone, 'phone-playing-rec');
  t = Date.now(); await touch(phone, cdp, '■ STOP');
  const msStop = await phoneShows(phone, /■ STOPPED \| ● REC ARMED/, t, 'STOP pressed on the phone');
  t = Date.now(); await touch(phone, cdp, '● REC');
  const msRecOff = await phoneShows(phone, /○ REC OFF/, t, 'REC off on the phone');
  const vOff = await phoneView(phone);
  check('A3. REC / PLAY / STOP from the phone: ARMED → PLAYING + RECORDING (PLAY and REC lit) → STOPPED → REC OFF',
    [msRec, msPlay, msStop, msRecOff].every((m) => m !== null) && vR.lit.join('|') === 'BANK A|● REC' && vP.lit.join('|') === 'BANK A|▶ PLAY|● REC' && vP.chips.slice(1).join('|') === '▶ PLAYING*|● RECORDING*' && vOff.lit.join('|') === 'BANK A',
    { armed: vR, playing: vP, off: vOff, ms: { rec: msRec, play: msPlay, stop: msStop, recOff: msRecOff } }, 'each state on the phone');

  // a change made on the TV, not the phone: the phone follows the room
  t = Date.now(); await qa(host, 'transport').getByRole('button', { name: 'PLAY', exact: true }).click();
  const msTv = await phoneShows(phone, /▶ PLAYING/, t, 'PLAY pressed on the TV');
  t = Date.now(); await qa(host, 'transport').getByRole('button', { name: 'STOP', exact: true }).click();
  const msTvStop = await phoneShows(phone, /■ STOPPED/, t, 'STOP pressed on the TV');
  check('A4. a change made on the TV (its own PLAY / STOP) reaches the phone too', msTv !== null && msTvStop !== null, { play: msTv, stop: msTvStop }, 'PLAYING then STOPPED');

  // ── B. the phone through REPLAY ───────────────────────────────────────────────────────────────────────────────────
  // the player's work first: a kick on every 16th (so the set has notes a tap can take, and the grid is something to keep)
  for (let s = 0; s < 16; s++) await host.locator(`[data-qa="cell"][data-row="kick"][data-step="${s}"]`).click();
  await host.waitForTimeout(600);
  await btn(host, 'PERFORM').click();
  await host.waitForTimeout(300);
  await touch(phone, cdp, '▶ PLAY');                      // the phone starts the set
  await phoneShows(phone, /▶ PLAYING/, Date.now(), 'set started from the phone');
  await host.waitForTimeout(2200);
  const tapBtn = qa(host, 'perform-tap');
  for (let i = 0; i < 8; i++) {
    if (await tapBtn.count()) await tapBtn.dispatchEvent('pointerdown', { button: 0 });
    await host.waitForTimeout(170);
    await touch(phone, cdp, '1');                         // row 1 of the pads: the KICK lane in the P6 lanes PERFORM
    await host.waitForTimeout(170);
  }
  const statusBefore = await qa(host, 'perform-status').textContent().catch(() => null);
  const gridBefore = await gridHits(host);
  const projectBefore = await host.evaluate(() => (window as Any).__FEL_PROJECT__?.id ?? null);
  const postsBefore = posts();
  await btn(host, 'END SET').click();
  await host.locator('[data-dev="end-card"]').waitFor({ timeout: 10000 });
  const ended = await host.evaluate(() => (window as Any).__FEL_STUDIO__?.ended ?? null);
  await frame(host, 'host-end-card');
  const phoneHitsBefore = await host.evaluate(() => (window as Any).__FEL_PHONE__?.hits ?? 0);

  await host.locator('[data-dev="replay"]').click();
  await host.waitForTimeout(1200);
  const replays = await host.evaluate(() => (window as Any).__FEL_STUDIO__?.replays ?? null);
  const splash = await host.getByRole('button', { name: 'TAP TO START' }).count();
  const codeAfter = await badgeCode(host);
  const statusAfter = await qa(host, 'perform-status').textContent().catch(() => null);
  const performOn = (await tapBtn.count()) > 0 || statusAfter !== null;
  const runAfter = await running(host);
  const gridAfter = await gridHits(host);
  const projectAfter = await host.evaluate(() => (window as Any).__FEL_PROJECT__?.id ?? null);
  const hdr = await phoneHeader(phone);
  const phones = await host.evaluate(() => Number(document.querySelector('[data-qa="phone-room"]')?.getAttribute('data-phones') ?? 0));
  const vAfter = await phoneView(phone);
  check('B1. REPLAY restarted IN PLACE: no remount, no splash, no stage pick', replays?.inPlace === 1 && replays?.remounts === 0 && splash === 0, { replays, splash }, { inPlace: 1, remounts: 0, splash: 0 });
  check('B2. the SAME phone room: same code, no new room POST, the phone still Connected and still counted', codeAfter === code && posts() === postsBefore && /Connected/.test(hdr) && phones === 1, { code, codeAfter, posts: posts(), postsBefore, phone: hdr, phones }, { sameCode: true, newPosts: 0 });
  check('B3. PERFORM reset (the set scored; the fresh one is at score 0) and the transport reset (stopped, REC off) — the phone shows it', performOn && (ended?.score ?? 0) > 0 && /^score 0 · combo x0/.test(statusAfter ?? '') && !runAfter && vAfter.chips.slice(1).join('|') === '■ STOPPED|○ REC OFF',
    { ended: ended ? { score: ended.score, headline: ended.headline } : null, statusBefore, statusAfter, running: runAfter, phone: vAfter }, 'score 0, stopped, REC off');
  check('B4. the project kept: same project, same grid (the 16 kicks)', projectAfter === projectBefore && gridAfter === gridBefore && /kick:16/.test(gridAfter ?? ''), { projectBefore, projectAfter, gridBefore, gridAfter }, 'identical, kick:16');
  await frame(host, 'host-after-replay');

  // the paired phone drives the next set: PLAY starts the transport, and a pad reaches the room.
  // MUSIC-SUITE P6 LIVE PROOF (2026-09-26): B5 as first written (08:08) touched a pad on the STOPPED PERFORM floor and
  // wanted a SOUND. Since the P6 fix pass (09:58, StudioMode.tsx phoneInput ~:1714, phonePad.phonePadRole) a pad where taps
  // are judged — PERFORM on the STUDIO view, which is where REPLAY-in-place lands — is a LANE TAP ONLY (it had also played
  // the bank's Flip chop over the song, and written it into a Flip row with ARM REC on), and a lane tap on a stopped set
  // only flashes PRESS PLAY. Re-run at 10:50 as written it FAILED on that (hit counted 8 → 9, 0 sources started; kept as
  // live/phone/p6phone-proof-as-written.json). So the pad is now checked in both of its roles after REPLAY:
  //   B5a — the phone's PLAY starts the next set, and a pad in ROW 1 lands as a KICK-lane tap the set judges (the room's
  //         `how` is 'lane', the KICK pad flashes a verdict, the status line moves);
  //   B5b — on the FLIP tab (transport stopped) the same pad plays its chop: a source starts.
  t = Date.now(); await touch(phone, cdp, '▶ PLAY');
  const msNext = await phoneShows(phone, /▶ PLAYING/, t, 'PLAY on the phone after REPLAY');
  const runNext = await running(host);
  await host.waitForTimeout(600);
  const statusPre = await qa(host, 'perform-status').textContent().catch(() => null);
  const laneTaps: Any[] = [];
  for (let i = 0; i < 4; i++) {
    const n0 = await host.evaluate(() => (window as Any).__FEL_PHONE__?.hits ?? 0);
    await touch(phone, cdp, '1');
    await host.waitForFunction((n) => ((window as Any).__FEL_PHONE__?.hits ?? 0) > n, n0, { timeout: 8000 }).catch(() => undefined);
    await host.waitForTimeout(60);
    laneTaps.push(await host.evaluate(() => ({ how: (window as Any).__FEL_PHONE__?.last?.how ?? null, kickFlash: document.querySelector('[data-qa="perform-pad"][data-lane="0"] [data-qa="perform-pad-flash"]')?.textContent ?? null, status: document.querySelector('[data-qa="perform-status"]')?.textContent ?? null })));
    await host.waitForTimeout(250);
  }
  const hitsAfter = await host.evaluate(() => (window as Any).__FEL_PHONE__?.hits ?? 0);
  check('B5a. after REPLAY the phone\'s PLAY starts the next set and its pads play the KICK lane (row 1): judged by the set', runNext && msNext !== null && hitsAfter >= phoneHitsBefore + 4
    && laneTaps.every((x) => x.how === 'lane') && laneTaps.some((x) => /PERFECT|GOOD|EARLY|LATE|EXTRA/.test(x.kickFlash ?? '')) && laneTaps[laneTaps.length - 1].status !== statusPre,
    { running: runNext, ms: msNext, hitsBefore: phoneHitsBefore, hitsAfter, statusPre, laneTaps }, 'running · how lane · KICK pad flashes a verdict');
  await frame(phone, 'phone-playing-after-replay');
  t = Date.now(); await touch(phone, cdp, '■ STOP');
  await phoneShows(phone, /■ STOPPED/, t, 'STOP on the phone after REPLAY');
  await tab(host, 'FLIP');
  await host.evaluate(() => { ((window as Any).__AUDIO_LOG__ as Any[]).length = 0; });
  const n1 = await host.evaluate(() => (window as Any).__FEL_PHONE__?.hits ?? 0);
  await touch(phone, cdp, '1');
  await host.waitForFunction((n) => ((window as Any).__FEL_PHONE__?.hits ?? 0) > n, n1, { timeout: 8000 }).catch(() => undefined);
  await host.waitForTimeout(200);
  const flipHit = await host.evaluate(() => ({ how: (window as Any).__FEL_PHONE__?.last?.how ?? null, sounded: ((window as Any).__AUDIO_LOG__ as Any[]).filter((a) => a.len > 0).length }));
  check('B5b. …and on the FLIP tab the same pad plays its chop (a source starts)', flipHit.how === 'flippad' && flipHit.sounded > 0, flipHit, { how: 'flippad', sounded: '> 0' });
  await tab(host, 'STUDIO');
  t = Date.now(); await touch(phone, cdp, '▶ PLAY');
  await phoneShows(phone, /▶ PLAYING/, t, 'PLAY on the phone for the second set');
  await host.waitForTimeout(1500);
  await btn(host, 'END SET').click();
  await host.locator('[data-dev="end-card"]').waitFor({ timeout: 10000 });
  await host.locator('[data-dev="replay"]').click();
  await host.waitForTimeout(900);
  const replays2 = await host.evaluate(() => (window as Any).__FEL_STUDIO__?.replays ?? null);
  check('B6. a second set and a second REPLAY: still in place, still the one code, the phone still Connected', replays2?.inPlace === 2 && replays2?.remounts === 0 && (await badgeCode(host)) === code && /Connected/.test(await phoneHeader(phone)), { replays2, code: await badgeCode(host), phone: await phoneHeader(phone) }, { inPlace: 2 });
  await frame(phone, 'phone-after-replay');
  R.roomPostsA = posts();
  await hostCtx.close();

  // ── C. before: ?replay=remount (the old REPLAY) on a second host; the same phone joins it ────────────────────────────
  const old = await openHost(browser, 'stage=studio&replay=remount');
  const codeOld = await badgeCode(old.host);
  const p2 = await phone.goto(`${BASE}/controller/${codeOld}`, { waitUntil: 'domcontentloaded', timeout: 240000 }).then(() => phone);
  await p2.getByRole('button', { name: 'JOIN' }).click();
  await p2.waitForFunction(() => /Connected/.test(document.querySelector('header')?.textContent ?? ''), undefined, { timeout: 60000 });
  await tab(old.host, 'STUDIO');
  await btn(old.host, 'PERFORM').click();
  await btn(old.host, 'END SET').click();
  await old.host.locator('[data-dev="end-card"]').waitFor({ timeout: 10000 });
  await old.host.locator('[data-dev="replay"]').click();
  await old.host.waitForTimeout(1500);
  const oldReplays = await old.host.evaluate(() => (window as Any).__FEL_STUDIO__?.replays ?? null);
  const oldSplash = await old.host.getByRole('button', { name: 'TAP TO START' }).count();
  await p2.waitForTimeout(6000);
  const oldPhone = await phoneHeader(p2);
  let oldCodeAfter = '';
  if (oldSplash) {
    await old.host.getByRole('button', { name: 'TAP TO START' }).click();
    await old.host.waitForFunction(() => !!(window as Any).__FEL_GRID__, undefined, { timeout: 60000 });
    await tab(old.host, 'FLIP');
    await old.host.waitForFunction(() => /^[A-Z0-9]{4,8} ·/.test(document.querySelector('[data-testid="host-lobby-badge"]')?.textContent ?? ''), undefined, { timeout: 60000 }).catch(() => undefined);
    oldCodeAfter = await badgeCode(old.host);
  }
  check('C1. BEFORE (the old remount): the splash came back, the phone was left off the room, and the room is a NEW code',
    oldReplays?.remounts === 1 && oldSplash === 1 && !/Connected/.test(oldPhone) && !!oldCodeAfter && oldCodeAfter !== codeOld,
    { oldReplays, oldSplash, phoneAfter: oldPhone, code: codeOld, codeAfterRemount: oldCodeAfter }, 'remount: splash, phone not connected, new code');
  await frame(p2, 'before-phone-after-remount');
  await old.hostCtx.close();
  await phoneCtx.close();
}

const browser = await chromium.launch({ executablePath: chromiumExe(), args: ARGS, headless: true });
try { await run(browser); } catch (e) { R.error = String((e as Error)?.stack ?? e).slice(0, 2000); log('ERROR', R.error); } finally { await browser.close(); }
R.passed = R.checks.filter((c: Any) => c.pass).length;
R.total = R.checks.length;
fs.writeFileSync(`${OUT}/p6phone-proof.json`, JSON.stringify(R, null, 1));
log(`${R.passed}/${R.total} checks, ${R.pageErrors.length} page errors → ${OUT}/p6phone-proof.json`);
