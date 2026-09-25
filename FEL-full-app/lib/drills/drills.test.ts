import { describe, it, expect } from 'vitest';
import { PLAYBOOK } from '../education/course';
import { COACH_MOMENTS } from '../babylon/audio/mic/moments';
import { LIMBS, MOVE_LIMBS, MOVE_WINDOW_SCALE, lateGraceFor, limbSatisfies, type Limb } from '../babylon/core/bodyTargets';
import { bodyWindows, isBodyStep } from '../babylon/core/DanceCore';
import {
  COACH_WORDS_PER_SEC, FIRST_LEAD_IN_SEC, LEAD_IN_SEC, drillLengthSec, drillTargetCount, mirrorDrill, phaseSteps,
  type Drill, type DrillTarget,
} from './chart';
import {
  DRILLS, WAKE_UP, COUNTERMOVEMENT_GEOMETRY, POGO_BILATERAL, POGO_UNILATERAL, SAFE_LANDING, WALL_DRIVE,
  THREE_STEP_DECEL, LATERAL_BOUND, T_DRILL, APPROACH_ONE_FOOT, APPROACH_TWO_FOOT, drillById,
  PLANT_CONTACT_ONE_SEC, PLANT_CONTACT_TWO_SEC,
} from './drills';

const missAfter = (t: DrillTarget) => bodyWindows(MOVE_WINDOW_SCALE[t.move]).missAfter;
const words = new Map(COACH_MOMENTS.map((m) => [m.id, m.maxWords]));
/** Could one event's limb answer both targets? (Then they must be far enough apart that it cannot be in both windows.) */
const overlap = (a: Limb | undefined, b: Limb | undefined) =>
  LIMBS.some((e) => limbSatisfies(a, e) && limbSatisfies(b, e)) || (!a && !b);
const all = (d: Drill) => d.phases.flatMap((p) => p.targets.map((t) => ({ p, t })));

