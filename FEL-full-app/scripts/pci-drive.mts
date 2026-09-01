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
const { ZONE_HALF } = mode;

/** Where pitch `round` crosses the plate — mirrors DerbyMode.pitch(). */
const pitchAt = (round: number) => ({
  x: Math.sin(round * 2.7) * 0.8 * ZONE_HALF.x,
  y: 1.05 + Math.cos(round * 1.9) * ZONE_HALF.y,
});
/** Pitch speed rises with the round, so the flight shortens. */
const flightSec = (round: number) => 17.5 / (14 + round * 0.5);

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

await p.goto('http://localhost:3000/dev/mode/derby', { waitUntil: 'networkidle' });
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

/** PCI starts centred; the Reticle moves 3.2 u/s in x, 2.6 u/s in y. */
let pci = { x: 0, y: 1.1 };
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
    const dx = want.x - pci.x, dy = want.y - pci.y;
    const holdX = Math.min(0.55, Math.abs(dx) / 3.2);
    const holdY = Math.min(0.55, Math.abs(dy) / 2.6);
    if (holdX > 0.02) {
      const k = dx > 0 ? 'd' : 'a';
      await p.keyboard.down(k); await p.waitForTimeout(holdX * 1000); await p.keyboard.up(k);
      pci.x += Math.sign(dx) * holdX * 3.2;
    }
    if (holdY > 0.02) {
      const k = dy > 0 ? 's' : 'w';
      await p.keyboard.down(k); await p.waitForTimeout(holdY * 1000); await p.keyboard.up(k);
      pci.y += Math.sign(dy) * holdY * 2.6;
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
