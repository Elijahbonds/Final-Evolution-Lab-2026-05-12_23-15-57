#!/usr/bin/env -S npx tsx
// scripts/library/import-seed.ts — EXERCISE-LIBRARY (2026-10-25): the open seed → data/library/seed/*.json.
//
// SOURCE: free-exercise-db by yuhonas, https://github.com/yuhonas/free-exercise-db — "Open Public Domain Exercise
// Dataset", released under the Unlicense (public domain dedication; commercial use allowed). Its own source,
// wrkout/exercises.json, is under the Unlicense too. The licence text and the pinned commit are recorded beside the
// data (data/library/seed/LICENSE-free-exercise-db.txt, SOURCE.json).
//
// WHAT IS TAKEN: the facts — name, level, equipment, muscles, category. WHAT IS NOT: the instruction prose (undocumented
// provenance, and body-part cues FEL's policy refuses) and the images (2,600+ files; each entry stores a pinned link to
// its first still instead). Set-up lines, cues and faults come from scripts/library/seedFamilies.ts, in FEL's words.
//
// Every entry lands APPROVED in a per-category batch ('seed-strength', …), by the owner's 2026-10-25 decision ("auto-approve
// seed, review ours"); the FEL-authored batches (scripts/library/author.ts) stay drafts for the admin review page.
//
// Run (writes data/library/seed/):
//   curl -sSo /tmp/exercises.json https://raw.githubusercontent.com/yuhonas/free-exercise-db/<sha>/dist/exercises.json
//   npx tsx scripts/library/import-seed.ts --from /tmp/exercises.json --sha <sha> [--licence path/to/LICENSE.md]

import { copyFileSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { PIN_EXERCISE } from '../../lib/coach/taxonomy';
import { clipKeyFor } from '../../lib/library/demo';
import { nameKey, slugify, terms } from '../../lib/library/search/text';
import type { LibraryExercise } from '../../lib/library/types';
import { dupKey, semanticKey } from '../../lib/library/validate';
import { PREHAB_NOTE, type CategoryId, type EquipmentId, type Laterality, type LevelId, type MovementPattern, type MuscleId, type Plane, type SportTag } from '../../lib/library/vocab';
import { DATA, fillSetup, gate, writeEntries, writeFilesIndex } from './common';
import { GENERAL_FAMILY, SEED_FAMILIES, type SeedFamily, type SeedRow } from './seedFamilies';

/** The reviewer recorded on every seed entry: the owner's standing decision, not a person's click. */
export const SEED_REVIEWER = 'owner:seed-auto-approve-2026-10-25';

const REPO = 'https://github.com/yuhonas/free-exercise-db';
export const SEED_LICENCE = 'Unlicense (public domain dedication) — free-exercise-db';

const MUSCLE: Record<string, MuscleId> = {
  abdominals: 'abs', hamstrings: 'hamstrings', adductors: 'adductors', quadriceps: 'quads', biceps: 'biceps', shoulders: 'delts',
  chest: 'chest', 'middle back': 'mid-back', calves: 'calves', glutes: 'glutes', 'lower back': 'lower-back', lats: 'lats',
  triceps: 'triceps', traps: 'traps', forearms: 'forearms', neck: 'neck', abductors: 'abductors',
};
const EQUIP: Record<string, EquipmentId | null> = {
  'body only': null, machine: 'machine', other: null, 'foam roll': 'foam-roller', kettlebells: 'kettlebell', dumbbell: 'dumbbell',
  cable: 'cable', barbell: 'barbell', bands: 'band', 'medicine ball': 'medicine-ball', 'exercise ball': 'stability-ball', 'e-z curl bar': 'ez-bar',
};
/** Equipment a name implies when the row says "other" or nothing (or adds to what it says). */
const NAME_EQUIP: [RegExp, EquipmentId][] = [
  [/\bbench\b/, 'bench'], [/\bbox\b/, 'box'], [/\bbands?\b/, 'band'], [/\bsled\b|\bprowler\b|\bdrags?\b/, 'sled'], [/\bsandbag\b/, 'sandbag'],
  [/\bplate\b/, 'plate'], [/\bkettlebell/, 'kettlebell'], [/\bdumbbell/, 'dumbbell'], [/\bbarbell|axle\b/, 'barbell'], [/\btrap bar\b/, 'trap-bar'],
  [/\blandmine\b/, 'landmine'], [/\bcable|pulley\b/, 'cable'], [/\bsmith|leverage|machine|leg press|hack squat\b/, 'machine'],
  [/\bsuspended|straps\b/, 'suspension-trainer'], [/\bring\b|\brings\b/, 'rings'], [/\bpull[- ]?ups?\b|\bchin[- ]?ups?\b|\bchins\b|\bhanging\b|muscle up/, 'pull-up-bar'],
  [/\bdips\b|\bdip machine\b|parallel bars?/, 'dip-bars'], [/\bmedicine ball|chest pass|chest push\b/, 'medicine-ball'], [/\brope jumping\b/, 'jump-rope'],
  [/\bbike|bicycling, stationary|recumbent\b/, 'bike'], [/\browing, stationary\b/, 'rower'], [/\btreadmill\b/, 'treadmill'],
  [/\btowel\b/, 'towel'], [/\bwall\b/, 'wall'], [/\bcone|hurdle\b/, 'cone'], [/\byoke|atlas|stone|keg|tire|log lift|circus bell|conan|rickshaw|car deadlift\b/, 'strongman'],
  [/\bfoam|smr\b/, 'foam-roller'], [/\bexercise ball|stability ball|physioball|swiss ball\b/, 'stability-ball'], [/\bweighted ball\b/, 'medicine-ball'],
  [/\bstairmaster|step mill\b/, 'machine'], [/\belliptical\b/, 'machine'], [/\bab roller|wheel\b/, 'ab-wheel'], [/\bbattling ropes|rope climb\b/, 'other'],
];

/** Seed names that would read as a different exercise in this library (kept as an alias). */
const RENAME: Record<string, string> = {
  'Split Squats': 'Split Squat Stretch',
};

const ADULT_ONLY = /behind (the )?(neck|head)|car deadlift|atlas|yoke|keg|log lift|tire flip|circus bell|conan|depth jump|depth leap|kipping|with chains|reverse band|guillotine|rack delivery|heaving|hanging bar good morning|jefferson/;

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

function laterality(n: string): Laterality {
  if (/\balternat/.test(n)) return 'alternating';
  if (/\b(one|single)[- ](arm|leg|legged|handed)|single dumbbell|one arm|one leg|kickback|split|lunge|step[- ]?up|pistol|lateral hop|single cone|side lying|on your side/.test(n)) return 'unilateral';
  return 'bilateral';
}

function planeFor(f: SeedFamily, n: string, pattern: MovementPattern): Plane {
  if (f.plane) return f.plane;
  if (/lateral|side|abduct|adduct|carioca|skater|skating|shuffle/.test(n)) return 'frontal';
  if (pattern === 'rotation' || /twist|rotation|chop|windmill|180/.test(n)) return 'transverse';
  if (pattern === 'mobility') return 'multi';
  return 'sagittal';
}

function categoryFor(f: SeedFamily, r: SeedRow): CategoryId {
  if (f.category === 'prehab' || f.category === 'recovery') return f.category;
  if (r.category === 'stretching') return 'mobility';
  if (r.category === 'cardio') return 'conditioning';
  if (r.category === 'olympic weightlifting') return 'power';
  if (r.category === 'plyometrics') return f.id === 'throw' ? 'power' : f.category === 'speed-agility' ? 'speed-agility' : 'plyometric';
  return f.category ?? 'strength';
}

const LEVEL: Record<string, LevelId> = { beginner: 'beginner', intermediate: 'intermediate', expert: 'advanced' };

export function mapRow(r: SeedRow, sha: string): { entry: LibraryExercise; family: string } {
  const n = r.name.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const f = SEED_FAMILIES.find((x) => x.match(n, r)) ?? GENERAL_FAMILY;
  const pattern: MovementPattern = typeof f.pattern === 'function' ? f.pattern(n, r)
    : f.id === 'general' ? (r.force === 'push' ? 'push' : r.force === 'pull' ? 'pull' : 'other') : f.pattern;

  const eq = new Set<EquipmentId>();
  const mapped = r.equipment ? EQUIP[r.equipment] : null;
  if (mapped) eq.add(mapped);
  for (const [re, id] of NAME_EQUIP) if (re.test(n) && !(id === 'bench' && eq.has('machine'))) eq.add(id);
  // a bench dip or a ring dip needs no dip station
  if (eq.has('dip-bars') && (eq.has('bench') || eq.has('rings'))) eq.delete('dip-bars');
  if (r.equipment === 'other' && eq.size === 0) eq.add('other');
  const equipment = [...eq];

  const lat = laterality(n);
  const category = categoryFor(f, r);
  const primary = [...new Set(r.primaryMuscles.map((m) => MUSCLE[m]).filter(Boolean))] as MuscleId[];
  const secondary = [...new Set(r.secondaryMuscles.map((m) => MUSCLE[m]).filter(Boolean))].filter((m) => !primary.includes(m)) as MuscleId[];
  const level = LEVEL[r.level] ?? 'intermediate';
  const cautions = [...(f.cautions ?? [])];
  if (/behind (the )?(neck|head)/.test(n)) cautions.push('Behind-the-neck positions ask for a lot of shoulder range: the in-front version is the default.');
  if (/with chains|with bands|reverse band/.test(n) && f.category !== 'prehab') cautions.push('Bands and chains change the load through the rep: learn the straight-weight version first.');
  const youthOk = (f.youthOk ?? true) && level !== 'advanced' && !ADULT_ONLY.test(n) && !PIN_EXERCISE.test(r.name);
  const sport: SportTag[] = ['general'];
  if (category === 'plyometric' || category === 'speed-agility' || f.goals.includes('vertical')) sport.push('basketball', 'volleyball', 'track');

  const name = RENAME[r.name.trim()] ?? r.name.trim();
  const id = slugify(name);
  const variation = terms(name).filter((t) => !['dumbbell', 'kettlebell', 'barbell', 'cabl', 'band', 'machin'].includes(t)).join('-') || 'base';
  const entry: LibraryExercise = {
    id, slug: id, name, aliases: [], family: f.id, variation,
    pattern, plane: planeFor(f, n, pattern), laterality: lat, category, level, equipment,
    primaryMuscles: primary.length ? primary : (f.muscles ?? ['abs']), secondaryMuscles: secondary,
    sportTags: sport, goals: [...new Set(f.goals)], skillLayer: f.skillLayer, braceMode: f.braceMode,
    setup: fillSetup(f.setup, equipment, lat !== 'bilateral'), cues: [...f.cues], faults: f.faults.map((x) => ({ ...x })),
    regressionId: null, progressionId: null, cautions: cautions.slice(0, 4), lowLoad: [...(f.lowLoad ?? [])], youthOk,
    prehabNote: category === 'prehab' ? PREHAB_NOTE : null, dosage: { ...f.dosage },
    demo: { clipKey: f.clip ?? clipKeyFor(pattern, f.id), videoUrl: null, imageRef: r.images[0] ? `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${sha}/exercises/${r.images[0]}` : null },
    source: { kind: 'seed', ref: r.id, url: `${REPO}/blob/${sha}/exercises/${r.id}.json`, licence: SEED_LICENCE },
    // Owner decision 2026-10-25: "auto-approve seed, review ours" — the public-domain seed's facts (with FEL's own cue
    // families) go live; FEL-authored batches stay drafts for the owner's review.
    review: { status: 'approved', reviewer: SEED_REVIEWER, batch: `seed-${category}` },
  };
  return { entry, family: f.id };
}

function main() {
  const from = arg('--from');
  const sha = arg('--sha');
  if (!from || !sha || !/^[0-9a-f]{40}$/.test(sha)) {
    console.error('usage: import-seed.ts --from <exercises.json> --sha <40-hex commit> [--licence <LICENSE.md>]');
    process.exit(2);
  }
  const rows = JSON.parse(readFileSync(from, 'utf8')) as SeedRow[];
  const out: LibraryExercise[] = [];
  const seenName = new Map<string, string>();
  const seenKey = new Set<string>();
  const dropped: string[] = [];
  const families: Record<string, number> = {};
  for (const r of rows) {
    const { entry, family } = mapRow(r, sha);
    const nk = nameKey(entry.name);
    if (seenName.has(nk) || seenKey.has(dupKey(entry)) || seenKey.has(semanticKey(entry)) || out.some((e) => e.id === entry.id)) { dropped.push(`${entry.name} (same as ${seenName.get(nk) ?? 'an earlier row'})`); continue; }
    seenName.set(nk, entry.name);
    seenKey.add(dupKey(entry));
    seenKey.add(semanticKey(entry));
    families[family] = (families[family] ?? 0) + 1;
    out.push(entry);
  }
  const issues = gate('seed', out);
  if (issues.length) process.exit(1);

  const dir = path.join(DATA, 'seed');
  mkdirSync(dir, { recursive: true });
  const byCat = new Map<string, LibraryExercise[]>();
  for (const e of out) byCat.set(e.category, [...(byCat.get(e.category) ?? []), e]);
  let bytes = 0;
  for (const [cat, list] of [...byCat.entries()].sort()) bytes += writeEntries(path.join(dir, `${cat}.json`), list.sort((a, b) => a.id.localeCompare(b.id)));
  writeFileSync(path.join(dir, 'SOURCE.json'), `${JSON.stringify({
    name: 'free-exercise-db', repository: REPO, commit: sha, file: `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${sha}/dist/exercises.json`,
    licence: 'Unlicense', licenceUrl: `${REPO}/blob/${sha}/LICENSE.md`, upstream: 'https://github.com/wrkout/exercises.json (Unlicense)',
    retrieved: new Date().toISOString().slice(0, 10), rows: rows.length, imported: out.length, droppedAsDuplicates: dropped.length,
    taken: ['name', 'level', 'equipment', 'primaryMuscles', 'secondaryMuscles', 'category', 'id (as source.ref)', 'first image path (as a link)'],
    notTaken: ['instructions (prose)', 'images (files)'],
  }, null, 2)}\n`);
  const lic = arg('--licence');
  if (lic) copyFileSync(lic, path.join(dir, 'LICENSE-free-exercise-db.txt'));
  console.log(`seed: ${rows.length} rows → ${out.length} entries (${dropped.length} duplicates dropped), ${(bytes / 1024).toFixed(0)} KB`);
  console.log('families:', JSON.stringify(Object.fromEntries(Object.entries(families).sort((a, b) => b[1] - a[1]))));
  if (dropped.length) console.log('dropped:', dropped.join('; '));
  console.log(`lib/library/files.ts: ${writeFilesIndex().length} data files`);
}

if (require.main === module) main();
