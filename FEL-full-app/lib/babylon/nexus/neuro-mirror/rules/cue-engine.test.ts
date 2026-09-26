// The coach says nothing it cannot back (MIRROR-COACH P1, 2026-09-25).
//
// Two defects in the cue table: the knee escalation claimed "My band is pulling your knees IN" (there is no band, and
// with the valgus sign inverted it fired when the knees were already OUT), and the trunk escalation claimed the ribs
// were flaring (there is no rib landmark). And the knee cue itself is held silent until a real recording confirms the
// fixed read (VALGUS_CUE_VERIFIED) — measured, recorded, never spoken.
import { describe, expect, it } from 'vitest';
import { CUES, CueEngine, VALGUS_CUE_VERIFIED, cueableFaults, type FaultId } from './cue-engine';
import { SquatAudit } from './squat-audit';
import { CLEAN, filmSquat, type SquatShape } from './__fixtures__/synthSquat';

describe('the knee stays silent until a real recording confirms the read', () => {
  it('ships unverified', () => {
    expect(VALGUS_CUE_VERIFIED).toBe(false);
  });

  it('the default engine never speaks about the knee — cue, escalation or confirmation', () => {
    const ce = new CueEngine();
    expect(ce.decide(1_000, ['kneeValgus'])).toBeNull();
    expect(ce.decide(40_000, ['kneeValgus'])).toBeNull();          // long past any escalation window
    expect(ce.decide(50_000, [])).toBeNull();                       // "cleared" — and still no confirmation
    expect(ce.decide(60_000, [])).toBeNull();
  });

  it('the fault behind the knee still gets the voice, straight away', () => {
    const ce = new CueEngine();
    const evt = ce.decide(1_000, ['kneeValgus', 'heelRise']);
    expect(evt?.fault).toBe('heelRise');
    expect(evt?.level).toBe('cue');
  });

  it('cueableFaults drops only the knee, and only while unverified', () => {
    const all: FaultId[] = ['kneeValgus', 'heelRise', 'lateralShift'];
    expect(cueableFaults(all)).toEqual(['heelRise', 'lateralShift']);
    expect(cueableFaults(all, true)).toEqual(all);
    expect(cueableFaults(all)).not.toBe(all);                       // a copy, never the caller's array
  });

  it('once verified, the knee is cued first (the flag is the only switch)', () => {
    const ce = new CueEngine({ valgusVerified: true });
    expect(ce.decide(1_000, ['armFall', 'kneeValgus'])?.fault).toBe('kneeValgus');
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

// MIRROR-COACH P1 review (2026-09-25): the conditions for flipping VALGUS_CUE_VERIFIED, the ones code can hold. The
// engine runs VERIFIED here, fed by the real SquatAudit the way the harness feeds it (only faulting frames reach
// decide()), over squats filmed through lib/pose/synth.ts with its default landmark jitter.
describe('before the knee cue may be switched on: what a verified engine would say', () => {
  const kneeCues = (shape: SquatShape, seed?: number): number => {
    const audit = new SquatAudit();
    const ce = new CueEngine({ valgusVerified: true });
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

  it('and a knee that really caves is still cued clean, and still handed to the engine under jitter', () => {
    expect(kneeCues({ shiftL: -0.06, shiftR: -0.06 })).toBeGreaterThan(0);
    // under jitter another fault can take the voice first and hold it down for 6 s (the engine's own discipline), so
    // the bar here is that the audit hands the engine the knee at all
    for (const seed of SEEDS.slice(0, 5)) {
      const audit = new SquatAudit();
      const fed = filmSquat({ shiftL: -0.06 }, { seed }).map((f) => audit.evaluate(f)).filter((r) => r.faults.includes('kneeValgus')).length;
      expect(fed, `seed ${seed}`).toBeGreaterThan(0);
    }
  });

  // KNOWN FAILURE, on purpose: condition 4 of VALGUS_CUE_VERIFIED. A straight squat 10° off square reads its forward
  // knee travel as a cave. When this starts passing, `.fails` turns it red: move it into the block above.
  it.fails('no knee cue on a straight squat 10° off square (NOT yet: the flip waits on this)', () => {
    for (const seed of SEEDS.slice(0, 5)) expect(kneeCues({ turnDeg: 10 }, seed), `seed ${seed}`).toBe(0);
  });
});

describe('the trunk card coaches what the trunk fault reads', () => {
  it('shoulders over hips, never the ribs (there is no rib landmark; "pull it to your ribs" on the elbow card is a target, not a read)', () => {
    const c = CUES.trunkOffset;
    for (const l of [c.cue, c.escalate, c.regress]) expect(l).not.toMatch(/\bribs?\b|cylinder/i);
    expect(c.cue).toMatch(/shoulders.*hips/i);
  });
});
