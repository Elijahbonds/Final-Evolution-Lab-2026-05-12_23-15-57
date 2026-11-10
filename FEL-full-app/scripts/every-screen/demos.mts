// scripts/every-screen/demos.mts — EVERY-SCREEN P2 (2026-11-10): does every exercise a built-in or signature program
// puts in the session player show its own demo, or the labelled still — never another movement?
//
// Read only. It calls the same functions the pages call and edits nothing (demo-loops owns lib/library/demo.ts and the
// loops; this only reads them):
//   · SIGNATURE   app/train/programs/[id]/page.tsx: clipsFor(signatureExerciseIds(program), library entry by id), and
//                 every session the plan can serve under every day gate (a swap or an easier version is a different id);
//   · TEMPLATES   FEL's seven coach templates (lib/coach/templates), every rung of every ladder a wave can reach, through
//                 the reader GET /api/coach/me/today uses (lib/coach/todayExtras.ts libraryClips: the library entry by
//                 name, approved and youth-safe, else the catalogue loop). libraryClips imports 'server-only', so its
//                 five lines are mirrored here — assumption, flagged: if it changes, this mirror must follow;
//   · BUILDER     /train/build (lib/program-ask/server.ts): clipsFor(program.exerciseIds) over a grid of requests (every
//                 goal × level × age × four kits × 2–6 days × jumps open or closed), plus every option a choice offers.
//
// "Right" is checked independently of the rule that picked the loop: each loop's name is read into a movement (squat,
// hinge, lunge, push, pull, carry, rotation, jump, run, core, mobility), and an exercise whose own pattern tag does not
// allow that movement is listed as SUSPECT for a person to look at. The hand verdicts on every suspect are in VERDICTS
// below (each with its reason); a suspect with no verdict fails the run. A null loop is the still labelled
// "Demo coming" — listed as MISSING, for the animation lane.
//
//   npx tsx scripts/every-screen/demos.mts            → docs/every-screen/demos.json + docs/every-screen/demos.md
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { LibraryExercise } from '@/lib/library/types';
import type { DayGate } from '@/lib/signature/serve';
import type { AgeBand, ProgramGoal } from '@/lib/program-ask/types';

// the app's modules load as CommonJS under tsx, and some named exports are not visible to an ESM import: read each
// module's exports whole
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = async (p: string): Promise<any> => { const m = await import(p); return { ...(m.default ?? {}), ...m }; };
const { loadLibraryFiles } = await load('@/lib/library/files');
const { clipsFor } = await load('@/lib/session-player/clips');
const { demoClipFor } = await load('@/lib/library/demo');
const { matchLibraryByName } = await load('@/lib/library/match');
const { catalogueDemoLoop } = await load('@/lib/library/surfaceDemo');
const { SIGNATURE_PROGRAMS } = await load('@/lib/signature/content');
const { expandPlan } = await load('@/lib/signature/plan');
const { CAREFUL_GATE, serveSession } = await load('@/lib/signature/serve');
const { signatureExerciseIds } = await load('@/lib/session-player/fromSignature');
const { TEMPLATES, expandTemplate } = await load('@/lib/coach/templates');
const { templateExercise, ladderKeysFor } = await load('@/lib/coach/templateCatalogue');
const { buildProgram } = await load('@/lib/program-ask/build');

const OUT = join(process.cwd(), 'docs/every-screen');
const LIB: LibraryExercise[] = loadLibraryFiles();
const BY_ID = new Map(LIB.map((e) => [e.id, e]));

export interface Row {
  source: 'signature' | 'template' | 'builder';
  /** where it appears: the program(s) or template(s) */
  in: string[];
  id: string;
  name: string;
  /** the exercise's own pattern tag (the library's; a template row's own when no library entry matched) */
  pattern: string;
  family: string;
  variation: string;
  clip: string | null;
  /** how the loop was chosen */
  via: 'library' | 'catalogue' | 'none';
  /** for a still: why — the animation lane can only fix 'no loop' */
  still?: 'no loop' | 'not approved' | 'not youth-safe' | 'no library entry by name';
  /** for a still held back by review or age: the loop the library would play */
  heldLoop?: string | null;
}

