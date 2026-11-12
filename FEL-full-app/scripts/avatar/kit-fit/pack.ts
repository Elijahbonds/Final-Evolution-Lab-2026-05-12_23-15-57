// KIT-FIT: refit a kit PACK top (the football jersey) to the kit bodies (approved job 2, owner 2026-11-12: "the football jersey
// on the player's own body: the shorts show through its lower front").
//
//   npx tsx scripts/avatar/kit-fit/pack.ts <pack.glb> <out.glb> <body.glb>…
//
// MEASURED (scripts/avatar/kit-fit/_pack.ts): on the male kit 41–45 % of the jersey's outward-facing surface between 1.10 and
// 1.30 m sat UNDER the skin (its quarter point 32 mm in), and its lower band sat under the short's waistband, so the short
// showed through the jersey's lower front in patches. The jersey is a thick Meshy shell (an outer and an inner wall), and it is
// one file for both kit bodies (kit.ts keeps one template per pack per scene), so:
//   1. per body, every OUTWARD-facing vertex (its normal agrees with the skin's) that stands less than the ease off the skin
//      wants a push out along the skin's normal: EASE above the waist band, WAIST_EASE in it (over the short's 20 mm lift);
//   2. the push is spread to every vertex within SPREAD (both walls of the shell move together, so the shell keeps its
//      thickness and never turns inside out), as a dilated-then-averaged field;
//   3. the larger push of the two bodies wins (one file fits both: on the smaller body it is a little looser);
//   4. the world push becomes a bind-space offset through each vertex's own rest skin (the pack's inverse binds under the
//      body's joints, as kit.ts links them at runtime).
// The runtime still lifts a pack top by GARMENT_INFLATE.tops (13 mm) once on its template, so the eases here are what stands
// UNDER that lift. The rig and everything else keep their bytes (glb.ts; rigPrint / untouchedPrint checked).
import { readGlb, writeGlb, nodeWorlds, readAccessor, mul, blend, invert, appendAccessor, rigPrint, untouchedPrint, restPrims, type M4 } from './glb';
import { BodySurface } from './surface';

/** Metres the jersey's outer wall stands off the skin under the runtime's 13 mm lift, above the waist band and in it. NEW. */
export const PACK_FIT = { ease: 0.004, waistEase: 0.022, waistBand: 0.14, spread: 0.025, facing: 0.2 } as const;

