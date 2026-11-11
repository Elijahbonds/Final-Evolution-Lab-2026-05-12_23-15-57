// lib/library/templateNames.ts — DEMOS-FIX (2026-11-10): which library entry a coach-template exercise IS, when its name is
// not the library's (owner decision 2026-11-10: "Fix the demos").
//
// The coached athlete's Today plays each exercise's loop through the library (lib/coach/todayExtras.ts libraryClips): the
// catalogue row is matched to an entry by its exact name or alias (lib/library/match.ts), and the entry's own rule picks the
// loop (lib/library/demo.ts demoFor). FEL's templates (lib/coach/templateCatalogue.ts) name their rungs the way a coach
// says them — "Backpack RDL", "Tempo Bodyweight Squat", "Barbell Bench Press" — and 59 of those names answered nothing, so
// the athlete saw the still although the library has the movement.
//
// Each line below was read against BOTH texts — the template row's cues and the library entry's setup and cues (and its
// free-exercise-db source) — and names the entry that is the same movement. A tempo, a pause or a hold is the dose, not
// another movement (the entry's loop plays at its own pace). Where the template's kit differs (a backpack for a dumbbell)
// the line says so: the stage draws neither. A name with no honest match is not here and stays the still: the pike
// push-ups with the hands or the feet raised, the double broad jump, the lateral step and stick (the library's loop is a
// hop). scripts/probes/demos-fix/template-names.mts prints both texts for every unmatched name.
//
// Pure.
import { matchLibraryByName } from './match';
import { nameKey } from './search/text';
import type { LibraryExercise } from './types';

/** Template catalogue name → library entry id. */
export const TEMPLATE_LIBRARY_NAMES: Readonly<Record<string, string>> = {
  // squats: "sit back to a chair, touch it lightly" is the box squat to a box; the tempo is the dose; the backpack hugged to
  // the chest is the sandbag bear-hug squat (flag: a backpack, not a sandbag; neither drawn)
  'Chair Box Squat': 'bodyweight-box-squat',
  'Tempo Bodyweight Squat': 'bodyweight-squat',
  'Paused Barbell Back Squat': 'barbell-back-squat',
  'Backpack Hug Squat': 'sandbag-bear-hug-squat',
  'Backpack Hug Squat, 3-Second Pause': 'paused-sandbag-bear-hug-squat',
  // hinges: a backpack held in front of the thighs is the dumbbell RDL's load (flag: the backpack is not drawn); the supported
  // single-leg RDL holds a dowel (flag: the template's hand is on a wall or a chair)
  'Backpack RDL': 'dumbbell-romanian-deadlift',
  'Barbell RDL': 'romanian-deadlift',
  'Barbell RDL, 3-Second Lower': 'romanian-deadlift',
  'Single-Leg RDL Toe Touch, Supported': 'supported-single-leg-romanian-deadlift',
  'Single-Leg RDL, Free Stand': 'single-leg-romanian-deadlift',
  // bridges (flag on Feet Close: the loop's feet are hip-width, not walked in closer)
  'Glute Bridge, 5-Second Squeeze': 'glute-bridge',
  'Glute Bridge, Feet Close': 'glute-bridge',
  // split squats, lunges, step-ups (flags: the supported lunge's hand on the wall and the backpack hugged to the chest are not
  // drawn — the arms hang; the low box is drawn at the loop's own box height)
  'Split Squat, 3-Second Hold': 'split-squat',
  'Supported Reverse Lunge': 'reverse-lunge',
  'Backpack Reverse Lunge': 'reverse-lunge',
  'Dumbbell Step-Up': 'dumbbell-step-ups',
  'Dumbbell Step-Up, 3-Second Lower': 'dumbbell-step-ups',
  'Dumbbell Step-Up, Low Box': 'dumbbell-step-ups',
  // presses
  'Barbell Bench Press': 'barbell-bench-press-medium-grip',
  'Paused Barbell Bench Press': 'barbell-bench-press-medium-grip',
  // rows and pulls (flag on the supported one-arm row: the template's free hand is on a chair, the loop's hangs)
  'Bent-Over Backpack Row': 'bent-over-dumbbell-row',
  'Bent-Over Backpack Row, 3-Second Squeeze': 'bent-over-dumbbell-row',
  'Barbell Bent-Over Row, 2-Second Squeeze': 'bent-over-barbell-row',
  'Supported One-Arm Backpack Row': 'one-arm-dumbbell-row',
  'Half-Kneeling Single-Arm Pulldown': 'half-kneeling-single-arm-cable-pulldown',
  'Cable Face Pull': 'face-pull',
  'Cable Face Pull, 2-Second Hold': 'face-pull',
  // carries (flag on the two bags: the farmer carry's dumbbells, neither drawn)
  'Two-Bag Farmer Carry': 'dumbbell-farmer-carry',
  'Dumbbell Suitcase Carry': 'suitcase-carry',
  'Dumbbell Suitcase March': 'suitcase-march',
  'Backpack Hug Carry': 'sandbag-bear-hug-carry',
  // trunk
  'Breathing Plank': 'forearm-plank',
  'Breathing Plank with Shoulder Taps': 'plank-shoulder-tap',
  'Incline Breathing Plank': 'incline-plank',
  'Standing Pallof Press': 'cable-pallof-press-standing',
  'Split-Stance Pallof Press with a Hold': 'cable-pallof-press-and-hold-split-stance',
  // jumps and landings (flag on the box jump: the template's box is knee height or lower; the loop's box is its own; the fast
  // heel raise is the calf raise, done fast: the speed is the dose)
  'Box Jump and Stick': 'box-jump',
  'Low Box Depth Drop and Stick': 'drop-landing-from-low-box',
  'Single-Leg Pogo Hops': 'single-leg-pogo',
  'Fast Heel Raise': 'standing-calf-raises',
};

const BY_KEY: ReadonlyMap<string, string> = new Map(Object.entries(TEMPLATE_LIBRARY_NAMES).map(([n, id]) => [nameKey(n), id]));

/** The library entry a coach catalogue row names: by the library's own names first (match.ts), then by this map. A rejected
 *  entry is never returned. */
export function templateLibraryEntry(docs: readonly LibraryExercise[], name: string | null | undefined): LibraryExercise | null {
  const byName = matchLibraryByName(docs, [name]);
  if (byName) return byName;
  const id = name ? BY_KEY.get(nameKey(name)) : undefined;
  const e = id ? docs.find((d) => d.id === id) ?? null : null;
  return e && e.review.status !== 'rejected' ? e : null;
}