// ── signature ────────────────────────────────────────────────────────────────────────────────────────────────────
const OPEN: DayGate = { youth: false, hardStopped: false, painDecision: null, jumpGate: { closed: false, why: '', href: null }, readinessLow: false };
const GATES: DayGate[] = [OPEN, { ...OPEN, youth: true }, CAREFUL_GATE, { ...OPEN, readinessLow: true }, { ...OPEN, painDecision: 'easier_variation' },
  { ...OPEN, jumpGate: { closed: true, why: '', href: null } }];
const lookup = (id: string) => { const e = BY_ID.get(id); return e ? { id: e.id, name: e.name, setup: e.setup, cues: e.cues, faults: e.faults, pattern: e.pattern, category: e.category, youthOk: e.youthOk, prehabNote: e.prehabNote, dosage: e.dosage } : null; };

const rows = new Map<string, Row>();
const add = (key: string, r: Row, where: string) => {
  const had = rows.get(key);
  if (had) { if (!had.in.includes(where)) had.in.push(where); return; }
  rows.set(key, { ...r, in: [where] });
};
const libRow = (source: Row['source'], e: LibraryExercise, clip: string | null): Row =>
  ({ source, in: [], id: e.id, name: e.name, pattern: e.pattern, family: e.family, variation: e.variation, clip, via: clip ? 'library' : 'none', ...(clip ? {} : { still: 'no loop' as const }) });

const signatureUnserved: string[] = [];
for (const p of SIGNATURE_PROGRAMS) {
  const ids = signatureExerciseIds(p);
  const clips = clipsFor(ids, (id) => BY_ID.get(id) ?? null);
  for (const id of ids) { const e = BY_ID.get(id); if (e) add(`s:${id}`, libRow('signature', e, clips[id]), p.id); }
  // every id a served session can play must be in the page's clip map, or the player shows the still for a reason
  // nobody chose
  for (const g of GATES) for (const w of expandPlan(p, { youth: g.youth })) for (const s of w.sessions) {
    for (const it of serveSession(s, g, lookup).items) if (!(it.ex in clips)) signatureUnserved.push(`${p.id}: ${it.ex}`);
  }
}

// ── templates ────────────────────────────────────────────────────────────────────────────────────────────────────
/** lib/coach/todayExtras.ts libraryClips, mirrored (it imports 'server-only'). */
function templateClip(name: string, youth: boolean): { clip: string | null; e: LibraryExercise | null; via: Row['via']; still?: Row['still']; heldLoop?: string | null } {
  const e = matchLibraryByName(LIB, [name]);
  if (e) {
    const clip = e.review.status === 'approved' && (!youth || e.youthOk) ? demoClipFor(e) : null;
    if (clip) return { clip, e, via: 'library' };
    const own: string | null = demoClipFor(e);
    const still: Row['still'] = !own ? 'no loop' : e.review.status !== 'approved' ? 'not approved' : 'not youth-safe';
    return { clip: null, e, via: 'none', still, heldLoop: own };
  }
  const clip = catalogueDemoLoop(name);
  return { clip, e: null, via: clip ? 'catalogue' : 'none', ...(clip ? {} : { still: 'no library entry by name' as const }) };
}
const templateNames = new Map<string, string>();   // key → name
for (const t of TEMPLATES) {
  const keys = new Set<string>();
  for (const wave of t.kind === 'camp' ? [1] as const : [1, 2, 3] as const) {
    for (const w of expandTemplate(t, { wave })) for (const s of w.sessions) for (const it of s.items) { keys.add(it.exercise); if (it.stepDown) keys.add(it.stepDown); }
  }
  for (const k of ladderKeysFor(keys)) keys.add(k);   // a coach steps an athlete up or down the ladder from the builder
  const youth = t.audience === 'youth';
  for (const k of keys) {
    const x = templateExercise(k);
    if (!x) continue;
    templateNames.set(k, x.catalogue.name);
    const { clip, e, via, still, heldLoop } = templateClip(x.catalogue.name, youth);
    const r: Row = e ? { ...libRow('template', e, clip), via, name: x.catalogue.name, ...(still ? { still, heldLoop } : {}) }
      : { source: 'template', in: [], id: `catalogue:${k}`, name: x.catalogue.name, pattern: x.catalogue.pattern, family: '', variation: '', clip, via, ...(still ? { still } : {}) };
    add(`t:${k}`, r, t.id);   // (no template exercise plays differently for a youth and an adult template today)
  }
}

