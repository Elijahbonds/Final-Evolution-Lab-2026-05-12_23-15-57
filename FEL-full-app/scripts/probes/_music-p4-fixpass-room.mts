// MUSIC-SUITE P4 FIX PASS (2026-09-25) — the room-level fixes measured in a browser on /dev/music (the real StudioMode, no
// GameShell, database offline):
//   1. PERFORM IGNORES THE STUDIO'S COUNT-IN AND METRO (owner decision #13): with COUNT-IN 2 BARS and METRO ON set on the
//      studio floor, PERFORM's PLAY starts bar 0 at once (no count clicks) and no metronome click sounds in the set.
//   2. THE KEYS UNDER THE SHELL'S END CARD: after END SET the room's keys are suspended (Space starts nothing behind the
//      card; the dev route has no card, so the room is touched to get them back — the real GameShell remounts on REPLAY).
//   3. MUTE / SOLO AT EVERY TIER: on a fresh device (THE GRID) the MIXER is there with M / S and no faders.
// Usage: node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p4-fixpass-room.mts   (BASE, OUT env override)
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p4/fixes/room';
fs.mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { base: BASE, at: new Date().toISOString(), frames: {}, pageErrors: [] as string[], checks: [] as Any[], numbers: {} };
const check = (name: string, pass: boolean, got: unknown, want: unknown) => { R.checks.push({ name, pass, got, want }); console.log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(got)); };
const qa = (p: Page, id: string) => p.locator(`[data-qa="${id}"]`);
const btn = (p: Page, name: string) => p.getByRole('button', { name, exact: true }).first();
const running = (p: Page): Promise<boolean> => p.evaluate(() => !!(window as Any).__FEL_STUDIO__?.engine()?.running);
const INIT = (progress: string | null) => `(() => {
  const log = window.__srcLog = [];
  const S = AudioBufferSourceNode.prototype; const st = S.start;
  S.start = function (when = 0) { log.push({ when, len: this.buffer ? this.buffer.length : 0, sr: this.buffer ? this.buffer.sampleRate : 0, now: this.context.currentTime }); return st.apply(this, arguments); };
  ${progress ? `localStorage.setItem('fel-music-progress', '${progress}');` : ''}
})();`;

