// MUSIC-SUITE P10 FIX (2026-09-29) — THE PHONE GRID NEVER TURNS UNDER A FINGER OR AN OPEN NOTE ROW, live on :3121.
// The review traced (code reading, not reproduced) two ways P10's playhead-follow turned the page under the player: a
// press still DOWN on a cell (a touch stays pending until it lifts or moves, and only an emitted edit counted as a
// touch) — the next drift turned the tap into a stroke to the cell now under the finger (steps 4–12 lit in one "tap");
// and an open NoteRow, which flipped between steps 1–8 and 9–16 every 1.3 s while the player read it. The fix
// (gridMath followPage `held`, StudioMode gridHeldRef / openNote / cursor) is driven here on /dev/music at 390 × 844:
//   A. control: PLAY and leave the grid alone — the page follows the playhead (turns counted);
//   B. a press held on kick step 3 across the page line, a 3 px drift, then the release — turns while held, the kick
//      steps lit before / after (a stroke across a turned page would light a run), the first turn after the release;
//   C. the bass ♪ NOTES row open for 4 s (turns while open), then DONE and the first turn after it.
// Usage: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_music-p10-gridhold.mts
import fs from 'node:fs';
import type { Page } from 'playwright-core';
import { BASE, assertDisk, launch, newPage, writeJson, sleep, OUT_ROOT, type Any } from './_p10-lib.mts';

const OUT = `${OUT_ROOT}/gridhold`;
fs.mkdirSync(OUT, { recursive: true });
const R: Any = { at: new Date().toISOString(), base: BASE, errors: [] as string[] };
const STUDIO_TIER = `try { if (!localStorage.getItem('fel-music-progress')) localStorage.setItem('fel-music-progress', '{"patternsMade":1,"sectionsSaved":2,"chainEntries":2}'); } catch (e) {}`;
const PHONE_390 = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const grid = (p: Page) => p.evaluate(() => {
  const g = document.querySelector('[data-qa="step-grid"]') as HTMLElement | null;
  const head = document.querySelector('[data-qa="step-overview"] [data-head="1"]') as HTMLElement | null;
  const kick = Array.from(document.querySelectorAll('[data-qa="cell"][data-row="kick"]')).filter((c) => (c as HTMLElement).dataset.on === '1').map((c) => Number((c as HTMLElement).dataset.step));
  return { page: g ? Number(g.dataset.page) : null, head: head ? Number(head.dataset.step) : null, kickOnPage: kick };
});
/** The kick row's hit count, as the ENGINE has it (both pages: the DOM draws only the page on screen). */
const kickHits = (p: Page) => p.evaluate(() => {
  const e = (window as Any).__FEL_STUDIO__?.engine(); const t = e?.tracks?.find((x: Any) => x.sampleId === 'kick');
  return t ? (t.hits as number) : null;
});
/** Sample the page every 40 ms for `ms`: the page turns seen (at ms, from → to, the playhead then). */
async function watch(p: Page, ms: number): Promise<{ turns: Any[]; samples: number; pages: number[] }> {
  const t0 = Date.now(); let last: number | null = null; const turns: Any[] = []; let n = 0; const pages = new Set<number>();
  while (Date.now() - t0 < ms) {
    const g = await grid(p); n++;
    if (g.page !== null) { pages.add(g.page); if (last !== null && g.page !== last) turns.push({ ms: Date.now() - t0, from: last, to: g.page, head: g.head }); last = g.page; }
    await sleep(40);
  }
  return { turns, samples: n, pages: [...pages] };
}

