// TRY-ONBOARD-DUNK-APLUS probe (2026-09-09) — G1 / G3 / G7 on the LIVE guest path.
//
// Drives /try on the keyboard (space = hold-run then launch+slam, j = A) through a whole
// FLIGHT NIGHT, and measures what happens at the card:
//   G1  the card is a GO AGAIN beat, not a CONTEST OVER wall — and pressing it puts the
//       guest back on the runway with the board back at 0
//   G3  the claim offer sits INSIDE the card under GO AGAIN, and GO AGAIN still works with
//       it on screen (it is a sibling, never a wall in front)
//   G7  no remount: the SAME <canvas>, the SAME WebGL context and the SAME Babylon engine
//       carry across the card, and the boot splash never runs a second time
//
//   PORT=3041 npx tsx scripts/probes/_try-onboard-goagain-probe.mts
//   OUT_DIR= · NIGHTS= (default 2) · HEADFUL=1
import { chromium, type Page } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const PORT = process.env.PORT ?? '3041';
const OUT = process.env.OUT_DIR ?? 'docs/shots/try-onboard';
const NIGHTS = Number(process.env.NIGHTS ?? 2);
mkdirSync(OUT, { recursive: true });

const log: string[] = [];
const say = (m: string) => { console.log(m); log.push(m); };

/** Stamp identity on the live canvas + engine so a remount is impossible to miss. */
const STAMP = `(() => {
  const c = document.querySelector('canvas');
  if (!c) return null;
  const w = window;
  if (!c.__probeId) { w.__probeSeq = (w.__probeSeq || 0) + 1; c.__probeId = w.__probeSeq; }
  return { canvasId: c.__probeId, seq: w.__probeSeq };
})()`;

async function stamp(p: Page) {
  return p.evaluate(STAMP) as Promise<{ canvasId: number; seq: number } | null>;
}
const text = (p: Page) => p.evaluate(() => document.body.innerText);

async function hold(p: Page, key: string, ms: number) {
  await p.keyboard.down(key);
  await p.waitForTimeout(ms);
  await p.keyboard.up(key);
}

const cardUp = async (p: Page) => /TOOK THE CARD/.test(await text(p));

/** One attempt: run at the rim, launch, try to flush — ABORTED the moment the card
 *  comes up, because on a continuous night every button on the card is GO AGAIN and a
 *  probe that keeps mashing dismisses the very thing it came to measure. */
async function attempt(p: Page): Promise<boolean> {
  if (await cardUp(p)) return true;
  await p.keyboard.down(' ');                                   // HOLD = RUN
  await p.waitForTimeout(1500);
  await p.keyboard.up(' ');                                     // release launches AND presses A (the slam)
  for (let i = 0; i < 22; i++) {
    if (await cardUp(p)) return true;
    await p.keyboard.press('j');                                // A through the flush window
    await p.waitForTimeout(55);
  }
  for (let i = 0; i < 10; i++) {                                // the verdict + the rival, hands off
    await p.waitForTimeout(400);
    if (await cardUp(p)) return true;
  }
  return false;
}

