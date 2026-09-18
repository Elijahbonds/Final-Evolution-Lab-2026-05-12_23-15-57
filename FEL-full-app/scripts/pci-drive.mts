// Baseball (Home Run Derby) — a driver that actually COVERS the pitch.
//
// The generic bot taps the swing key on a cadence, which for this mode proves
// only that timing works. The benchmark's locked justification is "contact-based
// bat mechanics with dynamic PCI", and the PCI is a POSITIONING skill: contact
// is timing x coverage. A driver that never moves the reticle reports weak
// contact whether the mechanic is good or broken — the same ambiguity that sent
// me after snowboard's gates when the fault was propulsion.
//
// It reads the pitch location from the mode's OWN formula rather than restating
// it, exactly as slalom-drive.mts reads the course, so the two cannot drift.
//
//   npx tsx scripts/pci-drive.mts            # cover the pitch
//   COVER=0 npx tsx scripts/pci-drive.mts    # swing without moving: the control

import { chromium } from 'playwright-core';

const mode = await import('../lib/babylon/modes/precisionModes');
const { pitchSpec } = mode;

/** Where pitch `round` crosses the plate — the mode's OWN pitchSpec,
 *  including the slider's late break (cover the ARRIVAL, not the aim), so
 *  driver and mode cannot drift. This used to mirror the location formula
 *  and miss the break entirely. */
const pitchAt = (round: number) => ({ x: pitchSpec(round).arrive.x, y: pitchSpec(round).arrive.y });
/** Pitch speed varies by type now (changeups take off ~22%), not just round. */
const flightSec = (round: number) => 17.5 / pitchSpec(round).speed;

const COVER = process.env.COVER !== '0';
/** Milliseconds shaved off the computed flight before swinging. Detecting the
 *  pitch costs a HUD poll, so the swing has to lead by roughly that much. */
const LEAD_MS = Number(process.env.LEAD_MS ?? 120);
const b = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const logs: string[] = [];
p.on('console', (m) => { if (m.type() === 'error' || /FEL-FRAME|MISSING CLIP/.test(m.text())) logs.push(m.text().slice(0, 150)); });
p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message.slice(0, 150)}`));

// NB: not named URL — that would shadow the global URL constructor (§7.8).
// And honour the URL env like every other driver: a hardcoded port once
// aimed this at ANOTHER worktree's dev server and measured their derby.
await p.goto(process.env.URL ?? 'http://localhost:3000/dev/mode/derby', { waitUntil: 'networkidle' });
await p.waitForSelector('canvas', { timeout: 30_000 });
await p.waitForTimeout(2500);
const head = async () => (await p.evaluate<string>('document.body.innerText')).split('\n')[0];
if (/·\s*(ready|loading)/i.test(await head())) await p.getByText(/^START$/).first().click({ force: true }).catch(() => {});
await p.evaluate('document.activeElement && document.activeElement.blur()');
await p.waitForTimeout(2000);

const hud = async (): Promise<Record<string, unknown>> => {
  const t = await p.evaluate<string>('document.body.innerText');
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch { /* mid-write */ } }
  return {};
};

/** PCI starts centred; the Reticle moves 3.2 u/s in x, 2.6 u/s in y.
 *  The position comes from the HUD's own `pci` field each poll — the driver
 *  used to integrate its own model, and the drift accumulated enough that
 *  the covering bot once lost to the blind control. Close the loop. */
const contacts: string[] = [];
let seenRound = 0;

const deadline = Date.now() + 70_000;
for (let guard = 0; guard < 4000 && Date.now() < deadline; guard++) {
  const h = await hud();
  const round = Number(String(h.round ?? '0/10').split('/')[0]);
  if (round > 10) break;
  if (round === seenRound) { await p.waitForTimeout(20); continue; }
  seenRound = round;

  const want = pitchAt(round);
  const flight = flightSec(round);
  if (COVER) {
    // Walk the PCI onto the pitch, then hold. Hold times come from the
    // reticle's own speeds so this stays honest about what a player can do.
    const pciNow = typeof h.pci === 'string' ? (h.pci as string).split(',').map(Number) : [0, 1.1];
    const dx = want.x - pciNow[0], dy = want.y - pciNow[1];
    const holdX = Math.min(0.55, Math.abs(dx) / 3.2);
    const holdY = Math.min(0.55, Math.abs(dy) / 2.6);
    if (holdX > 0.02) {
      const k = dx > 0 ? 'd' : 'a';
      await p.keyboard.down(k); await p.waitForTimeout(holdX * 1000); await p.keyboard.up(k);
    }
    if (holdY > 0.02) {
      const k = dy > 0 ? 's' : 'w';
      await p.keyboard.down(k); await p.waitForTimeout(holdY * 1000); await p.keyboard.up(k);
    }
    // re-read after the walk: the reticle's own position, not our estimate
    const walked = await hud();
    const walkedPci = typeof walked.pci === 'string' ? (walked.pci as string).split(',').map(Number) : [0, 1.1];
    const residual = Math.hypot(want.x - walkedPci[0], want.y - walkedPci[1]);
    // one correction step if the capped holds under-walked (reticle caps exist)
    if (residual > 0.12) {
      const dx2 = want.x - walkedPci[0], dy2 = want.y - walkedPci[1];
      const hx = Math.min(0.3, Math.abs(dx2) / 3.2), hy = Math.min(0.3, Math.abs(dy2) / 2.6);
      if (hx > 0.02) { const k = dx2 > 0 ? 'd' : 'a'; await p.keyboard.down(k); await p.waitForTimeout(hx * 1000); await p.keyboard.up(k); }
      if (hy > 0.02) { const k = dy2 > 0 ? 's' : 'w'; await p.keyboard.down(k); await p.waitForTimeout(hy * 1000); await p.keyboard.up(k); }
    }
    await p.waitForTimeout(Math.max(0, flight * 1000 - holdX * 1000 - holdY * 1000 - LEAD_MS));
  } else {
    await p.waitForTimeout(Math.max(0, flight * 1000 - LEAD_MS));
  }
  await p.keyboard.press('j');                     // A — SWING
  await p.waitForTimeout(260);
  const after = await hud();
  if (typeof after.contact === 'string' && after.contact) contacts.push(after.contact);
  else if (typeof after.banner === 'string' && after.banner) contacts.push(after.banner.slice(0, 12));
}

const h = await hud();
const tally = contacts.reduce<Record<string, number>>((a, c) => { a[c] = (a[c] ?? 0) + 1; return a; }, {});
console.log(`pci-drive [${COVER ? 'COVERING' : 'NOT covering'}]: score ${h.score ?? '?'}  contact ${JSON.stringify(tally)}`);
const frame = logs.filter((l) => /FEL-FRAME/.test(l)).length;
console.log(`pci-drive: FEL-FRAME ${frame} | errors ${logs.length - frame}`);
await b.close();
