import { describe, expect, it } from 'vitest';
import { LungeAudit, type LungeFrameInput, type LungePoint } from './lungeAudit';

/** A lunge frame. `d` 0 = standing, 1 = bottom. Options push one leak at a time. */
function frame(t: number, d: number, o: { kneeIn?: number; hipDrop?: number; torso?: number; jitter?: number; front?: 'left' | 'right' } = {}): LungeFrameInput {
  const front = o.front ?? 'left';
  const hipY = 0.50 + 0.16 * d;
  const L: LungePoint[] = [];
  const put = (i: number, x: number, y: number) => { L[i] = { x, y, visibility: 1 }; };
  const torso = (o.torso ?? 0) * d;
  put(11, 0.42 + torso, 0.28); put(12, 0.58 + torso, 0.28);              // shoulders (width 0.16)
  const drop = (o.hipDrop ?? 0) * d;
  put(23, 0.44, hipY + (front === 'left' ? 0 : drop));                   // hips (width 0.12)
  put(24, 0.56, hipY + (front === 'left' ? drop : 0));
  const jitter = (o.jitter ?? 0) * (t % 66 === 0 ? 1 : -1);
  // the front ankle is lower in frame (nearer the camera); the front knee drifts inward with kneeIn
  const inward = (o.kneeIn ?? 0) * 0.12 * d;
  if (front === 'left') {
    put(25, 0.44 + inward + jitter, 0.72); put(27, 0.44, 0.94);
    put(26, 0.56, 0.74); put(28, 0.56, 0.88);
  } else {
    put(26, 0.56 - inward + jitter, 0.72); put(28, 0.56, 0.94);
    put(25, 0.44, 0.74); put(27, 0.44, 0.88);
  }
  return { landmarks: L, timestampMs: t, present: true };
}

/** 22 still frames so the audit calibrates, then a descent to the bottom. */
function rep(o: Parameters<typeof frame>[2] = {}): LungeFrameInput[] {
  const out: LungeFrameInput[] = []; let t = 0;
  for (let i = 0; i < 22; i++, t += 33) out.push(frame(t, 0, o));
  for (const d of [0.3, 0.7, 1, 1]) { out.push(frame(t, d, o)); t += 66; }
  return out;
}
const last = (frames: LungeFrameInput[]) => {
  const a = new LungeAudit(); let r = a.evaluate(frames[0]);
  for (const f of frames) r = a.evaluate(f);
  return r;
};

describe('the lunge audit', () => {
  it('calibrates first, then reads the rep', () => {
    const a = new LungeAudit();
    const frames = rep();
    expect(a.evaluate(frames[0]).note).toMatch(/calibrat/i);
    let r = a.evaluate(frames[0]);
    for (const f of frames) r = a.evaluate(f);
    expect(r.present).toBe(true);
    expect(r.depth01).toBeGreaterThan(0.5);
  });

  it('knows WHICH leg is in front — the whole reason to lunge instead of squat', () => {
    expect(last(rep({ front: 'left' })).front).toBe('left');
    expect(last(rep({ front: 'right' })).front).toBe('right');
  });

  it('catches the front knee falling inward, on either leg', () => {
    expect(last(rep()).faults).not.toContain('kneeIn');
    expect(last(rep({ kneeIn: 1 })).faults).toContain('kneeIn');
    expect(last(rep({ front: 'right', kneeIn: 1 })).faults).toContain('kneeIn');
    expect(last(rep({ kneeIn: 1 })).kneeIn).toBeGreaterThan(last(rep()).kneeIn);
  });

  it('catches the pelvis tipping and the torso folding over the knee', () => {
    expect(last(rep({ hipDrop: 0.06 })).faults).toContain('hipDrop');
    expect(last(rep({ torso: 0.12 })).faults).toContain('torsoDrift');
  });

  it('calls a shallow rep shallow', () => {
    const shallow: LungeFrameInput[] = [];
    let t = 0;
    for (let i = 0; i < 22; i++, t += 33) shallow.push(frame(t, 0));
    // a real quarter-rep: deep enough that the audit calls it a rep, nowhere near deep enough to count
    for (const d of [0.2, 0.4, 0.4, 0.4]) { shallow.push(frame(t, d)); t += 66; }
    expect(last(shallow).faults).toContain('shallow');
  });

  it('refuses a frame it cannot see rather than guessing', () => {
    const a = new LungeAudit();
    expect(a.evaluate({ landmarks: [], timestampMs: 0, present: true }).present).toBe(false);
    expect(a.evaluate({ landmarks: [], timestampMs: 0, present: false }).note).toMatch(/not visible/i);
  });
});
