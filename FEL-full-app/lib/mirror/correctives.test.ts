// The written correctives, mounted (MIRROR-COACH P9, 2026-09-30; PLAN item 9, rules (c) and (e)).
//
// What this holds: the registry the Mirror's picker reads; the youth gate — ONE age truth, off for a minor AND a blank
// birth year, never opened by a guardian's consent; what one press/row set earns (and the tempo adapter the prescribers
// had never had); the program from saved sets (zones only, press/row only, and an honest line when sets are not kept);
// the intake hold; a flagged Movement Screen check → its matching corrective; the external-focus lint over every line
// the correctives can say; the honesty rules over the same lines; and that nothing here writes.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CORRECTIVES_INTAKE_FIRST, CORRECTIVES_PATH, CORRECTIVES_YOUTH_OFF, MIRROR_CORRECTIVE_SESSIONS, PRESS_ROW_PATTERN_ID,
  PROGRAM_NOT_KEPT, SCREEN_CORRECTIVE, correctiveCueCorpus, correctivesGate, findingFromRow, intakeHold, programView,
  screenCorrectiveFor, screenCorrectiveLine, sessionLikeFromSummary, setCorrectives, thinSetNote, bandOnlyRetest,
  type SavedSetRow, type SetSummaryLike,
} from './correctives';
import { MIRROR_CORRECTIVE_SESSIONS as FROM_PATTERNS, MIRROR_PATTERNS } from './patterns';
import { isMinorForMirror } from './youth';
import { GRADER_IDS } from './stationGraders';
import { MIN_REPS_FOR_SIGNAL, PROGRAM_DISCLAIMER, programCycle } from './program';
import { lintCue } from '@/lib/coach/cueLint';
import { screenText } from '@/lib/share/screen';
import { INTAKE_VERSION, RED_FLAG_COPY } from '@/lib/health/intake';
import { MIRROR_SIGNAL_READ } from '@/lib/babylon/nexus/neuro-mirror/rules/rnt-breath';

const NOW = new Date('2026-09-30T12:00:00Z');
/** A repo file's source, from this directory. */
const source = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
/** The source without its comments — what runs, not what the comments quote. */
const code = (f: string) => source(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const MOUNT_FILES = ['lib/mirror/correctives.ts', 'app/play/mirror/correctives/page.tsx', 'components/mirror/session-correctives.tsx', 'components/mirror/correctives-view.tsx'];
const MIN = 60_000;

// THE IMPORT GRAPH (the same walker lib/prq-recovery-self-reports.test.ts uses): every repo module a mount file reaches.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rel = (p: string) => relative(ROOT, p).split('\\').join('/');
const specifiers = (c: string) => [...c.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)].map((m) => m[1]);
function resolveImport(fromFile: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(ROOT, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(fromFile), spec) : null;
  if (!base || rel(base).startsWith('public/_prisma')) return null;
  for (const c of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx'), base]) {
    if (existsSync(c) && statSync(c).isFile() && /\.(ts|tsx)$/.test(c)) return c;
  }
  return null;
}
function importGraph(root: string): string[] {
  const seen = new Set<string>();
  const stack = [join(ROOT, root)];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const sp of specifiers(code(rel(file)))) {
      const r = resolveImport(file, sp);
      if (r) stack.push(r);
    }
  }
  return [...seen].map(rel).sort();
}

/** A press/row set's live summary (overlay-compositor.ts SessionSummary's shape). */
const summary = (over: Partial<SetSummaryLike> = {}): SetSummaryLike => ({
  durationMs: 2 * MIN, reps: 12, timeInStableMs: {}, faultCounts: {}, avgTempo: { pullSec: 1.5, pressSec: 1.5 }, ...over,
});
/** One camera number, read into both of its zones — what kinematic-engine.ts actually writes. */
const drifted = summary({
  faultCounts: { rib_thoracic: 8, lumbo_pelvic: 8, posterior_chain: 6, lat_rhomboid: 6, upper_traps: 5 },
  timeInStableMs: { rib_thoracic: 20_000, lumbo_pelvic: 20_000, posterior_chain: 30_000, lat_rhomboid: 30_000, upper_traps: 40_000 },
});