// ── builder ──────────────────────────────────────────────────────────────────────────────────────────────────────
const GOALS: ProgramGoal[] = ['full-body', 'strength', 'muscle', 'conditioning', 'athletic', 'mobility', 'sport'];
const KITS: string[][] = [[], ['band'], ['dumbbell'], ['barbell', 'dumbbell', 'kettlebell', 'cable', 'machine', 'pull-up-bar', 'bench', 'box', 'band', 'trap-bar']];
let builds = 0, buildFails = 0;
for (const goal of GOALS) for (const level of ['beginner', 'intermediate', 'advanced'] as const) for (const age of ['adult', 'teen', 'child'] as AgeBand[])
  for (const equipment of KITS) for (const days of [2, 3, 4, 5, 6]) for (const jumpsOpen of age === 'adult' ? [false, true] : [false]) {
    let prog;
    try {
      prog = buildProgram({ request: { equipment: equipment as never, tension: null, bands: [], goal, sport: goal === 'sport' ? 'basketball' as never : null, days, minutes: 45, level, weeks: 4, age, lowLoad: [] }, library: LIB, jumpsOpen });
    } catch { buildFails++; continue; }
    builds++;
    const ids = new Set(prog.exerciseIds);
    for (const c of prog.choices) for (const o of c.options) ids.add(o.id);
    const clips = clipsFor(ids, (id) => BY_ID.get(id) ?? null);
    for (const id of ids) { const e = BY_ID.get(id); if (e) add(`b:${id}`, libRow('builder', e, clips[id]), goal); }
  }

// ── the independent read: a loop's name → the movement it shows ──────────────────────────────────────────────────
type Move = 'squat' | 'hinge' | 'lunge' | 'push' | 'pull' | 'carry' | 'rotation' | 'throw' | 'jump' | 'run' | 'core' | 'calf' | 'mobility' | 'ball' | 'other';
/** First match wins, so the specific words come before the general ones (a reverse fly is a pull, a calf raise is not a
 *  shoulder raise, a bridge march is a bridge). */
const MOVE_WORDS: [Move, RegExp][] = [
  ['ball', /^bball_|jumpshot|jumper|shot|shoot|layup|dribble|free_throw/],
  ['calf', /calf|tibialis|toe_raise|heel_raise/],
  ['throw', /throw|toss|scoop|shotput|slam|underhand|chest_pass|jammer|_chest_|overhead_(standing|hk|tk|split|lateral|single|stepin)|sidetoss|singlepush|rotoverhead/],
  ['hinge', /hinge|rdl|deadlift|good_morning|swing|kickstand|hip_thrust|thrust|bridge|glute|nordic|ham_?string_curl|ham_curl|slider|clean|snatch|back_ext|hyper|pull_through/],
  ['jump', /jump|hop|bound|pogo|skip|burpee|depth|leap|broad|snap_down|landing/],
  ['carry', /carry|farmer|waiter|suitcase_walk/],
  ['squat', /squat|wall_sit|sissy|pistol|thruster/],
  ['lunge', /lunge|split|step_?up|stepin|step_down|bulgarian|curtsy|cossack/],
  ['pull', /row|pull|curl|chin|face_pull|reverse_fly|rear|shrug|ytw|prone_t|y_raise|hang|_er_|er_|external|liftoff|wall_slide|arm_raise|scap/],
  ['push', /press|push|dip|fly|triceps|skull|kickback|raise|chest|landmine|bench/],
  ['rotation', /rot|twist|chop|lift|pallof|windmill|woodchop/],
  ['run', /sprint|run|shuffle|carioca|backpedal|a_march|high_knee|butt_kick|accel|decel|cut|agility|ladder|march|start|arm_swing|crawl|stance|walk|climber/],
  ['core', /plank|crunch|dead_bug|bird_dog|hollow|sit_?up|leg_raise|bear|ab_|rollout|copenhagen|v_up|jackknife|flutter|mountain|superman|side_bend|tap|balance|tripod|clamshell|adductor|tke|chin_tuck/],
  ['mobility', /stretch|smr|roll|9090|ninety|cat|cow|thread|open|circle|opener|rock|breath|legsup|prone|child|cobra|pigeon|frog|spider|groiner|world|ankle|knee_to_wall|hip_|t_spine|thoracic|quad|reach|sweep|halo|couch|pike|shinbox|switch|inchworm|elbows|sit_squat/],
];
function moveOf(clip: string): Move {
  const c = clip.replace(/^ex_/, '');
  for (const [m, re] of MOVE_WORDS) if (re.test(c)) return m;
  return 'other';
}
/** Which movements an exercise's own pattern tag allows its loop to show. Broad on purpose: the read is a net, and a
 *  person looks at everything it catches. */
