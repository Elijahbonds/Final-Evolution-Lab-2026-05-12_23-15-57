// championship — the cup that turns seven separate courses into a season.
//
// THE GAP THE DEPTH PASS FOUND, measured rather than guessed: the racing library has seven kart courses, five aero
// circuits, eight vehicles, a rival field, contact, items, drift, slipstream and rubber-banding — and nothing that
// connects two races to each other. Every course is an island with a medal on it. The genre's spine since Mario Kart
// has been the CUP: four tracks, points per finish, standings that survive a bad race, and a champion at the end.
// Without it a racing mode is a collection of time trials however good each one feels.
//
// Two things this gets right that a naive points table does not:
//
//   1. A BAD RACE IS NOT THE END OF THE CUP. Points, not elimination, and the gap to first is always shown — the
//      reason anybody starts round three. Finishing last still scores.
//   2. THE STANDINGS ARE HONEST ABOUT TIES. Equal points are broken by best finishes (more wins, then more seconds),
//      the way real series do it, rather than by whoever the sort happened to put first.
//
// Pure: results in, standings out. No Babylon, no storage — the mode persists the cup, this decides it.

export interface CupCourse { id: string; name: string }

export interface Cup {
  id: string;
  name: string;
  /** Kart and aero keep their own cups; the shape is shared. */
  discipline: 'kart' | 'aero';
  courses: CupCourse[];
  /** Flavour for the standings screen. */
  sub?: string;
}

/** Points per finishing position, first place first. Beyond the table, everyone who finishes scores 1. */
export const POINTS = [15, 12, 10, 8, 6, 4, 2] as const;
/** A DNF scores nothing, but it does not end the cup. */
export const DNF_POINTS = 0;

export function pointsFor(place: number, finished: boolean): number {
  if (!finished) return DNF_POINTS;
  if (place < 1) return 0;
  return POINTS[place - 1] ?? 1;
}

export interface RaceResult {
  courseId: string;
  /** 1 = won. */
  place: number;
  finished: boolean;
  /** Milliseconds, for the tie-break of last resort and the cup's own record. */
  timeMs: number;
  racerId: string;
}

export interface Standing {
  racerId: string;
  points: number;
  /** Finishes by position, index 0 = wins. Used to break ties the way a real series does. */
  finishes: number[];
  bestPlace: number | null;
  races: number;
  /** Points behind the leader. 0 for the leader — the number that keeps somebody racing. */
  behind: number;
}

/** Sort key: points, then most wins, then most seconds, and so on down the table. */
function better(a: Standing, b: Standing): number {
  if (a.points !== b.points) return b.points - a.points;
  const depth = Math.max(a.finishes.length, b.finishes.length);
  for (let i = 0; i < depth; i++) {
    const ai = a.finishes[i] ?? 0, bi = b.finishes[i] ?? 0;
    if (ai !== bi) return bi - ai;
  }
  return a.racerId.localeCompare(b.racerId);
}

export function standingsFor(results: readonly RaceResult[]): Standing[] {
  const by = new Map<string, Standing>();
  for (const r of results) {
    const s = by.get(r.racerId) ?? { racerId: r.racerId, points: 0, finishes: [], bestPlace: null, races: 0, behind: 0 };
    s.points += pointsFor(r.place, r.finished);
    s.races += 1;
    if (r.finished && r.place >= 1) {
      s.finishes[r.place - 1] = (s.finishes[r.place - 1] ?? 0) + 1;
      s.bestPlace = s.bestPlace == null ? r.place : Math.min(s.bestPlace, r.place);
    }
    by.set(r.racerId, s);
  }
  const rows = [...by.values()].sort(better);
  const lead = rows[0]?.points ?? 0;
  for (const r of rows) r.behind = lead - r.points;
  return rows;
}

export interface CupProgress {
  cup: Cup;
  /** Courses done, in the cup's own order. */
  done: string[];
  /** The next course, or null when the cup is finished. */
  next: CupCourse | null;
  round: number;
  rounds: number;
  standings: Standing[];
  complete: boolean;
  /** Only once the cup is finished. */
  champion: string | null;
  /** One line for the screen between races. */
  headline: string;
}

export function cupProgress(cup: Cup, results: readonly RaceResult[], meId: string): CupProgress {
  const inCup = results.filter((r) => cup.courses.some((c) => c.id === r.courseId));
  const done = cup.courses.filter((c) => inCup.some((r) => r.courseId === c.id && r.racerId === meId)).map((c) => c.id);
  const next = cup.courses.find((c) => !done.includes(c.id)) ?? null;
  const standings = standingsFor(inCup);
  const complete = next == null && done.length === cup.courses.length;
  const me = standings.find((s) => s.racerId === meId) ?? null;
  const champion = complete ? standings[0]?.racerId ?? null : null;

  const headline = complete
    ? champion === meId ? `${cup.name} — champion.` : `${cup.name} over. ${standings[0]?.racerId ?? 'Somebody else'} takes it.`
    : me == null ? `${cup.name} — ${cup.courses.length} rounds. First up: ${next?.name ?? ''}.`
    : me.behind === 0 ? `Leading the ${cup.name} after ${done.length}. Next: ${next?.name ?? ''}.`
    : `${me.behind} points off the lead with ${cup.courses.length - done.length} to go. Next: ${next?.name ?? ''}.`;

  return {
    cup, done, next, round: done.length + (complete ? 0 : 1), rounds: cup.courses.length,
    standings, complete, champion, headline,
  };
}

/** THE CUPS. Built from courses that already exist — the pass adds the season, not the tracks. */
export const KART_CUPS: Cup[] = [
  {
    id: 'boardwalk-cup', name: 'BOARDWALK CUP', discipline: 'kart',
    sub: 'Three at sea level. Learn the boost before the mountain.',
    courses: [
      { id: 'boardwalk-loop', name: 'BOARDWALK LOOP' },
      { id: 'harbor-run', name: 'HARBOR RUN' },
      { id: 'stadium-oval', name: 'STADIUM OVAL' },
    ],
  },
  {
    id: 'summit-cup', name: 'SUMMIT CUP', discipline: 'kart',
    sub: 'Height, weather and a climb. The cup that decides the season.',
    courses: [
      { id: 'rooftop-circuit', name: 'ROOFTOP CIRCUIT' },
      { id: 'alpine-descent', name: 'ALPINE DESCENT' },
      { id: 'summit-climb', name: 'SUMMIT CLIMB' },
      { id: 'orbit-station', name: 'ORBIT STATION' },
    ],
  },
];

export const AERO_CUPS: Cup[] = [
  {
    id: 'canyon-cup', name: 'CANYON CUP', discipline: 'aero',
    sub: 'Rock, water and a cave. Thread all three.',
    courses: [
      { id: 'redrock-canyon', name: 'REDROCK CANYON' },
      { id: 'coconut-cove', name: 'COCONUT COVE' },
      { id: 'frostbite-caverns', name: 'FROSTBITE CAVERNS' },
    ],
  },
  {
    id: 'skyline-cup', name: 'SKYLINE CUP', discipline: 'aero',
    sub: 'Fire and neon. The two that punish a wide line.',
    courses: [
      { id: 'ember-caldera', name: 'EMBER CALDERA' },
      { id: 'neon-skyline', name: 'NEON SKYLINE' },
    ],
  },
];

export const ALL_CUPS: Cup[] = [...KART_CUPS, ...AERO_CUPS];

export function cupById(id: string): Cup | null {
  return ALL_CUPS.find((c) => c.id === id) ?? null;
}
