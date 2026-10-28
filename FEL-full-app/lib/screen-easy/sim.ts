// sim — the FULL Quick Screen's live flow, played by a synthetic athlete who reacts to the runner (SCREEN-EASY,
// 2026-10-28). The jump-only twin is lib/vertical/sim.ts; this one walks every part the runner asks for.
//
//   framing → the stand → each part: hear the move → get into place (turn, step to the wall, switch legs) → wait for
//   "Go" → do the reps (again if one did not count) → the done card → "Any pain in that one?" answered after `tapMs`
//   → … → the result.
//
// The athlete's movements are lib/assess/replay.ts's synthetic captures (the same ones runner.test.ts drives), filmed
// through the app's virtual camera, clean or with the synth's seeded jitter; `dropRate` replaces frames with missed pose
// frames (present: false), seeded, the way a phone's pose model drops ~1 % of them.
//
// What a person does between parts is an ASSUMPTION, the same before and after (docs/SCREEN-EASY-AUDIT.md §2): they
// start to move once the first sentence of the line they hear is said (lib/cue-style/speech.ts, 2.5 words a second),
// then take MOVE_S to get there. The runner's clock is the frame clock (now = frame.t), so a run is deterministic.
//
// Pure. No DOM, no camera. Used by scripts/screen-easy-bench.ts and tests/screen-easy.
import type { PoseFrame } from '@/lib/pose/landmarks';
import { mulberry32 } from '@/lib/pose/synth';
import { AssessRunner, QUICK_PARTS, type PartDef, type PartId, type RunnerOptions, type RunnerView } from '@/lib/assess/runner';
import { cmj, kneeWall, ohsFront, ohsSide, singleLegSquat, standFront, standSide, type Capture, type CmjJump, type KneeWallOpts, type OhsOpts, type SlsOpts } from '@/lib/assess/replay';
import type { Side } from '@/lib/assess/protocol';
import { speechMs } from '@/lib/cue-style/speech';

/** Where the athlete stands: facing the lens, or side-on with that side toward it; `wall` = beside a wall (T2). */
export interface Place { facing: 'front' | Side; wall: boolean }

/**
 * Seconds a person takes to get from one place to the next once they know where (assumption, flagged in the audit):
 * a quarter turn 2 s, a half turn 2.5 s, to a wall 5 s (find it, step a foot forward), away from it 4 s, a leg switch 1 s.
 */
export const MOVE_S = { quarterTurn: 2, halfTurn: 2.5, toWall: 5, fromWall: 4, legSwitch: 1 } as const;

export function moveSeconds(from: Place, to: Place, legSwitch = false): number {
  let s = 0;
  if (from.facing !== to.facing) s += from.facing === 'front' || to.facing === 'front' ? MOVE_S.quarterTurn : MOVE_S.halfTurn;
  if (!from.wall && to.wall) s += MOVE_S.toWall;
  if (from.wall && !to.wall) s += MOVE_S.fromWall;
  if (legSwitch && s === 0) s += MOVE_S.legSwitch;
  return s;
}

export const placeOf = (d: PartDef): Place => ({ facing: d.view === 'front' ? 'front' : (d.near ?? 'left'), wall: d.test === 'T2' });

/** What the athlete does at each part (clean by default). A per-rep fault makes that rep not count. */
export interface Moves {
  t1Front?: { kneeInL?: number; kneeInR?: number };
  t1Side?: OhsOpts;
  t2?: Partial<Record<Side, KneeWallOpts & { perRep?: (i: number) => KneeWallOpts }>>;
  t3?: Partial<Record<Side, SlsOpts & { perRep?: (i: number) => SlsOpts }>>;
  t5?: CmjJump[];
}

export interface FullSimOptions {
  fps?: number;
  seed?: number;
  /** The synth's seeded jitter (the realistic camera). */
  noise?: boolean;
  /** Share of frames the pose model misses (present: false), seeded. */
  dropRate?: number;
  moves?: Moves;
  /** The athlete taps "No" on a pain prompt this long after it shows (ms). */
  tapMs?: number;
  limitMs?: number;
  parts?: readonly PartDef[];
  runner?: Partial<RunnerOptions>;
  /** Does the athlete have a wall? false: they skip the wall check when the runner offers it (`skip`). */
  wall?: boolean;
  onView?: (v: RunnerView, f: PoseFrame) => void;
}

