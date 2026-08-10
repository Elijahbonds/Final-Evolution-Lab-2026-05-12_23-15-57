/**
 * lib/workout/plan-generator.ts
 * =============================
 * PURE workout-plan generator. Turns a movement-screen weakness into a
 * structured 4-week plan (product plan_4w) and a 12-week upsell (program_12w).
 * The AI Coach can enrich copy at runtime, but the STRUCTURE is deterministic
 * and testable here.
 */

import type { Pillar, ScreenResult } from './movement-screen';
import { PILLAR_LABELS } from './movement-screen';

export interface PlanExercise { name: string; sets: number; reps: string; cue: string; targets: Pillar }
export interface PlanDay { day: string; block: string; exercises: PlanExercise[] }
export interface PlanWeek { week: number; theme: string; days: PlanDay[] }
export interface WorkoutPlanStruct { tier: 'plan_4w' | 'program_12w'; focus: Pillar; focusLabel: string; weeks: PlanWeek[] }

// TUNE(elijah) — corrective exercise pools keyed by weakest pillar.
const POOLS: Record<Pillar, PlanExercise[]> = {
  power: [
    { name: 'Depth Drop to Vertical', sets: 4, reps: '4', cue: 'Absorb soft, explode tall', targets: 'power' },
    { name: 'Trap-Bar Jump', sets: 5, reps: '3', cue: 'Drive the floor away', targets: 'power' },
    { name: 'Approach Bound', sets: 4, reps: '5 ea', cue: 'Penultimate long, last short', targets: 'power' },
  ],
  mobility: [
    { name: 'ATG Split Squat', sets: 3, reps: '8 ea', cue: 'Knee over toe, control', targets: 'mobility' },
    { name: 'Cossack Squat', sets: 3, reps: '6 ea', cue: 'Stay tall through the shift', targets: 'mobility' },
    { name: 'Ankle Rocker w/ Band', sets: 3, reps: '10 ea', cue: 'Heel glued down', targets: 'mobility' },
  ],
  symmetry: [
    { name: 'Single-Leg RDL', sets: 3, reps: '8 ea', cue: 'Hips square, slow lower', targets: 'symmetry' },
    { name: 'Rear-Foot Elevated Split Squat', sets: 3, reps: '8 ea', cue: 'Even push both legs', targets: 'symmetry' },
    { name: 'Single-Arm Carry', sets: 3, reps: '30m ea', cue: 'Resist the lean', targets: 'symmetry' },
  ],
  stability: [
    { name: 'Lateral Bound + Stick', sets: 4, reps: '5 ea', cue: 'Land quiet, knee tracks toe', targets: 'stability' },
    { name: 'Copenhagen Plank', sets: 3, reps: '20s ea', cue: 'Adductor drives up', targets: 'stability' },
    { name: 'Banded Monster Walk', sets: 3, reps: '12 ea', cue: 'Knees push out', targets: 'stability' },
  ],
  cadence: [
    { name: 'A-Skip', sets: 4, reps: '20m', cue: 'Quick ground contact', targets: 'cadence' },
    { name: 'Metronome Stride 180', sets: 4, reps: '30s', cue: 'Match the beep', targets: 'cadence' },
    { name: 'Wall Drive March', sets: 3, reps: '10 ea', cue: 'Punch knee, cycle fast', targets: 'cadence' },
  ],
  posture: [
    { name: 'Wall Posture Hold', sets: 3, reps: '30s', cue: 'Ribs down, tall spine', targets: 'posture' },
    { name: 'Landing Trunk Control', sets: 4, reps: '5', cue: 'Chest proud on landing', targets: 'posture' },
    { name: 'Deadbug w/ Reach', sets: 3, reps: '8 ea', cue: 'Low back pinned', targets: 'posture' },
  ],
};

const DAYS_4 = ['Mon', 'Wed', 'Fri'];
const THEMES = ['Foundation', 'Build', 'Intensify', 'Express'];

function weekFor(week: number, focus: Pillar): PlanWeek {
  const primary = POOLS[focus];
  // Rotate a secondary pool so the plan is balanced, not one-note.
  const secondaryKey = (Object.keys(POOLS) as Pillar[]).filter((p) => p !== focus)[(week - 1) % 5];
  const secondary = POOLS[secondaryKey];
  const days: PlanDay[] = DAYS_4.map((d, i) => ({
    day: d,
    block: i === 1 ? 'Corrective + Skill' : 'Strength + Power',
    exercises: [primary[(week + i) % primary.length], secondary[(week + i) % secondary.length]],
  }));
  return { week, theme: THEMES[(week - 1) % THEMES.length], days };
}

export function generatePlan(screen: ScreenResult, tier: 'plan_4w' | 'program_12w' = 'plan_4w'): WorkoutPlanStruct {
  const focus = screen.weakest;
  const weekCount = tier === 'program_12w' ? 12 : 4;
  const weeks: PlanWeek[] = [];
  for (let w = 1; w <= weekCount; w++) weeks.push(weekFor(w, focus));
  return { tier, focus, focusLabel: PILLAR_LABELS[focus], weeks };
}
