// setupLine.test — MIRROR-COACH P4, 2026-09-29. Fixtures filmed through lib/pose/synth.ts (hingeSetupBuild.ts).
import { describe, expect, it } from 'vitest';
import { LEFT_WRIST, RIGHT_WRIST } from '@/lib/pose/landmarks';
import { setupClean, setupWrongView, setupHipsHigh, mirrorFrames, dimVisibility } from './fixtures/hingeSetupBuild';
import {
  auditSetup, hipHeightFraction, shoulderAheadOfHandRatio, SETUP_THRESHOLDS, SETUP_CUES, setupLinePattern,
} from './setupLine';

const faultOf = (r: ReturnType<typeof auditSetup>, id: string) => r.faults.find((f) => f.id === id)!;

describe('auditSetup — a good set-up', () => {
  const r = auditSetup(setupClean());

  it('hip height reads between the shoulders and the knees, ok', () => {
    const f = faultOf(r, 'hipHeight');
    expect(f.status).toBe('ok');
    expect(f.value).toBeGreaterThan(SETUP_THRESHOLDS.hipHeightLow);
    expect(f.value).toBeLessThan(SETUP_THRESHOLDS.hipHeightHigh);
  });
  it('the shoulders sit over (or ahead of) the hands, ok', () => {
    expect(faultOf(r, 'barLine').status).toBe('ok');
  });
  it('the head reads in line, ok', () => {
    expect(faultOf(r, 'headLine').status).toBe('ok');
  });
  it('says the set-up looks ready, and only that — one line, not a list', () => {
    expect(r.note).toBe('Set-up looks ready.');
  });
  it('reads a real number of held frames', () => {
    expect(r.readableFrames).toBeGreaterThan(SETUP_THRESHOLDS.minReadableFrames);
  });
});

describe('auditSetup — hips riding high', () => {
  const r = auditSetup(setupHipsHigh());

  it('flags hip height, low fraction (near the shoulders, not the knees)', () => {
    const f = faultOf(r, 'hipHeight');
    expect(f.status).toBe('fault');
    expect(f.value).toBeLessThan(SETUP_THRESHOLDS.hipHeightLow);
  });
  it('the one adjustment line names the hips, framed as set-up — never posture or health', () => {
    expect(r.note).toMatch(/hips/i);
    expect(r.note).not.toMatch(/postur|health|injur|risk|diagnos/i);
  });
});

describe('auditSetup — wrong view', () => {
  const r = auditSetup(setupWrongView());
  it('every check unreadable, the turn-side-on line, no loop', () => {
    for (const f of r.faults) expect(f.status).toBe('unreadable');
    expect(r.note).toBe('Turn side-on to the camera.');
  });
});

describe('auditSetup — low visibility degrades one check at a time', () => {
  it('wrists too dim: bar line unreadable, hip height and head line unaffected', () => {
    const dimmed = dimVisibility(setupClean(), [LEFT_WRIST, RIGHT_WRIST]);
    const r = auditSetup(dimmed);
    expect(faultOf(r, 'barLine').status).toBe('unreadable');
    expect(faultOf(r, 'hipHeight').status).toBe('ok');
    expect(faultOf(r, 'headLine').status).toBe('ok');
  });
});

describe('auditSetup — a mirrored (selfie) camera reads the same shape', () => {
  it('clean set-up, mirrored', () => {
    const clean = setupClean();
    const straight = auditSetup(clean), mirrored = auditSetup(mirrorFrames(clean));
    expect(mirrored.faults[0].side).not.toBe(straight.faults[0].side);
    for (const id of ['hipHeight', 'barLine', 'headLine'] as const) {
      expect(faultOf(mirrored, id).status).toBe(faultOf(straight, id).status);
      expect(faultOf(mirrored, id).value).toBeCloseTo(faultOf(straight, id).value, 1);
    }
    expect(mirrored.note).toBe(straight.note);
  });
});

describe('the pure geometry helpers', () => {
  it('hipHeightFraction: 0 at the shoulder, 1 at the knee', () => {
    expect(hipHeightFraction({ y: 0 }, { y: 0 }, { y: 1 })).toBeCloseTo(0, 5);
    expect(hipHeightFraction({ y: 0 }, { y: 1 }, { y: 1 })).toBeCloseTo(1, 5);
    expect(hipHeightFraction({ y: 0 }, { y: 0.5 }, { y: 1 })).toBeCloseTo(0.5, 5);
  });
  it('shoulderAheadOfHandRatio: positive when the shoulder is ahead of the wrist, toward the toe', () => {
    const ahead = shoulderAheadOfHandRatio({ x: 0.55, y: 0.3 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.7 } as unknown as { x: number }, { x: 0.48 }, { x: 0.6 });
    expect(ahead).toBeGreaterThan(0);
  });
});

describe('setupLinePattern — the Movement Screen registry entry (lib/mirror/patterns.ts\'s contract)', () => {
  it('matches the phase-4 pattern contract shape: a 5-second timed hold, not reps', () => {
    expect(setupLinePattern.id).toBe('setupLine');
    expect(setupLinePattern.view).toBe('side');
    expect(setupLinePattern.timed).toEqual({ seconds: 5 });
    expect(setupLinePattern.reps).toBeUndefined();
    expect(setupLinePattern.youthSafe).toBe(true);
  });
  it('carries a three-level cue per fault id; none claim posture, health, risk, injury, a rib or a diagnosis', () => {
    expect(SETUP_CUES.map((c) => c.faultId).sort()).toEqual(['barLine', 'headLine', 'hipHeight']);
    for (const c of SETUP_CUES) {
      expect(c.cue).not.toMatch(/postur|health|risk|injur|diagnos|prevent|\brib/i);
      expect(c.escalate).not.toMatch(/postur|health|risk|injur|diagnos|prevent|\brib/i);
      expect(c.regress).not.toMatch(/postur|health|risk|injur|diagnos|prevent|\brib/i);
    }
  });
  it('runs the same audit the standalone function does', () => {
    const clean = setupClean();
    expect(setupLinePattern.audit(clean, {})).toEqual(auditSetup(clean, {}));
  });
});
