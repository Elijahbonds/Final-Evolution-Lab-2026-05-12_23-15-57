// WHAT GROUND DOES THIS CLIP ACTUALLY COVER?
//
// A stride reference is the speed a locomotion clip is authored to travel at. Get it wrong and rate matching
// is confidently wrong: a clip referenced at 4.0 that really covers 2.2 is played at half the rate it needs
// and the feet slide no matter how carefully the matcher works.
//
// Measures it the only honest way: play the clip at rate 1 on a body whose ROOT DOES NOT MOVE, and watch how
// far the stance foot travels backwards per second in the body's own frame. That distance per second IS the
// authored ground speed.
//
// env: BASE MODE CLIPS (comma list)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const MODE = process.env.MODE ?? 'karate_vs';
const CLIPS = (process.env.CLIPS ?? 'run,karate_guard_step,karate_shuffle_left').split(',');
const exe = (() => { const r = process.env.HOME + '/Library/Caches/ms-playwright';
  const d = fs.readdirSync(r).filter((x) => /^chromium-\d+$/.test(x)).sort().pop();
  return `${r}/${d}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`; })();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 900, height: 560 } });
let errors = 0;
p.on('pageerror', () => { errors++; });
await p.addInitScript(`(() => {
  const pad = { index: 0, id: 'fake', connected: true, mapping: 'standard', axes: [0,0,0,0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
})()`);
await p.goto(`${BASE}/dev/mode/${MODE}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(10000);
const s0 = p.locator('text=/^START$/').first();
if (await s0.count()) { await s0.click(); await p.waitForTimeout(2500); }

for (const clip of CLIPS) {
  const out = await p.evaluate(`(async (clip) => {
    const s = window.__FEL_DEV__.scene;
    const hero = window.__FEL_DEV__.hero ? window.__FEL_DEV__.hero() : null;
    const sk = s.skeletons.find((k) => k.bones.some((bn) => /LeftFoot/i.test(bn.name)));
    if (!sk || !hero) return { clip, err: 'no rig' };
    const foot = (re) => { const bn = sk.bones.find((x) => re.test(x.name)); return bn && bn.getTransformNode ? bn.getTransformNode() : null; };
    const L = foot(/LeftFoot/i), R = foot(/RightFoot/i);
    if (!L || !R) return { clip, err: 'no feet' };
    // find the animator on the hero and play the clip at rate 1, in place
    const anim = window.__FEL_DEV__.animator || null;
    const groups = s.animationGroups.filter((g) => g.name === clip || g.name.endsWith('/' + clip));
    if (!groups.length) return { clip, err: 'clip not in scene', have: s.animationGroups.map(g => g.name).slice(0, 12) };
    for (const g of s.animationGroups) g.stop();
    const g = groups[0];
    g.speedRatio = 1; g.play(true);
    // freeze the root so only the CLIP moves the feet
    const rootPos = hero.position.clone();
    const samples = [];
    let last = null; let travel = 0; let frames = 0;
    const obs = s.onAfterRenderObservable.add(() => {
      hero.position.copyFrom(rootPos);
      const stance = L.getAbsolutePosition().y <= R.getAbsolutePosition().y ? L : R;
      const w = stance.getAbsolutePosition();
      const local = w.subtract(hero.getAbsolutePosition());
      if (last && w.y < 0.12) travel += Math.hypot(local.x - last.x, local.z - last.z);
      last = { x: local.x, z: local.z };
      frames++;
    });
    await new Promise((r) => setTimeout(r, 4000));
    s.onAfterRenderObservable.remove(obs);
    g.stop();
    const secs = frames / 60;
    return { clip, groundPerSec: +(travel / Math.max(0.001, secs)).toFixed(2), frames, secs: +secs.toFixed(1) };
  })(${JSON.stringify(clip)})`);
  console.log(JSON.stringify(out));
}
console.log('errors', errors);
await b.close();
