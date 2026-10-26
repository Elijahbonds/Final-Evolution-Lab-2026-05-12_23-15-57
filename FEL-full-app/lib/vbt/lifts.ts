// lib/vbt/lifts.ts — VBT (2026-10-25): the moves the bar-speed tool reads, what it tracks for each, and the velocity zones.
//
// THE OWNER'S LIST (2026-10-25): barbell squat, bench, deadlift, clean/power moves, press; dumbbell and kettlebell;
// body-only push-up, pull-up, bodyweight squat, jump squat; med-ball throws (release speed).
//
// WHAT IS TRACKED. A barbell is read at the PLATE's centre when the plate is found, else at the hands (pose). Dumbbells
// and kettlebells at the wrist; body-only moves at the joint that carries the load (the hips in a squat, the shoulders in
// a push-up or pull-up); a med ball at the throwing wrist. Every concentric reads UPWARD in a side-on picture.
//
// MVT (the e1RM's velocity at 1RM) only where the literature gives one (docs/VBT-BENCHMARK.md §2). A ballistic move (a
// clean, a jump squat, a throw) has no slow 1RM rep: no e1RM is offered for it.
//
// Pure data.

export type LiftFamily = 'barbell' | 'dbkb' | 'body' | 'medball';
export type TrackPoint = 'bar' | 'wrist' | 'hip' | 'shoulder';

export interface Lift {
  id: LiftId;
  name: string;
  family: LiftFamily;
  point: TrackPoint;
  /** A ballistic move: peak velocity is its headline, not the mean. */
  ballistic: boolean;
  /** Minimum velocity threshold (m/s, MCV at 1RM), or null: no e1RM for this move. */
  mvt: number | null;
  mvtSource: string | null;
  /** Ranges under this (m) are not a rep at all. */
  minRomM: number;
  /** The athlete sets a load for it (body-only moves read the body: no load). */
  loaded: boolean;
}

export const LIFT_IDS = [
  'back_squat', 'front_squat', 'bench_press', 'deadlift', 'overhead_press', 'power_clean', 'hang_power_clean',
  'db_bench_press', 'db_shoulder_press', 'goblet_squat', 'kb_swing',
  'push_up', 'pull_up', 'bodyweight_squat', 'jump_squat',
  'mb_chest_pass', 'mb_overhead_throw', 'mb_scoop_toss',
] as const;
export type LiftId = typeof LIFT_IDS[number];

const L = (id: LiftId, name: string, family: LiftFamily, point: TrackPoint, o: Partial<Pick<Lift, 'ballistic' | 'mvt' | 'mvtSource' | 'minRomM' | 'loaded'>> = {}): Lift => ({
  id, name, family, point, ballistic: o.ballistic ?? false, mvt: o.mvt ?? null, mvtSource: o.mvtSource ?? null,
  minRomM: o.minRomM ?? 0.1, loaded: o.loaded ?? family !== 'body',
});

const SQUAT_MVT = 'general squat MVT 0.3 m/s; full-squat 1RM MPV 0.32 ± 0.03 (Sánchez-Medina 2017)';

