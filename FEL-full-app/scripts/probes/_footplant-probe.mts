// FOOTPLANT probe — do the feet skate?
//
// Dynamic posture is worthless if the feet slide: a body that banks beautifully while its shoes skate across the
// floor reads as weightless, and that is the single biggest thing separating 2K's weight from a mobile game's.
//
// Measures it honestly: a foot is PLANTED when it is low (near the floor) and its world velocity is small. For every
// frame a foot is planted, how far does it travel? A planted foot should barely move; anything above a few cm per
// frame at running speed is a skate.
//
// env: BASE MODE (onevone) MAXMS (60000)
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
await p.goto(`${BASE}/dev/mode/${MODE}`, { waitUntil: 'domcontentloaded' });
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
  window.__FP = { bound: FEET.map((f) => !!f), planted: 0, frames: 0, slides: [], maxSlide: 0, rootSpeeds: [] };
  const prev = [null, null];
  let prevRoot = null;
  scene.onBeforeRenderObservable.add(() => {
    if (!hr) return;
    window.__FP.frames++;
    const rp = hr.getAbsolutePosition().clone();
    const rootStep = prevRoot ? Math.hypot(rp.x - prevRoot.x, rp.z - prevRoot.z) : 0;
    prevRoot = rp;
    window.__FP.rootSpeeds.push(rootStep);
    FEET.forEach((f, i) => {
      if (!f) return;
      const w = f.getAbsolutePosition().clone();
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
  };
})()`) as Record<string, number | boolean[]>;
await p.evaluate('clearInterval(window.__FPI)');
console.log('mode: ' + MODE + '  feet bound: ' + JSON.stringify(fp.bound) + '  frames ' + fp.frames);
console.log('root travel per frame: ' + Number(fp.avgRootStep).toFixed(4) + ' m   (the body IS moving)');
console.log('PLANTED-foot travel per frame — median ' + Number(fp.medianSlide).toFixed(4)
  + '  p90 ' + Number(fp.p90Slide).toFixed(4) + '  max ' + Number(fp.maxSlide).toFixed(4) + ' m');
console.log('planted samples: ' + fp.plantedSamples + '  errors: ' + errors);
const stride = await p.evaluate('window.__KVS_STRIDE || null');
if (stride) console.log('tree states while MOVING: ' + JSON.stringify(stride));
await b.close();