export interface PartLog { part: PartId; startMs: number; activeMs: number | null; endMs: number | null; attempts: number; refused: string[]; restarts: number }

export interface FullSimResult {
  done: boolean;
  /** Flow ms from the first camera frame to the result. */
  numberMs: number | null;
  parts: PartLog[];
  /** Taps the athlete made inside the camera flow (pain prompts, a skip). */
  taps: number;
  said: { at: number; text: string }[];
  /** Lines the next line cut off before they were said (speakNatural cancels the line before). */
  cut: { at: number; text: string; heardMs: number; needMs: number }[];
  /** The graded result. */
  result: RunnerView['result'];
  /** Ms the flow spent on each runner step. */
  steps: Partial<Record<RunnerView['step'], number>>;
}

const BLANK = (t: number): PoseFrame => ({ t, present: false, image: [] });

function moveClip(d: PartDef, m: Moves, o: { noise?: boolean; seed: number; fps: number }): Capture {
  const film = { noise: o.noise, seed: o.seed, fps: o.fps };
  switch (d.id) {
    case 'T1-front': return ohsFront(m.t1Front ?? {}, film);
    case 'T1-side': return ohsSide(m.t1Side ?? {}, film);
    case 'T2-left': case 'T2-right': {
      const s = d.side!, x = m.t2?.[s] ?? {};
      const { perRep, ...opts } = x;
      return kneeWall(s, opts, { ...film, ...(perRep ? { perRep } : {}) });
    }
    case 'T3-left': case 'T3-right': {
      const s = d.side!, x = m.t3?.[s] ?? {};
      const { perRep, ...opts } = x;
      return singleLegSquat(s, opts, { ...film, ...(perRep ? { perRep } : {}) });
    }
    case 'T5': return cmj(m.t5 ?? [{ heightM: 0.4 }, { heightM: 0.45 }, { heightM: 0.42 }], film);
  }
}

/** A retry is the clean move (the athlete heard the reason and fixed it). */
const CLEAN: Moves = {};

