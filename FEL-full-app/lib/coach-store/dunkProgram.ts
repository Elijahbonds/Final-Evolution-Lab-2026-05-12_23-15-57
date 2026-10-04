/**
 * DRAFT. Placeholder dunking masters so the player has a shape.
 * Not clinical content. Elijah replaces the cues before this is sold as finished coaching.
 */
export interface DunkDrill {
  id: string;
  name: string;
  cue: string;
  adultOnly: boolean;
}

export interface DunkDay {
  day: number;
  title: string;
  drills: DunkDrill[];
}

export interface DunkWeek {
  week: number;
  title: string;
  days: DunkDay[];
}

const easy = (id: string, name: string, cue: string): DunkDrill => ({ id, name, cue, adultOnly: false });
const loaded = (id: string, name: string, cue: string): DunkDrill => ({ id, name, cue, adultOnly: true });

function week(n: number, title: string, a: DunkDrill, b: DunkDrill): DunkWeek {
  return {
    week: n,
    title,
    days: [1, 2, 3].map((day) => ({
      day,
      title: `Week ${n} day ${day}`,
      drills: day === 3 ? [a] : [a, b],
    })),
  };
}

export const DUNK_PROGRAM_STATUS = 'DRAFT' as const;

export const DUNK_WEEKS: DunkWeek[] = [
  week(1, 'Landing quietly', easy('stick', 'Stick the landing', 'Land soft and still.'), easy('pogo', 'Easy pogos', 'Small and quiet.')),
  week(2, 'Rhythm', easy('skip', 'A-skip', 'Light feet.'), easy('bound', 'Easy bounds', 'Reach, then land.')),
  week(3, 'Approach', easy('penult', 'Penultimate step', 'Longer last-but-one step.'), easy('plant', 'Plant and go up', 'Plant under you.')),
  week(4, 'One-foot', easy('one', 'One-foot takeoff', 'Drive the knee.'), loaded('loaded-jump', 'Loaded jump', 'A light load. Adults only.')),
  week(5, 'Two-foot', easy('gather', 'Gather', 'Gather into two feet.'), easy('vert', 'Vertical pop', 'Arms then hips.')),
  week(6, 'Rim path', easy('touch', 'Touch drill', 'Touch the mark and land.'), loaded('max-effort', 'Max-effort jump', 'All-out. Adults only.')),
  week(7, 'Put it together', easy('approach-dunk', 'Approach rehearsal', 'Full approach, no max jump.'), easy('stick-2', 'Stick again', 'Same quiet landing.')),
  week(8, 'Re-screen week', easy('flow', 'Full flow', 'The approach you own.'), easy('breath', 'Down-regulate', 'Long exhales after.')),
];

export const DUNK_RESCREEN_DAYS = [14, 28, 42, 56] as const;
