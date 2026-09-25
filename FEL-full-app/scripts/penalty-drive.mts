// Drive the penalty shootout like a person: aim, feint, strike — and play
// to a DECISION. The generic bot taps KICK on a cadence, which for this mode
// proves the meter works and nothing about the shootout: the rival's answers,
// the keeper's read, and sudden death all live past kick one.
//
//   URL=http://localhost:3001/dev/mode/penalty npx tsx scripts/penalty-drive.mts
//   SAME_SIDE=1 …  — aim the same corner every time (the keeper should start
//                    reading it: "HE'S READING THAT SIDE")
//
// Ends when the head line leaves "playing", or after ~4 minutes.

import { chromium } from 'playwright-core';

// NB: not named URL — that would shadow the global URL constructor.
const MODE_URL = process.env.URL ?? 'http://localhost:3000/dev/mode/penalty';
const SAME_SIDE = process.env.SAME_SIDE === '1';

const b = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
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
await p.waitForTimeout(3000);

const text = () => p.evaluate<string>('document.body.innerText');
/** The dev route's HUD dump is PRETTY-PRINTED JSON — "power": 40, not
 *  "power":40. A regex that assumes the compact form reads 0 forever and
 *  strikes blind (this driver scuffed a whole shootout short that way). */
const hud = async (): Promise<Record<string, unknown>> => {
  const t = await text();
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch { /* mid-write */ } }
  return {};
};
const found = { rivalAnswered: false, keeperRead: false, suddenDeath: false, decided: false, feint: false };

const deadline = Date.now() + 240_000;
let lastKick = '';
let kickNum = 0;
for (let g = 0; g < 4000 && Date.now() < deadline; g++) {
  const t = await text();
  const h = await hud();
  // key on round AND how many kicks THEY have taken: every sudden-death round reads 'SUDDEN DEATH', and keying on the
  // label alone means never taking kick TWO of the tiebreak. HOTFIX (2026-09-24): this used to key on h.score, which
  // was the '2–1' string at each kick's start and a number after it. The score is always the number now, and it does
  // not move on a level sudden-death round (both miss), so the driver would stall there. Their pips move once per
  // round. A kick only starts once the HUD has left the keeper round: nextKick replaces the 'THEIR KICK' hint, which
  // stays up through their kick's result beat because this driver never dives (a dive clears it). `dive` now clears
  // with their result, so it only marks the kick itself.
  const inKeeperRound = Boolean(h.dive) || /^THEIR KICK/.test(String(h.hint ?? ''));
  const kick = typeof h.round === 'string' && /KICK \d\/5|SUDDEN DEATH/.test(h.round) && !inKeeperRound
    ? `${h.round}|${String(h.kicksThem)}` : '';
  if (/HE'S READING THAT SIDE/.test(t)) found.keeperRead = true;
  if (/THEM: (BURIES IT|SAVED!)/.test(t)) found.rivalAnswered = true;
  if (/SUDDEN DEATH/.test(t)) found.suddenDeath = true;
  if (/FEINT/.test(t)) found.feint = true;
  if (/·\s*ended/.test(t.split('\n')[0]) || /SHOOTOUT_(WIN|LOSS)/.test(t)) { found.decided = true; break; }

  if (kick && kick !== lastKick) {
    lastKick = kick;
    kickNum++;
    // aim: same corner every time under SAME_SIDE (feeds the keeper's read),
    // otherwise alternate corners — the varied player is the control
    const side = SAME_SIDE ? 'a' : kickNum % 2 === 0 ? 'a' : 'd';
    await p.keyboard.down(side);
    await p.waitForTimeout(380);
    await p.keyboard.up(side);
    if (!SAME_SIDE) {
      // one feint: snap a→d fast during the aim
      await p.keyboard.down('a'); await p.waitForTimeout(90); await p.keyboard.up('a');
      await p.keyboard.down('d'); await p.waitForTimeout(90); await p.keyboard.up('d');
    }
    await p.keyboard.press('j');               // KICK — start the wave
    // strike ON the meter like a person
    for (let w = 0; w < 40; w++) {
      await p.waitForTimeout(60);
      const hw = await hud();
      // SOCCER UPGRADE (2026-09-18): the bar has ZONES now and 88 is where OVER begins — a person strikes in TOP BINS
      if (typeof hw.power === 'number' && hw.power >= 76) break;
    }
    await p.keyboard.press('j');               // KICK — strike
    await p.waitForTimeout(2600);              // the kick + their answer beat
  }
  await p.waitForTimeout(120);
}
// HOTFIX (2026-09-24): the scoreline comes from the HUD's own goals / themGoals. The HUD chip shows 'N PTS' now,
// so a run that had not ended read '?' from the page text. The end card's 'goals–themGoals' is the fallback.
const hEnd = await hud();
const scoreline = typeof hEnd.goals === 'number' && typeof hEnd.themGoals === 'number'
  ? `${hEnd.goals}–${hEnd.themGoals}`
  : /\d–\d/.exec(await text())?.[0] ?? '?';
console.log('final scoreline:', scoreline);
console.log('summary:', JSON.stringify(found));
const frame = logs.filter((l) => /FEL-FRAME/.test(l));
const miss = logs.filter((l) => /MISSING CLIP/.test(l));
const errs = logs.filter((l) => (l.startsWith('[error]') || l.startsWith('[pageerror]'))
  && !/401 \(Unauthorized\)/.test(l) && !/FEL-FRAME/.test(l));
console.log(`penalty-drive FEL-FRAME ${frame.length} | MISSING CLIP ${miss.length} | errors ${errs.length}`);
for (const l of [...new Set([...frame, ...miss, ...errs])].slice(0, 4)) console.log('   ·', l);
await b.close();
if (!found.decided || !found.rivalAnswered) process.exit(1);
