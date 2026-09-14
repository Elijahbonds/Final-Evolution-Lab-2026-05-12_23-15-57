// DO THE NEW VERBS EXIST ON A RUNNING FIGHT (2026-09-14).
//
// roll and jump were absent from all four combat modes. A unit test proves the state machine; it cannot
// prove that L1 reaches it, that the tree shows the roll, or that the body leaves the floor. This drives
// karate_vs and watches the rig.
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3061';
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--enable-webgl'] });
const p = await b.newPage({ viewport: { width: 1000, height: 640 } });
await p.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
const errs: string[] = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 140)));
p.on('console', (m) => { const t = m.text(); if (/MISSING CLIP/.test(t)) errs.push(t.slice(0, 140)); });

await p.goto(`${BASE}/dev/mode/karate_vs`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => !!(window as any).__FEL_DEV__?.scene, null, { timeout: 180000 });
await p.waitForTimeout(4000);

const out = await p.evaluate(`(async () => {
  const d = window.__FEL_DEV__, s = d.scene, bus = d.input;
  const f0 = s.getFrameId(); await new Promise(r => setTimeout(r, 800));
  const frames = s.getFrameId() - f0;

  const ev = (t, code, key) => window.dispatchEvent(new KeyboardEvent(t, { code, key, bubbles: true }));
  ev('keydown','Space',' '); await new Promise(r=>setTimeout(r,120)); ev('keyup','Space',' ');
  await new Promise(r => setTimeout(r, 6000));

  const hero = d.hero && d.hero();
  const rootY = () => (hero ? +hero.position.y.toFixed(3) : null);
  const posOf = () => hero ? { x: +hero.position.x.toFixed(2), z: +hero.position.z.toFixed(2) } : null;

  // JUMP: R1, then watch the root leave the floor
  const yBefore = rootY();
  bus.emit({ t: 'button', btn: 'R1', pressed: true }); bus.emit({ t: 'button', btn: 'R1', pressed: false });
  let peakY = 0;
  for (let i = 0; i < 24; i++) { await new Promise(r=>setTimeout(r,25)); peakY = Math.max(peakY, rootY() ?? 0); }
  await new Promise(r => setTimeout(r, 700));
  const yAfter = rootY();

  // ROLL: L1, and watch the body actually travel
  const p0 = posOf();
  bus.emit({ t: 'button', btn: 'L1', pressed: true }); bus.emit({ t: 'button', btn: 'L1', pressed: false });
  await new Promise(r => setTimeout(r, 650));
  const p1 = posOf();
  const moved = p0 && p1 ? +Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2) : null;

  const groups = s.animationGroups.map(g => g.name);
  return { frames, yBefore, peakY, yAfter, rollMoved: moved,
           rollClip: groups.indexOf('karate_roll') >= 0, jumpClip: groups.indexOf('karate_jump') >= 0 };
})()`) as Record<string, unknown>;

console.log('[VERBS]', JSON.stringify(out, null, 1));
console.log(`[VERBS] errors: ${errs.length}${errs.length ? ' :: ' + errs.slice(0,2).join(' | ') : ''}`);
await b.close();
