#!/usr/bin/env -S npx tsx
/**
 * scripts/kit-fit-tests.ts — THE CLOTHES ARE FITTED TO THE BODY, AND THE RIG DID NOT MOVE (lane/kit-fit, owner 2026-11-12:
 * "We need to fix how the clothes fit, how they look"; the three clothing art jobs approved the same day). docs/KIT-FIT-PLAN.md.
 *
 * Reads the shipped files themselves (no Babylon): the two kit bodies and their phone files, the 24 forge rivals and the
 * football jersey pack, rebaked by scripts/avatar/kit-fit/{bake,pack}.ts.
 *   · GATE 0 — every node, skin, inverse bind and animation channel of each file has the fingerprint it had BEFORE the rebake
 *     (glb.rigPrint, pinned below from the pre-rebake files: a rebake that moves a bone fails here).
 *   · LOOK — the kit body's own tee, short and sock carry real UVs (inside the unit square, few texels shared), so the runtime no
 *     longer cuts them into one cell a triangle (the cracks) and the fabric weave can tile them (the stripes it caused are gone
 *     with the cells). The phone file's garments are the desktop file's, vertex for vertex.
 *   · FIT (job 1) — each leg tube of every short stays on its own side of the body (it crossed ~6 cm into the other leg) and
 *     is never led by the other thigh (26–100 % of it before, on the kit short).
 *   · FIT (job 2) — the football jersey's outer wall stands off both kit bodies' skin at rest (36 % / 26 % of it was under).
 * The posed proof (tears, floats, skin through cloth) is scripts/kit-glitch-tests.ts and the browser rig (scripts/probes/kit-fit).
 *
 * Run: npx tsx scripts/kit-fit-tests.ts
 */
import assert from 'node:assert';
import { resolve } from 'node:path';
import { readGlb, restPrims, rigPrint, nodeWorlds, readAccessor, mul, blend } from './avatar/kit-fit/glb';
import { uvQuality } from './avatar/kit-fit/unwrap';
import { pieces } from './avatar/kit-fit/bake';
import { BodySurface } from './avatar/kit-fit/surface';

const PUB = resolve(__dirname, '../public/models');
/** rigPrint of each file BEFORE the kit-fit rebake (first 16 hex), measured from the files at 87e4b9f0. */
const RIG: Record<string, string> = {
  'candidates/fel-kit-male.glb': 'b7c43e05ca1030fc', 'candidates/fel-kit-female.glb': 'daf00f2a48944996',
  'candidates/fel-kit-male.mobile.glb': 'b7c43e05ca1030fc', 'candidates/fel-kit-female.mobile.glb': 'daf00f2a48944996',
  'kits/top_football.glb': '689fd37291ffb340',
  'rivals/ace.glb': '0413a2a2bc2c713f', 'rivals/blaze.glb': '06d1e70638dece62', 'rivals/bolt.glb': '58cb3d61ad24b895', 'rivals/colt.glb': '08690d2755794d70',
  'rivals/dash.glb': '7822a71b38617038', 'rivals/echo.glb': '37c13f4418217e35', 'rivals/fable.glb': '10c6bc8c9b600ae0', 'rivals/grit.glb': '5264ec2f73166c00',
  'rivals/halo.glb': '1f346ce959203714', 'rivals/jinx.glb': 'ee07bd853285fcf2', 'rivals/kite.glb': '29e5aa06e132940b', 'rivals/lux.glb': '25ad730708314168',
  'rivals/mako.glb': 'a3b3ff4c05558c44', 'rivals/nyx.glb': '8d722545e57df60b', 'rivals/orbit.glb': '32aeb86b391be555', 'rivals/quill.glb': 'e7eda4744041e4a9',
  'rivals/rook.glb': 'c7832162b7f89455', 'rivals/sol.glb': 'e807983cc42443ca', 'rivals/tusk.glb': 'f21f8209a28d73b7', 'rivals/umber.glb': '4eac2234d7c3ce11',
  'rivals/volt.glb': 'ffbae8a54b97e761', 'rivals/wisp.glb': '629211cff8b79b16', 'rivals/yara.glb': '5b76261d0da59bdb', 'rivals/zeal.glb': 'fbffb3bace1a8179',
};
const KITS = ['candidates/fel-kit-male.glb', 'candidates/fel-kit-female.glb'];
/** UV texels shared by two triangles, at most (a cylinder unroll folds a little at the shoulders: measured 6–10 %). */
const UV_OVERLAP_MAX = 0.12;
/** A leg tube's vertex may stand this far past the midline toward the other leg, at most (m): the inner thigh's own skin. */
const LEG_CROSS_MAX = 0.012;
/** The other thigh's weight a leg tube's vertex may carry, at most: it never leads. Measured after the fit: 0.40 at worst, at a
 *  tube's top where the crotch skin itself blends both thighs; before it, whole vertices rode the other thigh (1.00). */
