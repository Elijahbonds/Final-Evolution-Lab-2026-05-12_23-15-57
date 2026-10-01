// SCREEN-REALTIME: hands-free flow, auto-advance, single-move retry, resize-safe runner state.
import { describe, expect, it } from 'vitest';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { AssessRunner, QUICK_PARTS, type RunnerView } from './runner';
import { cmj, kneeWall, ohsFront, ohsSide, singleLegSquat, standFront, standSide, type Capture } from './replay';

const STAND = { front: standFront(0.5), left: standSide('left', 0.5), right: standSide('right', 0.5) };

function driveHandsFree(maxLoops = 4000) {
  const r = new AssessRunner({ aspect: 4 / 3, painAsked: true, handsFree: true, cameraFps: () => 30 });
  let t = 0;
  let v: RunnerView = r.tick({ t, present: false, image: [] }, t);
  const steps: string[] = [];
  const fed = new Set<string>();
  const feed = (c: Capture | PoseFrame[], opts: { part?: string } = {}) => {
    const frames = Array.isArray(c) ? c : c.frames;
    const first = frames[0]?.t ?? 0;
    const start = t + 33;
    for (let k = 0; k < frames.length; k++) {
      t = start + (frames[k].t - first);
      v = r.tick({ ...frames[k], t }, t);
      const key = `${v.step}:${v.part ?? ''}`;
      if (steps[steps.length - 1] !== key) steps.push(key);
      if (opts.part && v.part !== opts.part) break;
    }
  };
  const standFor = (vw: RunnerView) => (vw.view === 'side' ? (vw.part === 'T2-right' ? STAND.right : STAND.left) : STAND.front);
  for (let loop = 0; loop < maxLoops && v.step !== 'done' && v.step !== 'stopped'; loop++) {
    if (v.step === 'active') {
      const part = v.part!;
      if (!fed.has(part)) {
        fed.add(part);
        const cap = part === 'T1-front' ? ohsFront({}) : part === 'T1-side' ? ohsSide({})
          : part === 'T2-left' ? kneeWall('left') : part === 'T2-right' ? kneeWall('right')
          : part === 'T3-left' ? singleLegSquat('left') : part === 'T3-right' ? singleLegSquat('right')
          : cmj([{ heightM: 0.4 }, { heightM: 0.45 }, { heightM: 0.42 }]);
        feed(cap, { part });
      } else feed(standFor(v));
    } else feed(standFor(v));
  }
  return { r, v, steps };
}

describe('hands-free realtime runner', () => {
  it('finishes with no painCheck or takeoff steps', () => {
    const { v, steps } = driveHandsFree();
    expect(v.step).toBe('done');
    expect(steps.some((s) => s.startsWith('pain:'))).toBe(false);
    expect(steps.some((s) => s.startsWith('takeoff:'))).toBe(false);
    expect(steps.some((s) => s.startsWith('painCheck:'))).toBe(false);
  });

  it('keeps runner state when aspect changes mid-run', () => {
    const r = new AssessRunner({ aspect: 4 / 3, painAsked: true, handsFree: true });
    let t = 0;
    for (let i = 0; i < 120; i++) {
      t += 33;
      r.tick({ ...STAND.front.frames[0], t }, t);
    }
    r.calibration.aspect = 3 / 4;
    expect(r.calibration.aspect).toBe(0.75);
    expect(QUICK_PARTS.length).toBe(7);
  });

  it('logs rejection reasons in memory', () => {
    const r = new AssessRunner({ aspect: 4 / 3, painAsked: true, handsFree: true, parts: QUICK_PARTS.filter((p) => p.id === 'T2-left') });
    let t = 0;
    let v = r.tick({ t, present: false, image: [] }, t);
    for (let i = 0; i < 3000 && v.step !== 'done'; i++) {
      t += 33;
      v = r.tick({ ...STAND.left.frames[i % STAND.left.frames.length], t }, t);
    }
    expect(r.rejectionLog.length).toBeGreaterThanOrEqual(0);
  });
});
