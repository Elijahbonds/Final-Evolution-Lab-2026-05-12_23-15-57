// sim — the jump-only live flow, played by a synthetic athlete who reacts to the runner (VERTICAL-EASY, 2026-10-27).
//
// The bench (lib/jump/bench.ts) grades a whole take offline. The person on the phone meets something else: the LIVE
// runner (lib/assess/runner.ts with JUMP_PARTS), which waits for the shot, calibrates on a 3 s stand, counts down,
// then reads each flight as it lands, from only the frames it kept. This plays that runner end to end:
//
//   stand in the shot → (the runner frames, calibrates, counts down) → on "Go" the athlete jumps the take's trials →
//   the runner's own count and rejections → "Any pain in that one?" answered after `tapMs` → the number.
//
// Every frame is the bench's own physics filmed through lib/pose/synth.ts (lib/jump/ballistic.ts), so the truth of
// each jump is known. The runner's clock is the frame clock (now = frame.t), so a run is deterministic.
//
// Pure. No DOM, no camera. Used by scripts/vertical-easy-bench.ts and tests/vertical-easy.
import type { PoseFrame } from '@/lib/pose/landmarks';
import { AssessRunner, JUMP_PARTS, type RunnerView } from '@/lib/assess/runner';
import { buildTake, filmTake, type Beat, type FilmOptions, type TakeStyle, type TrialSpec } from '@/lib/jump/ballistic';

export interface LiveSimOptions {
  fps: number;
  seed?: number;
  /** The athlete's jumps, in order. More than three lets the runner ask again after a refused one. */
  trials: TrialSpec[];
  /** Rest between the jumps, after the take's own 1 s stand (s). */
  restS?: number;
  /** How long after "Go" the first dip starts (s). */
  reactS?: number;
  film?: Omit<FilmOptions, 'fps' | 'seed'>;
  style?: TakeStyle;
  /** The athlete taps "No" on "Any pain in that one?" this long after it shows (ms). */
  tapMs?: number;
  /** Give up after this much flow time (ms). */
  limitMs?: number;
  /** The runner's take-off foot answer: undefined = not asked (the runner parks on its own prompt). */
  takeoffLeg?: 'left' | 'right' | null;
  /**
   * A RECORDED take instead of the bench's physics: `stand` loops until "Go", then `jump` plays once (its own clock,
   * shifted to start on "Go"); `truthCm` is the recording's ground truth per jump (lib/pose/__fixtures__ gt).
   */
  clip?: { stand: readonly PoseFrame[]; jump: readonly PoseFrame[]; truthCm: number[] };
  /** The take's beats instead of `trials` (rests and decoys between them: lib/jump/ballistic.ts Beat). */
  beats?: Beat[];
  /** Read arms free, as "Measure my vertical" does (lib/vertical/armsFree.ts). Default: the hands-on-hips check. */
  armsFree?: boolean;
  /** Every view the runner returns, with its frame (the rig's screenshots pick theirs from here). */
  onView?: (v: RunnerView, f: PoseFrame) => void;
}

export interface LiveSimResult {
  /** The runner reached 'done' with a number. */
  done: boolean;
  /** Flow ms from the first camera frame to each step's first view. */
  at: Partial<Record<RunnerView['step'], number>>;
  /** Flow ms from the first camera frame to the result (the number on screen). */
  numberMs: number | null;
  /** Jumps the athlete did before the runner had three (truth). */
  jumpsDone: number;
  /** Jumps the runner counted. */
  counted: number;
  /** The best height the result shows (cm), and the best truth among the counted jumps (force-plate v0²/2g). */
  bestCm: number | null;
  truthBestCm: number | null;
  /** Each refused jump's spoken line. */
  rejections: string[];
  /** Every line the runner said, in order, with its flow time. */
  said: { at: number; text: string }[];
  /** Graded jumps (valid or not) with their invalid reason. */
  graded: { valid: boolean; heightCm: number; why: string | null }[];
}

/** Stand frames long enough for any setup (the take's own opening still). */
function standFrames(fps: number, seed: number, film: LiveSimOptions['film'], style?: TakeStyle): PoseFrame[] {
  return filmTake(buildTake([], { leadS: 40, ...(style ? { style } : {}) }), { fps, seed, ...film }).frames;
}