describe('the picker: the correctives are registered beside the audits', () => {
  it('three kinds, each adults-only, each a link into the correctives page', () => {
    expect(MIRROR_CORRECTIVE_SESSIONS.map((s) => s.id)).toEqual(['band-drills', 'release', 'program']);
    for (const s of MIRROR_CORRECTIVE_SESSIONS) {
      expect(s.youthSafe).toBe(false);
      expect(s.href).toBe(`${CORRECTIVES_PATH}#${s.id}`);
    }
  });

  it('lib/mirror/patterns.ts carries the same list, and the audits registry is unchanged in shape', () => {
    expect(FROM_PATTERNS).toBe(MIRROR_CORRECTIVE_SESSIONS);
    for (const p of MIRROR_PATTERNS) expect(typeof p.audit).toBe('function');
  });
});

describe('youth: one age truth, off for a minor and a blank birth year, never a guardian', () => {
  it('correctivesGate agrees with isMinorForMirror for every birth year', () => {
    for (const y of [null, undefined, NaN, 1850, 1970, 2000, 2007, 2008, 2009, 2015, 2030]) {
      expect(correctivesGate(y as number | null | undefined, NOW) !== null, String(y)).toBe(isMinorForMirror(y as number | null | undefined, NOW));
    }
  });

  it('a set earns nothing under youth rules — no band drill, no release — and says why', () => {
    for (const youth of ['minor', 'unknownAge'] as const) {
      const c = setCorrectives(drifted, youth);
      expect(c.band).toEqual([]);
      expect(c.release).toEqual([]);
      expect(c.off).toBe(CORRECTIVES_YOUTH_OFF[youth]);
    }
    // the control: the same set, an adult
    const adult = setCorrectives(drifted, null);
    expect(adult.band.length).toBeGreaterThan(0);
    expect(adult.release.length).toBeGreaterThan(0);
  });

  it('a 17-year-old with a guardian\'s consent on file is still a minor: nothing here reads the consent', () => {
    // 2009 → 17 in 2026: the age truth says minor, and there is no input a consent could arrive through
    expect(correctivesGate(2009, NOW)).toBe('minor');
    expect(setCorrectives.length).toBe(2);
    expect(screenCorrectiveFor('shoulderLevel', correctivesGate(2009, NOW))).toBeNull();
    // the whole transitive import graph of every mount file: no guardian module, and no module that reads the consent table
    for (const f of MOUNT_FILES) {
      const graph = importGraph(f);
      expect(graph.filter((m) => /guardian|^lib\/consent\//i.test(m)), f).toEqual([]);
      for (const m of graph) expect(code(m), m).not.toMatch(/guardianConsent\.|needsGuardian\(|guardianStatus\(|canUse\(/);
    }
  });

  it('control: the walker follows imports transitively (the page reaches P5\'s intake module through lib/mirror/correctives.ts)', () => {
    const graph = importGraph('app/play/mirror/correctives/page.tsx');
    expect(graph).toContain('lib/mirror/correctives.ts');
    expect(graph).toContain('lib/health/intake.ts');
    expect(graph).toContain('lib/mirror/program.ts');
    // and it sees a guardian module where one is imported: P6's readiness module imports the guardian gate
    expect(importGraph('lib/health/readiness.ts')).toContain('lib/consent/guardianGate.ts');
  });

  it('the program and the screen correctives are off under youth rules too', () => {
    for (const youth of ['minor', 'unknownAge'] as const) {
      const v = programView([], youth, { keeping: true });
      expect(v.cycle).toBeNull();
      expect(v.off).toBe(CORRECTIVES_YOUTH_OFF[youth]);
      for (const id of GRADER_IDS) expect(screenCorrectiveFor(id, youth)).toBeNull();
    }
  });
});

describe('one press/row set', () => {
  it('the tempo adapter: the summary\'s { pullSec, pressSec } becomes ms per rep, and a missing tempo stays missing', () => {
    expect(sessionLikeFromSummary(summary()).avgTempo).toBe(3000);
    expect(sessionLikeFromSummary(summary({ avgTempo: null })).avgTempo).toBeNull();
    expect(sessionLikeFromSummary(summary({ avgTempo: { pullSec: NaN, pressSec: 1 } })).avgTempo).toBeNull();
  });

  it('one band drill per camera signal, even though each of two signals is read into two zones', () => {
    const c = setCorrectives(drifted, null);
    expect(c.band.map((b) => b.signal).sort()).toEqual(['elbowPath', 'shoulderRise', 'trunkShift']);
    expect(new Set(c.band.map((b) => b.signal)).size).toBe(c.band.length);
    // each says what the camera read, labelled estimated
    for (const b of c.band) {
      expect(b.read).toBe(MIRROR_SIGNAL_READ[b.signal]);
      expect(b.read).toMatch(/\(estimated\)$/);
    }
  });

  it('a clean set earns nothing and says so, specifically', () => {
    const c = setCorrectives(summary(), null);
    expect(c.band).toEqual([]);
    expect(c.release).toEqual([]);
    expect(c.retest).toBe('');
    expect(c.clean).toMatch(/^Nothing to correct from 12 reps/);
  });

  it('the release runs first and ends on the retest, and carries the caution', () => {
    const c = setCorrectives(drifted, null);
    expect(c.release.map((r) => r.zone)).toEqual(['lat_rhomboid', 'upper_traps']);   // centre-out; no middle-zone pin
    expect(c.retest).toMatch(/repeat the same set in the Mirror/);
    expect(c.caution).toMatch(/not a diagnosis/);
  });
});

// MIRROR-COACH P9 FIX (2026-09-30, code review)
describe('P9 fix: a set too short to read earns nothing; a band-only set is not told to skip its drill', () => {
  /** What the review measured: 8 s, no counted rep, one fault transition in each drift zone (set-up noise). */
  const setUp = summary({ durationMs: 8_000, reps: 0, faultCounts: { rib_thoracic: 1, lumbo_pelvic: 1, posterior_chain: 1, lat_rhomboid: 1, upper_traps: 1 } });

  it('the review\'s reproduction — a 0-rep, 8-second set — gets no drill and no release, and says why', () => {
    const c = setCorrectives(setUp, null);
    expect(c).toMatchObject({ off: null, band: [], release: [], retest: '', clean: null });
    expect(c.thin).toBe(thinSetNote(0));
    expect(c.thin).toMatch(new RegExp(`${MIN_REPS_FOR_SIGNAL} or more counted reps \\(that set counted 0\\)`));
  });

  it('2 reps is still thin; MIN_REPS_FOR_SIGNAL reps is read — the same bar the program uses', () => {
    expect(setCorrectives({ ...drifted, reps: 2 }, null).thin).toBe(thinSetNote(2));
    expect(setCorrectives({ ...drifted, reps: MIN_REPS_FOR_SIGNAL - 1 }, null).band).toEqual([]);
    const read = setCorrectives({ ...drifted, reps: MIN_REPS_FOR_SIGNAL }, null);
    expect(read.thin).toBeNull();
    expect(read.band.length).toBeGreaterThan(0);
    expect(MIN_REPS_FOR_SIGNAL).toBe(4);
  });

  it('youth rules still say only why (the thin note is an adult\'s)', () => {
    expect(setCorrectives(setUp, 'minor')).toMatchObject({ off: CORRECTIVES_YOUTH_OFF.minor, thin: null });
  });

  it('a set whose only drift is sideways: the band drill, no release, and a retest that runs the drill', () => {
    const sideways = summary({ faultCounts: { rib_thoracic: 8, lumbo_pelvic: 8 }, timeInStableMs: { rib_thoracic: 20_000, lumbo_pelvic: 20_000 } });
    const c = setCorrectives(sideways, null);
    expect(c.band.map((b) => b.signal)).toEqual(['trunkShift']);
    expect(c.release).toEqual([]);
    expect(c.retest).toBe(bandOnlyRetest(1));
    expect(c.retest).toBe('Run the band drill, then repeat the same set in the Mirror. If the flags do not drop, change one thing, not three.');
    expect(c.retest).not.toMatch(/Nothing to release|go straight back in/);
    expect(bandOnlyRetest(2)).toMatch(/^Run the band drills,/);
  });
});

describe('across sets: the program', () => {
  const row = (at: number, faultCounts: unknown, over: Partial<SavedSetRow> = {}): SavedSetRow => ({
    patternId: PRESS_ROW_PATTERN_ID, startedAt: new Date(at), reps: 10, faultCounts, ...over,
  });

  it('reads the zone counts only — the baseline values stored beside them are not faults', () => {
    const f = findingFromRow(row(1, { upper_traps: 3, lat_rhomboid: 0, _checkValues: { 'hipHike:right': 0.12 }, bogus: 9 }))!;
    expect(f.faults).toEqual({ upper_traps: 3 });
    expect(f.at).toBe(1);
  });

  it('reads press/row sets only, and skips a row it cannot date', () => {
    expect(findingFromRow(row(1, { upper_traps: 3 }, { patternId: 'squat' }))).toBeNull();
    expect(findingFromRow(row(1, { upper_traps: 3 }, { startedAt: 'not a date' }))).toBeNull();
  });

  it('builds the program and its retest schedule from the saved sets', () => {
    const rows = [row(2, { upper_traps: 3 }), row(1, { upper_traps: 4 })];
    const v = programView(rows, null, { keeping: true });
    expect(v.off).toBeNull();
    expect(v.note).toBeNull();
    expect(v.disclaimer).toBe(PROGRAM_DISCLAIMER);
    expect(v.cycle).toEqual(programCycle(rows.map((r) => findingFromRow(r)!)));
    expect(v.cycle!.sessionsToRetest).toBe(4);
  });

  it('says plainly when sets are not kept on this account, instead of "scan a couple more times" forever', () => {
    const v = programView([], null, { keeping: false });
    expect(v.note).toBe(PROGRAM_NOT_KEPT);
    // kept but none yet: no note — the program's own "scan a couple more times" line is true then
    expect(programView([], null, { keeping: true }).note).toBeNull();
  });
});

describe('the health intake holds the correctives page back', () => {
  const intake = (over: Record<string, unknown> = {}) => ({ version: INTAKE_VERSION, createdAt: new Date('2026-09-29T00:00:00Z'), redFlags: [] as string[], clearedAt: null, ...over });

  it('none on file, or a stale one → answer it first; a red flag not cleared → the red-flag line; else open', () => {
    expect(intakeHold(null, NOW)).toBe(CORRECTIVES_INTAKE_FIRST);
    expect(intakeHold(intake({ version: 'old' }), NOW)).toBe(CORRECTIVES_INTAKE_FIRST);
    expect(intakeHold(intake({ redFlags: ['chest_pain'] }), NOW)).toBe(RED_FLAG_COPY);
    expect(intakeHold(intake({ redFlags: ['chest_pain'], clearedAt: new Date('2026-09-29T10:00:00Z') }), NOW)).toBeNull();
    expect(intakeHold(intake(), NOW)).toBeNull();
  });
});

describe('a flagged Movement Screen check prescribes its matching corrective (the coach\'s draft)', () => {
  it('every camera check has an entry, and only these carry work', () => {
    expect(Object.keys(SCREEN_CORRECTIVE).sort()).toEqual([...GRADER_IDS].sort());
    const has = GRADER_IDS.filter((id) => screenCorrectiveFor(id, null) !== null).sort();
    expect(has).toEqual(['hipLevel', 'kneeWindow', 'shoulderLevel', 'singleLeg']);
  });

  it('the hip checks → the side-pull drill; the shoulder → the band-up hold and the neck-and-shoulder release; the knee → the back-of-the-hip release', () => {
    expect(screenCorrectiveFor('hipLevel', null)!.drill!.signal).toBe('trunkShift');
    expect(screenCorrectiveFor('singleLeg', null)!.drill!.signal).toBe('trunkShift');
    expect(screenCorrectiveFor('hipLevel', null)!.release).toBeNull();
    const sh = screenCorrectiveFor('shoulderLevel', null)!;
    expect(sh.drill!.signal).toBe('shoulderRise');
    expect(sh.release!.zone).toBe('upper_traps');
    const knee = screenCorrectiveFor('kneeWindow', null)!;
    expect(knee.drill).toBeNull();
    expect(knee.release!.zone).toBe('posterior_chain');
    expect(knee.href).toBe(`${CORRECTIVES_PATH}#release`);
  });

  it('nothing for a check with none or an id that is not a camera check', () => {
    expect(screenCorrectiveFor('headFloat', null)).toBeNull();
    expect(screenCorrectiveFor('heelLine', null)).toBeNull();
    expect(screenCorrectiveFor('ribAngle', null)).toBeNull();
  });

  it('the coach\'s one line names the release first, then the drill and its cue', () => {
    expect(screenCorrectiveLine(screenCorrectiveFor('shoulderLevel', null)!)).toMatch(
      /^Release first: where the neck meets the shoulder \(30s per side, 5 slow passes\) · Band drill: Band-up shoulder hold, 2 x 5 — ".+"$/,
    );
  });
});

describe('rule (c): every line the correctives can say follows the external-focus policy', () => {
  const corpus = correctiveCueCorpus();

  it('the corpus covers the drills, the releases, the program and the picker', () => {
    const kinds = new Set(corpus.map((c) => c.id.split(':')[0]));
    // (P9 fix: 'screen' — the screen flags' own drill set-ups and cues, screenDrillWords)
    expect([...kinds].sort()).toEqual(['band', 'picker', 'program', 'release', 'screen']);
    expect(corpus.length).toBeGreaterThan(90);
  });

  it('no line fails lintCue — no allow-list needed', () => {
    const fails = corpus.map((c) => ({ id: c.id, text: c.text, f: lintCue(c.text, c.tier) })).filter((x) => x.f.length);
    expect(fails).toEqual([]);
  });

  it('the controls: the lint does catch the copy these lines replaced', () => {
    expect(lintCue('Exhale-driven posterior tilt, ribs stacked over pelvis', 'attention').length).toBeGreaterThan(0);
    expect(lintCue('Pin the hamstring, 45s per side', 'instruction').map((f) => f.rule)).toContain('muscle');
    expect(lintCue('Split-stance press from a braced hinge, 3 x 6 per side', 'instruction').map((f) => f.rule)).toContain('squeeze');
  });
});

describe('honesty (lib/share/screen.ts rules; the phase\'s HONESTY RULE)', () => {
  const lines = [
    ...correctiveCueCorpus().map((c) => c.text),
    ...Object.values(CORRECTIVES_YOUTH_OFF), PROGRAM_NOT_KEPT, CORRECTIVES_INTAKE_FIRST,
    ...setCorrectives(drifted, null).release.map((r) => r.because),
  ];

  it('no condition, treatment or guarantee in any line', () => {
    for (const l of lines) expect(screenText(l), l).toEqual([]);
  });

  it('the caution trips the screen rules on one word only — the "diagnosis" it denies', () => {
    const caution = setCorrectives(drifted, null).caution;
    expect(caution).toMatch(/not a diagnosis/);
    expect(screenText(caution).map((x) => x.found)).toEqual(['diagnosis']);
  });

  it('no line claims injury prevention or risk reduction, and nothing names the book\'s method', () => {
    for (const l of lines) {
      expect(l, l).not.toMatch(/prevent|reduces? (the |your )?risk|injury[- ]free|\bRNT\b|reactive neuromuscular|pin-and-stretch|pain-free/i);
    }
  });

  it('what the camera read never claims a rib, abdomen or tilt read — only the three signals it takes', () => {
    for (const r of Object.values(MIRROR_SIGNAL_READ)) {
      expect(r).not.toMatch(/\brib|abdom|belly|diaphragm|tilt|flare|scapula/i);
      expect(r).toMatch(/\(estimated\)$/);
    }
  });
});

describe('nothing here writes', () => {
  it('no Prisma write and no fetch in the module, the page or the two views', () => {
    for (const f of MOUNT_FILES) {
      const src = code(f);
      expect(src, f).not.toMatch(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/);
      expect(src, f).not.toMatch(/\bfetch\(/);
      expect(src, f).not.toMatch(/localStorage|sessionStorage/);
    }
  });
});
