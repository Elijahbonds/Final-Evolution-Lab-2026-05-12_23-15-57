#!/usr/bin/env -S npx tsx
// COAST ZONE PHONE BUDGET GUARD (lane/coast-islands, 2026-11-18) — the Venice hub guard's approach (scripts/venice-hub-budget-tests.ts)
// for the Coast & Islands: no browser, deterministic, it reads the zone's data and files and calls the shipped rules.
//
// WHAT IT HOLDS.
//   * THE STREAMING. For EVERY piece a player can stand in, what the zone draws there at the phone's rings (zoneLayout ZoneStreamer,
//     the same class the mode runs, stepped the way a walk steps it): the terrain triangles (a fine 2 m mesh per full-ring piece, a
//     coarse 8 m one elsewhere), the prop instances and their triangles (each model's triangles from its GLB × the instances the
//     ring draws), and the draw calls the place costs (each enabled terrain mesh, each enabled prop master — one per material per
//     model — and the fixed pieces: sea, sea floor, decks, posts, boat, ring, sign). The worst piece is held to PLACE_TRIS and
//     PLACE_DRAWS (computed today, + 5 %).
//   * THE PLACE'S TEXTURE MEMORY on a phone: every image in every GLB the zone loads, at the size a phone uploads it
//     (scene/phoneTextureCap phoneCapFor; the Kenney models carry none), RGBA with mips (× 1.33), plus the procedural textures (the
//     sand tile 512², the wave normals 256², the planks 128², the sign 512 × 128). Held to PLACE_TEX_MB and inside the row.
//   * THE FILE LIST. The models are pinned: adding one fails here first.
// Draw calls, active meshes and texture MB of the whole scene (the body, the sky, the post-process included) are held by the measured
// row (scripts/mobile-budget-tests.ts; the browser rig scripts/probes/coast-islands/zone-rig.mts measures them).
// ITS OWN CONTROL: the same zone with streaming off (coast.streamOn 0: every piece fine, every prop) must come out OVER PLACE_TRIS.
// A guard that cannot see the regression it was built for fails.
//
//   npx tsx scripts/coast-zone-budget-tests.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { phoneTexMbOf, readGlb } from './hoops-phone-budget-tests';
import { PHONE_FAR_PROP_MAX } from '../lib/babylon/scene/phoneTextureCap';
import {
  COAST_STREAM_FULL, COAST_STREAM_KEEP, COAST_STREAM_LOD, PROP_MODELS, ZONE_MAX_X, ZONE_MAX_Z, ZONE_MIN_X, ZONE_MIN_Z, ZoneStreamer,
  pieceAt, propsDrawnAt, walkable, zonePieces, zoneProps, type PropModel, type StreamRings, type Tier,
} from '../lib/adventure/coast/zoneLayout';
import { COAST_STREAM_ON, COARSE_DIV, FINE_DIV } from '../lib/adventure/coast/zoneView';
import { COAST_CREATURES_ON, ZONE_CREATURES } from '../lib/adventure/coast/zoneCreatures';
import { COAST_PARTNER_ON } from '../lib/adventure/coast/zonePartner';
import { pieceKey } from '../lib/adventure/coast/zoneLayout';

/** Phase B: a creature placeholder's draws (world/view buildCreatureBody: a body and a head, wings from stage 2; one shared
 *  colour material per element, no textures). The partner wears the same body (the default loan: stage 0). */
export const creatureDraws = (stage: number): number => (stage >= 2 ? 3 : 2);
export const PARTNER_DRAWS = creatureDraws(0);
/** At most this many creatures drawn at once (the plan's budget: ≤ 6 NPCs or creatures in the 3 × 3). */
export const MAX_CREATURES_SHOWN = 6;

let failed = 0, passed = 0;
const ok = (c: boolean, msg: string) => { if (c) passed++; else { failed++; console.error(`  ✗ ${msg}`); } };
const MB = 1048576;

/** The files the zone loads (zoneView: PROP_MODELS). */
export const ZONE_GLBS: readonly string[] = PROP_MODELS.map((m) => (m.kit === 'meshy' ? `/models/meshy/${m.file}` : `/models/props/nature/${m.file}`));
/** The fixed draws: the sea, the sea floor, the decks and rails, the posts, the boat, the boat spot's ring and sign. */
export const FIXED_DRAWS = 7;
/** Computed today (+ 5 %): the worst standable piece's place triangles, its place draws, and the place's phone texture MB. */
export const PLACE_TRIS = 40400;
export const PLACE_DRAWS = 66;   // coast-b: 53 → 66, the partner (2) and the four creatures (10) added (computed 63)
export const PLACE_TEX_MB = 2.2;

