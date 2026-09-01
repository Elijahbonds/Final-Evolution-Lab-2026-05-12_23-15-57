// Net sports — a driver that can actually PLAY a timing mode.
//
// The generic capture bot taps the action key on a fixed cadence, which is not
// how a timing sport is played: contact is graded against the ball's arrival,
// so a fixed cadence connects by luck. It scored 0 in volleyball and that number
// said nothing about the mode -- the same ambiguity that sent me after
// snowboard's gates when the real fault was propulsion.
//
// This watches the mode's own shot meter (`shotMeterT`, 0..1 across the flight)
// and swings when it crosses the contact window, the way a player does.
//
//   URL=http://localhost:3000/dev/mode/volleyball npx tsx scripts/rally-drive.mts

import { chromium } from 'playwright-core';

const MODE_URL = process.env.URL ?? 'http://localhost:3000/dev/mode/volleyball';
// `shotMeterT` is NOT a 0..1 progress ramp in this mode -- NetSportMode sets it
// to 1 the moment the swing window arms (flightT > 0.55) and back to 0 on
// landing, so it is a boolean dressed as a meter. (The basketball hosts publish
// a real ramp and render a bar; the timing host renders nothing.) So the driver
// cannot swing "at 0.93 of the flight"; it waits a beat after the window opens.
// Contact is graded at flightT = 1, i.e. 45% of the flight after the arm.
// `shotMeterT` is now a genuine 0..1 ramp across the contact window (it used to
// be a boolean), so the driver can time a swing the way a player does: watch it
// climb and hit near 1.
const SWING_AT = Number(process.env.SWING_AT ?? 0.9);
const SECONDS = Number(process.env.SECONDS ?? 75);

const b = await chromium.launch({
  executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const logs: string[] = [];
p.on('console', (m) => { if (m.type() === 'error' || /FEL-FRAME|MISSING CLIP/.test(m.text())) logs.push(m.text().slice(0, 150)); });
p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message.slice(0, 150)}`));

await p.goto(MODE_URL, { waitUntil: 'networkidle' });
await p.waitForSelector('canvas', { timeout: 30_000 });
await p.waitForTimeout(2500);
const head = async () => (await p.evaluate<string>('document.body.innerText')).split('\n')[0];
if (/·\s*(ready|loading)/i.test(await head())) {
  await p.getByText(/^START$/).first().click({ force: true }).catch(() => {});
}
await p.evaluate('document.activeElement && document.activeElement.blur()');
await p.waitForTimeout(2000);

const hud = async (): Promise<Record<string, unknown>> => {
  const t = await p.evaluate<string>('document.body.innerText');
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch { /* mid-write */ } }
  return {};
};

const seen = new Set<string>();
let swings = 0, blocks = 0, armed = true;
/** Answer an incoming attack with the block instead of a dig. */
const BLOCK = process.env.BLOCK !== '0';
/** Keys to rotate through for the swing. A one-touch sport puts its whole shot
 *  vocabulary on the face buttons, so a driver that only presses A proves only
 *  that one shot works. */
const SHOTS = (process.env.SHOTS ?? 'j').split(',').map((k) => k.trim()).filter(Boolean);
const deadline = Date.now() + SECONDS * 1000;
while (Date.now() < deadline) {
  const h = await hud();
  const t = Number(h.shotMeterT ?? 0);
  // Rearm once the meter resets for the next flight, so one swing per contact.
  if (t < 0.15) armed = true;
  if (armed && t >= SWING_AT) {
    // Block an incoming attack, hit anything else — which is the read the mode
    // is asking the player to make.
    const attack = h.incoming === 'SPIKE';
    await p.keyboard.press(attack && BLOCK ? 'k' : SHOTS[swings % SHOTS.length]);
    if (attack && BLOCK) blocks++;
    swings++; armed = false;
  }
  if (typeof h.banner === 'string' && h.banner && !seen.has('B' + h.banner)) {
    seen.add('B' + h.banner);
    console.log(`  point: ${h.banner}  (${h.score}-${h.foeScore})`);
  }
  if (typeof h.shotType === 'string' && h.shotType) {
    const kind = h.shotType.split(' · ')[0];
    if (!seen.has(kind)) console.log(`  first ${kind} at score ${h.score}-${h.foeScore}, touch ${h.touch ?? '?'}`);
    seen.add(kind);
  }
  if (process.env.TRACE && swings > 0 && swings <= 6) {
    const k = `${swings}:${t.toFixed(2)}:${h.touch ?? '-'}:${h.banner ?? ''}`;
    if (!seen.has(k)) { seen.add(k); console.log('  trace', k); }
  }
  await p.waitForTimeout(25);
}

const h = await hud();
console.log(`rally-drive: ${h.score ?? '?'} – ${h.foeScore ?? '?'}   swings ${swings}   blocks ${blocks}   touches seen: ${[...seen].filter((k) => !k.startsWith('B')).sort().join(', ') || '(none)'}`);
const frame = logs.filter((l) => /FEL-FRAME/.test(l)).length;
const miss = logs.filter((l) => /MISSING CLIP/.test(l)).length;
console.log(`rally-drive: FEL-FRAME ${frame} | MISSING CLIP ${miss} | errors ${logs.length - frame - miss}`);
await b.close();
