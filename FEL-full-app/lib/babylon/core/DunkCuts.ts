// DunkCuts — the made dunk's show (DUNK MOTION phase 12, 2026-09-24).
//
// Owner, round of decisions: "lets add more effects to the dunks, maybe a triple camera cut after the dunk for dramatic effect" →
// the triple cut on MADE dunks, skippable, ~2 s, in the style of a contest SHOW (broadcast cameras, phone flashes in the stands, the
// crowd and an announcer, pyro on the big ones), with the rim / net / glass reacting, a speed ramp into the impact and a sound gap
// before it, and a poster freeze-frame you can keep. Then: "cinematic emotes after the dunks … dunkers like Brandon Ruffin".
//
// The pure half: which cameras, how long, what the announcer says, which celebration the dunker throws. The mode plays it
// (DunkReplayCam.playCuts replays the RECORDED POSE, not a re-fly of the clips — the flush as it actually happened, three times).

export type CutId = 'baseline' | 'profile' | 'phone';
export interface CutSpec {
  id: CutId;
  /** Seconds of the recording before the iron contact, and after it. */
  lead: number; tail: number;
  /** Playback speed (1 = real time). */
  speed: number;
  /** The lower third while it plays. */
  label: string;
}
/** THE TRIPLE CUT: the same flush, three angles, each a touch slower than the last — under the rim looking up, level with the iron
 *  from the side, and a phone held up in the stands behind him. ~2.1 s in all. */
export const TRIPLE_CUT: readonly CutSpec[] = [
  { id: 'baseline', lead: 0.5, tail: 0.1, speed: 0.85, label: 'UNDER THE RIM' },
  { id: 'profile', lead: 0.45, tail: 0.1, speed: 0.8, label: 'ON THE IRON' },
  { id: 'phone', lead: 0.4, tail: 0.15, speed: 0.75, label: 'FROM THE STANDS' },
];
/** The poster freeze on the contact frame at the end of a big one. */
export const POSTER_SEC = 0.9;
export const cutSec = (c: CutSpec): number => (c.lead + c.tail) / c.speed;
export const tripleCutSec = (): number => TRIPLE_CUT.reduce((s, c) => s + cutSec(c), 0);

type P3 = { x: number; y: number; z: number };
export interface CutCam { pos: P3; target: P3; fov: number; shake: number }
/**
 * Where each camera sits, from the rim and the way the dunker came at it (`approach`: his horizontal direction of travel, toward
 * the rim). `side` is the approach turned a quarter to the right.
 */
export function cutCamera(id: CutId | 'poster', rim: P3, body: P3, approach: { x: number; z: number }): CutCam {
  const n = Math.hypot(approach.x, approach.z) || 1, ax = approach.x / n, az = approach.z / n;
  const sx = -az, sz = ax;   // the approach's right
  const at = (s: number, up: number, along: number): P3 => ({ x: rim.x + sx * s + ax * along, y: rim.y + up, z: rim.z + sz * s + az * along });
  const mid = (a: P3, b: P3, k: number): P3 => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });
  const chest = { x: body.x, y: body.y + 1.3, z: body.z };
  switch (id) {
    case 'baseline': return { pos: at(1.6, -2.35, 0.9), target: mid(chest, rim, 0.45), fov: 0.95, shake: 0 };        // under the rim, looking up at him
    case 'profile': return { pos: at(3.6, -0.1, -0.3), target: mid(chest, rim, 0.6), fov: 0.72, shake: 0 };           // level with the iron, side on
    case 'phone': return { pos: at(-2.6, -1.1, -4.2), target: mid(chest, rim, 0.5), fov: 0.62, shake: 0.012 };        // a phone up in the stands behind him
    case 'poster': return { pos: at(1.3, -2.6, 0.6), target: chest, fov: 1.0, shake: 0 };                              // the poster: low and wide, under him
  }
}

/** The bands the calls and celebrations read (the mode passes JudgePanel's). */
export interface Bands { eruption: number; approval: number }
const pick = <T>(xs: readonly T[], seed: number): T => xs[Math.abs(Math.floor(seed)) % xs.length];
/** A stable seed from a string (so the same dunk gets the same call — tests, and no flicker if it is asked twice). */
export function seedOf(s: string): number { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

/** THE ANNOUNCER: one line for the make — the bigger the card, the louder the call. */
export function announcerCall(o: { total: number; name: string; bands: Bands; seen?: boolean; dunker?: string; seed?: number }): string {
  const seed = o.seed ?? seedOf(`${o.name}:${o.total}`);
  const who = o.dunker ? `${o.dunker}! ` : '';
  if (o.seen) return `${who}WE HAVE SEEN THAT ONE BEFORE…`;
  if (o.total >= o.bands.eruption) return `${who}${pick(['ARE YOU KIDDING ME?!', 'OH MY GOODNESS!', "IT'S OVER!", 'GET HIM OFF THE COURT!', 'THE BUILDING IS SHAKING!'], seed)} ${o.name}!`;
  if (o.total >= o.bands.approval) return `${who}${pick(['WHAT A FINISH!', 'HAMMERED IT!', 'FILTHY!', 'HE MEANT THAT ONE!'], seed)} ${o.name}.`;
  return `${who}${pick(['HE GETS IT DOWN.', 'SOLID.', 'THROWN DOWN.'], seed)} ${o.name}.`;
}

// ── the celebrations (anim/authored/dunkCelebrations) ────────────────────────────────────────────────────────────────
export type CelebId = 'spiderman' | 'itsover' | 'roar' | 'toosmall' | 'armsup';
export const CELEBRATIONS: Record<CelebId, { clip: string; label: string; by?: string }> = {
  spiderman: { clip: 'dunk_celeb_spiderman_splits', label: 'THE SPIDER-MAN SPLITS', by: 'Brandon Ruffin' },
  itsover: { clip: 'dunk_celeb_its_over', label: "IT'S OVER", by: 'Vince Carter' },
  roar: { clip: 'dunk_celeb_roar', label: 'THE ROAR' },
  toosmall: { clip: 'dunk_celeb_too_small', label: 'TOO SMALL' },
  armsup: { clip: 'dunk_celebrate_big', label: 'ARMS UP' },
};
/** The d-pad throws your own after the landing: up the roar, right "it's over", down the Spider-Man splits, left too small. */
export const CELEB_BY_DPAD: Record<'up' | 'down' | 'left' | 'right', CelebId> = { up: 'roar', right: 'itsover', down: 'spiderman', left: 'toosmall' };
/** Each rival celebrates like himself (DunkRivals' temperaments): the steady one barely does, the showmen go to the floor. */
export const RIVAL_CELEB: Record<string, CelebId> = { cass: 'armsup', ty: 'roar', pilot: 'itsover', zo: 'toosmall', stack: 'spiderman' };

/** Which celebration: the one you called, else a rival's own (on a real make), else the card's — a big one earns the floor show,
 *  a good one a roar or a pat on the head, an ordinary make nothing but the landing. */
export function pickCelebration(o: { total: number; bands: Bands; chosen?: CelebId | null; rivalId?: string | null; seed?: number }): CelebId | null {
  if (o.chosen) return o.chosen;
  if (o.rivalId) return o.total >= o.bands.approval ? (RIVAL_CELEB[o.rivalId] ?? 'armsup') : null;
  const seed = o.seed ?? o.total;
  if (o.total >= o.bands.eruption) return pick(['spiderman', 'itsover'] as const, seed);
  if (o.total >= o.bands.approval) return pick(['roar', 'toosmall', 'armsup'] as const, seed);
  return null;
}
