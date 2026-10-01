// The coach says nothing it cannot back (MIRROR-COACH P1, 2026-09-25).
//
// Two defects in the cue table: the knee escalation claimed "My band is pulling your knees IN" (there is no band, and
// with the valgus sign inverted it fired when the knees were already OUT), and the trunk escalation claimed the ribs
// were flaring (there is no rib landmark). P1 held the knee cue silent (VALGUS_CUE_VERIFIED false) until its read was
// confirmed; the owner switched it on from the synthetic proof (DECISIONS-2 #19) — MIRROR-COACH P2, 2026-09-26, with the
// squareness gate in front of it (squat-audit.ts squareOn). The silent path is still tested: it is the flag's off switch.
import { describe, expect, it } from 'vitest';
import {
  CUES, CueEngine, FADED_CUE_EVERY, FADE_SCHEDULE, FAULT_PRIORITY, LANDED_CLEAR_REPS, PRESS_ROW_CUE_FAULTS, PRESS_ROW_CUE_VERIFIED,
  RETURN_FAULT_REPS, VALGUS_CUE_VERIFIED, cueableFaults, fadeReviewLines, type CueEvent, type FaultId, type SetReport,
} from './cue-engine';
import { lintCue } from '@/lib/coach/cueLint';
import { SquatAudit } from './squat-audit';
import { CLEAN, filmSquat, type SquatShape } from './__fixtures__/synthSquat';

describe('the knee cue is on (owner decision #19, verified on synthetic geometry only)', () => {
  it('ships verified', () => {
    expect(VALGUS_CUE_VERIFIED).toBe(true);
  });

  it('the production engine cues the knee first', () => {
    expect(new CueEngine().decide(1_000, ['armFall', 'kneeValgus'])?.fault).toBe('kneeValgus');
  });

  it('cueableFaults keeps the knee while verified, and drops only the knee when switched off', () => {
    const all: FaultId[] = ['kneeValgus', 'heelRise', 'lateralShift'];
    expect(cueableFaults(all)).toEqual(all);
    expect(cueableFaults(all, false)).toEqual(['heelRise', 'lateralShift']);
    expect(cueableFaults(all)).not.toBe(all);                       // a copy, never the caller's array
  });
});

describe('switched off (the flag is the only switch), the engine never speaks about the knee', () => {
  it('no cue, escalation or confirmation — and the fault behind it gets the voice straight away', () => {
    const ce = new CueEngine({ valgusVerified: false });
    expect(ce.decide(1_000, ['kneeValgus'])).toBeNull();
    expect(ce.decide(40_000, ['kneeValgus'])).toBeNull();          // long past any escalation window
    expect(ce.decide(50_000, [])).toBeNull();                       // "cleared" — and still no confirmation
    expect(ce.decide(60_000, [])).toBeNull();
    const evt = new CueEngine({ valgusVerified: false }).decide(1_000, ['kneeValgus', 'heelRise']);
    expect(evt?.fault).toBe('heelRise');
    expect(evt?.level).toBe('cue');
  });
});

describe('no cue claims something the Mirror does not have or measure', () => {
  const lines = Object.values(CUES).flatMap((c) => [c.cue, c.escalate, c.regress]);

  it('there is no band', () => {
    for (const l of lines) expect(l).not.toMatch(/\bband\b/i);
  });

  it('nothing reports the ribs doing anything (there is no rib landmark)', () => {
    for (const l of lines) expect(l).not.toMatch(/ribs? (is|are) /i);
  });

  it('armFall coaches the sideways drift the audit reads, not a forward fall it cannot see', () => {
    const c = CUES.armFall;
    for (const l of [c.cue, c.escalate, c.regress]) expect(l).not.toMatch(/fall|forward|floor|ceiling/i);
  });
});

