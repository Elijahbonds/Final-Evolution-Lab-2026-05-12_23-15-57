'use client';

// "Film a set for your coach" on a Today exercise card (COACH-VIDEO-REVIEW, 2026-10-24). Shown only for an exercise the
// camera can read (lib/coach/formReview/movements.ts reviewMovementFor: a squat, a lunge, a hinge, a push-up); the page
// it opens resolves the program from the slot on the server, so the card needs nothing but its own exercise.
import Link from 'next/link';
import { ScanLine } from 'lucide-react';
import { reviewMovementFor } from '@/lib/coach/formReview/movements';

export function FilmSetLink({ exercise }: { exercise: { id: string; name: string; coaching?: { pattern?: { id: string } | null } } }) {
  const movement = reviewMovementFor({ name: exercise.name, pattern: exercise.coaching?.pattern?.id ?? null });
  if (!movement) return null;
  return (
    <Link href={`/coach/form-review?slot=${encodeURIComponent(exercise.id)}`} data-film-set={movement} className="inline-flex items-center gap-1.5 text-xs text-[#00E5FF]">
      <ScanLine className="h-3.5 w-3.5" /> Film a set — the camera counts your reps and marks the one to work on
    </Link>
  );
}