export function fitPack(packPath: string, outPath: string, bodyPaths: string[], cfg = PACK_FIT): Record<string, unknown> {
  const pack = readGlb(packPath);
  const rig0 = rigPrint(pack);
  const pn = (pack.json.nodes as { mesh?: number; skin?: number; name: string }[]).find((n) => n.mesh != null && n.skin != null)!;
  const skin = pack.json.skins[pn.skin!], ibm = readAccessor(pack, skin.inverseBindMatrices);
  const primIdx = 0, prim = pack.json.meshes[pn.mesh!].primitives[primIdx];
  const untouched0 = untouchedPrint(pack, new Set([`${pn.mesh}:${primIdx}`]));
  const p0 = readAccessor(pack, prim.attributes.POSITION), n0 = readAccessor(pack, prim.attributes.NORMAL);
  const J = readAccessor(pack, prim.attributes.JOINTS_0), Wt = readAccessor(pack, prim.attributes.WEIGHTS_0);
  const nv = p0.length / 3, best = new Float32Array(nv * 3), bestLen = new Float32Array(nv);
  const report: Record<string, unknown> = { verts: nv };
  for (const bp of bodyPaths) {
    const bg = readGlb(bp), body = restPrims(bg).find((p) => p.name === 'Body')!;
    const W = nodeWorlds(bg), byName = new Map((bg.json.nodes as { name: string }[]).map((n, i) => [n.name, i] as const));
    const skinM: M4[] = (skin.joints as number[]).map((j, k) => mul(W[byName.get(pack.json.nodes[j].name)!], ibm.subarray(k * 16, k * 16 + 16)));
    const hipY = W[byName.get('Hips')!][13];
    const surf = new BodySurface(body.P, body.N, body.ind);
    // rest world positions and normals under this body's joints
    const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), M = new Array<M4>(nv);
    for (let v = 0; v < nv; v++) {
      const m = M[v] = blend(skinM, J, Wt, v), x = p0[v * 3], y = p0[v * 3 + 1], z = p0[v * 3 + 2], a = n0[v * 3], b = n0[v * 3 + 1], c = n0[v * 3 + 2];
      P[v * 3] = m[0] * x + m[4] * y + m[8] * z + m[12]; P[v * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; P[v * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      const nx = m[0] * a + m[4] * b + m[8] * c, ny = m[1] * a + m[5] * b + m[9] * c, nz = m[2] * a + m[6] * b + m[10] * c, l = Math.hypot(nx, ny, nz) || 1;
      N[v * 3] = nx / l; N[v * 3 + 1] = ny / l; N[v * 3 + 2] = nz / l;
    }
    // 1. the push each outward-facing vertex wants (world vector)
    const want = new Float32Array(nv * 3); let pushed = 0, under = 0, outward = 0;
    for (let v = 0; v < nv; v++) {
      const h = surf.closest(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], 0.15); if (!h) continue;
      if (N[v * 3] * h.n[0] + N[v * 3 + 1] * h.n[1] + N[v * 3 + 2] * h.n[2] < cfg.facing) continue;
      outward++; if (h.signed < 0) under++;
      const ease = P[v * 3 + 1] < hipY + cfg.waistBand ? cfg.waistEase : cfg.ease, need = ease - h.signed;
      if (!(need > 0)) continue;
      for (let k = 0; k < 3; k++) want[v * 3 + k] = h.n[k] * need; pushed++;
    }
    // 2. spread: each vertex takes the mean of the largest pushes within `spread` (dilate, then average), so both walls move
    const C = cfg.spread, grid = new Map<string, number[]>();
    for (let v = 0; v < nv; v++) { if (!(want[v * 3] || want[v * 3 + 1] || want[v * 3 + 2])) continue; const k = `${Math.floor(P[v * 3] / C)},${Math.floor(P[v * 3 + 1] / C)},${Math.floor(P[v * 3 + 2] / C)}`; (grid.get(k) ?? grid.set(k, []).get(k)!).push(v); }
    const field = new Float32Array(nv * 3);
    for (let v = 0; v < nv; v++) {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], ci = Math.floor(x / C), cj = Math.floor(y / C), ck = Math.floor(z / C);
      let bl = 0, sx = 0, sy = 0, sz = 0, sw = 0;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) for (const u of grid.get(`${ci + i},${cj + j},${ck + k}`) ?? []) {
        const d = Math.hypot(P[u * 3] - x, P[u * 3 + 1] - y, P[u * 3 + 2] - z); if (d > C) continue;
        const w = 1 - d / C, l = Math.hypot(want[u * 3], want[u * 3 + 1], want[u * 3 + 2]);
        sx += w * want[u * 3]; sy += w * want[u * 3 + 1]; sz += w * want[u * 3 + 2]; sw += w; bl = Math.max(bl, l);
      }
      if (!(sw > 0)) continue;
      // the averaged direction, at the dilated (largest nearby) length: no wall is left behind its neighbour
      const l = Math.hypot(sx, sy, sz) || 1; field[v * 3] = sx / l * bl; field[v * 3 + 1] = sy / l * bl; field[v * 3 + 2] = sz / l * bl;
    }
    // 3. to bind space; the larger push of the bodies wins
    let maxPush = 0;
    for (let v = 0; v < nv; v++) {
      const l = Math.hypot(field[v * 3], field[v * 3 + 1], field[v * 3 + 2]); if (!(l > 1e-5)) continue;
      maxPush = Math.max(maxPush, l);
      if (l <= bestLen[v]) continue;
      const I = invert(M[v]); bestLen[v] = l;
      for (let k = 0; k < 3; k++) best[v * 3 + k] = I[k] * field[v * 3] + I[4 + k] * field[v * 3 + 1] + I[8 + k] * field[v * 3 + 2];
    }
    report[bp.split('/').pop()!] = { outward, underBefore: +(under / Math.max(1, outward)).toFixed(3), pushed, maxPushMm: +(maxPush * 1000).toFixed(1) };
  }
  const out = new Float32Array(nv * 3); for (let i = 0; i < out.length; i++) out[i] = p0[i] + best[i];
  pack.json.meshes[pn.mesh!].primitives[primIdx] = { ...prim, attributes: { ...prim.attributes, POSITION: appendAccessor(pack, out, 'VEC3', 'float', 34962) } };
  const m = pack.json.meshes[pn.mesh!]; m.extras = { ...(m.extras ?? {}), felKitFit: { v: 1, pack: PACK_FIT } };
  if (rigPrint(pack) !== rig0) throw new Error('GATE 0: the pack rig changed — refusing to write');
  if (untouchedPrint(pack, new Set([`${pn.mesh}:${primIdx}`])) !== untouched0) throw new Error('pack content outside the jersey changed — refusing to write');
  writeGlb(outPath, pack);
  return report;
}

if (require.main === module) {
  const [inP, outP, ...bodies] = process.argv.slice(2);
  console.log(JSON.stringify(fitPack(inP, outP, bodies), null, 1));
}
