/**
 * lib/stream/program-guide.ts
 * ===========================
 * PURE config for the LIVE tab: programming line-up, advertising inventory and
 * creator-highlight rotation. Provider-agnostic — an actual HLS URL is resolved
 * at runtime (hlsUrlResolver) and requires a real streaming provider; when none
 * is configured the tab shows the schedule + on-demand cards.
 */

export interface StreamProgram {
  id: string;
  title: string;
  host: string;
  category: 'HIIT' | 'Plyometrics' | 'Isometrics' | 'Corrective' | 'Education' | 'Pilates' | 'Dance';
  blurb: string;
  accent: string;
  live?: boolean;
}

// TUNE(elijah) — programming line-up.
export const PROGRAMS: StreamProgram[] = [
  { id: 'eb_hiit', title: 'Elijah Bonds HIIT', host: 'Elijah Bonds', category: 'HIIT', blurb: 'High-intensity intervals for real athletes.', accent: '#FF3366', live: true },
  { id: 'eb_plyo', title: 'Regressed & Progressed Plyometrics', host: 'Elijah Bonds', category: 'Plyometrics', blurb: 'Scaled jump training from the ground up.', accent: '#00E5FF' },
  { id: 'eb_iso', title: 'Isometrics Lab', host: 'Elijah Bonds', category: 'Isometrics', blurb: 'Position-specific strength you can feel.', accent: '#00FF9D' },
  { id: 'eb_smr', title: 'Corrective Self-Myofascial Release', host: 'Elijah Bonds', category: 'Corrective', blurb: 'Release strategies + biomechanical education.', accent: '#A855F7' },
  { id: 'eb_biomech', title: 'Biomechanics with Practical Application', host: 'Elijah Bonds', category: 'Education', blurb: 'Understand the why, then apply it.', accent: '#FFD700' },
  { id: 'pilates_flow', title: 'Pilates Flow', host: 'FEL Studio', category: 'Pilates', blurb: 'Control, breath, core.', accent: '#00FF9D' },
  { id: 'dance_cardio', title: 'Dance Cardio', host: 'FEL Studio', category: 'Dance', blurb: 'Move, sweat, smile.', accent: '#FF3366' },
];

export interface AdSlot { id: string; placement: 'banner_live_tab' | 'preroll' | 'schedule_sponsor'; label: 'AD' | 'SPONSORED' | 'FEL'; weight: number; headline: string; cta: string; href: string }

// House ads (label 'FEL') fill unsold inventory. First-party impressions only.
export const AD_SLOTS: AdSlot[] = [
  { id: 'house_scan', placement: 'banner_live_tab', label: 'FEL', weight: 3, headline: 'Run your System Scan', cta: 'Scan now', href: '/try' },
  { id: 'house_workout', placement: 'banner_live_tab', label: 'FEL', weight: 3, headline: 'Get a plan animated with YOUR avatar', cta: 'Start', href: '/workout' },
  { id: 'house_card', placement: 'banner_live_tab', label: 'FEL', weight: 2, headline: 'Build your Creator Card', cta: 'Create', href: '/cards' },
];

/** Deterministic weighted pick (seeded) so SSR and tests are stable. */
export function pickAd(slots: AdSlot[], seed: number): AdSlot | null {
  const pool = slots.filter((s) => s.placement === 'banner_live_tab');
  if (!pool.length) return null;
  const total = pool.reduce((a, s) => a + s.weight, 0);
  let r = ((seed % 1000) / 1000) * total;
  for (const s of pool) { r -= s.weight; if (r <= 0) return s; }
  return pool[0];
}

/** Watch-XP drip: capped, requires interaction every 5 min (anti-idle). */
export function watchXp(minutesWatched: number, interactedWithinLast5: boolean): number {
  if (!interactedWithinLast5) return 0;
  const capped = Math.min(30, Math.max(0, minutesWatched)); // TUNE(elijah)
  return Math.floor(capped * 2);
}
