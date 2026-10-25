#!/usr/bin/env -S npx tsx
// scripts/library/author.ts — EXERCISE-LIBRARY (2026-10-25): FEL's authored entries → data/library/authored/*.json.
//
// Owner decisions (2026-10-25): after the open seed, "author the rest ourselves, in the owner's voice and method, as AI
// drafts that the owner reviews"; never copy TrueCoach, ExRx, Muscle & Motion or any other list. So every entry here
// is generated from FEL's own taxonomy matrix (./authoring/*.ts — family × variant, then ./authoring/modifiers.ts in
// later batches), in the cue style of the catalogue and the Blueprint (lib/coach/taxonomy.ts SETUP_CUES, the Playbook's
// own cues), checked by the same validator the CI suite runs, and written as DRAFTS for the owner's review.
//
// NO NEAR-DUPLICATES. An authored variant whose name already names a seed entry is not written: its ladder links point
// at the seed entry instead (so the seed row gains an easier and a harder neighbour without being copied). Any other
// clash — a name, an alias, a (pattern, equipment, variation) key — stops the run.
//
// Run:
//   npx tsx scripts/library/author.ts                 # batch 1 → data/library/authored/b1-<block>.json
//   npx tsx scripts/library/author.ts --batch 2       # batch 2 (modifiers) → data/library/authored/b2-<block>.json
//   npx tsx scripts/library/author.ts --count         # what every batch would add, written nowhere

import path from 'node:path';
import { rmSync, readdirSync } from 'node:fs';
import { clipKeyFor } from '../../lib/library/demo';
import { nameKey, slugify } from '../../lib/library/search/text';
import type { LibraryExercise } from '../../lib/library/types';
import { countBy, semanticKey } from '../../lib/library/validate';
import { LEVEL_IDS, PREHAB_NOTE, levelRank } from '../../lib/library/vocab';
import { DATA, gate, readDir, writeEntries, writeFilesIndex } from './common';
import { BLOCKS } from './authoring/blocks';
import { MODIFIERS } from './authoring/modifiers';
import type { Family, Variant } from './authoring/types';

export const AUTHORED_LICENCE = 'FEL original (Final Evolution Lab), all rights reserved';

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

function entryOf(f: Family, v: Variant): LibraryExercise {
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
    dosage: { ...f.dosage, ...(v.dosage ?? {}) },
    demo: { clipKey: v.clip ?? (v.pattern ? clipKeyFor(v.pattern, f.family) : f.clip ?? clipKeyFor(f.pattern, f.family)), videoUrl: null, imageRef: null },
    source: { kind: 'authored', ref: `${f.block}/${f.family}/${v.v}`, url: null, licence: AUTHORED_LICENCE },
    review: { status: 'draft', reviewer: null, batch: `authored-b1-${f.block}` },
  };
}

