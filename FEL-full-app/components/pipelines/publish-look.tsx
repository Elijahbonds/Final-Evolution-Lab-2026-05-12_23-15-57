'use client';
// PIPELINES (owner, 2026-10-06): the Closet's "Save Look" gains its publish step: "Publish this look as a card" opens the
// fashion card's guided setup (/create/fashion?from=closet), where the look's owned pieces and palette become a fashion
// Creator Card. A public card waits for the owner's review, like every other; a teen's stays private (create-hub's flow).

import { PublishAsCardLink } from '@/components/create/publish-as-card';

export function PublishLookAsCard({ title }: { title?: string }) {
  return (
    <PublishAsCardLink discipline="fashion" entry={{ from: 'closet', ...(title ? { title } : {}) }} qa="publish-look-as-card"
      className="mt-2 flex w-full items-center justify-center rounded-xl border border-cyan-400/40 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-400/10">
      Publish this look as a card
    </PublishAsCardLink>
  );
}
