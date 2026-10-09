import { describe, expect, it } from 'vitest';
import {
  COM_ORDER, RELEASE_ZONES, REMOVED_PINS, SIGNAL_RELEASE, prescribePinAndStretch, releaseProtocol, retestPrompt,
} from './smr-pin-stretch';
import { ZONE_SIGNAL, type MirrorSessionLike } from './rnt-breath';
import { isMinorForMirror } from '@/lib/mirror/youth';

// MIRROR-COACH P5 (2026-09-29): this file did not exist before this phase — prescribePinAndStretch had no test and
// no caller (see the function's own comment). Written now because the youth gate (owner decision #6: "no
// pin-and-stretch" for a minor) needed a probe that could tell 'always empty' apart from 'correctly gated'.
//
// MIRROR-COACH P9 (2026-09-30): the release is mounted, so (1) the P5 cases that drifted in lumbo_pelvic drift in
// upper_traps now — lumbo_pelvic's pin (a ball inside the front of the hip) was removed with rib_thoracic's (fingertips
// under the ribs), so an adult drifting there alone rightly gets nothing; every P5 assertion is kept; (2) the gate fails
// closed — only an explicit `false` gets a release; (3) the removed pins are asserted gone, by zone and by text.

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

const EVERY_ZONE: MirrorSessionLike = {
  durationMs: 60_000,
  reps: 10,
  timeInStableMs: {},
  faultCounts: { rib_thoracic: 9, lumbo_pelvic: 9, posterior_chain: 9, lat_rhomboid: 9, upper_traps: 9 },
};

describe('prescribePinAndStretch', () => {
  it('prescribes for an adult when a zone drifted enough to earn it', () => {
    const out = prescribePinAndStretch(driftedSession('upper_traps'), false);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].zone).toBe('upper_traps');
  });

  it('is gated OFF for a minor — no matter how much the session drifted (owner decision #6)', () => {
    const out = prescribePinAndStretch(driftedSession('upper_traps'), true);
    expect(out).toEqual([]);
  });

  it('the minor gate wins even over a session that would otherwise earn every zone', () => {
    expect(prescribePinAndStretch(EVERY_ZONE, true)).toEqual([]);
    expect(prescribePinAndStretch(EVERY_ZONE, false).length).toBeGreaterThan(0);
  });

  it('an adult with a clean session still gets nothing — the gate does not manufacture a need', () => {
    const clean: MirrorSessionLike = { durationMs: 60_000, reps: 10, timeInStableMs: {}, faultCounts: {} };
    expect(prescribePinAndStretch(clean, false)).toEqual([]);
  });

  it('caps at `max` for an adult, same as before the gate was added', () => {
    // P9: two signals have a release now (the elbow path, the shoulder rising), so a cap of 1 is the one that bites
    expect(prescribePinAndStretch(EVERY_ZONE, false, 1)).toHaveLength(1);
    expect(prescribePinAndStretch(EVERY_ZONE, false)).toHaveLength(2);
  });
});

describe('MIRROR-COACH P9: the abdominal and psoas pins are gone', () => {
  it('neither middle zone has a release, and nothing else is missing', () => {
    expect(RELEASE_ZONES).toEqual(['posterior_chain', 'lat_rhomboid', 'upper_traps']);
    expect(Object.keys(REMOVED_PINS).sort()).toEqual(['lumbo_pelvic', 'rib_thoracic']);
    expect(releaseProtocol('rib_thoracic')).toBeNull();
    expect(releaseProtocol('lumbo_pelvic')).toBeNull();
    for (const z of RELEASE_ZONES) expect(releaseProtocol(z)).not.toBeNull();
  });

  it('an adult drifting only in the middle zones is prescribed no release at all', () => {
    expect(prescribePinAndStretch(driftedSession('rib_thoracic'), false)).toEqual([]);
    expect(prescribePinAndStretch(driftedSession('lumbo_pelvic'), false)).toEqual([]);
    // the control: the same session shape in a zone that keeps its release does prescribe
    expect(prescribePinAndStretch(driftedSession('lat_rhomboid'), false)).toHaveLength(1);
  });

  it('no release anywhere presses into the abdomen, the ribs or the front of the hip', () => {
    const everything = RELEASE_ZONES.map((z) => releaseProtocol(z)!).concat(prescribePinAndStretch(EVERY_ZONE, false));
    const ABDOMEN_OR_HIP_FRONT = /\b(ribs?|rib margin|abdom\w*|belly|stomach|diaphragm|psoas|hip flexor|front of the hip|hip bone|groin|navel)\b/i;
    for (const p of everything) {
      for (const text of [p.tissue, p.pin, p.stretch, p.tool]) expect(text, `${p.zone}: ${text}`).not.toMatch(ABDOMEN_OR_HIP_FRONT);
    }
  });

  it('one release per camera signal: the sideways trunk drift has none; the other two each have one', () => {
    expect(SIGNAL_RELEASE).toEqual({ trunkShift: null, elbowPath: 'lat_rhomboid', shoulderRise: 'upper_traps' });
    // the elbow path is read into two zones (kinematic-engine.ts); both drifting earns ONE release, not two
    const both: MirrorSessionLike = { durationMs: 60_000, reps: 10, timeInStableMs: {}, faultCounts: { posterior_chain: 6, lat_rhomboid: 6 } };
    const out = prescribePinAndStretch(both, false);
    expect(out.map((p) => p.zone)).toEqual(['lat_rhomboid']);
    expect(ZONE_SIGNAL.posterior_chain).toBe(ZONE_SIGNAL.lat_rhomboid);
  });

  it('says what the camera read, labelled estimated, in every because line', () => {
    for (const p of prescribePinAndStretch(EVERY_ZONE, false)) {
      expect(p.because).toMatch(/^The camera read .*\(estimated\)/);
      expect(p.because).toMatch(/%/);
    }
  });
});

describe('MIRROR-COACH P9: the youth gate fails closed, from the age truth', () => {
  it('only an explicit `false` releases anything — a forgotten argument does not', () => {
    const s = driftedSession('upper_traps');
    const untyped = prescribePinAndStretch as unknown as (x: MirrorSessionLike, m?: unknown) => unknown[];
    expect(untyped(s)).toEqual([]);
    expect(untyped(s, undefined)).toEqual([]);
    expect(untyped(s, null)).toEqual([]);
    expect(untyped(s, 0)).toEqual([]);
    expect(prescribePinAndStretch(s, false)).toHaveLength(1);
  });

  it('fed by isMinorForMirror: under 18, 18 by year gap, and a blank birth year all get nothing; an adult gets it', () => {
    const now = new Date('2026-09-30T12:00:00Z');
    const s = driftedSession('upper_traps');
    for (const dobYear of [2012, 2009, 2008, null, undefined]) {
      expect(prescribePinAndStretch(s, isMinorForMirror(dobYear, now)), String(dobYear)).toEqual([]);
    }
    expect(prescribePinAndStretch(s, isMinorForMirror(1990, now))).toHaveLength(1);
  });
});

describe('retestPrompt', () => {
  it('says there is nothing to release for an empty order — what a minor always sees now', () => {
    expect(retestPrompt(prescribePinAndStretch(driftedSession('upper_traps'), true))).toBe(
      'Nothing to release from that set — go straight back in.',
    );
  });
});
