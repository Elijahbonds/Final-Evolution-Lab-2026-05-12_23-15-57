// tests/helpers/mirrorJitterSets.ts — MIRROR-FIXES (2026-10-25): labelled jittered sets for the LIVE Mirror's lunge,
// hip hinge and push-up. Test-only.
//
// The same sets lane/coach-video-review measured the live Mirror on (its tests/helpers/formReviewSets.ts, 2026-10-24),
// rebuilt here from the Mirror's own builders so this lane does not depend on that one's files:
//   stored    lib/mirror/fixtures/*.json — one rep each, noise-free, chained back to back on one clock.
//   jittered  whole sets from the same bodies (build.ts lungePose, sideRepBuild.ts hingeSet / pushupSet) filmed through
//             lib/pose/synth.ts with its DEFAULT landmark noise, seeded — some reps carrying an injected fault (a front
//             knee caving 5 cm, a knee-dominant hinge, a head poke, a sagging plank).
//   real      lib/pose/__fixtures__ — the owner's own takes (standing still, running in place, shuffling): no set is in
//             them, so every rep counted there is a false one.
// `faulty` maps a 1-based rep number to the faults injected on it; every other rep was built clean. SYNTHETIC except
// the real negatives.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PoseFrame } from '@/lib/pose/landmarks';
import type { Joints } from '@/lib/pose/synth';
import { readFixture } from '@/lib/mirror/fixtures/load';
import { toPoseFrames } from '@/lib/mirror/fixtures';
import { lungePose } from '@/lib/mirror/fixtures/build';
import { filmBodies, hingeSet, pushupSet, repDepths, SETUP_FRAMES } from '@/lib/mirror/fixtures/sideRepBuild';

export interface JitterSet {
  name: string;
  frames: PoseFrame[];
  reps: number;
  faulty: Record<number, string[]>;
}

const FPS = 30;

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

/** A jittered lunge set, one leg forward: 1.5 s standing, then one rep per entry of `kneeIn` (the front knee's cave, m). */
export function lungeSet(front: 'left' | 'right', kneeIn: readonly number[], seed: number | null): PoseFrame[] {
  const bodies: Joints[] = Array.from({ length: 45 }, () => lungePose(0, { front }));
  for (const k of kneeIn) for (const d of repDepths(30, 10, 30, 25)) bodies.push(lungePose(d, { front, frontKneeIn: k }));
  return filmBodies(bodies, seed);
}

const faultyOf = (marks: readonly (string[] | null)[]): Record<number, string[]> =>
  Object.fromEntries(marks.map((m, i) => [i + 1, m]).filter(([, m]) => m)) as Record<number, string[]>;

/** The lunge sets: the stored four, then per seed a right-leg set with reps 2 and 5 caving, and a clean left-leg set. */
export function lungeSets(seeds: readonly number[]): JitterSet[] {
  const sets: JitterSet[] = [{
    name: 'stored lunge ×4', frames: chain(['lunge_right_front_knee_in', 'lunge_right_front_knee_in', 'lunge_left_front', 'lunge_left_front']),
    reps: 4, faulty: { 1: ['kneeIn'], 2: ['kneeIn'] },
  }];
  for (const seed of seeds) {
    const lk = [0, 0.05, 0, 0, 0.05, 0];
    sets.push({ name: `lunge ×6 seed ${seed} (2, 5 knee in)`, frames: lungeSet('right', lk, seed), reps: 6, faulty: faultyOf(lk.map((k) => (k ? ['kneeIn'] : null))) });
    sets.push({ name: `lunge ×6 clean seed ${seed}`, frames: lungeSet('left', Array(6).fill(0), seed), reps: 6, faulty: {} });
  }
  return sets;
}

const SQUATTY = { backM: 0.05, dropM: 0.30, trunkDeg: 30 };

/** The hinge sets per seed: reps 2 (knee-dominant) and 5 (head poke) faulty, and a clean set. `setup` frames first. */
export function hingeSets(seeds: readonly number[], setup = SETUP_FRAMES): JitterSet[] {
  const sets: JitterSet[] = [];
  for (const seed of seeds) {
    const marks = [null, SQUATTY, null, null, { headPokeM: 0.10 }, null];
    sets.push({
      name: `hinge ×6 seed ${seed} (2 knee-dominant, 5 head poke)`, frames: hingeSet({ reps: 6, seed, setup, rep: (i) => marks[i] ?? undefined }),
      reps: 6, faulty: { 2: ['hingeRatio', 'shinAngle'], 5: ['dowelLine'] },
    });
    sets.push({ name: `hinge ×6 clean seed ${seed}`, frames: hingeSet({ reps: 6, seed, setup }), reps: 6, faulty: {} });
  }
  return sets;
}

/** The push-up sets per seed: reps 3 and 4 sagging, and a clean set. `setup` frames of the plank first. */
export function pushupSets(seeds: readonly number[], setup = SETUP_FRAMES): JitterSet[] {
  const sets: JitterSet[] = [];
  for (const seed of seeds) {
    const marks = [null, null, { hipOffM: -0.08 }, { hipOffM: -0.08 }, null, null];
    sets.push({
      name: `push-up ×6 seed ${seed} (3, 4 sag)`, frames: pushupSet({ reps: 6, seed, setup, rep: (i) => marks[i] ?? undefined }),
      reps: 6, faulty: { 3: ['bodyLine'], 4: ['bodyLine'] },
    });
    sets.push({ name: `push-up ×6 clean seed ${seed}`, frames: pushupSet({ reps: 6, seed, setup }), reps: 6, faulty: {} });
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