// MIRROR-COACH P1 review (2026-09-25) set the conditions for switching the knee cue on, the ones code can hold; P2
// (2026-09-26) closed the last of them (a squat a few degrees off square) with squat-audit.ts squareOn. The PRODUCTION
// engine runs here, fed by the real SquatAudit the way the harness feeds it (only faulting frames reach decide()), over
// squats filmed through lib/pose/synth.ts with its default landmark jitter — synthetic bodies, not a recording.
describe('the knee cue, switched on: what it says and what it never says', () => {
  const kneeCues = (shape: SquatShape, seed?: number): number => {
    const audit = new SquatAudit();
    const ce = new CueEngine();
    let n = 0;
    for (const f of filmSquat(shape, seed === undefined ? CLEAN : { seed })) {
      const r = audit.evaluate(f);
      if (!r.faults.length) continue;
      if (ce.decide(f.timestampMs, r.faults)?.fault === 'kneeValgus') n++;
    }
    return n;
  };
  const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

  it('no knee cue on a straight squat under jitter (the persistence gate; 26 of 50 flagged at one frame)', () => {
    for (const seed of SEEDS) expect(kneeCues({}, seed), `seed ${seed}`).toBe(0);
  });

  it('no knee cue on a side-on squat, either side, or one turned 45° (the frontal gate)', () => {
    for (const turnDeg of [-90, 90, 45, -45]) {
      expect(kneeCues({ turnDeg }), `${turnDeg}°`).toBe(0);
      for (const seed of SEEDS.slice(0, 5)) expect(kneeCues({ turnDeg }, seed), `${turnDeg}° seed ${seed}`).toBe(0);
    }
  });

  // P1 carried this as `it.fails` (condition 4 of VALGUS_CUE_VERIFIED): from ~8° off square a straight squat's forward
  // knee travel crossed the warn line on 20 of 20 jittered squats. The squareness gate is what turned it green.
  it('no knee cue on a straight squat 8° off square, either way, in 20 of 20 jittered seeds (the squareness gate)', () => {
    for (const turnDeg of [8, -8]) for (const seed of SEEDS) expect(kneeCues({ turnDeg }, seed), `${turnDeg}° seed ${seed}`).toBe(0);
  });

  it('nor 5°, 10° or 20° off square (5 seeds each)', () => {
    for (const turnDeg of [5, 10, 20]) for (const seed of SEEDS.slice(0, 5)) expect(kneeCues({ turnDeg }, seed), `${turnDeg}° seed ${seed}`).toBe(0);
  });

  it('a square knee caving in SPEAKS — both knees, the left alone, the right alone', () => {
    for (const shape of [{ shiftL: -0.06, shiftR: -0.06 }, { shiftL: -0.06 }, { shiftR: -0.06 }] as SquatShape[]) {
      expect(kneeCues(shape), JSON.stringify(shape)).toBeGreaterThan(0);
      // under jitter another fault can take the voice first and hold it down for 6 s (the engine's own discipline), so
      // the jittered bar is: the knee speaks on most takes, and the audit hands it the knee on every one
      const spoke = SEEDS.filter((seed) => kneeCues(shape, seed) > 0).length;
      expect(spoke, JSON.stringify(shape)).toBeGreaterThanOrEqual(16);
      for (const seed of SEEDS.slice(0, 5)) {
        const audit = new SquatAudit();
        const fed = filmSquat(shape, { seed }).map((f) => audit.evaluate(f)).filter((r) => r.faults.includes('kneeValgus')).length;
        expect(fed, `${JSON.stringify(shape)} seed ${seed}`).toBeGreaterThan(0);
      }
    }
  });

  it('knees pushed OUT never speak — one side, the other, both — clean or under jitter', () => {
    for (const shape of [{ shiftL: 0.05 }, { shiftR: 0.05 }, { shiftL: 0.05, shiftR: 0.05 }] as SquatShape[]) {
      expect(kneeCues(shape), JSON.stringify(shape)).toBe(0);
      for (const seed of SEEDS) expect(kneeCues(shape, seed), `${JSON.stringify(shape)} seed ${seed}`).toBe(0);
    }
  });

  it('what it says is the action, never a band, a muscle or a cause', () => {
    const c = CUES.kneeValgus;
    for (const l of [c.cue, c.escalate, c.regress]) expect(l).not.toMatch(/\bband\b|glute|muscle|weak|tight|injur|pain/i);
    // MIRROR-COACH P9 (2026-09-30): was toMatch(/knees out/i). The cue now LEADS with the floor ("Press the floor apart
    // with your feet — knees travel out over your second toes", lib/coach/cueLint.ts's external-focus policy), so "knees
    // out" is no longer a contiguous phrase. Not relaxed: the knee direction is still asserted, and the floor lead is new.
    expect(c.cue).toMatch(/knees (travel )?out/i);
    expect(c.cue).toMatch(/^Press the floor apart/);
  });
});

