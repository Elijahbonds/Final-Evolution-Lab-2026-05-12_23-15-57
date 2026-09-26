// FEL's tags for the Blueprint knowledge base (MIRROR-COACH P2, 2026-09-25).
//
// WHY THE TAGS LIVE HERE AND NOT IN THE TABLE. The P2 schema contract gives the three tags (pattern, brace mode, skill
// layer) to ProgramExercise — the prescribable catalogue — and leaves the KB table (prisma Exercise) as it was. So the
// KB's tags are FEL data in code, keyed by the seed's slug (Exercise.slug is @unique and scripts/seed.ts upserts by
// it, so the key survives a re-seed and an admin rename). The "Add to my catalogue" bridge
// (lib/coach/catalogueServer.ts copyKbToCatalogue) stamps them onto the copy, and GET /api/coach/catalogue shows them
// on the Exercises tab. kbTags.test.ts fails if a slug in the seed has no row here.
//
// HOW THEY WERE CHOSEN — FEL's judgement, one line per row in `why`, read off each item's own cues and dosage in the
// seed (scripts/seed.ts:73-101), against the pattern and brace definitions in lib/coach/catalogue.ts and the skill
// layers the owner's Playbook chapters give (lib/coach/taxonomy.ts SKILL_LAYERS). Three rules:
//   1. null is allowed and used. A tag that would be a guess stays empty, with the reason in `why` — an untagged row
//      is honest; a wrongly tagged one sends the warm-up generator (P6) and the pattern-coverage check (P8) the wrong
//      way. The 5-second lockdown takes the pattern of whatever position the coach picks; the integrated set asks for
//      both brace modes; no Playbook chapter teaches the box-out.
//   2. `category` is the catalogue's body-region word the copy lands under, which is also what the Mirror's matcher
//      (lib/coach/mirrorToProgram.ts WANTED) searches: the breath items land in `breath`, so the rib-angle finding
//      that wants "breath" finds them.
//   3. `tempo` is set where the schema default 3-1-1-0 (three seconds down, a pause, up, no pause) would be wrong:
//      "0-0-0-0" means no tempo — the dose is time or contacts, as the KB's own dosage says.
//
// `cues` overrides the bridge's sentence split only where the KB's cue text is a sequence or a paragraph that does not
// break into three short cues; they are the KB item's own instructions, shortened. `prescribable: false` marks an
// assessment: the posture audit is a coach's look at an athlete, not a set anybody does, and FEL's camera screen is
// the prescribing assessment (P3). The bridge refuses it.
import type { BraceMode, MovementPattern } from '@/public/_prisma/client';
import type { KbTagsLike } from './catalogue';

export interface KbTags extends KbTagsLike {
  pattern: MovementPattern | null;
  braceMode: BraceMode | null;
  skillLayer: string | null;
  category: string;
  tempo?: string;
  cues?: readonly string[];
  prescribable?: boolean;
  /** FEL's reason, one line. */
  why: string;
}

const NO_TEMPO = '0-0-0-0';