describe('every drill chart is well-formed', () => {
  it('eleven drills, unique ids, each found by id', () => {
    expect(DRILLS).toHaveLength(11);
    expect(new Set(DRILLS.map((d) => d.id)).size).toBe(DRILLS.length);
    for (const d of DRILLS) expect(drillById(d.id)).toBe(d);
  });

  for (const d of DRILLS) {
    describe(d.id, () => {
      it('names its source, and a Playbook source is a real chapter and section of the imported book', () => {
        const sources = [d.source, ...d.phases.map((p) => p.source).filter((s) => s !== undefined)];
        for (const s of sources) {
          expect(s.chapter).toBeGreaterThan(0);
          expect(s.section.length).toBeGreaterThan(0);
          if (s.book !== 'playbook') continue;
          const ch = PLAYBOOK.chapters.find((c) => c.number === s.chapter);
          expect(ch, `chapter ${s.chapter}`).toBeTruthy();
          expect(ch!.sections.map((x) => x.title), `"${s.section}" in ch. ${s.chapter}`).toContain(s.section);
        }
      });

      it('phases: unique ids, a positive length, a rest has no targets', () => {
        expect(new Set(d.phases.map((p) => p.id)).size).toBe(d.phases.length);
        for (const p of d.phases) {
          expect(p.durationSec).toBeGreaterThan(0);
          expect(p.cue.length).toBeGreaterThan(0);
          if (p.presence === 'free') expect(p.targets).toHaveLength(0);
        }
      });

      it('targets: in order, after the lead-in, with a tail for the late event, legal limbs and zones', () => {
        d.phases.forEach((p, pi) => {
          const lead = pi === 0 ? FIRST_LEAD_IN_SEC : LEAD_IN_SEC;
          p.targets.forEach((t, i) => {
            if (i > 0) expect(t.t).toBeGreaterThanOrEqual(p.targets[i - 1].t);
            expect(t.t, `${p.id} #${i}`).toBeGreaterThanOrEqual(lead);
            // its window and its back-dated event both land inside the phase
            expect(t.t + missAfter(t) + lateGraceFor(t.move, t.holdSec), `${p.id} #${i} tail`).toBeLessThanOrEqual(p.durationSec);
            if (t.holdSec) expect(t.t + t.holdSec, `${p.id} #${i} hold`).toBeLessThanOrEqual(p.durationSec);
            expect(t.move).not.toBe('tap');
            expect(MOVE_LIMBS[t.move], `${p.id} #${i} ${t.move}/${t.limb}`).toContain(t.limb ?? null);
            if (t.move === 'touch') expect(t.zone).toBeTruthy();
            if (t.zone) {
              // only a touch is judged in its zone (DrillRunner.limbs): no reader event carries a position, so a
              // zoned punch or kick could never be answered
              expect(t.move).toBe('touch');
              for (const v of [t.zone.x, t.zone.y]) { expect(v).toBeGreaterThan(0); expect(v).toBeLessThan(1); }
            }
            if (t.holdSec) expect(['hold', 'land', 'squat']).toContain(t.move);
            if (t.move === 'hold') expect(t.holdSec).toBeGreaterThan(0);
          });
        });
      });

      it('no event can fall in two targets\' windows: same move, overlapping limbs, far enough apart', () => {
        for (const p of d.phases) {
          for (let i = 0; i < p.targets.length; i++) {
            for (let j = i + 1; j < p.targets.length; j++) {
              const a = p.targets[i], b = p.targets[j];
              if (a.move !== b.move || !overlap(a.limb, b.limb)) continue;
              expect(b.t - a.t, `${p.id} #${i}/#${j} ${a.move}`).toBeGreaterThan(missAfter(a) + missAfter(b) - 1e-9);
            }
          }
        }
      });

      it('prompts: the coach\'s own lines, in order, one at a time, intro first and done last', () => {
        const timeline: { t: number; id: string }[] = [];
        let off = 0;
        for (const p of d.phases) {
          p.prompts.forEach((x, i) => {
            expect(words.has(x.id), x.id).toBe(true);
            expect(x.t).toBeGreaterThanOrEqual(0);
            expect(x.t).toBeLessThan(p.durationSec);
            if (i > 0) expect(x.t).toBeGreaterThan(p.prompts[i - 1].t);
            timeline.push({ t: off + x.t, id: x.id });
          });
          off += p.durationSec;
        }
        expect(timeline[0]).toEqual({ t: 0, id: 'coach.drill.intro' });
        expect(timeline[timeline.length - 1].id).toBe('coach.drill.done');
        for (let i = 1; i < timeline.length; i++) {
          const need = words.get(timeline[i - 1].id)! / COACH_WORDS_PER_SEC;
          expect(timeline[i].t - timeline[i - 1].t, `${timeline[i - 1].id} → ${timeline[i].id}`).toBeGreaterThanOrEqual(need - 1e-9);
        }
        // the reactive lines are the runner's, never the chart's
        expect(timeline.some((x) => ['coach.drill.nice', 'coach.drill.faster', 'coach.drill.slower'].includes(x.id))).toBe(false);
      });

      it('cadence windows sit inside the phase and hold the steps they read', () => {
        for (const p of d.phases) {
          if (!p.cadence) continue;
          expect(p.cadence.stepsPerMin).toBeGreaterThan(60);
          for (const [a, b] of p.cadence.windows) {
            expect(a).toBeGreaterThanOrEqual(0);
            expect(b).toBeLessThanOrEqual(p.durationSec);
            expect(p.targets.filter((t) => t.move === 'step' && t.t >= a && t.t < b).length).toBeGreaterThanOrEqual(4);
          }
        }
      });

      it('becomes judge steps that are all body targets, with the move\'s window scale and late grace', () => {
        for (const p of d.phases) {
          const steps = phaseSteps(p);
          expect(steps).toHaveLength(p.targets.length);
          steps.forEach((s, i) => {
            expect(isBodyStep(s)).toBe(true);
            expect(s.beat).toBe(p.targets[i].t);
            expect(s.windowScale).toBe(MOVE_WINDOW_SCALE[s.move!]);
            expect(s.lateGraceSec).toBe(lateGraceFor(s.move!, s.holdSec));
            if (p.targets[i].zone) expect(s.zone?.limb).toBe(p.targets[i].limb);
          });
          expect(new Set(steps.map((s) => s.clipId)).size).toBe(steps.length);
        }
      });
    });
  }
});

