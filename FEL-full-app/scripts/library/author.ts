#!/usr/bin/env -S npx tsx
// scripts/library/author.ts — EXERCISE-LIBRARY (2026-10-25): FEL's authored entries → data/library/authored/*.json.
//
// Owner decisions (2026-10-25): after the open seed, "author the rest ourselves, in the owner's voice and method, as AI
// drafts that the owner reviews"; never copy TrueCoach, ExRx, Muscle & Motion or any other list. So every entry here
// is generated from FEL's own taxonomy matrix (./authoring/*.ts — family × variant; batches 2–3 add new families in
// the owner's priority areas, ./authoring/later.ts; then lib/library/modifiers.ts's modifiers, each applied ONLY where
// its applicability rule accepts the base, the same rule the validator enforces), in the cue style of the catalogue and the Blueprint (lib/coach/taxonomy.ts SETUP_CUES, the Playbook's
// own cues), checked by the same validator the CI suite runs, and written as DRAFTS for the owner's review.
//
// NO NEAR-DUPLICATES. An authored variant whose name already names a seed entry is not written: its ladder links point
// at the seed entry instead (so the seed row gains an easier and a harder neighbour without being copied). Any other
// clash — a name, an alias, a (pattern, equipment, variation) key — stops the run.
//
// BATCHES (owner decision 2026-10-25: "write batches 2–4 to reach 5,000+"; the owner reviews each batch):
//   1 — the first families (./authoring/blocks.ts);
//   2 — new families in the owner's priorities: basketball (handle combos, finishing, shooting, defense, passing),
//       jump-and-land ladders and jump progressions, sprint starts, cuts and footwork (./authoring/later.ts);
//   3 — new mobility flows, prehab and conditioning families, plus the sport, speed and prehab modifiers;
//   4 — the strength modifiers (paused, tempo, single-arm, offset…), rule-checked.
// A modifier entry and an axis variant carry `variantOf` (the base), so search shows the base once with "+N variants".
//
// Run:
//   npx tsx scripts/library/author.ts                 # batch 1 → data/library/authored/b1-<block>.json
//   npx tsx scripts/library/author.ts --batch 2       # batch 2 → data/library/authored/b2-<block>.json
//   npx tsx scripts/library/author.ts --later         # batches 2, 3 and 4 in one run
//   npx tsx scripts/library/author.ts --count         # what every batch would add, written nowhere

import path from 'node:path';
import { rmSync, readdirSync } from 'node:fs';
import { clipKeyFor } from '../../lib/library/demo';
import { MODIFIERS, ruleFailures } from '../../lib/library/modifiers';
import { nameKey, slugify } from '../../lib/library/search/text';
import type { LibraryExercise } from '../../lib/library/types';
import { countBy, semanticKey } from '../../lib/library/validate';
import { LEVEL_IDS, PREHAB_NOTE, levelRank } from '../../lib/library/vocab';
import { DATA, gate, readDir, writeEntries, writeFilesIndex } from './common';
import { BLOCKS } from './authoring/blocks';
import { LATER_BLOCKS } from './authoring/later';
import type { Family, Variant } from './authoring/types';

export const AUTHORED_LICENCE = 'FEL original (Final Evolution Lab)';
export const BATCHES = [1, 2, 3, 4] as const;

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

function entryOf(f: Family, v: Variant, batch: number): LibraryExercise {
  const id = slugify(v.name);
  const cues = v.cues ?? (v.cue ? [v.cue, ...f.cues.filter((c) => c !== v.cue)].slice(0, 3) : [...f.cues]);
  const faults = [...(v.faults ?? []), ...f.faults].slice(0, 4);
  const equipment = v.equipment ?? f.equipment;
  return {
    id, slug: id, name: v.name, aliases: v.aliases ?? [], family: f.family, variation: v.v,
    pattern: v.pattern ?? f.pattern, plane: v.plane ?? f.plane, laterality: v.laterality ?? f.laterality, category: f.category, level: v.level,
    equipment: [...equipment], primaryMuscles: v.primary ?? f.primary, secondaryMuscles: v.secondary ?? f.secondary,
    sportTags: v.sport ?? f.sport, goals: [...new Set([...f.goals, ...(v.goals ?? [])])], skillLayer: f.skillLayer, braceMode: f.braceMode,
    setup: v.setup ?? f.setup, cues, faults,
    regressionId: null, progressionId: null,
    cautions: [...new Set([...(f.cautions ?? []), ...(v.cautions ?? [])])].slice(0, 4),
    lowLoad: v.lowLoad ?? f.lowLoad, youthOk: v.youthOk ?? f.youthOk,
    prehabNote: f.category === 'prehab' ? PREHAB_NOTE : null,
    dosage: dosageOf(f, v, batch),
    demo: { clipKey: v.clip ?? (v.pattern ? clipKeyFor(v.pattern, f.family) : f.clip ?? clipKeyFor(f.pattern, f.family)), videoUrl: null, imageRef: null },
    source: { kind: 'authored', ref: `${f.block}/${f.family}/${v.v}`, url: null, licence: AUTHORED_LICENCE },
    review: { status: 'draft', reviewer: null, batch: `authored-b${batch}-${f.block}` },
  };
}

