// Drive the 3PT contest layer end-to-end: the reveal must be STAGED, the
// finalists must post BEFORE the player's final run, and THE NEED must be
// live during that run. A blind capture can't see any of it — the standings
// phase used to render no board on the shipping host at all.
//
//   URL=http://localhost:3001/dev/mode/threepoint npx tsx scripts/threepoint-depth-drive.mts
//
// Runs a real contest: ~60s qualifying + staged results + finalist reveal +
// ~60s final + final board. Unattended, ~3 minutes.

import { chromium } from 'playwright-core';
import { chromiumExe } from './probes/_chromium.mts';

// NB: not named URL — that would shadow the global URL constructor.
const MODE_URL = process.env.URL ?? 'http://localhost:3000/dev/mode/threepoint';

const b = await chromium.launch({
  executablePath: chromiumExe(),
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const logs: string[] = [];
p.on('console', (m) => { if (m.type() === 'error' || /FEL-FRAME|MISSING CLIP/.test(m.text())) logs.push(`[${m.type()}] ${m.text().slice(0, 170)}`); });
p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message.slice(0, 170)}`));

await p.goto(MODE_URL, { waitUntil: 'networkidle' });
if (/\/login/.test(p.url())) {
  await p.locator('input[type="email"]').fill(process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local');
  await p.locator('input[type="password"]').fill(process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only');
  await p.locator('input[type="password"]').press('Enter');
  await p.waitForURL((u) => !/\/login/.test(u.toString()), { timeout: 30_000 }).catch(() => {});
  await p.goto(MODE_URL, { waitUntil: 'networkidle' });
}
console.log('route :', new URL(p.url()).pathname);
await p.waitForSelector('canvas', { timeout: 30_000 });
await p.waitForTimeout(2500);
const bodyNow = await p.evaluate<string>('document.body.innerText');
if (/TAP TO START/i.test(bodyNow)) {
  await p.getByText(/TAP TO START/i).first().click({ force: true }).catch(() => {});
} else if (/·\s*(ready|loading)/i.test(bodyNow.split('\n')[0])) {
  await p.getByText(/^START$/).first().click({ force: true }).catch(() => {});
}
await p.evaluate('document.activeElement && document.activeElement.blur()');
await p.waitForTimeout(4000);                        // countdown

/** The dev route dumps the HUD as JSON in the page text. */
const hud = async (): Promise<Record<string, unknown>> => {
  const t = await p.evaluate<string>('document.body.innerText');
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch { /* swing */ } }
  return {};
};

const found = { stagedReveal: false, fieldPostsFirst: false, needLive: false, contestEnds: false };

// A bot that shoots blind scores 0 and is eliminated — the first version of
// this driver "proved" the final didn't exist. The mode EXPOSES the sweeping
// bar (hud.meter); shoot on it like a person reads it.
/** Play a full round on the meter. Returns the posted score when the
 *  standings board appears. A contest shooter is measured by the clock —
 *  25 balls in 60s leaves ~2.4s a ball, so this shoots a tight green
 *  window (mostly perfects) and never idles after a release. */
async function playRound(): Promise<number> {
  let score = 0;
  for (let t = 0; t < 1400; t++) {             // up to ~90s of fast polls
    const h = await hud();
    if (Array.isArray(h.board)) break;         // round over — standings phase
    if (typeof h.score === 'number') score = h.score;
    if (typeof h.meter === 'number' && h.meter >= 0.71 && h.meter <= 0.73) {
      await p.keyboard.press('j');             // release dead on the sweet spot
    }
    await p.waitForTimeout(60);
  }
  return score;
}

// ── qualifying: play it on the meter, then watch the reveal walk ───────────
console.log('qualifying: playing the round on the meter');
const qualScore = await playRound();
console.log(`  qualifying score: ${qualScore}`);
let sawDashCard = false;
for (let t = 0; t < 60; t++) {
  await p.waitForTimeout(500);
  const h = await hud();
  if (Array.isArray(h.board)) {
    const cards = h.board as { name: string; score: number | string; line: string }[];
    if (cards.some((c) => c.score === '—')) sawDashCard = true;
    const unposted = cards.filter((c) => c.score === '—').length;
    if (unposted > 0) console.log(`  reveal walking… ${unposted} cards still dark`);
    if (sawDashCard && unposted === 0) { found.stagedReveal = true; }
  } else if (sawDashCard || found.stagedReveal) {
    break;                                     // board gone — next phase began
  }
  if (!Array.isArray(h.board) && !sawDashCard && t > 20) break; // eliminated or moved on
}
console.log('staged reveal (cards landed one at a time):', found.stagedReveal ? 'yes' : 'NO');

// ── the finalists post first, then the player runs at a number ─────────────
// (If qualifying eliminated us, the contest is over — a meter-driven run
// should advance, but elimination is a REAL result, not a driver failure.)
for (let t = 0; t < 40; t++) {
  await p.waitForTimeout(500);
  const h = await hud();
  if (h.round === 'FINAL' && typeof h.need === 'number') {
    found.needLive = true; found.fieldPostsFirst = true;
    console.log(`  THE NEED: ${h.need} to win, live during the final run`);
    break;
  }
  if (h.round === 'FINAL' && Array.isArray(h.board)) found.fieldPostsFirst = true;
}
console.log('finalists post before the final run:', found.fieldPostsFirst ? 'yes' : 'NO (or we were eliminated)',
  '| NEED live during the run:', found.needLive ? 'yes' : 'NO');

// ── play the final out ─────────────────────────────────────────────────────
if (found.needLive) {
  await playRound();
  for (let t = 0; t < 30; t++) {
    await p.waitForTimeout(500);
    const h = await hud();
    if (Array.isArray(h.board) && (h.board as { line: string }[]).some((c) => c.line === 'CHAMPION')) {
      found.contestEnds = true;
      break;
    }
  }
}
console.log('contest completes with a champion:', found.contestEnds ? 'yes' : found.needLive ? 'NO' : 'n/a — eliminated in qualifying (a real result)');

const frame = logs.filter((l) => /FEL-FRAME/.test(l));
const miss = logs.filter((l) => /MISSING CLIP/.test(l));
const errs = logs.filter((l) => (l.startsWith('[error]') || l.startsWith('[pageerror]'))
  && !/401 \(Unauthorized\)/.test(l) && !/FEL-FRAME/.test(l));
console.log(`3pt-depth-drive FEL-FRAME ${frame.length} | MISSING CLIP ${miss.length} | errors ${errs.length}`);
for (const l of [...new Set([...frame, ...miss, ...errs])].slice(0, 4)) console.log('   ·', l);
console.log('summary:', JSON.stringify(found));
await b.close();
if (!found.contestEnds) process.exit(1);