const ALLOWS: Record<string, readonly Move[]> = {
  squat: ['squat', 'jump', 'lunge', 'throw', 'mobility'], hinge: ['hinge', 'jump', 'core', 'throw'], lunge: ['lunge', 'squat', 'jump', 'run', 'mobility'],
  push: ['push', 'core', 'jump', 'throw', 'ball'], pull: ['pull', 'core'], carry: ['carry', 'run', 'core'],
  rotation: ['rotation', 'core', 'throw', 'mobility'], locomotion: ['run', 'jump', 'carry', 'lunge', 'ball', 'core'],
  breath: ['mobility', 'core'], mobility: ['mobility', 'core', 'lunge', 'squat', 'hinge', 'rotation', 'run', 'pull', 'calf'],
  other: ['core', 'mobility', 'calf', 'jump', 'run', 'ball', 'carry', 'rotation', 'throw', 'push', 'pull', 'squat', 'hinge', 'lunge'],
};
/** The second net, for every pattern: the exercise's NAME read the same way. A name and a loop that each say a clear
 *  movement must say compatible ones (a "squat" named entry playing a press is caught even under an 'other' tag). */
const COMPAT: readonly (readonly Move[])[] = [['squat', 'lunge', 'jump', 'throw'], ['hinge', 'jump', 'throw'], ['push', 'core', 'throw', 'ball'], ['pull', 'core'],
  ['jump', 'run', 'ball', 'lunge'], ['carry', 'run'], ['rotation', 'core', 'throw'], ['calf', 'jump'], ['mobility', 'core', 'lunge', 'squat', 'hinge', 'rotation', 'pull', 'push', 'run', 'calf']];
const nameMove = (name: string): Move => moveOf(name.toLowerCase().replace(/[^a-z0-9]+/g, '_'));
const compatible = (a: Move, b: Move) => a === b || a === 'other' || b === 'other' || COMPAT.some((g) => g.includes(a) && g.includes(b));
const why = (r: Row): string | null => {
  if (!r.clip) return null;
  const m = moveOf(r.clip);
  if (!(ALLOWS[r.pattern] ?? ALLOWS.other).includes(m)) return `pattern ${r.pattern}, loop reads as ${m}`;
  const n = nameMove(r.name);
  if (!compatible(n, m)) return `name reads as ${n}, loop reads as ${m}`;
  return null;
};