describe('the trunk card coaches what the trunk fault reads', () => {
  it('shoulders over hips, never the ribs (there is no rib landmark; "pull it to your ribs" on the elbow card is a target, not a read)', () => {
    const c = CUES.trunkOffset;
    for (const l of [c.cue, c.escalate, c.regress]) expect(l).not.toMatch(/\bribs?\b|cylinder/i);
    expect(c.cue).toMatch(/shoulders.*hips/i);
  });
});

// ── MIRROR-COACH P9 (2026-09-30): the faded schedule ─────────────────────────────────────────────────────────────────
// The coach used to cue a fault at the same rate however long ago the athlete had fixed it. Now a cue that LANDED (the
// fault read clear for LANDED_CLEAR_REPS reps at the end of the set) steps down one level for the next set — every rep
// → every third rep that shows it → the set's summary only — and the fault coming back (RETURN_FAULT_REPS reps in a row)
// resets it to every rep at once. The helper runs a set the way mirror-harness.tsx does: decide() on faulting frames only
// (squatStage.ts hands the engine nothing on a clean frame), endRep() with the rep's faults, endSet() at the review.
describe('the faded schedule: every rep → every third → summary only, reset when the fault comes back', () => {
  const REP_MS = 2_400;          // a squat rep at the synth's pace
  const FRAME_MS = 100;
  const REPS = 8;                // SQUAT_WORK_REPS
  /** One set. `faultyReps` are 1-based rep numbers that show `fault` on every frame. */
  function runSet(ce: CueEngine, fault: FaultId, faultyReps: readonly number[], t0: number) {
    const spoken: { rep: number; evt: CueEvent }[] = [];
    for (let rep = 1; rep <= REPS; rep++) {
      const faulty = faultyReps.includes(rep);
      if (faulty) {
        for (let t = 0; t < REP_MS; t += FRAME_MS) {
          const evt = ce.decide(t0 + (rep - 1) * REP_MS + t, [fault]);
          if (evt) spoken.push({ rep, evt });
        }
      }
      ce.endRep(faulty ? [fault] : []);
    }
    return { spoken, report: ce.endSet(), end: t0 + REPS * REP_MS };
  }

  it('the numbers are named, and nothing fades without being told where reps end (the engine as it was)', () => {
    expect(FADE_SCHEDULE).toEqual(['everyRep', 'everyThird', 'summaryOnly']);
    expect([LANDED_CLEAR_REPS, FADED_CUE_EVERY, RETURN_FAULT_REPS]).toEqual([3, 3, 2]);
    const ce = new CueEngine();
    for (const f of FAULT_PRIORITY) expect(ce.levelOf(f)).toBe('everyRep');
    // no endRep / endSet: a fault fixed and back is cued exactly as before P9
    expect(ce.decide(1_000, ['heelRise'])?.level).toBe('cue');
    expect(ce.decide(60_000, ['heelRise'])).not.toBeNull();
    expect(ce.levelOf('heelRise')).toBe('everyRep');
  });

  it('set 1: cued on the rep it showed, then clear for 7 reps — it landed, so set 2 fades to every third', () => {
    const ce = new CueEngine();
    const s1 = runSet(ce, 'heelRise', [1], 0);
    expect(s1.spoken.map((s) => [s.rep, s.evt.level])).toEqual([[1, 'cue']]);
    expect(s1.report.faults).toEqual([
      { fault: 'heelRise', level: 'everyRep', next: 'everyThird', faultReps: 1, spoken: 1, landed: true, returned: false, slipped: false },
    ]);
    expect(ce.levelOf('heelRise')).toBe('everyThird');
  });

  it('set 2 (every third): silent on the first and second rep that show it, cued on the third; clear to the end → summary only', () => {
    const ce = new CueEngine();
    let t = runSet(ce, 'heelRise', [1], 0).end;
    ce.reset();                                                     // the harness's start() — the schedule survives it
    const s2 = runSet(ce, 'heelRise', [1, 3, 5], t);
    expect(s2.spoken.map((s) => s.rep)).toEqual([5]);               // the third rep to show it, and only that one
    expect(s2.report.faults[0]).toMatchObject({ level: 'everyThird', next: 'summaryOnly', faultReps: 3, spoken: 1, landed: true });
    t = s2.end;
    // set 3 (summary only): two slips, never on consecutive reps — not one word during the set, both in the summary
    const s3 = runSet(ce, 'heelRise', [2, 6], t);
    expect(s3.spoken).toEqual([]);
    expect(s3.report.faults[0]).toMatchObject({ level: 'summaryOnly', next: 'summaryOnly', faultReps: 2, spoken: 0, returned: false });
    const lines = fadeReviewLines(s3.report, (f) => f);
    // MIRROR-COACH P9 fix: the words are about what the reps showed ("you had been holding it" was said even when the
    // fault showed on half the set — that case now steps back up, tested below)
    expect(lines).toEqual(['heelRise: 2 of 8 reps. Left for this summary: it had stayed away at the end of your earlier sets.']);
  });

  it('the fault coming back (two reps in a row) resets it to every rep at once, and the coach speaks on the rep that brought it back', () => {
    const ce = new CueEngine();
    let t = runSet(ce, 'heelRise', [1], 0).end;
    t = runSet(ce, 'heelRise', [], t).end;                          // a clean set at every third lands again
    expect(ce.levelOf('heelRise')).toBe('summaryOnly');
    const s = runSet(ce, 'heelRise', [3, 4, 5, 6], t);
    expect(s.spoken[0].rep).toBe(4);                                // rep 3 is one slip (silent); rep 4 makes two in a row
    expect(s.spoken.length).toBeGreaterThanOrEqual(2);              // …and it is cued again as an every-rep fault after
    expect(s.spoken.every((x) => x.rep >= 4)).toBe(true);
    expect(s.report.faults[0]).toMatchObject({ level: 'everyRep', next: 'everyRep', faultReps: 4, returned: true, landed: false });
    expect(ce.levelOf('heelRise')).toBe('everyRep');
    expect(fadeReviewLines(s.report, (f) => f)[0]).toBe('heelRise came back on 4 of 8 reps, so the cues for it started again.');
  });

  it('the reset happens mid-set: the level is back to every rep the moment the second rep in a row ends', () => {
    const ce = new CueEngine();
    runSet(ce, 'lateralShift', [1], 0);
    expect(ce.levelOf('lateralShift')).toBe('everyThird');
    ce.endRep(['lateralShift']);
    expect(ce.levelOf('lateralShift')).toBe('everyThird');          // one slip is not a return
    ce.endRep(['lateralShift']);
    expect(ce.levelOf('lateralShift')).toBe('everyRep');            // two in a row is
  });

  it('a single slip at every third is not a return: the first and second showing reps stay silent', () => {
    const ce = new CueEngine();
    runSet(ce, 'armFall', [1], 0);
    const s = runSet(ce, 'armFall', [2, 7], 100_000);
    expect(s.spoken).toEqual([]);
    expect(s.report.faults[0]).toMatchObject({ level: 'everyThird', faultReps: 2, returned: false });
    expect(fadeReviewLines(s.report, (f) => f)).toEqual(['armFall: 2 of 8 reps, cued every third time it showed.']);
  });

  it('a cue lands only if the fault is clear for LANDED_CLEAR_REPS reps at the END of the set', () => {
    const ce = new CueEngine();
    const s = runSet(ce, 'heelRise', [1, 7], 0);                    // clear on 2–6, back on rep 7: the set ends 1 rep clear
    expect(s.report.faults[0]).toMatchObject({ landed: false, next: 'everyRep' });
    expect(ce.levelOf('heelRise')).toBe('everyRep');
    const short = new CueEngine();
    short.decide(0, ['heelRise']); short.endRep(['heelRise']); short.endRep([]); short.endRep([]);
    expect(short.endSet().faults[0]).toMatchObject({ landed: false });   // two clear reps is not three
  });

  it('a fault never cued has nothing to fade (it showed, the voice was on another fault)', () => {
    const ce = new CueEngine();
    ce.endRep(['shallow']);                                          // the rep book knew; the coach never spoke about it
    for (let i = 0; i < 5; i++) ce.endRep([]);
    const r = ce.endSet();
    expect(r.faults).toEqual([{ fault: 'shallow', level: 'everyRep', next: 'everyRep', faultReps: 1, spoken: 0, landed: false, returned: false, slipped: false }]);
    expect(fadeReviewLines(r, (f) => f)).toEqual([]);
  });

  it('reset() (a new set) keeps the schedule; forget() clears it; an unfinished set earns no step down', () => {
    const ce = new CueEngine();
    runSet(ce, 'heelRise', [1], 0);
    ce.reset();
    expect(ce.levelOf('heelRise')).toBe('everyThird');
    // an abandoned set (End before the review): reps fed, no endSet — reset() drops them, nothing steps down
    ce.decide(200_000, ['heelRise']); for (let i = 0; i < 6; i++) ce.endRep([]);
    ce.reset();
    expect(ce.levelOf('heelRise')).toBe('everyThird');
    ce.forget();
    expect(ce.levelOf('heelRise')).toBe('everyRep');
    expect(ce.endSet()).toEqual({ reps: 0, faults: [] });
  });

  it('the unverified knee never enters the rep book either', () => {
    const ce = new CueEngine({ valgusVerified: false });
    for (let i = 0; i < 4; i++) ce.endRep(['kneeValgus']);
    expect(ce.endSet().faults).toEqual([]);
  });

  it('a faded, quiet fault never holds the voice down for the fault behind it', () => {
    const ce = new CueEngine();
    runSet(ce, 'heelRise', [1], 0);
    runSet(ce, 'heelRise', [], 50_000);                              // → summary only
    const evt = ce.decide(100_000, ['heelRise', 'lateralShift']);
    expect(evt?.fault).toBe('lateralShift');
  });

  it('the review lines say what the fade did, and nothing about a body the camera did not read', () => {
    const report: SetReport = { reps: 8, faults: [
      { fault: 'heelRise', level: 'everyRep', next: 'everyThird', faultReps: 1, spoken: 1, landed: true, returned: false, slipped: false },
      { fault: 'armFall', level: 'everyThird', next: 'summaryOnly', faultReps: 0, spoken: 0, landed: true, returned: false, slipped: false },
    ] };
    const lines = fadeReviewLines(report, (f) => (f === 'heelRise' ? 'Heels lifting on the descent' : 'Shoulders drifting sideways off the start line'));
    // MIRROR-COACH P9 fix (code review): these said "Heels lifting on the descent held." — the FAULT held, read plainly,
    // the opposite of what landed means. Now the fix is what held.
    expect(lines).toEqual([
      'Fixed and kept: heels lifting on the descent stayed away for the last 3+ reps. Next set it gets a cue every third time it shows.',
      'Fixed and kept again: shoulders drifting sideways off the start line stayed away for the last 3+ reps. Next set it is saved for the end of the set.',
    ]);
    for (const l of lines) expect(l).not.toMatch(/\bheld\b/);
    for (const l of lines) expect(l).not.toMatch(/injur|prevent|risk|pain|diagnos|\bribs?\b/i);
  });
});

