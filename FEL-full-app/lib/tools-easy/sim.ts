// sim — the daily readiness check's and the combine jump station's LIVE take, played by a synthetic athlete
// (TOOLS-EASY, 2026-10-28; owner: "All tools need to be accessible, easy to use").
//
// lib/vertical/sim.ts plays the Quick Screen's runner. The readiness check (lib/coach/readiness/capture.ts) and the combine
// jump station (lib/combine/jumpTake.ts) do not use that runner: each has its own small take — a still stand, then the
// jumps, counted as they land — so they never got the vertical lane's fixes. This plays either take end to end:
//
//   stand in the shot → (the take reads the stand) → the athlete reacts `reactMs` after the take says "jump" → the
//   trials, with rests → stand still until the take is done → finish() → the number, or the reason there is none.
//
// The capture is passed in (`make`), so the bench can run the lane's base code (built from git objects) and this lane's
// on the same frames. Every frame is JUMP-PRO's physics bench filmed through the app's virtual camera
// (lib/jump/ballistic.ts), so each jump's force-plate truth is known.
//
// Pure. No DOM, no camera. Used by scripts/tools-easy-bench.ts and tests/tools-easy.
import type { PoseFrame } from '@/lib/pose/landmarks';
import { buildTake, filmTake, type Beat, type FilmOptions, type TakeStyle, type TrialSpec, type TrialTruth } from '@/lib/jump/ballistic';

/** What any of the takes shows while it runs (the base's views carry no `said`/`refusal`; this lane's do). */
export interface TakeViewLike { step: 'stand' | 'jump' | 'done'; jumps: number; why: string | null; refusal?: string | null; say?: { id: number; text: string } | null }
export interface TakeLike {
  push(f: PoseFrame): TakeViewLike;
  finish(): { ok: true; [k: string]: unknown } | { ok: false; why: string; [k: string]: unknown };
}

/** One block of trials filmed in one style (a first-timer's arm swing, then hands on hips). */
export interface TrialBlock { trials: TrialSpec[]; style?: TakeStyle }

export interface TakeSimOptions {
  fps: number;
  seed?: number;
  /** The athlete's jumps, in blocks (one style each), in order. */
  blocks: TrialBlock[];
  /** Rest between jumps (s). */
  restS?: number;
  /**
   * assumption: how long after the take turns to 'jump' the athlete starts the first dip (ms). The base says it only
   * in the caption ("Jump 1 of 3"); this lane also says it aloud. The same value is used before and after.
   */
  reactMs?: number;
  film?: Omit<FilmOptions, 'fps' | 'seed'>;
  /** Give up after this much flow time (ms). */
  limitMs?: number;
  make: () => TakeLike;
}

export interface TakeSimResult {
  /** The take reached 'done' and finish() gave a number. */
  ok: boolean;
  /** Flow ms from the first camera frame to the take's 'jump' step and to its 'done' (the number on screen). */
  standMs: number | null;
  numberMs: number | null;
  /** finish()'s reason when there is no number. */
  why: string | null;
  /** The best the result shows (cm) and the best truth among the hands-on-hips trials the athlete did (force-plate v0²/2g). */
  bestCm: number | null;
  truthBestCm: number | null;
  /** Jumps the athlete did before the take was done. */
  jumpsDone: number;
  /** Every distinct line the take put on screen while jumping (its refusal reasons), in order. */
  shown: string[];
  /** Every distinct line the take said aloud, in order (this lane's takes only). */
  said: string[];
  /** The raw finish() result (the bench reads its own fields from it). */
  result: ReturnType<TakeLike['finish']> | null;
}

function stand(fps: number, seed: number, film: TakeSimOptions['film'], style?: TakeStyle): PoseFrame[] {
  return filmTake(buildTake([], { leadS: 40, ...(style ? { style } : {}) }), { fps, seed, ...film }).frames;
}

/** Film the blocks back to back on one clock: each block its own take (its own style), spliced in order. */
export function filmBlocks(o: Pick<TakeSimOptions, 'fps' | 'seed' | 'blocks' | 'restS' | 'film'>): { frames: PoseFrame[]; truth: (TrialTruth & { style: TakeStyle | undefined })[] } {
  const frames: PoseFrame[] = [];
  const truth: (TrialTruth & { style: TakeStyle | undefined })[] = [];
  let t0 = 0;
  const dt = 1000 / o.fps;
  o.blocks.forEach((b, k) => {
    const beats: Beat[] = [];
    b.trials.forEach((tr, i) => { if (i) beats.push({ rest: o.restS ?? 1.0 }); beats.push({ trial: tr }); });
    const take = buildTake(beats, { leadS: k ? (o.restS ?? 1.0) : 0.4, ...(b.style ? { style: b.style } : {}) });
    const filmed = filmTake(take, { fps: o.fps, seed: (o.seed ?? 1) * 31 + k + 100, ...o.film });
    for (const f of filmed.frames) frames.push({ ...f, t: f.t + t0 });
    for (const x of filmed.truth) truth.push({ ...x, takeoffT: x.takeoffT + t0, landT: x.landT + t0, style: b.style });
    t0 = (frames[frames.length - 1]?.t ?? t0) + dt;
  });
  return { frames, truth };
}

export function simulateTake(o: TakeSimOptions): TakeSimResult {
  const seed = o.seed ?? 1;
  const limit = o.limitMs ?? 90_000;
  const still = stand(o.fps, seed, o.film);
  const take = o.make();
  const dt = 1000 / o.fps;
  let jump: PoseFrame[] | null = null;
  let truth: (TrialTruth & { style: TakeStyle | undefined })[] = [];
  let jumpAt = 0, j = 0, i = 0, t = 0;
  let standMs: number | null = null, numberMs: number | null = null;
  let v: TakeViewLike | null = null;
  const shown: string[] = [], said: string[] = [];
  let lastSay = 0;
  while (t < limit) {
    let f: PoseFrame;
    if (jump && t >= jumpAt && j < jump.length) { const s = jump[j++]; f = { ...s, t: s.t + jumpAt }; }
    else { const s = still[i++ % still.length]; f = { ...s, t }; }
    t = f.t;
    v = take.push(f);
    if (v.say && v.say.id !== lastSay) { lastSay = v.say.id; said.push(v.say.text); }
    if (v.step === 'jump') {
      standMs ??= t;
      const line = v.refusal ?? null;
      if (line && shown[shown.length - 1] !== line) shown.push(line);
      if (!jump) {
        const filmed = filmBlocks(o);
        jump = filmed.frames; truth = filmed.truth; jumpAt = t + (o.reactMs ?? 1500);
      }
    }
    if (v.step === 'done') { numberMs = t; break; }
    t += dt;
  }
  const result = v?.step === 'done' ? take.finish() : null;
  const r = result as { ok: boolean; why?: string; jumps?: { bestCm: number }; attempts?: { value: number | null }[] } | null;
  const best = r?.ok ? (r.jumps?.bestCm ?? (r.attempts ? Math.max(...r.attempts.map((a) => a.value ?? -1)) : null)) : null;
  const doneAt = numberMs ?? t;
  const done = truth.filter((x) => x.takeoffT + jumpAt < doneAt);
  const onHips = done.filter((x) => !x.style?.armSwing);
  return {
    ok: !!r?.ok, standMs, numberMs, why: r && !r.ok ? r.why ?? null : null,
    bestCm: best != null && best >= 0 ? best : null,
    truthBestCm: onHips.length ? Math.round(Math.max(...onHips.map((x) => x.heightV0Cm)) * 10) / 10 : null,
    jumpsDone: done.length, shown, said, result,
  };
}
