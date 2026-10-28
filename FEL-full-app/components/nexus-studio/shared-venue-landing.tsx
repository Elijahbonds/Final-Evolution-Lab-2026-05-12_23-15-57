'use client';

// NEX-06: the landing a Studio share link opens (app/play/shared/[token]). It says whose venue it is and that it plays as
// PRACTICE, hands the venue to the mode through this tab's sessionStorage (runtime.ts reads `?share=<id>`), and offers Report.
// Nothing here is the venue itself: the mode loads it, through the same sanitiser.

import { useState } from 'react';
import type { StudioVenueExport } from '@/lib/nexus-studio/exportVenue';
import { SHARE_HANDOFF_PREFIX } from '@/lib/nexus-studio/shareHandoff';
import { SHARE_REPORT_REASONS, reportShareLink, type ReportOutcome } from '@/lib/nexus-studio/shareReport';

export function SharedVenueLanding({ id, venueName, creatorName, modeLabel, route, venue }: {
  id: string; venueName: string; creatorName: string | null; modeLabel: string; route: string; venue: StudioVenueExport;
}) {
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState<ReportOutcome | null>(null);
  const [blocked, setBlocked] = useState(false);
  const play = () => {
    try { window.sessionStorage.setItem(SHARE_HANDOFF_PREFIX + id, JSON.stringify(venue)); } catch { setBlocked(true); return; }
    window.location.assign(route);
  };
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-lg flex-col justify-center gap-4 px-4 py-10 text-white" data-testid="shared-venue">
      <p className="text-[12px] font-black tracking-[0.3em] text-cyan-300/80">A VENUE MADE IN NEXUS STUDIO</p>
      <h1 className="text-3xl font-bold leading-tight">{venueName}</h1>
      <p className="text-sm text-white/70">{creatorName ? <>By <b>{creatorName}</b> · </> : null}Plays in {modeLabel}</p>
      <p className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[13px] text-white/75">
        Practice: this run is not ranked, earns nothing and is not saved to a leaderboard. The game plays exactly as it always does; only the place looks different.
      </p>
      <button type="button" onClick={play} className="h-12 rounded-xl bg-cyan-400 font-bold text-black">Play it</button>
      {blocked && <p className="text-[13px] text-amber-300" role="alert">This browser would not hand the venue to the game (private mode?). Try a normal tab.</p>}
      <div className="mt-2">
        {!reporting && !reported && <button type="button" onClick={() => setReporting(true)} className="text-[12px] text-white/50 underline">Report this venue</button>}
        {reporting && !reported && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Why are you reporting it?">
            {SHARE_REPORT_REASONS.map((r) => (
              <button key={r.id} type="button" className="min-h-10 rounded-full border border-white/20 px-3 text-[12px] text-white/80"
                onClick={() => { void reportShareLink(id, r.id).then(setReported); }}>{r.label}</button>
            ))}
          </div>
        )}
        {reported === 'received' && <p className="text-[13px] text-emerald-300" role="status">Thanks. Our team will look at it.</p>}
        {reported === 'not_open' && <p className="text-[13px] text-amber-300" role="status">Reporting is not open yet for shared venues. You can leave this page; nothing was saved.</p>}
        {reported === 'failed' && <p className="text-[13px] text-amber-300" role="status">That did not go through. Try again in a moment.</p>}
      </div>
    </main>
  );
}
