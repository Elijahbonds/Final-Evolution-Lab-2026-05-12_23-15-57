#!/usr/bin/env -S npx tsx
// VENICE HUB PHONE BUDGET GUARD (lane/venice-v1, 2026-11-17) — the hoops-p08 approach (scripts/hoops-phone-budget-tests.ts) for the
// Venice hub's PLACE: no browser, deterministic, it reads files and calls the shipped rules.
//
// WHAT IT HOLDS.
//   * THE COURTS. The four courts are ONE court mesh drawn as instances (lib/adventure/venice/courtsView.ts VENICE_SHARED_COURT).
//     The painted court itself was never duplicated (visual/CourtSurface caches it per scene); what each separate court mesh added
//     was its own material and asphalt detail map (applyFloorDetailToMesh, 512²): +3 textures, about 4 MB, measured on the phone
//     rig (scripts/probes/venice-hub/hub-rig.mts: 73 MB shared, 77 MB unshared). The plan's earlier "22 MB" estimate was wrong.
//   * THE PLACE'S TEXTURE MEMORY on a phone: every image in every GLB the courts view loads, at the size a phone uploads it
//     (scene/phoneTextureCap phoneCapFor), RGBA with mips (× 1.33) — the hoop, the Venice dressing's palms and boardwalk kit — plus
//     its procedural textures (the painted court once at the phone's 1024², an asphalt detail map per court MESH at 512², three
//     tiled grounds at 512², a sign per court at 512 × 128).
//     Held to PLACE_TEX_MB (computed today, + 5 %) and inside the hub's mobileBudget.json row.
//   * THE FILE LIST. The view's GLBs are pinned: adding a model, a LOD or the crowd strip fails here first.
// Draw calls and active meshes are held by the measured row (scripts/mobile-budget-tests.ts; the browser rig
// scripts/probes/venice-hub/hub-rig.mts measures them).
// ITS OWN CONTROL: the same place with the courts unshared (a mesh, material and detail map per court, perf.veniceSharedCourt 0) must come out OVER
// PLACE_TEX_MB. A guard that cannot see the regression it was built for fails.
//
//   npx tsx scripts/venice-hub-budget-tests.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { phoneTexMbOf } from './hoops-phone-budget-tests';
import { VENICE_ENV2_DIR, VENICE_PALM_LODS } from '../lib/babylon/visual/venuePropSets';
import { MESHY_DIR } from '../lib/babylon/visual/meshyProps';
import { PHONE_MODEL_TEXTURE_MAX, PHONE_FAR_PROP_MAX } from '../lib/babylon/scene/phoneTextureCap';
import { VENICE_SHARED_COURT } from '../lib/adventure/venice/courtsView';
import { v1Spots } from '../lib/adventure/venice/hubWorld';

let failed = 0, passed = 0;
const ok = (c: boolean, msg: string) => { if (c) passed++; else { failed++; console.error(`  ✗ ${msg}`); } };
const MB = 1048576;

/** The GLBs the courts view loads (courtsView: the hoop per court, mountVeniceDunkDressing with crowdCards false). */
export const PLACE_GLBS: readonly string[] = [
  `${MESHY_DIR}hoop.glb`,
  ...VENICE_PALM_LODS.files.map((f) => `${VENICE_ENV2_DIR}${f}`),
  `${VENICE_ENV2_DIR}venice_boardwalk_kit.glb`,
];
/** The place's texture MB on a phone, computed today with the paint shared (+ 5 %). */
export const PLACE_TEX_MB = 43;

/** Pure: the place's texture MB on a phone when the courts are drawn by `courtMeshes` meshes (1 shared, 4 unshared). */
export function placeTexMb(courtMeshes: number): { total: number; glb: number; procedural: number } {
  const glb = PLACE_GLBS.reduce((s, u) => s + phoneTexMbOf(u, PHONE_FAR_PROP_MAX), 0);
  const tex = (w: number, h: number) => (w * h * 4 * 1.33) / MB;
  const courts = v1Spots().length;
  const procedural = tex(PHONE_MODEL_TEXTURE_MAX, PHONE_MODEL_TEXTURE_MAX) + courtMeshes * tex(512, 512) + 3 * tex(512, 512) + courts * tex(512, 128);
  return { total: glb + procedural, glb, procedural };
}

const isMain = (() => { try { return resolve(process.argv[1] ?? '') === resolve(new URL(import.meta.url).pathname); } catch { return false; } })();
if (isMain) {
  const courts = v1Spots().length;
  const meshes = VENICE_SHARED_COURT >= 0.5 ? 1 : courts;
  const now = placeTexMb(meshes);
  const control = placeTexMb(courts);
  const row = JSON.parse(readFileSync(resolve(__dirname, '../lib/babylon/config/mobileBudget.json'), 'utf8')).modes?.venice_hub;
  console.log(`venice hub place on a phone: ${now.total.toFixed(1)} MB (GLBs ${now.glb.toFixed(1)}, procedural ${now.procedural.toFixed(1)}), ${meshes} court mesh for ${courts} courts; unshared: ${control.total.toFixed(1)} MB`);

  ok(courts === 4, `V1 opens four courts (got ${courts})`);
  ok(VENICE_SHARED_COURT === 1, 'perf.veniceSharedCourt ships at 1: one court mesh for the four');
  ok(meshes === 1, `one court mesh, drawn as instances (got ${meshes})`);
  ok(now.total <= PLACE_TEX_MB, `the place's phone texture memory ${now.total.toFixed(1)} MB is within PLACE_TEX_MB ${PLACE_TEX_MB}`);
  ok(PLACE_TEX_MB <= Math.ceil(now.total * 1.05) + 1, `PLACE_TEX_MB ${PLACE_TEX_MB} is the measurement + 5 %, not a raise (computed ${now.total.toFixed(1)})`);
  ok(control.total > PLACE_TEX_MB, `CONTROL: a mesh and detail map per court (${control.total.toFixed(1)} MB) is over PLACE_TEX_MB — the guard sees the regression it guards`);
  ok(PLACE_GLBS.length === 5 && !PLACE_GLBS.some((u) => /crowd_cards/.test(u)), 'the view loads five GLBs: the hoop, three palm LODs, the boardwalk kit (no crowd strip)');
  ok(!!row, 'the hub has a row in lib/babylon/config/mobileBudget.json (venice_hub)');
  if (row) ok(now.total <= row.budget.textureMb, `the place's textures fit inside the hub's whole-scene texture budget (${row.budget.textureMb} MB)`);

  console.log(`\nvenice-hub-budget: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}
