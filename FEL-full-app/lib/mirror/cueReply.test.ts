// MIRROR-MOVES P2 (2026-10-07): THE REPLY TO A REPEATED FAULT (cue-engine.ts REPEAT_REPLY_FIRES). A fault that keeps coming
// back in a set hears a different, simpler wording in the cue's slot — cue variety, not nagging — and nothing about WHEN the
// coach speaks moves: the faded schedule, the hold-down, the priority, escalate and regress are the engine's as before.
import { describe, expect, it } from 'vitest';
import {
  CUES, CueEngine, FADED_CUE_EVERY, MIRROR_COACH_TABLE, REPEAT_REPLY_FIRES, type CueTable, type FaultId,
} from '@/lib/babylon/nexus/neuro-mirror/rules/cue-engine';
import { lintCue } from '@/lib/coach/cueLint';
import { LUNGE_CUE_TABLE } from './lungeStage';
import { HINGE_CUE_TABLE } from './hingeStage';
import { PUSHUP_CUE_TABLE } from './pushupStage';
import { cueTableFor } from './patternCues';

const REP_MS = 2_400;
/** One rep: the fault on its first half (a frame-timed read, the harness's wiring), then endRep with what it showed. */
function rep<F extends string>(ce: CueEngine<F>, i: number, faults: readonly F[], t0 = 0) {
  const said: { level: string; text: string }[] = [];
  for (let t = 0; t < REP_MS; t += 100) {
    const e = ce.decide(t0 + i * REP_MS + t, t < REP_MS / 2 ? faults : []);
    if (e) said.push({ level: e.level, text: e.text });
  }
  ce.endRep(faults);
  return said;
}

const TABLES: [string, CueTable<string>][] = [
  ['squat / press-row (cue-engine.ts CUES)', MIRROR_COACH_TABLE as CueTable<string>],
  ['lunge', LUNGE_CUE_TABLE as CueTable<string>],
  ['hinge', HINGE_CUE_TABLE as CueTable<string>],
  ['push-up', PUSHUP_CUE_TABLE as CueTable<string>],
];

describe('every live table has a reply for every fault: different from the cue, simpler, and in FEL\'s external-focus voice', () => {
  it.each(TABLES)('%s', (_name, table) => {
    for (const f of table.priority) {
      const card = table.cards[f];
      expect(card.reply, f).toBeTruthy();
      expect(card.reply, f).not.toBe(card.cue);
      expect(card.reply!.split(/\s+/).length, `${f}: simpler = fewer words than the cue`).toBeLessThan(card.cue.split(/\s+/).length);
      expect(lintCue(card.reply!, 'attention'), f).toEqual([]);
    }
  });
});

