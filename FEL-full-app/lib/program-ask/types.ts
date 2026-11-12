// lib/program-ask/types.ts — PROGRAM-ASK (2026-11-02): the shapes of "tell it what you have, get a whole program".
//
// Owner, 2026-11-02: "The AI should be able to give me an entire workout program if I tell it, all I have is a band. I can
// get full body programming properly etc." A plain-words ask is read into a ProgramRequest (./request.ts, deterministic,
// always on), and the request is built into a BuiltProgram (./build.ts, rule-based) from REAL library entries only
// (lib/library). The optional AI layer (./ai.ts) may only pick between entries the builder already found equivalent and
// write the "why this plan" paragraph; it never sets a dose.
//
// Pure. Client-safe (the page renders these).
import type { WaveBand } from '@/lib/coach/templates/waves';
import type { WeekDayName } from '@/lib/coach/offDay';
import type { EquipmentId, Joint, LevelId, SportTag } from '@/lib/library/vocab';

export type ProgramGoal = 'full-body' | 'strength' | 'muscle' | 'conditioning' | 'athletic' | 'mobility' | 'sport';

/** Youth rules (lib/coach/taxonomy.ts youthRules) apply to 'teen' and 'child'; 'child' (under 13) is stricter still. */
export type AgeBand = 'adult' | 'teen' | 'child';

export type BandTension = 'light' | 'medium' | 'heavy';

export interface ProgramRequest {
  /** What the person owns beyond their body (a wall and a floor are always there). [] = nothing. */
  equipment: EquipmentId[];
  /** The band's tension when they said it; null = not said (read as one medium band: an assumption, said so). */
  tension: BandTension | null;
  /** PROGRAM-ASK-2: the band SET when they have more than one ("light, medium and heavy bands"); [] = one band. */
  bands: BandTension[];
  goal: ProgramGoal;
  sport: SportTag | null;
  /** 2–6. */
  days: number;
  /** Minutes per session, warm-up and cool-down included: 20–90. */
  minutes: number;
  level: LevelId;
  /** Plan length: 4–12. */
  weeks: number;
  age: AgeBand;
  /** "Knee-friendly", "easy on my back": a preference, never an injury (an injury stops the build: ./request.ts). */
  lowLoad: Joint[];
}

/** What the person typed, field by field, versus what was filled in (an assumption, said so). */
export type RequestField = 'equipment' | 'tension' | 'bands' | 'goal' | 'days' | 'minutes' | 'level' | 'weeks' | 'age';

export interface ProgramChip {
  field: RequestField;
  label: string;
  /** Not what they said: FEL filled it in (shown dimmer, and said in `assumptions`). */
  assumed: boolean;
  /** A number chip (days, minutes, weeks) gets − and +: one tap changes it. */
  step?: { value: number; min: number; max: number; by: number };
  /** A choice chip: the options, one tap each. */
  options?: { value: string; label: string }[];
  value: string;
  /** The account's age rules decide this one: it cannot be edited here. */
  locked?: boolean;
}

export interface ProgramAskRead {
  question: string;
  request: ProgramRequest;
  said: Partial<Record<RequestField, boolean>>;
  chips: ProgramChip[];
  /** Every guess, in plain words, each beginning "assumption:" in the report (the page shows them without the prefix). */
  assumptions: string[];
  /** Pain or injury words: the build stops and FEL's existing "see a professional" lines show instead. */
  injury: { flagged: boolean; words: string[] };
  /** The question asks for a program at all (the library Ask uses this to point here). */
  wantsProgram: boolean;
}

// ── the program ────────────────────────────────────────────────────────────────────────────────────────────────────

export type SlotId =
  | 'knee' | 'hinge' | 'single' | 'hpush' | 'hpull' | 'vpush' | 'vpull' | 'antiExt' | 'antiRot'
  | 'calf' | 'biceps' | 'triceps' | 'rear' | 'power' | 'speed' | 'cond' | 'mobility';

/** The volume groups weekly sets are counted in. */
export type VolumeGroup = 'knee' | 'hip' | 'push' | 'pull' | 'trunk';

