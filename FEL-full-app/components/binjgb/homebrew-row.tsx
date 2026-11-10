// components/binjgb/homebrew-row.tsx — BINJGB-SHELF-1: the quiet row at the bottom of the Play shelf (OQ-8). The server
// decides `show` (lib/binjgb/hubRow.ts): flag on AND titles > 0 AND 13+. v1 has zero titles, so it never renders.
// F2 (Cyber build review dcbbec16): a plain <a href>, never next/link — entering the shelf is a full page load, so the
// shelf document gets its own enforced CSP and Permissions-Policy instead of inheriting the app's.
import { ChevronRight } from 'lucide-react';
import { SHELF_COPY } from '@/lib/binjgb/copy';

export function HomebrewShelfRow({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="mt-6">
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- F2 (Cyber dcbbec16): a full page load into the shelf, on purpose */}
      <a href="/play/gb-shelf" data-testid="play-homebrew-row"
        className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-3 text-sm text-white/70 hover:bg-white/[0.04] hover:text-white">
        <span>{SHELF_COPY.row}</span>
        <ChevronRight aria-hidden className="h-4 w-4 text-fel-quiet" />
      </a>
    </div>
  );
}