interface Accessor { count: number }
interface GlbJson { meshes?: Array<{ primitives: Array<{ material?: number; indices?: number; attributes?: Record<string, number> }> }>; accessors?: Accessor[] }
/** One model's triangles and its materials (one prop master each: zoneView merges a model's parts by material). */
export function modelCost(url: string): { tris: number; materials: number } {
  const j = readGlb(url).json as unknown as GlbJson;
  let tris = 0;
  const mats = new Set<number>();
  for (const m of j.meshes ?? []) for (const p of m.primitives) {
    const acc = p.indices !== undefined ? j.accessors?.[p.indices] : j.accessors?.[p.attributes?.POSITION ?? -1];
    tris += Math.floor((acc?.count ?? 0) / 3);
    mats.add(p.material ?? -1);
  }
  return { tris, materials: mats.size };
}

export interface PlaceCost { tris: number; draws: number; terrainTris: number; props: number; fine: number; creatures: number; lifeDraws: number }
const FINE_TRIS = FINE_DIV * FINE_DIV * 2, COARSE_TRIS = COARSE_DIV * COARSE_DIV * 2;

/** What the zone draws (not culled: the whole place) at a tier map. `streamOn` false = the control (all full). */
export function placeCost(tiers: ReadonlyMap<string, Tier>, streamOn: boolean): PlaceCost {
  const land = zonePieces().filter((p) => p.kind !== 'sea');
  const tierOf = (key: string): Tier => (streamOn ? tiers.get(key) ?? 'far' : 'full');
  let terrainTris = 0, fine = 0;
  for (const p of land) { if (tierOf(p.key) === 'full') { terrainTris += FINE_TRIS; fine++; } else terrainTris += COARSE_TRIS; }
  const cost = new Map<string, { m: PropModel; tris: number; materials: number }>();
  PROP_MODELS.forEach((m, i) => cost.set(m.id, { m, ...modelCost(ZONE_GLBS[i]) }));
  let propTris = 0, props = 0, masters = 0;
  const shown = new Set<string>();
  for (const pl of zoneProps()) {
    const c = cost.get(pl.model)!;
    if (!propsDrawnAt(tierOf(pl.piece), c.m)) continue;
    propTris += c.tris; props++;
    shown.add(pl.model);
  }
  for (const id of shown) masters += cost.get(id)!.materials;
  // phase B: the partner (always beside you) and every creature whose home piece is drawn (zoneLife CreatureBodies hides the rest)
  const shownC = COAST_CREATURES_ON ? ZONE_CREATURES.filter((c) => tierOf(pieceKey(...pieceAt(c.home[0], c.home[1]))) !== 'far') : [];
  const lifeDraws = (COAST_PARTNER_ON ? PARTNER_DRAWS : 0) + shownC.reduce((n, c) => n + creatureDraws(c.stage), 0);
  return { tris: terrainTris + propTris, draws: land.length + masters + FIXED_DRAWS + lifeDraws, terrainTris, props, fine, creatures: shownC.length, lifeDraws };
}

/** The worst piece a player can stand in, at these rings: every standable piece, reached by a walk from its neighbour. */
export function worstPiece(rings: StreamRings, streamOn: boolean): { cost: PlaceCost; piece: string; worstDraws: number; maxCreatures: number } {
  let maxCreatures = 0;
  let worst: { cost: PlaceCost; piece: string } = { cost: { tris: 0, draws: 0, terrainTris: 0, props: 0, fine: 0, creatures: 0, lifeDraws: 0 }, piece: '' };
  let worstDraws = 0;
  const standable = new Set<string>();
  for (let z = ZONE_MIN_Z + 2; z < ZONE_MAX_Z; z += 4) for (let x = ZONE_MIN_X + 2; x < ZONE_MAX_X; x += 4) if (walkable(x, z)) { const [i, j] = pieceAt(x, z); standable.add(`${i},${j}`); }
  for (const key of standable) {
    const [i, j] = key.split(',').map(Number);
    // arrive from each side (the hysteresis keeps what the last piece raised): the worst of the four
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const s = new ZoneStreamer(rings);
      s.step(Math.max(0, Math.min(5, i + di)), Math.max(0, Math.min(5, j + dj)));
      s.step(i, j);
      const c = placeCost(s.tiers, streamOn);
      if (c.tris > worst.cost.tris || (c.tris === worst.cost.tris && c.draws > worst.cost.draws)) worst = { cost: c, piece: key };
      worstDraws = Math.max(worstDraws, c.draws); maxCreatures = Math.max(maxCreatures, c.creatures);
    }
  }
  return { ...worst, worstDraws, maxCreatures };
}

