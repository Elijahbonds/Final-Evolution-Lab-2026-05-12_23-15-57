// NutritionScore — the food-scan rubric (M60, Phase 9). The original ask was
// "scan food for coins/XP/Shards, AI-judged nutrition, relative to your
// goals and data."
//
// NO CURRENCY FOR FOOD (owner-approved 2026-10-06, the moderate option):
// paying coins, XP or Shards for how a plate scores rewards eating to a
// number — an eating-disorder risk, and the app has under-18 players. A
// plate gets its score and its one-line verdict as feedback, and nothing
// else: PlateScore carries no coins, xp or shards, and the anti-farm caps
// that only existed to ration those rewards are gone with them.
// lib/babylon/nutrition/NutritionScore.test.ts holds it.
//
// THE HONEST DESIGN DECISION, stated up front: identifying food from
// pixels requires a vision model this batch does not have — so nothing
// here PRETENDS to see the photo. The shipped flow is photo + quick
// plate-tagging (8 chips, 5 seconds of tapping), scored by a transparent
// rubric RELATIVE TO THE USER'S STATED GOAL — which is real personalized
// judgment, deterministic and auditable. The marked VISION SEAM is where
// a real Cell vision call replaces manual tags with detected ones; the
// rubric and goals stay identical.

export type Goal = 'cut' | 'maintain' | 'bulk';
export type PlateTag =
  | 'lean_protein' | 'veggies' | 'fruit' | 'whole_grain'
  | 'dairy' | 'fried' | 'sweets' | 'sugary_drink';

export const TAG_LABEL: Record<PlateTag, string> = {
  lean_protein: 'Lean protein', veggies: 'Veggies', fruit: 'Fruit', whole_grain: 'Whole grains',
  dairy: 'Dairy', fried: 'Fried', sweets: 'Sweets/dessert', sugary_drink: 'Sugary drink',
};

export interface NutritionProfile {
  goal: Goal;
  trainedToday: boolean;             // pulled from the day's session history when wired
}

/** Feedback only — a score and a line. Never coins, XP or Shards (see the header). */
export interface PlateScore {
  score: number;                     // 0-100
  verdictLine: string;
}

/** Base points per tag — then goal-relative adjustments. Transparent by
 *  design: the UI shows exactly why a plate scored what it scored. */
const BASE: Record<PlateTag, number> = {
  lean_protein: 22, veggies: 24, fruit: 14, whole_grain: 14,
  dairy: 6, fried: -18, sweets: -14, sugary_drink: -16,
};

export function scorePlate(tags: PlateTag[], profile: NutritionProfile): PlateScore {
  let score = 30;                                        // showing up counts
  const notes: string[] = [];
  for (const t of tags) score += BASE[t];

  // GOAL-RELATIVE judgment — the same plate scores differently per goal:
  if (profile.goal === 'cut') {
    if (tags.includes('sugary_drink')) { score -= 8; notes.push('liquid sugar hits a cut hardest'); }
    if (tags.includes('veggies') && tags.includes('lean_protein')) { score += 8; notes.push('protein + veg is the cut formula'); }
  }
  if (profile.goal === 'bulk') {
    if (tags.includes('lean_protein') && tags.includes('whole_grain')) { score += 10; notes.push('protein + carbs feeds the build'); }
    if (tags.length <= 1) { score -= 8; notes.push('a bulk plate this small is a missed meal'); }
  }
  if (profile.goal === 'maintain' && tags.includes('fried') && tags.includes('veggies')) {
    score += 4; notes.push('balance beats perfection on maintenance');
  }
  if (profile.trainedToday && tags.includes('lean_protein')) {
    score += 6; notes.push('post-training protein — timed right');
  }

  score = Math.max(0, Math.min(100, score));
  const verdictLine = notes[0]
    ?? (score >= 80 ? 'a genuinely strong plate' : score >= 55 ? 'solid — one swap from great' : 'it happens — the next plate is a fresh start');

  return { score, verdictLine };
}

// VISION SEAM: async detectTags(photoBlob): Promise<PlateTag[]> — a real
// Cell vision call returns tags; UI pre-fills them for user confirmation
// (confirm-not-trust keeps mis-detections from mis-scoring). Everything
// downstream of tags is already built above.
