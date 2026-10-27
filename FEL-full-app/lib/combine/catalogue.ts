// lib/combine/catalogue.ts — COMBINE-DAY (2026-10-25): the fixed station catalogue a coach builds a combine from.
//
// Owner: "team tryout / combine day — a coach runs a measured combine through the Mirror: jump, sprint, agility and
// skills, and gets a ranked report". Every station says HOW its number is taken, and nothing claims more than that:
//
//   cmj       the standing jump, read live by the jump check's own code (./jumpTake.ts over lib/assess calibrateFront,
//             detectFlights and gradeT5 with JUMP-PRO's re-timing). A camera estimate. No accuracy claim (owner: none
//             until the force-plate pilot), so no ± is ever shown.
//   approach  the approach jump from a side-on video the coach's phone took (lib/jump/sideView.ts analyseSideClip, the
//             existing reader). Touch height only when this athlete's standing reach was read in this combine
//             (lib/jump/reach.ts readReach + touchHeight). The video is read on the phone and never uploaded.
//   agility   HAND-TIMED by default. SPRINT-SPEED (2026-10-25): the coach may set the 5-10-5 to the CAMERA instead
//             (lib/sprint/agility.ts, beta); the 3-cone and the shuffle stay hand-timed.
//   sprint    HAND-TIMED stopwatch entry by default. SPRINT-SPEED (2026-10-25): the coach may set a sprint station to the
//             CAMERA (lib/sprint/timing.ts, the phone on the finish line). Camera times are estimates and say "camera";
//             a station's `timing: 'camera'` is the choice, and each attempt keeps how it was timed (types.ts Attempt).
//   skill     an existing Mirror drill (lib/drills DRILLS, run by app/play/drills' DrillLive) scored by its own
//             DrillRunner: the share of targets hit on the beat. No new scorer.
//
// Pure, client-safe.
import { DRILLS } from '@/lib/drills/drills';
import { drillTargetCount } from '@/lib/drills/chart';
import { timingChoices } from '@/lib/sprint/cameraSprint';

export type StationKind = 'cmj' | 'approach' | 'agility' | 'sprint' | 'skill';
export const STATION_KINDS: readonly StationKind[] = ['cmj', 'approach', 'agility', 'sprint', 'skill'];

/** How the number is taken: the live camera, a video the phone took, or the coach's own stopwatch / count. */
export type StationMethod = 'camera' | 'video' | 'hand';
export type StationUnit = 'cm' | 's' | 'pct';

export interface StationVariant { id: string; label: string }

export interface StationDef {
  kind: StationKind;
  label: string;
  method: StationMethod;
  unit: StationUnit;
  better: 'higher' | 'lower';
  /** Values are compared (and tied) at this many decimals: what the station can honestly tell apart. */
  decimals: number;
  /** What the coach reads under the station's name. */
  how: string;
  variants: readonly StationVariant[];
  /** The best-of default. */
  defaultAttempts: number;
}

/** (new) The most attempts a station may ask for. */
export const MAX_ATTEMPTS = 5;
/** (new) The most stations one combine may run. */
export const MAX_STATIONS = 8;

/** The drills that are a warm-up, not a test: never offered as a station. */
const NOT_A_TEST = new Set(['wake-up']);

/** The Mirror drills that score something (a drill whose phases are all guided has no targets to hit), less the warm-up. */
export const SKILL_DRILLS: readonly StationVariant[] = DRILLS
  .filter((d) => drillTargetCount(d) > 0 && !NOT_A_TEST.has(d.id))
  .map((d) => ({ id: d.id, label: d.name }));

