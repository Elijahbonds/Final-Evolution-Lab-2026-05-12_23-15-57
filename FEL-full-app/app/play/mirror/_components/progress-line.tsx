// The Mirror review's "vs your last 3" block (MIRROR-PROGRESS, plan Phase 4, 2026-10-07). It draws what
// lib/mirror/progressReading.ts progressView says; where the history lives is always said beside it, and a phone-only
// history (owner decision 1: under-18s keep it on the device) carries its own Forget button.
import type { ProgressView } from '@/lib/mirror/progressReading';

export const FORGET_LABEL = 'Forget on this phone';
export const FORGOTTEN_LINE = 'Forgotten — this phone keeps no Mirror history now.';

export function ProgressLine({ view, forgotten = false, onForget }: { view: ProgressView; forgotten?: boolean; onForget?: () => void }) {
  return (
    <section
      className="mt-6 rounded-2xl border border-white/8 bg-white/[0.02] p-5"
      data-progress={view.kind}
      data-progress-source={view.source}
      aria-label={view.heading}
    >
      <h2 className="fel-heading text-[15px] font-bold text-white/80">{view.heading}</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-white/70">{forgotten ? FORGOTTEN_LINE : view.line}</p>
      {!forgotten && <p className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-white/35">{view.where}</p>}
      {view.source === 'device' && !forgotten && onForget && (
        <button
          type="button"
          onClick={onForget}
          className="mt-3 min-h-10 rounded-lg border border-white/12 px-3 text-[12px] text-white/60 hover:text-white/85"
        >
          {FORGET_LABEL}
        </button>
      )}
    </section>
  );
}