/**
 * A variant's dose over its family's. From batch 2 on, a variant that names its own measure (reps, seconds, contacts or
 * metres) replaces the family's measure instead of sitting beside it ("3 × 30 s" and "25 m" on one entry). Batch 1
 * keeps its original merge so its reviewed files stay byte-identical.
 */
function dosageOf(f: Family, v: Variant, batch: number): LibraryExercise['dosage'] {
  const d = v.dosage ?? {};
  if (batch === 1 || !(['reps', 'seconds', 'contacts', 'meters'] as const).some((k) => d[k] !== undefined)) return { ...f.dosage, ...d };
  const { reps: _r, seconds: _s, contacts: _c, meters: _m, ...rest } = f.dosage;
  return { ...rest, ...d } as LibraryExercise['dosage'];
}

/** What every earlier entry already claims: its name key and its semantic key → its id. */
export type Known = Map<string, string>;
export const knownOf = (entries: readonly LibraryExercise[]): Known =>
  new Map(entries.flatMap((e) => [[nameKey(e.name), e.id], [semanticKey(e), e.id], ...e.aliases.map((a) => [nameKey(a), e.id] as [string, string])] as [string, string][]));

/**
 * One batch's families: every variant, ladders linked, axis variants pointed at their base. A variant whose name (or
 * semantic key) an earlier entry already holds is NOT written: its ladder links point at that entry instead.
 */
export function buildFamilies(families: readonly Family[], batch: number, known: Known): { entries: LibraryExercise[]; linked: string[] } {
  const out: LibraryExercise[] = [];
  const linked: string[] = [];
  const ids = new Set(known.values());
  for (const f of families) {
    const ladders = new Map<string, string[]>();
    const made = new Map<string, LibraryExercise>();
    const byV = new Map<string, string>();
    for (const v of f.variants) {
      const e = entryOf(f, v, batch);
      const earlier = known.get(nameKey(e.name)) ?? known.get(semanticKey(e));
      const id = earlier ?? e.id;
      byV.set(v.v, id);
      if (earlier) linked.push(`${e.name} → ${earlier}`);
      else {
        made.set(id, e); out.push(e);
        known.set(nameKey(e.name), id); known.set(semanticKey(e), id); ids.add(id);
        for (const a of e.aliases) known.set(nameKey(a), id);
      }
      const key = v.ladder ?? 'main';
      ladders.set(key, [...(ladders.get(key) ?? []), id]);
    }
    for (const ids of ladders.values()) {
      ids.forEach((id, i) => {
        const e = made.get(id);
        if (!e) return;
        e.regressionId = i > 0 ? ids[i - 1] : null;
        e.progressionId = i < ids.length - 1 ? ids[i + 1] : null;
      });
    }
    for (const v of f.variants) {
      if (!v.base) continue;
      const e = made.get(byV.get(v.v)!);
      if (!e) continue;
      const base = v.base.startsWith('id:') ? v.base.slice(3) : byV.get(v.base);
      if (!base || !ids.has(base)) throw new Error(`${f.family}/${v.v}: base ${v.base} does not resolve`);
      if (base !== e.id) e.variantOf = base;
    }
  }
  return { entries: out, linked };
}

/** Batch 1: every family's variants, ladders linked, seed collisions resolved to the seed id. */
export function buildBatch1(seed: readonly LibraryExercise[]): { entries: LibraryExercise[]; linkedToSeed: string[] } {
  const { entries, linked } = buildFamilies(BLOCKS.flat(), 1, knownOf(seed));
  return { entries, linkedToSeed: linked };
}

/** What the modifiers apply to: FEL's batch-1 entries, then the seed's (Olympic lifts and recovery work excluded). */
export function modifierBase(seed: readonly LibraryExercise[], batch1: readonly LibraryExercise[]): LibraryExercise[] {
  return [...batch1, ...seed.filter((e) => e.category !== 'power' && e.category !== 'recovery')];
}

/**
 * A batch's modifiers: each applied to every base its rule accepts (lib/library/modifiers.ts ruleFailures — the rule the
 * validator enforces), one level deep (never on another variant), never onto a name an earlier entry holds.
 */
