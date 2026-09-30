import { describe, expect, it } from 'vitest';
import { COM_ORDER, prescribePinAndStretch, retestPrompt } from './smr-pin-stretch';
import type { MirrorSessionLike } from './rnt-breath';

// MIRROR-COACH P5 (2026-09-29): this file did not exist before this phase — prescribePinAndStretch had no test and
// no caller (see the function's own comment). Written now because the youth gate (owner decision #6: "no
// pin-and-stretch" for a minor) needed a probe that could tell 'always empty' apart from 'correctly gated'.

/** A session that drifted hard in one zone (need well above the 0.3 floor) and stayed clean everywhere else. */
function driftedSession(zone: keyof typeof COM_ORDER): MirrorSessionLike {
  const durationMs = 60_000; // 1 minute, so faultsPerMin === the raw count
  return {
    durationMs,
    reps: 10,
    timeInStableMs: { [zone]: 0 },
    faultCounts: { [zone]: 5 },
  };
}

describe('prescribePinAndStretch', () => {
  it('prescribes for an adult when a zone drifted enough to earn it', () => {
    const out = prescribePinAndStretch(driftedSession('lumbo_pelvic'), false);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].zone).toBe('lumbo_pelvic');
  });

  it('is gated OFF for a minor — no matter how much the session drifted (owner decision #6)', () => {
    const out = prescribePinAndStretch(driftedSession('lumbo_pelvic'), true);
    expect(out).toEqual([]);
  });

  it('the minor gate wins even over a session that would otherwise earn every zone', () => {
    const s: MirrorSessionLike = {
      durationMs: 60_000,
      reps: 10,
      timeInStableMs: {},
      faultCounts: { rib_thoracic: 9, lumbo_pelvic: 9, posterior_chain: 9, lat_rhomboid: 9, upper_traps: 9 },
    };
    expect(prescribePinAndStretch(s, true)).toEqual([]);
    expect(prescribePinAndStretch(s, false).length).toBeGreaterThan(0);
  });

  it('an adult with a clean session still gets nothing — the gate does not manufacture a need', () => {
    const clean: MirrorSessionLike = { durationMs: 60_000, reps: 10, timeInStableMs: {}, faultCounts: {} };
    expect(prescribePinAndStretch(clean, false)).toEqual([]);
  });

  it('caps at `max` for an adult, same as before the gate was added', () => {
    const s: MirrorSessionLike = {
      durationMs: 60_000,
      reps: 10,
      timeInStableMs: {},
      faultCounts: { rib_thoracic: 9, lumbo_pelvic: 9, posterior_chain: 9, lat_rhomboid: 9, upper_traps: 9 },
    };
    expect(prescribePinAndStretch(s, false, 2)).toHaveLength(2);
  });
});

describe('retestPrompt', () => {
  it('says there is nothing to release for an empty order — what a minor always sees now', () => {
    expect(retestPrompt(prescribePinAndStretch(driftedSession('lumbo_pelvic'), true))).toBe(
      'Nothing to release from that set — go straight back in.',
    );
  });
});