const b = await launch();
try {
  R.disk = assertDisk('gridhold');
  const ctx = await b.newContext(PHONE_390);
  await ctx.addInitScript({ content: STUDIO_TIER });
  const p = await newPage(ctx, R.errors, 'gridhold');
  await p.goto(`${BASE}/dev/music?stage=studio&player=p10gridhold`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  const start = p.getByRole('button', { name: 'TAP TO START' }); await start.waitFor({ timeout: 300000 }); await start.click(); await sleep(700);
  await p.waitForSelector('[data-qa="step-grid"][data-compact="1"]', { timeout: 60000 });
  await p.getByRole('button', { name: 'PLAY', exact: true }).first().click();
  await p.waitForFunction(() => { const e = (window as Any).__FEL_STUDIO__?.engine(); return !!e && e.running; }, undefined, { timeout: 20000 });
  await sleep(1500);

  // A. control
  R.A_control = await watch(p, 4000);

  // B. a press held on kick step 3 across the page line (the grid scrolled into view first: a raw mouse.down outside
  // the viewport reaches nothing — the first run pressed below the fold and measured an untouched grid)
  const cell = p.locator('[data-qa="cell"][data-row="kick"][data-step="2"]');
  await cell.scrollIntoViewIfNeeded();
  await sleep(300);
  R.cellInViewport = await cell.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; });
  for (let i = 0; i < 200; i++) { const g = await grid(p); if (g.page === 0 && g.head !== null && g.head >= 4 && g.head <= 5) break; await sleep(15); }
  const before = await grid(p);
  const box = (await cell.boundingBox())!;
  R.pressTarget = await p.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y) as HTMLElement | null; return el ? { qa: el.dataset.qa ?? el.tagName, row: el.dataset.row ?? null, step: el.dataset.step ?? null } : null; }, [box.x + box.width / 2, box.y + box.height / 2]);
  const kick0 = await kickHits(p);
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  const held = await watch(p, 2600);                  // crosses step 8 (a bar at 92 BPM is 2.6 s)
  await p.mouse.move(box.x + box.width / 2 + 3, box.y + box.height / 2 + 1);   // the drift that made the old stroke
  await sleep(150);
  const kickHeld = await kickHits(p);
  await p.screenshot({ path: `${OUT}/p10fix-held-press.png` });
  await p.mouse.up();
  await sleep(600);   // the engine picks the edit up on its next pattern sync
  const kickAfter = await kickHits(p);
  const released = await watch(p, 5000);
  R.B_heldPress = {
    pressedAt: { page: before.page, playhead: before.head, cell: 'kick step 3 (data-step 2)' }, turnsWhileHeld: held.turns, pagesSeenWhileHeld: held.pages,
    kickHitsBefore: kick0, kickHitsWhileHeldAfterDrift: kickHeld, kickHitsAfterRelease: kickAfter,
    kickHitsChanged: kick0 === null || kickAfter === null ? null : kickAfter - kick0,
    firstTurnAfterReleaseMs: released.turns[0]?.ms ?? null, turnsAfterRelease: released.turns.length,
  };

  // C. an open NoteRow
  await p.locator('[data-qa="note-open"][data-row="bass"]').click();
  await p.waitForSelector('[data-qa="note-row"]', { timeout: 10000 });
  const open = await watch(p, 4000);
  await p.screenshot({ path: `${OUT}/p10fix-noterow-open.png` });
  await p.locator('[data-qa="note-close"]').click();
  const closed = await watch(p, 5000);
  R.C_noteRow = { turnsWhileOpen: open.turns, pagesSeenWhileOpen: open.pages, firstTurnAfterCloseMs: closed.turns[0]?.ms ?? null, turnsAfterClose: closed.turns.length };

  R.verdict = {
    controlFollows: R.A_control.turns.length >= 2,
    heldPressNeverTurned: held.turns.length === 0,
    noStrokeAcrossPages: R.B_heldPress.kickHitsChanged !== null && Math.abs(R.B_heldPress.kickHitsChanged) <= 1,
    releaseHoldsAbout2500ms: R.B_heldPress.firstTurnAfterReleaseMs !== null && R.B_heldPress.firstTurnAfterReleaseMs >= 2300,
    openNoteRowNeverTurned: open.turns.length === 0,
    followResumesAfterClose: closed.turns.length >= 1,
  };
  await ctx.close();
} catch (e) { R.fatal = String((e as Error)?.stack ?? e).slice(0, 1500); }
finally { await b.close(); }
writeJson(`${OUT}/gridhold-proof.json`, R);
console.log(JSON.stringify({ verdict: R.verdict, A: R.A_control?.turns?.length, B: R.B_heldPress, C: R.C_noteRow, fatal: R.fatal, errors: R.errors.slice(0, 3) }, null, 1));
