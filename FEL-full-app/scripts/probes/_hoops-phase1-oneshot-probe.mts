// HOOPS-10PHASE-2 phase 1 probe: ONE PRESS = ONE SHOT = ONE ARM-RAISE, measured on the live rig.
//
// The bug read as two shots from one press. The event was single (S.fired); the double was the jumper replaying its
// own dip under the held set (two arm-raises), and nothing latched the press edge. This probe fires ONE pad tap and
// then measures, for ~3.5 s at 40 ms:
//   · the playing-clip sequence (the gather must not re-enter after the press; the jumper appears in ONE run;
//     the follow-through once; the absorb once);
//   · the right hand's chest-frame height — one press is ONE rise to the release, not dip-rise-dip-rise;
//   · the [3PT-SHOT] one-press log (exactly one) and the [3PT-RIM] ring verdict (exactly one);
//   · screenshots of the set, the rise and the follow-through → ~/Claude/_observe/hoops-phase1-*.png
//
//   PORT=3123 npx tsx scripts/probes/_hoops-phase1-oneshot-probe.mts
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const PORT = process.env.PORT ?? '3123';
const OUT = process.env.OUT ?? `${process.env.HOME}/Claude/_observe`;
const PAD_INIT = `(() => { const pad = { index: 0, id: 'fake-dualshock (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) }; window.__PAD = pad; navigator.getGamepads = () => [pad]; })()`;

