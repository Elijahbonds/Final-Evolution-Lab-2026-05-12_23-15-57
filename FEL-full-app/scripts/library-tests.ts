#!/usr/bin/env -S npx tsx
// scripts/library-tests.ts — EXERCISE-LIBRARY (2026-10-25): the shared exercise library's CI suite.
//
//   A. THE DATA: every entry in data/library/** passes lib/library/validate.ts checkLibrary (schema, fixed lists, links,
//      duplicates, cueLint, no medical claims, source + licence + review, modifier rules), the library holds at least
//      5,000 entries (owner decision 2026-10-25; batches 2–4 — it was 1,500 after batch 1),
//      every unreviewed entry is a draft, every prehab entry carries the prehab note, and lib/library/files.ts imports
//      exactly the files on disk.
//   B. THE SEED'S LICENCE: the licence text and the pinned source are in the repo, and every seed entry links back.
//   C. CONTROLS: each check is shown to catch a broken entry (a mutant per check), so a green run means something.
//
// Run: npx tsx scripts/library-tests.ts

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { LIBRARY_FILES, loadLibraryFiles } from '../lib/library/files';
import type { LibraryExercise } from '../lib/library/types';
import { checkEntry, checkLibrary } from '../lib/library/validate';
import { PREHAB_NOTE } from '../lib/library/vocab';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const APP = path.join(__dirname, '..');
const DATA = path.join(APP, 'data', 'library');
const entries = loadLibraryFiles();

// ── A. the data ─────────────────────────────────────────────────────────────────────────────────────────────────────
const issues = checkLibrary(entries);
ok(issues.length === 0, `A1 validator: ${issues.length} issue(s), first: ${issues.slice(0, 5).map((i) => `${i.id} [${i.check}] ${i.detail}`).join(' | ')}`);
ok(entries.length >= 5000, `A2 at least 5,000 entries (have ${entries.length})`);
ok(entries.every((e) => e.review.status === 'draft' || !!e.review.reviewer), 'A3 every entry is a draft or names its reviewer');
ok(entries.filter((e) => e.category === 'prehab').every((e) => e.prehabNote === PREHAB_NOTE), 'A4 every prehab entry carries the prehab note');
ok(entries.filter((e) => e.category !== 'prehab').every((e) => e.prehabNote === null), 'A5 no prehab note outside prehab');
const onDisk = ['seed', 'authored'].flatMap((d) => (existsSync(path.join(DATA, d)) ? readdirSync(path.join(DATA, d)) : [])
  .filter((f) => f.endsWith('.json') && !f.startsWith('SOURCE')).map((f) => `${d}/${f}`)).sort();
ok(JSON.stringify([...LIBRARY_FILES].sort()) === JSON.stringify(onDisk), `A6 lib/library/files.ts imports exactly the data files on disk (run scripts/library/author.ts to regenerate)`);
ok(new Set(entries.map((e) => e.source.kind)).size >= 2, 'A7 both seed and authored entries are present');
ok(entries.some((e) => e.regressionId) && entries.some((e) => e.progressionId), 'A8 the ladders are linked');
const media = ['seed', 'authored'].flatMap((d) => (existsSync(path.join(DATA, d)) ? readdirSync(path.join(DATA, d)) : []))
  .filter((f) => !/\.(json|txt)$/.test(f));
ok(media.length === 0, `A9 JSON and text only under data/library (found ${media.join(', ')})`);

// ── B. the seed's licence ───────────────────────────────────────────────────────────────────────────────────────────
const licence = path.join(DATA, 'seed', 'LICENSE-free-exercise-db.txt');
ok(existsSync(licence) && /released into the public domain/.test(readFileSync(licence, 'utf8')), 'B1 the seed licence text (Unlicense) is in the repo');
const source = existsSync(path.join(DATA, 'seed', 'SOURCE.json')) ? JSON.parse(readFileSync(path.join(DATA, 'seed', 'SOURCE.json'), 'utf8')) as { commit?: string; licence?: string; repository?: string } : {};
ok(/^[0-9a-f]{40}$/.test(source.commit ?? '') && source.licence === 'Unlicense' && /github\.com\/yuhonas\/free-exercise-db/.test(source.repository ?? ''), 'B2 SOURCE.json pins the repository, the commit and the licence');
const seed = entries.filter((e) => e.source.kind === 'seed');
ok(seed.length > 0 && seed.every((e) => !!e.source.url && e.source.url.includes(source.commit ?? '@@') && /Unlicense/.test(e.source.licence)), 'B3 every seed entry links to its pinned source row and names the licence');

