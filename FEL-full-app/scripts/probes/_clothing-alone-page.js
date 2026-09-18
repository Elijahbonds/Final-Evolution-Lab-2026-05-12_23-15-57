// CLOTHING-ALONE page side (2026-09-14) — injected by _clothing-alone-probe.mts into /dev/mode/dunk.
// Every sampled frame, CPU-skins the hero's visible body and garment meshes off THIS frame's bone matrices (the vertex
// shader's math) and grades the four gates against a reference frame taken standing:
//   C1 bind    — every visible garment is skinned (a skeleton, weights), and its skeleton's bones are linked to the SAME
//                transform nodes as the body's skeleton (one pose drives both); nothing reparented, disabled or hidden
//   C2 clip    — body vertices covered by a garment at the reference (within 3 cm, projecting inside a garment triangle):
//                how far each stands PROUD of the garment surface this frame (signed along the garment's outward normal)
//   C3 detach  — each garment vertex's distance to its reference-nearest body vertex, drift from the reference distance
//   C4 stretch — every edge's length over its reference length (garments and the body), the frame-to-frame jump of that
//                ratio, and each garment vertex's one-frame move relative to its paired body vertex (a pop)
(() => {
  const dev = window.__FEL_DEV__, scene = dev.scene, eng = scene.getEngine();
  const S = window.__cla = { rows: [], marks: [], on: false, refd: null, shots: false, frozen: '', loops: null, drv: { slamAt: -1, frames: 0, done: true }, info: null };
  // the capped virtual clock (the car-clip probe's SHOTS clock): a heavy measured frame advances the game at most 34 ms
  { const realNow = performance.now.bind(performance); let vt = realNow(), last = realNow(); const raf = window.requestAnimationFrame.bind(window);
    let ret = vt; performance.now = () => (ret = Math.max(ret, vt + (S.frozen ? 0 : Math.min(34, realNow() - last))));
    window.requestAnimationFrame = (cb) => raf(() => { const r = realNow(); const d = r - last; last = r; vt += Math.min(d, 34); cb(vt); }); }
  const oi = console.info.bind(console);
  console.info = (...a) => { const s = String(a[0]); if (/^\[(DUNK-WIN|DUNK-LAUNCH|DUNK-SLAM|HANDS|FEL-KIT)/.test(s)) S.marks.push({ t: performance.now(), msg: s.slice(0, 240) }); oi(...a); };

  const isGarment = (m) => /^Kit(Sole)?_/.test(m.name);
  const isBody = (m) => /^Body(_|$)/.test(m.name);
  const live = (h) => h.getChildMeshes(false).filter((m) => m.skeleton && m.isEnabled() && m.isVisible && m.getTotalVertices() > 0 && (isGarment(m) || isBody(m)));
  const cache = new Map();
  const geo = (m) => { let c = cache.get(m); if (c) return c;
    c = { pos: m.getVerticesData('position'), nrm: m.getVerticesData('normal'), idx: m.getVerticesData('matricesIndices'), w: m.getVerticesData('matricesWeights'), idxX: m.getVerticesData('matricesIndicesExtra'), wX: m.getVerticesData('matricesWeightsExtra'), ind: m.getIndices() };
    cache.set(m, c); return c; };
  // world positions (+ normals when asked) of a skinned mesh this frame
  const skin = (m, withN) => { const { pos, nrm, idx, w, idxX, wX } = geo(m); const M = m.skeleton.getTransformMatrices(m); m.computeWorldMatrix(true); const W = m.getWorldMatrix().m;
    const n = pos.length / 3, P = new Float32Array(n * 3), N = withN && nrm ? new Float32Array(n * 3) : null;
    for (let v = 0; v < n; v++) { const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2]; let sx = 0, sy = 0, sz = 0, nx = 0, ny = 0, nz = 0; const ax = N ? nrm[v * 3] : 0, ay = N ? nrm[v * 3 + 1] : 0, az = N ? nrm[v * 3 + 2] : 0;
      for (let k = 0; k < 8; k++) { const ww = k < 4 ? w[v * 4 + k] : wX ? wX[v * 4 + k - 4] : 0; if (!ww) continue; const b = (k < 4 ? idx[v * 4 + k] : idxX[v * 4 + k - 4]) * 16;
        sx += ww * (x * M[b] + y * M[b + 4] + z * M[b + 8] + M[b + 12]); sy += ww * (x * M[b + 1] + y * M[b + 5] + z * M[b + 9] + M[b + 13]); sz += ww * (x * M[b + 2] + y * M[b + 6] + z * M[b + 10] + M[b + 14]);
        if (N) { nx += ww * (ax * M[b] + ay * M[b + 4] + az * M[b + 8]); ny += ww * (ax * M[b + 1] + ay * M[b + 5] + az * M[b + 9]); nz += ww * (ax * M[b + 2] + ay * M[b + 6] + az * M[b + 10]); } }
      P[v * 3] = sx * W[0] + sy * W[4] + sz * W[8] + W[12]; P[v * 3 + 1] = sx * W[1] + sy * W[5] + sz * W[9] + W[13]; P[v * 3 + 2] = sx * W[2] + sy * W[6] + sz * W[10] + W[14];
      if (N) { const qx = nx * W[0] + ny * W[4] + nz * W[8], qy = nx * W[1] + ny * W[5] + nz * W[9], qz = nx * W[2] + ny * W[6] + nz * W[10]; const l = Math.hypot(qx, qy, qz) || 1; N[v * 3] = qx / l; N[v * 3 + 1] = qy / l; N[v * 3 + 2] = qz / l; } }
    return { P, N }; };
  const wvec = (m, v) => { const { idx, w } = geo(m); const o = {}; for (let k = 0; k < 4; k++) if (w[v * 4 + k] > 0) { const n = m.skeleton.bones[idx[v * 4 + k]]?.name ?? '?'; o[n] = (o[n] || 0) + w[v * 4 + k]; } return o; };
  const wsim = (a, b) => { let s = 0; for (const k in a) if (b[k]) s += Math.min(a[k], b[k]); return s; };
  const slotOf = (name) => /^KitSole_/.test(name) ? 'shoes' : (/^Kit_(tops|shorts|shoes)_/.exec(name)?.[1] ?? '?');
  const SEGS = [['LeftArm', 'LeftForeArm'], ['LeftForeArm', 'LeftHand'], ['RightArm', 'RightForeArm'], ['RightForeArm', 'RightHand'], ['LeftUpLeg', 'LeftLeg'], ['LeftLeg', 'LeftFoot'], ['RightUpLeg', 'RightLeg'], ['RightLeg', 'RightFoot'], ['Hips', 'Spine'], ['Spine', 'Spine1'], ['Spine1', 'Spine2'], ['Spine2', 'Neck'], ['Neck', 'Head'], ['LeftShoulder', 'LeftArm'], ['RightShoulder', 'RightArm']];
  const EDGE_FLOOR = 0.004;   // edges shorter than 4 mm (UV-seam slivers) are not graded — a 0.2 mm edge at 1.8 mm reads 9x and is invisible
  let BODY = null;   // the body mesh being graded (set by ref)
  const toeW = (v) => { const { idx, w } = geo(BODY); let t = 0; for (let k = 0; k < 4; k++) if (w[v * 4 + k] > 0 && /ToeBase$/.test(BODY.skeleton.bones[idx[v * 4 + k]]?.name ?? '')) t += w[v * 4 + k]; return t; };
  const footW = (v) => { const { idx, w } = geo(BODY); let t = 0; for (let k = 0; k < 4; k++) if (w[v * 4 + k] > 0 && /(Foot|ToeBase)$/.test(BODY.skeleton.bones[idx[v * 4 + k]]?.name ?? '')) t += w[v * 4 + k]; return t; };
  const boneOf = (m, v) => { const { idx, w } = geo(m); let bi = 0, bw = -1; for (let k = 0; k < 4; k++) if (w[v * 4 + k] > bw) { bw = w[v * 4 + k]; bi = idx[v * 4 + k]; } return m.skeleton.bones[bi]?.name ?? '?'; };
  const grid = (P, cell) => { const g = new Map(); for (let v = 0, n = P.length / 3; v < n; v++) { const k = `${Math.floor(P[v * 3] / cell)},${Math.floor(P[v * 3 + 1] / cell)},${Math.floor(P[v * 3 + 2] / cell)}`; let a = g.get(k); if (!a) g.set(k, a = []); a.push(v); } return g; };
  const near = (g, cell, x, y, z) => { const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell), out = []; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) { const a = g.get(`${cx + i},${cy + j},${cz + k}`); if (a) for (const v of a) out.push(v); } return out; };
  // every triangle of a slot's meshes, filed into the 4 cm cells its box (grown by 4.5 cm) touches
  const TC = 0.04;
  const triGrid = (members, reach = 0.045, cell = TC) => { const g = new Map(); g.cell = cell; members.forEach((G, gi) => { const P = G.cur.P, ind = G.ind; for (let t = 0; t < ind.length; t += 3) { let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9; for (let k = 0; k < 3; k++) { const v = ind[t + k]; x0 = Math.min(x0, P[v * 3]); x1 = Math.max(x1, P[v * 3]); y0 = Math.min(y0, P[v * 3 + 1]); y1 = Math.max(y1, P[v * 3 + 1]); z0 = Math.min(z0, P[v * 3 + 2]); z1 = Math.max(z1, P[v * 3 + 2]); }
    const m = reach; for (let i = Math.floor((x0 - m) / cell); i <= Math.floor((x1 + m) / cell); i++) for (let j = Math.floor((y0 - m) / cell); j <= Math.floor((y1 + m) / cell); j++) for (let k = Math.floor((z0 - m) / cell); k <= Math.floor((z1 + m) / cell); k++) { const key = i + ',' + j + ',' + k; let a = g.get(key); if (!a) g.set(key, a = []); a.push(gi, t); } } }); return g; };
  // the slot surface nearest a body point: { s, d, inside, facing } or null
  const slotHit = (X, g, B, v) => { const x = B.P[v * 3], y = B.P[v * 3 + 1], z = B.P[v * 3 + 2]; const a = g.get(Math.floor(x / g.cell) + ',' + Math.floor(y / g.cell) + ',' + Math.floor(z / g.cell)); if (!a) return null;
    // the nearest triangle the point projects INTO (a nearer sliver it only grazes says nothing)
    let best = null, graze = null; for (let i = 0; i < a.length; i += 2) { const r = proud(x, y, z, X.members[a[i]], a[i + 1]); r.gi = a[i]; r.t = a[i + 1]; if (!r.inside) { if (!graze || r.d < graze.d) graze = r; continue; } if (!best || r.d < best.d) best = r; }
    if (!best) best = graze; if (!best) return null; best.facing = B.N ? B.N[v * 3] * best.fx + B.N[v * 3 + 1] * best.fy + B.N[v * 3 + 2] * best.fz : 1; return best; };
  const edgesOf = (ind) => { const seen = new Set(), E = []; for (let t = 0; t < ind.length; t += 3) for (const [a, b] of [[ind[t], ind[t + 1]], [ind[t + 1], ind[t + 2]], [ind[t + 2], ind[t]]]) { const lo = Math.min(a, b), hi = Math.max(a, b), key = lo * 1e6 + hi; if (!seen.has(key)) { seen.add(key); E.push(lo, hi); } } return Int32Array.from(E); };
  const len = (P, a, b) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
  // closest point on triangle (Ericson) → [cx, cy, cz, u, v, w]
  const closest = (px, py, pz, P, a, b, c) => {
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2], bx = P[b * 3], by = P[b * 3 + 1], bz = P[b * 3 + 2], cx = P[c * 3], cy = P[c * 3 + 1], cz = P[c * 3 + 2];
    const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az, apx = px - ax, apy = py - ay, apz = pz - az;
    const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
    if (d1 <= 0 && d2 <= 0) return [ax, ay, az, 1, 0, 0];
    const bpx = px - bx, bpy = py - by, bpz = pz - bz, d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) return [bx, by, bz, 0, 1, 0];
    const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const t = d1 / (d1 - d3); return [ax + t * abx, ay + t * aby, az + t * abz, 1 - t, t, 0]; }
    const cpx = px - cx, cpy = py - cy, cpz = pz - cz, d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
    if (d6 >= 0 && d5 <= d6) return [cx, cy, cz, 0, 0, 1];
    const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const t = d2 / (d2 - d6); return [ax + t * acx, ay + t * acy, az + t * acz, 1 - t, 0, t]; }
    const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const t = (d4 - d3) / (d4 - d3 + d5 - d6); return [bx + t * (cx - bx), by + t * (cy - by), bz + t * (cz - bz), 0, 1 - t, t]; }
    const den = 1 / (va + vb + vc), v = vb * den, w2 = vc * den; return [ax + abx * v + acx * w2, ay + aby * v + acy * w2, az + abz * v + acz * w2, 1 - v - w2, v, w2];
  };
  // signed distance of p proud of triangle t (outward = the garment's own vertex normals); interior = the projection is not on an edge
  const proud = (px, py, pz, G, t) => { const { P, N } = G.cur, ind = G.ind, a = ind[t], b = ind[t + 1], c = ind[t + 2];
    const q = closest(px, py, pz, P, a, b, c);
    let fx = (P[b * 3 + 1] - P[a * 3 + 1]) * (P[c * 3 + 2] - P[a * 3 + 2]) - (P[b * 3 + 2] - P[a * 3 + 2]) * (P[c * 3 + 1] - P[a * 3 + 1]);
    let fy = (P[b * 3 + 2] - P[a * 3 + 2]) * (P[c * 3] - P[a * 3]) - (P[b * 3] - P[a * 3]) * (P[c * 3 + 2] - P[a * 3 + 2]);
    let fz = (P[b * 3] - P[a * 3]) * (P[c * 3 + 1] - P[a * 3 + 1]) - (P[b * 3 + 1] - P[a * 3 + 1]) * (P[c * 3] - P[a * 3]);
    const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    const vx = N[a * 3] + N[b * 3] + N[c * 3], vy = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], vz = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
    if (fx * vx + fy * vy + fz * vz < 0) { fx = -fx; fy = -fy; fz = -fz; }
    const dx = px - q[0], dy = py - q[1], dz = pz - q[2];
    // inside = the PLANE projection falls in the triangle (10 % tolerance): a clamped closest point sits on a shared interior edge for most skin under a dense garment
    const e0x = P[b * 3] - P[a * 3], e0y = P[b * 3 + 1] - P[a * 3 + 1], e0z = P[b * 3 + 2] - P[a * 3 + 2], e1x = P[c * 3] - P[a * 3], e1y = P[c * 3 + 1] - P[a * 3 + 1], e1z = P[c * 3 + 2] - P[a * 3 + 2], e2x = px - P[a * 3], e2y = py - P[a * 3 + 1], e2z = pz - P[a * 3 + 2];
    const d00 = e0x * e0x + e0y * e0y + e0z * e0z, d01 = e0x * e1x + e0y * e1y + e0z * e1z, d11 = e1x * e1x + e1y * e1y + e1z * e1z, d20 = e2x * e0x + e2y * e0y + e2z * e0z, d21 = e2x * e1x + e2y * e1y + e2z * e1z, den = d00 * d11 - d01 * d01;
    const bv = den ? (d11 * d20 - d01 * d21) / den : -1, bw = den ? (d00 * d21 - d01 * d20) / den : -1, bu = 1 - bv - bw;
    return { s: dx * fx + dy * fy + dz * fz, d: Math.hypot(dx, dy, dz), inside: bu >= -0.1 && bv >= -0.1 && bw >= -0.1, fx, fy, fz };
  };

  /** the reference: standing, before the attempt */
  S.ref = () => {
    const h = dev.hero(); const ms = live(h); const body = ms.find(isBody); if (!body) return { error: 'no Body mesh visible' }; BODY = body;
    const B = skin(body, true);
    const bodySkel = body.skeleton; const bodyNodes = new Map(bodySkel.bones.map((b) => [b.name, b.getTransformNode()]));
    const Gs = [];
    // skin check: the fast skin against Babylon's own CPU skin
    { const pd = body.getPositionData(true, true), W = body.getWorldMatrix().m; let d = 0; for (let i = 0; i < pd.length; i += 3) { const x = pd[i] * W[0] + pd[i + 1] * W[4] + pd[i + 2] * W[8] + W[12], y = pd[i] * W[1] + pd[i + 1] * W[5] + pd[i + 2] * W[9] + W[13], z = pd[i] * W[2] + pd[i + 1] * W[6] + pd[i + 2] * W[10] + W[14]; d = Math.max(d, Math.abs(x - B.P[i]), Math.abs(y - B.P[i + 1]), Math.abs(z - B.P[i + 2])); } S.marks.push({ t: performance.now(), msg: `[SKIN] fast skin vs getPositionData on ${body.name}: max diff ${d.toFixed(5)} m` }); }
    const bodyGrid = grid(B.P, 0.08);
    for (const m of ms.filter(isGarment)) {
      const { ind } = geo(m); const cur = skin(m, true); const n = cur.P.length / 3;
      // C1 structure
      const linked = m.skeleton.bones.filter((b) => { const tn = b.getTransformNode(); return tn && bodyNodes.get(b.name) === tn; }).length;
      const weighted = !!geo(m).w && !!geo(m).idx;
      // tri adjacency
      const adj = Array.from({ length: n }, () => []); for (let t = 0; t < ind.length; t += 3) { adj[ind[t]].push(t); adj[ind[t + 1]].push(t); adj[ind[t + 2]].push(t); }
      const G = { m, name: m.name.replace(/_c\d+$/, ''), ind, cur, adj, linked, bones: m.skeleton.bones.length, weighted, parent: m.parent, skeleton: m.skeleton };
      // C3 pairing: each garment vertex's nearest body vertex within 8 cm that is skinned to the same bones (weight overlap ≥ 0.5) —
      // nearest-by-distance alone paired the tank's side panel with the hanging arm, which leaves it legitimately on a raise
      const pair = new Int32Array(n).fill(-1), d0 = new Float32Array(n);
      for (let v = 0; v < n; v++) { const x = cur.P[v * 3], y = cur.P[v * 3 + 1], z = cur.P[v * 3 + 2]; const wg = wvec(m, v); let bi = -1, bd = 0.08; for (const b of near(bodyGrid, 0.08, x, y, z)) { const d = Math.hypot(B.P[b * 3] - x, B.P[b * 3 + 1] - y, B.P[b * 3 + 2] - z); if (d < bd && wsim(wg, wvec(body, b)) >= 0.5) { bd = d; bi = b; } } pair[v] = bi; d0[v] = bd; }
      G.pair = pair; G.d0 = d0;
      // C3 gap: each garment vertex's distance to the NEAREST body vertex (any), standing
      G.gap0 = new Float32Array(n); for (let v = 0; v < n; v++) { const x = cur.P[v * 3], y = cur.P[v * 3 + 1], z = cur.P[v * 3 + 2]; let bd = 0.2; for (const b of near(bodyGrid, 0.08, x, y, z)) bd = Math.min(bd, Math.hypot(B.P[b * 3] - x, B.P[b * 3 + 1] - y, B.P[b * 3 + 2] - z)); G.gap0[v] = bd; }
      // C4 edges
      G.edges = edgesOf(ind); G.L0 = new Float32Array(G.edges.length / 2); for (let e = 0; e < G.L0.length; e++) G.L0[e] = len(cur.P, G.edges[e * 2], G.edges[e * 2 + 1]);
      G.prevRatio = null; G.prevP = null;
      Gs.push(G);
    }
    // C2 coverage per SLOT (the shoe upper and its split-off sole are one shoe): body vertices within 4.5 cm of the slot's surface
    // (the tops/shorts are inflated 13/20 mm off the skin), projecting inside one of the triangles around their 4 nearest slot vertices.
    // No weight gate: the thigh under the Hips-weighted short is exactly the skin that pokes out.
    const slots = [];
    // the skin the body still draws (bodyMask drops triangles under a garment): a vertex in no drawn triangle is hidden
    const drawn = new Uint8Array(B.P.length / 3); { const ind = geo(body).ind; for (let i = 0; i < ind.length; i++) drawn[ind[i]] = 1; }
    for (const slot of [...new Set(Gs.map((G) => slotOf(G.m.name)))]) {
      const X = { slot, members: Gs.filter((G) => slotOf(G.m.name) === slot) };
      const g = triGrid(X.members); const cover = [], hiddenCover = []; let proud0 = 0; const under = new Set(); const covered = new Uint8Array(B.P.length / 3);
      const gTo = slot === 'shoes' ? triGrid(X.members, 0.08, 0.08) : null;
      for (let v = 0, nb = B.P.length / 3; v < nb; v++) { let h = slotHit(X, g, B, v); if (gTo && (!h || !h.inside || h.d > 0.045) && toeW(v) >= 0.5) { const h2 = slotHit(X, gTo, B, v); if (h2 && h2.d <= 0.08) h = { ...h2, inside: true, d: 0 }; } if (!h || h.d > 0.045 || !h.inside) continue; if (!drawn[v]) { hiddenCover.push(v); continue; } cover.push(v); if (h.s <= 0.002) under.add(v); covered[v] = 1; if (h.s > 0.006 && h.facing > 0.3) proud0++; }
      // shoes: foot skin that can SHOW is on a drawn triangle whose three corners are all inside the shoe (a strip straddling the collar is the collar's edge)
      const interior = new Set(); if (slot === 'shoes') { const ind = geo(body).ind; for (let t = 0; t < ind.length; t += 3) if (covered[ind[t]] && covered[ind[t + 1]] && covered[ind[t + 2]]) { interior.add(ind[t]); interior.add(ind[t + 1]); interior.add(ind[t + 2]); } }
      X.under = under; X.interior = interior;
      // the bones this garment rides (≥ 0.3 weight on ≥ 5 of its vertices): skin on any other bone passing in front of it (a hand at the shorts) is not a poke
      X.rides = new Set(); { const cnt = {}; for (const G of X.members) { const { idx, w } = geo(G.m); for (let i = 0; i < w.length; i++) if (w[i] >= 0.3) { const bn = G.m.skeleton.bones[idx[i]]?.name; cnt[bn] = (cnt[bn] || 0) + 1; } } for (const [bn, c] of Object.entries(cnt)) if (c >= 5) X.rides.add(bn); }
      X.cover = Int32Array.from(cover); X.hiddenCover = Int32Array.from(hiddenCover); X.proud0 = proud0; slots.push(X);
    }
    const bodyEdges = edgesOf(geo(body).ind); const bL0 = new Float32Array(bodyEdges.length / 2); for (let e = 0; e < bL0.length; e++) bL0[e] = len(B.P, bodyEdges[e * 2], bodyEdges[e * 2 + 1]);
    const nodes = Object.fromEntries(bodySkel.bones.map((b) => [b.name, b.getTransformNode()])); const seg0 = {};
    for (const [a, b] of SEGS) { const na = nodes[a], nb = nodes[b]; if (!na || !nb) continue; na.computeWorldMatrix(true); nb.computeWorldMatrix(true); const pa = na.getAbsolutePosition(), pb = nb.getAbsolutePosition(); seg0[a + '>' + b] = Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z); }
    S.refd = { B0: B.P, nodes, seg0, body, bodySkel, bodyEdges, bL0, bPrevRatio: null, bPrevP: null, Gs, slots, meshCount: ms.length };
    S.info = { mask: body.metadata?.felBodyMask ? { ...body.metadata.felBodyMask.hiddenBySlot, trisBefore: body.metadata.felBodyMask.trisBefore, trisAfter: body.metadata.felBodyMask.trisAfter, measured: body.metadata.felBodyMask.measured, now: { body: [Math.min(...B.P.filter((_, i) => i % 3 === 1)).toFixed(3)], ...Object.fromEntries(Gs.map((G) => [G.name, [Math.min(...G.cur.P.filter((_, i) => i % 3 === 1)).toFixed(3), Math.max(...G.cur.P.filter((_, i) => i % 3 === 1)).toFixed(3)]])) } } : null, body: body.name, verts: B.P.length / 3, garments: Gs.map((G) => ({ name: G.name, verts: G.cur.P.length / 3, tris: G.ind.length / 3, linked: `${G.linked}/${G.bones}`, sameSkeleton: G.skeleton === bodySkel, weighted: G.weighted, paired: [...G.pair].filter((x) => x >= 0).length, fix: G.m.metadata?.felGarmentFix ?? null })), slots: slots.map((X) => ({ slot: X.slot, meshes: X.members.map((G) => G.name), covered: X.cover.length, hidden: X.hiddenCover.length, proudAtRef: X.proud0 })) };
    return S.info;
  };

  const measure = () => {
    const R = S.refd; const h = dev.hero(); const body = R.body;
    const B = skin(body, true);
    const row = { garments: [], body: null };
    const rid = scene.getRenderId();
    R.frameGrid = grid(B.P, 0.08);
    for (const G of R.Gs) {
      const m = G.m;
      const vis = !m.isDisposed() && m.isEnabled() && m.isVisible, sameParent = m.parent === G.parent, sameSkel = m.skeleton === G.skeleton;
      const linkedNow = m.skeleton ? m.skeleton.bones.filter((b) => { const tn = b.getTransformNode(); const bb = R.bodySkel.bones.find((x) => x.name === b.name); return tn && bb && bb.getTransformNode() === tn; }).length : 0;
      G.cur = skin(m, true); const P = G.cur.P, n = P.length / 3;
      // C3
      const drift = []; for (let v = 0; v < n; v++) { const b = G.pair[v]; if (b < 0) continue; drift.push(Math.abs(Math.hypot(P[v * 3] - B.P[b * 3], P[v * 3 + 1] - B.P[b * 3 + 1], P[v * 3 + 2] - B.P[b * 3 + 2]) - G.d0[v])); }
      drift.sort((a, b) => a - b); const p95 = drift.length ? drift[Math.floor(drift.length * 0.95)] : 0, dMax = drift.at(-1) ?? 0;
      // detach = the garment OPENS AWAY from the body: growth of each vertex's distance to the nearest body vertex (sliding along the skin is not a detach)
      const gaps = []; let gapMax = 0, gapBone = ''; for (let v = 0; v < n; v++) { const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2]; let bd = 0.2; for (const b of near(R.frameGrid, 0.08, x, y, z)) bd = Math.min(bd, Math.hypot(B.P[b * 3] - x, B.P[b * 3 + 1] - y, B.P[b * 3 + 2] - z)); const gg = bd - G.gap0[v]; gaps.push(gg); if (gg > gapMax) { gapMax = gg; gapBone = boneOf(m, v); } }
      gaps.sort((a, b) => a - b); const gap95 = gaps[Math.floor(gaps.length * 0.95)] ?? 0;
      // C4 edges + one-frame pops (relative to the paired body vertex)
      const ratio = new Float32Array(G.L0.length); let rMax = 0, rMin = 9, rEdge = -1, jump = 0, jEdge = -1, spikes = 0, jumps = 0, elong = 0;
      for (let e = 0; e < ratio.length; e++) { if (G.L0[e] < EDGE_FLOOR) { ratio[e] = 1; continue; } const L = len(P, G.edges[e * 2], G.edges[e * 2 + 1]), r = L / G.L0[e]; if (r > rMax) { rMax = r; rEdge = e; } if (r < rMin) rMin = r; if (L - G.L0[e] > elong) elong = L - G.L0[e];
        // stretch the BODY under it did not make: the edge's ratio over its paired body vertices' own ratio (the armhole opens with the armpit)
        const pa = G.pair[G.edges[e * 2]], pb = G.pair[G.edges[e * 2 + 1]]; let brRaw = 1; if (pa >= 0 && pb >= 0 && pa !== pb) { const l0 = len(R.B0, pa, pb); if (l0 > EDGE_FLOOR) brRaw = len(B.P, pa, pb) / l0; } const br = Math.max(1, brRaw);
        if (r / br > 1.6 && L - G.L0[e] * br > 0.015) spikes++;
        // the one-frame change of the stretch the body under it did not make (a fast arm swing moves the armhole with the armpit)
        ratio[e] = r / Math.max(0.05, brRaw);
        if (G.prevRatio) { const j = Math.abs(ratio[e] - G.prevRatio[e]); if (j > jump) { jump = j; jEdge = e; } if (j > 0.25 && j * G.L0[e] > 0.015) jumps++; } }
      let pop = 0, popBone = '';
      if (G.prevP && R.bPrevP) for (let v = 0; v < n; v++) { const b = G.pair[v]; if (b < 0) continue; const gx = P[v * 3] - G.prevP[v * 3], gy = P[v * 3 + 1] - G.prevP[v * 3 + 1], gz = P[v * 3 + 2] - G.prevP[v * 3 + 2]; const bx = B.P[b * 3] - R.bPrevP[b * 3], by = B.P[b * 3 + 1] - R.bPrevP[b * 3 + 1], bz = B.P[b * 3 + 2] - R.bPrevP[b * 3 + 2]; const d = Math.hypot(gx - bx, gy - by, gz - bz); if (d > pop) { pop = d; popBone = boneOf(m, v); } }
      G.prevRatio = ratio; G.prevP = P;
      row.garments.push({ name: G.name, active: m._renderId === rid, vis, sameParent, sameSkel, linked: linkedNow, p95: +p95.toFixed(4), dMax: +dMax.toFixed(4), gap95: +gap95.toFixed(4), gapMax: +gapMax.toFixed(4), gapBone, spikes, jumps, elong: +elong.toFixed(4), rMax: +rMax.toFixed(3), rMin: +rMin.toFixed(3), rBone: rEdge >= 0 ? boneOf(m, G.edges[rEdge * 2]) : '', jump: +jump.toFixed(3), jBone: jEdge >= 0 ? boneOf(m, G.edges[jEdge * 2]) : '', pop: +pop.toFixed(4), popBone });
    }
    // C2 per slot: a covered body vertex standing proud of the slot's surface, while still within 4 cm of it
    row.slots = R.slots.map((X) => { let pokes = 0, poke10 = 0, pokeMax = 0, pokeBone = ''; const pokeBones = {}; const g = triGrid(X.members); const gTo = X.slot === 'shoes' ? triGrid(X.members, 0.08, 0.08) : null;
      for (const v of X.cover) { let h = slotHit(X, g, B, v); if (gTo && (!h || !h.inside || h.d > 0.045)) h = slotHit(X, gTo, B, v) ?? h;
        // a poke faces the way the garment faces (the inner arm beside the torso faces INTO the tank — not a poke)
        // an arm in front of the tank is not a poke: forearm/hand skin never counts, and upper-arm skin only where the garment itself rides that arm (the strap)
        let armOk = true; if (h && X.slot === 'tops') { const bn0 = boneOf(body, v); if (/ForeArm|Hand/.test(bn0)) armOk = false; else if (/Arm$/.test(bn0)) { const Gm = X.members[h.gi]; const wg = wvec(Gm.m, Gm.ind[h.t]); armOk = (wg[bn0] || 0) >= 0.3; } }
        // shoes: the boot has an inner lining (normals facing the foot), so front/back is meaningless there — any FOOT skin still drawn inside it counts
        const footInShoe = X.slot === 'shoes' && h && ((h.inside && h.d < 0.045 && footW(v) >= 0.05) || (h.d <= 0.08 && toeW(v) >= 0.5));
        if (X.slot !== 'shoes' && !X.rides.has(boneOf(body, v))) continue;
        // a poke is skin that was UNDER the garment standing and now stands proud of it (a limb already beside it standing is a separate surface)
        if (X.slot === 'shoes' ? (footInShoe && X.interior.has(v)) : (X.under.has(v) && armOk && h && h.inside && h.d < 0.045 && h.s > 0.006 && h.facing > 0.3)) { pokes++; if (h.s > 0.01) poke10++; const bn = boneOf(body, v); pokeBones[bn] = (pokeBones[bn] || 0) + 1; if (h.s > pokeMax) { pokeMax = h.s; pokeBone = bn; } } }
      // a hidden vertex no longer under its garment is a hole into the body
      const gw = triGrid(X.members, 0.12, 0.08);
      let exposed = 0; const exposedBones = {}; for (const v of X.hiddenCover) { const h = slotHit(X, gw, B, v); if (h && h.inside && h.d < 0.12 && (X.slot === 'shoes' || !(h.s > 0.006 && h.facing < -0.3))) continue; exposed++; const bn = boneOf(body, v); exposedBones[bn] = (exposedBones[bn] || 0) + 1; }
      return { slot: X.slot, pokes, poke10, pokeMax: +pokeMax.toFixed(4), pokeBone, pokeBones, exposed, exposedBones }; });
    // the body's own edges (limb noodle)
    { let rMax = 0, rEdge = -1, jump = 0, jEdge = -1, spikes = 0, jumps = 0; const ratio = new Float32Array(R.bL0.length);
      for (let e = 0; e < ratio.length; e++) { if (R.bL0[e] < EDGE_FLOOR) { ratio[e] = 1; continue; } const L = len(B.P, R.bodyEdges[e * 2], R.bodyEdges[e * 2 + 1]), r = L / R.bL0[e]; ratio[e] = r; if (r > rMax) { rMax = r; rEdge = e; } if (r > 1.6 && L - R.bL0[e] > 0.015) spikes++; if (R.bPrevRatio) { const j = Math.abs(r - R.bPrevRatio[e]); if (j > jump) { jump = j; jEdge = e; } if (j > 0.25 && j * R.bL0[e] > 0.015) jumps++; } }
      R.bPrevRatio = ratio; row.body = { spikes, jumps, rMax: +rMax.toFixed(3), rBone: rEdge >= 0 ? boneOf(body, R.bodyEdges[rEdge * 2]) : '', jump: +jump.toFixed(3), jBone: jEdge >= 0 ? boneOf(body, R.bodyEdges[jEdge * 2]) : '' }; }
    R.bPrevP = B.P;
    row.bodyActive = body._renderId === rid;
    // limb segments (noodle): joint-to-joint world distance over the standing length
    // bone snaps: each bone's local rotation change since the last sampled frame (a crossfade pop turns a joint in one frame)
    { let snap = 0, snapBone = ''; R.prevQ ??= {}; for (const [name, n] of Object.entries(R.nodes)) { if (!n) continue; const q = n.rotationQuaternion; if (!q) continue; const pq = R.prevQ[name]; if (pq) { const d = Math.min(1, Math.abs(q.x * pq[0] + q.y * pq[1] + q.z * pq[2] + q.w * pq[3])); const ang = 2 * Math.acos(d) * 180 / Math.PI; if (ang > snap) { snap = ang; snapBone = name; } } R.prevQ[name] = [q.x, q.y, q.z, q.w]; } row.snap = { deg: +snap.toFixed(1), bone: snapBone }; }
    { let worst = 0, seg = ''; for (const [a, b] of SEGS) { const na = R.nodes[a], nb = R.nodes[b]; if (!na || !nb) continue; const pa = na.getAbsolutePosition(), pb = nb.getAbsolutePosition(); const L = Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z), r = Math.abs(L / R.seg0[a + '>' + b] - 1); if (r > worst) { worst = r; seg = a + '>' + b; } } row.limb = { dev: +worst.toFixed(4), seg }; }
    row.meshCount = live(h).length;
    return row;
  };

  S.debugSlot = (slot) => { const R = S.refd; const B = skin(R.body, true); for (const G of R.Gs) G.cur = skin(G.m, true); const X = R.slots.find((x) => x.slot === slot); const g = triGrid(X.members);
    const hist = { sNeg: 0, s0_6: 0, s6_15: 0, s15up: 0, facePos: 0, faceNeg: 0, notInside: 0, far: 0, none: 0 };
    for (const v of X.cover) { const h = slotHit(X, g, B, v); if (!h) { hist.none++; continue; } if (!h.inside) { hist.notInside++; continue; } if (h.d > 0.045) { hist.far++; continue; } if (h.s < 0) hist.sNeg++; else if (h.s < 0.006) hist.s0_6++; else if (h.s < 0.015) hist.s6_15++; else hist.s15up++; if (h.facing > 0.3) hist.facePos++; else hist.faceNeg++; }
    // the garment normals vs the direction away from the body's centre of the covered region
    const G = X.members[0]; const P = G.cur.P, N = G.cur.N; let cx = 0, cy = 0, cz = 0; for (const v of X.cover) { cx += B.P[v * 3]; cy += B.P[v * 3 + 1]; cz += B.P[v * 3 + 2]; } cx /= X.cover.length; cy /= X.cover.length; cz /= X.cover.length;
    let out = 0, inn = 0; for (let v = 0; v < P.length / 3; v++) { const d = (P[v * 3] - cx) * N[v * 3] + (P[v * 3 + 2] - cz) * N[v * 3 + 2]; if (d > 0) out++; else inn++; }
    return { covered: X.cover.length, hist, garmentNormalsOutward: out, inward: inn, backFaceCulling: G.m.material?.backFaceCulling, sideOrientation: G.m.material?.sideOrientation, overrideSide: G.m.overrideMaterialSideOrientation, det: G.m.getWorldMatrix().determinant() }; };
  let gridArmed = '';
  scene.onAfterRenderObservable.add(() => {
    if (S.frozen) return;
    if (gridArmed) { S.frozen = gridArmed; gridArmed = ''; S.loops = [...(eng._activeRenderLoops ?? [])]; eng.stopRenderLoop(); return; }
    const pad = window.__PAD, d = S.drv;
    const pp = dev.dunkPosture?.get?.(); if (!pp) return;
    if (!d.done && pp.phase === 'cinematic' && (pp.clipTime ?? 0) >= d.slamAt && d.frames === 0) { pad.buttons[0].pressed = true; pad.buttons[0].value = 1; pad.timestamp = performance.now(); d.frames = 5; }
    else if (d.frames > 0) { d.frames--; if (d.frames === 0) { pad.buttons[0].pressed = false; pad.buttons[0].value = 0; pad.timestamp = performance.now(); d.done = true; } }
    if (!S.on || !S.refd) return;
    const prev = S.rows.at(-1);
    const row = { t: performance.now(), phase: pp.phase, clipTime: pp.clipTime ?? 0, replaying: !!pp.replaying, jamContact: !!pp.jamContact, ...measure() };
    S.rows.push(row); if (S.rows.length > 4000) S.rows.splice(0, 1000);
    if (S.shots && !gridArmed) {
      const beat = (k, cond) => { if (cond && !S.shotsDone[k]) { S.shotsDone[k] = row.t; S.setGrid(true); gridArmed = k; } };
      beat('stand', row.phase !== 'cinematic' && row.phase !== 'resolve' && !S.shotsDone.launch && !row.replaying);
      beat('launch', row.phase === 'cinematic' && row.clipTime > 0.35 && !row.replaying);
      beat('tuck', row.phase === 'cinematic' && row.clipTime > 0.68 && !row.replaying);
      beat('contact', row.jamContact && prev && !prev.jamContact && !row.replaying);
      beat('hang', !!S.shotsDone.contact && row.t > S.shotsDone.contact + 350 && !row.replaying);
      beat('land', !!S.shotsDone.hang && row.phase === 'resolve' && dev.hero().position.y < 0.08 && !row.replaying);
    }
  });

  // SHOTS: game camera + three closeups on the torso (front / side / back-low)
  const VP = scene.activeCamera.viewport.constructor, P3 = scene.activeCamera.position.constructor;
  const mkCam = (name, vp) => { const c = scene.activeCamera.clone(name); c.viewport = vp; c.minZ = 0.02; c.fov = 0.55; if (c.rotationQuaternion) c.rotationQuaternion = null; if (c.inputs) c.inputs.clear(); return c; };
  S.setGrid = (on) => {
    if (on) {
      if (!S.grid) { S.gameCam = scene.activeCamera; S.grid = { a: mkCam('cla_a', new VP(0.5, 0.5, 0.5, 0.5)), b: mkCam('cla_b', new VP(0, 0, 0.5, 0.5)), c: mkCam('cla_c', new VP(0.5, 0, 0.5, 0.5)) }; }
      S.gameCam = scene.activeCamera.name.startsWith('cla_') ? S.gameCam : scene.activeCamera; S.gameVp = S.gameCam.viewport; S.gameCam.viewport = new VP(0, 0.5, 0.5, 0.5);
      const aim = S.refd.bodySkel.bones.find((b) => b.name === (S.aim || 'Spine1')).getTransformNode(); aim.computeWorldMatrix(true); const c = aim.getAbsolutePosition().clone(); const D = S.aimDist || 1.9; if (S.aim && /Foot|Leg/.test(S.aim)) c.x += 0; 
      const h = dev.hero(); const f = h.getDirection(new P3(0, 0, 1));
      const g = S.grid;
      const oy = S.aim && /Foot|Leg/.test(S.aim) ? 0 : 0.1;
      g.a.position.set(c.x + f.x * D, c.y + oy * 2, c.z + f.z * D); g.a.setTarget(new P3(c.x, c.y - oy, c.z));
      g.b.position.set(c.x - f.z * D, c.y + oy, c.z + f.x * D); g.b.setTarget(new P3(c.x, c.y - oy, c.z));
      g.c.position.set(c.x - f.x * D, c.y - oy * 5, c.z - f.z * D); g.c.setTarget(new P3(c.x, c.y - oy * 2, c.z));
      scene.activeCameras = [S.gameCam, g.a, g.b, g.c];
    } else if (S.grid) { scene.activeCameras = []; S.gameCam.viewport = S.gameVp; scene.activeCamera = S.gameCam; }
  };
  S.thaw = () => { S.setGrid(false); S.frozen = ''; if (S.loops) { for (const fn of S.loops) eng.runRenderLoop(fn); S.loops = null; } };
  S.shotsDone = {};
})();
