// FOOTPLANT probe — do the feet skate?
//
// Dynamic posture is worthless if the feet slide: a body that banks beautifully while its shoes skate across the
// floor reads as weightless, and that is the single biggest thing separating 2K's weight from a mobile game's.
//
// Measures it honestly: a foot is PLANTED when it is low (near the floor) and its world velocity is small. For every
// frame a foot is planted, how far does it travel? A planted foot should barely move; anything above a few cm per
// frame at running speed is a skate.
//
// env: BASE MODE (onevone) MAXMS (60000) QS (extra URL flags: `strideSlide=2.4`, `pp=0` — 1v1 without the Posture Poses layer)
//
// HOOPS-DEPTH S7 (2026-09-23): the skate is broken down — teleports (a reset, > 0.5 m of root in a frame) are skipped, and every
// planted-frame skate over 5 cm is filed by the hero's top clip, the frames since the tree last changed state, a root turn or a
// crossfade, the clip's loop phase and the foot's jump RELATIVE TO THE HIPS. That is how the 1v1 skate was traced to
// FootPlanting letting go at the drift limit with 0.65 of the pin's weight (a hold, then a 30–43 cm one-frame snap).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const MODE = process.env.MODE ?? 'onevone';
const MAXMS = Number(process.env.MAXMS ?? 60000);
const exe = (() => {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  const dir = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return `${root}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
})();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
let errors = 0;
p.on('pageerror', () => { errors++; });
await p.addInitScript(`(() => {
  const pad = { index: 0, id: 'fake-dualshock', connected: true, mapping: 'standard', axes: [0,0,0,0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
})()`);
await p.goto(`${BASE}/dev/mode/${MODE}${process.env.QS ? '?' + process.env.QS : ''}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(9000);
const start = p.locator('text=/^START$/').first();
if (await start.count()) { await start.click(); await p.waitForTimeout(3500); }
await p.evaluate(`(() => {
  const scene = window.__FEL_DEV__.scene;
  const pad = window.__PAD;
  const bare = (n) => n.replace(/^mixamorig:/, '').replace(/_c\\d+$/, '').replace(/_p\\d+$/, '');
  const topOf = (n) => { let c = n; while (c.parent) c = c.parent; return c; };
  const hero = window.__FEL_DEV__.hero();
  const hr = hero ? topOf(hero) : null;
  const under = (n, root) => { for (let c = n; c; c = c.parent) if (c === root) return true; return false; };
  const node = (name) => scene.transformNodes.find((n) => bare(n.name) === name && (!hr || under(n, hr)));
  const FEET = [node('LeftFoot'), node('RightFoot')];
  window.__FP = { bound: FEET.map((f) => !!f), planted: 0, frames: 0, slides: [], maxSlide: 0, rootSpeeds: [], teleports: 0, skateBy: {} };
  // HOOPS-DEPTH S7 (2026-09-23): which clip the hero is in when a planted foot skates (> 5 cm in a frame) — the fix needs a target
  const heroGroup = new Map();
  const topGroup = () => { let best = null, bw = 0; for (const g of scene.animationGroups) { if (!g.isPlaying) continue; const t = g.targetedAnimations[0] && g.targetedAnimations[0].target; if (!t || !hr || !under(t, hr)) continue; const w = g.weight < 0 ? 1 : g.weight; if (w > bw) { bw = w; best = g; } } return best; };
  const hipsN = node('Hips'); const prevRel = [null, null]; window.__FP.phase = []; window.__FP.relJump = [];
  const topClip = () => { let best = null, bw = 0; for (const g of scene.animationGroups) { if (!g.isPlaying) continue; let mine = heroGroup.get(g); if (mine === undefined) { const t = g.targetedAnimations[0] && g.targetedAnimations[0].target; mine = !!t && !!hr && under(t, hr); heroGroup.set(g, mine); } if (!mine) continue; const w = g.weight < 0 ? 1 : g.weight; if (w > bw) { bw = w; best = g.name; } } return best ? bare(best).replace(/_c\\d+.*$/, '') : '(none)'; };
  const prev = [null, null];
  let prevRoot = null, prevYaw = null;
  const yawOf = () => { const q = hr.rotationQuaternion; if (q) { const e = q.toEulerAngles(); return e.y; } return hr.rotation.y; };
  window.__FP.why = { turn: 0, blend: 0, both: 0, neither: 0 }; window.__FP.turnDeg = [];
  scene.onBeforeRenderObservable.add(() => {
    if (!hr) return;
    window.__FP.frames++;
    const rp = hr.getAbsolutePosition().clone();
    const rootStep = prevRoot ? Math.hypot(rp.x - prevRoot.x, rp.z - prevRoot.z) : 0;
    prevRoot = rp;
    if (rootStep > 0.5) { window.__FP.teleports++; prev[0] = null; prev[1] = null; return; }   // a court reset is not a skate
    const yaw = yawOf(); let dyaw = prevYaw === null ? 0 : Math.abs(yaw - prevYaw); if (dyaw > Math.PI) dyaw = 2 * Math.PI - dyaw; prevYaw = yaw;
    let blends = 0; for (const g of scene.animationGroups) { if (!g.isPlaying) continue; const t = g.targetedAnimations[0] && g.targetedAnimations[0].target; if (!t || !under(t, hr)) continue; const a = g.animatables[0]; const w = a ? a.weight : 1; if (w > 0.1 && w < 0.9) blends++; }   // the ANIMATABLE carries a crossfade's weight (the group's stays -1)
    { const md = scene.metadata && scene.metadata.onevone; const st = md && md.animState ? md.animState().me : null; if (st !== window.__FP.lastState) { window.__FP.lastState = st; window.__FP.stateAge = 0; window.__FP.changes = (window.__FP.changes || 0) + 1; } else window.__FP.stateAge = (window.__FP.stateAge || 0) + 1; }
    window.__FP.rootSpeeds.push(rootStep);
    FEET.forEach((f, i) => {
      if (!f) return;
      const w = f.getAbsolutePosition().clone();
      const hp = hipsN ? hipsN.getAbsolutePosition() : w; const rel = { x: w.x - hp.x, z: w.z - hp.z }; const pr = prevRel[i]; prevRel[i] = rel;
      const was = prev[i];
      prev[i] = w;
      if (!was) return;
      const step = Math.hypot(w.x - was.x, w.z - was.z);
      // PLANTED = LOW **AND** THE STANCE FOOT **AND** NOT RISING (2026-09-13).
      //
      // Height alone was not enough, and the header claimed a velocity test this code never did. In a WALK
      // both feet stay low, so 'low' is a fair proxy; in a RUN the swing foot passes THROUGH low altitude at
      // full speed, so height alone counts a correctly-animated swing as a skate — and the metric therefore
      // rewarded shuffling and punished running, which is the opposite of what it is for. (Found when a gait
      // split that visibly put the fighter into a run clip moved the number by 5 points.)
      //
      // Three conditions, which together are what "in contact" means:
      //   · low (the system's own DEFAULT_CONTACT downAt),
      //   · the LOWER of the two feet — the one bearing weight; in a run's flight phase neither qualifies,
      //   · not rising — a foot on its way up has left the floor whatever its height.
      const other = FEET[1 - i] ? FEET[1 - i].getAbsolutePosition() : null;
      const isStance = !other || w.y <= other.y;
      const rising = w.y - was.y > 0.002;
      const low = w.y < 0.09;
      if (low && isStance && !rising && rootStep > 0.01) {
        window.__FP.planted++;
        window.__FP.slides.push(step);
        if (step > window.__FP.maxSlide) window.__FP.maxSlide = step;
        if (step > 0.05) { const c = topClip(); window.__FP.skateBy[c] = (window.__FP.skateBy[c] || 0) + 1;
          const g = topGroup(); if (g && g.animatables && g.animatables[0]) { const a = g.animatables[0]; const len = g.to - g.from; window.__FP.phase.push(+(((a.masterFrame - g.from) / (len || 1)) % 1).toFixed(2)); }
          if (pr) window.__FP.relJump.push(+Math.hypot(rel.x - pr.x, rel.z - pr.z).toFixed(3));
          (window.__FP.ageAtSkate ??= []).push(window.__FP.stateAge ?? -1);
          const turn = dyaw > 0.05, blend = blends > 0; window.__FP.why[turn && blend ? 'both' : turn ? 'turn' : blend ? 'blend' : 'neither']++; window.__FP.turnDeg.push(+(dyaw * 180 / Math.PI).toFixed(1)); }
      }
    });
  });
  // run in a straight line, then cut — both matter
  let t = 0, dir = 1;
  window.__FPI = setInterval(() => {
    t += 60;
    if (t % 1200 < 60) dir = -dir;
    pad.axes[0] = dir * 0.5; pad.axes[1] = -1;
    pad.timestamp = performance.now();
  }, 60);
})()`);
await p.waitForTimeout(MAXMS);
const fp = await p.evaluate(`(() => {
  const d = window.__FP;
  const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const sorted = [...d.slides].sort((a, b) => a - b);
  const pct = (q) => sorted.length ? sorted[Math.floor(sorted.length * q)] : 0;
  return {
    bound: d.bound, frames: d.frames, plantedSamples: d.planted,
    avgRootStep: avg(d.rootSpeeds), avgSlide: avg(d.slides), medianSlide: pct(0.5), p90Slide: pct(0.9), maxSlide: d.maxSlide,
    phase: [...d.phase].sort((a, b) => a - b), relJump: [...d.relJump].sort((a, b) => a - b),
ageAtSkate: d.ageAtSkate ?? [], changes: d.changes ?? 0,
    teleports: d.teleports, skates: d.slides.filter((x) => x > 0.05).length, skateBy: d.skateBy, why: d.why, turnDeg: [...d.turnDeg].sort((a, b) => a - b),
  };
})()`) as Record<string, number | boolean[]>;
await p.evaluate('clearInterval(window.__FPI)');
console.log('mode: ' + MODE + '  feet bound: ' + JSON.stringify(fp.bound) + '  frames ' + fp.frames);
console.log('root travel per frame: ' + Number(fp.avgRootStep).toFixed(4) + ' m   (the body IS moving)');
console.log('PLANTED-foot travel per frame — median ' + Number(fp.medianSlide).toFixed(4)
  + '  p90 ' + Number(fp.p90Slide).toFixed(4) + '  max ' + Number(fp.maxSlide).toFixed(4) + ' m');
console.log('planted samples: ' + fp.plantedSamples + '  errors: ' + errors + '  teleports skipped: ' + fp.teleports);
{ const td = fp.turnDeg as unknown as number[]; if (td && td.length) console.log('skates while: ' + JSON.stringify(fp.why) + '  (turn = the root yawed > 2.9° that frame, blend = a crossfade on the hero) · root yaw on a skate frame: median ' + td[Math.floor(td.length / 2)] + '° p90 ' + td[Math.floor(td.length * 0.9)] + '°'); }
{ const ph = fp.phase as unknown as number[], rj = fp.relJump as unknown as number[]; if (ph && ph.length) { const hist = new Array(10).fill(0); for (const x of ph) hist[Math.min(9, Math.floor(x * 10))]++; console.log('clip phase on a skate frame (tenths of the loop): ' + JSON.stringify(hist)); } if (rj && rj.length) console.log('foot jump RELATIVE TO THE HIPS on a skate frame: median ' + rj[Math.floor(rj.length / 2)] + ' p90 ' + rj[Math.floor(rj.length * 0.9)]); }
{ const ag = fp.ageAtSkate as unknown as number[]; if (ag && ag.length) { const hist = [0, 0, 0, 0]; for (const a of ag) hist[a < 3 ? 0 : a < 10 ? 1 : a < 30 ? 2 : 3]++; console.log(`tree state changes ${fp.changes} in ${fp.frames} frames · skates by frames since the state changed: <3 ${hist[0]} · 3–9 ${hist[1]} · 10–29 ${hist[2]} · 30+ ${hist[3]}`); } }
console.log('skates (> 5 cm in a planted frame): ' + fp.skates + '  by the hero\'s top clip: ' + JSON.stringify(fp.skateBy));
const stride = await p.evaluate('window.__KVS_STRIDE || null');
if (stride) console.log('tree states while MOVING: ' + JSON.stringify(stride));
await b.close();