export const LIFTS: Record<LiftId, Lift> = {
  back_squat: L('back_squat', 'Back squat', 'barbell', 'bar', { mvt: 0.3, mvtSource: SQUAT_MVT }),
  front_squat: L('front_squat', 'Front squat', 'barbell', 'bar', { mvt: 0.3, mvtSource: `${SQUAT_MVT} (assumption: the back squat's)` }),
  bench_press: L('bench_press', 'Bench press', 'barbell', 'bar', { mvt: 0.17, mvtSource: '1RM MPV 0.16 ± 0.04 (González-Badillo & Sánchez-Medina 2010)', minRomM: 0.08 }),
  deadlift: L('deadlift', 'Deadlift', 'barbell', 'bar', { mvt: 0.24, mvtSource: '1RM MV 0.24 ± 0.03 (Morán-Navarro et al. 2021)' }),
  overhead_press: L('overhead_press', 'Overhead press', 'barbell', 'bar', { mvt: 0.19, mvtSource: 'military press 1RM MV ≈ 0.19 (Balsalobre-Fernández et al. 2018; assumption: not re-read)' }),
  power_clean: L('power_clean', 'Power clean', 'barbell', 'bar', { ballistic: true, minRomM: 0.3 }),
  hang_power_clean: L('hang_power_clean', 'Hang power clean', 'barbell', 'bar', { ballistic: true, minRomM: 0.2 }),
  db_bench_press: L('db_bench_press', 'Dumbbell bench press', 'dbkb', 'wrist', { minRomM: 0.08 }),
  db_shoulder_press: L('db_shoulder_press', 'Dumbbell shoulder press', 'dbkb', 'wrist'),
  goblet_squat: L('goblet_squat', 'Goblet squat', 'dbkb', 'wrist'),
  kb_swing: L('kb_swing', 'Kettlebell swing', 'dbkb', 'wrist', { ballistic: true, minRomM: 0.25 }),
  push_up: L('push_up', 'Push-up', 'body', 'shoulder', { minRomM: 0.08 }),
  pull_up: L('pull_up', 'Pull-up', 'body', 'shoulder', { minRomM: 0.15 }),
  bodyweight_squat: L('bodyweight_squat', 'Bodyweight squat', 'body', 'hip'),
  jump_squat: L('jump_squat', 'Jump squat', 'body', 'hip', { ballistic: true }),
  mb_chest_pass: L('mb_chest_pass', 'Med-ball chest pass', 'medball', 'wrist', { ballistic: true }),
  mb_overhead_throw: L('mb_overhead_throw', 'Med-ball overhead throw', 'medball', 'wrist', { ballistic: true }),
  mb_scoop_toss: L('mb_scoop_toss', 'Med-ball scoop toss', 'medball', 'wrist', { ballistic: true }),
};

export const isLiftId = (x: unknown): x is LiftId => typeof x === 'string' && (LIFT_IDS as readonly string[]).includes(x);
export const liftsIn = (family: LiftFamily): Lift[] => LIFT_IDS.map((id) => LIFTS[id]).filter((l) => l.family === family);

// ── velocity zones ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The default zone set: Mann (2016) after Jovanović & Flanagan (2014), on mean concentric velocity. A coaching heuristic,
 * not a measurement (docs/VBT-BENCHMARK.md §2). Colours are the app's palette.
 */
export const ZONE_IDS = ['absolute_strength', 'accelerative_strength', 'strength_speed', 'speed_strength', 'starting_strength'] as const;
export type ZoneId = typeof ZONE_IDS[number];

export interface Zone { id: ZoneId; name: string; lo: number; hi: number; color: string }

export const ZONES: Record<ZoneId, Zone> = {
  absolute_strength: { id: 'absolute_strength', name: 'Absolute strength', lo: 0, hi: 0.5, color: '#FF4D8D' },
  accelerative_strength: { id: 'accelerative_strength', name: 'Accelerative strength', lo: 0.5, hi: 0.75, color: '#FF7A2F' },
  strength_speed: { id: 'strength_speed', name: 'Strength-speed', lo: 0.75, hi: 1.0, color: '#FFD700' },
  speed_strength: { id: 'speed_strength', name: 'Speed-strength', lo: 1.0, hi: 1.3, color: '#00FF9D' },
  starting_strength: { id: 'starting_strength', name: 'Starting strength', lo: 1.3, hi: 3, color: '#00E5FF' },
};

export const isZoneId = (x: unknown): x is ZoneId => typeof x === 'string' && (ZONE_IDS as readonly string[]).includes(x);

/** The zone a mean concentric velocity falls in. */
export function zoneOf(mcv: number): Zone {
  for (const id of ZONE_IDS) { const z = ZONES[id]; if (mcv < z.hi) return z; }
  return ZONES.starting_strength;
}

/** Is a velocity inside a prescribed zone? */
export const inZone = (mcv: number, z: ZoneId): boolean => mcv >= ZONES[z].lo && mcv < ZONES[z].hi;