// ── MIRROR-COACH P9 FIX (2026-09-30, code review) ──────────────────────────────────────────────────────────────────────
describe('P9 fix: a quiet (faded) fault is still present — the coach never confirms a fault on screen', () => {
  /**
   * One set, fed the way the harness feeds it. `faultyReps` show `fault` on the first 60 % of the rep's frames (the
   * descent and the bottom); the rest of the rep is clean. `wiring`: 'faultOnly' — decide() only on frames with a fault
   * (the harness before this fix); 'everyFrame' — every frame, [] on a clean one, with a rep-cleared engine (the harness now).
   */
  function film(ce: CueEngine, fault: FaultId, faultyReps: readonly number[], t0: number, o: { repMs: number; wiring: 'faultOnly' | 'everyFrame'; reps?: number }) {
    const FRAME = 100;
    const out: { rep: number; showing: boolean; evt: CueEvent }[] = [];
    const reps = o.reps ?? 8;
    for (let rep = 1; rep <= reps; rep++) {
      const faulty = faultyReps.includes(rep);
      for (let t = 0; t < o.repMs; t += FRAME) {
        const showing = faulty && t < o.repMs * 0.6;
        if (!showing && o.wiring === 'faultOnly') continue;
        const evt = ce.decide(t0 + (rep - 1) * o.repMs + t, showing ? [fault] : []);
        if (evt) out.push({ rep, showing, evt });
      }
      ce.endRep(faulty ? [fault] : []);
    }
    return { said: out, report: ce.endSet(), end: t0 + reps * o.repMs };
  }
  const toEveryThird = (ce: CueEngine, fault: FaultId) => {
    // set 1: cued on rep 1, clean to the end → lands → every third
    const s = film(ce, fault, [1], 0, { repMs: 2_400, wiring: 'faultOnly' });
    expect(ce.levelOf(fault)).toBe('everyThird');
    ce.reset();
    return s.end;
  };

  it('THE REVIEW\'S REPRODUCTION: every third, the fault on reps 1, 3, 5, 7 at 6 s a rep — no "Own it." while it shows', () => {
    for (const wiring of ['faultOnly', 'everyFrame'] as const) {
      const ce = new CueEngine({ clearByRep: wiring === 'everyFrame' });
      const t = toEveryThird(ce, 'heelRise');
      const s = film(ce, 'heelRise', [1, 3, 5, 7], t + 60_000, { repMs: 6_000, wiring });
      const confirmsWhileShowing = s.said.filter((x) => x.evt.level === 'confirm' && x.showing);
      expect(confirmsWhileShowing, wiring).toEqual([]);
      expect(s.said.filter((x) => x.evt.level !== 'confirm').map((x) => x.rep), wiring).toEqual([5]);   // the third to show it
    }
  });

  it('with the harness\'s wiring the confirmation still comes — on a clean frame, after the fault was spoken this set', () => {
    const ce = new CueEngine({ clearByRep: true });
    const t = toEveryThird(ce, 'heelRise');
    const s = film(ce, 'heelRise', [1, 3, 5], t + 60_000, { repMs: 6_000, wiring: 'everyFrame' });
    const confirms = s.said.filter((x) => x.evt.level === 'confirm');
    expect(confirms).toHaveLength(1);
    // rep 6 is the clean rep that clears it (at its end); CLEAR_CONFIRM_MS later, on rep 7's clean frames, the one word
    expect(confirms[0]).toMatchObject({ rep: 7, showing: false });
  });

  it('at a faded level a fault NOT spoken this set is never confirmed (a confirmation is speech; summary-only says nothing)', () => {
    const ce = new CueEngine({ clearByRep: true });
    let t = toEveryThird(ce, 'heelRise');
    t = film(ce, 'heelRise', [], t, { repMs: 2_400, wiring: 'everyFrame' }).end;     // lands again → summary only
    ce.reset();
    expect(ce.levelOf('heelRise')).toBe('summaryOnly');
    const s = film(ce, 'heelRise', [2], t + 60_000, { repMs: 6_000, wiring: 'everyFrame' });
    expect(s.said).toEqual([]);
  });

  it('every rep (unfaded): a fixed fault is confirmed once, as it always was', () => {
    const ce = new CueEngine({ clearByRep: true });
    const s = film(ce, 'heelRise', [1], 0, { repMs: 2_400, wiring: 'everyFrame' });
    expect(s.said.map((x) => x.evt.level)).toEqual(['cue', 'confirm']);
    expect(s.said[1].showing).toBe(false);
  });
});