async function main() {
  const b = await chromium.launch({
    headless: !process.env.HEADFUL,
    executablePath: chromiumExe(),
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--js-flags=--max-old-space-size=4096'],
  });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const p = await ctx.newPage();
  const errors: string[] = []; const frames: string[] = []; const clips: string[] = [];
  p.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/status of 401|status of 404|favicon|Download the React/.test(t)) errors.push(t.slice(0, 200));
    if (/FEL-FRAME/.test(t)) frames.push(t.slice(0, 160));
    if (/MISSING CLIP/.test(t)) clips.push(t.slice(0, 160));
  });
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
  p.on('crash', () => say('*** PAGE CRASHED ***'));
  p.on('close', () => say('*** PAGE CLOSED ***'));

  // ── entry: the cold guest, counting clicks to a playable dunk ──
  const t0 = Date.now();
  await p.goto(`http://localhost:${PORT}/try`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('canvas', { timeout: 120000 });
  await p.waitForFunction(() => /TAP TO START|READY|PRESS/i.test(document.body.innerText), null, { timeout: 240000 })
    .catch(() => say('  (no READY text — continuing)'));
  await p.screenshot({ path: `${OUT}/00-ready.png` });
  const first = await stamp(p);
  say(`ENTRY  canvas #${first?.canvasId} in ${((Date.now() - t0) / 1000).toFixed(1)}s — 1 CTA (the READY gate) from a cold load`);

  await p.mouse.click(640, 500);      // the READY gate: one click
  await p.waitForFunction(() => !/3\s*$|TAP TO START/i.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(4200);       // the 3-2-1
  await p.screenshot({ path: `${OUT}/01-playing.png` });

  let sawContestOverWall = false;
  let bootSplashRuns = 1;
  const nightRows: string[] = [];

  for (let night = 1; night <= NIGHTS; night++) {
    // play until the card is up (or we run out of patience)
    let card = false;
    for (let a = 0; a < 14 && !card; a++) {
      card = await attempt(p);
      const t = await text(p);
      const hud = t.split('\n').filter((l) => /RD |DUNK |vs/.test(l)).slice(0, 3).join(' / ');
      if (process.env.VERBOSE) say(`  n${night} a${a}: ${hud}${card ? '  <- CARD' : ''}`);
      if (/CONTEST OVER|CONTEST WON/.test(t) && !/TOOK THE CARD/.test(t)) sawContestOverWall = true;
      if (/TAP TO START|LOADING/i.test(t)) bootSplashRuns++;
    }
    if (!card) { say(`NIGHT ${night}  FAIL — no card after 26 attempts`); break; }

    const onCard = await stamp(p);
    const t = await text(p);
    const claim = /CLAIM YOUR ATHLETE/.test(t);
    const goAgainBtn = await p.locator('button', { hasText: 'GO AGAIN' }).count();
    await p.screenshot({ path: `${OUT}/0${night + 1}-night${night}-card.png` });
    say(`NIGHT ${night}  card up — canvas #${onCard?.canvasId} (mounts so far ${onCard?.seq}) · GO AGAIN button ${goAgainBtn} · claim in card ${claim}`);
    nightRows.push(t.split('\n').filter((l) => /Night|TOOK THE CARD|YOU \d|dunked/.test(l)).join(' | '));

    if (night === NIGHTS) break;

    // ── G1/G3/G7: press GO AGAIN with the claim on screen ──
    const before = { seq: onCard?.seq, canvas: onCard?.canvasId };
    await p.keyboard.press('j');                                   // a press "already in flight"
    await p.waitForTimeout(150);
    say(`  settle: card still up after an instant press ${await cardUp(p)}`);
    await p.waitForTimeout(900);
    await p.locator('button', { hasText: 'GO AGAIN' }).first().click();
    await p.waitForTimeout(1800);
    const after = await stamp(p);
    const t2 = await text(p);
    const backOnCourt = !/TOOK THE CARD/.test(t2);
    const boardZero = /\b0\s*vs\s*0\b/.test(t2.replace(/\s+/g, ' ')) || /NIGHT 2/.test(t2);
    await p.screenshot({ path: `${OUT}/0${night + 1}b-after-goagain.png` });
    say(`GO AGAIN  canvas #${after?.canvasId} (was #${before.canvas}) · total mounts ${after?.seq} (was ${before.seq}) · back on the court ${backOnCourt} · night 2 board ${boardZero}`);
    if (after?.seq !== before.seq) say('  *** G7 FAIL — the stage was remounted ***');
    if (after?.canvasId !== before.canvas) say('  *** G7 FAIL — a new canvas ***');
  }

  // ── the card's OTHER exits: any button (G1), and QUIT (G7 — the only thing that leaves) ──
  if (await cardUp(p)) {
    const b4 = await stamp(p);
    await p.waitForTimeout(1000);                      // past the card's settle
    await p.keyboard.press('j');                       // "or press any button"
    await p.waitForTimeout(1500);
    const af = await stamp(p);
    say(`ANY BUTTON  back on the court ${!(await cardUp(p))} · mounts ${af?.seq} (was ${b4?.seq})`);
  }
  await Promise.all([
    p.waitForURL((u) => new URL(u).pathname !== '/try', { timeout: 90000 }).catch(() => {}),
    p.locator('a', { hasText: 'QUIT' }).first().click(),
  ]);
  say(`QUIT  now at ${new URL(p.url()).pathname}`);

  say('');
  say(`G1  CONTEST OVER / WON wall seen: ${sawContestOverWall ? 'YES — FAIL' : 'no'}`);
  say(`G7  boot splash runs: ${bootSplashRuns} (1 = the cold load only)`);
  say(`console errors ${errors.length} · FEL-FRAME ${frames.length} · MISSING CLIP ${clips.length}`);
  errors.slice(0, 8).forEach((e) => say(`  ERR ${e}`));
  frames.slice(0, 4).forEach((e) => say(`  FRAME ${e}`));
  clips.slice(0, 4).forEach((e) => say(`  CLIP ${e}`));
  nightRows.forEach((r, i) => say(`  card ${i + 1}: ${r}`));

  writeFileSync(`${OUT}/probe.txt`, log.join('\n'));
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
