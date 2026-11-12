#!/usr/bin/env -S npx tsx
// HOOPS PHONE BUDGET GUARD (hoops-p08, 2026-11-12) — no hoops mode can grow past its phone budget unnoticed again.
//
// WHY. docs/HOOPS-AAA-GAP-SHOW.md §3.9: 3v3 and 3-Point had grown past their phone rows (lib/babylon/config/mobileBudget.json) by
// 30–50 % and nothing in CI saw it: scripts/mobile-budget-tests.ts checks the TABLE, and the table only moves when someone runs the
// browser probe. The growth came from content — the forge rivals (nine parts each, every part drawn three times with its ink
// contour), the Venice dunk dressing on the half court, the parked vehicles' maps.
//
// WHAT IT MEASURES — A SCENE DESCRIPTION, NOT A RENDER. No GPU, no browser, deterministic: it reads files and calls the shipped rules.
//   * THE BODIES. Each body's draw-producing parts are read from its GLB (public/models/rivals/*.glb, the player's kit body): every
//     primitive the court kit shows (the other shoe model is dropped; one runtime sole is added per shown shoe — CharacterLibrary's
//     kit pipeline, assumption checked against the census: nine parts a rival, eight the kit body). Each part costs, on the phone
//     tier: 1 draw, + 2 when it wears the ink contour (Babylon's outline renderer: the hull, then the mesh again for depth) unless
//     scene/phoneCasters.phoneSkipsInk says no, + 1 when it is a shadow caster unless phoneSkipsCaster / phoneSkipsCasterMaterial
//     say no. The body counts are what the phone's worst frame drew (scripts/probes/hoops-p08/scene-census.mts), pinned below.
//   * THE REST OF THE FRAME is a measured constant per mode (BASE: the worst frame's draws and active meshes that are not bodies,
//     from the same census), so a change there is not seen here — EXCEPT the Venice dressing, which is counted from code: the prop
//     set's thin-instanced masters (visual/venuePropSets + each model's GLB, VenueProps' merge-by-material rule) and the boardwalk's
//     dressing files are pinned to their counts today. Adding a prop model, a placement tint, a dressing file or a part fails here.
//   * TEXTURE MEMORY is computed: every image in every GLB the mode loads, at the size a phone uploads it (scene/phoneTextureCap
//     phoneCapFor, the mode's far-prop cap), RGBA with mips (× 1.33), plus the mode's measured procedural textures (DYNAMIC). The rival
//     files are the mode's cast's largest, one per rival body in the scene (worst case: no two bodies share a file).
// It then holds DRAWS, ACTIVE MESHES and TEXTURE MB to the mode's row in mobileBudget.json (a metric listed in STILL_OVER — a finding
// for the owner — is held to its frozen measured value instead: it may shrink, never grow) — and, as its own control, recomputes the
// same scene with every hoops-p08 phone rule at its "as before" value and checks that 3v3 and 3-Point come out OVER their rows (they
// were, measured): a guard that cannot see the regression it was built for fails.
//
//   npx tsx scripts/hoops-phone-budget-tests.ts
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { VENUE_PROP_SETS, VENICE_ENV2_DIR, VENICE_PALM_LODS } from '../lib/babylon/visual/venuePropSets';
import { MODE_CAST } from '../lib/babylon/core/athleteRoster';
import { phoneSkipsCaster, phoneSkipsCasterMaterial, phoneSkipsInk, PHONE_INK_TRIM, PHONE_SOCK_CAST } from '../lib/babylon/scene/phoneCasters';
import { phoneCapFor, PHONE_FAR_PROP_MAX, PHONE_FAR_PROP_MODES, PHONE_MODEL_TEXTURE_MAX } from '../lib/babylon/scene/phoneTextureCap';
import { PROP_MERGE_ON } from '../lib/babylon/visual/VenueProps';
import { HALF_COURT_CROWD_CARDS, PHONE_RAIL_BODIES, SHARED_GROUND_ON } from '../lib/babylon/nexus/veniceBoardwalk';