/** Batch 1: every family's variants, ladders linked, seed collisions resolved to the seed id. */
export function buildBatch1(seed: readonly LibraryExercise[]): { entries: LibraryExercise[]; linkedToSeed: string[] } {
  const seedByName = new Map(seed.flatMap((e) => [[nameKey(e.name), e.id], [semanticKey(e), e.id]] as [string, string][]));
  const out: LibraryExercise[] = [];
  const linkedToSeed: string[] = [];
  for (const f of BLOCKS.flat()) {
    const ladders = new Map<string, string[]>();
    const made = new Map<string, LibraryExercise>();
    for (const v of f.variants) {
      const e = entryOf(f, v);
      const seedId = seedByName.get(nameKey(e.name)) ?? seedByName.get(semanticKey(e));
      const id = seedId ?? e.id;
      if (seedId) linkedToSeed.push(`${e.name} → ${seedId}`);
      else { made.set(id, e); out.push(e); }
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
  }
  return { entries: out, linkedToSeed };
}

/** What the modifiers apply to: FEL's batch-1 entries, then the seed's (Olympic lifts and recovery work excluded). */
export function modifierBase(seed: readonly LibraryExercise[], batch1: readonly LibraryExercise[]): LibraryExercise[] {
  return [...batch1, ...seed.filter((e) => e.category !== 'power' && e.category !== 'recovery')];
}

/** A later batch: each modifier of that batch applied to every batch-1 entry it fits. */
export function buildModifierBatch(base: readonly LibraryExercise[], batch: number, taken: Set<string>): LibraryExercise[] {
  const out: LibraryExercise[] = [];
  for (const m of MODIFIERS.filter((x) => x.batch === batch)) {
    for (const b of base) {
      if (!m.applies(b)) continue;
      const name = m.name(b.name);
      if (name.length > 80) continue;
      const nk = nameKey(name);
      const equipment = m.equipment ? m.equipment(b.equipment) : [...b.equipment];
      const sk = semanticKey({ pattern: b.pattern, equipment, name });
      if (taken.has(nk) || taken.has(sk)) continue;
      taken.add(nk);
      taken.add(sk);
      const id = slugify(name);
      const level = m.level === 'up' ? LEVEL_IDS[Math.min(LEVEL_IDS.length - 1, levelRank(b.level) + 1)] : b.level;
      out.push({
        ...b, id, slug: id, name, aliases: [], variation: `${b.variation}+${m.id}`, level,
        laterality: m.laterality ?? b.laterality, equipment, cues: [m.cue, ...b.cues.filter((c) => c !== m.cue)].slice(0, 3),
        dosage: m.dosage ? m.dosage(b.dosage) : { ...b.dosage }, youthOk: b.youthOk && (m.youthOk ?? true),
        regressionId: b.id, progressionId: null,
        source: { ...b.source, ref: `${b.source.ref}+${m.id}` },
        review: { status: 'draft', reviewer: null, batch: `authored-b${batch}-${b.review.batch.replace(/^authored-b\d+-/, '')}` },
      });
    }
  }
  return out;
}

function main() {
  const seed = readDir(path.join(DATA, 'seed'));
  const { entries, linkedToSeed } = buildBatch1(seed);
  const taken = new Set([...seed, ...entries].flatMap((e) => [nameKey(e.name), semanticKey(e), ...e.aliases.map(nameKey)]));

  if (process.argv.includes('--count')) {
    let total = seed.length + entries.length;
    console.log(`seed ${seed.length}, batch 1 ${entries.length} → ${total}`);
    for (const b of [2, 3, 4]) {
      const more = buildModifierBatch(modifierBase(seed, entries), b, taken);
      total += more.length;
      console.log(`batch ${b}: +${more.length} → ${total}`);
    }
    return;
  }

  const batch = Number(arg('--batch') ?? 1);
  const dir = path.join(DATA, 'authored');
  const prev = readDir(dir).filter((e) => !e.review.batch.startsWith(`authored-b${batch}-`));
  let write: LibraryExercise[];
  if (batch === 1) write = entries;
  else {
    for (let b = 2; b < batch; b++) buildModifierBatch(modifierBase(seed, entries), b, taken);
    write = buildModifierBatch(modifierBase(seed, entries), batch, taken);
  }
  const all = [...seed, ...(batch === 1 ? [] : prev), ...write];
  const issues = gate(`authored batch ${batch}`, all);
  if (issues.length) process.exit(1);
  if (process.argv.includes('--dry')) { console.log(`authored batch ${batch}: ${write.length} entries validate; library would be ${all.length} (nothing written)`); return; }

  for (const f of (() => { try { return readdirSync(dir); } catch { return []; } })()) if (f.startsWith(`b${batch}-`)) rmSync(path.join(dir, f));
  const byBlock = new Map<string, LibraryExercise[]>();
  for (const e of write) {
    const block = e.review.batch.replace(/^authored-b\d+-/, '');
    byBlock.set(block, [...(byBlock.get(block) ?? []), e]);
  }
  let bytes = 0;
  for (const [block, list] of [...byBlock.entries()].sort()) bytes += writeEntries(path.join(dir, `b${batch}-${block}.json`), list);
  console.log(`authored batch ${batch}: ${write.length} entries in ${byBlock.size} files, ${(bytes / 1024).toFixed(0)} KB; library total ${all.length}`);
  if (batch === 1) console.log(`linked to the seed instead of written (${linkedToSeed.length}): ${linkedToSeed.join('; ')}`);
  console.log('by category:', JSON.stringify(countBy(write, (e) => e.category)));
  console.log(`lib/library/files.ts: ${writeFilesIndex().length} data files`);
}

if (require.main === module) main();
