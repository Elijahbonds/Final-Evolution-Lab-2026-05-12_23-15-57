// BALL SPORT BODY probe — is the thoracic chain actually moving, and does the tennis player move his feet?
//
// The bar (FEL DUNK-POSTURE / board passes): a posture layer that is mounted but never writes is worth
// nothing, and spine ROLL is the channel the clips never key — so a non-zero |spine roll| range over a run
// is the proof the layer is live. For tennis it also samples the hero's x to prove footwork exists.
//
// env: BASE MODE
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3061';
const MODE = process.env.MODE ?? 'tennis';
const SECS = Number(process.env.SECS ?? 16);
const exe = (() => {
  const root = process.env.HOME + '/Library/Caches/ms-playwright';
  const dir = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  return `${root}/${dir}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
})();
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0; const errs: string[] = [];
// The layer announces every WINDOW CHANGE on its own tag (PostureLayer:134). A layer that is mounted but
// never switches window is a layer nobody is feeding — which is a different (and more likely) bug than a
// layer that writes no rotation, and the tags are how the board pass caught the same thing on snow.
const windows = new Map<string, number>();
p.on('console', (m) => {
  const x = m.text();
  const w = /\[(BAT|PITCH|KICK|KEEP|NET|AIR)-PP\]\s+(\S+)/.exec(x);
  if (w) windows.set(`${w[1]}:${w[2]}`, (windows.get(`${w[1]}:${w[2]}`) ?? 0) + 1);
  if (m.type() === 'error' && !/401/.test(x)) { errors++; if (errs.length < 3) errs.push(x.slice(0, 140)); }
});
p.on('pageerror', (e) => { errors++; if (errs.length < 3) errs.push('PAGEERROR ' + e.message.slice(0, 140)); });
await p.addInitScript(`(() => {
  const pad = { index: 0, id: 'fake', connected: true, mapping: 'standard', axes: [0,0,0,0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__PAD = pad; navigator.getGamepads = () => [pad];
})()`);
await p.goto(`${BASE}/dev/mode/${MODE}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 240000 });
await p.waitForTimeout(9000);
const s0 = p.locator('text=/^START$/').first();
if (await s0.count()) { await s0.click(); await p.waitForTimeout(3000); }

// sample the spine chain + hero x while driving the stick side to side and mashing the swing
await p.evaluate(`(() => {
  const s = window.__FEL_DEV__.scene;
  const hero = s.meshes.find((m) => /__root__/.test(m.name) && m.skeleton) || null;
  const sk = s.skeletons && s.skeletons[0];
  window.__SAMP = { roll: [], pitch: [], x: [], names: sk ? sk.bones.slice(0, 3).map(b => b.name) : [] };
  // EVERY skeleton, not skeletons[0]: these modes spawn ONLOOKERS through CharacterLibrary, so the first
  // skeleton in the scene is usually a spectator standing still — which is how the first run of this probe
  // reported "spinePitchDeg 0" for two modes whose posture layers were visibly switching windows in the log.
  const spines = s.skeletons.map((k) => k.bones.find((b) => /Spine1|Spine_?1|spine1/i.test(b.name)) || k.bones.find((b) => /Spine/i.test(b.name))).filter(Boolean);
  window.__SAMP.tracks = spines.map(() => ({ roll: [], pitch: [] }));
  const rootNode = window.__FEL_DEV__.scene.getTransformNodeByName('__root__') || null;
  s.onAfterRenderObservable.add(() => {
    spines.forEach((bn, i) => { const e = bn.getRotation ? bn.getRotation() : null; if (e) { window.__SAMP.tracks[i].roll.push(e.z); window.__SAMP.tracks[i].pitch.push(e.x); } });
    window.__SAMP.roll.push(0);
    const h = window.__FEL_DEV__.hero ? window.__FEL_DEV__.hero() : null;
    const px = h && h.position ? h.position.x : (rootNode ? rootNode.position.x : null);
    if (px !== null) window.__SAMP.x.push(+px.toFixed(3));
  });
  const pad = window.__PAD; let t = 0;
  setInterval(() => {
    t += 0.06;
    pad.axes[0] = Math.sin(t * 1.1);           // sweep the stick across the court
    pad.buttons[0].pressed = (Math.floor(t * 3) % 7) === 0;   // A: swing / start the spin
    pad.buttons[1].pressed = (Math.floor(t * 3) % 9) === 0;   // B: stick the landing
    pad.buttons[4].pressed = (Math.floor(t * 3) % 11) === 0;  // L1: split step
    pad.buttons[7].value = (Math.floor(t * 3) % 5) === 0 ? 1 : 0;
    // the big-air run-up is ALTERNATING d-pad strides — without them the athlete never launches
    pad.buttons[14].pressed = (Math.floor(t * 6) % 4) === 0;
    pad.buttons[15].pressed = (Math.floor(t * 6) % 4) === 2;
    pad.timestamp = performance.now();
  }, 60);
})()`);
await p.waitForTimeout(SECS * 1000);
const out = await p.evaluate(`(() => {
  const S = window.__SAMP || { roll: [], pitch: [], x: [] };
  const span = (a) => a.length ? +(Math.max(...a) - Math.min(...a)).toFixed(3) : null;
  const deg = (r) => r === null ? null : +(r * 180 / Math.PI).toFixed(2);
  const tracks = (S.tracks || []).map((t) => ({ roll: span(t.roll), pitch: span(t.pitch) }));
  const best = tracks.reduce((m, t) => (t.pitch > (m ? m.pitch : -1) ? t : m), null);
  return {
    frames: S.roll.length, skeletons: tracks.length,
    bestSpinePitchDeg: best ? deg(best.pitch) : null, bestSpineRollDeg: best ? deg(best.roll) : null,
    movingSkeletons: tracks.filter((t) => t.pitch > 0.01).length,
    heroXSpan: span(S.x),
  };
})()`);
console.log(`${MODE}: ${JSON.stringify(out)}  errors ${errors}`);
const seen = [...windows.entries()].sort((a, b) => b[1] - a[1]);
console.log(`  windows seen (${seen.length}): ${seen.map(([k, n]) => `${k}x${n}`).join(' ') || 'NONE — nobody is feeding the layer'}`);
if (errs.length) console.log('  ' + errs.join(' | '));
await b.close();
