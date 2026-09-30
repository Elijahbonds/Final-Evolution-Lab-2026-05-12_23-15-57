// The Phase-4 pattern-audit registry (MIRROR-COACH P4, 2026-09-25, lane 1: registry-and-lunge).
//
// What this proves:
//   1. THE REGISTRY ORDER — the squat is entry one (the brief's own words), the lunge entry two, and the rest of the
//      registry (pushup, overhead, carry, hinge, setup-line — other lanes' entries) is undisturbed by lane 1 landing.
//   2. THE SQUAT IS UNCHANGED — squatPattern.audit() reads the same real fixtures the live SquatAudit class and
//      lib/mirror/fixtures/baseline.json (the P1 fixture golden) already agree on: a caving knee faults, a clean one
//      does not, on both real fixtures and the app's own JOINT-BUILT ones.
//   3. THE LUNGE IS MOUNTED CORRECTLY — clean, a caving knee on either leg, the wrong view (baseline F5: "audits
//      unaware of view", closed here), and a mirrored (selfie) stream (the same invariant squat-audit.test.ts holds
//      for the squat).
import { describe, expect, it } from 'vitest';
import { MIRROR_INDEX } from '@/lib/pose/landmarks';
import { MIRROR_PATTERNS } from './patterns';
import { squatPattern } from './squatPattern';
import { lungePattern, auditLunge } from './lungeAudit';
import { readFixture } from './fixtures/load';
import { toPoseFrames, type MirrorFixture } from './fixtures/index';

const fixture = (name: string) => readFixture(name);
const frames = (name: string) => toPoseFrames(fixture(name));

/** A mirrored (selfie) take of a fixture: flip x AND swap the left/right landmark labels — what a mirrored camera
 *  does to MediaPipe's output (the same transform fixtures.test.ts's own invariant test applies to the squat). */
function mirroredFixture(name: string): Pick<MirrorFixture, 'frames'> {
  const fx = fixture(name);
  return {
    frames: fx.frames.map((f) => ({
      ...f,
      lm: f.lm.map((_, i) => { const r = f.lm[MIRROR_INDEX[i]]; return [1 - r[0], r[1], r[2], r[3]]; }),
    })),
  };
}

// MIRROR-COACH P4 review (2026-09-29): carryAudit.ts's trunkSideLean cue read "Stack your ribs back over your hips"
// — a rib claim this same pass's own honesty rule (and cue-engine.ts's own P1 history, this file's header) already
// says 33 2-D landmarks cannot make. hingeAudit.test.ts and setupLine.test.ts each already ran their own cue table
// through a forbidden-word regex but neither one's regex actually included "rib" (the word that regressed), and
// pushupAudit.ts and lungeAudit.ts shipped their own bracing cues ("brace before you move", "Brace once at the top")
// inside patterns marked youthSafe: true with no test catching either. This is ONE registry-wide guard instead of
// four near-duplicate ones, over every pattern MIRROR_PATTERNS actually carries a cue table for.
describe('MIRROR_PATTERNS: every cue, every pattern — no rib/posture/health/risk/injury/diagnosis/bracing claim', () => {
  const FORBIDDEN = /\bpostur|\bhealth|\brisk|injur|diagnos|prevent|\brib(s)?\b|\bbrace/i;
  it('holds for every registered pattern\'s cue table', () => {
    for (const p of MIRROR_PATTERNS) {
      for (const c of p.cues) {
        expect(c.cue, `${p.id}.${c.faultId}.cue`).not.toMatch(FORBIDDEN);
        expect(c.escalate, `${p.id}.${c.faultId}.escalate`).not.toMatch(FORBIDDEN);
        expect(c.regress, `${p.id}.${c.faultId}.regress`).not.toMatch(FORBIDDEN);
      }
    }
  });
});

describe('MIRROR_PATTERNS: the registry order', () => {
  it('the squat is entry one, the lunge entry two — the brief\'s own words', () => {
    expect(MIRROR_PATTERNS[0].id).toBe('squat');
    expect(MIRROR_PATTERNS[1].id).toBe('lunge');
    expect(MIRROR_PATTERNS[0]).toBe(squatPattern);
    expect(MIRROR_PATTERNS[1]).toBe(lungePattern);
  });

  it('every id is unique, and every entry carries the full contract shape', () => {
    const ids = MIRROR_PATTERNS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of MIRROR_PATTERNS) {
      expect(typeof p.label, p.id).toBe('string');
      expect(['front', 'side', 'back'], p.id).toContain(p.view);
      expect(typeof p.audit, p.id).toBe('function');
      expect(Array.isArray(p.cues), p.id).toBe(true);
      expect(typeof p.youthSafe, p.id).toBe('boolean');
      expect(p.timed || p.reps, p.id).toBeTruthy();
    }
  });

  it('landing lane 1\'s two entries did not move or drop any other lane\'s pattern', () => {
    // other lanes' entries, if they have landed by the time this runs — named, not counted, so this test does not
    // become a second orphan-style ratchet that blocks on lanes 2-4's own timing
    const others = MIRROR_PATTERNS.slice(2).map((p) => p.id);
    expect(new Set(others).size).toBe(others.length);
    expect(others).not.toContain('squat');
    expect(others).not.toContain('lunge');
  });
});