describe('the reply', () => {
  it(`the same fault on every rep of a set: cue, then the reply on rep ${REPEAT_REPLY_FIRES}, then "Still …" — the timing is the engine's`, () => {
    const ce = new CueEngine({ clearByRep: true });
    const said = Array.from({ length: 8 }, (_, i) => rep(ce, i, ['heelRise'] as FaultId[])).flat();
    expect(said.map((s) => s.level)).toEqual(['cue', 'reply', 'escalate']);
    expect(said[1].text).toBe(CUES.heelRise.reply);
    // the reply landed on the cue's own slot: the 2nd voiced line, on rep 3 (the hold-down kept rep 2 quiet)
  });

  it('it alternates with the cue — never the same wording twice running for one fault', () => {
    // a fault that clears for a rep between showings: every showing is a fresh cue-level line (clearByRep resets escalation)
    const ce = new CueEngine({ clearByRep: true });
    const said: { level: string; text: string }[] = [];
    for (let i = 0; i < 16; i++) said.push(...rep(ce, i, i % 2 === 0 ? (['elbowFlare'] as FaultId[]) : []));
    const lines = said.filter((s) => s.level === 'cue' || s.level === 'reply');
    expect(lines.length).toBeGreaterThanOrEqual(4);
    expect(lines[0].level).toBe('cue');
    expect(lines.some((s) => s.level === 'reply')).toBe(true);
    for (let i = 1; i < lines.length; i++) expect(lines[i].text, `line ${i}`).not.toBe(lines[i - 1].text);
  });

  it('a card with no reply keeps its cue (opt-in per card)', () => {
    const table = cueTableFor([{ faultId: 'x', cue: 'Press the floor away.', escalate: 'Still. Press the floor away.', regress: 'Hold the top.' }], ['x']);
    const ce = new CueEngine({ clearByRep: true, table });
    const said: string[] = [];
    for (let i = 0; i < 16; i++) said.push(...rep(ce, i, i % 2 === 0 ? ['x'] : []).map((s) => s.level));
    expect(said.filter((l) => l === 'cue').length).toBeGreaterThan(1);
    expect(said).not.toContain('reply');
  });

  it('it counts reps of THIS set: a new set (reset or endSet) starts with the cue again', () => {
    const ce = new CueEngine({ clearByRep: true });
    for (let i = 0; i < 8; i++) rep(ce, i, ['lateralShift'] as FaultId[]);
    ce.endSet();
    const next = rep(ce, 0, ['lateralShift'] as FaultId[], 100_000);
    expect(next[0]).toEqual({ level: 'cue', text: CUES.lateralShift.cue });
  });

  it(`inside the faded schedule: at 'everyThird' the reply is said only on a voiced rep (every ${FADED_CUE_EVERY}rd showing), never more often`, () => {
    const ce = new CueEngine({ clearByRep: true });
    // set 1: cued, then three clean reps at the end → it lands, and steps down to everyThird for set 2
    rep(ce, 0, ['armFall'] as FaultId[]);
    for (let i = 1; i < 5; i++) rep(ce, i, []);
    ce.endSet();
    expect(ce.levelOf('armFall')).toBe('everyThird');
    // set 2: it shows on every other rep (never two in a row, so never a "return")
    const said: string[] = [];
    for (let i = 0; i < 12; i++) said.push(...rep(ce, i, i % 2 === 0 ? (['armFall'] as FaultId[]) : [], 200_000).filter((s) => s.level !== 'confirm').map((s) => s.level));
    // 6 showings → voiced on the 3rd and 6th only; both are past REPEAT_REPLY_FIRES, alternating reply → cue
    expect(said).toEqual(['reply', 'cue']);
  });

  it('at \'summaryOnly\' a repeated fault is not said at all — the reply does not open the voice', () => {
    const ce = new CueEngine({ clearByRep: true });
    for (let set = 0; set < 2; set++) {
      rep(ce, 0, ['shrug'] as FaultId[], set * 100_000);
      for (let i = 1; i < 5; i++) rep(ce, i, [], set * 100_000);
      ce.endSet();
    }
    expect(ce.levelOf('shrug')).toBe('summaryOnly');
    const said: string[] = [];
    for (let i = 0; i < 9; i++) said.push(...rep(ce, i, i % 2 === 0 ? (['shrug'] as FaultId[]) : [], 300_000).map((s) => s.level));
    expect(said.filter((l) => l !== 'confirm')).toEqual([]);
  });

  it('escalate and regress keep their own words (the reply replaces only the cue level)', () => {
    const ce = new CueEngine();                                   // frame-timed, a fault held on: cue → escalate → regress
    const said: string[] = [];
    for (let t = 0; t <= 40_000; t += 100) { const e = ce.decide(t, ['kneeValgus']); if (e) said.push(e.text); }
    expect(said).toEqual([CUES.kneeValgus.cue, CUES.kneeValgus.cue, CUES.kneeValgus.escalate, CUES.kneeValgus.escalate, CUES.kneeValgus.regress, CUES.kneeValgus.regress, CUES.kneeValgus.regress]);
  });
});