export const KB_TAGS: Record<string, KbTags> = {
  // Breath & Pressure
  'breath-reset': {
    pattern: 'breath', braceMode: 'none', skillLayer: 'cylinder', category: 'breath', tempo: NO_TEMPO,
    cues: ['Three easy breaths to notice where the air goes', 'Ribs widen out to the sides, the chest stays quiet', 'A small bounce through the floor, a vibration, not a jump'],
    why: 'A breath drill first and last; the 5-second ground press at its end is a beat of the reset, not a loaded brace.',
  },
  'diaphragm-360': {
    pattern: 'breath', braceMode: 'none', skillLayer: 'cylinder', category: 'breath', tempo: NO_TEMPO,
    why: 'Breathing into the hands around the lower ribs: the Playbook ch2 pressure-cylinder skill, no load.',
  },
  'crocodile-breathing': {
    pattern: 'breath', braceMode: 'none', skillLayer: 'cylinder', category: 'breath', tempo: NO_TEMPO,
    why: 'Face-down breathing drill; the floor does the positioning, nothing to brace against.',
  },
  // Postural Audit
  'aston-audit': {
    pattern: null, braceMode: null, skillLayer: 'check', category: 'general', prescribable: false,
    why: 'An assessment a coach runs, not a set an athlete does, so it is not copied into a catalogue.',
  },
  // Foot & Ankle
  'tripod-foot': {
    pattern: 'other', braceMode: 'none', skillLayer: 'tripod', category: 'mobility', tempo: NO_TEMPO,
    why: 'Foot pressure under every standing pattern rather than one of them; tagged other on purpose. No trunk brace asked.',
  },
  // MIRROR-COACH P2 review (2026-09-26), owner decision #8: the three Hip/Ankle items are named in the KB with another
  // method's labels ("CARs", "PAILs/RAILs"). The copy a coach adds to their catalogue — which is what a client reads on
  // Today — carries FEL's plain name for what the drill is (the Playbook ch4 joint work); the KB entry is left as the
  // owner wrote it. The owner may prefer the KB names: drop these three `name`s and nothing else changes.
  'ankle-cars': {
    name: 'Ankle Circles',
    pattern: 'mobility', braceMode: 'none', skillLayer: 'joints', category: 'mobility', tempo: NO_TEMPO,
    cues: ['Slow circles, as big as the ankle will go', 'The knee and hip stay still; only the foot draws the circle', 'Work hardest at the edges of the circle'],
    why: 'Slow circles through the ankle range: the Playbook ch4 joint work.',
  },
  // Hip Mobility
  'hip-cars': {
    name: 'Hip Circles (90/90)',
    pattern: 'mobility', braceMode: 'none', skillLayer: 'joints', category: 'mobility', tempo: NO_TEMPO,
    why: 'Slow circles through the hip range from the 90/90 seat: ch4 joint work.',
  },
  'hip-pails-rails': {
    name: 'Hip End-Range Press and Pull',
    pattern: 'mobility', braceMode: 'none', skillLayer: 'joints', category: 'mobility', tempo: NO_TEMPO,
    cues: ['Settle into the stretch and stay about 2 minutes first', 'Press into the stretch, building over 20 seconds', 'Then pull the other way over 20 seconds, and keep breathing'],
    why: 'End-range holds with local presses at the hip; the trunk is not the point, and the KB lists holding the breath as a mistake.',
  },
  // Fascial Shearing
  'fascial-it-band': {
    pattern: 'mobility', braceMode: 'none', skillLayer: 'joints', category: 'mobility', tempo: NO_TEMPO,
    cues: ['Slow, active strokes across the outside of the thigh, not a passive roll', 'Work across the fibres where it feels stuck', 'Stay below the point of pain'],
    why: 'Soft-tissue work in service of range; the Playbook has no separate soft-tissue chapter, so it sits with the joints.',
  },
  // Oscillatory Drills
  'single-leg-pogos': {
    pattern: 'locomotion', braceMode: 'reflex', skillLayer: 'jump-land', category: 'plyometric', tempo: NO_TEMPO,
    cues: ['Quick hops on one leg: off the floor fast', 'A stiff ankle, like a spring, not a cushion', 'Heels barely leave the ground: a vibration, not a jump'],
    why: 'Fast single-leg contacts: a springy ankle and a brace that has to arrive on its own every hop (ch6 pogo progression).',
  },
  'hip-thrust-pogos': {
    pattern: 'hinge', braceMode: 'reflex', skillLayer: 'jump-land', category: 'plyometric', tempo: NO_TEMPO,
    why: 'Hip-extension bounce from a bench: a hinge done fast and small, the brace reactive.',
  },
  'leg-press-osc': {
    pattern: 'squat', braceMode: 'reflex', skillLayer: 'jump-land', category: 'plyometric', tempo: NO_TEMPO,
    cues: ['Move fast between the two depths, about 90 and 120 degrees at the knee', 'Throw the platform away, catch it on the way back', 'No pause at either depth'],
    why: 'Knees and hips bending together between two depths at speed: a squat pattern, caught and thrown.',
  },
  // Isometric Lockdowns
  'overcoming-iso-5s': {
    pattern: null, braceMode: 'set', skillLayer: 'strength', category: 'general', tempo: NO_TEMPO,
    cues: ['Push all-out against something that will not move, for 5 seconds', 'Brace, and keep breathing behind the brace', 'Go straight in from the bounce work, no rest'],
    why: 'A maximal 5-second push against something that will not move: the brace is built on purpose. Pattern left empty, it takes the position the coach picks.',
  },
  // Integrated Sets
  'integrated-set': {
    pattern: 'locomotion', braceMode: null, skillLayer: 'jump-land', category: 'plyometric', tempo: NO_TEMPO,
    cues: ['Pogos first: fast and small', 'Straight into a 5-second all-out push, no rest', 'Then long, slow breaths to come back down'],
    why: 'Led by pogos, so locomotion; brace left empty because it asks for both, reflex in the pogos and set in the lock. Tag the part you program.',
  },
  // Movement Snacks
  'am-pogo-snack': {
    pattern: 'locomotion', braceMode: 'reflex', skillLayer: 'wake-up', category: 'plyometric', tempo: NO_TEMPO,
    cues: ['10 quick pogos on each leg', 'Then press into a doorframe for 3 seconds', 'Barefoot if you can; a snack, not a workout'],
    why: 'A 90-second morning switch-on of pogos and a doorframe press: the Wake-Up idea in miniature.',
  },
  'noon-osc-snack': {
    pattern: 'push', braceMode: 'reflex', skillLayer: 'wake-up', category: 'upper-push', tempo: NO_TEMPO,
    cues: ['8 quick overhead pulses per arm with a light dumbbell', 'Then hold it overhead for 5 seconds', 'Light on purpose: speed, not load'],
    why: 'Quick overhead dumbbell pulses then a short overhead hold: a light pressing snack, the brace reactive.',
  },
  // Neural Flush
  'neural-flush-supine': {
    pattern: 'breath', braceMode: 'none', skillLayer: 'reset', category: 'recovery', tempo: NO_TEMPO,
    cues: ['Legs up the wall and let the floor take your weight', 'Breathe in for 4, out for 8', 'Notice where you still hold tension; you do not have to fix it'],
    why: 'Legs up the wall and long exhales: the Playbook ch9 wind-down.',
  },
  'neural-flush-croc': {
    pattern: 'breath', braceMode: 'none', skillLayer: 'reset', category: 'recovery', tempo: NO_TEMPO,
    cues: ['Face down, forehead on your hands, and settle', 'Breathe into your back so it rises toward the ceiling', 'Finish with slow breaths, in for 6 and out for 10'],
    why: 'A longer face-down breathing wind-down: ch9 reset work.',
  },
  // Basketball Application
  'med-ball-vert-toss': {
    pattern: 'squat', braceMode: 'reflex', skillLayer: 'jump-land', category: 'plyometric', tempo: NO_TEMPO,
    cues: ['Start in your loaded stance, ball at chin height', 'The ball is the rebound: launch it higher than anyone can reach', 'Land balanced and reset your stance before the next throw'],
    why: 'Dip and jump from the loaded stance, throwing as you leave the floor: a squat pattern at full speed.',
  },
  'box-out-drill': {
    pattern: 'other', braceMode: 'reflex', skillLayer: null, category: 'skill', tempo: NO_TEMPO,
    cues: ['Hit first', 'Widen fast', 'Hold the fort, then go hunting'],
    why: 'A court skill: contact, a wide base and a brace that has to hold under a shove. No Playbook chapter teaches the box-out, so no layer.',
  },
};

