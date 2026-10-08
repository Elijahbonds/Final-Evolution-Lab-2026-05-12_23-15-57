// Squad gate 2 (SCREEN-SHIP): a steady skeleton (One Euro), low-confidence joints hidden, tracking loss, the rep dots;
// and the runner's beats: framing → 3 → 2 → 1 → running → done, loss → the cause's own fix line (SCREEN A) → resume.
import { describe, expect, it } from 'vitest';
import type { Lm, PoseFrame } from '@/lib/pose/landmarks';
import { PoseFilter } from '@/lib/pose/oneEuro';
import { AssessRunner, type RunnerView } from '@/lib/assess/runner';
import { ohsFront, ohsSide, standFront, standSide } from '@/lib/assess/replay';
import {
  KEY_JOINTS, LOSS_FRAMES, MIN_CONFIDENT_JOINTS, MOVEMENT_PLAY_EURO, PART_RESTART_MAX, SKELETON_EURO, SKELETON_MIN_VISIBILITY,
  SYSTEM_FONT_STACK, confidentJoints, jointVisible, repDots, trackingLost,
} from './ui';
import { FRAMING_FIX_LINES } from './copy';

const frame = (x: number, t: number, v = 0.99): PoseFrame => ({ t, present: true, image: Array.from({ length: 33 }, () => ({ x, y: 0.5, z: 0, v })) });
const sd = (a: number[]) => { const m = a.reduce((p, q) => p + q, 0) / a.length; return Math.sqrt(a.reduce((p, q) => p + (q - m) ** 2, 0) / a.length); };

describe('the skeleton\'s One Euro filter', () => {
  it('states min cutoff 1 Hz, beta 16, d-cutoff 3 Hz: movement play\'s measured values', () => {
    expect(SKELETON_EURO).toEqual({ minCutoff: 1, beta: 16, dCutoff: 3 });
    expect(SKELETON_EURO).toEqual(MOVEMENT_PLAY_EURO);
  });

  it('a jittery joint comes out smoother', () => {
    const f = new PoseFilter(SKELETON_EURO);
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
    const raw: number[] = [], out: number[] = [];
    for (let i = 0; i < 180; i++) {
      const x = 0.5 + 0.01 * rnd();
      raw.push(x);
      out.push(f.filter(frame(x, i * 33)).image[0].x);
    }
    expect(sd(out.slice(30))).toBeLessThan(sd(raw.slice(30)) * 0.6);
  });

  it('a step settles: within 1% of the new position after half a second', () => {
    const f = new PoseFilter(SKELETON_EURO);
    for (let i = 0; i < 30; i++) f.filter(frame(0.3, i * 33));
    let last = 0;
    for (let i = 30; i < 60; i++) last = f.filter(frame(0.6, i * 33)).image[0].x;
    expect(Math.abs(last - 0.6)).toBeLessThan(0.003);
  });
});

describe('low-confidence joints are hidden, and tracking loss is read', () => {
  it('a joint under the floor is not drawn', () => {
    expect(SKELETON_MIN_VISIBILITY).toBe(0.5);
    expect(jointVisible({ x: 0.5, y: 0.5, z: 0, v: 0.49 })).toBe(false);
    expect(jointVisible({ x: 0.5, y: 0.5, z: 0, v: 0.5 })).toBe(true);
    expect(jointVisible(undefined)).toBe(false);
    expect(jointVisible({ x: NaN, y: 0.5, z: 0, v: 1 })).toBe(false);
  });

  it('the live draw passes the floor to drawSkeleton, which skips a joint under it', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const app = readFileSync(join(__dirname, '../../app/play/mirror/assess/_components/assess-app.tsx'), 'utf8');
    expect(app).toMatch(/drawSkeleton\(ctx, smoothRef\.current\.filter\(f\)\.image, \{ colour, minVisibility: SKELETON_MIN_VISIBILITY \}\)/);
    const sk = readFileSync(join(__dirname, '../../app/play/mirror/assess/_components/skeleton.ts'), 'utf8');
    expect(sk).toMatch(/const seen = \(i: number\) => !!img\[i\] && img\[i\]\.v >= minV;/);
    expect(sk).toMatch(/if \(!seen\(a\) \|\| !seen\(b\)\) continue;/);
    expect(sk).toMatch(/if \(!seen\(i\)\) continue;/);
  });

  it('tracking is lost with no body, or with too few confident key joints', () => {
    expect(KEY_JOINTS).toHaveLength(8);
    const good = frame(0.5, 0);
    expect(confidentJoints(good.image)).toBe(8);
    expect(trackingLost(good)).toBe(false);
    expect(trackingLost({ present: false, image: [] })).toBe(true);
    const dim = { ...good, image: good.image.map((l: Lm, i) => (KEY_JOINTS.slice(0, 3).includes(i) ? { ...l, v: 0.1 } : l)) };
    expect(confidentJoints(dim.image)).toBe(8 - 3);
    expect(8 - 3).toBeLessThan(MIN_CONFIDENT_JOINTS);
    expect(trackingLost(dim)).toBe(true);
  });
});

