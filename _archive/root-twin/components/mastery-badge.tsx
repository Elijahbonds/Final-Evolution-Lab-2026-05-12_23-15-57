'use client';

/**
 * components/mastery-badge.tsx
 * ===========================
 * M13 Step 3 — compact mastery tier badge for hub cards + profile.
 */

import { Award } from 'lucide-react';

const TIER_COLOR: Record<number, string> = {
  1: '#CD7F32', // Bronze
  2: '#C0C0C0', // Silver
  3: '#FFD700', // Gold
  4: '#00E5FF', // Platinum
  5: '#A855F7', // Venice Legend
};
const TIER_NAME = ['Unranked', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Venice Legend'];

export function MasteryBadge({ tierIndex, className = '' }: { tierIndex: number; className?: string }) {
  if (!tierIndex) return null;
  const color = TIER_COLOR[tierIndex] ?? '#FFD700';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${className}`}
      style={{ background: `${color}1c`, color, border: `1px solid ${color}66` }}
      title={`Mastery: ${TIER_NAME[tierIndex]}`}
    >
      <Award className="h-3 w-3" /> {TIER_NAME[tierIndex]}
    </span>
  );
}
