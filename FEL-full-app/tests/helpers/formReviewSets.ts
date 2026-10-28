// tests/helpers/formReviewSets.ts — COACH-VIDEO-REVIEW (2026-10-24): labelled program sets for the rep counter and the
// flags, built only from the Mirror's own pose fixtures and builders. Test-only.
//
//   stored    lib/mirror/fixtures/*.json — one rep each, built in 3-D and filmed through lib/pose/synth.ts's virtual
//             webcam, noise-free — chained back to back on one clock (sideRepStage.test.ts's `repeated`, generalised).
//   jittered  whole sets from the same bodies (squatJoints, lungePose, hingeSet, pushupSet) filmed with the synth's
//             DEFAULT landmark noise, frame jitter, dropped and missed frames, seeded — some reps carrying an injected
//             fault (a knee caving 6 cm, a heel lift, a knee-dominant hinge, a head poke, a sagging plank).
//   real      lib/pose/__fixtures__ — the owner's own DeepMotion takes (standing, running in place, shuffling), filmed
//             through the same virtual webcam: no set is in them, so every rep counted there is a false one.
//
// `truth.faulty` maps a rep number to the faults injected on it; every other rep was built clean. SYNTHETIC except the
// real negatives: no recording of a real person doing a program set exists in the repo yet.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { synthesize, type Joints } from '@/lib/pose/synth';
import { readFixture } from '@/lib/mirror/fixtures/load';
import { toPoseFrames } from '@/lib/mirror/fixtures';
import { lungePose } from '@/lib/mirror/fixtures/build';
import { filmBodies, hingeSet, pushupSet, repDepths } from '@/lib/mirror/fixtures/sideRepBuild';
import { squatJoints, type SquatShape } from '@/lib/babylon/nexus/neuro-mirror/rules/__fixtures__/synthSquat';
import type { ReviewMovement } from '@/lib/coach/formReview/movements';

export interface LabelledSet {
  name: string;
  movement: ReviewMovement;
  frames: PoseFrame[];
  truth: { reps: number; faulty: Record<number, string[]> };
  kind: 'stored' | 'jittered' | 'real';
}

const FPS = 30;
/**
 * The still hold before a jittered side-on set: 2.5 s, sideRepStage.test.ts's own convention for jittered sets. The
 * stage needs SETUP_HOLD_MS (1 s) of passing frames, and landmark jitter fails a frame now and then (the hold pauses):
 * with the builder's default 1.5 s, the first push-up rep was not counted on 4 of 6 seeds (measured 2026-10-24).
 */
export const JITTER_SETUP = 75;
/** How far the walked-out wrist sits (share of the frame width). */
export const WALK = 0.06;

/** Stored one-rep fixtures, played back to back on one clock. */
export function chain(names: readonly string[]): PoseFrame[] {
  const out: PoseFrame[] = [];
  let t0 = 0;
  for (const n of names) {
    for (const f of toPoseFrames(readFixture(n))) out.push({ ...f, t: f.t + t0 });
    t0 = out[out.length - 1].t + 1000 / FPS;
  }
  return out;
}

/**
 * The near (left) wrist walked `by` of the frame out from under the shoulder on chained reps [from, to) — the filmed
 * landmark moved directly, pushupAudit.test.ts's own way (moving the joint would bend the elbow read too).
 */
export function walkHands(frames: PoseFrame[], from: number, to: number, by: number, perRep = 120): PoseFrame[] {
  return frames.map((f, i) => {
    const rep = Math.floor(i / perRep);
    if (!f.present || rep < from || rep >= to) return f;
    const image = [...f.image];
    image[15] = { ...image[15], x: image[15].x - by };
    return { ...f, image };
  });
}

/** A jittered squat set (lib/pose/synth.ts DEFAULT noise and drops, `seed`): stand, then `shapes.length` squats. */
export function squatSet(shapes: readonly SquatShape[], seed: number): PoseFrame[] {
  const bodies: Joints[] = [];
  const stand = (s: number) => { for (let i = 0; i < Math.round(s * FPS); i++) bodies.push(squatJoints(0, {})); };
  stand(1.5);
  for (const shape of shapes) {
    for (let i = 0; i < 21; i++) bodies.push(squatJoints((i + 1) / 21, shape));
    for (let i = 0; i < 12; i++) bodies.push(squatJoints(1, shape));
    for (let i = 0; i < 21; i++) bodies.push(squatJoints(1 - (i + 1) / 21, shape));
    stand(1);
  }
  stand(1);
  return synthesize({ fps: FPS, frames: bodies }, { seed }).frames;
}

/** A jittered lunge set, one leg forward, from build.ts lungePose (the stored lunge fixtures' body). */
export function lungeSet(front: 'left' | 'right', kneeIn: readonly number[], seed: number): PoseFrame[] {
  const bodies: Joints[] = Array.from({ length: 45 }, () => lungePose(0, { front }));
  for (const k of kneeIn) for (const d of repDepths(30, 10, 30, 25)) bodies.push(lungePose(d, { front, frontKneeIn: k }));
  return filmBodies(bodies, seed);
}

const SQUATTY = { backM: 0.05, dropM: 0.30, trunkDeg: 30 };
const CAVE_L: SquatShape = { shiftL: -0.06 };
const CAVE_BOTH: SquatShape = { shiftL: -0.06, shiftR: -0.06 };
const HEELS: SquatShape = { heelLift: 0.1 };