describe('the rep dots (A2-2)', () => {
  it('three dots, filled 0 → 1 → 2 → 3 on counted reps only; a rep that did not count fills none', () => {
    expect(repDots([], 3)).toEqual(['empty', 'empty', 'empty']);
    expect(repDots(['clean'], 3)).toEqual(['clean', 'empty', 'empty']);
    expect(repDots(['clean', 'notRead'], 3)).toEqual(['clean', 'empty', 'empty']);
    expect(repDots(['clean', 'notRead', 'fault'], 3)).toEqual(['clean', 'fault', 'empty']);
    expect(repDots(['clean', 'notRead', 'fault', 'notRead', 'clean'], 3)).toEqual(['clean', 'fault', 'clean']);
  });
});

describe('SCREEN A: the restart cap', () => {
  it('PART_RESTART_MAX is the one auto-retry plus one more, and grades nothing', () => {
    expect(PART_RESTART_MAX).toBe(2);
  });
});

describe('the system font (gate 1)', () => {
  it('is the system stack, never Courier or the display chain', () => {
    expect(SYSTEM_FONT_STACK).toBe("-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif");
    expect(SYSTEM_FONT_STACK).not.toMatch(/courier|fel-font-display|mono/i);
  });
});

// ── the runner's beats, driven frame by frame ──

function drive(o: { lossAt?: number; lossFrames?: number } = {}) {
  const r = new AssessRunner({ aspect: 4 / 3, painAsked: true, takeoffLeg: 'left', cameraFps: () => 30 });
  let t = 0;
  const steps: string[] = [], said: string[] = [], counts: number[] = [];
  let v: RunnerView = r.tick({ t, present: false, image: [] }, t);
  const push = (f: PoseFrame) => {
    t += 33;
    v = r.tick({ ...f, t }, t);
    const k = `${v.step}${v.step === 'countdown' ? v.countdown : ''}`;
    if (steps[steps.length - 1] !== k) steps.push(k);
    if (v.say) said.push(v.say.text);
    if (v.step === 'active' && counts[counts.length - 1] !== v.reps.count) counts.push(v.reps.count);
  };
  const stand = standFront(0.5).frames;
  const side = standSide('left', 0.5).frames;
  let fed = false;
  for (let loop = 0; loop < 400 && !(v.step === 'position' && v.part === 'T1-side'); loop++) {
    if (v.step === 'active' && !fed) {
      fed = true;
      const take = ohsFront().frames;
      for (let k = 0; k < take.length && v.part === 'T1-front'; k++) {
        if (o.lossAt !== undefined && k === o.lossAt) for (let g = 0; g < (o.lossFrames ?? 0); g++) push({ t: 0, present: false, image: [] });
        push(take[k]);
      }
    } else for (const f of v.view === 'side' ? side : stand) push(f);
  }
  return { r, v, steps, said, counts };
}

describe('the runner\'s beats (gate 2)', () => {
  it('framing → 3 → 2 → 1 → running → done: the pain asked before the camera is not asked again', () => {
    const run = drive();
    const i = run.steps.indexOf('position');
    expect(run.steps[0]).toBe('framing');
    expect(run.steps).toContain('calibrate');
    expect(run.steps).not.toContain('pain');
    expect(run.steps.slice(i, i + 6)).toEqual(['position', 'countdownnull', 'countdown3', 'countdown2', 'countdown1', 'active']);
    expect(run.steps).toContain('partDone');
    // the third counted rep ends the part on its own frame: the count is said with the done line
    expect(run.counts).toEqual([0, 1, 2]);
    expect(run.said).toContain('Three. Done.');
  });

  it('tracking lost: after a few frames the check pauses with the cause\'s own fix line, then resumes where it was', () => {
    const run = drive({ lossAt: 40, lossFrames: LOSS_FRAMES + 4 });
    const k = run.steps.indexOf('paused');
    expect(k).toBeGreaterThan(0);
    expect(run.steps[k - 1]).toBe('active');
    expect(run.steps[k + 1]).toBe('active');
    // CHANGED (SCREEN A req. 7): an empty shot says its own short line; TRACKING_LOSS_PROMPT is kept for tracking
    // loss with NO framing cause (runner-voice.test.ts drives that case)
    expect(run.said).toContain(FRAMING_FIX_LINES.noBody);
    expect(run.counts[run.counts.length - 1]).toBe(2);
    expect(run.said).toContain('Three. Done.');           // it resumed and finished the part
  });

  it('a blip shorter than the loss window does not pause', () => {
    const run = drive({ lossAt: 40, lossFrames: LOSS_FRAMES - 2 });
    expect(run.steps).not.toContain('paused');
  });

  it('the side part begins after the done beat', () => {
    const run = drive();
    expect(run.v.part).toBe('T1-side');
    expect(ohsSide().frames.length).toBeGreaterThan(0);
  });
});