const b = await chromium.launch({ headless: true, executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
await ctx.addInitScript(PAD_INIT);
const p = await ctx.newPage();
const shotLogs: string[] = [], rimLogs: string[] = [], errLogs: string[] = [];
p.on('console', (m) => {
  const t = m.text();
  if (/^\[3PT-SHOT\]/.test(t)) shotLogs.push(t);
  if (/^\[3PT-RIM\] ring/.test(t)) rimLogs.push(t);
  if (m.type() === 'error' && !/401 \(Unauthorized\)/.test(t)) errLogs.push(t.slice(0, 160));
});
p.on('pageerror', (e) => errLogs.push(`[pageerror] ${e.message.slice(0, 160)}`));

await p.goto(`http://127.0.0.1:${PORT}/dev/mode/threepoint`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await p.waitForSelector('canvas', { timeout: 180000 });
await p.waitForFunction(() => document.body.innerText.includes('· ready'), null, { timeout: 240000 });

const pad = (i: number, down: boolean) => p.evaluate(`(() => { const p = window.__PAD; p.buttons[${i}].pressed = ${down}; p.buttons[${i}].value = ${down ? 1 : 0}; p.timestamp = performance.now(); })()`);
const tap = async (i: number, ms = 90) => { await pad(i, true); await p.waitForTimeout(ms); await pad(i, false); };

await tap(0);   // START
await p.waitForFunction(() => document.body.innerText.includes('· playing'), null, { timeout: 30000 });

const sample = () => p.evaluate(`(() => {
  let hud = {}; try { hud = JSON.parse(document.querySelector('pre').textContent || '{}'); } catch {}
  const scene = window.__FEL_DEV__.scene;
  const clips = scene.animationGroups.filter((g) => g.isPlaying).map((g) => g.name + '@' + (g.animatables[0] && g.animatables[0].weight !== undefined ? g.animatables[0].weight.toFixed(2) : '1'));
  let handUp = null;
  const a = typeof window.__FEL_DEV__.anim === 'function' ? window.__FEL_DEV__.anim() : null;
  if (a && a.hero && a.hero.hands && a.hero.hands.right) handUp = a.hero.hands.right.up;
  return { meter: hud.meter ?? null, clips, handUp }; })()`) as Promise<{ meter: number | null; clips: string[]; handUp: number | null }>;

// wait for the set: the meter live, the gather held
let s = await sample();
for (let i = 0; i < 100 && s.meter === null; i++) { await p.waitForTimeout(150); s = await sample(); }
if (s.meter === null) { console.log('FAIL: the meter never went live'); await b.close(); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
await p.waitForTimeout(600);   // let the gather's fade finish and any load hitches drain — a stalled frame right before
                               // the press expires the release timer in one step and the rise never shows (measured)
console.log('set   :', s.clips.join(' '), '| right hand up', s.handUp);

// ONE press
const t0 = Date.now();
await tap(0);
type Sample = { ms: number; clips: string[]; handUp: number | null };
const series: Sample[] = [];
while (Date.now() - t0 < 3500) {
  const cur = await sample();
  series.push({ ms: Date.now() - t0, clips: cur.clips, handUp: cur.handUp });
  await p.waitForTimeout(30);
}
for (const x of series) console.log(`  t+${String(x.ms).padStart(4)} ms  up=${x.handUp === null ? '  —  ' : x.handUp.toFixed(2)}  ${x.clips.join(' ')}`);

const firesAfterTap = shotLogs.filter((l) => l.includes('one press')).length;
const rimsAfterTap = rimLogs.length;

// second ball, purely for the photographs (the probe's measurement is the series above)
let s2 = await sample();
for (let i = 0; i < 100 && s2.meter === null; i++) { await p.waitForTimeout(150); s2 = await sample(); }
if (s2.meter !== null) {
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${OUT}/hoops-phase1-set.png` });
  await tap(0);
  await p.waitForTimeout(250); await p.screenshot({ path: `${OUT}/hoops-phase1-rise.png` });
  await p.waitForTimeout(650); await p.screenshot({ path: `${OUT}/hoops-phase1-follow.png` });
}
await b.close();

// ── analysis ───────────────────────────────────────────────────────────────
// the shooter's family only (the sideline bodies idle through all of this on their own clips)
const FAMILY = /pullup_gather|jumpshot|follow_through|land_absorb|bball_idle_stand/;
// dominant clip per sample (heaviest), consecutive duplicates collapsed
const dominant = series.map((x) => {
  const top = x.clips.filter((c) => FAMILY.test(c)).map((c) => ({ clip: c.split('@')[0], w: Number(c.split('@')[1]) })).sort((a, z) => z.w - a.w)[0];
  return top?.clip ?? '(none)';
});
const seq = dominant.filter((c, i) => i === 0 || c !== dominant[i - 1]);
console.log('clip sequence:', seq.join(' → '));

const runs = (re: RegExp) => seq.filter((c) => re.test(c)).length;

// right-hand rises WITHIN THIS SHOT (the window ends where the next ball's gather begins — its rise to the chest is the
// next shot's, not this one's). A double pump reads as the hand climbing to RELEASE height twice: count crossings of the
// 70% band from below the 50% band. The absorb's settle bounce never reaches the band.
const gatherAt = series.findIndex((x) => x.clips.some((c) => /pullup_gather@0\.[5-9]|pullup_gather@1\.0/.test(c)));
const shotSamples = gatherAt > 0 ? series.slice(0, gatherAt) : series;
const ups = shotSamples.map((x) => x.handUp).filter((v): v is number => v !== null);
const upMin = Math.min(...ups), upMax = Math.max(...ups);
const lo = upMin + 0.5 * (upMax - upMin), hi = upMin + 0.7 * (upMax - upMin);
let rises = 0, below = true;
for (const u of ups) { if (below && u > hi) { rises++; below = false; } else if (u < lo) below = true; }
const amplitudeKnown = upMax - upMin >= 0.15;   // a flat read (hands never solved) is not a verdict
console.log(`hand height: min ${upMin.toFixed(2)} → max ${upMax.toFixed(2)} · rises to the release band ${rises}`);
console.log(`[3PT-SHOT] one-press lines from the measured tap ${firesAfterTap} · [3PT-RIM] ring verdicts ${rimsAfterTap} · errors ${errLogs.length}`);
for (const l of [...shotLogs, ...rimLogs, ...errLogs].slice(0, 6)) console.log('  ·', l.slice(0, 150));
console.log(`screenshots: ${OUT}/hoops-phase1-set.png ${OUT}/hoops-phase1-rise.png ${OUT}/hoops-phase1-follow.png`);

const fails: string[] = [];
if (firesAfterTap !== 1) fails.push(`one press logged ${firesAfterTap} shots`);
if (rimsAfterTap !== 1) fails.push(`one press produced ${rimsAfterTap} rim verdicts`);
if (runs(/jumpshot/) !== 1) fails.push(`the jumper plays in ${runs(/jumpshot/)} runs, not one`);
// the gather must not re-enter between the press and the follow-through (that re-entry WAS the second arm-raise);
// the NEXT ball's set, after the absorb, is a new shot's gather and is legitimate
const followIdx = seq.findIndex((c) => /follow_through/.test(c));
if (seq.slice(0, followIdx < 0 ? seq.length : followIdx).some((c) => /pullup_gather/.test(c) && seq.indexOf(c) > 0)
    && seq.findIndex((c) => /jumpshot/.test(c)) > 0) {
  const shotAt = seq.findIndex((c) => /jumpshot/.test(c));
  if (seq.slice(0, shotAt).filter((c) => /pullup_gather/.test(c)).length > 1) fails.push('the gather re-entered between the press and the rise (the load replayed)');
}
if (runs(/follow_through/) > 1) fails.push('the follow-through played more than once');
if (amplitudeKnown && rises !== 1) fails.push(`the shooting hand reached the release band ${rises} times on one press (a double pump reads as two shots)`);
if (fails.length) { console.log('PHASE1 PROBE FAIL:'); for (const f of fails) console.log('  ✗', f); process.exit(1); }
console.log('PHASE1 PROBE GREEN — one press = one shot = one rise = one release');
