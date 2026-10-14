// One tone per pulse (Mirror audio fix): a counted rep plays exactly one tone, and each countdown beat beeps once.
// Before, the HUD played a rep's tone from BOTH the flash and the new mark (two at once), and keyed the flash tone on
// the kind, so the 2nd and 3rd countdown beats (same kind) were silent. Now every pulse has its own id.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { AssessRunner, type RunnerView } from '@/lib/assess/runner';
import { cmj, kneeWall, ohsFront, ohsSide, singleLegSquat, standFront, standSide, type Capture } from '@/lib/assess/replay';
import { cuesDue, type FlashKind } from './realtime-cues';

const STAND = { front: standFront(0.5), left: standSide('left', 0.5), right: standSide('right', 0.5) };

function driveHandsFree(maxLoops = 4000, override: Partial<Record<string, Capture>> = {}) {
  // SCREEN A: as the page does — the take-off foot is tapped before the camera (here: "Not sure", a tap that answers null)
  const r = new AssessRunner({ aspect: 4 / 3, painAsked: true, handsFree: true, takeoffLeg: null, cameraFps: () => 30 });
  let t = 0;
  let v: RunnerView = r.tick({ t, present: false, image: [] }, t);
  const views: RunnerView[] = [];
  const fed = new Set<string>();
  const feed = (c: Capture | PoseFrame[], opts: { part?: string } = {}) => {
    const frames = Array.isArray(c) ? c : c.frames;
    const first = frames[0]?.t ?? 0;
    const start = t + 33;
    for (let k = 0; k < frames.length; k++) {
      t = start + (frames[k].t - first);
      v = r.tick({ ...frames[k], t }, t);
      views.push(v);
      if (opts.part && v.part !== opts.part) break;
    }
  };
  const standFor = (vw: RunnerView) => (vw.view === 'side' ? (vw.part === 'T2-right' ? STAND.right : STAND.left) : STAND.front);
  for (let loop = 0; loop < maxLoops && v.step !== 'done' && v.step !== 'stopped'; loop++) {
    // SCREEN A: the after-test pain check is a tap now, never auto-answered; the hands-free athlete taps "no"
    if (v.step === 'painCheck') { r.answerPain(false, t); t += 33; v = r.tick({ ...standFor(v).frames[0], t }, t); views.push(v); continue; }
    if (v.step === 'active') {
      const part = v.part!;
      if (!fed.has(part)) {
        fed.add(part);
        const cap = override[part] ?? (part === 'T1-front' ? ohsFront({}) : part === 'T1-side' ? ohsSide({})
          : part === 'T2-left' ? kneeWall('left') : part === 'T2-right' ? kneeWall('right')
          : part === 'T3-left' ? singleLegSquat('left') : part === 'T3-right' ? singleLegSquat('right')
          : cmj([{ heightM: 0.4 }, { heightM: 0.45 }, { heightM: 0.42 }]));
        feed(cap, { part });
      } else feed(standFor(v));
    } else feed(standFor(v));
  }
  return { v, views };
}


/** As the HUD does: one tone per new pulse id. */
function tonesOf(views: readonly RunnerView[]): FlashKind[] {
  let last = 0;
  const out: FlashKind[] = [];
  for (const v of views) {
    for (const c of cuesDue(last, v.flashCues)) { last = c.id; out.push(c.kind); }
  }
  return out;
}