describe('P9 fix: a fault cleared by a clean REP (clearByRep), not by a frame between reads', () => {
  it('a fault read only at the bottom of every rep is never "cleared" at the top: it still escalates when it survives', () => {
    const ce = new CueEngine({ clearByRep: true });
    const said: string[] = [];
    for (let rep = 0; rep < 8; rep++) {
      for (let t = 0; t < 2_400; t += 100) {
        const e = ce.decide(rep * 2_400 + t, t < 1_200 ? ['heelRise'] : []);
        if (e) said.push(e.level);
      }
      ce.endRep(['heelRise']);
    }
    expect(said).toEqual(['cue', 'cue', 'escalate']);            // what the fault-frames-only wiring gave (squatStage.test.ts)
    // the frame-timed engine fed the same frames would clear it at every top and never escalate — why the harness sets it
    const legacy = new CueEngine();
    const l: string[] = [];
    for (let rep = 0; rep < 8; rep++) for (let t = 0; t < 2_400; t += 100) { const e = legacy.decide(rep * 2_400 + t, t < 1_200 ? ['heelRise'] : []); if (e) l.push(e.level); }
    expect(l).not.toContain('escalate');
  });

  it('a whole clean rep clears it, and its escalation starts over: back after clean reps, it is a cue again', () => {
    const ce = new CueEngine({ clearByRep: true });
    const said: { at: number; level: string }[] = [];
    const rep = (i: number, faulty: boolean) => {
      for (let t = 0; t < 3_000; t += 100) { const e = ce.decide(i * 3_000 + t, faulty && t < 1_500 ? ['elbowFlare'] : []); if (e) said.push({ at: i * 3_000 + t, level: e.level }); }
      ce.endRep(faulty ? ['elbowFlare'] : []);
    };
    for (let i = 0; i < 5; i++) rep(i, true);                     // 15 s of it: cue, cue, escalate
    expect(said.map((x) => x.level)).toEqual(['cue', 'cue', 'escalate']);
    rep(5, false);                                                 // one clean rep: cleared, escalation forgotten
    rep(6, true);                                                  // (inside CLEAR_CONFIRM_MS, so no confirmation between)
    expect(said[said.length - 1]).toMatchObject({ level: 'cue' });
  });

  it('with no endRep a rep-cleared engine never clears on its own (a paused athlete is not a fixed one)', () => {
    const ce = new CueEngine({ clearByRep: true });
    expect(ce.decide(0, ['heelRise'])?.level).toBe('cue');
    for (let t = 100; t < 20_000; t += 100) expect(ce.decide(t, [])).toBeNull();
    expect(ce.decide(20_000, ['heelRise'])?.level).toBe('escalate');
  });
});