/**
 * Fallback for a KB exercise an admin added after the seed (no row above): tags that hold for EVERY exercise in its
 * category, and nothing that only holds for some. Oscillatory drills are all reactive, but not all the same pattern.
 */
const BY_CATEGORY: Record<string, Omit<KbTags, 'why'>> = {
  'Breath & Pressure': { pattern: 'breath', braceMode: 'none', skillLayer: 'cylinder', category: 'breath' },
  'Neural Flush': { pattern: 'breath', braceMode: 'none', skillLayer: 'reset', category: 'recovery' },
  'Hip Mobility': { pattern: 'mobility', braceMode: 'none', skillLayer: 'joints', category: 'mobility' },
  'Foot & Ankle': { pattern: null, braceMode: null, skillLayer: null, category: 'mobility' },
  'Fascial Shearing': { pattern: 'mobility', braceMode: 'none', skillLayer: null, category: 'mobility' },
  'Oscillatory Drills': { pattern: null, braceMode: 'reflex', skillLayer: 'jump-land', category: 'plyometric' },
  'Isometric Lockdowns': { pattern: null, braceMode: 'set', skillLayer: 'strength', category: 'general' },
  'Integrated Sets': { pattern: null, braceMode: null, skillLayer: null, category: 'plyometric' },
  'Movement Snacks': { pattern: null, braceMode: null, skillLayer: 'wake-up', category: 'general' },
  'Basketball Application': { pattern: null, braceMode: null, skillLayer: null, category: 'skill' },
  'Postural Audit': { pattern: null, braceMode: null, skillLayer: 'check', category: 'general', prescribable: false },
  'Periodization': { pattern: null, braceMode: null, skillLayer: null, category: 'general' },
};

const UNTAGGED: Omit<KbTags, 'why'> = { pattern: null, braceMode: null, skillLayer: null, category: 'general' };

/** FEL's tags for a KB exercise: its own row by slug, else what its whole category shares, else nothing. */
export function kbTagsFor(slug: string, categoryName: string | null | undefined): KbTags {
  const own = KB_TAGS[slug];
  if (own) return own;
  const byCat = categoryName ? BY_CATEGORY[categoryName] : undefined;
  return byCat
    ? { ...byCat, why: `Added after the seed; tagged by its category (${categoryName}).` }
    : { ...UNTAGGED, why: 'Added after the seed in a category FEL has no tags for; left untagged.' };
}

/** The public part of the tags, for the Exercises tab (the `why` goes too: a coach should see the reasoning). */
export function kbTagView(slug: string, categoryName: string | null | undefined) {
  const t = kbTagsFor(slug, categoryName);
  // copyName (P2 review): the name the copy takes when FEL renames it (decision #8), so the tab can say so and find it
  return { pattern: t.pattern, braceMode: t.braceMode, skillLayer: t.skillLayer, prescribable: t.prescribable !== false, why: t.why, ...(t.name ? { copyName: t.name } : {}) };
}
