// TOOLS-EASY (2026-10-28): the readiness check's and the combine jump station's live takes, on JUMP-PRO's physics bench
// filmed through the app's virtual camera (lib/tools-easy/sim.ts). What the bench found (scripts/tools-easy-bench.ts,
// docs/TOOLS-EASY-AUDIT.md §5), pinned. Pure.
import { describe, expect, it } from 'vitest';
import { simulateTake, type TakeLike, type TrialBlock } from '@/lib/tools-easy/sim';
import { ReadinessCapture } from '@/lib/coach/readiness/capture';
import { JumpTake } from '@/lib/combine/jumpTake';
import { refusalLine, standLine } from '@/lib/tools-easy/liveJump';

const H = [0.42, 0.43, 0.41, 0.44, 0.42, 0.4];
const hips = (n = 6) => H.slice(0, n).map((h) => ({ heightM: h }));
const readiness = (): TakeLike => new ReadinessCapture({ aspect: 4 / 3, cameraFps: 60 }) as unknown as TakeLike;
const combine = (): TakeLike => new JumpTake({ jumps: 3, aspect: 4 / 3, cameraFps: 60 }) as unknown as TakeLike;
const swingFirst = (n: number): TrialBlock[] => [{ trials: Array.from({ length: n }, () => ({ heightM: 0.44 })), style: { armSwing: true } }, { trials: hips(5) }];

describe('the readiness check, live', () => {
  it('a refused jump says its reason and its fix, does not fill a slot, and the check still reads three jumps', () => {
    const r = simulateTake({ fps: 60, seed: 1, blocks: swingFirst(1), make: readiness });
    expect(r.ok).toBe(true);
    expect(r.shown).toEqual(['Your hands left your hips. Keep them there and jump again.']);
    expect(r.said).toEqual(['Jump!', 'Your hands left your hips. Keep them there and jump again.', 'One.', 'Two.', 'Three.']);
    expect((r.result as { jumps: { jumps: number } }).jumps.jumps).toBe(3);
  });

  it('two refused jumps no longer throw the check away (before: "Do the check again", 0 of 8 on the bench)', () => {
    const r = simulateTake({ fps: 30, seed: 2, blocks: swingFirst(2), make: readiness });
    expect(r.ok).toBe(true);
    expect(r.jumpsDone).toBe(5);
  });

  it('a noisier camera (2x) still reads the stand — the Quick Screen\'s accepted sway fallback (before: never)', () => {
    const r = simulateTake({ fps: 60, seed: 1, blocks: [{ trials: hips() }], film: { noise: 2 }, make: readiness });
    expect(r.ok).toBe(true);
    expect(r.standMs).toBeGreaterThan(2000);   // the first stand was refused for sway; the second read at the fallback
  });

  it('a clean take reads exactly as before: three jumps, the best on the truth', () => {
    const r = simulateTake({ fps: 60, seed: 1, blocks: [{ trials: hips() }], film: { noise: 0, dropRate: 0, missRate: 0 }, make: readiness });
    expect(r.ok).toBe(true);
    expect(r.said).toEqual(['Jump!', 'One.', 'Two.', 'Three.']);
    expect(Math.abs(r.bestCm! - r.truthBestCm!)).toBeLessThan(0.5);
    expect(r.numberMs! / 1000).toBeLessThan(14);
  });
});

describe('the combine jump station, live', () => {
  it('a refused jump is still a no-mark attempt (the coach\'s call), now with its reason said', () => {
    const r = simulateTake({ fps: 60, seed: 1, blocks: swingFirst(1), make: combine });
    expect(r.ok).toBe(true);
    const attempts = (r.result as { attempts: { value: number | null }[] }).attempts;
    expect(attempts).toHaveLength(3);
    expect(attempts[0].value).toBeNull();
    expect(attempts.slice(1).every((a) => a.value !== null)).toBe(true);
    expect(r.said[1]).toBe('No mark. Your hands left your hips. Keep them there and jump again.');
  });
});

describe('the words', () => {
  it('every refusal has a fix, including the grader reasons the vertical lane had no line for', () => {
    expect(refusalLine('your hands left your hips')).toMatch(/jump again\.$/);
    expect(refusalLine('your feet did not rise as far as that air time needs')).toMatch(/jump again\.$/);
    expect(refusalLine('the dip was too shallow')).toBe('Not counted: the dip was too shallow. Stand still, then jump again.');
  });

  it('the stand never says "arms by your sides" while the take asks for hands on hips', () => {
    expect(standLine('Hold still for a moment, arms by your sides.')).toBe('Stand still, hands on hips.');
    expect(standLine('Stand still facing the camera, whole body in the shot, for three seconds.')).not.toMatch(/three seconds/);
    expect(standLine('Step back so your whole body, head to feet, is in the shot.')).toBe('Step back so your whole body, head to feet, is in the shot.');
  });
});
