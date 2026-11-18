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
//     tiled grounds at 512², a sign per court at 512 × 128). Improvement pass (2026-11-17): with the park furniture on
//     (venue.veniceLookV2) the four signs become ONE name-board atlas (512 × 128 a court, BOARD_ROW: the same bytes) plus the
//     chain-link weave (128²); the gulls (venue.veniceLife) add one 64² sprite. The watchers are desktop-only (no phone texture).
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
import { BOARD_ROW, VENICE_LOOK_V2 } from '../lib/adventure/venice/courtsDressing';
import { VENICE_LIFE, GULLS } from '../lib/adventure/venice/hubLife';

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
export function placeTexMb(courtMeshes: number, o: { look2?: boolean; life?: boolean } = {}): { total: number; glb: number; procedural: number } {
  const look2 = o.look2 ?? VENICE_LOOK_V2 >= 0.5, life = o.life ?? VENICE_LIFE >= 0.5;
  const glb = PLACE_GLBS.reduce((s, u) => s + phoneTexMbOf(u, PHONE_FAR_PROP_MAX), 0);
  const tex = (w: number, h: number) => (w * h * 4 * 1.33) / MB;
  const courts = v1Spots().length;
  const names = look2 ? tex(BOARD_ROW.w, BOARD_ROW.h * courts) + tex(128, 128) : courts * tex(512, 128);
  const procedural = tex(PHONE_MODEL_TEXTURE_MAX, PHONE_MODEL_TEXTURE_MAX) + courtMeshes * tex(512, 512) + 3 * tex(512, 512) + names + (life ? tex(64, 64) : 0);
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
  const v1 = placeTexMb(meshes, { look2: false, life: false });
  console.log(`  V1's look and an empty park: ${v1.total.toFixed(1)} MB; the improvement pass adds ${(now.total - v1.total).toFixed(2)} MB`);
  ok(now.total - v1.total < 0.5, `the furniture and the gulls add under 0.5 MB of phone textures (${(now.total - v1.total).toFixed(2)} MB): the name boards cost what V1's signs did`);
  ok(GULLS.phone <= 3, `a phone flies at most three gulls (got ${GULLS.phone})`);
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
