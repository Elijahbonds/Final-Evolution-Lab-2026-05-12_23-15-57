// MUSIC-SUITE P4 (2026-09-25), grid-ui — the pocket studio measured in a browser on the dev-only /dev/music route (the real
// StudioMode, no GameShell, database offline). What it checks, phone first:
//   PHONE 375 × 812 (touch): a step cell ≥ 40 px (P1: 16.5), NO sideways scroll (P1: 43 px) with the richest screen open
//     (THE STUDIO tier: 8 rows, the key bar, a NoteRow, the mixer, the booth), pages of 8 (buttons + a swipe on the step
//     strip), a touch TAP lights a cell, a sideways touch DRAG paints the cells it crosses as ONE undo step, a vertical
//     drag (a scroll) paints nothing; the transient line floats clear of the grid + transport and takes no taps.
//   DESKTOP 1280: 16 columns; a mouse stroke paints / clears (one UNDO); the keys (Space, arrows, Enter, Z / ⇧Z, ?, Esc)
//     and their collisions (FLIP tab: Z is a pad, never undo; PERFORM: Space is the TAP, never play/stop); a bass note
//     picked in the NoteRow plays as a note render (rate 1, not a playbackRate); a key change moves it and one UNDO puts
//     key + note back; the mixer's MUTE silences a row in the engine and survives a reload (autosave); the master meter
//     moves; METRO clicks; COUNT-IN delays bar 0 by a bar; CHECK MY TIMING reads 8 taps 100 ms late as +100 ms and saves
//     it dated; a library failure stays on its line past 2.2 s; the song key reaches the dance card and the library card;
//     two NEW projects in one minute get different names.
//
// MUSIC-SUITE P4 FIX PASS (2026-09-25): the review's findings, measured here the way the review measured them —
//   * the SPLASH: Space on the focused TAP TO START presses it (the room opens) and starts nothing behind it;
//   * the KEYS: Space on the page plays / stops, a HELD Space does not scroll the page, an arrow on the page scrolls it and
//     drops no cursor, Enter on the BPM slider lights nothing, Space on a focused METRO presses METRO; the arrows / Enter
//     act once the GRID has the focus; undo / redo are ⌘Z / Ctrl+Z / Ctrl+Shift+Z (the bare Z is a pad letter: nothing);
//   * the PHONE: a 240 px finger scroll starting on an open NoteRow's note writes no note; a 200 px scroll starting on the
//     mixer's VOL track moves no fader; M / S, the note cells and ♪ NOTES are ≥ 40 / 40 / 36 px; at 344 px (360 inside
//     GameShell's 8 px gutter) a step cell is ≥ 40 px;
//   * CHECK MY TIMING: a lead-in bar, 8 read clicks (as they leave the desk).
// Usage: node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p4-grid.mts   (BASE, OUT env override)
import { chromium, type BrowserContext, type CDPSession, type Page } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3121';
const OUT = process.env.OUT ?? '/Users/elijahbonds/Claude/outbox/finish-release/musicsuite/p4/grid';
fs.mkdirSync(OUT, { recursive: true });
const ARGS = ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[p4-grid +${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = { base: BASE, at: new Date().toISOString(), route: '/dev/music', frames: {}, pageErrors: [] as string[], checks: [] as Any[], numbers: {} };
const check = (name: string, pass: boolean, got: unknown, want: unknown) => { R.checks.push({ name, pass, got, want }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(got)); };
const frame = async (p: Page, name: string, full = false) => { const path = `${OUT}/p4-grid-${name}.png`; await p.screenshot({ path, fullPage: full }); R.frames[name] = path; };
const qa = (p: Page, id: string) => p.locator(`[data-qa="${id}"]`);
const cell = (p: Page, row: string, step: number) => p.locator(`[data-qa="cell"][data-row="${row}"][data-step="${step}"]`);
const grid = (p: Page): Promise<Any> => p.evaluate(() => (window as Any).__FEL_GRID__ ?? null);
const proj = (p: Page): Promise<Any> => p.evaluate(() => (window as Any).__FEL_PROJECT__ ?? null);
const on = (p: Page, row: string): Promise<number[]> => p.evaluate((r) => [...document.querySelectorAll(`[data-qa="cell"][data-row="${r}"][data-on="1"]`)].map((c) => Number((c as HTMLElement).dataset.step)), row);
const running = (p: Page): Promise<boolean> => p.evaluate(() => !!(window as Any).__FEL_STUDIO__?.engine()?.running);
const btn = (p: Page, name: string) => p.getByRole('button', { name, exact: true }).first();

/** Every AudioBufferSourceNode start (buffer length, rate, when) — installed before the page's own scripts. */
const INIT = (seedProgress: boolean) => `(() => {
  const log = window.__srcLog = [];
  const S = AudioBufferSourceNode.prototype; const st = S.start;
  S.start = function (when = 0) { log.push({ when, len: this.buffer ? this.buffer.length : 0, sr: this.buffer ? this.buffer.sampleRate : 0, rate: this.playbackRate.value, now: this.context.currentTime }); return st.apply(this, arguments); };
  ${seedProgress ? "localStorage.setItem('fel-music-progress', JSON.stringify({ patternsMade: 3, sectionsSaved: 2, chainEntries: 2 }));" : ''}
})();`;
const srcLog = (p: Page): Promise<Any[]> => p.evaluate(() => (window as Any).__srcLog.slice());
const clearSrc = (p: Page): Promise<void> => p.evaluate(() => { (window as Any).__srcLog.length = 0; });

async function openRoom(p: Page, url = `${BASE}/dev/music?stage=studio`): Promise<void> {
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 240000 });
  const start = p.getByRole('button', { name: 'TAP TO START' });
  await start.waitFor({ timeout: 240000 });
  await start.click();
  await qa(p, 'kit-grid').waitFor({ timeout: 60000 });
  await p.waitForTimeout(600);
}
const center = async (p: Page, loc: ReturnType<Page['locator']>): Promise<{ x: number; y: number }> => {
  const b = (await loc.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
/** A touch gesture through CDP: down at the first point, moves through the rest, up at the last. */
async function touchPath(cdp: CDPSession, pts: { x: number; y: number }[], stepMs = 16): Promise<void> {
  const tp = (q: { x: number; y: number }) => [{ x: q.x, y: q.y, radiusX: 4, radiusY: 4, force: 1, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(pts[0]) });
  for (const q of pts.slice(1)) { await new Promise((r) => setTimeout(r, stepMs)); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(q) }); }
  await new Promise((r) => setTimeout(r, stepMs));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, n: number) => Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
