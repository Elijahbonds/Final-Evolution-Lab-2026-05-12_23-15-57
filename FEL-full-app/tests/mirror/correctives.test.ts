// Correctives: RNT + breath, and SMR pin-and-stretch (2026-09-12).
// A coaching tool that prescribes work nobody needs is a tool athletes stop trusting, so the
// "clean session earns nothing" cases matter as much as the prescriptions.
import { describe, it, expect } from 'vitest';
import {
  prescribeCorrectives, cleanSessionNote, FAULTS_PER_MIN_FLOOR, MAX_CORRECTIVES,
  type MirrorSessionLike,
} from '../../lib/babylon/nexus/neuro-mirror/rules/rnt-breath';
import {
  prescribePinAndStretch, retestPrompt, COM_ORDER,
} from '../../lib/babylon/nexus/neuro-mirror/rules/smr-pin-stretch';

const MIN = 60_000;
const session = (over: Partial<MirrorSessionLike> = {}): MirrorSessionLike => ({
  durationMs: 4 * MIN, reps: 20, avgTempo: 4000,
  timeInStableMs: {}, faultCounts: {}, ...over,
});

describe('a clean session earns no correctives', () => {
  it('prescribes nothing when nothing drifted', () => {
    expect(prescribeCorrectives(session())).toEqual([]);
  });
  it('prescribes nothing for a zone that held stable almost the whole set', () => {
    const s = session({ faultCounts: { upper_traps: 40 }, timeInStableMs: { upper_traps: 4 * MIN * 0.95 } });
    expect(prescribeCorrectives(s)).toEqual([]);
  });
  it('says something specific and true instead of inventing work', () => {
    const note = cleanSessionNote(session({ reps: 12 }));
    expect(note).toContain('12 rep');
    expect(note).toMatch(/Nothing to correct/);
  });
});

describe('RNT feeds the fault', () => {
  const drifting = session({
    faultCounts: { lumbo_pelvic: 24, upper_traps: 8 },
    timeInStableMs: { lumbo_pelvic: 0.2 * 4 * MIN, upper_traps: 0.5 * 4 * MIN },
  });

  it('prescribes for the zone that actually drifted most', () => {
    const out = prescribeCorrectives(drifting);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].zone).toBe('lumbo_pelvic');
  });

  it('feeds the drift rather than cueing against it — the whole point of RNT', () => {
    const out = prescribeCorrectives(drifting);
    expect(out[0].rnt.direction.toLowerCase()).toMatch(/anterior|same direction|with the/);
    expect(out[0].rnt.why).toMatch(/reflex|organis/i);
  });

  it('caps the plan so it stays a primer, not a workout', () => {
    const everything = session({
      faultCounts: { lumbo_pelvic: 30, upper_traps: 30, rib_thoracic: 30, lat_rhomboid: 30, posterior_chain: 30 },
      timeInStableMs: {},
    });
    expect(prescribeCorrectives(everything).length).toBeLessThanOrEqual(MAX_CORRECTIVES);
  });

  it('carries the caution on every prescription, not in a footer', () => {
    for (const c of prescribeCorrectives(drifting)) {
      expect(c.caution).toMatch(/not a diagnosis/i);
      expect(c.caution).toMatch(/painful|pain/i);
    }
  });

  it('matches breath phases to the athlete\'s own measured tempo', () => {
    const slow = prescribeCorrectives(session({ avgTempo: 7000, faultCounts: { posterior_chain: 20 }, timeInStableMs: {} }));
    const fast = prescribeCorrectives(session({ avgTempo: 2500, faultCounts: { posterior_chain: 20 }, timeInStableMs: {} }));
    expect(slow[0].breath.exhaleSec).toBeGreaterThan(fast[0].breath.exhaleSec);
  });

  it('respects the floor — occasional drift is not a corrective', () => {
    const rare = session({ faultCounts: { upper_traps: 2 }, timeInStableMs: {} });   // 0.5/min
    expect(rare.faultCounts.upper_traps! / 4).toBeLessThan(FAULTS_PER_MIN_FLOOR);
    expect(prescribeCorrectives(rare)).toEqual([]);
  });
});

describe('SMR runs centre-out, because load transfers through the middle', () => {
  it('orders the sequence from the centre of mass outward, not by severity', () => {
    const s = session({
      // upper_traps is the WORST, but it is furthest from the centre
      faultCounts: { upper_traps: 40, rib_thoracic: 12 },
      timeInStableMs: { upper_traps: 0.1 * 4 * MIN, rib_thoracic: 0.3 * 4 * MIN },
    });
    const plan = prescribePinAndStretch(s);
    expect(plan.length).toBe(2);
    expect(plan[0].zone).toBe('rib_thoracic');      // diaphragm first
    expect(plan[0].comOrder).toBeLessThan(plan[1].comOrder);
  });

  it('puts the breathing apparatus at the centre', () => {
    expect(COM_ORDER.rib_thoracic).toBe(0);
    expect(COM_ORDER.upper_traps).toBeGreaterThan(COM_ORDER.lumbo_pelvic);
  });

  it('is pin AND stretch — the half people skip is present', () => {
    const plan = prescribePinAndStretch(session({ faultCounts: { posterior_chain: 20 }, timeInStableMs: {} }));
    expect(plan[0].pin.length).toBeGreaterThan(10);
    expect(plan[0].stretch).toMatch(/slowly|glide|floss|range|rotate|bend/i);
  });

  it('warns off nerve and bone on every protocol', () => {
    const plan = prescribePinAndStretch(session({
      faultCounts: { upper_traps: 20, lat_rhomboid: 20, posterior_chain: 20 }, timeInStableMs: {},
    }));
    for (const p of plan) expect(p.avoid).toMatch(/nerve|tingl|numb/i);
  });

  it('tells the athlete WHY this area, from their own numbers', () => {
    const plan = prescribePinAndStretch(session({ faultCounts: { lumbo_pelvic: 20 }, timeInStableMs: { lumbo_pelvic: 0.25 * 4 * MIN } }));
    expect(plan[0].because).toMatch(/%/);
    expect(plan[0].because).toMatch(/×\/min|\/min/);
  });

  it('ends on the retest, because without it this is just stretching', () => {
    const plan = prescribePinAndStretch(session({ faultCounts: { rib_thoracic: 20 }, timeInStableMs: {} }));
    expect(retestPrompt(plan)).toMatch(/Mirror/);
    expect(retestPrompt([])).toMatch(/Nothing to release/);
  });

  it('changes one thing at a time when the score does not move', () => {
    const plan = prescribePinAndStretch(session({ faultCounts: { rib_thoracic: 20 }, timeInStableMs: {} }));
    expect(retestPrompt(plan)).toMatch(/one thing, not three/);
  });
});