describe('P9 fix: a faded fault that keeps showing steps back up (it never could)', () => {
  const REP = 2_400;
  function set(ce: CueEngine, fault: FaultId, faulty: readonly number[], t0: number) {
    const said: CueEvent[] = [];
    for (let rep = 1; rep <= 8; rep++) {
      for (let t = 0; t < REP; t += 100) {
        const showing = faulty.includes(rep) && t < REP * 0.6;
        const e = ce.decide(t0 + (rep - 1) * REP + t, showing ? [fault] : []);
        if (e) said.push(e);
      }
      ce.endRep(faulty.includes(rep) ? [fault] : []);
    }
    return { said, report: ce.endSet(), end: t0 + 8 * REP };
  }
  const toSummaryOnly = (ce: CueEngine) => {
    let t = set(ce, 'heelRise', [1], 0).end;
    t = set(ce, 'heelRise', [], t + 10_000).end;
    expect(ce.levelOf('heelRise')).toBe('summaryOnly');
    return t + 10_000;
  };

  it('THE REVIEW\'S REPRODUCTION: summary only, the fault on reps 1, 3, 5, 7 (half the set) — it goes back to every third', () => {
    const ce = new CueEngine({ clearByRep: true });
    let t = toSummaryOnly(ce);
    const s = set(ce, 'heelRise', [1, 3, 5, 7], t);
    expect(s.said).toEqual([]);                                     // silent during the set (no two in a row)
    expect(s.report.faults[0]).toMatchObject({ level: 'summaryOnly', next: 'everyThird', faultReps: 4, landed: false, returned: false, slipped: true });
    expect(ce.levelOf('heelRise')).toBe('everyThird');
    const lines = fadeReviewLines(s.report, (f) => f);
    expect(lines).toEqual(['heelRise: 4 of 8 reps, not cued during the set. That is too often to leave it, so next set it gets a cue every third time it shows again.']);
    expect(lines.join(' ')).not.toMatch(/holding it|stayed away/);
    // …and the next set it IS cued (every third), where before it was silent for good
    t = s.end + 10_000;
    const next = set(ce, 'heelRise', [1, 3, 5, 7], t);
    expect(next.said.filter((e) => e.level !== 'confirm').length).toBeGreaterThan(0);
  });

  it('every third on half the reps steps back to every rep; fewer than FADED_CUE_EVERY showings keeps its level', () => {
    const ce = new CueEngine({ clearByRep: true });
    set(ce, 'heelRise', [1], 0);
    expect(ce.levelOf('heelRise')).toBe('everyThird');
    const s = set(ce, 'heelRise', [1, 3, 5, 7], 50_000);
    expect(s.report.faults[0]).toMatchObject({ level: 'everyThird', next: 'everyRep', slipped: true });
    expect(ce.levelOf('heelRise')).toBe('everyRep');
    expect(fadeReviewLines(s.report, (f) => f)[0]).toMatch(/too often to leave it, so next set it gets a cue every time it shows again\.$/);
    const ce2 = new CueEngine({ clearByRep: true });
    set(ce2, 'heelRise', [1], 0);
    const two = set(ce2, 'heelRise', [2, 6], 50_000);
    expect(two.report.faults[0]).toMatchObject({ next: 'everyThird', slipped: false });
    expect(FADED_CUE_EVERY).toBe(3);
  });
});