describe('squatPattern.audit(): the squat is unchanged (proof against the P1 fixture golden)', () => {
  // squat_clean.json is "clean" for the knee/heel/arm/lateral checks (its whole purpose in fixtures.test.ts's own
  // invariants); its depth genuinely tops out at 0.48 (lib/mirror/fixtures/baseline.json squat_clean.squat.maxDepth01
  // — the SAME number squatPattern.audit reports below), under squat-audit.ts's own documented 0.5 shallow line. That
  // is the fixture's own geometry, not a regression — see the depth test right after this one.
  it('a clean squat: no fault on the four frontal checks (squat_clean.json)', () => {
    const r = squatPattern.audit(frames('squat_clean'), {});
    expect(r.readableFrames).toBeGreaterThan(0);
    for (const f of r.faults) if (f.id !== 'shallow') expect(f.status, f.id).not.toBe('fault');
  });

  it('a caving knee is flagged — left, right, and both together', () => {
    for (const name of ['squat_knee_in_left', 'squat_knee_in_right', 'squat_knees_in_both']) {
      const r = squatPattern.audit(frames(name), {});
      const knee = r.faults.find((f) => f.id === 'kneeValgus')!;
      expect(knee.status, name).toBe('fault');
      expect(knee.value, name).toBeGreaterThan(0);
    }
  });

  it('a knee pushed OUT never faults (reads outward, negative, never caving)', () => {
    for (const name of ['squat_knee_out_left', 'squat_knee_out_right', 'squat_knees_out_both']) {
      const r = squatPattern.audit(frames(name), {});
      expect(r.faults.find((f) => f.id === 'kneeValgus')!.status, name).toBe('ok');
    }
  });

  it('depth matches lib/mirror/fixtures/baseline.json\'s squat.maxDepth01 exactly, on every squat fixture (the P1 golden, unchanged)', () => {
    // every lib/mirror/fixtures build.ts squat fixture tops out at 0.48 (lib/mirror/fixtures/baseline.json) — the
    // point of this test is that squatPattern.audit() reports the SAME number the live audit always has, not a new one
    for (const name of ['squat_clean', 'squat_knee_in_left', 'squat_knee_in_right', 'squat_knees_in_both', 'squat_knee_out_left', 'squat_knee_out_right', 'squat_knees_out_both']) {
      const r = squatPattern.audit(frames(name), {});
      expect(r.faults.find((f) => f.id === 'shallow')!.value, name).toBe(0.48);
    }
  });

  it('an empty capture is unreadable, never a guessed clean read', () => {
    const r = squatPattern.audit([], {});
    expect(r.readableFrames).toBe(0);
    expect(r.faults.every((f) => f.status === 'unreadable')).toBe(true);
  });
});

describe('lungePattern.audit(): mounted — clean, a caving knee either side, the wrong view, mirrored', () => {
  it('a clean lunge (left leg forward): no faults, front leg detected', () => {
    const r = lungePattern.audit(frames('lunge_left_front'), {});
    expect(r.readableFrames).toBeGreaterThan(0);
    for (const f of r.faults) expect(f.status, f.id).not.toBe('fault');
    expect(r.faults.every((f) => f.side === 'left')).toBe(true);
  });

  it('the front knee caving is flagged — measured against the hip–ankle line, not the ankle (baseline F4)', () => {
    const r = lungePattern.audit(frames('lunge_right_front_knee_in'), {});
    const knee = r.faults.find((f) => f.id === 'kneeIn')!;
    expect(knee.status).toBe('fault');
    expect(knee.side).toBe('right');
    expect(knee.value).toBeGreaterThan(0);
  });

  it('the SAME caving-knee capture, mirrored (a selfie stream): still flagged, the side label swapped', () => {
    const mirrored = auditLunge(toPoseFrames(mirroredFixture('lunge_right_front_knee_in')), {});
    const knee = mirrored.faults.find((f) => f.id === 'kneeIn')!;
    expect(knee.status).toBe('fault');
    expect(knee.side).toBe('left');                     // mirrored: the caving leg now carries the OTHER label
    // the magnitude is the same geometry, mirrored — not a different read
    const unmirrored = lungePattern.audit(frames('lunge_right_front_knee_in'), {});
    expect(knee.value).toBeCloseTo(unmirrored.faults.find((f) => f.id === 'kneeIn')!.value, 1);
  });

  it('the clean capture, mirrored, is still clean (the sign does not lean on the left/right convention)', () => {
    const r = auditLunge(toPoseFrames(mirroredFixture('lunge_left_front')), {});
    expect(r.faults.find((f) => f.id === 'kneeIn')!.status).toBe('ok');
    expect(r.faults.every((f) => f.side === 'right')).toBe(true);   // the left-forward fixture, mirrored, reads right
  });

  it('the wrong view (side-on) is unreadable, never a guessed number (baseline F5: audits unaware of view)', () => {
    for (const name of ['stand_side', 'hinge_side']) {
      const r = lungePattern.audit(frames(name), {});
      expect(r.readableFrames, name).toBe(0);
      expect(r.faults.every((f) => f.status === 'unreadable'), name).toBe(true);
      expect(r.note, name).toMatch(/square/i);
    }
  });

  it('an empty capture is unreadable, never a guessed clean read', () => {
    const r = lungePattern.audit([], {});
    expect(r.readableFrames).toBe(0);
    expect(r.faults.every((f) => f.status === 'unreadable')).toBe(true);
  });

  it('ctx.side names which leg the set was FOR, and is reported on every fault', () => {
    const r = lungePattern.audit(frames('lunge_left_front'), { side: 'left' });
    expect(r.faults.every((f) => f.side === 'left')).toBe(true);
  });
});
