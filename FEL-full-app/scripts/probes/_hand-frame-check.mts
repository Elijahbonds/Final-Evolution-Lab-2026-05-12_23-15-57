// _hand-frame-check — the live hero's hand frames: bind vs current local rotation, where the forearm sits in hand space,
// and a PCA of the hand's skinned vertices (flattest axis = the palm normal, longest = the fingers), per side.
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3011';
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-angle=metal'] });
const p = await (await b.newContext({ viewport: { width: 800, height: 600 } })).newPage();
await p.goto(`${BASE}/dev/mode/dunk`, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => !!(window as any).__FEL_DEV__?.hero?.(), null, { timeout: 180000 });
await p.waitForTimeout(3000);
const out = await p.evaluate(`(() => {
  const dev = window.__FEL_DEV__, s = dev.scene; let root = dev.hero(); while (root.parent) root = root.parent;
  const sk = s.skeletons.find((k) => k.bones.some((b) => { const t = b.getTransformNode(); return t && t.isDescendantOf(root); }));
  const res = {};
  for (const side of ['Right', 'Left']) {
    const bi = sk.bones.findIndex((b) => b.name.replace(/^mixamorig:?/, '').replace(/_c\\d+$/, '') === side + 'Hand');
    const bone = sk.bones[bi], n = bone.getTransformNode(); const Q = n.rotationQuaternion.constructor, V = n.position.constructor, M = n.getWorldMatrix().constructor;
    const sc = new V(), bq = new Q(), bp = new V(); bone.getRestMatrix().decompose(sc, bq, bp);
    const fingersBind = bp.clone().normalize().applyRotationQuaternion(bq.clone().invert()).normalize();
    n.computeWorldMatrix(true); const inv = n.getWorldMatrix().clone().invert();
    const fore = n.parent.getAbsolutePosition(); const foreInHand = V.TransformCoordinates(fore, inv);
    // skinned vertices dominated by this bone, in the hand's CURRENT local frame (the mesh is posed; transform by the bone's world)
    const meshes = s.meshes.filter((m) => m.skeleton && m.getTotalVertices() > 0 && (m.skeleton === sk || m.isDescendantOf(root)));
    res[side + 'Meshes'] = meshes.map((m) => m.name + ':' + (m.skeleton === sk) + ':' + m.getTotalVertices()).slice(0, 8);
    const pts = [];
    for (const m of meshes) {
      const pos = m.getVerticesData('position'), idx = m.getVerticesData('matricesIndices'), w = m.getVerticesData('matricesWeights'); if (!pos || !idx || !w) continue;
      const skinned = m.getPositionData(true, true);   // CPU-skinned positions in mesh space
      const wm = m.getWorldMatrix();
      for (let v = 0; v < pos.length / 3; v++) { let best = -1, bw = 0; for (let k = 0; k < 4; k++) if (w[v*4+k] > bw) { bw = w[v*4+k]; best = idx[v*4+k]; } const bname = m.skeleton.bones[best] && m.skeleton.bones[best].name.replace(/^mixamorig:?/, '').replace(/_c\\d+$/, ''); if (bname !== side + 'Hand' || bw < 0.6) continue;
        const wp = V.TransformCoordinates(new V(skinned[v*3], skinned[v*3+1], skinned[v*3+2]), wm); pts.push(V.TransformCoordinates(wp, inv)); }
    }
    const c = pts.reduce((a, q) => a.add(q), new V(0,0,0)).scale(1 / Math.max(1, pts.length));
    const C = [[0,0,0],[0,0,0],[0,0,0]]; for (const q of pts) { const d = [q.x-c.x, q.y-c.y, q.z-c.z]; for (let i=0;i<3;i++) for (let j=0;j<3;j++) C[i][j] += d[i]*d[j]; }
    // power iteration for the largest and (via deflation) the smallest axis
    const mul = (A, v) => [A[0][0]*v[0]+A[0][1]*v[1]+A[0][2]*v[2], A[1][0]*v[0]+A[1][1]*v[1]+A[1][2]*v[2], A[2][0]*v[0]+A[2][1]*v[1]+A[2][2]*v[2]];
    const nrm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
    let e1 = [1, 0.3, 0.2]; for (let i = 0; i < 60; i++) e1 = nrm(mul(C, e1));
    const l1 = Math.hypot(...mul(C, e1)); const D = C.map((r, i) => r.map((x, j) => x - l1 * e1[i] * e1[j]));
    let e2 = [0.2, 1, 0.3]; for (let i = 0; i < 60; i++) e2 = nrm(mul(D, e2));
    const e3 = nrm([e1[1]*e2[2]-e1[2]*e2[1], e1[2]*e2[0]-e1[0]*e2[2], e1[0]*e2[1]-e1[1]*e2[0]]);
    const r3 = (v) => v.map((x) => Math.round(x * 1000) / 1000);
    res[side] = { verts: pts.length, localQ: r3([n.rotationQuaternion.x, n.rotationQuaternion.y, n.rotationQuaternion.z, n.rotationQuaternion.w]), bindQ: r3([bq.x, bq.y, bq.z, bq.w]), fingersBind: r3([fingersBind.x, fingersBind.y, fingersBind.z]), foreInHand: r3([foreInHand.x, foreInHand.y, foreInHand.z]), centroid: r3([c.x, c.y, c.z]), longest: r3(e1), flattest: r3(e3) };
  }
  return res;
})()`);
console.log(JSON.stringify(out, null, 1));
await b.close();
