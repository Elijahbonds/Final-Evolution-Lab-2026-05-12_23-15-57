// NutritionScore — the food-scan reward rubric (M60, Phase 9). The ask:
// "scan food for coins/XP/Shards, AI-judged nutrition, relative to your
// goals and data."
//
// THE HONEST DESIGN DECISION, stated up front: identifying food from
// pixels requires a vision model this batch does not have — so nothing
// here PRETENDS to see the photo. The shipped flow is photo + quick
// plate-tagging (8 chips, 5 seconds of tapping), scored by a transparent
// rubric RELATIVE TO THE USER'S STATED GOAL — which is real personalized
// judgment, deterministic and auditable. The marked VISION SEAM is where
// a real Cell vision call replaces manual tags with detected ones; the
// rubric, goals, rewards, and anti-farm caps all stay identical.

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

export interface PlateScore {
  score: number;                     // 0-100
  verdictLine: string;
  coins: number;
  xp: number;
  shards: number;                    // only on excellent plates, capped daily
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

  return {
    score,
    verdictLine,
    coins: Math.round(score / 2),
    xp: score,
    shards: score >= 80 ? 10 : 0,
  };
}

// ── Anti-farm caps: 3 scored scans/day; shards only on the first 2 ────────
const KEY_DAY = 'fel_food_day_v1';
interface DayState { day: string; scans: number; shardScans: number }
const today = (): string => new Date().toISOString().slice(0, 10);

function readDay(): DayState {
  try {
    const d = JSON.parse(localStorage.getItem(KEY_DAY) ?? 'null') as DayState | null;
    if (d && d.day === today()) return d;
  } catch { /* fresh */ }
  return { day: today(), scans: 0, shardScans: 0 };
}

export const FoodScanLimits = {
  MAX_SCANS_PER_DAY: 3,
  MAX_SHARD_SCANS_PER_DAY: 2,
  remainingToday(): number { return Math.max(0, this.MAX_SCANS_PER_DAY - readDay().scans); },
  /** Register a scored scan; zeroes rewards past the caps. */
  applyCaps(s: PlateScore): PlateScore {
    const d = readDay();
    if (d.scans >= this.MAX_SCANS_PER_DAY) return { ...s, coins: 0, xp: 0, shards: 0, verdictLine: 'daily scans done — rewards resume tomorrow' };
    const shardsOk = d.shardScans < this.MAX_SHARD_SCANS_PER_DAY;
    const capped = { ...s, shards: shardsOk ? s.shards : 0 };
    localStorage.setItem(KEY_DAY, JSON.stringify({
      day: d.day, scans: d.scans + 1, shardScans: d.shardScans + (capped.shards > 0 ? 1 : 0),
    }));
    // SYNC SEAM: POST /api/nutrition/scans { tags, score, photoRef } —
    // server enforces the same caps authoritatively + stores the photo.
    return capped;
  },
};

// VISION SEAM: async detectTags(photoBlob): Promise<PlateTag[]> — a real
// Cell vision call returns tags; UI pre-fills them for user confirmation
// (confirm-not-trust keeps mis-detections from mis-scoring). Everything
// downstream of tags is already built above.