export const STATIONS: Record<StationKind, StationDef> = {
  cmj: {
    kind: 'cmj', label: 'Vertical jump', method: 'camera', unit: 'cm', better: 'higher', decimals: 1,
    how: 'Standing jump, hands on hips, read live by the jump check. A camera estimate.',
    variants: [{ id: 'standing', label: 'Standing (countermovement)' }], defaultAttempts: 3,
  },
  approach: {
    kind: 'approach', label: 'Approach jump', method: 'video', unit: 'cm', better: 'higher', decimals: 1,
    how: 'Run-up jump read from a side-on video on this phone. Touch height when the athlete’s standing reach was read here.',
    variants: [{ id: 'approach', label: 'Approach (side-on video)' }], defaultAttempts: 3,
  },
  agility: {
    kind: 'agility', label: 'Agility', method: 'hand', unit: 's', better: 'lower', decimals: 2,
    how: 'Hand-timed by the coach. The camera does not time this drill.',
    variants: [
      { id: 'pro-agility', label: '5-10-5 pro agility' },
      { id: 'three-cone', label: '3-cone (L-drill)' },
      { id: 'lateral-shuffle', label: 'Lateral shuffle' },
    ],
    defaultAttempts: 2,
  },
  sprint: {
    kind: 'sprint', label: 'Sprint', method: 'hand', unit: 's', better: 'lower', decimals: 2,
    how: 'Hand-timed stopwatch by the coach. The camera does not time sprints.',
    variants: [
      { id: '10yd', label: '10 yd' }, { id: '20yd', label: '20 yd' }, { id: '40yd', label: '40 yd' },
      { id: '10m', label: '10 m' }, { id: '20m', label: '20 m' }, { id: '30m', label: '30 m' },
    ],
    defaultAttempts: 2,
  },
  skill: {
    kind: 'skill', label: 'Skill drill', method: 'camera', unit: 'pct', better: 'higher', decimals: 0,
    how: 'A Mirror drill on the camera, scored by the drill itself: targets hit on the beat. A camera estimate.',
    variants: SKILL_DRILLS, defaultAttempts: 1,
  },
};

/** A station as a combine runs it. `id` is `${kind}:${variant}`, so one combine never runs the same station twice. */
export interface StationConfig {
  id: string;
  kind: StationKind;
  variant: string;
  attempts: number;
  /** SPRINT-SPEED: a sprint or 5-10-5 station the coach set to the camera (absent = hand-timed). */
  timing?: 'camera';
}

export const stationId = (kind: StationKind, variant: string): string => `${kind}:${variant}`;

export function isStationKind(v: unknown): v is StationKind {
  return typeof v === 'string' && (STATION_KINDS as readonly string[]).includes(v);
}

/** A station from untrusted input (a request body, a stored draft), or null. */
export function parseStation(raw: unknown): StationConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isStationKind(r.kind) || typeof r.variant !== 'string') return null;
  const def = STATIONS[r.kind];
  if (!def.variants.some((v) => v.id === r.variant)) return null;
  const n = typeof r.attempts === 'number' && Number.isFinite(r.attempts) ? Math.round(r.attempts) : def.defaultAttempts;
  const camera = r.timing === 'camera' && (r.kind === 'sprint' || r.kind === 'agility') && timingChoices(r.kind, r.variant).includes('camera');
  return { id: stationId(r.kind, r.variant), kind: r.kind, variant: r.variant, attempts: Math.min(MAX_ATTEMPTS, Math.max(1, n)), ...(camera ? { timing: 'camera' as const } : {}) };
}

/** Stations from untrusted input: valid ones only, each once, at most MAX_STATIONS. */
export function parseStations(raw: unknown): StationConfig[] {
  if (!Array.isArray(raw)) return [];
  const out: StationConfig[] = [];
  for (const x of raw) {
    const s = parseStation(x);
    if (s && !out.some((o) => o.id === s.id) && out.length < MAX_STATIONS) out.push(s);
  }
  return out;
}

export function variantLabel(s: Pick<StationConfig, 'kind' | 'variant'>): string {
  return STATIONS[s.kind].variants.find((v) => v.id === s.variant)?.label ?? s.variant;
}

/** "Sprint · 40 yd (hand-timed)": every hand-timed station says so wherever its name is shown; a camera one "(camera)". */
export function stationName(s: Pick<StationConfig, 'kind' | 'variant'> & { timing?: StationConfig['timing'] }): string {
  const def = STATIONS[s.kind];
  const v = def.variants.length > 1 ? ` · ${variantLabel(s)}` : '';
  return `${def.label}${v}${def.method === 'hand' ? (s.timing === 'camera' ? ' (camera)' : ' (hand-timed)') : ''}`;
}

const IN = 2.54;
/** A value in the station's own words: inches first for a jump (the readiness check's convention), seconds, or a %. */
export function formatValue(kind: StationKind, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const def = STATIONS[kind];
  if (def.unit === 'cm') return `${(v / IN).toFixed(1)} in`;
  if (def.unit === 's') return `${v.toFixed(2)} s`;
  return `${Math.round(v)}%`;
}

/** The unit as a CSV header names it. */
export const UNIT_LABEL: Record<StationUnit, string> = { cm: 'cm', s: 's', pct: '%' };

/** Hand entry bounds (seconds): anything outside is a typo, not a time. (new) */
export const HAND_TIME_RANGE: Record<'agility' | 'sprint', readonly [number, number]> = { agility: [2, 30], sprint: [0.8, 15] };