/** A person's verdict on each pair the read caught, keyed `id → clip`: 'ok' with why, or 'wrong' with why. */
const VERDICTS: Record<string, { v: 'ok' | 'wrong'; why: string }> = {
  // the read's own misses (the loop is the exercise's name, read wrongly: "archER_Push", "shotgun", "arnold" …)
  'archer-push-up → ex_archer_pushup': { v: 'ok', why: 'the archer push-up loop' },
  'archer-push-up-with-4-second-lower → ex_archer_pushup': { v: 'ok', why: 'the archer push-up loop (the tempo is the dose)' },
  'arnold-dumbbell-press → ex_arnold_seated': { v: 'ok', why: 'the seated Arnold press loop' },
  'kettlebell-arnold-press → ex_arnold_one': { v: 'ok', why: 'the one-arm Arnold press loop' },
  'bradford-rocky-presses → ex_bradford_seated': { v: 'ok', why: 'the seated Bradford press loop' },
  'hand-release-push-up → ex_hand_release': { v: 'ok', why: 'the hand-release push-up loop' },
  'hand-release-push-up-with-4-second-lower → ex_hand_release': { v: 'ok', why: 'the hand-release push-up loop (the tempo is the dose)' },
  'machine-triceps-extension → ex_machine_triceps': { v: 'ok', why: 'the machine triceps loop' },
  'one-arm-pronated-dumbbell-triceps-extension → ex_skull_crusher_one': { v: 'ok', why: 'a one-arm extension lying on the bench (demo.ts: "lie on the bench as the skull crushers do")' },
  'overhead-triceps → ex_stretch_triceps': { v: 'ok', why: 'the overhead triceps stretch loop: a stretch tagged mobility' },
  'pallof-press → ex_pallofpress_standing': { v: 'ok', why: 'the standing Pallof press: a press away that resists the turn' },
  'split-stance-pallof-press → ex_pallofpress_split': { v: 'ok', why: 'the Pallof press in a split stance' },
  'shotgun-row → ex_cable_row_one': { v: 'ok', why: 'a shotgun row is a one-arm cable row' },
  'shotgun-row-with-4-second-lower → ex_cable_row_one': { v: 'ok', why: 'a shotgun row is a one-arm cable row' },
  'zottman-curl → ex_zottman': { v: 'ok', why: 'the Zottman curl loop' },
  'band-external-rotation-in-a-split-stance → ex_er_side_split': { v: 'ok', why: 'the band external rotation in a split stance' },
  'band-terminal-knee-extension → ex_tke': { v: 'ok', why: 'the terminal knee extension loop' },
  'recover-and-contest → bball_closeout': { v: 'ok', why: 'recover and contest is the closeout' },
  'standing-arm-swing-drill → ex_arm_swing': { v: 'ok', why: 'the sprint arm-swing loop' },
  // wrong: another movement
  'split-squat-stretch → ex_split_jump': { v: 'wrong', why: 'a hamstring stretch (front leg long, fold forward, "no bouncing") plays a jumping split-switch plyometric. lib/library/demo.ts line 890 (demo-loops)' },
  'spider-crawl → ex_spiderman_pushup': { v: 'wrong', why: 'a travelling crawl warm-up plays a push-up in place: the chest drops to the floor and nothing travels. lib/library/demo.ts line 752 (demo-loops); assumption: the crawl is not done as a push-up' },
};

const all = [...rows.values()].sort((a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name));
const suspects = all.filter((r) => why(r) !== null);
const unjudged = suspects.filter((r) => !VERDICTS[`${r.id} → ${r.clip}`]);
const wrong = suspects.filter((r) => VERDICTS[`${r.id} → ${r.clip}`]?.v === 'wrong');
const missing = all.filter((r) => !r.clip);

if (process.argv.includes('--dump')) {
  for (const r of all) console.log([r.source, r.pattern, r.clip ? moveOf(r.clip) : '-', r.clip ?? '(still)', r.name, `${r.family}/${r.variation}`].join('\t'));
  process.exit(0);
}

const bySource = (s: Row['source']) => { const x = all.filter((r) => r.source === s); return { exercises: x.length, demo: x.filter((r) => r.clip).length, still: x.filter((r) => !r.clip).length }; };
const summary = {
  generated: new Date().toISOString().slice(0, 10),
  signature: { programs: SIGNATURE_PROGRAMS.map((p) => p.id), ...bySource('signature'), servedIdsMissingFromClipMap: signatureUnserved.length },
  templates: { templates: TEMPLATES.map((t) => t.id), ...bySource('template') },
  builder: { builds, buildFails, ...bySource('builder') },
  suspects: suspects.length, judged: suspects.length - unjudged.length, wrong: wrong.length,
};
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'demos.json'), JSON.stringify({ summary, wrong, suspects: suspects.map((r) => ({ ...r, read: why(r), verdict: VERDICTS[`${r.id} → ${r.clip}`] ?? null })), missing, all }, null, 1) + '\n');

