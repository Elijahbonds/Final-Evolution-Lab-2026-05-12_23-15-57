#!/usr/bin/env -S npx tsx
/**
 * scripts/kit-fit-tests.ts — THE CLOTHES ARE FITTED TO THE BODY, AND THE RIG DID NOT MOVE (lane/kit-fit, owner 2026-11-12:
 * "We need to fix how the clothes fit, how they look"; the three clothing art jobs approved the same day). docs/KIT-FIT-PLAN.md.
 *
 * Reads the shipped files themselves (no Babylon): the two kit bodies and their phone files, the 24 forge rivals and the
 * football jersey pack.
 *   · GATE 0 — every node, skin, inverse bind and animation channel of each file has the fingerprint it had BEFORE the rebake
 *     (glb.rigPrint, pinned below from the pre-rebake files: a rebake that moves a bone fails here).
 *   · The phone file's garments are the desktop file's, vertex for vertex.
 *   (kit-fit-a ships no rebaked file: the jersey refit, the rivals' tees and job 3 each measured worse on the browser rig and stay
 *   on lane/kit-fit, with their tests — docs/KIT-FIT-PLAN.md §10. These pins guard the next rebake.)
 * The posed proof (tears, floats, skin through cloth) is scripts/kit-glitch-tests.ts and the browser rig (scripts/probes/kit-fit).
 *
 * Run: npx tsx scripts/kit-fit-tests.ts
 */
import assert from 'node:assert';
import { resolve } from 'node:path';
import { readGlb, restPrims, rigPrint } from './avatar/kit-fit/glb';

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

function main(): void {
  let pass = 0;
  const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

  ok('GATE 0: every file a kit-fit rebake may touch keeps the rig it had (nodes, skins, inverse binds, animations)', () => {
    for (const [f, want] of Object.entries(RIG)) assert.equal(rigPrint(readGlb(`${PUB}/${f}`)).slice(0, 16), want, `${f}: the rig fingerprint changed`);
  });

  ok('the phone files carry the desktop files\' garments, vertex for vertex', () => {
    for (const f of KITS) {
      const d = restPrims(readGlb(`${PUB}/${f}`)).filter((p) => /^Kit_/.test(p.name)), m = restPrims(readGlb(`${PUB}/${f.replace('.glb', '.mobile.glb')}`)).filter((p) => /^Kit_/.test(p.name));
      assert.equal(m.length, d.length, `${f}: garment count`);
      d.forEach((p, i) => { assert.deepEqual([...m[i].p0], [...p.p0], `${f} ${p.name}: positions differ on the phone`); assert.deepEqual([...m[i].W], [...p.W], `${f} ${p.name}: weights differ`); });
    }
  });

  console.log(`kit-fit-tests: ${pass} passed`);
}

main();
