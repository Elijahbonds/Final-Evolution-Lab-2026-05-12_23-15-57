// DUNK-POSTURE-LEGS diag: which way does the live rig face at bind, and where do the mocap's IK'd legs land at runtime?
import { chromium } from 'playwright-core';
const PORT = process.env.PORT ?? '3004';
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await p.goto(`http://localhost:${PORT}/dev/mode/dunk`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 90000 });
await p.waitForFunction(() => !!(window as unknown as { __FEL_DEV__?: { hero: () => unknown } }).__FEL_DEV__?.hero?.(), null, { timeout: 180000 });
await p.waitForTimeout(1500);
const out = await p.evaluate(`(() => {
  const dev = window.__FEL_DEV__, scene = dev.scene, h = dev.hero();
  const d = h.getDescendants(false); const f = (nm) => d.find((n) => new RegExp('^' + nm + '(_c\\\\d+|_p\\\\d+)?$').test(n.name));
  const names = ['LeftArm', 'RightArm', 'LeftShoulder', 'RightShoulder', 'Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase', 'LeftHand', 'RightHand', 'Head', 'Spine2'];
  const N = {}; for (const n of names) N[n] = f(n);
  const walk = (n) => { n.computeWorldMatrix(true); for (const c of n.getChildTransformNodes(true)) walk(c); };
  const inv = () => { h.computeWorldMatrix(true); return h.getWorldMatrix().clone().invert(); };
  const local = (n) => { const v = n.getAbsolutePosition().clone(); const V = v.constructor; return V.TransformCoordinates(v, inv()); };
  const P = (n) => { const l = local(n); return '(' + l.x.toFixed(2) + ', ' + l.y.toFixed(2) + ', ' + l.z.toFixed(2) + ')'; };
  const lines = [];
  lines.push('root ' + h.name + ' rot.y ' + h.rotation.y.toFixed(2) + ' scaling ' + h.scaling.toString() + ' det ' + h.getWorldMatrix().determinant().toFixed(2) + ' pos ' + h.position.toString());
  lines.push('clips playing: ' + scene.animationGroups.filter((g) => g.isPlaying).map((g) => g.name + ':' + g.weight.toFixed(2)).join(','));
  walk(h);
  lines.push('IDLE shoulders root-local: LeftArm ' + P(N.LeftArm) + ' RightArm ' + P(N.RightArm) + ' LUL ' + P(N.LeftUpLeg) + ' RUL ' + P(N.RightUpLeg));
  lines.push('IDLE root-local: ankleL ' + P(N.LeftFoot) + ' toeL ' + P(N.LeftToeBase) + ' RH ' + P(N.RightHand) + ' LH ' + P(N.LeftHand) + ' head ' + P(N.Head) + ' hips ' + P(N.Hips));
  // world: which way is the rim from the hero, and where is the toe vs the ankle in world
  const a = N.LeftFoot.getAbsolutePosition(), t = N.LeftToeBase.getAbsolutePosition();
  lines.push('WORLD: toe - ankle = (' + (t.x - a.x).toFixed(2) + ', ' + (t.z - a.z).toFixed(2) + ') rim at z -10.28, hero z ' + h.position.z.toFixed(2));
  // the mocap clip on this rig at t = 0.4: pause every playing group, weight it in alone
  const gs = scene.animationGroups.filter((g) => g.targetedAnimations[0] && (() => { let n = g.targetedAnimations[0].target; if (n.getTransformNode) n = n.getTransformNode(); while (n && n.parent) n = n.parent; return n === h; })());
  const hang = gs.find((g) => g.name === 'dunk_score_hang');
  if (hang) { const playing0 = gs.filter((g) => g.isPlaying); for (const g of playing0) g.pause(); const sv = playing0.map((g) => [g, g.weight]); for (const g of playing0) g.setWeightForAllAnimatables(0);
    for (const tt of [0, 0.4, 0.8]) { hang.start(false, 1, hang.from, hang.to, false); hang.setWeightForAllAnimatables(1); hang.goToFrame(tt * 30); hang.pause(); scene.render(); walk(h); lines.push('SCORE_HANG t ' + tt + ' root-local: RH ' + P(N.RightHand) + ' LH ' + P(N.LeftHand) + ' RA ' + P(N.RightArm) + ' LA ' + P(N.LeftArm)); }
    hang.stop(); for (const [g, w] of sv) { g.setWeightForAllAnimatables(w); g.play(); } }
  const moc = gs.find((g) => g.name === 'dunk_mocap');
  if (!moc) { lines.push('no dunk_mocap group on the hero'); return lines.join('\\n'); }
  const playing = gs.filter((g) => g.isPlaying); for (const g of playing) g.pause();
  const saved = playing.map((g) => [g, g.weight]); for (const g of playing) g.setWeightForAllAnimatables(0);
  for (const tt of [0, 0.4, 1.05]) {
    moc.start(false, 1, moc.from, moc.to, false); moc.setWeightForAllAnimatables(1); moc.goToFrame(tt * 30); moc.pause(); scene.render(); walk(h);
    lines.push('MOCAP t ' + tt + ' root-local: hipL ' + P(N.LeftUpLeg) + ' kneeL ' + P(N.LeftLeg) + ' ankL ' + P(N.LeftFoot) + ' | hipR ' + P(N.RightUpLeg) + ' kneeR ' + P(N.RightLeg) + ' ankR ' + P(N.RightFoot) + ' | RH ' + P(N.RightHand) + ' LH ' + P(N.LeftHand));
  }
  moc.stop(); for (const [g, w] of saved) { g.setWeightForAllAnimatables(w); g.play(); }
  return lines.join('\\n');
})()`);
console.log(out);
await b.close();