// the animation lane's list: only exercises with no loop at all (each once; an exercise in two sources is one loop to
// make), most-used first. A still with a loop held back (a draft entry, a name the library does not know) is not theirs.
const need = new Map<string, { name: string; pattern: string; family: string; variation: string; in: Set<string> }>();
for (const r of missing.filter((x) => x.still === 'no loop')) {
  const n = need.get(r.id) ?? { name: r.name, pattern: r.pattern, family: r.family, variation: r.variation, in: new Set<string>() };
  for (const w of r.in) n.in.add(`${r.source}:${w}`);
  need.set(r.id, n);
}
const needList = [...need.entries()].sort((a, b) => b[1].in.size - a[1].in.size || a[1].name.localeCompare(b[1].name));
const held = missing.filter((r) => r.still && r.still !== 'no loop');
const cnt = (src: Row['source'], k: Row['still']) => missing.filter((r) => r.source === src && r.still === k).length;
const md = [
  '# Demos in the session player — built-in and signature programs',
  '',
  `Generated ${summary.generated} by \`scripts/every-screen/demos.mts\` (read only). Each exercise shows its own looping demo, or a still labelled "Demo coming"; never another movement.`,
  '',
  '| Programs | Exercises | Own demo | Labelled still | of which: no loop exists | loop exists, not reached | Wrong demo |',
  '|---|---|---|---|---|---|---|',
  ...(['signature', 'template', 'builder'] as const).map((src) => {
    const label = src === 'signature' ? `Signature (${SIGNATURE_PROGRAMS.length} programs, every gate)` : src === 'template' ? `Coach templates (${TEMPLATES.length}, every wave and ladder rung)` : `Program builder (${builds} requests)`;
    const b = bySource(src);
    return `| ${label} | ${b.exercises} | ${b.demo} | ${b.still} | ${cnt(src, 'no loop')} | ${b.still - cnt(src, 'no loop')} | ${wrong.filter((r) => r.source === src).length} |`;
  }),
  '',
  `Served signature exercises missing from the page's demo map: ${signatureUnserved.length}.`,
  '',
  `How "wrong" is checked: each loop's name is read into a movement and compared with the exercise's own pattern tag and its name. ${suspects.length} pairs disagreed and each was looked at by hand (verdicts in the script, with reasons): ${wrong.length} wrong. The read cannot catch a loop that is the right kind of movement but the wrong version (a front squat shown as a back squat).`,
  '',
  ...(wrong.length ? ['## Wrong demos', '', '| Exercise | Plays | Where | Why it is wrong |', '|---|---|---|---|', ...wrong.map((r) => `| ${r.name} (\`${r.id}\`) | \`${r.clip}\` | ${r.source}: ${r.in.join(', ')} | ${VERDICTS[`${r.id} → ${r.clip}`].why} |`), ''] : []),
  '## For the animation lane: exercises with no loop yet',
  '',
  `${needList.length} exercises have no loop at all and show the labelled still. Most-used first.`,
  '',
  '| Exercise | Pattern | Family / variation | Appears in |',
  '|---|---|---|---|',
  ...needList.map(([id, n]) => `| ${n.name} (\`${id}\`) | ${n.pattern} | ${n.family} / ${n.variation} | ${[...n.in].sort().join(', ')} |`),
  '',
  '## Not the animation lane\'s: a coach-template exercise that shows the still although a loop could play',
  '',
  'The coached athlete\'s Today reads each catalogue row\'s loop by its exact name in the library, approved entries only (lib/coach/todayExtras.ts libraryClips). The signature programs play draft entries\' loops; this path does not.',
  '',
  '| Exercise (coach catalogue name) | Why the still | Loop the library would play | Templates |',
  '|---|---|---|---|',
  ...held.map((r) => `| ${r.name} | ${r.still === 'not approved' ? `library entry \`${r.id}\` is a draft` : r.still === 'not youth-safe' ? `library entry \`${r.id}\` is adults-only` : 'no library entry has this name'} | ${r.heldLoop ? `\`${r.heldLoop}\`` : '—'} | ${r.in.join(', ')} |`),
  '',
];
writeFileSync(join(OUT, 'demos.md'), md.join('\n'));
console.log(JSON.stringify(summary));
if (unjudged.length) {
  console.log(`\n${unjudged.length} suspect pair(s) with no verdict:`);
  for (const r of unjudged) console.log(`  '${r.id} → ${r.clip}': ${r.name} [${r.pattern} ${r.family}/${r.variation}] ${why(r)}`);
  process.exit(1);
}
if (signatureUnserved.length) process.exit(1);