export type DayFocus = 'full' | 'upper' | 'lower' | 'push' | 'pull' | 'legs' | 'conditioning' | 'athletic' | 'mobility';

export interface ProgramItem {
  /** Stable across weeks: "<dayKey>/<blockIndex>/<itemIndex>". */
  key: string;
  slot: SlotId;
  /** "A1", "B2", "C" … as the session shows it. */
  label: string;
  exId: string;
  name: string;
  sets: number;
  /** A counted dose: the target reps this week ("10", "8 each side"). null for a timed item. */
  reps: string | null;
  /** A timed dose: seconds of work per set. */
  workSeconds: number | null;
  perSide: boolean;
  /** Rest after this item's set (0 inside a pair or circuit, except after its last member). */
  restSeconds: number;
  /** Down-pause-up-pause, the library's format ("3-1-1-0"), when the tempo matters this week. */
  tempo: string | null;
  effort: WaveBand;
  /** "3–4 reps left": the band's reps-in-reserve words (lib/coach/taxonomy.ts EFFORT_BANDS). */
  effortWords: string;
  /** The day's key lift (the build weeks add its extra set). */
  isKey: boolean;
  /** Foot contacts per set (jump work only). */
  contacts: number | null;
  impact: boolean;
  setup: string;
  cue: string | null;
  /** One plain line about this week's version (a harder variation, a band tip, a stand-in). */
  note: string | null;
  /** Where the band goes and where to stand, in plain words (band exercises only). */
  bandSetup: string | null;
  /** The next session's move when a set ends with MORE reps left than the effort word: band tension first, then tempo
   *  or a pause, then the next library rung by name. */
  harder: string | null;
  /** …and when the reps fall short: the easier library entry by name, or a closer stance. */
  easier: string | null;
  /** Started one rung above the person's level because the easier version cannot reach the effort asked (adults). */
  harderStart: boolean;
  /** The base entry this week's exercise came from (a tempo week plays a variant of it). */
  baseId: string;
}

export interface ProgramBlock {
  label: string;
  kind: 'single' | 'pair' | 'circuit' | 'filler';
  items: ProgramItem[];
}

export interface TimedStep { id: string; name: string; seconds: number; cue: string | null; dose: string | null }

export interface ProgramDay {
  /** 'A', 'B', 'C' … the day's template; days with the same key repeat the same session. */
  key: string;
  /** The session instance id the device marks done: "w2:d3". */
  id: string;
  day: WeekDayName;
  focus: DayFocus;
  title: string;
  warmup: TimedStep[];
  blocks: ProgramBlock[];
  cooldown: TimedStep[];
  /** The estimate (./time.ts), whole minutes. */
  minutes: number;
  seconds: number;
}

export interface ProgramWeek {
  n: number;
  /** 1-based block (a block ends with its lighter week and a checkpoint). */
  block: number;
  weekInBlock: number;
  label: string;
  lighter: boolean;
  /** The checkpoint is read after this week's sessions. */
  checkpoint: boolean;
  days: ProgramDay[];
}

export interface WeeklyVolume { group: VolumeGroup; range: [number, number]; perWeek: number[] }

export interface BuiltProgram {
  /** Stable for the same request and picks: what the device saves under. */
  id: string;
  title: string;
  /** ≤ 50 words, above the fold. */
  summary: string;
  request: ProgramRequest;
  weeks: ProgramWeek[];
  /** Stand-ins and limits, in plain words ("No vertical pull fits a band-free home: … stands in."). */
  notes: string[];
  volume: WeeklyVolume[];
  /** The protocol gate as the build read it: jumps only when open. */
  jumps: { allowed: boolean; line: string | null };
  /** Exercises the AI may choose between (the builder found them equivalent). Key: "<dayKey>/<slot>/<n>". */
  choices: { key: string; slot: SlotId; chosen: string; options: { id: string; name: string }[] }[];
  /** The "why this plan" paragraph: FEL's own, or the AI's when the switch is on and it passed every guard. */
  why: string;
  whyBy: 'fel' | 'ai';
  /** The library ids the plan plays (the page maps them to demo loops). */
  exerciseIds: string[];
}