export function simulateFullScreen(o: FullSimOptions = {}): FullSimResult {
  const fps = o.fps ?? 30, seed = o.seed ?? 1, tapMs = o.tapMs ?? 1500, limit = o.limitMs ?? 900_000;
  const dt = 1000 / fps;
  const rnd = mulberry32(seed * 7919 + 13);
  const film = { noise: o.noise, seed: seed + 50, fps };
  const stands: Record<'front' | Side, PoseFrame[]> = {
    front: standFront(4, film).frames, left: standSide('left', 4, { ...film, seed: seed + 51 }).frames, right: standSide('right', 4, { ...film, seed: seed + 52 }).frames,
  };
  const parts = o.parts ?? QUICK_PARTS;
  const runner = new AssessRunner({ aspect: 4 / 3, painAsked: true, handsFree: true, takeoffLeg: 'left', cameraFps: () => fps, parts, ...(o.runner ?? {}) });
  const said: (FullSimResult['said'][number] & { answered?: boolean })[] = [], cut: FullSimResult['cut'] = [];
  const logs: PartLog[] = [];
  const steps: FullSimResult['steps'] = {};
  let lastSay = 0, taps = 0;
  let v: RunnerView | null = null;
  let at: Place = { facing: 'front', wall: false };     // where the athlete is
  let goal: Place = at, goalAt = 0;                     // where they are going, and when they get there
  let curPart: PartId | null = null, lastLegPart: PartDef | null = null;
  let clip: PoseFrame[] | null = null, clipStart = 0, clipJ = 0, clipEndAt = -Infinity, clipRuns = 0;
  let promptAt: number | null = null;
  let standI = 0, t = 0, lastStep: RunnerView['step'] | null = null, lastT = 0;
  while (t < limit) {
    // the frame the camera sees now
    let f: PoseFrame;
    if (clip && clipJ < clip.length) { const s = clip[clipJ++]; f = { ...s, t }; if (clipJ >= clip.length) clipEndAt = t; }
    else {
      const p = t >= goalAt ? goal : at;
      if (t >= goalAt) at = goal;
      const s = stands[p.facing][standI++ % stands[p.facing].length];
      f = { ...s, t };
    }
    if (o.dropRate && rnd() < o.dropRate) f = BLANK(t);
    v = runner.tick(f, t);
    o.onView?.(v, f);
    if (lastStep !== null) steps[lastStep] = (steps[lastStep] ?? 0) + (t - lastT);
    lastStep = v.step; lastT = t;
    if (v.say && v.say.id !== lastSay) {
      // the line before is cut if it was still being said (speakNatural cancels it)
      const prev = said[said.length - 1];
      if (prev && !prev.answered && t - prev.at < speechMs(prev.text) - 400) cut.push({ at: prev.at, text: prev.text, heardMs: t - prev.at, needMs: speechMs(prev.text) - 400 });
      lastSay = v.say.id; said.push({ at: t, text: v.say.text });
    }
    // a new part: hear where to go, then go there
    if (v.part && v.part !== curPart) {
      const d = parts.find((p) => p.id === v!.part)!;
      curPart = v.part;
      logs.push({ part: d.id, startMs: t, activeMs: null, endMs: null, attempts: 0, refused: [], restarts: 0 });
      const line = v.say?.text ?? d.setup;
      const first = line.split(/(?<=[.!?])\s/)[0] ?? line;
      const to = placeOf(d);
      const legSwitch = !!lastLegPart && lastLegPart.test === d.test && lastLegPart.side !== d.side;
      const moveS = (o.wall === false && to.wall) ? 0 : moveSeconds(goal, to, legSwitch);
      goal = to; goalAt = t + speechMs(first) - 400 + moveS * 1000;
      lastLegPart = d.side ? d : null;
      clip = null; clipRuns = 0;
    }
    const log = logs[logs.length - 1];
    if (log && v.step === 'active' && log.activeMs === null) log.activeMs = t;
    // "Go": do the move; a part still running a moment after the clip ended gets it again (the athlete heard why)
    if (v.step === 'active' && v.part) {
      const d = parts.find((p) => p.id === v!.part)!;
      if (!clip || (clipJ >= clip.length && t - clipEndAt > 1500)) {
        // the first go waits for "Go" to land and for the athlete to be in place (a countdown that ran while they were
        // still on the way is the runner's problem: the reps start when they get there)
        const reacted = !clip ? t - (log?.activeMs ?? t) >= 400 && t >= goalAt + 400 : true;
        if (reacted) {
          clip = moveClip(d, clipRuns === 0 ? (o.moves ?? CLEAN) : CLEAN, { ...film, seed: seed + 100 + clipRuns * 17 }).frames;
          clipJ = 0; clipRuns++;
          if (log) log.attempts = clipRuns;
        }
      }
    } else if (v.step !== 'paused' && clip && clipJ >= clip.length) clip = null;
    if (v.step === 'position' && clip) { clip = null; if (log) log.restarts++; }   // the part restarted
    if (v.step !== 'active' && v.step !== 'paused' && log && log.activeMs !== null && log.endMs === null && (v.step === 'partDone' || v.step === 'miniResult' || v.step === 'painCheck' || v.step === 'done')) log.endMs = t;
    // the prompts
    if (v.step === 'painCheck' || v.step === 'pain') {
      promptAt ??= t;
      if (t - promptAt >= tapMs) {
        runner.answerPain(false, t); taps++; promptAt = null;
        // the athlete answered the question: the line after it is theirs to start, not a cut
        const q = said[said.length - 1]; if (q) q.answered = true;
      }
    } else promptAt = null;
    if (v.step === 'done' || v.step === 'stopped') break;
    t += dt;
  }
  // refusals: the runner's own log of reps that did not count (lib/assess/runner.ts rejectionLog), per part
  for (const r of runner.rejectionLog) {
    const lg = [...logs].reverse().find((l) => l.part === r.part);
    if (lg) lg.refused.push(r.text);
  }
  return { done: v?.step === 'done', numberMs: v?.step === 'done' ? t : null, parts: logs, taps, said, cut, result: v?.result ?? null, steps };
}