const overflow = (p: Page): Promise<Any> => p.evaluate(() => ({
  innerWidth, docScroll: document.documentElement.scrollWidth, bodyScroll: document.body.scrollWidth,
  wide: [...document.querySelectorAll('body *')].filter((e) => { const r = (e as HTMLElement).getBoundingClientRect(); return r.right > innerWidth + 0.5 && r.width > 0 && getComputedStyle(e).position !== 'fixed'; })
    .slice(0, 6).map((e) => `${(e as HTMLElement).tagName}.${(e as HTMLElement).dataset.qa ?? ''} right=${(e as HTMLElement).getBoundingClientRect().right.toFixed(0)}`),
}));

async function phone(ctx: BrowserContext): Promise<void> {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => R.pageErrors.push(`phone: ${e.message}`));
  const cdp = await ctx.newCDPSession(p);
  await openRoom(p);
  const g = await grid(p);
  check('phone: the grid is the phone grid — 2 pages of 8', g?.compact === true && g?.pages === 2 && g?.pageSteps === 8, g && { compact: g.compact, pages: g.pages, pageSteps: g.pageSteps }, 'compact, 2 × 8');
  const box = (await cell(p, 'kick', 0).boundingBox())!;
  const perRow = await p.locator('[data-qa="cell"][data-row="kick"]').count();
  R.numbers.phoneCell = { w: +box.width.toFixed(1), h: +box.height.toFixed(1), perRow };
  check('phone: a step cell is ≥ 40 px (P1: 16.5 px)', box.width >= 40 && box.height >= 40 && perRow === 8, R.numbers.phoneCell, '≥ 40 × 40, 8 a row');

  // a touch TAP lights a cell
  await p.touchscreen.tap(...Object.values(await center(p, cell(p, 'kick', 0))) as [number, number]);
  await p.waitForTimeout(150);
  check('phone: a touch tap lights the cell', (await on(p, 'kick')).includes(0), await on(p, 'kick'), '[0]');

  // a sideways touch DRAG paints the cells it crosses — one undo step
  const undoBefore = await qa(p, 'undo').isEnabled();
  const a = await center(p, cell(p, 'hat', 1)), b = await center(p, cell(p, 'hat', 5));
  await touchPath(cdp, lerp(a, b, 10));
  await p.waitForTimeout(250);
  const hats = await on(p, 'hat');
  check('phone: a sideways touch drag paints the cells it crosses', JSON.stringify(hats) === '[1,2,3,4,5]', hats, '[1,2,3,4,5]');
  await qa(p, 'undo').click();
  await p.waitForTimeout(150);
  check('phone: ONE undo takes the whole stroke back', (await on(p, 'hat')).length === 0 && undoBefore, { hats: await on(p, 'hat'), undoWasEnabled: undoBefore }, '[] after one UNDO');

  // a vertical drag that starts on a cell is a scroll: nothing painted
  const v0 = await center(p, cell(p, 'snare', 2));
  const before = await p.evaluate(() => scrollY);
  await touchPath(cdp, lerp(v0, { x: v0.x, y: v0.y - 220 }, 12), 16);
  await p.waitForTimeout(400);
  const snares = await on(p, 'snare');
  R.numbers.verticalDrag = { scrolledBy: +(await p.evaluate(() => scrollY) - before).toFixed(0), painted: snares };
  check('phone: a vertical drag from a cell paints nothing (it scrolls)', snares.length === 0, R.numbers.verticalDrag, 'painted []');
  await p.evaluate(() => scrollTo(0, 0));

  // pages: the button, then a swipe on the step strip
  await p.locator('[data-qa="grid-page"][data-page="1"]').click();
  await p.waitForTimeout(150);
  const steps2 = await p.evaluate(() => [...document.querySelectorAll('[data-qa="cell"][data-row="kick"]')].map((c) => Number((c as HTMLElement).dataset.step)));
  check('phone: page 2 draws steps 9–16', JSON.stringify(steps2) === JSON.stringify([8, 9, 10, 11, 12, 13, 14, 15]), steps2, '8..15');
  const strip = (await qa(p, 'step-overview').boundingBox())!;
  await touchPath(cdp, lerp({ x: strip.x + 20, y: strip.y + strip.height / 2 }, { x: strip.x + strip.width - 10, y: strip.y + strip.height / 2 }, 8));
  await p.waitForTimeout(200);
  check('phone: a left-to-right swipe on the step strip turns back to page 1', (await grid(p))?.page === 0, (await grid(p))?.page, 0);

  // open a NoteRow and the mixer, the richest screen, and look for sideways scroll
  await p.locator('[data-qa="note-open"][data-row="bass"]').click();
  await qa(p, 'mixer-toggle').click();
  await p.locator('[data-qa="strip-expand"]').first().click();
  await p.waitForTimeout(300);
  const ov = await overflow(p);
  R.numbers.phoneOverflow = ov;
  check('phone: no sideways scroll with the NoteRow, the mixer and the booth open (P1: 418 px page at 375)', ov.docScroll <= ov.innerWidth && ov.bodyScroll <= ov.innerWidth, ov, 'scrollWidth ≤ 375');
  const nr = (await qa(p, 'note-row').boundingBox())!;
  const nc = (await p.locator('[data-qa="note-cell"]').first().boundingBox())!;
  R.numbers.phoneNoteCell = { w: +nc.width.toFixed(1), h: +nc.height.toFixed(1), rowW: +nr.width.toFixed(1) };
  await frame(p, 'phone-studio', true);
  // P4 FIX PASS: phone targets
  const size = async (sel: string) => { const b = await p.locator(sel).first().boundingBox(); return b ? { w: +b.width.toFixed(1), h: +b.height.toFixed(1) } : null; };
  const sizes = { noteCell: await size('[data-qa="note-cell"]'), octDown: await size('[data-qa="note-oct-down"]'), mute: await size('[data-qa="strip-mute"]'), solo: await size('[data-qa="strip-solo"]'), notesOpen: await size('[data-qa="note-open"]') };
  R.numbers.phoneTargets = sizes;
  check('FIX PASS phone targets: note cells and OCT ≥ 40 px tall, M / S ≥ 40 × 40, ♪ NOTES ≥ 36 (were 30, 32, 30.9 × 32, 28)',
    !!sizes.noteCell && sizes.noteCell.h >= 40 && !!sizes.octDown && sizes.octDown.h >= 40 && !!sizes.mute && sizes.mute.w >= 40 && sizes.mute.h >= 40 && !!sizes.solo && sizes.solo.w >= 40 && !!sizes.notesOpen && sizes.notesOpen.h >= 36, sizes, '≥ 40 / 40 / 40 × 40 / 36');
  // P4 FIX PASS: a finger SCROLL that starts on a note cell of the open NoteRow writes no note (the review: bass [] → [3] E2)
  const bassBefore = await on(p, 'bass');
  const noteCells = p.locator('[data-qa="note-row"] [data-qa="note-cell"][data-step="3"]');
  await noteCells.nth(2).scrollIntoViewIfNeeded();
  const n0 = await center(p, noteCells.nth(2));
  const sy0 = await p.evaluate(() => scrollY);
  await touchPath(cdp, lerp(n0, { x: n0.x, y: n0.y - 240 }, 14), 16);
  await p.waitForTimeout(400);
  const noteScroll = { scrolledBy: Math.round(await p.evaluate(() => scrollY) - sy0), bassBefore, bassAfter: await on(p, 'bass') };
  R.numbers.noteRowScroll = noteScroll;
  check('FIX PASS phone: a 240 px finger scroll starting on a NoteRow note writes nothing (and the page scrolls)', JSON.stringify(noteScroll.bassAfter) === JSON.stringify(bassBefore) && noteScroll.scrolledBy > 50, noteScroll, 'bass unchanged, page scrolled');
  // …and a TAP on a note still picks it (on the lift)
  await noteCells.nth(2).scrollIntoViewIfNeeded();
  await p.touchscreen.tap(...Object.values(await center(p, noteCells.nth(2))) as [number, number]);
  await p.waitForTimeout(250);
  check('FIX PASS phone: a TAP on a NoteRow note lights that step', (await on(p, 'bass')).includes(3), await on(p, 'bass'), 'bass step 4 lit');
  await qa(p, 'undo').click(); await p.waitForTimeout(150);
  // P4 FIX PASS: a finger scroll starting on the mixer's VOL track moves no fader (the review: gain 1 → 0.26)
  const track = p.locator('[data-qa="strip-gain-track"]').first();
  if (await track.count()) {
    await track.scrollIntoViewIfNeeded();
    const t0c = await center(p, track);
    const sy1 = await p.evaluate(() => scrollY);
    const gainBefore = await p.locator('[data-qa="strip-gain"]').first().inputValue();
    await touchPath(cdp, lerp(t0c, { x: t0c.x, y: t0c.y - 200 }, 12), 16);
    await p.waitForTimeout(400);
    const faderScroll = { scrolledBy: Math.round(await p.evaluate(() => scrollY) - sy1), gainBefore, gainAfter: await p.locator('[data-qa="strip-gain"]').first().inputValue() };
    // a sideways drag on it does move it
    await track.scrollIntoViewIfNeeded();
    const tb = (await track.boundingBox())!;
    await touchPath(cdp, lerp({ x: tb.x + tb.width * 0.7, y: tb.y + tb.height / 2 }, { x: tb.x + tb.width * 0.3, y: tb.y + tb.height / 2 + 3 }, 10), 16);
    await p.waitForTimeout(300);
    const dragged = await p.locator('[data-qa="strip-gain"]').first().inputValue();
    R.numbers.faderScroll = { ...faderScroll, afterSidewaysDrag: dragged };
    check('FIX PASS phone: a 200 px finger scroll starting on VOL moves no fader (the page scrolls); a sideways drag moves it',
      faderScroll.gainAfter === faderScroll.gainBefore && faderScroll.scrolledBy > 50 && Number(dragged) < Number(gainBefore), R.numbers.faderScroll, 'gain unchanged by the scroll, lower after the drag');
    await qa(p, 'undo').click(); await p.waitForTimeout(150);
  } else check('FIX PASS phone: the VOL track is there to measure', false, 'no strip-gain-track', 'a track');
  // P4 FIX PASS: 360 px inside GameShell's 8 px gutter = a 344 px room: the cell is still ≥ 40 px
  await p.setViewportSize({ width: 344, height: 812 });
  await p.waitForTimeout(400);
  const narrow = (await cell(p, 'kick', 0).boundingBox())!;
  R.numbers.cellAt360InShell = { w: +narrow.width.toFixed(2), h: +narrow.height.toFixed(2) };
  check('FIX PASS phone: at 360 px inside GameShell (a 344 px room) a step cell is ≥ 40 px (was 39.25)', narrow.width >= 40, R.numbers.cellAt360InShell, '≥ 40');
  await p.setViewportSize({ width: 375, height: 812 });
  await p.waitForTimeout(300);
  await p.evaluate(() => scrollTo(0, 0));

  // THE TRANSIENT LINE. (a) the everyday screen — NoteRow and mixer closed, the grid and the transport both in view: the
  // line must cover none of them. (b) the grid filling the whole screen (NoteRow open, scrolled to the grid): no band is
  // free, so it must take the band covering LESS, and never a tap. The line is said by picking the STREET kit (harmless).
  const measureToast = (): Promise<Any> => p.evaluate(`(() => {
    const toast = document.querySelector('[data-qa="toast"]');
    if (!toast) return null;
    const tr = toast.getBoundingClientRect();
    const keep = ['[data-qa="step-grid"]', '[data-qa="transport"]'].map((q) => document.querySelector(q)).filter(Boolean).map((e) => e.getBoundingClientRect());
    function over(top, bottom) { let n = 0; for (const r of keep) n += Math.max(0, Math.min(bottom, r.bottom) - Math.max(top, r.top)); return Math.round(n); }
    const h = tr.height;
    return { spot: toast.dataset.spot, top: Math.round(tr.top), bottom: Math.round(tr.bottom), pointerEvents: getComputedStyle(toast).pointerEvents,
      covered: over(tr.top, tr.bottom), topBand: over(8, 8 + h), bottomBand: over(innerHeight - 8 - h, innerHeight - 8), vh: innerHeight };
  })()`);
  const sayKit = async (): Promise<void> => {
    await p.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === 'STREET'); if (b) b.click(); })()`);
    await qa(p, 'toast').waitFor({ timeout: 3000 }).catch(() => undefined);
    await p.waitForTimeout(100);
  };
  await p.locator('[data-qa="note-close"]').click();
  await qa(p, 'mixer-toggle').click();
  await p.waitForTimeout(2500);   // any earlier line has gone
  await p.evaluate(`(() => { const g = document.querySelector('[data-qa="step-grid"]'); scrollTo(0, g.getBoundingClientRect().top + scrollY - 90); })()`);
  await p.waitForTimeout(150);
  await sayKit();
  const everyday: Any = await measureToast();
  await frame(p, 'phone-toast');
  check('phone: the transient line covers none of the grid + transport when a band is free, and takes no taps', !!everyday && everyday.pointerEvents === 'none' && everyday.covered === 0, everyday, 'covered 0 px, pointer-events none');
  await p.waitForTimeout(2500);
  await p.locator('[data-qa="note-open"][data-row="bass"]').click();
  await p.evaluate(`(() => { const g = document.querySelector('[data-qa="step-grid"]'); scrollTo(0, g.getBoundingClientRect().top + scrollY - 4); })()`);
  await p.waitForTimeout(150);
  await sayKit();
  const full: Any = await measureToast();
  R.numbers.phoneToast = { everyday, gridFillsTheScreen: full };
  check('phone: with the grid filling the screen it takes the band covering less (and still no taps)', !!full && full.pointerEvents === 'none' && full.covered <= Math.min(full.topBand, full.bottomBand) + 1, full, 'covered = min(top band, bottom band)');
  await p.close();
}

async function desktop(ctx: BrowserContext): Promise<void> {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => R.pageErrors.push(`desktop: ${e.message}`));
  // P4 FIX PASS: Space on the focused TAP TO START presses it — and starts nothing behind the splash (the review:
  // {splashStillThere: true, roomEntered: 0, engineRunning: true})
  await p.goto(`${BASE}/dev/music?stage=studio`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  const startBtn = p.getByRole('button', { name: 'TAP TO START' });
  await startBtn.waitFor({ timeout: 240000 });
  await startBtn.focus();
  await p.keyboard.press(' ');
  await p.waitForTimeout(800);
  const splash = { splashStillThere: await startBtn.count(), roomEntered: await qa(p, 'kit-grid').count(), engineRunning: await running(p) };
  R.numbers.splashSpace = splash;
  check('FIX PASS: Space on the splash\'s focused TAP TO START presses it, and nothing plays behind it', splash.splashStillThere === 0 && splash.roomEntered === 1 && splash.engineRunning === false, splash, '{0, 1, false}');
  await qa(p, 'kit-grid').waitFor({ timeout: 60000 });
  await p.waitForTimeout(600);
  const g = await grid(p);
  const perRow = await p.locator('[data-qa="cell"][data-row="kick"]').count();
  check('desktop: 16 columns, no pages', g?.compact === false && perRow === 16, { compact: g?.compact, perRow }, '16');

  // a mouse stroke: kick 0 → 5 paints ON; a stroke from a lit cell clears; one UNDO per stroke
  const a = await center(p, cell(p, 'kick', 0)), b = await center(p, cell(p, 'kick', 5));
  await p.mouse.move(a.x, a.y); await p.mouse.down();
  for (const q of lerp(a, b, 6)) await p.mouse.move(q.x, q.y);
  await p.mouse.up();
  await p.waitForTimeout(150);
  check('desktop: a mouse stroke paints ON across 6 cells', JSON.stringify(await on(p, 'kick')) === '[0,1,2,3,4,5]', await on(p, 'kick'), '[0..5]');
  const c2 = await center(p, cell(p, 'kick', 2)), c4 = await center(p, cell(p, 'kick', 4));
  await p.mouse.move(c2.x, c2.y); await p.mouse.down(); await p.mouse.move(c4.x, c4.y, { steps: 4 }); await p.mouse.up();
  await p.waitForTimeout(150);
  check('desktop: a stroke from a LIT cell clears', JSON.stringify(await on(p, 'kick')) === '[0,1,5]', await on(p, 'kick'), '[0,1,5]');
  await qa(p, 'undo').click(); await p.waitForTimeout(100);
  const afterOne = await on(p, 'kick');
  await qa(p, 'undo').click(); await p.waitForTimeout(100);
  check('desktop: one UNDO per stroke', JSON.stringify(afterOne) === '[0,1,2,3,4,5]' && (await on(p, 'kick')).length === 0, { afterOne, afterTwo: await on(p, 'kick') }, '[0..5] then []');

  // KEYS: focus the page (not a field), Space plays / stops
  await p.mouse.click(5, 5);
  await p.keyboard.press(' '); await p.waitForTimeout(300);
  const playing1 = await running(p);
  await p.keyboard.press(' '); await p.waitForTimeout(200);
  check('keys: Space plays and stops', playing1 && !(await running(p)), { afterFirst: playing1, afterSecond: await running(p) }, 'true then false');
  // P4 FIX PASS: a HELD Space does not scroll the page (the review: 6 repeats scrolled 0 → 782)
  await p.evaluate(() => scrollTo(0, 0));
  await p.mouse.click(5, 5);
  await p.keyboard.down(' ');
  for (let i = 0; i < 6; i++) await p.evaluate(() => { const e = new KeyboardEvent('keydown', { key: ' ', code: 'Space', repeat: true, bubbles: true, cancelable: true }); if (document.body.dispatchEvent(e)) scrollBy(0, innerHeight * 0.8); });
  await p.keyboard.up(' ');
  await p.waitForTimeout(300);
  const held = { scrollY: await p.evaluate(() => scrollY), running: await running(p) };
  if (held.running) await p.keyboard.press(' ');
  await p.waitForTimeout(200);
  R.numbers.heldSpace = held;
  check('FIX PASS keys: a held Space is one play and its repeats are cancelled (no page scroll)', held.scrollY === 0 && held.running === true, held, 'scrollY 0, playing');
  // P4 FIX PASS: an arrow on the PAGE scrolls it — no cursor, no jump back to the grid (the review: 782 → 263 + a cursor)
  await p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await p.waitForTimeout(150);
  await p.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const y0 = await p.evaluate(() => scrollY);
  await p.keyboard.press('ArrowUp'); await p.waitForTimeout(300);
  const arrowPage = { before: y0, after: await p.evaluate(() => scrollY), cursor: (await grid(p))?.cursor ?? null };
  R.numbers.arrowOnPage = arrowPage;
  check('FIX PASS keys: ArrowUp on the page scrolls the page up a little and drops no cursor', arrowPage.cursor === null && arrowPage.after < arrowPage.before && arrowPage.before - arrowPage.after < 200, arrowPage, 'no cursor, a small scroll up');
  // P4 FIX PASS: Enter on the focused BPM slider lights nothing (the review: kick [] → [0])
  const kickBefore = await on(p, 'kick');
  await p.locator('label:has-text("BPM") input[type=range]').focus();
  await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  check('FIX PASS keys: Enter on a focused slider lights no step', JSON.stringify(await on(p, 'kick')) === JSON.stringify(kickBefore) && (await grid(p))?.cursor === null, { kick: await on(p, 'kick'), cursor: (await grid(p))?.cursor }, 'unchanged, no cursor');
  // P4 FIX PASS: Space on a focused button presses THAT button (METRO toggles; the transport does not start)
  const metroBefore = (await grid(p))?.metronome;
  await qa(p, 'metronome').focus();
  await p.keyboard.press(' '); await p.waitForTimeout(200);
  const metro = { before: metroBefore, after: (await grid(p))?.metronome, running: await running(p) };
  check('FIX PASS keys: Space on a focused METRO presses METRO (it toggled the transport and cancelled the button)', metro.after === !metro.before && metro.running === false, metro, 'toggled, not playing');
  await qa(p, 'metronome').click();   // back as it was
  // the GRID holds the arrows and Enter: focus it (keyboard focus shows a ring and a cursor), then move
  await p.evaluate(() => scrollTo(0, 0));
  await p.keyboard.press('Tab');   // from METRO onwards is not the grid — focus it the way Tab lands on it
  await p.locator('[data-qa="step-grid"]').focus();
  await p.waitForTimeout(100);
  R.numbers.gridFocus = { ring: await p.locator('[data-qa="step-grid"]').getAttribute('data-focus-ring'), cursor: (await grid(p))?.cursor ?? null };
  await p.keyboard.press('Escape');   // start from no cursor (focus may have put one on step 1)
  await p.keyboard.press('ArrowRight');
  await p.keyboard.press('ArrowRight');
  await p.keyboard.press('ArrowDown');
  const cur = (await grid(p))?.cursor;
  await p.keyboard.press('Enter'); await p.waitForTimeout(100);
  check('keys: on the focused grid the arrows move the cursor, Enter lights its step', JSON.stringify(cur) === JSON.stringify({ row: 'snare', step: 1 }) && (await on(p, 'snare')).includes(1), { cur, snare: await on(p, 'snare'), focus: R.numbers.gridFocus }, 'snare step 2 lit');
  await p.keyboard.press('z'); await p.waitForTimeout(100);
  const bareZ = await on(p, 'snare');
  await p.keyboard.press('Control+z'); await p.waitForTimeout(100);
  const undone = await on(p, 'snare');
  await p.keyboard.press('Control+Shift+Z'); await p.waitForTimeout(100);
  check('keys: a bare Z (a pad letter) is nothing; Ctrl+Z undoes, Ctrl+Shift+Z redoes', bareZ.includes(1) && undone.length === 0 && (await on(p, 'snare')).includes(1), { afterZ: bareZ, afterCtrlZ: undone, afterCtrlShiftZ: await on(p, 'snare') }, '[1], [] then [1]');
  await p.keyboard.press('?'); await p.waitForTimeout(100);
  const helpShown = await qa(p, 'keys-help-panel').isVisible();
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  check('keys: ? shows the key map, Esc closes it', helpShown && !(await qa(p, 'keys-help-panel').isVisible()), { shown: helpShown }, 'shown, then closed');
  // typing in a field is left alone
  await p.getByPlaceholder('track title…').click();
  await p.keyboard.type('z ');
  check('keys: typing Z and Space in the title field only types', (await p.getByPlaceholder('track title…').inputValue()) === 'z ' && (await on(p, 'snare')).includes(1) && !(await running(p)),
    { value: await p.getByPlaceholder('track title…').inputValue(), running: await running(p) }, "'z ', grid unchanged, not playing");
  await p.getByPlaceholder('track title…').fill('');
  await p.mouse.click(5, 5);
  // FLIP tab: z is a pad key, never undo
  await btn(p, 'FLIP').click(); await p.waitForTimeout(300);
  await p.keyboard.press('z'); await p.waitForTimeout(150);
  await p.keyboard.press('Control+z'); await p.waitForTimeout(150);
  await btn(p, 'STUDIO').click(); await p.waitForTimeout(300);
  check('collision: on the FLIP tab Z is a pad — the grid was not undone', (await on(p, 'snare')).includes(1), await on(p, 'snare'), '[1] kept');
  // PERFORM: Space is the TAP (P2), never play/stop
  await btn(p, 'PERFORM').click(); await p.waitForTimeout(200);
  await p.mouse.click(5, 5);
  const r0 = await running(p);
  await p.keyboard.press(' '); await p.waitForTimeout(200);
  check('collision: in PERFORM, Space does not start / stop the transport', (await running(p)) === r0, { before: r0, after: await running(p) }, 'unchanged');
  await btn(p, 'END SET').click().catch(() => undefined);
  await p.waitForTimeout(600);
  if (await btn(p, 'REPLAY').count()) { await btn(p, 'REPLAY').click(); await p.waitForTimeout(600); const s = p.getByRole('button', { name: 'TAP TO START' }); if (await s.count()) { await s.click(); await qa(p, 'kit-grid').waitFor(); } }
  if (await btn(p, 'BUILD').count()) await btn(p, 'BUILD').click();
  await p.waitForTimeout(300);

  // MELODY: the bass NoteRow — pick C2 on step 1; it plays as a render of C2 (rate 1)
  await p.locator('[data-qa="note-open"][data-row="bass"]').click();
  await qa(p, 'note-row').waitFor();
  await p.locator('[data-qa="note-cell"][data-step="0"][data-note="36"]').click();
  await p.waitForTimeout(600);
  const label = await cell(p, 'bass', 0).getAttribute('aria-label');
  const renders = (await grid(p))?.noteRenders;
  check('melody: a NoteRow tap puts C2 on bass step 1 (the cell says C2) and the room renders C2', /on C2$/.test(label ?? '') && renders?.bass?.includes(36), { label, renders }, 'C2, bass render [36]');
  await clearSrc(p);
  await btn(p, 'PLAY').click(); await p.waitForTimeout(1400); await btn(p, 'STOP').click();
  const bassLen = Math.round(0.42 * 44100);
  const bassSrc = (await srcLog(p)).filter((e: Any) => e.len === bassLen);
  R.numbers.bassSources = bassSrc.slice(0, 4);
  check('melody: the C2 plays as its own render (rate 1), not the A1 buffer at a playbackRate', bassSrc.length > 0 && bassSrc.every((e: Any) => e.rate === 1), bassSrc.slice(0, 3), 'rate 1');
  // the KEY: C major moves the note; one UNDO puts key and note back
  await qa(p, 'key-root').selectOption('0');
  await p.waitForTimeout(150);
  await qa(p, 'key-scale').selectOption('major');
  await p.waitForTimeout(250);
  const sig = await qa(p, 'key-sig').textContent();
  const moved = await cell(p, 'bass', 0).getAttribute('aria-label');
  await qa(p, 'undo').click(); await p.waitForTimeout(200);
  const sigBack = await qa(p, 'key-sig').textContent();
  const back = await cell(p, 'bass', 0).getAttribute('aria-label');
  check('key: C major moves the bass note; ONE undo brings back Am and C2', sig === 'C' && !/C2$/.test(moved ?? '') && sigBack === 'Am' && /on C2$/.test(back ?? ''), { sig, moved, sigBack, back }, 'C → moved; Am + C2 back');

  // THE MIXER: mute the kick → no kick sources; the master meter moves; the mute survives a reload
  for (const s of [0, 4, 8, 12]) await cell(p, 'kick', s).click();
  await qa(p, 'mixer-toggle').click();
  await p.locator('[data-qa="mixer-strip"][data-row="kick"] [data-qa="strip-mute"]').click();
  await clearSrc(p);
  await btn(p, 'PLAY').click();
  let fill = 0;
  for (let i = 0; i < 16; i++) { await p.waitForTimeout(100); fill = Math.max(fill, Number(await p.locator('[data-qa="meter-bar"][data-meter="master:l"]').getAttribute('data-fill'))); }
  await btn(p, 'STOP').click();
  const kickLen = Math.ceil(0.55 * 44100);   // SynthKit renders the STREET kick 0.55 s long at 44.1 kHz (ceil)
  const kicksMuted = (await srcLog(p)).filter((e: Any) => e.len === kickLen).length;
  await p.locator('[data-qa="mixer-strip"][data-row="kick"] [data-qa="strip-mute"]').click();
  await clearSrc(p);
  await btn(p, 'PLAY').click(); await p.waitForTimeout(1600); await btn(p, 'STOP').click();
  const kicksOpen = (await srcLog(p)).filter((e: Any) => e.len === kickLen).length;
  check('mixer: MUTE silences the kick in the engine; unmuted it plays; the master meter moves', kicksMuted === 0 && kicksOpen > 0 && Number(fill) > 0, { kicksMuted, kicksOpen, masterFill: fill }, '0, > 0, > 0');
  await p.locator('[data-qa="mixer-strip"][data-row="snare"] [data-qa="strip-solo"]').click();
  await p.waitForTimeout(900);   // autosave (400 ms)
  await frame(p, 'desktop-mixer');
  await p.reload({ waitUntil: 'domcontentloaded' });
  { const s = p.getByRole('button', { name: 'TAP TO START' }); await s.waitFor({ timeout: 120000 }); await s.click(); await qa(p, 'kit-grid').waitFor(); }
  await p.waitForTimeout(500);
  await qa(p, 'mixer-toggle').click();
  const soloKept = await p.locator('[data-qa="mixer-strip"][data-row="snare"]').getAttribute('data-solo');
  const kickSilent = await p.locator('[data-qa="grid-row"][data-row="kick"]').getAttribute('data-silent');
  check('mixer: a SOLO survives a reload (autosaved in the project); the grid marks the others silent', soloKept === '1' && kickSilent === 'solo', { soloKept, kickSilent }, "'1', 'solo'");
  await p.locator('[data-qa="mixer-strip"][data-row="snare"] [data-qa="strip-solo"]').click();

  // THE CLIP LIGHT: a loud mix — six rows lit on every step, the master fader at +3.5 dB — must light the master's clip
  // light and show the limiter's pull; the meter itself stays under the ceiling
  for (const row of ['kick', 'snare', 'hat', 'open', 'clap', 'bass']) {
    const lit = await on(p, row);
    const from = await center(p, cell(p, row, lit.includes(0) ? 1 : 0)), to = await center(p, cell(p, row, 15));
    await p.mouse.move(from.x, from.y); await p.mouse.down(); await p.mouse.move(to.x, to.y, { steps: 12 }); await p.mouse.up();
  }
  await p.locator('[data-qa="master-fader"]').fill('1.5');
  await btn(p, 'PLAY').click();
  let lit = false, maxFill = 0, limit = '';
  for (let i = 0; i < 25; i++) {
    await p.waitForTimeout(80);
    lit ||= (await p.locator('[data-qa="clip-light"][data-meter="master:l"]').getAttribute('data-lit')) === '1';
    maxFill = Math.max(maxFill, Number(await p.locator('[data-qa="meter-bar"][data-meter="master:l"]').getAttribute('data-fill')));
    const l = (await qa(p, 'limiter-label').textContent()) ?? '';
    if (l.length > limit.length) limit = l;
  }
  await btn(p, 'STOP').click();
  R.numbers.clipLight = { lit, maxMasterFill: maxFill, maxMasterDb: +(maxFill * 60 - 60).toFixed(1), limiterLabel: limit, rowsLit: 6 };
  check('mixer: a mix pushed into the limiter lights the master clip light and shows the pull; the meter stays under 0 dBFS', lit && /LIMIT/.test(limit) && maxFill < 1, R.numbers.clipLight, 'lit, LIMIT −x dB, fill < 1');
  await p.locator('[data-qa="master-fader"]').fill('1');
  await qa(p, 'clear').click(); await qa(p, 'clear-yes').click();

  // METRO and COUNT-IN
  // a click buffer is 45 ms at the live context's rate (mixGraph clickBuffer)
  const isClick = (e: Any) => Math.abs(e.len - Math.floor(0.045 * e.sr)) <= 1;
  await qa(p, 'metronome').click();
  await clearSrc(p);
  await btn(p, 'PLAY').click(); await p.waitForTimeout(1500); await btn(p, 'STOP').click();
  const clicksOn = (await srcLog(p)).filter(isClick).length;
  await qa(p, 'metronome').click();
  await clearSrc(p);
  await btn(p, 'PLAY').click(); await p.waitForTimeout(1500); await btn(p, 'STOP').click();
  const clicksOff = (await srcLog(p)).filter(isClick).length;
  check('transport: METRO ON clicks on the beat; OFF, none', clicksOn >= 2 && clicksOff === 0, { clicksOn, clicksOff }, '≥ 2, 0');
  await qa(p, 'count-in').click();   // 1 bar
  const t1 = await p.evaluate(() => (window as Any).__FEL_STUDIO__.now());
  await p.evaluate(() => (window as Any).__FEL_STUDIO__.reset());
  await btn(p, 'PLAY').click(); await p.waitForTimeout(3600);
  const firstStep = await p.evaluate(() => (window as Any).__FEL_STUDIO__.steps[0]?.time ?? null);
  await btn(p, 'STOP').click();
  const bar = 60 / 92 * 4;
  R.numbers.countIn = { playAt: t1, firstStepAt: firstStep, delay: firstStep !== null ? +(firstStep - t1).toFixed(3) : null, bar: +bar.toFixed(3) };
  check('transport: COUNT-IN 1 BAR — bar 0 starts one bar after PLAY', firstStep !== null && firstStep - t1 > bar - 0.2 && firstStep - t1 < bar + 0.6, R.numbers.countIn, `≈ ${bar.toFixed(2)} s`);
  await qa(p, 'count-in').click(); await qa(p, 'count-in').click();   // back OFF

  // CHECK MY TIMING: 8 taps, each 100 ms after its click, dispatched in the page on the audio clock
  await qa(p, 'timing-check').click();
  await p.waitForFunction(() => ((window as Any).__FEL_GRID__?.check === 'listening'), undefined, { timeout: 5000 });
  // the clicks the engine scheduled (the dev hook's checkClicks), each tapped 100 ms late on the audio clock, in the page
  const tapped: Any = await p.evaluate(`(async () => {
    const W = window;
    const clicks = W.__FEL_GRID__.checkClicks;
    let n = 0;
    for (const c of clicks) {
      while (W.__FEL_STUDIO__.now() < c + 0.1) await new Promise((r) => setTimeout(r, 1));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
      n++;
    }
    return { taps: n, clicks: clicks.length, gap: clicks.length > 1 ? clicks[1] - clicks[0] : null };
  })()`);
  await p.waitForTimeout(500);
  const result = await qa(p, 'timing-result').textContent().catch(() => null);
  const stored = await p.evaluate(() => ({ off: localStorage.getItem('fel.audioOffsetMs'), at: localStorage.getItem('fel.audioOffsetMeasuredAt') }));
  const shown = await qa(p, 'timing-offset').textContent().catch(() => null);
  R.numbers.timingCheck = { tapped, result, stored, shown };
  check('CHECK MY TIMING: 8 taps 100 ms late read +100 ms, saved dated, shown in the transport', /your offset \+100 ms/.test(result ?? '') && stored.off === '100' && !!stored.at && /your offset \+100 ms/.test(shown ?? ''), R.numbers.timingCheck, "'+100 ms', stored 100 + a date");
  await frame(p, 'desktop-timing');

  // the song key on the dance card (a beat to send: the loud mix above was cleared)
  for (const st of [0, 4, 8, 12]) await cell(p, 'kick', st).click();
  await qa(p, 'dance-export').click(); await p.waitForTimeout(200);
  const blurb = await p.evaluate(() => JSON.parse(localStorage.getItem('fel-dance-exported') ?? 'null')?.track?.blurb ?? null);
  // P4 FIX PASS: in words — the Cypher's chip upper-cases the blurb ('Am' read 'AM')
  check('key: the dance card says the song’s key, in words that survive the Cypher\'s upper-casing', /^Your song · A minor · /.test(blurb ?? '') && /^YOUR SONG · A MINOR · /.test((blurb ?? '').toUpperCase()), blurb, "'Your song · A minor · …'");

  // two NEW projects in one minute get different names
  await qa(p, 'projects-toggle').click();
  await qa(p, 'project-new').click(); await p.waitForTimeout(400);
  await cell(p, 'kick', 3).click(); await p.waitForTimeout(700);
  const firstTitle = (await proj(p))?.title;
  await qa(p, 'projects-toggle').click().catch(() => undefined);
  if (!(await qa(p, 'project-new').isVisible())) await qa(p, 'projects-toggle').click();
  await qa(p, 'project-new').click(); await p.waitForTimeout(600);
  const secondTitle = (await proj(p))?.title;
  // (the room's first project is this minute's plain name already, so the first NEW is '(2)' and the next '(3)')
  const base = (t?: string) => (t ?? '').replace(/ \(\d+\)$/, '');
  check('titles: two NEW projects in one minute get different names', !!firstTitle && !!secondTitle && firstTitle !== secondTitle && base(firstTitle) === base(secondTitle) && / \(\d+\)$/.test(secondTitle ?? ''), { firstTitle, secondTitle }, "same minute, different '(n)'");
  await frame(p, 'desktop-grid');
  await p.close();
}

/** A library failure stays on its line (P3: a 2.2 s toast), and the record's key shows on its card. */
async function library(ctx: BrowserContext): Promise<void> {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => R.pageErrors.push(`library: ${e.message}`));
  await p.addInitScript(() => {
    const id = 'trk_p4probe';
    localStorage.setItem('fel_studio_library_v2', JSON.stringify({ v: 2, tracks: [{
      id, title: 'Probe Dorian', authorId: 'dev-player', authorName: 'Probe', kit: 'street', bpm: 92, swing: 0.15, polished: false,
      sequencer: { bpm: 92, steps: 16, swing: 0.15, tracks: [] }, remixOf: null, streamingLinks: [], createdAt: 1, plays: 0, saves: 0,
      audioKey: `library/${id}`, audio: 'device', audioBytes: 1000, key: { root: 2, scale: 'dorian' },
    }] }));
  });
  await openRoom(p);
  await btn(p, 'LIBRARY').click(); await p.waitForTimeout(300);
  const card = await p.getByText('Probe Dorian').locator('..').textContent();
  await p.getByRole('button', { name: '▶ PLAY' }).first().click();
  await qa(p, 'library-line').waitFor({ timeout: 5000 }).catch(() => undefined);
  const line1 = await qa(p, 'library-line').textContent().catch(() => null);
  await p.waitForTimeout(3000);
  const line2 = await qa(p, 'library-line').textContent().catch(() => null);
  check('library: a failure stays on the lasting line past 2.2 s (was a toast)', !!line1 && line1 === line2, { line1, after3s: line2 }, 'the same line after 3 s');
  check('key: the library card shows the record’s key', /D dorian/.test(card ?? ''), card, "'… · D dorian'");
  await frame(p, 'library-line');
  await p.close();
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ executablePath: chromiumExe(), args: ARGS, headless: true });
  try {
    const phoneCtx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await phoneCtx.addInitScript(INIT(true));
    await phone(phoneCtx).catch((e) => { R.pageErrors.push(`phone probe: ${e.message}`); log('phone probe threw', e); });
    await phoneCtx.close();
    const deskCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await deskCtx.addInitScript(INIT(true));
    await desktop(deskCtx).catch((e) => { R.pageErrors.push(`desktop probe: ${e.message}`); log('desktop probe threw', e); });
    await deskCtx.close();
    const libCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await libCtx.addInitScript(INIT(false));
    await library(libCtx).catch((e) => { R.pageErrors.push(`library probe: ${e.message}`); log('library probe threw', e); });
    await libCtx.close();
  } finally {
    await browser.close();
  }
  R.passed = R.checks.filter((c: Any) => c.pass).length;
  R.total = R.checks.length;
  fs.writeFileSync(`${OUT}/grid-proof.json`, JSON.stringify(R, null, 2));
  log(`${R.passed}/${R.total} passed · page errors ${R.pageErrors.length}`, R.pageErrors);
}
void main();
