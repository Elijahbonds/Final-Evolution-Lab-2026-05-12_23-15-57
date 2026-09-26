// The coach says nothing it cannot back (MIRROR-COACH P1, 2026-09-25).
//
// Two defects in the cue table: the knee escalation claimed "My band is pulling your knees IN" (there is no band, and
// with the valgus sign inverted it fired when the knees were already OUT), and the trunk escalation claimed the ribs
// were flaring (there is no rib landmark). P1 held the knee cue silent (VALGUS_CUE_VERIFIED false) until its read was
// confirmed; the owner switched it on from the synthetic proof (DECISIONS-2 #19) — MIRROR-COACH P2, 2026-09-26, with the
// squareness gate in front of it (squat-audit.ts squareOn). The silent path is still tested: it is the flag's off switch.
import { describe, expect, it } from 'vitest';
import { CUES, CueEngine, VALGUS_CUE_VERIFIED, cueableFaults, type FaultId } from './cue-engine';
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
    expect(c.cue).toMatch(/knees out/i);
  });
});

describe('the trunk card coaches what the trunk fault reads', () => {
  it('shoulders over hips, never the ribs (there is no rib landmark; "pull it to your ribs" on the elbow card is a target, not a read)', () => {
    const c = CUES.trunkOffset;
    for (const l of [c.cue, c.escalate, c.regress]) expect(l).not.toMatch(/\bribs?\b|cylinder/i);
    expect(c.cue).toMatch(/shoulders.*hips/i);
  });
});