describe('the dosage is the book\'s', () => {
  const minutes = (title: string) => Number(/\((\d+) minutes?\)/.exec(title)?.[1]);

  it('the wake-up is the ten-minute protocol: six phases, each as long as its section title says', () => {
    expect(WAKE_UP.phases).toHaveLength(6);
    for (const p of WAKE_UP.phases) expect(p.durationSec, p.id).toBe(minutes(p.source!.section) * 60);
    expect(drillLengthSec(WAKE_UP)).toBe(600);
  });

  it('wake-up: three breaths of 4-2-6, two 15-second pogo sets, three launch rounds', () => {
    const press = WAKE_UP.phases.find((p) => p.id === 'pressurize')!;
    expect(press.pacer).toMatchObject({ inSec: 4, holdSec: 2, outSec: 6, rounds: 3 });
    expect(press.prompts.filter((x) => x.id === 'coach.drill.breathe')).toHaveLength(3);
    const rhythm = WAKE_UP.phases.find((p) => p.id === 'build-the-rhythm')!;
    const pogos = rhythm.targets.filter((t) => t.move === 'jump');
    expect(pogos).toHaveLength(60);
    expect(pogos[29].t - pogos[0].t).toBeCloseTo(14.5, 9);
    const launch = WAKE_UP.phases.find((p) => p.id === 'prime-the-launch')!;
    expect(launch.targets.filter((t) => t.label === 'STOMP')).toHaveLength(3);
    expect(launch.targets.filter((t) => t.move === 'squat')).toHaveLength(3);
  });

  it('countermovement geometry: 60 seconds, five slow reps held three seconds at the bottom', () => {
    const p = COUNTERMOVEMENT_GEOMETRY.phases[0];
    expect(p.durationSec).toBe(60);
    expect(COUNTERMOVEMENT_GEOMETRY.source.section).toMatch(/\(60 seconds\)/);
    expect(p.targets).toHaveLength(5);
    expect(p.targets.every((t) => t.move === 'squat' && t.holdSec === 3)).toBe(true);
  });

  it('pogos: three sets of 20 on both feet with ~60 s between; 15-second sets on each foot', () => {
    const sets = POGO_BILATERAL.phases.filter((p) => p.targets.length);
    expect(sets.map((p) => p.targets.length)).toEqual([20, 20, 20]);
    expect(POGO_BILATERAL.phases.filter((p) => p.presence === 'free').map((p) => p.durationSec)).toEqual([60, 60]);
    for (const p of POGO_UNILATERAL.phases.filter((x) => x.targets.length)) {
      const ts = p.targets.map((t) => t.t);
      expect(ts[ts.length - 1] - ts[0]).toBeCloseTo(14.5, 9);
      expect(new Set(p.targets.map((t) => t.limb)).size).toBe(1);
    }
    expect(POGO_UNILATERAL.phases.flatMap((p) => p.targets).filter((t) => t.limb === 'footL').length)
      .toBe(POGO_UNILATERAL.phases.flatMap((p) => p.targets).filter((t) => t.limb === 'footR').length);
  });

  it('safe landing: ten two-foot landings held three seconds', () => {
    const lands = SAFE_LANDING.phases[0].targets.filter((t) => t.move === 'land');
    expect(lands).toHaveLength(10);
    expect(lands.every((t) => t.limb === 'feet' && t.holdSec === 3)).toBe(true);
  });

  it('wall drive: two sets, alternating knees', () => {
    const sets = WALL_DRIVE.phases.filter((p) => p.targets.length);
    expect(sets).toHaveLength(2);
    for (const p of sets) {
      expect(p.targets.every((t) => t.move === 'knee')).toBe(true);
      p.targets.forEach((t, i) => i && expect(t.limb).not.toBe(p.targets[i - 1].limb));
    }
  });

  it('3-step decel: five jog steps then a plant and a one-second hold, five each way', () => {
    const [left, right] = THREE_STEP_DECEL.phases;
    for (const [p, plant] of [[left, 'footR'], [right, 'footL']] as const) {
      const plants = p.targets.filter((t) => t.label === 'PLANT');
      expect(plants).toHaveLength(5);
      expect(plants.every((t) => t.limb === plant)).toBe(true);
      expect(p.targets.filter((t) => t.move === 'squat' && t.holdSec === 1)).toHaveLength(5);
      expect(p.targets.filter((t) => t.move === 'step' && t.label !== 'PLANT')).toHaveLength(25);
    }
  });

  it('lateral bound: eight bounds each way, each landed on the other foot and stuck two seconds', () => {
    const t = LATERAL_BOUND.phases[0].targets;
    const bounds = t.filter((x) => x.move === 'jump');
    const sticks = t.filter((x) => x.move === 'land');
    expect(bounds).toHaveLength(16);
    expect(bounds.filter((x) => x.limb === 'footR')).toHaveLength(8);
    expect(sticks.every((x, i) => x.holdSec === 2 && x.limb !== bounds[i].limb && x.t > bounds[i].t)).toBe(true);
  });

  it('T-drill: three reps, cones touched centre, left (left hand), right (right hand), centre; 2-4-2 shuffles', () => {
    const reps = T_DRILL.phases.filter((p) => p.targets.length);
    expect(reps).toHaveLength(3);
    for (const p of reps) {
      const touches = p.targets.filter((t) => t.move === 'touch');
      expect(touches.map((t) => t.label)).toEqual(['FAR CONE', 'LEFT CONE', 'RIGHT CONE', 'MIDDLE CONE']);
      expect(touches[1].limb).toBe('handL');
      expect(touches[1].zone!.x).toBeLessThan(0.5);            // the player's left is the self-view's left
      expect(touches[2].limb).toBe('handR');
      expect(touches[2].zone!.x).toBeGreaterThan(0.5);
      expect(p.targets.filter((t) => t.label === 'SHUFFLE')).toHaveLength(8);
    }
  });

  it('approach rhythm: running in place, then the penultimate (right), the plant (left) and the take-off', () => {
    for (const d of [APPROACH_ONE_FOOT, APPROACH_TWO_FOOT]) {
      const t = d.phases[0].targets;
      const pens = t.filter((x) => x.move === 'penultimate');
      const offs = t.filter((x) => x.move === 'jump');
      expect(pens).toHaveLength(5);
      expect(offs).toHaveLength(5);
      pens.forEach((pen, i) => {
        const runStride = 60 / 180;
        const lastRun = t.filter((x) => x.label === 'RUN' && x.t < pen.t).pop()!;
        const plant = t.find((x) => x.label === 'PLANT' && x.t > pen.t)!;
        expect(pen.limb).toBe('footR');
        expect(lastRun.limb).toBe('footL');
        expect(pen.t - lastRun.t).toBeGreaterThan(runStride);        // the longest step
        expect(plant.t - pen.t).toBeLessThan(runStride);            // the last one short
        expect(offs[i].t).toBeGreaterThan(plant.t);
      });
    }
    expect(APPROACH_ONE_FOOT.phases[0].targets.filter((x) => x.move === 'jump').every((x) => x.limb === 'footL')).toBe(true);
    expect(APPROACH_TWO_FOOT.phases[0].targets.filter((x) => x.move === 'jump').every((x) => x.limb === 'feet')).toBe(true);
  });

  it('off one foot the plant is quicker than off two (the book: one-foot is "faster, shallower"), on the owner\'s own takes', () => {
    expect(PLANT_CONTACT_ONE_SEC).toBeLessThan(PLANT_CONTACT_TWO_SEC);
    for (const [d, contact] of [[APPROACH_ONE_FOOT, PLANT_CONTACT_ONE_SEC], [APPROACH_TWO_FOOT, PLANT_CONTACT_TWO_SEC]] as const) {
      const t = d.phases[0].targets;
      t.filter((x) => x.label === 'PLANT').forEach((plant) => {
        const off = t.find((x) => x.move === 'jump' && x.t > plant.t)!;
        expect(off.t - plant.t).toBeCloseTo(contact, 3);
      });
    }
  });

  it('a squat held at the bottom waits for its rest like a hold does (the reader\'s dip comes only after the pause)', () => {
    const held = [...COUNTERMOVEMENT_GEOMETRY.phases, ...THREE_STEP_DECEL.phases].flatMap(phaseSteps).filter((s) => s.move === 'squat');
    expect(held.length).toBe(15);
    for (const s of held) expect(s.lateGraceSec).toBe(lateGraceFor('hold'));
    const dip = phaseSteps(WAKE_UP.phases.find((p) => p.id === 'prime-the-launch')!).filter((s) => s.move === 'squat');
    for (const s of dip) expect(s.lateGraceSec).toBe(lateGraceFor('squat'));
  });

  it('mirroring a drill swaps every side and flips every zone, and keeps the timing', () => {
    const m = mirrorDrill(T_DRILL);
    expect(drillTargetCount(m)).toBe(drillTargetCount(T_DRILL));
    const a = all(T_DRILL), b = all(m);
    a.forEach(({ t }, i) => {
      expect(b[i].t.t).toBe(t.t);
      if (t.limb === 'handL') expect(b[i].t.limb).toBe('handR');
      if (t.zone) expect(b[i].t.zone!.x).toBeCloseTo(1 - t.zone.x, 9);
    });
  });
});
