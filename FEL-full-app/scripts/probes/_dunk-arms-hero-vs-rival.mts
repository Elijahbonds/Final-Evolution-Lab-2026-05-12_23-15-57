// The opponent's arms (owner: "fix the opponents arms in the dunk mode").
//
// Measured before: the rival's hands cross 0.27 m past the body's centre line and the hero's do not, while BOTH bodies
// fail hangFor's arm-length guard and take the same fallback. Flipping that fallback moved the hero and left the rival
// untouched — so the rival's arms do not come from it. This probe asks the narrower question: with both bodies in the
// same idle clip, are they in the same pose? If they are not, the difference is the layer stack, not the clip.
import { chromium } from 'playwright-core';
const PORT = process.env.PORT ?? '3011';
const QS = process.env.QS ?? '';
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=angle','--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1200, height: 760 } })).newPage();
await p.goto(`http://localhost:${PORT}/dev/mode/dunk${QS}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 90000 });
await p.waitForFunction(() => !!(window as any).__FEL_DEV__?.hero?.(), null, { timeout: 180000 });
await p.waitForTimeout(4000);

const out = await p.evaluate(`(() => {
  const dev = window.__FEL_DEV__, scene = dev.scene, hero = dev.hero();
  const rootOf = (n) => { while (n && n.parent) n = n.parent; return n; };
  // every skinned body in the scene, with its own skeleton
  const bodies = [];
  for (const m of scene.meshes) {
    if (!m.skeleton) continue;
    const r = rootOf(m);
    if (!bodies.some((x) => x.root === r)) bodies.push({ root: r, sk: m.skeleton });
  }
  const hp = hero.getAbsolutePosition();
  // the rival is the nearest OTHER body on the floor — a spectator in the stands is 10 m up and was measured by mistake once
  // THE MODE NAMES ITS OWN RIVAL. Picking the nearest body to the hero finds a courtside spectator just as often —
  // that mistake has already been made once in this session, on a body standing 10 m up in the stands.
  const rivalRoot = dev.dunkRival ? dev.dunkRival() : null;
  const others = rivalRoot ? bodies.filter((x) => x.root === rivalRoot).map((x) => ({ ...x, d: Vector3Distance(x.root.getAbsolutePosition(), hp) })) : [];
  function Vector3Distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }

  const read = (root, sk, label) => {
    const bn = (n) => sk.bones.find((b) => b.name === n || b.name.endsWith(':' + n) || b.name.endsWith('_' + n));
    const wp = (n) => { const bb = bn(n); const t = bb && bb.getTransformNode && bb.getTransformNode(); return t ? t.getAbsolutePosition() : null; };
    const M = root.getWorldMatrix().m, nz = (v) => { const L = Math.hypot(v[0],v[1],v[2]) || 1; return [v[0]/L, v[1]/L, v[2]/L]; };
    const R = nz([M[0],M[1],M[2]]), U = nz([M[4],M[5],M[6]]), F = nz([M[8],M[9],M[10]]), o = root.getAbsolutePosition();
    const L = (v) => v ? { r:+((v.x-o.x)*R[0]+(v.y-o.y)*R[1]+(v.z-o.z)*R[2]).toFixed(3), u:+((v.x-o.x)*U[0]+(v.y-o.y)*U[1]+(v.z-o.z)*U[2]).toFixed(3), f:+((v.x-o.x)*F[0]+(v.y-o.y)*F[1]+(v.z-o.z)*F[2]).toFixed(3) } : null;
    const q = (n) => { const bb = bn(n); const t = bb && bb.getTransformNode && bb.getTransformNode(); if (!t) return null; const r = t.rotationQuaternion; return r ? [+r.x.toFixed(3), +r.y.toFixed(3), +r.z.toFixed(3), +r.w.toFixed(3)] : ['euler', +t.rotation.x.toFixed(3), +t.rotation.y.toFixed(3), +t.rotation.z.toFixed(3)]; };
    const groups = scene.animationGroups.filter((g) => g.targetedAnimations.some((ta) => sk.bones.some((b) => b.getTransformNode && b.getTransformNode() === ta.target)))
      .map((g) => ({ n: g.name, on: g.isPlaying, w: +(g.weight ?? -1).toFixed(2), f: +(((g.animatables && g.animatables[0] && g.animatables[0].masterFrame) ?? -1)).toFixed(1), tgts: g.targetedAnimations.length }));
    const armQ = { LArm: q('LeftArm'), RArm: q('RightArm'), LFore: q('LeftForeArm'), RFore: q('RightForeArm') };
    const playing = scene.animationGroups.filter((g) => g.isPlaying && g.targetedAnimations.some((ta) => sk.bones.some((b) => b.getTransformNode && b.getTransformNode() === ta.target))).map((g) => g.name);
    const det = root.scaling ? { x:+root.scaling.x.toFixed(3), y:+root.scaling.y.toFixed(3), z:+root.scaling.z.toFixed(3) } : null;
    // THE BODY FRAME poseClip authors in: +right off the hip line, compared with the root's own right axis. A body whose
    // hip line points the other way gets its Left and Right hand targets swapped — which is what crossed arms are.
    const lul = wp('LeftUpLeg'), rul = wp('RightUpLeg');
    let hipRightDotR = null, hipSpan = null;
    if (lul && rul) {
      const dx = rul.x - lul.x, dz = rul.z - lul.z, L = Math.hypot(dx, dz) || 1;
      hipRightDotR = +(((dx / L) * R[0] + (dz / L) * R[2])).toFixed(3);
      hipSpan = +L.toFixed(3);
    }
    const toe = (side) => { const f = wp(side + 'Foot'), t = wp(side + 'ToeBase'); if (!f || !t) return null; const dx = t.x - f.x, dz = t.z - f.z, L = Math.hypot(dx, dz) || 1; return +(((dx/L)*F[0] + (dz/L)*F[2])).toFixed(3); };
    return { label, hipRightDotR, hipSpan, toeDotFront: { L: toe('Left'), R: toe('Right') }, scaling: det, det3: +(M[0]*(M[5]*M[10]-M[6]*M[9]) - M[1]*(M[4]*M[10]-M[6]*M[8]) + M[2]*(M[4]*M[9]-M[5]*M[8])).toFixed(3),
      LH: L(wp('LeftHand')), RH: L(wp('RightHand')), LS: L(wp('LeftShoulder')) || L(wp('LeftArm')), RS: L(wp('RightShoulder')) || L(wp('RightArm')),
      playing, groups, armQ, bones: sk.bones.length };
  };
  return { bodies: bodies.length, hero: read(hero, bodies.find((x) => x.root === hero).sk, 'HERO'),
    rivalNamedByMode: !!rivalRoot, rivalRootName: rivalRoot ? rivalRoot.name : null,
    rival: others[0] ? read(others[0].root, others[0].sk, 'RIVAL') : null,
    rivalDist: others[0] ? +others[0].d.toFixed(2) : null };
})()`);
console.log(JSON.stringify(out, null, 1));
await b.close();
