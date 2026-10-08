// DUNK-VENICE-ENV-2 (2026-09-28) — the Venice dunk as it is PLAYED, framed by the game's own cameras.
//
// The fixed-pose probe (_dunk-venice-env.mts) places cameras from the game's numbers; this one plays the contest on
// /dev/mode/dunk (no auth, no DB) and lets the mode cut its own shots: the rim cut ("slam cam") on a flush, the triple-cut
// replay ("UNDER THE RIM" / "ON THE IRON" / "FROM THE STANDS"), and the rival's turn after it (the eye's D2 landing frame,
// VE-3). The run is driven on the input bus the dev handle exposes — RT held to run, A on the NOW! beat — with the press
// scheduled IN-PAGE (a node round trip lands it a frame or three late and the flush becomes a clank).
//
// Env: BASE (default http://localhost:3100), OUT (dir), TAG (file prefix), SECS (max run, default 150),
// PRE (a page-side script run once the scene is up, `s` = the scene — a look-dev hook, as in _dunk-venice-env.mts).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://localhost:3100';
const OUT = process.env.OUT ?? `${process.env.HOME}/Claude/outbox/DUNK-VENICE-ENV-2-shots`;
const TAG = process.env.TAG ?? 'play';
const SECS = Number(process.env.SECS ?? 150);
fs.mkdirSync(OUT, { recursive: true });
setTimeout(() => { console.log('PLAY timed out'); process.exit(2); }, (SECS + 240) * 1000);

const b = await chromium.launch({
  executablePath: chromiumExe(),
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const log: string[] = [];
let errors = 0;
p.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error') errors++;
  if (/DUNK-CAM|REPLAY|RIVAL|DUNK-SLAM|FEL-VENICE/.test(t)) log.push(`${Date.now()} ${t.slice(0, 160)}`);
});
p.on('pageerror', () => { errors++; });

await p.goto(`${BASE}/dev/mode/dunk`, { waitUntil: 'domcontentloaded', timeout: 240000 });
await p.waitForFunction('!!(window.__FEL_DEV__ && window.__FEL_DEV__.scene && window.__FEL_DEV__.input)', undefined, { timeout: 240000 });
await p.waitForFunction('/playing|countdown|HOLD to run/.test(document.body.innerText)', undefined, { timeout: 240000 }).catch(() => {});
await p.waitForTimeout(6000);
// clean frames: every overlay hidden (the dev HUD's JSON panel covers a third of the frame). Hidden text still reads through
// textContent, which is what the driver and the shot triggers watch — the HUD's own fields ("slamBeat", "cut", "banner").
if (process.env.HUD !== '1') await p.evaluate(`(() => { const c = document.querySelector('canvas'); for (const el of document.body.querySelectorAll('*')) { if (el !== c && !el.contains(c)) el.style.visibility = 'hidden'; } })()`);
if (process.env.PRE) console.log('PRE →', JSON.stringify(await p.evaluate(`(async () => { const s = window.__FEL_DEV__.scene; ${fs.readFileSync(process.env.PRE, 'utf8')} })()`)));

// the driver, in the page: hold RT on "HOLD to run", A on "NOW!", let go once the attempt resolves
await p.evaluate(`(() => {
  const bus = window.__FEL_DEV__.input; const st = { running: false, slammed: false, t: 0 };
  window.__DRV = st;
  const press = (btn) => { bus.emit({ t: 'button', btn, pressed: true }); setTimeout(() => bus.emit({ t: 'button', btn, pressed: false }), 70); };
  const tick = () => {
    const txt = document.body.textContent;
    if (!st.running && /HOLD to run/.test(txt)) { st.running = true; st.slammed = false; st.t = performance.now(); bus.emit({ t: 'trigger', side: 'R', value: 1 }); bus.emit({ t: 'stick', side: 'L', x: 0, y: -1 }); }
    if (st.running && !st.slammed && /"slamBeat": ?"beat"/.test(txt)) { st.slammed = true; press('A'); setTimeout(() => { bus.emit({ t: 'trigger', side: 'R', value: 0 }); bus.emit({ t: 'stick', side: 'L', x: 0, y: 0 }); }, 900); }
    if (st.running && performance.now() - st.t > 9000) { st.running = false; bus.emit({ t: 'trigger', side: 'R', value: 0 }); bus.emit({ t: 'stick', side: 'L', x: 0, y: 0 }); }
    if (st.slammed && !/"slamBeat": ?"(beat|open|cue)"/.test(txt) && performance.now() - st.t > 4000) st.running = false;
    requestAnimationFrame(tick);
  };
  tick();
})()`);

// the shots: the mode's own cuts, recognised by its log line (rim cut) and its lower thirds (replays, rival's turn)
const want: Array<{ key: string; test: RegExp; from: 'log' | 'text'; delayMs: number; max: number }> = [
  { key: 'slamcam', test: /\[DUNK-CAM\] rim cut/, from: 'log', delayMs: 380, max: 2 },
  { key: 'rep-under-the-rim', test: /UNDER THE RIM/, from: 'text', delayMs: 260, max: 2 },
  { key: 'rep-on-the-iron', test: /ON THE IRON/, from: 'text', delayMs: 260, max: 2 },
  { key: 'rep-from-the-stands', test: /FROM THE STANDS/, from: 'text', delayMs: 260, max: 2 },
  { key: 'rival-turn', test: /\[DUNK-RIVAL\] \S+ goes for/, from: 'log', delayMs: 150, max: 4 },
];
// LANDING=1: the landing after every rim cut, three beats (the eye's D2 frame — VE-3 — is the rival's landing camera)
if (process.env.LANDING === '1') { want.length = 0; want.push({ key: 'landing', test: /\[DUNK-CAM\] rim cut/, from: 'log', delayMs: 1300, max: 8 }); }
const taken: Record<string, number> = {};
const seenLog = new Set<string>();
const t0 = Date.now();
while (Date.now() - t0 < SECS * 1000) {
  const txt = await p.evaluate('document.body.textContent').catch(() => '') as string;
  for (const w of want) {
    if ((taken[w.key] ?? 0) >= w.max) continue;
    let hit = false;
    if (w.from === 'text') hit = w.test.test(txt);
    else for (const l of log) if (w.test.test(l) && !seenLog.has(l)) { seenLog.add(l); hit = true; }
    if (!hit) continue;
    await p.waitForTimeout(w.delayMs);
    const n = (taken[w.key] = (taken[w.key] ?? 0) + 1);
    await p.screenshot({ path: `${OUT}/DUNK-VENICE-ENV-2-${TAG}-${w.key}-${n}.png` });
    console.log(`shot ${w.key} #${n} @${((Date.now() - t0) / 1000).toFixed(1)} s`);
    if (w.key === 'rival-turn' || w.key === 'landing') for (const k of [1, 2]) {   // three beats of it
      await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}/DUNK-VENICE-ENV-2-${TAG}-${w.key}-${n}${'bc'[k - 1]}.png` });
    }
    if (w.from === 'text') await p.waitForTimeout(900);   // the next frame of the same cut, not the same frame
  }
  if (want.every((w) => (taken[w.key] ?? 0) >= w.max)) break;
  await p.waitForTimeout(60);
}
console.log(JSON.stringify({ tag: TAG, taken, errors, secs: Math.round((Date.now() - t0) / 1000) }));
for (const l of log.slice(0, 40)) console.log('  ', l);
await b.close();
process.exit(0);