describe('P9 fix: the press/row switch and the painter\'s rule', () => {
  it('PRESS_ROW_CUE_VERIFIED is the one switch: off, the three faults never reach the engine (like the knee)', () => {
    expect(PRESS_ROW_CUE_FAULTS).toEqual(['elbowFlare', 'shrug', 'trunkOffset']);
    expect(cueableFaults(['elbowFlare', 'shrug', 'trunkOffset', 'heelRise'], true, false)).toEqual(['heelRise']);
    expect(cueableFaults(['elbowFlare', 'kneeValgus'], false, true)).toEqual(['elbowFlare']);
    const off = new CueEngine({ pressRowVerified: false });
    expect(off.decide(0, ['elbowFlare'])).toBeNull();
    off.endRep(['elbowFlare']);
    expect(off.endSet().faults).toEqual([]);
    expect(new CueEngine({ pressRowVerified: true }).decide(0, ['elbowFlare'])?.fault).toBe('elbowFlare');
    expect(typeof PRESS_ROW_CUE_VERIFIED).toBe('boolean');
  });

  it('isVoiceable: every rep → always; every third → the third showing rep only; summary only → never (unless coming back)', () => {
    const ce = new CueEngine({ clearByRep: true });
    expect(ce.isVoiceable('heelRise')).toBe(true);
    ce.decide(0, ['heelRise']); ce.endRep(['heelRise']); for (let i = 0; i < 4; i++) ce.endRep([]); ce.endSet();
    expect(ce.levelOf('heelRise')).toBe('everyThird');
    const shownOn: boolean[] = [];
    for (let rep = 0; rep < 3; rep++) { shownOn.push(ce.isVoiceable('heelRise')); ce.endRep(['heelRise']); ce.endRep([]); }
    expect(shownOn).toEqual([false, false, true]);
  });
});

// MIRROR-COACH P9: the external-focus policy (lib/coach/cueLint.ts) — the live coach's own table, held here too.
describe('every card leads with the world, not the body (the external-focus policy)', () => {
  it('cue and escalate pass the attention lint; regress passes the instruction lint; no card names a muscle', () => {
    for (const [fault, card] of Object.entries(CUES)) {
      expect(lintCue(card.cue, 'attention'), `${fault}.cue`).toEqual([]);
      expect(lintCue(card.escalate, 'attention'), `${fault}.escalate`).toEqual([]);
      expect(lintCue(card.regress, 'instruction'), `${fault}.regress`).toEqual([]);
    }
  });

  it('the press/row cards talk about the handle, never "both" arms (the engine reads the right arm only)', () => {
    for (const f of ['elbowFlare', 'shrug'] as FaultId[]) {
      const c = CUES[f];
      expect(c.cue).toMatch(/handle/);
      for (const l of [c.cue, c.escalate, c.regress]) expect(l).not.toMatch(/\bboth (arms|elbows|shoulders)\b|\blats?\b|\btraps?\b|depress/i);
    }
  });
});
