// ACCESSORY inspect (CLOTHING-SOFT-RESIDUAL, 2026-09-21): what the dunk hero's accessory tubes measured and how the shown top
// trimmed them — per tube: its segment, the span it was built for, the span it shows, its ring radii (measured off the skin or the
// reference sizes), whether it is hidden under the top, and its live scale.
//   PORT=3011 QS='body=male&tops=top_lab&shorts=shorts_court&shoes=shoes_flight' npx tsx scripts/probes/_accessory-inspect.mts
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const PORT = process.env.PORT ?? '3061', QS = process.env.QS ?? 'body=male', MODE = process.env.MODE ?? 'dunk';
(async () => {
  const b = await chromium.launch({ executablePath: chromiumExe(), args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  p.on('console', (m) => { const t = m.text(); if (/FEL-KIT|FEL-ACC|accessory/i.test(t)) console.log('  [console]', t.slice(0, 300)); });
  await p.goto(`http://127.0.0.1:${PORT}/dev/mode/${MODE}?${QS}`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => !!(window as unknown as { __FEL_DEV__?: { hero: () => unknown } }).__FEL_DEV__?.hero?.(), null, { timeout: 240000 });
  await p.waitForTimeout(4000);
  const out = await p.evaluate(`(() => {
    const dev = window.__FEL_DEV__, h = dev.hero();
    const rows = [];
    for (const m of h.getChildMeshes(false)) {
      if (!/^acc_/.test(m.name)) continue;
      const t = m.metadata && m.metadata.felAccessory && m.metadata.felAccessory.tube;
      rows.push({ name: m.name, vis: m.isVisible, parent: m.parent && m.parent.name, scaleY: +m.scaling.y.toFixed(3),
        tube: t ? { kind: t.kind, seg: +t.seg.toFixed(3), built: t.built, span: { from: +t.span.from.toFixed(3), to: +t.span.to.toFixed(3) }, r0: +t.r0.toFixed(4), r1: +t.r1.toFixed(4), measured: t.measured, hidden: t.hidden } : null });
    }
    const tops = h.getChildMeshes(false).filter((m) => /^Kit_tops_/.test(m.name) && m.isVisible).map((m) => m.name);
    const body = h.getChildMeshes(false).find((m) => /^Body/.test(m.name));
    return { root: h.name, tops, mask: body && body.metadata && body.metadata.felBodyMask ? body.metadata.felBodyMask.hiddenBySlot : null, rows };
  })()`);
  console.log(JSON.stringify(out, null, 1));
  if (process.env.DIAG) {
    // DIAG=1: is the CPU-skinned body in the pose the bone nodes hold NOW? Per limb bone: the joint's world position, the
    // centroid of the skin vertices that ride it (≥ 0.4) from bodyMask.skinnedWorld and from Babylon's own getPositionData,
    // and that skin's radius about the joint-to-child axis.
    const diag = await p.evaluate(`(() => {
      const dev = window.__FEL_DEV__, h = dev.hero(); const body = h.getChildMeshes(false).find((m) => /^Body/.test(m.name));
      const sw = window.__FEL_BODYMASK__ && window.__FEL_BODYMASK__.skinnedWorld(body); const pd = body.getPositionData(true, true); const W = body.getWorldMatrix().m;
      const mi = body.getVerticesData('matricesIndices'), mw = body.getVerticesData('matricesWeights'); const bones = body.skeleton.bones;
      const bare = (n) => n.replace(/^mixamorig:/, '').replace(/_c\\d+$/, '');
      const out = {};
      for (const [bone, child] of [['LeftArm', 'LeftForeArm'], ['RightLeg', 'RightFoot'], ['LeftLeg', 'LeftFoot']]) {
        const bi = new Set(); bones.forEach((b, i) => { if (bare(b.name) === bone) bi.add(i); });
        const nodeOf = (n) => { const b = bones.find((x) => bare(x.name) === n); return b ? b.getTransformNode() : null; };
        const a = nodeOf(bone), c = nodeOf(child); if (!a || !c) { out[bone] = 'no node'; continue; }
        a.computeWorldMatrix(true); c.computeWorldMatrix(true); const pa = a.getAbsolutePosition(), pc = c.getAbsolutePosition();
        let n = 0, sx = 0, sy = 0, sz = 0, gx = 0, gy = 0, gz = 0, rs = 0, rg = 0;
        const ux = pc.x - pa.x, uy = pc.y - pa.y, uz = pc.z - pa.z, L = Math.hypot(ux, uy, uz);
        for (let v = 0; v < mi.length / 4; v++) { let w = 0; for (let k = 0; k < 4; k++) if (bi.has(mi[v * 4 + k])) w += mw[v * 4 + k]; if (w < 0.4) continue; n++;
          if (sw) { sx += sw.P[v * 3]; sy += sw.P[v * 3 + 1]; sz += sw.P[v * 3 + 2]; const px = sw.P[v*3]-pa.x, py = sw.P[v*3+1]-pa.y, pz = sw.P[v*3+2]-pa.z; const s = (px*ux+py*uy+pz*uz)/L; rs += Math.hypot(px - s*ux/L, py - s*uy/L, pz - s*uz/L); }
          const x = pd[v * 3], y = pd[v * 3 + 1], z = pd[v * 3 + 2]; const wx = x * W[0] + y * W[4] + z * W[8] + W[12], wy = x * W[1] + y * W[5] + z * W[9] + W[13], wz = x * W[2] + y * W[6] + z * W[10] + W[14];
          gx += wx; gy += wy; gz += wz; const px = wx-pa.x, py = wy-pa.y, pz = wz-pa.z; const s = (px*ux+py*uy+pz*uz)/L; rg += Math.hypot(px - s*ux/L, py - s*uy/L, pz - s*uz/L); }
        out[bone] = { n, joint: [pa.x, pa.y, pa.z].map((q) => +q.toFixed(3)), child: [pc.x, pc.y, pc.z].map((q) => +q.toFixed(3)), segLen: +L.toFixed(3),
          maskSkinCentroid: sw ? [sx / n, sy / n, sz / n].map((q) => +q.toFixed(3)) : null, maskMeanRadius: sw ? +(rs / n).toFixed(3) : null,
          babylonCentroid: [gx / n, gy / n, gz / n].map((q) => +q.toFixed(3)), babylonMeanRadius: +(rg / n).toFixed(3) };
      }
      out.worldScale = +Math.hypot(W[0], W[1], W[2]).toFixed(4); out.rootPos = [h.position.x, h.position.y, h.position.z].map((q) => +q.toFixed(3));
      return out;
    })()`);
    console.log('DIAG', JSON.stringify(diag, null, 1));
    // the radial distances in a ring's slab, sorted: what accessoryFit.ringRadius clusters
    const slabs = await p.evaluate(`(() => {
      const dev = window.__FEL_DEV__, h = dev.hero(); const body = h.getChildMeshes(false).find((m) => /^Body/.test(m.name));
      const sw = window.__FEL_BODYMASK__.skinnedWorld(body); const mi = body.getVerticesData('matricesIndices'), mw = body.getVerticesData('matricesWeights'); const bones = body.skeleton.bones;
      const bare = (n) => n.replace(/^mixamorig:/, '').replace(/_c\\d+$/, '');
      const nodeOf = (n) => { const b = bones.find((x) => bare(x.name) === n); return b ? b.getTransformNode() : null; };
      const out = {};
      for (const [bone, child, ts] of [['LeftArm', 'LeftForeArm', [0.34, 0.97]], ['RightLeg', 'RightFoot', [0.3, 0.8]], ['LeftForeArm', 'LeftHand', [0.06, 0.8]]]) {
        const bi = new Set(); bones.forEach((b, i) => { if (bare(b.name) === bone) bi.add(i); });
        const a = nodeOf(bone), c = nodeOf(child); a.computeWorldMatrix(true); c.computeWorldMatrix(true); const pa = a.getAbsolutePosition(), pc = c.getAbsolutePosition();
        const ux = pc.x - pa.x, uy = pc.y - pa.y, uz = pc.z - pa.z, L = Math.hypot(ux, uy, uz);
        for (const t of ts) { const ds = [], cen = [0, 0, 0]; let n = 0;
          for (let v = 0; v < mi.length / 4; v++) { let w = 0; for (let k = 0; k < 4; k++) if (bi.has(mi[v * 4 + k])) w += mw[v * 4 + k]; if (w < 0.25) continue;
            const px = sw.P[v*3]-pa.x, py = sw.P[v*3+1]-pa.y, pz = sw.P[v*3+2]-pa.z; const s = (px*ux+py*uy+pz*uz)/L; if (Math.abs(s - t*L) > 0.02) continue;
            const qx = px - s*ux/L, qy = py - s*uy/L, qz = pz - s*uz/L; ds.push(+Math.hypot(qx, qy, qz).toFixed(3)); cen[0] += qx; cen[1] += qy; cen[2] += qz; n++; }
          ds.sort((x, y) => x - y);
          out[bone + '@' + t] = { n, first: ds.slice(0, 12), last: ds.slice(-6), centroidOff: n ? +Math.hypot(cen[0]/n, cen[1]/n, cen[2]/n).toFixed(3) : null }; }
      }
      return out;
    })()`);
    console.log('SLABS', JSON.stringify(slabs, null, 1));
  }
  await b.close();
})();