/** A stand clip played on a steady clock (a recording's own frame times are kept only in order). */
function retime(frames: readonly PoseFrame[], fps: number): PoseFrame[] {
  return frames.map((f, k) => ({ ...f, t: k * (1000 / fps) }));
}

export function simulateLiveJump(o: LiveSimOptions): LiveSimResult {
  const seed = o.seed ?? 1;
  const tapMs = o.tapMs ?? 1500;
  const limit = o.limitMs ?? 150_000;
  const stand = o.clip ? retime(o.clip.stand, o.fps) : standFrames(o.fps, seed, o.film, o.style);
  const runner = new AssessRunner({
    aspect: 4 / 3, painAsked: true, handsFree: true, parts: JUMP_PARTS, cameraFps: () => o.fps, ...(o.armsFree ? { armsFree: true } : {}),
    ...(o.takeoffLeg !== undefined ? { takeoffLeg: o.takeoffLeg } : { takeoffLeg: null }),
  });
  const at: LiveSimResult['at'] = {};
  const said: LiveSimResult['said'] = [];
  let lastSay = 0;
  let v: RunnerView | null = null;
  let jumpFrames: PoseFrame[] | null = null;
  let jumpStart = 0, jumpTruth: number[] = [];
  let painShownAt: number | null = null;
  let i = 0, j = 0;
  let t = 0;
  const dt = 1000 / o.fps;
  while (t < limit) {
    let f: PoseFrame;
    if (jumpFrames && j < jumpFrames.length) { const s = jumpFrames[j++]; f = { ...s, t: s.t + jumpStart }; }
    else { const s = stand[i++ % stand.length]; f = { ...s, t }; }
    t = f.t;
    v = runner.tick(f, f.t);
    o.onView?.(v, f);
    at[v.step] ??= f.t;
    if (v.say && v.say.id !== lastSay) { lastSay = v.say.id; said.push({ at: f.t, text: v.say.text }); }
    if (v.step === 'active' && !jumpFrames) {
      // "Go.": the athlete jumps the take (its own opening stand is the reaction time)
      if (o.clip) {
        const t0 = o.clip.jump[0]?.t ?? 0;
        jumpFrames = o.clip.jump.map((x) => ({ ...x, t: x.t - t0 })); jumpStart = f.t + dt; j = 0;
        jumpTruth = o.clip.truthCm;
      } else {
        const beats: Beat[] = o.beats ? [...o.beats] : [];
        if (!o.beats) o.trials.forEach((tr, k) => { if (k) beats.push({ rest: o.restS ?? 1.0 }); beats.push({ trial: tr }); });
        const take = buildTake(beats, { leadS: o.reactS ?? 0.8, ...(o.style ? { style: o.style } : {}) });
        const filmed = filmTake(take, { fps: o.fps, seed: seed + 100, ...o.film });
        jumpFrames = filmed.frames; jumpStart = f.t + dt; j = 0;
        jumpTruth = filmed.truth.map((x) => x.heightV0Cm);
      }
    }
    if (v.step === 'painCheck') {
      painShownAt ??= f.t;
      if (f.t - painShownAt >= tapMs) runner.answerPain(false, f.t);
    }
    if (v.step === 'done' || v.step === 'stopped') break;
    // after the last jump frame the athlete stands still (the stand loop above takes over)
    t += dt;
  }
  const t5 = v?.result?.tests.find((x) => x.id === 'T5')?.t5 ?? null;
  const graded = (t5?.jumps ?? []).map((x) => ({ valid: x.valid, heightCm: x.heightCm, why: x.invalidWhy ?? null }));
  const counted = graded.filter((x) => x.valid).length;
  const tookOff = (t5?.jumps ?? []).length;
  return {
    done: v?.step === 'done' && t5?.bestHeightCm != null,
    at, numberMs: v?.step === 'done' ? t : null,
    jumpsDone: Math.min(o.trials.length, Math.max(tookOff, counted)),
    counted, bestCm: t5?.bestHeightCm ?? null,
    truthBestCm: jumpTruth.length ? Math.max(...jumpTruth.slice(0, Math.max(1, tookOff))) : null,
    rejections: said.filter((s) => /did not count|never saw|lost your feet|hands|feet left|landing|Step back|missed/i.test(s.text) && !/^(One|Two|Three)\./.test(s.text)).map((s) => s.text),
    said, graded,
  };
}