/** The place's phone texture MB: the GLBs' images at the phone cap, plus the procedural textures. */
export function placeTexMb(): { total: number; glb: number; procedural: number } {
  const glb = ZONE_GLBS.reduce((s, u) => s + phoneTexMbOf(u, PHONE_FAR_PROP_MAX), 0);
  const tex = (w: number, h: number) => (w * h * 4 * 1.33) / MB;
  const procedural = tex(512, 512) + tex(256, 256) + tex(128, 128) + tex(512, 128);
  return { total: glb + procedural, glb, procedural };
}

const isMain = (() => { try { return resolve(process.argv[1] ?? '') === resolve(new URL(import.meta.url).pathname); } catch { return false; } })();
if (isMain) {
  const rings: StreamRings = { full: COAST_STREAM_FULL, lod: COAST_STREAM_LOD, keep: COAST_STREAM_KEEP };
  const now = worstPiece(rings, true);
  const control = worstPiece(rings, false);
  const tex = placeTexMb();
  const row = JSON.parse(readFileSync(resolve(__dirname, '../lib/babylon/config/mobileBudget.json'), 'utf8')).modes?.coast_zone;
  console.log(`coast zone, worst standable piece ${now.piece}: ${now.cost.tris} triangles (terrain ${now.cost.terrainTris}, ${now.cost.props} props), ${now.cost.draws} place draws (${now.cost.lifeDraws} the partner and ${now.cost.creatures} creatures), ${now.cost.fine} fine pieces; worst place draws anywhere ${now.worstDraws}, most creatures drawn ${now.maxCreatures}`);
  console.log(`  control (streaming off): ${control.cost.tris} triangles, ${control.cost.props} props, ${control.cost.draws} place draws; textures ${tex.total.toFixed(2)} MB (GLBs ${tex.glb.toFixed(2)}, procedural ${tex.procedural.toFixed(2)})`);

  ok(COAST_STREAM_ON === 1, 'coast.streamOn ships at 1: the zone streams its pieces');
  ok(rings.full === 1 && rings.lod === 2 && rings.keep === 1, `the phone rings are the plan's: full 1, LOD 2, keep 1 (got ${JSON.stringify(rings)})`);
  ok(now.cost.fine <= 16, `at most 16 fine pieces are drawn anywhere (the 3 × 3 plus the hysteresis band; got ${now.cost.fine})`);
  ok(now.cost.tris <= PLACE_TRIS, `the worst piece's place triangles ${now.cost.tris} are within PLACE_TRIS ${PLACE_TRIS}`);
  ok(PLACE_TRIS <= Math.ceil(now.cost.tris * 1.05) + 1, `PLACE_TRIS ${PLACE_TRIS} is the measurement + 5 %, not a raise (computed ${now.cost.tris})`);
  ok(now.worstDraws <= PLACE_DRAWS, `the worst place draws anywhere (${now.worstDraws}, the partner and the creatures in view included) are within PLACE_DRAWS ${PLACE_DRAWS}`);
  ok(PLACE_DRAWS <= Math.ceil(now.worstDraws * 1.05) + 1, `PLACE_DRAWS ${PLACE_DRAWS} is the measurement + 5 %, not a raise (computed ${now.worstDraws})`);
  ok(now.maxCreatures <= MAX_CREATURES_SHOWN, `at most ${MAX_CREATURES_SHOWN} creatures are drawn at once (got ${now.maxCreatures})`);
  ok(COAST_PARTNER_ON === 1 && COAST_CREATURES_ON === 1, 'phase B ships on: the partner and the creatures');
  ok(control.cost.tris > PLACE_TRIS, `CONTROL: streaming off (${control.cost.tris} triangles) is over PLACE_TRIS — the guard sees the regression it guards`);
  ok(tex.total <= PLACE_TEX_MB, `the place's phone texture memory ${tex.total.toFixed(2)} MB is within PLACE_TEX_MB ${PLACE_TEX_MB}`);
  ok(ZONE_GLBS.length === 7 && ZONE_GLBS.every((u) => u.startsWith('/models/props/nature/')), 'the zone loads seven models, all from the Kenney nature kit (the Meshy surfboard waits for the surf spot)');
  ok(!!row, 'the zone has a row in lib/babylon/config/mobileBudget.json (coast_zone)');
  if (row) {
    ok(row.measured.skinnedBodies <= 1, `one body in the zone so far (the player; got ${row.measured.skinnedBodies})`);
    ok(tex.total <= row.budget.textureMb, `the place's textures fit inside the zone's whole-scene texture budget (${row.budget.textureMb} MB)`);
    ok(now.worstDraws <= row.budget.drawCalls, `the place's draws (${now.worstDraws}, unculled) fit inside the row's draw budget (${row.budget.drawCalls})`);
  }

  console.log(`\ncoast-zone-budget: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}