const PUB = resolve(process.cwd(), 'public');

// ── reading a GLB ─────────────────────────────────────────────────────────────────────────────────────────────────────
interface Glb { json: { meshes?: Array<{ name?: string; primitives: Array<{ material?: number }> }>; materials?: Array<{ name?: string }>; images?: Array<{ bufferView?: number; uri?: string; mimeType?: string }>; bufferViews?: Array<{ byteOffset?: number; byteLength: number }> }; bin: Buffer }
const glbCache = new Map<string, Glb>();
export function readGlb(url: string): Glb {
  const hit = glbCache.get(url); if (hit) return hit;
  const b = readFileSync(resolve(PUB, url.replace(/^\//, '')));
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${url}: not a GLB`);
  const jl = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jl).toString('utf8'));
  const bo = 20 + jl;
  const bin = bo + 8 <= b.length ? b.subarray(bo + 8, bo + 8 + b.readUInt32LE(bo)) : Buffer.alloc(0);
  const g = { json, bin }; glbCache.set(url, g); return g;
}
/** An image's pixel size from its header (PNG, JPEG, WebP lossy / lossless / extended). */
export function imageSize(d: Buffer): { w: number; h: number } {
  if (d.readUInt32BE(0) === 0x89504e47) return { w: d.readUInt32BE(16), h: d.readUInt32BE(20) };
  if (d[0] === 0xff && d[1] === 0xd8) {
    let i = 2;
    while (i < d.length) {
      if (d[i] !== 0xff) { i++; continue; }
      const m = d[i + 1], len = d.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: d.readUInt16BE(i + 5), w: d.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  if (d.toString('ascii', 0, 4) === 'RIFF' && d.toString('ascii', 8, 12) === 'WEBP') {
    const kind = d.toString('ascii', 12, 16);
    if (kind === 'VP8 ') return { w: d.readUInt16LE(26) & 0x3fff, h: d.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') { const b0 = d[21], b1 = d[22], b2 = d[23], b3 = d[24]; return { w: 1 + (((b1 & 0x3f) << 8) | b0), h: 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) }; }
    if (kind === 'VP8X') return { w: 1 + d.readUIntLE(24, 3), h: 1 + d.readUIntLE(27, 3) };
  }
  throw new Error('unknown image format');
}
/** GPU MB a phone holds for one GLB's images (each at its phone upload size, RGBA, mips). */
export function phoneTexMbOf(url: string, farProp: number): number {
  const { json, bin } = readGlb(url);
  let mb = 0;
  (json.images ?? []).forEach((img, i) => {
    if (img.bufferView === undefined) return;
    const bv = json.bufferViews![img.bufferView];
    const { w, h } = imageSize(bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength));
    const cap = phoneCapFor(`${url}#image${i}`, w, h, farProp);
    const cw = Math.min(w, cap), ch = Math.min(h, cap);
    mb += (cw * ch * 4 * 1.33) / 1048576;
  });
  return mb;
}
/** Plain image files (the hero's skin maps). */
function phoneTexMbOfImage(url: string): number { const { w, h } = imageSize(readFileSync(resolve(PUB, url.replace(/^\//, '')))); return (w * h * 4 * 1.33) / 1048576; }

// ── the bodies ───────────────────────────────────────────────────────────────────────────────────────────────────────
export interface Part { name: string; mat: string; skinned: boolean }
/** The parts a court body shows, from its GLB: every primitive but the other shoe models', one hair (the file's first, as the kit
 *  shows one), and a runtime sole per shown shoe. Runtime names (the rules key on them): the eyes `eyes_`, the sole `KitSole_`. */
export function bodyParts(url: string, shoe = 'shoes_evo'): Part[] {
  const { json } = readGlb(url);
  const parts: Part[] = [];
  let hair = false;
  for (const m of json.meshes ?? []) for (const p of m.primitives) {
    const mat = p.material !== undefined ? json.materials?.[p.material]?.name ?? '' : '';
    if (/^shoes\./.test(mat) && !mat.startsWith(`shoes.${shoe}`)) continue;
    if (/^hair\./.test(mat)) { if (hair) continue; hair = true; }
    parts.push({ name: mat === 'eyes' ? 'eyes_' : `${m.name ?? 'part'}`, mat, skinned: true });
    if (mat === `shoes.${shoe}`) parts.push({ name: 'KitSole_', mat: 'kitSole', skinned: true });
  }
  return parts;
}
export interface Rules { inkTrim: number; sockCast: number; farProp: number; propMerge: number; crowdCards: number; sharedGround: number; railBodies: number }
export const SHIPPED: Rules = { inkTrim: PHONE_INK_TRIM, sockCast: PHONE_SOCK_CAST, farProp: PHONE_FAR_PROP_MAX, propMerge: PROP_MERGE_ON, crowdCards: HALF_COURT_CROWD_CARDS, sharedGround: SHARED_GROUND_ON, railBodies: PHONE_RAIL_BODIES };
/** Every hoops-p08 phone rule at the value its knob calls "as before". */
export const AS_BEFORE: Rules = { inkTrim: 0, sockCast: 1, farProp: PHONE_MODEL_TEXTURE_MAX, propMerge: 0, crowdCards: 1, sharedGround: 0, railBodies: 5 };
/** One body's draws on the phone tier (main pass, ink, shadow map) under the rules. */
export function bodyDraws(parts: Part[], r: Rules): number {
  let d = 0;
  for (const p of parts) {
    d += 1;
    if (p.skinned && !phoneSkipsInk(p.name, p.mat, 'mobile', r.inkTrim)) d += 2;
    if (!phoneSkipsCaster(p.name, 'mobile') && !phoneSkipsCasterMaterial(p.mat, 'mobile', r.sockCast)) d += 1;
  }
  return d;
}

// ── the Venice dressing (counted from code) ──────────────────────────────────────────────────────────────────────────
const kitDir = (kit: string): string => (kit === 'meshy' ? '/models/meshy/' : `/models/props/${kit}/`);   // VenueProps' kitDir
/** The prop set's thin-instanced masters under VenueProps' merge rule: per (model, tint) one per material when merged, else one per part. */
export function propMasters(set: string, merge: number): number {
  const groups = new Map<string, true>();
  let n = 0;
  for (const p of VENUE_PROP_SETS[set] ?? []) {
    const key = `${p.kit}/${p.model}|${JSON.stringify(p.tint ?? null)}`;
    if (groups.has(key)) continue; groups.set(key, true);
    const url = `${kitDir(p.kit)}${p.model}.glb`;
    if (!existsSync(resolve(PUB, url.replace(/^\//, '')))) continue;
    const { json } = readGlb(url);
    const prims = (json.meshes ?? []).flatMap((m) => m.primitives.map((q) => q.material ?? -1));
    n += merge >= 0.5 ? new Set(prims).size : prims.length;
  }
  return n;
}
/** The files the Venice dunk dressing loads (veniceBoardwalk.mountVeniceDunkDressing). */
export function dressingFiles(crowdCards: boolean): string[] {
  return [...VENICE_PALM_LODS.files, 'venice_boardwalk_kit.glb', ...(crowdCards ? ['venice_crowd_cards.glb'] : [])].map((f) => VENICE_ENV2_DIR + f);
}
export function propFiles(set: string): string[] {
  return [...new Set((VENUE_PROP_SETS[set] ?? []).map((p) => `${kitDir(p.kit)}${p.model}.glb`))].filter((u) => existsSync(resolve(PUB, u.replace(/^\//, ''))));
}

// ── the modes ────────────────────────────────────────────────────────────────────────────────────────────────────────
const KIT_BODY = '/models/candidates/fel-kit-male.mobile.glb';   // the guest player's phone kit body (census: fel-kit-male.mobile.glb)
const HERO_SKIN_MAPS = ['/models/skins/light-male-1024.jpg', '/models/skins/detail-normal-1024.jpg'];
const COMMON_FILES = ['/models/meshy/hoop.glb', '/models/meshy/ball-basketball.glb'];
interface ModeScene {
  /** The budget row (mobileBudget.json) and the cast (athleteRoster MODE_CAST). */
  row: string; cast: string;
  /** Bodies drawn in the phone's worst frame (the player's, and rivals at the cast's costliest), and the rival bodies in the scene
   *  besides the rail (each its own file: the worst case). */
  heroInFrame: number; rivalsInFrame: number; rivalsInScene: number;
  /** The court: 'half' = the half-court Venice (1v1, 3v3, 3-Point: every hoops-p08 phone rule), 'dunk' = the dunk's Venice (the ink,
   *  the sock and the shared grounds; it keeps its crowd cards, its rail and its maps), 'other' = no Venice boardwalk (the carnival). */
  court: 'half' | 'dunk' | 'other';
  /** MEASURED (scripts/probes/_perf-sweep.mts on the lane's after build: the row's own profile): the worst frame's draws and active
   *  meshes, and the texture MB, less what this file models — everything else in the frame (court, sky, HUD-in-world, crowd, props
   *  in view, the shadow re-bake). */
  baseDraws: number; baseMeshes: number; baseTexMb: number;
  /** Measured: the procedural textures the shared grounds saved (the copies a plane used to paint), for the "as before" control. */
  copiedGroundMb: number;
}
// measured 2026-11-12 on the lane's after build (390×844 DPR 3, mobile tier, SEED 7, 6 game s, 4× throttle; perf-after4, commit 'the three
// Venice concretes are one mesh'): base = the sweep's worst-frame drawsMax / meshesMax / texMb − ledger(mode, SHIPPED, false)
// (LEDGER_RAW=1 prints that). 3v3 194 / 109 / 165; 3-Point 231 / 101 / 159; 1v1 113 / 56 / 129.
export const SCENES: Record<string, ModeScene> = {
  threevthree: { row: 'threevthree', cast: 'threevthree', heroInFrame: 1, rivalsInFrame: 5, rivalsInScene: 5, court: 'half', baseDraws: 42, baseMeshes: 50, baseTexMb: 31, copiedGroundMb: 9.3 },
  threepoint: { row: 'threepoint', cast: 'threepoint', heroInFrame: 1, rivalsInFrame: 3, rivalsInScene: 4, court: 'half', baseDraws: 127, baseMeshes: 60, baseTexMb: 35, copiedGroundMb: 9.3 },
  onevone: { row: 'onevone', cast: 'onevone', heroInFrame: 1, rivalsInFrame: 1, rivalsInScene: 1, court: 'half', baseDraws: 57, baseMeshes: 33, baseTexMb: 33, copiedGroundMb: 9.3 },
};

function rivalFiles(cast: string): string[] {
  return (MODE_CAST[cast] ?? []).map((k) => `/models/rivals/${k}.glb`).filter((u) => existsSync(resolve(PUB, u.replace(/^\//, ''))));
}
export interface Ledger { draws: number; meshes: number; textureMb: number; bodies: number; propMasters: number; files: number }
/** The modeled part of a mode's phone frame under the rules (no base), and with it. */
export function ledger(mode: string, r: Rules, withBase = true): Ledger {
  const s = SCENES[mode];
  const half = s.court === 'half', venice = s.court !== 'other';
  // the rules that the half court alone takes; the dunk keeps its crowd cards, rail and maps whatever the knobs say
  const rr: Rules = half ? r : { ...r, crowdCards: 1, railBodies: 5, farProp: PHONE_MODEL_TEXTURE_MAX };
  const casts = rivalFiles(s.cast);
  const perRival = casts.map((u) => ({ u, d: bodyDraws(bodyParts(u), rr), n: bodyParts(u).length, mb: phoneTexMbOf(u, PHONE_MODEL_TEXTURE_MAX) }));
  const byDraws = [...perRival].sort((a, b) => b.d - a.d), byMb = [...perRival].sort((a, b) => b.mb - a.mb);
  const hero = bodyParts(KIT_BODY);
  let draws = s.heroInFrame * bodyDraws(hero, rr), meshes = s.heroInFrame * hero.length;
  for (let i = 0; i < s.rivalsInFrame && byDraws.length; i++) { const b = byDraws[i % byDraws.length]; draws += b.d; meshes += b.n; }
  const masters = venice ? propMasters('venice-dunk', rr.propMerge) : 0;
  // textures: the player, one file per rival body in the scene (players + the rail), the court's own models, the Venice dressing
  const rail = venice ? Math.min(5, rr.railBodies) : 0;
  const bodies = Math.min(casts.length, s.rivalsInScene + rail);
  const far = half && PHONE_FAR_PROP_MODES.has(mode) ? rr.farProp : PHONE_MODEL_TEXTURE_MAX;
  const files = [...COMMON_FILES, ...(venice ? [...propFiles('venice-dunk'), ...dressingFiles(rr.crowdCards >= 0.5)] : [])];
  let tex = phoneTexMbOf(KIT_BODY, far) + HERO_SKIN_MAPS.reduce((a, u) => a + phoneTexMbOfImage(u), 0);
  for (let i = 0; i < bodies; i++) tex += byMb[i].mb;
  for (const u of files) tex += phoneTexMbOf(u, far);
  if (venice && rr.sharedGround < 0.5) tex += s.copiedGroundMb;
  // the dressing's own draws and meshes that the rules change (the four aprons with the walk and the plaza — one concrete when
  // shared —, the two posts, the four flags, the two seas and the two surf strips — one each when shared — and the crowd cards)
  const dress = venice ? (rr.sharedGround >= 0.5 ? 1 + 1 + 1 + 1 + 1 : 6 + 2 + 4 + 2 + 2) + (rr.crowdCards >= 0.5 ? 1 : 0) : 0;
  draws += dress; meshes += dress;
  if (withBase) { draws += s.baseDraws; meshes += s.baseMeshes; tex += s.baseTexMb; }
  return { draws, meshes, textureMb: Math.round(tex), bodies: s.heroInFrame + s.rivalsInFrame, propMasters: masters, files: files.length };
}

// ── the checks ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** STILL OVER — a finding, frozen, printed every run (hoops-p08, measured 2026-11-12 on the after build). The ACTIVE MESHES of 3v3 and
 *  3-Point did not come back inside their rows: the bodies alone are ~60 of 3v3's 109 (six players at about ten parts each: body,
 *  top, shorts, two shoe parts and a sole, hair, eyes, the accessories), and what is left of the venue is ~45 meshes of different
 *  materials; 3-Point's worst frame swings 93–101 with the crowd cards' pose meshes and the rack balls. Getting there without a
 *  visible change means merging a body's parts into one multi-material mesh in the character pipeline (shared by every mode) —
 *  the owner's call, not this lane's. Frozen at what was measured: it may shrink, never grow, and an entry whose mode is back
 *  inside its row is stale (remove it). */
export const STILL_OVER: Record<string, Partial<Record<'drawCalls' | 'activeMeshes' | 'textureMb', number>>> = {
  threevthree: { activeMeshes: 109 },
  threepoint: { activeMeshes: 101 },
};

/** The Venice dressing's content today (after hoops-p08): a new prop model, placement tint or dressing file must be measured first. */
export const VENICE_CONTENT = { propMasters: 22, dressingFiles: 4 };

const isMain = (() => { try { return resolve(process.argv[1] ?? '') === resolve(new URL(import.meta.url).pathname); } catch { return false; } })();
if (isMain) {
  const table = JSON.parse(readFileSync(resolve(process.cwd(), 'lib/babylon/config/mobileBudget.json'), 'utf8')) as { modes: Record<string, { budget: { drawCalls: number; activeMeshes: number; textureMb: number } }> };
  const fail: string[] = []; let checks = 0;
  const ok = (c: boolean, label: string) => { checks++; if (!c) fail.push(label); };
  console.log('hoops-phone-budget-tests: the phone frame of each hoops mode, from its scene description (no GPU)');
  // LEDGER_RAW=1: the modeled part alone (no measured base), to re-derive the bases after a re-measure: base = measured − this
  if (process.env.LEDGER_RAW) for (const m of Object.keys(SCENES)) console.log(`  raw ${m}: ${JSON.stringify(ledger(m, SHIPPED, false))} · as before ${JSON.stringify(ledger(m, AS_BEFORE, false))}`);
  for (const mode of Object.keys(SCENES)) {
    const b = table.modes[SCENES[mode].row]?.budget;
    ok(!!b, `${mode}: has a row in mobileBudget.json`);
    if (!b) continue;
    const now = ledger(mode, SHIPPED), before = ledger(mode, AS_BEFORE);
    console.log(`  ${mode.padEnd(12)} draws ${now.draws}/${b.drawCalls} (as before ${before.draws}) · active meshes ${now.meshes}/${b.activeMeshes} (as before ${before.meshes}) · texture ${now.textureMb}/${b.textureMb} MB (as before ${before.textureMb}) · ${now.bodies} bodies in frame, ${now.propMasters} prop masters, ${now.files} venue files`);
    const held = (metric: 'drawCalls' | 'activeMeshes' | 'textureMb', v: number, row: number, unit: string) => {
      const frozen = STILL_OVER[mode]?.[metric];
      if (frozen === undefined) { ok(v <= row, `${mode}: ${v} ${unit} > budget ${row}`); return; }
      console.log(`    FINDING (STILL_OVER, waits on the owner): ${mode} ${metric} ${v} over its row ${row}, frozen at ${frozen}`);
      ok(v <= frozen, `${mode}: ${v} ${unit} — grew past its frozen STILL_OVER value ${frozen} (it may shrink, never grow)`);
      ok(v > row, `${mode}: ${metric} ${v} is back inside its row ${row} — remove the stale STILL_OVER entry`);
    };
    held('drawCalls', now.draws, b.drawCalls, 'draws');
    held('activeMeshes', now.meshes, b.activeMeshes, 'active meshes');
    held('textureMb', now.textureMb, b.textureMb, 'MB of textures');
  }
  // the content pins
  ok(propMasters('venice-dunk', SHIPPED.propMerge) === VENICE_CONTENT.propMasters, `venice-dunk: ${propMasters('venice-dunk', SHIPPED.propMerge)} prop masters (pinned ${VENICE_CONTENT.propMasters}) — a new prop model or tint: re-measure the phone (scene-census) and update SCENES`);
  ok(dressingFiles(false).length === VENICE_CONTENT.dressingFiles, `the half-court Venice dressing loads ${dressingFiles(false).length} files (pinned ${VENICE_CONTENT.dressingFiles})`);
  // the control: with every hoops-p08 rule "as before", 3v3 and 3-Point are over their rows (they were, measured) — the guard sees it
  for (const mode of ['threevthree', 'threepoint']) {
    const b = table.modes[mode].budget, before = ledger(mode, AS_BEFORE);
    ok(before.draws > b.drawCalls || before.textureMb > b.textureMb || before.meshes > b.activeMeshes, `control: ${mode} "as before" should be over its row and is not (draws ${before.draws}, meshes ${before.meshes}, ${before.textureMb} MB) — the guard has lost its sight`);
  }
  if (fail.length) { console.error(`hoops-phone-budget-tests: ${fail.length} FAILED of ${checks}`); for (const f of fail) console.error('  ✗ ' + f); process.exit(1); }
  console.log(`hoops-phone-budget-tests: ${checks} checks green`);
}
