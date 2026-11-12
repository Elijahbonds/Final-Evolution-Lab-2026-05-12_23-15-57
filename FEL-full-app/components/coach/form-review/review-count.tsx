'use client';

// The attention board's form-review line (COACH-VIDEO-REVIEW, 2026-10-24): how many sets wait for this coach, linking
// down to the queue. Nothing when none wait, or when the feature is not on yet — the board stays about what needs the
// coach today.
import { useEffect, useState } from 'react';
import { ScanLine } from 'lucide-react';
import { FORM_REVIEW_ANCHOR, FORM_REVIEW_QUEUE_API } from './review-queue';

/** "1 filmed set to review", "3 filmed sets to review". */
export function reviewCountLine(n: number): string {
  return `${n} filmed ${n === 1 ? 'set' : 'sets'} to review — the flagged rep first`;
}

export function FormReviewCount({ api = FORM_REVIEW_QUEUE_API }: { api?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    fetch(api).then((r) => (r.ok ? r.json() : null)).then((j) => setN(j?.available ? Number(j.unreviewed) || 0 : 0)).catch(() => setN(0));
  }, [api]);
  if (n <= 0) return null;
  return (
    <a href={`#${FORM_REVIEW_ANCHOR}`} data-attention-form-reviews={n}
      className="flex items-center gap-2 rounded-lg border border-[#FFB020]/30 bg-[#FFB020]/5 px-3 py-2 text-sm text-[#FFB020]">
      <ScanLine className="h-4 w-4 shrink-0" /> {reviewCountLine(n)}
    </a>
  );
}
