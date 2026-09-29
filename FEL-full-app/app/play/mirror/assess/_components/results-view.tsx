'use client';

// The Quick Screen's results (SCREEN-SHIP, 2026-09-29), rendered from the phone-side summary only (lib/screen/checks):
// the same cards on the first paint and after a refresh, "Back to my results" or the browser's Back, because both read
// the one summary (A4-5).
//
// In order, portrait first:
//   the "not a medical exam" line and "PROPOSED · preview", above the fold (gate 3)
//   a real clean screen's win card (A4-4), or the top 1–2 priorities, each with ONE drill cue and a demo slot
//   the jump as a personal best to beat, never a band (the draft)
//   every check, one card each, behind "See every check" (icon + word + colour)
//   FILLED "Build my Dunk Program", then OUTLINED Brain Brawl directly under it (A4-2), then "Screenshot this to keep
//   your results." and "Done, clear my results" (A4-6). Nothing else: no save button, no coach link, no sign-up prompt.
//
// PR #20's MQS, PRQ preview and per-metric reasons are not shown here: they carry per-rep numbers, which never leave
// memory, so a restored result could not show them (the engine still computes them; nothing is saved).
import { useState } from 'react';
import Link from 'next/link';
import { Play } from 'lucide-react';
import type { ScreenSummary } from '@/lib/screen/checks';
import { BAND_WORDS, cueOf, checkById, GRADED_CHECKS } from '@/lib/screen/PROPOSED-thresholds';
import { LANES } from '@/lib/screen/PROPOSED-program-lanes';
import {
  BRAIN_BRAWL, BUILD_PROGRAM, DEMO_COMING, DISCLAIMER, DONE_CLEAR, NO_PICK_LINE, SCREENSHOT_LINE, WIN_LINE,
} from '@/lib/screen/copy';
import { BandChip, PreviewLabel, ProposedTag, outlineBtn, primaryBtn, quietBtn, BAND_COLOUR, UNREAD_WORD } from './screen-ui';

export function ResultsView({ summary, nextRoute, onClear, expanded = false }: { summary: ScreenSummary; nextRoute: string; onClear: () => void; expanded?: boolean }) {
  const [all, setAll] = useState(expanded);
  const s = summary;
  return (
    <div data-screen-results className="space-y-3">
      <div className="space-y-2">
        <p data-disclaimer className="text-[15px] font-bold leading-snug text-white">{DISCLAIMER}</p>
        <PreviewLabel />
      </div>

      {s.clean ? (
        <section data-win-card className="rounded-3xl border border-[#00FF9D]/40 bg-[#00FF9D]/[0.06] p-4">
          <BandChip band="green" size="lg" />
          <p className="mt-1.5 text-[18px] font-black leading-snug">{WIN_LINE}</p>
        </section>
      ) : s.priorities.length ? (
        <section data-priorities className="space-y-2">
          <h2 className="px-1 text-[13px] font-bold uppercase tracking-[0.14em] text-white/60">Your top {s.priorities.length === 1 ? 'priority' : 'priorities'}</h2>
          {s.priorities.map((id) => {
            const band = s.checks.find((c) => c.id === id)?.band ?? null;
            return (
              <article key={id} data-priority={id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5" style={{ borderLeft: `4px solid ${BAND_COLOUR[band ?? 'unread']}` }}>
                <BandChip band={band} />
                <p className="mt-1 text-[16px] font-black leading-snug">{checkById(id).name}</p>
                <p data-cue className="mt-1 text-[14px] leading-snug text-white/85">Try this: {cueOf(id)}<ProposedTag /></p>
                <div data-demo-slot className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-white/20 px-3 py-2 text-[12.5px] text-white/60">
                  <Play aria-hidden className="h-4 w-4" /> {DEMO_COMING}
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <section data-no-pick className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[14px] leading-snug text-white/80">
          Not every check was read clearly, so there is nothing to rank yet. {NO_PICK_LINE}
        </section>
      )}

      {s.jumpBestIn !== null ? (
        <section data-personal-best className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <p className="text-[14px] text-white/80">Your best jump: <b className="text-[18px] text-white">{s.jumpBestIn} in</b></p>
          <p className="text-[12.5px] text-white/55">A personal best to beat next time.</p>
        </section>
      ) : null}

      <section>
        <button type="button" onClick={() => setAll(!all)} aria-expanded={all} data-see-all
          className="w-full rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-2.5 text-left text-[14px] font-bold text-white/80">
          {all ? 'Hide the checks' : 'See every check'}
        </button>
        {all ? (
          <ul data-check-cards className="mt-2 space-y-2">
            {s.checks.map((c) => {
              const def = GRADED_CHECKS.find((x) => x.id === c.id);
              if (!def) return null;
              const word = c.band ?? 'unread';
              return (
                <li key={c.id} data-check-card={c.id} aria-label={`${def.name}: ${word === 'unread' ? 'not read' : word}`}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5" style={{ borderLeft: `4px solid ${BAND_COLOUR[word]}` }}>
                  <p className="text-[14.5px] font-bold leading-snug">{def.name}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <BandChip band={c.band} />
                    {c.sides ? (
                      <span className="text-[12.5px] text-white/60">
                        Left: <SideWord band={c.sides.left} /> · Right: <SideWord band={c.sides.right} />
                      </span>
                    ) : null}
                  </div>
                  {c.band === 'yellow' || c.band === 'red' ? <p className="mt-1 text-[13px] text-white/75">Try this: {cueOf(c.id)}<ProposedTag /></p> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <div data-ctas className="space-y-2.5 pt-1">
        {s.lane ? (
          <Link href={`/screen/program/${s.lane}`} prefetch={false} data-cta="program" data-variant="filled" className={primaryBtn}
            aria-label={`${BUILD_PROGRAM}: ${LANES[s.lane].name}`}>
            {BUILD_PROGRAM}
          </Link>
        ) : (
          <>
            <button type="button" disabled data-cta="program" data-variant="filled" className={primaryBtn}>{BUILD_PROGRAM}</button>
            <p className="text-center text-[12.5px] text-white/60">{NO_PICK_LINE}</p>
          </>
        )}
        <Link href={nextRoute} prefetch={false} data-cta="game" data-variant="outlined" className={outlineBtn}>{BRAIN_BRAWL}</Link>
      </div>
      <p data-screenshot-line className="pt-1 text-center text-[13px] text-white/70">{SCREENSHOT_LINE}</p>
      <button type="button" onClick={onClear} data-done-clear className={quietBtn}>{DONE_CLEAR}</button>
    </div>
  );
}

function SideWord({ band }: { band: 'green' | 'yellow' | 'red' | null }) {
  return <span data-side-band={band ?? 'unread'} style={{ color: BAND_COLOUR[band ?? 'unread'] }}>{band ? BAND_WORDS[band] : UNREAD_WORD}</span>;
}