const faultyOf = (marks: readonly (string[] | null)[]): Record<number, string[]> =>
  Object.fromEntries(marks.map((m, i) => [i + 1, m]).filter(([, m]) => m)) as Record<number, string[]>;

/** Every labelled set, stored first. */
export function labelledSets(seeds: readonly number[] = [1, 2, 3, 4]): LabelledSet[] {
  const sets: LabelledSet[] = [];
  // ── stored, noise-free ──
  sets.push({
    name: 'stored squat ×7 (knee in L, both, R)', movement: 'squat', kind: 'stored',
    frames: chain(['squat_clean', 'squat_clean', 'squat_knee_in_left', 'squat_clean', 'squat_knees_in_both', 'squat_knee_in_right', 'squat_knee_out_left']),
    truth: { reps: 7, faulty: { 3: ['kneeValgus'], 5: ['kneeValgus'], 6: ['kneeValgus'] } },
  });
  sets.push({
    name: 'stored lunge ×4 (R knee in ×2, L clean ×2)', movement: 'lunge', kind: 'stored',
    frames: chain(['lunge_right_front_knee_in', 'lunge_right_front_knee_in', 'lunge_left_front', 'lunge_left_front']),
    truth: { reps: 4, faulty: { 1: ['kneeIn'], 2: ['kneeIn'] } },
  });
  sets.push({ name: 'stored hinge ×5', movement: 'hinge', kind: 'stored', frames: chain(Array(5).fill('hinge_side')), truth: { reps: 5, faulty: {} } });
  sets.push({ name: 'stored push-up ×5', movement: 'pushup', kind: 'stored', frames: chain(Array(5).fill('pushup_side')), truth: { reps: 5, faulty: {} } });
  sets.push({
    name: 'stored push-up ×4 (3 hands walked out)', movement: 'pushup', kind: 'stored', frames: walkHands(chain(Array(4).fill('pushup_side')), 2, 3, WALK),
    truth: { reps: 4, faulty: { 3: ['handSetup'] } },
  });

  // ── jittered, seeded ──
  for (const seed of seeds) {
    const sqMarks: (SquatShape | null)[] = [null, null, CAVE_L, null, HEELS, null, CAVE_BOTH, null];
    sets.push({
      name: `squat ×8 seed ${seed} (3 knee L, 5 heels, 7 knees)`, movement: 'squat', kind: 'jittered',
      frames: squatSet(sqMarks.map((m) => m ?? {}), seed),
      truth: { reps: 8, faulty: faultyOf(sqMarks.map((m) => (m === HEELS ? ['heelRise'] : m ? ['kneeValgus'] : null))) },
    });
    sets.push({ name: `squat ×8 clean seed ${seed}`, movement: 'squat', kind: 'jittered', frames: squatSet(Array(8).fill({}), seed), truth: { reps: 8, faulty: {} } });

    const lk = [0, 0.05, 0, 0, 0.05, 0];
    sets.push({
      name: `lunge ×6 seed ${seed} (2, 5 knee in)`, movement: 'lunge', kind: 'jittered', frames: lungeSet('right', lk, seed),
      truth: { reps: 6, faulty: faultyOf(lk.map((k) => (k ? ['kneeIn'] : null))) },
    });
    sets.push({ name: `lunge ×6 clean seed ${seed}`, movement: 'lunge', kind: 'jittered', frames: lungeSet('left', Array(6).fill(0), seed), truth: { reps: 6, faulty: {} } });

    const hMarks = [null, SQUATTY, null, null, { headPokeM: 0.10 }, null];
    sets.push({
      name: `hinge ×6 seed ${seed} (2 knee-dominant, 5 head poke)`, movement: 'hinge', kind: 'jittered',
      frames: hingeSet({ reps: 6, seed, setup: JITTER_SETUP, rep: (i) => hMarks[i] ?? undefined }),
      truth: { reps: 6, faulty: { 2: ['hingeRatio', 'shinAngle'], 5: ['dowelLine'] } },
    });
    sets.push({ name: `hinge ×6 clean seed ${seed}`, movement: 'hinge', kind: 'jittered', frames: hingeSet({ reps: 6, seed, setup: JITTER_SETUP }), truth: { reps: 6, faulty: {} } });

    const pMarks = [null, null, { hipOffM: -0.08 }, { hipOffM: -0.08 }, null, null];
    sets.push({
      name: `push-up ×6 seed ${seed} (3, 4 sag)`, movement: 'pushup', kind: 'jittered',
      frames: pushupSet({ reps: 6, seed, setup: JITTER_SETUP, rep: (i) => pMarks[i] ?? undefined }),
      truth: { reps: 6, faulty: { 3: ['bodyLine'], 4: ['bodyLine'] } },
    });
    sets.push({ name: `push-up ×6 clean seed ${seed}`, movement: 'pushup', kind: 'jittered', frames: pushupSet({ reps: 6, seed, setup: JITTER_SETUP }), truth: { reps: 6, faulty: {} } });
  }
  return sets;
}

/** The owner's real takes with no set in them: every rep counted on one is a false rep. */
export function realNegatives(): { name: string; frames: PoseFrame[] }[] {
  const dir = resolve(process.cwd(), 'lib/pose/__fixtures__');
  return ['stand_still', 'run_in_place', 'shuffle_lateral'].map((name) => {
    const fx = JSON.parse(readFileSync(resolve(dir, `${name}.json`), 'utf8')) as { frames: { t: number; present: boolean; image: PoseFrame['image'] }[] };
    return { name, frames: fx.frames.map((f) => ({ t: f.t, present: f.present, image: f.image })) };
  });
}