describe('one tone per pulse', () => {
  it('cuesDue: each new id is due once, oldest first; a sounded id never again; nothing before the first pulse', () => {
    const a = { id: 1, kind: 'countdown' as const };
    const b = { id: 2, kind: 'countdown' as const };
    const c = { id: 3, kind: 'captured' as const };
    expect(cuesDue(0, undefined)).toEqual([]);
    expect(cuesDue(0, [a])).toEqual([a]);
    expect(cuesDue(1, [a])).toEqual([]);
    expect(cuesDue(1, [a, b, c])).toEqual([b, c]);   // two pulses in one frame: both sound
  });

  // every pulse the runner makes, in order (spied on the prototype: `pulse` is private)
  const pulses: FlashKind[] = [];
  const proto = AssessRunner.prototype as unknown as { pulse: (k: FlashKind) => void };
  const real = proto.pulse;
  proto.pulse = function (this: unknown, k: FlashKind) { pulses.push(k); return real.call(this, k); };
  // …and each part's final count of valid reps, as the runner finishes it (`finishPart` is private too)
  const finals: { part: string; valid: number }[] = [];
  const fp = AssessRunner.prototype as unknown as { finishPart: (now: number) => void };
  const realFinish = fp.finishPart;
  fp.finishPart = function (this: { part: { def: { id: string }; valid: number } }, now: number) {
    finals.push({ part: this.part.def.id, valid: this.part.valid });
    return realFinish.call(this, now);
  };
  const { v, views } = driveHandsFree();
  proto.pulse = real;
  fp.finishPart = realFinish;
  const tones = tonesOf(views);

  it('a counted rep plays exactly one tone: the captured tones equal the final counted reps, not the pulses', () => {
    expect(v.step).toBe('done');
    // the reps that counted: each part's final valid count, read as the part finishes (its last rep ends the part on the
    // same tick, so no view ever shows the final count), and all seven parts finished
    expect(finals.map((f) => f.part)).toEqual(['T1-front', 'T1-side', 'T2-left', 'T2-right', 'T3-left', 'T3-right', 'T5']);
    const counted = finals.reduce((a, f) => a + f.valid, 0);
    expect(counted).toBeGreaterThan(0);
    // QA (2026-10-14): compared with the PULSES, a second pulse('captured') per rep played two tones and stayed green
    expect(tones.filter((k) => k === 'captured')).toHaveLength(counted);
  });

  it('each pulse id is due once: no id repeats in the pulse log', () => {
    for (const w of views) {
      const ids = (w.flashCues ?? []).map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('each countdown beat beeps once: a full 3-2-1 is exactly three beeps, one per number, one tone per pulse', () => {
    const runs: number[] = [];
    let n = 0;
    for (const k of tones) {
      if (k === 'countdown') n++;
      else if (n) { runs.push(n); n = 0; }
    }
    expect(runs.length).toBeGreaterThan(0);
    expect(Math.max(...runs)).toBe(3);
    expect(runs.every((r) => r >= 1 && r <= 3)).toBe(true);           // a countdown cut short by stepping out beeps less
    expect(tones.filter((k) => k === 'countdown')).toHaveLength(pulses.filter((k) => k === 'countdown').length);
  });

  it('the HUD plays sound only through cuesDue (no second, mark-driven tone)', () => {
    const src = readFileSync(join(__dirname, '../../app/play/mirror/assess/_components/live-hud.tsx'), 'utf8');
    expect(src).toContain('cuesDue(');
    expect(src).not.toMatch(/cueRep\(/);
    expect(src.match(/cueFlash\(/g)).toHaveLength(1);
  });

  // QA re-check (2026-10-14): a recording WITH a rejected rep. The first knee-to-wall rock lifts the heel (an invalid rep,
  // runner.ts markRep → 'notRead'), so that rep plays its single retry tone (unchanged) and must play NO captured tone:
  // the captured tones still equal the counted reps, so a captured tone on a rep that does not count turns this red.
  it('a rep that does not count plays no captured tone (a recording with a rejected rep)', () => {
    const ps: FlashKind[] = [];
    const fin: { part: string; valid: number; attempts: number }[] = [];
    const realP = proto.pulse;
    const realF = (AssessRunner.prototype as unknown as { finishPart: (now: number) => void }).finishPart;
    proto.pulse = function (this: unknown, k: FlashKind) { ps.push(k); return realP.call(this, k); };
    (AssessRunner.prototype as unknown as { finishPart: (now: number) => void }).finishPart = function (this: { part: { def: { id: string }; valid: number; attempts: number } }, now: number) {
      fin.push({ part: this.part.def.id, valid: this.part.valid, attempts: this.part.attempts });
      return realF.call(this, now);
    };
    let run: ReturnType<typeof driveHandsFree>;
    try {
      run = driveHandsFree(4000, { 'T2-left': kneeWall('left', {}, { reps: 4, perRep: (i) => (i === 0 ? { heelLiftM: 0.08 } : {}) }) });
    } finally {
      proto.pulse = realP;
      (AssessRunner.prototype as unknown as { finishPart: (now: number) => void }).finishPart = realF;
    }
    expect(run.v.step).toBe('done');
    const t2 = fin.find((f) => f.part === 'T2-left')!;
    expect(t2.attempts).toBeGreaterThan(t2.valid);                    // the recording really holds a rep that did not count
    expect(ps.filter((k) => k === 'retry').length).toBeGreaterThan(0); // …and it played the retry tone (left as is)
    const counted = fin.reduce((a, f) => a + f.valid, 0);
    expect(tonesOf(run.views).filter((k) => k === 'captured')).toHaveLength(counted);
  });
});
