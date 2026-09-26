// MUSIC-SUITE P1 (2026-09-25) — the Groove Academy's browser baseline, on the dev-only /dev/music route (the real
// StudioMode, no GameShell, shards approved). Before this there was no auth-free way into the Academy, so none of the
// map's Academy findings (understand-wf_3a55346f-032.json) had been measured in a browser — only read from code.
//
// What it measures (every number is written to the JSON with how it was taken):
//   1. WORK SURVIVAL — build a 14-cell pattern and save one section, then: FLIP tab and back, PERFORM and back, END SET +
//      REPLAY (the shell's remount), reload. Lit cells (DOM), sections (window.__FEL_SONG__), the Flip source
//      (window.__FEL_FLIP__) after each step.
//   2. HIDDEN BUT AUDIBLE — the engine's track list vs the rows the grid draws, after SEND TO TRACK + ARM REC pad taps
//      and after CELL, and the hits the scheduler actually started over two bars (window.__FEL_STUDIO__, the dev route's
//      hook on AudioEngine.setState / scheduleStep).
//   3. CELL SIZE — a grid cell's box at 1280×800 and at 375×812 (a fresh context, so the first-visit 4-row tier).
//   4. PUBLISH UNTIL IT FAILS — PUBLISH TO LIBRARY with a title, repeatedly, until the library stops growing; what the UI
//      showed (button, toast, title field) and the page errors.
//   5. PERFORM — TAP at set offsets from a scheduled kick note (audio clock), on the CELL pattern and on an empty grid;
//      the judgement the status line showed, and the END SET result.
//   6. LIVE SWING — the scheduled step times over two bars at 92 BPM / 15 % swing vs the unswung bar (the drift finding).
// Frames: studio desktop, studio phone, flip tab, perform (+ publish failure).
//
// Usage: node node_modules/tsx/dist/cli.mjs scripts/probes/_music-baseline.mts   (BASE, OUT env override)
import { chromium, type Page, type Browser } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p1';
fs.mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'];
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[music +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { base: BASE, at: new Date().toISOString(), route: '/dev/music', frames: {}, pageErrors: [] as string[], notes: [] as string[] };
const frame = async (p: Page, name: string) => { const path = `${OUT}/music-${name}.png`; await p.screenshot({ path }); R.frames[name] = path; log('frame', path); };

/** The grid as drawn: row labels, lit steps per row, one cell's box. The grid is the div whose inline
 *  grid-template-columns is `90px repeat(16, 1fr)` (StudioMode.tsx S.grid); each row is a label + 16 cells. */
const GRID = `(() => {
  const grid = [...document.querySelectorAll('div')].find((d) => (d.style.gridTemplateColumns || '').includes('repeat(16'));
  if (!grid) return null;
  const kids = [...grid.children];
  const rows = [];
  for (let i = 0; i + 16 < kids.length; i += 17) {
    const cells = kids.slice(i + 1, i + 17);
    rows.push({ label: kids[i].textContent, lit: cells.map((c, j) => getComputedStyle(c).backgroundColor === 'rgb(255, 179, 71)' ? j : -1).filter((j) => j >= 0) });
  }
  const box = kids[1].getBoundingClientRect();
  return { rows: rows.length, labels: rows.map((r) => r.label), lit: rows.reduce((n, r) => n + r.lit.length, 0), perRow: rows,
    cellW: +box.width.toFixed(1), cellH: +box.height.toFixed(1), gridW: +grid.getBoundingClientRect().width.toFixed(1), vw: innerWidth };
})()`;
const grid = (p: Page) => p.evaluate(GRID) as Promise<Any>;
const song = (p: Page) => p.evaluate(() => (window as Any).__FEL_SONG__ ?? null);
const flip = (p: Page) => p.evaluate(() => (window as Any).__FEL_FLIP__ ?? null);
const engine = (p: Page) => p.evaluate(() => (window as Any).__FEL_STUDIO__?.engine() ?? null);

async function clickCell(p: Page, row: number, step: number): Promise<void> {
  await p.evaluate(([r, s]) => {
    const g = [...document.querySelectorAll('div')].find((d) => (d.style.gridTemplateColumns || '').includes('repeat(16')) as HTMLElement;
    (g.children[r * 17 + 1 + s] as HTMLElement).click();
  }, [row, step]);
}
/** The 14-cell pattern: kick 0/4/8/12, snare 4/12, hats on the eighths. */
async function buildPattern(p: Page): Promise<void> {
  for (const s of [0, 4, 8, 12]) await clickCell(p, 0, s);
  for (const s of [4, 12]) await clickCell(p, 1, s);
  for (let s = 0; s < 16; s += 2) await clickCell(p, 2, s);
  await p.waitForTimeout(150);
}
const btn = (p: Page, name: string) => p.getByRole('button', { name, exact: true }).first();
/** MUSIC-SUITE P2 (2026-09-25): a spend opens the inline confirm; note it (and any spend before the yes), then BUY. */
async function confirmThenYes(p: Page, spendsBefore: number): Promise<{ confirmShown: boolean; spentBeforeYes: number; text: string | null }> {
  const conf = p.locator('[data-qa="shop-confirm"]');
  const shown = (await conf.count()) > 0;
  const spentBeforeYes = (await p.evaluate(() => (window as Any).__FEL_STUDIO__.spends.length)) - spendsBefore;
  const text = shown ? await conf.textContent() : null;
  if (shown) { await p.locator('[data-qa="shop-yes"]').click(); await p.waitForTimeout(500); }
  return { confirmShown: shown, spentBeforeYes, text };
}

async function startRoom(p: Page): Promise<void> {
  const start = p.getByRole('button', { name: 'TAP TO START' });
  await start.waitFor({ timeout: 240000 });
  await start.click();
  await p.waitForFunction(`${GRID} !== null`, undefined, { timeout: 60000 });
  await p.waitForTimeout(300);
}

/** Play `bars` bars and return what the scheduler started, plus the live step clock. */
async function playBars(p: Page, bars: number, bpm = 92): Promise<Any> {
  await p.evaluate(() => (window as Any).__FEL_STUDIO__.reset());
  await btn(p, 'PLAY').click();
  await p.waitForTimeout(Math.round((bars * 16 * 60 / bpm / 4) * 1000) + 250);
  const audible = await p.evaluate(() => ({ ...(window as Any).__FEL_STUDIO__.audible }));
  const steps = await p.evaluate(() => [...(window as Any).__FEL_STUDIO__.steps]);
  await btn(p, 'STOP').click();
  return { audible, steps };
}

/** Rows the engine plays that the grid does not draw. */
function hiddenAudible(eng: Any, g: Any, audible: Any): Any {
  const drawn = new Set<string>((g?.labels ?? []).map((l: string) => l.toLowerCase().replace(/^flip (\d+)$/, (_m: string, n: string) => `flip_${Number(n) - 1}`)));
  const tracks = (eng?.tracks ?? []) as Any[];
  const notDrawn = tracks.filter((t) => !drawn.has(t.sampleId.toLowerCase()));
  return {
    engineTracks: tracks.length, drawnRows: g?.rows ?? 0,
    notDrawn: notDrawn.map((t) => ({ ...t, audibleHits: audible?.[t.sampleId] ?? 0 })),
    audibleNotDrawn: notDrawn.filter((t) => (audible?.[t.sampleId] ?? 0) > 0).map((t) => t.sampleId),
    writtenButSilent: tracks.filter((t) => t.hits > 0 && !t.loaded).map((t) => t.sampleId),
  };
}

/** TAP at `offsetMs` from the next scheduled step-0 note, on the engine's clock; the status line's text right after. */
const TAP_AT = `async (offsetMs) => {
  const P = window.__FEL_STUDIO__;
  const tapBtn = [...document.querySelectorAll('button')].find((b) => b.textContent === 'TAP');
  const status = tapBtn.nextElementSibling;
  const seen = [];
  const mo = new MutationObserver(() => seen.push({ at: P.now(), text: status.textContent }));
  mo.observe(status, { childList: true, characterData: true, subtree: true });
  let target = null; const w0 = performance.now();
  while (!target && performance.now() - w0 < 8000) {
    const now = P.now();
    target = P.steps.find((s) => s.step === 0 && s.time - now > Math.max(0.03, -offsetMs / 1000 + 0.02));
    if (!target) await new Promise((r) => setTimeout(r, 4));
  }
  if (!target) { mo.disconnect(); return { err: 'no step-0 note scheduled' }; }
  const at = target.time + offsetMs / 1000;
  while (P.now() < at) await new Promise((r) => setTimeout(r, 1));
  const tapAt = P.now();
  tapBtn.click();
  await new Promise((r) => setTimeout(r, 0));
  const right = status.textContent;
  await new Promise((r) => setTimeout(r, 60));
  mo.disconnect();
  const afterTap = seen.filter((s) => s.at >= tapAt);
  return { offsetMs, dtMs: +((tapAt - target.time) * 1000).toFixed(1), statusRightAfter: right, firstChangeAfterTap: afterTap[0]?.text ?? null };
}`;

async function run(browser: Browser): Promise<void> {
  // ── 0. the route honours ?stage=perform (StudioMode reads it at READY: musicStage.ts readMusicStage) ────────────────
  {
    const sctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const sp = await sctx.newPage();
    await sp.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
    await sp.goto(`${BASE}/dev/music?stage=perform`, { waitUntil: 'domcontentloaded', timeout: 240000 });
    const pressed = await sp.getByRole('button', { name: /^PERFORM —/ }).getAttribute('aria-pressed', { timeout: 240000 }).catch(() => null);
    await startRoom(sp);
    R.stageCheck = { url: '/dev/music?stage=perform', splashPerformPressed: pressed, tapButtonShown: await sp.getByRole('button', { name: 'TAP', exact: true }).count(),
      endSetShown: await sp.getByRole('button', { name: 'END SET', exact: true }).count(),
      how: 'fresh context; the splash STAGE pill aria-pressed, then after TAP TO START whether the PERFORM controls (TAP, END SET) are up' };
    log('stage check', JSON.stringify(R.stageCheck));
    await sctx.close();
  }
  // ── DESKTOP 1280×800 ───────────────────────────────────────────────────────────────────────────────────────────
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
  p.on('pageerror', (e) => { R.pageErrors.push(String(e).slice(0, 300)); log('PAGEERROR', String(e).slice(0, 200)); });
  p.on('console', (m) => { const s = m.text(); if (/dev-music|FEL-STUDIO|Quota|Error/i.test(s)) log('CON', s.slice(0, 200)); });
  await p.goto(`${BASE}/dev/music?stage=studio`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await startRoom(p);
  const first = await grid(p);
  R.firstVisit = { rows: first.rows, labels: first.labels, how: 'fresh browser context → TAP TO START → the grid div (StudioMode S.grid) children / 17' };
  log('first visit rows', first.rows);

  // 1. build
  await buildPattern(p);
  const built = await grid(p);
  R.cellSize = { desktop1280: { cellW: built.cellW, cellH: built.cellH, gridW: built.gridW, vw: built.vw, how: 'getBoundingClientRect of the first step cell (row 1, step 1) at a 1280×800 viewport; dev route adds no padding, StudioMode pads 16 px' } };
  log('built', built.lit, 'lit; rows', built.rows, 'cell', built.cellW);

  // 6. live swing: two bars at 92 BPM / 15 %
  const play1 = await playBars(p, 2);
  const s0 = (play1.steps as Any[]).filter((s) => s.step === 0).map((s) => s.time);
  const base = 60 / 92 / 4;
  R.liveSwing = {
    bpm: 92, swing: 0.15,
    barSecMeasured: s0.length >= 2 ? +(s0[1] - s0[0]).toFixed(4) : null,
    barSecUnswung: +(16 * base).toFixed(4),
    barSecRenderFormula: +(16 * base).toFixed(4),
    effectiveBpm: s0.length >= 2 ? +((60 * 4) / (s0[1] - s0[0])).toFixed(2) : null,
    oddStepOffsetMs: (() => {
      const st = play1.steps as Any[]; const i = st.findIndex((s) => s.step === 0); if (i < 0 || st.length < i + 3) return null;
      const t0s = st[i].time; return { step1: +((st[i + 1].time - t0s - base) * 1000).toFixed(2), step2: +((st[i + 2].time - t0s - 2 * base) * 1000).toFixed(2) };
    })(),
    audibleOver2Bars: play1.audible,
    how: 'dev hook __FEL_STUDIO__.steps (AudioEngine.scheduleStep times on the audio clock) over 2 bars of PLAY; bar = time between consecutive step-0s. The offline render places bar b at b·16·base with odd steps +base·swing·0.5 (AudioEngine.ts:214-215), so its bar is exactly the unswung one. oddStepOffsetMs = step time minus the straight grid (+ = late)',
  };
  log('live bar', R.liveSwing.barSecMeasured, 'vs', R.liveSwing.barSecUnswung);
  await frame(p, 'studio-desktop');

  // save one section (chain tier), so the matrix also tracks the SongPanel's state
  await btn(p, 'SAVE GRID AS SECTION').click();
  await p.waitForTimeout(200);
  const m: Any[] = [];
  // __FEL_FLIP__ is a global FlipPad writes while mounted and never clears, so on the STUDIO tab it is stale: the Flip's
  // survival is read only by going back to the FLIP tab (the 'STUDIO → FLIP again' rows).
  const snap = async (step: string) => {
    const g = await grid(p); const s = await song(p);
    m.push({ step, litCells: g?.lit ?? null, rows: g?.rows ?? null, sections: s?.sections ?? null, chainBars: s?.bars ?? null });
    log('matrix', step, JSON.stringify(m[m.length - 1]));
  };
  await snap('built 14 cells + saved 1 section');

  // FLIP and back
  await btn(p, 'FLIP').click();
  await btn(p, '808 bass').click();
  await p.waitForTimeout(700);
  await p.getByRole('button', { name: 'pad 1', exact: true }).dispatchEvent('pointerdown');
  await p.waitForTimeout(250);
  const flipLoaded = await flip(p);
  m.push({ step: 'FLIP tab: loaded 808 bass', flipSource: flipLoaded?.source, flipSlices: flipLoaded?.slices });
  await frame(p, 'flip-tab');
  await btn(p, 'STUDIO').click(); await p.waitForTimeout(200);
  await snap('FLIP → STUDIO');
  await btn(p, 'FLIP').click(); await p.waitForTimeout(250);
  const flipBack = await flip(p);
  m.push({ step: 'STUDIO → FLIP again', flipSource: flipBack?.source ?? null, flipSlices: flipBack?.slices ?? null });
  await btn(p, 'STUDIO').click(); await p.waitForTimeout(200);

  // PERFORM and back (the in-room toggle)
  await btn(p, 'PERFORM').click(); await p.waitForTimeout(200);
  await btn(p, 'BUILD').click(); await p.waitForTimeout(200);
  await snap('PERFORM → BUILD (in-room toggle)');

  // 2. HIDDEN BUT AUDIBLE — (a) the Flip: SEND TO TRACK pad 1, ARM REC, tap pads 1 and 2 while playing
  await btn(p, 'FLIP').click();
  await btn(p, '808 bass').click();
  await p.waitForTimeout(700);
  await p.getByRole('button', { name: 'pad 1', exact: true }).dispatchEvent('pointerdown');
  await p.waitForTimeout(150);
  await btn(p, 'SEND TO TRACK').click();
  await btn(p, 'ARM REC').click();
  await btn(p, 'PLAY').click();
  await p.waitForTimeout(400);
  for (const k of ['1', '1', '1', '1', '2', '2']) { await p.keyboard.press(k); await p.waitForTimeout(330); }
  await btn(p, 'STOP').click();
  await btn(p, '● REC ARMED').click().catch(() => {});
  await btn(p, 'STUDIO').click(); await p.waitForTimeout(250);
  const gFlip = await grid(p);
  const playFlip = await playBars(p, 2);
  const engFlip = await engine(p);
  R.hiddenAfterFlip = { ...hiddenAudible(engFlip, gFlip, playFlip.audible), audibleOver2Bars: playFlip.audible,
    how: 'FLIP: 808 bass, pad 1 → SEND TO TRACK, ARM REC, PLAY, keys 1×4 and 2×2 (330 ms apart), STOP; STUDIO: drawn row labels vs __FEL_STUDIO__.engine().tracks, then 2 bars of PLAY counting the hits scheduleStep started' };
  log('hidden after flip', JSON.stringify(R.hiddenAfterFlip.audibleNotDrawn), 'silent', JSON.stringify(R.hiddenAfterFlip.writtenButSilent));

  // (b) CELL at the chain tier
  const spendsBefore = await p.evaluate(() => (window as Any).__FEL_STUDIO__.spends.length);
  await p.getByRole('button', { name: /CELL: LAY A FOUNDATION/ }).click();
  await p.waitForTimeout(400);
  // MUSIC-SUITE P2 (2026-09-25): every shard spend now asks first (the inline [data-qa=shop-confirm]); P1 had no confirm.
  // Record whether it asked, and whether anything was spent BEFORE the yes, then say yes so the rest of the run is P1's.
  const cellConfirm = await confirmThenYes(p, spendsBefore);
  const gCell = await grid(p);
  const playCell = await playBars(p, 2);
  const engCell = await engine(p);
  const spends = await p.evaluate(() => (window as Any).__FEL_STUDIO__.spends);
  R.hiddenAfterCellChainTier = { ...hiddenAudible(engCell, gCell, playCell.audible), litDrawnAfterCell: gCell.lit, audibleOver2Bars: playCell.audible,
    spendsAsked: spends.slice(spendsBefore), confirmShown: cellConfirm.confirmShown, spentBeforeYes: cellConfirm.spentBeforeYes, confirmText: cellConfirm.text,
    how: 'CELL: LAY A FOUNDATION at the chain tier (6 rows drawn); P1: the spend went straight to spendShards with no confirm (the dev route logs every ask). P2 re-run: the inline confirm is recorded, then its BUY pressed; then 2 bars of PLAY' };
  log('hidden after cell', JSON.stringify(R.hiddenAfterCellChainTier.audibleNotDrawn));

  // 5. PERFORM on the CELL pattern
  await btn(p, 'PERFORM').click(); await p.waitForTimeout(150);
  await btn(p, 'PLAY').click();
  await p.waitForTimeout(600);
  const taps: Any[] = [];
  for (const off of [10, 40, 100, -30, 10, 40, 100, -30]) {
    taps.push(await p.evaluate(`(${TAP_AT})(${off})`));
    await p.waitForTimeout(250);
  }
  await frame(p, 'perform');
  const statusBefore = await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'TAP')?.nextElementSibling?.textContent ?? null);
  await btn(p, 'STOP').click();   // before END SET: the dev end card covers the room
  await btn(p, 'END SET').click();
  await p.waitForTimeout(400);
  const endPattern = await p.evaluate(() => (window as Any).__FEL_STUDIO__.ended);
  R.performOnPattern = { taps, statusBeforeEndSet: statusBefore, endSetResult: endPattern,
    how: 'PERFORM (in-room), PLAY; TAP clicked in-page when the engine clock reached a scheduled step-0 note + offsetMs (__FEL_STUDIO__.steps/now); status line read right after the click and the first MutationObserver change after the tap; END SET result = what StudioMode passed to onEnd' };
  log('perform taps', JSON.stringify(taps.map((t) => [t.offsetMs, t.dtMs, t.statusRightAfter])));

  // matrix: END SET → REPLAY (the shell's remount)
  await p.locator('[data-dev="replay"]').click();
  await startRoom(p);
  await snap('END SET → REPLAY (remount, as GameShell does)');
  const engReplay = await engine(p);
  m.push({ step: 'after REPLAY: engine tracks', engineTracks: engReplay?.tracks?.length ?? null, flipRowsKept: (engReplay?.tracks ?? []).filter((t: Any) => t.sampleId.startsWith('flip_')).length });

  // 5b. PERFORM on an EMPTY grid
  await btn(p, 'PERFORM').click(); await p.waitForTimeout(150);
  await p.evaluate(() => (window as Any).__FEL_STUDIO__.reset());
  await btn(p, 'PLAY').click();
  await p.waitForTimeout(600);
  const emptyTaps: Any[] = [];
  for (const off of [10, 40, 100]) { emptyTaps.push(await p.evaluate(`(${TAP_AT})(${off})`)); await p.waitForTimeout(250); }
  const emptyAudible = await p.evaluate(() => ({ ...(window as Any).__FEL_STUDIO__.audible }));
  await btn(p, 'STOP').click();
  await btn(p, 'END SET').click();
  await p.waitForTimeout(400);
  const endEmpty = await p.evaluate(() => (window as Any).__FEL_STUDIO__.ended);
  R.performOnEmptyGrid = { lit: (await p.evaluate(GRID) as Any)?.lit ?? null, taps: emptyTaps, audibleHitsWhilePlaying: emptyAudible, endSetResult: endEmpty,
    how: 'after REPLAY the grid is empty (0 lit); PERFORM, PLAY, TAP at step-0 + offset; END SET' };
  log('empty perform', JSON.stringify(emptyTaps.map((t) => [t.offsetMs, t.statusRightAfter])), 'won', endEmpty?.won);
  await p.locator('[data-dev="replay"]').click();
  await startRoom(p);

  // matrix: reload (rebuild first, so the reload is measured on its own)
  await buildPattern(p);
  await btn(p, 'SAVE GRID AS SECTION').click();
  await p.waitForTimeout(200);
  await snap('rebuilt 14 cells + 1 section (before reload)');
  await p.reload({ waitUntil: 'domcontentloaded' });
  await startRoom(p);
  await snap('reload');
  R.workSurvival = { matrix: m, how: 'lit = grid cells with the ON background (#ffb347) in the DOM; sections = window.__FEL_SONG__.sections (SongPanel); flip = window.__FEL_FLIP__ (FlipPad)' };

  // 4. PUBLISH until it fails
  await buildPattern(p);
  const pubs: Any[] = [];
  for (let i = 1; i <= 12; i++) {
    const before = await p.evaluate(() => { const s = localStorage.getItem('fel_studio_tracks_v1') ?? '[]'; return { n: JSON.parse(s).length, chars: s.length }; });
    const errsBefore = R.pageErrors.length;
    await p.getByPlaceholder('track title…').fill(`probe take ${i}`);
    await btn(p, 'PUBLISH TO LIBRARY').click();
    const toasts: string[] = [];
    const w0 = Date.now();
    while (Date.now() - w0 < 15000) {
      const t = await p.evaluate(() => [...document.querySelectorAll('div')].filter((d) => d.style.position === 'sticky').map((d) => d.textContent ?? ''));
      for (const s of t) if (s && !toasts.includes(s)) toasts.push(s);
      const busy = await p.getByRole('button', { name: 'RENDERING…' }).count();
      if (!busy && Date.now() - w0 > 400) break;
      await p.waitForTimeout(100);
    }
    await p.waitForTimeout(300);
    const after = await p.evaluate(() => { const s = localStorage.getItem('fel_studio_tracks_v1') ?? '[]'; return { n: JSON.parse(s).length, chars: s.length }; });
    const titleLeft = await p.getByPlaceholder('track title…').inputValue();
    const button = (await p.getByRole('button', { name: /PUBLISH TO LIBRARY|RENDERING/ }).first().textContent()) ?? '';
    const row = { attempt: i, libraryBefore: before.n, libraryAfter: after.n, storedCharsAfter: after.chars, toastsSeen: toasts, titleFieldAfter: titleLeft, buttonAfter: button, newPageErrors: R.pageErrors.slice(errsBefore) };
    pubs.push(row);
    log('publish', i, JSON.stringify(row).slice(0, 300));
    if (after.n <= before.n) { await frame(p, 'publish-fail'); break; }
  }
  const lastOk = pubs.filter((r) => r.libraryAfter > r.libraryBefore).length;
  R.publishUntilFailure = { attempts: pubs, succeeded: lastOk, failedAt: pubs.find((r) => r.libraryAfter <= r.libraryBefore)?.attempt ?? null,
    how: 'title filled, PUBLISH TO LIBRARY clicked, waited for RENDERING… to clear; library = JSON.parse(localStorage.fel_studio_tracks_v1).length; toasts = the sticky toast div\'s text while waiting; stops at the first publish that did not grow the library' };
  await ctx.close();

  // ── PHONE 375×812, a fresh context (first-visit tier) ─────────────────────────────────────────────────────────────
  const pctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pp = await pctx.newPage();
  await pp.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
  pp.on('pageerror', (e) => { R.pageErrors.push(`[phone] ${String(e).slice(0, 300)}`); });
  await pp.goto(`${BASE}/dev/music?stage=studio`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  const pstart = pp.getByRole('button', { name: 'TAP TO START' });
  await pstart.waitFor({ timeout: 240000 });
  await pstart.tap();
  await pp.waitForFunction(`${GRID} !== null`, undefined, { timeout: 60000 });
  const g4 = await pp.evaluate(GRID) as Any;
  R.cellSize.phone375 = { rows: g4.rows, cellW: g4.cellW, cellH: g4.cellH, gridW: g4.gridW, vw: g4.vw, pageScrollW: await pp.evaluate(() => document.documentElement.scrollWidth),
    how: 'fresh 375×812 context (isMobile, DPR 2), first-visit tier; getBoundingClientRect of step cell 1 in CSS px' };
  log('phone cell', g4.cellW, 'x', g4.cellH, 'rows', g4.rows);
  // a few taps so the frame shows a pattern
  for (const s of [0, 4, 8, 12]) await pp.evaluate(([r, st]) => { const g = [...document.querySelectorAll('div')].find((d) => (d.style.gridTemplateColumns || '').includes('repeat(16')) as HTMLElement; (g.children[r * 17 + 1 + st] as HTMLElement).click(); }, [0, s]);
  await pp.waitForTimeout(200);
  await frame(pp, 'studio-phone');
  // CELL on the first-visit tier: how many rows sound that the player cannot see?
  const pBefore = await pp.evaluate(GRID) as Any;
  const pSpends0 = await pp.evaluate(() => (window as Any).__FEL_STUDIO__.spends.length);
  await pp.getByRole('button', { name: /CELL: LAY A FOUNDATION/ }).tap();
  await pp.waitForTimeout(400);
  const pConfirm = await confirmThenYes(pp, pSpends0);   // MUSIC-SUITE P2: the confirm, then BUY
  const pAfter = await pp.evaluate(GRID) as Any;
  await pp.evaluate(() => (window as Any).__FEL_STUDIO__.reset());
  await pp.getByRole('button', { name: 'PLAY', exact: true }).tap();
  await pp.waitForTimeout(Math.round(2 * 16 * 60 / 92 / 4 * 1000) + 250);
  const pAud = await pp.evaluate(() => ({ ...(window as Any).__FEL_STUDIO__.audible }));
  const pEng = await pp.evaluate(() => (window as Any).__FEL_STUDIO__.engine());
  await pp.getByRole('button', { name: 'STOP', exact: true }).tap();
  R.hiddenAfterCellPhone = { rowsBeforeCell: pBefore.rows, rowsAfterCell: pAfter.rows, ...hiddenAudible(pEng, pAfter, pAud), audibleOver2Bars: pAud, cellConfirm: pConfirm,
    how: 'phone context: 4 kick taps (the pattern gate opens the chain tier), then CELL, 2 bars of PLAY; drawn rows vs engine tracks' };
  log('phone hidden after cell', JSON.stringify(R.hiddenAfterCellPhone.audibleNotDrawn));
  await pctx.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ARGS });
  try { await run(browser); }
  catch (e) { R.fatal = String((e as Error)?.stack ?? e).slice(0, 1200); console.error(e); }
  finally {
    await browser.close();
    R.runtimeSec = Math.round((Date.now() - t0) / 1000);
    fs.writeFileSync(`${OUT}/music-baseline.json`, JSON.stringify(R, null, 2));
    log('wrote', `${OUT}/music-baseline.json`);
  }
}
main();