const OTHER_THIGH_MAX = 0.45;
/** The jersey's outer wall under the skin at rest, at most (share of its outward-facing vertices, per kit body). */
const JERSEY_UNDER_MAX = 0.08;

function main(): void {
  let pass = 0;
  const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

  ok('GATE 0: every rebaked file keeps the rig it had (nodes, skins, inverse binds, animations)', () => {
    for (const [f, want] of Object.entries(RIG)) assert.equal(rigPrint(readGlb(`${PUB}/${f}`)).slice(0, 16), want, `${f}: the rig fingerprint changed`);
  });

  ok(`the kit body's tee, short and sock have real UVs (unit square, ≤ ${UV_OVERLAP_MAX * 100} % shared texels)`, () => {
    for (const f of KITS) for (const p of restPrims(readGlb(`${PUB}/${f}`))) {
      if (!(/^Kit_(tops|shorts)_/.test(p.name) || (/^Kit_shoes_/.test(p.name) && p.prim === 1))) continue;
      assert.ok(p.uv, `${f} ${p.name}#${p.prim}: no UVs`);
      const q = uvQuality(p.P, Uint32Array.from({ length: p.P.length / 3 }, (_, i) => i), p.uv!, p.ind, 1);
      assert.ok(q.inUnit, `${f} ${p.name}: UVs outside the unit square`);
      assert.ok(q.overlap <= UV_OVERLAP_MAX, `${f} ${p.name}: ${(q.overlap * 100).toFixed(1)} % of its UV texels shared`);
    }
  });

  ok('the phone files carry the desktop files\' garments, vertex for vertex', () => {
    for (const f of KITS) {
      const d = restPrims(readGlb(`${PUB}/${f}`)).filter((p) => /^Kit_/.test(p.name)), m = restPrims(readGlb(`${PUB}/${f.replace('.glb', '.mobile.glb')}`)).filter((p) => /^Kit_/.test(p.name));
      assert.equal(m.length, d.length, `${f}: garment count`);
      d.forEach((p, i) => { assert.deepEqual([...m[i].p0], [...p.p0], `${f} ${p.name}: positions differ on the phone`); assert.deepEqual([...m[i].W], [...p.W], `${f} ${p.name}: weights differ`); });
    }
  });

  ok(`every short's leg tubes stay on their own side (≤ ${LEG_CROSS_MAX * 1000} mm past the midline) and ride their own thigh (≤ ${OTHER_THIGH_MAX * 100} % of the other)`, () => {
    const files = [...KITS, ...Object.keys(RIG).filter((f) => f.startsWith('rivals/'))];
    for (const f of files) {
      const g = readGlb(`${PUB}/${f}`), W = nodeWorlds(g), at = (n: string) => W[(g.json.nodes as { name: string }[]).findIndex((x) => x.name === n)];
      const L = at('LeftUpLeg'), R = at('RightUpLeg'), mid = (L[12] + R[12]) / 2, hipY = (L[13] + R[13]) / 2, leftSign = Math.sign(L[12] - R[12]);
      for (const p of restPrims(g)) {
        if (!/^Kit_shorts_/.test(p.name)) continue;
        const piece = pieces(p.P, p.ind), sum = new Map<number, [number, number, number]>();
        for (let v = 0; v < p.P.length / 3; v++) { const s = sum.get(piece[v]) ?? [0, 0, 0]; s[0] += p.P[v * 3]; s[1] += p.P[v * 3 + 1]; s[2]++; sum.set(piece[v], s); }
        let tubes = 0;
        for (const [id, [sx, sy, c]] of sum) {
          const cx = sx / c, cy = sy / c; if (!(cy < hipY && Math.abs(cx - mid) > 0.03)) continue;
          tubes++;
          const side = Math.sign(cx - mid) === leftSign ? 1 : -1, other = p.joints.indexOf(side === 1 ? 'RightUpLeg' : 'LeftUpLeg');
          for (let v = 0; v < p.P.length / 3; v++) {
            if (piece[v] !== id) continue;
            const cross = -(p.P[v * 3] - mid) * leftSign * side;
            assert.ok(cross <= LEG_CROSS_MAX, `${f} ${p.name}: a ${side === 1 ? 'left' : 'right'} leg vertex ${(cross * 1000).toFixed(0)} mm into the other leg`);
            let w = 0; for (let k = 0; k < 4; k++) if (p.J[v * 4 + k] === other) w += p.W[v * 4 + k];
            assert.ok(w <= OTHER_THIGH_MAX, `${f} ${p.name}: a ${side === 1 ? 'left' : 'right'} leg vertex carries ${(w * 100).toFixed(0)} % of the other thigh`);
          }
        }
        assert.equal(tubes, 2, `${f} ${p.name}: two leg tubes`);
      }
    }
  });

  ok(`the football jersey stands off both kit bodies (≤ ${JERSEY_UNDER_MAX * 100} % of its outer wall under the skin)`, () => {
    const pack = readGlb(`${PUB}/kits/top_football.glb`);
    const pn = (pack.json.nodes as { mesh?: number; skin?: number }[]).find((n) => n.mesh != null && n.skin != null)!;
    const skin = pack.json.skins[pn.skin!], ibm = readAccessor(pack, skin.inverseBindMatrices), prim = pack.json.meshes[pn.mesh!].primitives[0];
    const p0 = readAccessor(pack, prim.attributes.POSITION), n0 = readAccessor(pack, prim.attributes.NORMAL), J = readAccessor(pack, prim.attributes.JOINTS_0), Wt = readAccessor(pack, prim.attributes.WEIGHTS_0);
    for (const f of KITS) {
      const bg = readGlb(`${PUB}/${f}`), body = restPrims(bg).find((p) => p.name === 'Body')!, W = nodeWorlds(bg);
      const byName = new Map((bg.json.nodes as { name: string }[]).map((n, i) => [n.name, i] as const));
      const skinM = (skin.joints as number[]).map((j, k) => mul(W[byName.get(pack.json.nodes[j].name)!], ibm.subarray(k * 16, k * 16 + 16)));
      const surf = new BodySurface(body.P, body.N, body.ind);
      let outward = 0, under = 0;
      for (let v = 0; v < p0.length / 3; v += 3) {
        const M = blend(skinM, J, Wt, v), x = p0[v * 3], y = p0[v * 3 + 1], z = p0[v * 3 + 2], a = n0[v * 3], b = n0[v * 3 + 1], c = n0[v * 3 + 2];
        const h = surf.closest(M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14], 0.15); if (!h) continue;
        if ((M[0] * a + M[4] * b + M[8] * c) * h.n[0] + (M[1] * a + M[5] * b + M[9] * c) * h.n[1] + (M[2] * a + M[6] * b + M[10] * c) * h.n[2] < 0.2) continue;
        outward++; if (h.signed < 0) under++;
      }
      assert.ok(under / outward <= JERSEY_UNDER_MAX, `${f}: ${(100 * under / outward).toFixed(1)} % of the jersey's outer wall under the skin`);
    }
  });

  console.log(`kit-fit-tests: ${pass} passed`);
}

main();