async function open(p: Page, stage = 'studio'): Promise<void> {
  await p.goto(`${BASE}/dev/music?stage=${stage}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  const start = p.getByRole('button', { name: 'TAP TO START' });
  await start.waitFor({ timeout: 240000 });
  await start.click();
  await qa(p, 'kit-grid').waitFor({ timeout: 60000 });
  await p.waitForTimeout(600);
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ executablePath: chromiumExe(), args: ARGS, headless: true });

  // ── 1 + 2: PERFORM with the studio's COUNT-IN and METRO on; then END SET and the keys ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await ctx.addInitScript(INIT('{"patternsMade":1,"sectionsSaved":0,"chainEntries":0}'));
    const p = await ctx.newPage();
    p.on('pageerror', (e) => R.pageErrors.push(e.message));
    await open(p);
    for (const s of [0, 4, 8, 12]) await p.locator(`[data-qa="cell"][data-row="kick"][data-step="${s}"]`).click();
    await qa(p, 'count-in').click(); await qa(p, 'count-in').click();    // 2 BARS
    await qa(p, 'metronome').click();                                     // ON
    const prefs = await p.evaluate(() => (window as Any).__FEL_GRID__);
    check('setup: COUNT-IN 2 bars and METRO on, on the studio floor', prefs.countIn === 2 && prefs.metronome === true, { countIn: prefs.countIn, metronome: prefs.metronome }, '2, true');
    await btn(p, 'PERFORM').click(); await p.waitForTimeout(300);
    await p.evaluate(() => { (window as Any).__srcLog.length = 0; (window as Any).__FEL_STUDIO__.reset(); });
    const pressAt = await p.evaluate(() => (window as Any).__FEL_STUDIO__.now());
    await btn(p, 'PLAY').click();
    await p.waitForTimeout(1200);
    const firstStep = await p.evaluate(() => (window as Any).__FEL_STUDIO__.steps[0]?.time ?? null);
    await p.waitForTimeout(2600);
    const log: Any[] = await p.evaluate(() => (window as Any).__srcLog.slice());
    const clickLens = new Set([Math.floor(48000 * 0.045), Math.floor(44100 * 0.045)]);
    const clicks = log.filter((e) => clickLens.has(e.len));
    R.numbers.perform = { pressAt, firstStepAt: firstStep, bar0DelayMs: firstStep !== null ? Math.round((firstStep - pressAt) * 1000) : null, clicks: clicks.length, sources: log.length, grid: await p.evaluate(() => (window as Any).__FEL_GRID__?.metronome) };
    check('PERFORM: PLAY starts bar 0 at once — the studio\'s 2-bar COUNT-IN is not played (it was ~5.2 s of clicks to tap as EXTRAs)', firstStep !== null && firstStep - pressAt < 0.3, R.numbers.perform, 'bar 0 within 0.3 s of the press');
    check('PERFORM: no count-in or metronome click sounds in a scored set (METRO stays on for the studio floor)', clicks.length === 0 && log.length > 0, R.numbers.perform, '0 clicks');
    await btn(p, 'END SET').click(); await p.waitForTimeout(500);
    const ended = await p.evaluate(() => (window as Any).__FEL_STUDIO__.ended);
    check('END SET reports the set', !!ended, ended?.outcome ?? null, 'an outcome');
    // 2. under the (stand-in) card: Space starts nothing, the keys are suspended
    const wasRunning = await running(p);
    if (wasRunning) { await p.evaluate(() => { const b = [...document.querySelectorAll('[data-qa="transport"] button')][0] as HTMLButtonElement; b?.click(); }); await p.waitForTimeout(200); }
    await p.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const keysLive = await p.evaluate(() => (window as Any).__FEL_GRID__?.keysLive);
    await p.keyboard.press(' '); await p.waitForTimeout(300);
    const afterSpace = await running(p);
    R.numbers.endCard = { keysLive, runningAfterSpace: afterSpace };
    check('after END SET the room\'s keys are suspended: Space starts nothing behind the card', keysLive === false && afterSpace === false, R.numbers.endCard, 'keysLive false, not running');
    // the dev route's stand-in card (data-dev="end-card") covers the room like GameShell's; its REPLAY remounts the room
    const cardUp = await p.locator('[data-dev="end-card"]').count();
    await p.locator('[data-dev="replay"]').click();
    const start = p.getByRole('button', { name: 'TAP TO START' });
    await start.waitFor({ timeout: 60000 });
    await start.click();
    await qa(p, 'kit-grid').waitFor({ timeout: 60000 });
    await p.waitForTimeout(500);
    if ((await p.evaluate(() => (window as Any).__FEL_GRID__))) await btn(p, 'BUILD').click().catch(() => undefined);
    await p.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await p.keyboard.press(' '); await p.waitForTimeout(300);
    const back = { cardWasUp: cardUp, keysLive: await p.evaluate(() => (window as Any).__FEL_GRID__?.keysLive), running: await running(p) };
    if (back.running) await p.keyboard.press(' ');
    check('…and REPLAY (a remount, as GameShell\'s) brings a room whose keys work again', cardUp === 1 && back.keysLive === true && back.running === true, back, 'card up, then live and playing');
    await ctx.close();
  }

  // ── 3: a fresh device (THE GRID) has the MIXER's mute / solo, not its faders ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await ctx.addInitScript(INIT(null));
    const p = await ctx.newPage();
    p.on('pageerror', (e) => R.pageErrors.push(e.message));
    await open(p);
    const tier = await p.evaluate(() => [...document.querySelectorAll('[data-qa="tier-chip"]')].find((c) => (c as HTMLElement).dataset.state === 'current')?.getAttribute('data-tier'));
    await qa(p, 'mixer-toggle').click(); await p.waitForTimeout(200);
    const m = {
      tier, toggle: await qa(p, 'mixer-toggle').textContent(), strips: await p.locator('[data-qa="mixer-strip"]').count(),
      mute: await p.locator('[data-qa="strip-mute"]').count(), solo: await p.locator('[data-qa="strip-solo"]').count(),
      faders: await p.locator('[data-qa="strip-gain"], [data-qa="master-fader"]').count(), more: await qa(p, 'mixer-more').textContent().catch(() => null),
    };
    await p.locator('[data-qa="strip-solo"]').first().click(); await p.waitForTimeout(200);
    const silent = await p.evaluate(() => [...document.querySelectorAll('[data-qa="grid-row"]')].map((r) => (r as HTMLElement).dataset.silent));
    R.numbers.gridTierMixer = { ...m, silentAfterSoloKick: silent };
    await qa(p, 'mixer').screenshot({ path: `${OUT}/p4fix-grid-tier-mixer.png` }); R.frames.gridTierMixer = `${OUT}/p4fix-grid-tier-mixer.png`;
    check('decision #4: at THE GRID the MIXER offers M / S on every drawn row (no faders; it says where they open)',
      m.tier === 'grid' && m.strips === 4 && m.mute === 4 && m.solo === 4 && m.faders === 0 && /THE STUDIO/.test(m.more ?? ''), R.numbers.gridTierMixer, '4 strips, M / S, 0 faders');
    check('a solo at THE GRID works: the other rows are marked silent', silent[0] === '' && silent.slice(1).every((x) => x === 'solo'), silent, "['', 'solo', 'solo', 'solo']");
    await ctx.close();
  }

  check('no page errors', R.pageErrors.length === 0, R.pageErrors, []);
  await browser.close();
}

main().catch((e) => { R.fatal = String(e?.stack ?? e); console.log('FATAL', e); }).finally(() => {
  R.passed = R.checks.filter((c: Any) => c.pass).length; R.total = R.checks.length;
  fs.writeFileSync(`${OUT}/fixpass-room.json`, JSON.stringify(R, null, 2));
  console.log(`${R.passed}/${R.total} checks passed → ${OUT}/fixpass-room.json`);
  process.exit(0);
});
