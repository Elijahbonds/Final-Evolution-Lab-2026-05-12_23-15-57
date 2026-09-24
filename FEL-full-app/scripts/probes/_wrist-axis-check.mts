// _wrist-axis-check — which way does WristLayer's "flexion" turn the hand on the LIVE rig? One recorded frame, frozen,
// the right hand turned about the computed axis by −60 / 0 / +60 degrees, photographed close from the side.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3011';
const REC = process.env.REC!; const AT = Number(process.env.AT ?? 1237); const OUT = process.env.OUT!;
const rec = JSON.parse(fs.readFileSync(REC, 'utf8'));
const f = rec.frames.reduce((a: any, x: any) => (Math.abs(x.t - rec.launchAt - AT) < Math.abs(a.t - rec.launchAt - AT) ? x : a), rec.frames[0]);
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-angle=metal'] });
const p = await (await b.newContext({ viewport: { width: 900, height: 900 } })).newPage();
await p.goto(`${BASE}/dev/mode/dunk`, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => !!(window as any).__FEL_DEV__?.hero?.(), null, { timeout: 180000 });
await p.waitForTimeout(3000);
const shots: string[] = [];
for (const deg of [-60, 0, 60]) {
  await p.evaluate(`((names, f, deg) => {
    const dev = window.__FEL_DEV__, s = dev.scene, eng = s.getEngine(); eng.stopRenderLoop(); s.animationsEnabled = false;
    for (const k of ['onBeforeRenderObservable','onAfterRenderObservable','onAfterAnimationsObservable','onBeforeAnimationsObservable','onBeforeCameraRenderObservable']) { try { s[k].clear(); } catch (e) {} }
    let root = dev.hero(); while (root.parent) root = root.parent;
    const sk = s.skeletons.find((k) => k.bones.some((b) => { const t = b.getTransformNode(); return t && t.isDescendantOf(root); }));
    const by = new Map(); for (const b of sk.bones) { const n = b.getTransformNode(); if (n) by.set(n.name.replace(/^mixamorig:?/, '').replace(/_c\\d+$/, ''), { n, b }); }
    root.position.set(f.rp[0], f.rp[1], f.rp[2]); root.rotationQuaternion = null; root.rotation.set(f.rr[0], f.rr[1], f.rr[2]);
    for (let i = 0; i < names.length; i++) { const e = by.get(names[i].replace(/^mixamorig:?/, '').replace(/_c\\d+$/, '')); if (!e) continue; if (!e.n.rotationQuaternion) e.n.rotationQuaternion = e.n.rotation.toQuaternion(); e.n.rotationQuaternion.set(f.q[i*4], f.q[i*4+1], f.q[i*4+2], f.q[i*4+3]); }
    const hips = by.get('Hips').n; if (f.hp) hips.position.set(f.hp[0], f.hp[1], f.hp[2]);
    // the axis exactly as WristLayer computes it: fingers = the hand's bind offset seen in its own frame, palm = ballRig's, flex = fingers × palm
    const hand = by.get('RightHand'); const rest = hand.b.getRestMatrix(); const Q = hand.n.rotationQuaternion.constructor, V = hand.n.position.constructor;
    const sc = new V(), bq = new Q(), bp = new V(); rest.decompose(sc, bq, bp);
    // the PCA-derived axes (hand-frame-check on this rig): the long axis toward the fingertips, the palm normal toward the ball side
    const MODE = "pca";
    let axis;
    if (MODE === 'pca') { const long = new V(0.802, -0.58, -0.141), palm = new V(0.371, 0.67, -0.644); axis = V.Cross(long, palm).normalize(); }
    else { const fingers = bp.clone().normalize().applyRotationQuaternion(bq.clone().invert()).normalize(); const palm0 = new V(0.47, -0.14, -0.87); const palm = palm0.subtract(fingers.scale(V.Dot(palm0, fingers))).normalize(); axis = V.Cross(fingers, palm).normalize(); }
    hand.n.rotationQuaternion.multiplyInPlace(Q.RotationAxis(axis, deg * Math.PI / 180));
    const ball = s.meshes.find((m) => m.name === 'ball' && m.metadata && m.metadata.felPalmMirrorLeft); if (ball) ball.setEnabled(false);
    root.computeWorldMatrix(true); for (const n of root.getDescendants(false)) n.computeWorldMatrix && n.computeWorldMatrix(true);
    const hp = hand.n.getAbsolutePosition(); const c = s.activeCamera; c.fov = 0.35;
    const cd = ${JSON.stringify(process.env.CAM||'1.6,0.1,0')}.split(',').map(Number); c.position.set(hp.x + cd[0], hp.y + cd[1], hp.z + cd[2]); c.setTarget(hp); c.fov = 0.6;
    s.render();
  })(${JSON.stringify(rec.names)}, ${JSON.stringify(f)}, ${deg})`);
  const file = `${OUT}-${deg}.png`; await p.screenshot({ path: file, clip: { x: 250, y: 250, width: 400, height: 400 } }); shots.push(file);
}
await b.close();
console.log(shots.join('\n'));