export function buildModifierBatch(base: readonly LibraryExercise[], batch: number, known: Known | Set<string>, later: readonly LibraryExercise[] = []): LibraryExercise[] {
  const out: LibraryExercise[] = [];
  const has = (k: string) => (known instanceof Set ? known.has(k) : known.has(k));
  const claim = (k: string, id: string) => { if (known instanceof Set) known.add(k); else known.set(k, id); };
  for (const m of MODIFIERS.filter((x) => x.batch === batch)) {
    for (const b of m.pool === 'all' ? [...base, ...later] : base) {
      if (b.variantOf || ruleFailures(m.rule, b).length) continue;
      const name = m.name(b.name);
      if (name.length > 80 || name === b.name) continue;
      const nk = nameKey(name);
      const equipment = m.equipment ? m.equipment(b.equipment) : [...b.equipment];
      const sk = semanticKey({ pattern: b.pattern, equipment, name });
      if (has(nk) || has(sk)) continue;
      const id = slugify(name);
      claim(nk, id);
      claim(sk, id);
      const level = m.level === 'up' ? LEVEL_IDS[Math.min(LEVEL_IDS.length - 1, levelRank(b.level) + 1)]
        : m.level === 'down' ? LEVEL_IDS[Math.max(0, levelRank(b.level) - 1)] : b.level;
      out.push({
        ...b, id, slug: id, name, aliases: [], variation: `${b.variation}+${m.id}`, level,
        laterality: m.laterality ?? b.laterality, equipment, cues: [m.cue, ...b.cues.filter((c) => c !== m.cue && !(m.dropCues?.test(c)))].slice(0, 3),
        dosage: m.dosage ? m.dosage(b.dosage) : { ...b.dosage }, youthOk: b.youthOk && (m.youthOk ?? true),
        // an easier (down) modifier is the step BELOW its base; every other one is the step above
        regressionId: m.level === 'down' ? null : b.id, progressionId: m.level === 'down' ? b.id : null, variantOf: b.id,
        demo: { ...b.demo, imageRef: null },
        source: { kind: 'authored', ref: `${b.id}+${m.id}`, url: null, licence: AUTHORED_LICENCE },
        review: { status: 'draft', reviewer: null, batch: `authored-b${batch}-${b.review.batch.replace(/^(authored-b\d+|seed)-/, '')}` },
      });
    }
  }
  return out;
}

/** Every authored batch, in order, each one's names claimed before the next is built. Deterministic. */
export function buildAll(seed: readonly LibraryExercise[]): { batches: Map<number, LibraryExercise[]>; linked: Map<number, string[]> } {
  const known = knownOf(seed);
  const batches = new Map<number, LibraryExercise[]>();
  const linked = new Map<number, string[]>();
  const b1 = buildFamilies(BLOCKS.flat(), 1, known);
  batches.set(1, b1.entries);
  linked.set(1, b1.linked);
  const modBase = modifierBase(seed, b1.entries);
  const later: LibraryExercise[] = [];
  for (const n of [2, 3, 4]) {
    const fam = buildFamilies(LATER_BLOCKS.filter((f) => f.batch === n), n, known);
    later.push(...fam.entries);
    batches.set(n, [...fam.entries, ...buildModifierBatch(modBase, n, known, later)]);
    linked.set(n, fam.linked);
  }
  return { batches, linked };
}

function writeBatch(batch: number, write: readonly LibraryExercise[]): number {
  const dir = path.join(DATA, 'authored');
  for (const f of (() => { try { return readdirSync(dir); } catch { return []; } })()) if (f.startsWith(`b${batch}-`)) rmSync(path.join(dir, f));
  const byBlock = new Map<string, LibraryExercise[]>();
  for (const e of write) {
    const block = e.review.batch.replace(/^authored-b\d+-/, '');
    byBlock.set(block, [...(byBlock.get(block) ?? []), e]);
  }
  let bytes = 0;
  for (const [block, list] of [...byBlock.entries()].sort()) bytes += writeEntries(path.join(dir, `b${batch}-${block}.json`), list);
  console.log(`authored batch ${batch}: ${write.length} entries in ${byBlock.size} files, ${(bytes / 1024).toFixed(0)} KB`);
  console.log('  by category:', JSON.stringify(countBy(write, (e) => e.category)));
  return bytes;
}

function main() {
  const seed = readDir(path.join(DATA, 'seed'));
  const { batches, linked } = buildAll(seed);

  if (process.argv.includes('--count')) {
    let total = seed.length;
    console.log(`seed ${seed.length}`);
    for (const b of BATCHES) {
      const list = batches.get(b)!;
      total += list.length;
      console.log(`batch ${b}: +${list.length} → ${total}  ${JSON.stringify(countBy(list, (e) => e.category))}`);
    }
    return;
  }

  const which = process.argv.includes('--later') ? [2, 3, 4] : [Number(arg('--batch') ?? 1)];
  const dir = path.join(DATA, 'authored');
  const keep = readDir(dir).filter((e) => !which.some((b) => e.review.batch.startsWith(`authored-b${b}-`)));
  const write = which.flatMap((b) => batches.get(b) ?? []);
  const all = [...seed, ...keep, ...write];
  const issues = gate(`authored batch ${which.join(', ')}`, all);
  if (issues.length) process.exit(1);
  if (process.argv.includes('--dry')) { console.log(`authored batch ${which.join(', ')}: ${write.length} entries validate; library would be ${all.length} (nothing written)`); return; }
  for (const b of which) writeBatch(b, batches.get(b) ?? []);
  console.log(`library total ${all.length}`);
  for (const b of which) if (linked.get(b)?.length) console.log(`batch ${b}: linked to an earlier entry instead of written (${linked.get(b)!.length}): ${linked.get(b)!.join('; ')}`);
  console.log(`lib/library/files.ts: ${writeFilesIndex().length} data files`);
}

if (require.main === module) main();