// ── C. controls: each check catches a mutant ────────────────────────────────────────────────────────────────────────
const base = entries.find((e) => e.source.kind === 'authored' && e.category === 'strength')!;
const mutant = (patch: Partial<LibraryExercise>): LibraryExercise => ({ ...structuredClone(base), ...patch });
const caught = (e: LibraryExercise, check: string) => checkEntry(e).some((i) => i.check === check);
ok(caught(mutant({ primaryMuscles: ['bicepz' as never] }), 'list'), 'C1 an unknown muscle id is caught');
ok(caught(mutant({ equipment: ['kettle bell' as never] }), 'list'), 'C2 an unknown equipment id is caught');
ok(caught(mutant({ cues: ['Squeeze your glutes hard at the top.'] }), 'cueLint'), 'C3 a muscle-squeeze cue is caught by cueLint');
ok(caught(mutant({ cautions: ['This fixes your knee tendinitis.'] }), 'claims'), 'C4 a condition / treatment claim is caught');
ok(caught(mutant({ source: { kind: 'authored', ref: null, url: null, licence: '' } }), 'source'), 'C5 a missing licence is caught');
ok(caught(mutant({ cues: [] }), 'schema'), 'C6 an entry with no cues is caught');
ok(caught(mutant({ category: 'prehab' }), 'prehab'), 'C7 a prehab entry without the prehab note is caught');
const twin = mutant({ id: 'twin', slug: 'twin', name: `${base.name}s` });
ok(checkLibrary([base, twin]).some((i) => i.check === 'duplicate'), 'C8 a near-duplicate name is caught');
ok(checkLibrary([mutant({ regressionId: 'no-such-entry' })]).some((i) => i.check === 'links'), 'C9 a dangling link is caught');
ok(caught(mutant({ youthOk: true, cues: ['Go all-out against the floor.'] }), 'youth'), 'C10 max-effort wording on a youth entry is caught');

// the modifier rules (lib/library/modifiers.ts): a '+modifier' entry on a base its rule refuses fails the library check
const named = (n: string) => entries.find((e) => e.name === n)!;
const variant = (b: LibraryExercise, mod: string, name: string): LibraryExercise => ({
  ...structuredClone(b), id: `ctl-${mod}`, slug: `ctl-${mod}`, name, aliases: [], variation: `${b.variation}+${mod}`, variantOf: b.id,
  regressionId: b.id, progressionId: null, source: { kind: 'authored', ref: null, url: null, licence: 'FEL original (Final Evolution Lab)' },
  review: { status: 'draft', reviewer: null, batch: 'authored-b9-control' },
});
const modifierCaught = (b: LibraryExercise, v: LibraryExercise) => checkLibrary([b, v]).some((i) => i.id === v.id && i.check === 'modifier');
const plyoPush = named('Plyo Kettlebell Pushups');
ok(modifierCaught(plyoPush, variant(plyoPush, 'paused', 'Paused Plyo Kettlebell Pushups')), 'C11 R1: a paused plyometric entry is caught');
ok(modifierCaught(plyoPush, variant(plyoPush, 'iso-hold', 'Plyo Kettlebell Pushups Isometric Hold')), 'C12 R1: an isometric hold on a plyometric entry is caught');
const swing = named('Vertical Swing');
ok(modifierCaught(swing, variant(swing, 'timed', 'Vertical Swing Against the Clock')), 'C13 R2: "Against the Clock" on a swing is caught');
const barbellPress = entries.find((e) => e.category === 'strength' && e.pattern === 'push' && e.equipment.includes('barbell'))!;
ok(modifierCaught(barbellPress, variant(barbellPress, 'single-arm', `Single-Arm ${barbellPress.name}`)), 'C14 R3: a single-arm barbell lift is caught');
const thrust = entries.find((e) => e.category === 'strength' && e.pattern === 'hinge' && /hip thrust/i.test(e.name))!;
ok(modifierCaught(thrust, variant(thrust, 'deficit', `Deficit ${thrust.name}`)), 'C15 R4: a deficit on a lift that does not stand on the floor is caught');
const goblet = named('Goblet Squat');
const tempoGoblet = variant(goblet, 'tempo', 'Goblet Squat Slow Lower Control');
const stacked = { ...variant(tempoGoblet, 'paused', 'Paused Goblet Squat Slow Lower Control'), id: 'ctl-stacked', slug: 'ctl-stacked', variantOf: tempoGoblet.id };
ok(checkLibrary([goblet, tempoGoblet, stacked]).some((i) => i.id === 'ctl-stacked' && i.check === 'modifier'), 'C16 R5: a modifier stacked on a modifier is caught');
ok(checkEntry({ ...tempoGoblet, variantOf: undefined }).some((i) => i.check === 'modifier'), 'C17 a "+modifier" entry that names no base is caught');
ok(!modifierCaught(goblet, tempoGoblet), 'C18 control: a tempo goblet squat passes (the rules refuse nonsense, not everything)');

console.log(`library: ${entries.length} entries; ${checks - fail.length}/${checks} checks passed`);
if (fail.length) { for (const f of fail) console.error(`  ✗ ${f}`); process.exit(1); }
