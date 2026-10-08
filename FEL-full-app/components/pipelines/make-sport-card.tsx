'use client';
// PIPELINES (owner, 2026-10-06): "Make a card" for the end screen's `extraActions` slot (lane/end-screen holds
// components/games/end-screen/**, which is not on this branch: the mount is routed, one line). It opens the sport
// card's guided setup (/create/sport?from=end-screen), where the player picks this run (create-hub's sport step lists
// the runs they played) and it becomes a Signature move on their athlete card. No video leaves the device.

import { PublishAsCardLink } from '@/components/create/publish-as-card';

export function MakeSportCard({ title, className }: { title?: string; className?: string }) {
  return (
    <PublishAsCardLink discipline="sport" entry={{ from: 'end-screen', ...(title ? { title } : {}) }} qa="make-sport-card"
      className={className ?? 'rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-white/85 hover:bg-white/10'}>
      Make a card
    </PublishAsCardLink>
  );
}
