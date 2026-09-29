// The Quick Screen's results (SCREEN-SHIP, 2026-09-29; SCREEN-FIX), rendered from the device-side summary only
// (lib/screen/checks): the same cards on the first paint and after a refresh, "Back to my results" or the browser's
// Back, because both read the one summary (A4-5).
//
// In order, portrait first:
//   the "not a medical exam" lines and "Early version", above the fold (gate 3)
//   a real clean screen's win card (A4-4), or a line saying there is nothing to rank yet
//   ONE CARD PER CHECK, all shown (S-4): the top 1–2 priorities first, each marked, with ONE drill cue and a demo slot;
//   then every other check in check order (icon + word + colour; a cue for yellow and red)
//   the jump as a personal best to beat, never a band (the draft)
//   13 and older: FILLED "Build my Dunk Program", then OUTLINED "Play the Dunk Game, free" (/try) directly under it
//   (A4-2, S-1). Under 13 and "rather not say": "Have a parent open this" in their place, and no link out (Cyber 3).
//   Then "Screenshot this to keep your results.", the privacy page, and "Done, clear my results" (A4-6). Nothing else:
//   no save button, no coach link, no sign-up prompt.
//
// PR #20's MQS, PRQ preview and per-metric reasons are not shown here: they carry per-rep numbers, which never leave
// memory, so a restored result could not show them (the engine still computes them; nothing is saved).
import Link from 'next/link';
import { Play } from 'lucide-react';
import type { ScreenSummary } from '@/lib/screen/checks';
import { BAND_WORDS, cueOf, checkById, GRADED_CHECKS } from '@/lib/screen/PROPOSED-thresholds';
import { LANES } from '@/lib/screen/PROPOSED-program-lanes';
import { linksAllowed, type AgeBand } from '@/lib/screen/age';
import { screenNextTarget } from '@/lib/screen/config';
import { PRIVACY_PATH, programPath } from '@/lib/screen/routes';
import {
  BUILD_PROGRAM, DEMO_COMING, DISCLAIMER, DONE_CLEAR, FREE_GAME, NO_PICK_LINE, PRIVACY_LINK, SCREENSHOT_LINE, WIN_LINE,
} from '@/lib/screen/copy';
import { BandChip, EarlyTag, ParentCard, PreviewLabel, StopLine, outlineBtn, primaryBtn, quietBtn, BAND_COLOUR, UNREAD_WORD } from './screen-ui';

export function ResultsView({ summary, age, nextEnv = process.env.NEXT_PUBLIC_SCREEN_NEXT_ROUTE, onClear }: {
  summary: ScreenSummary; age: AgeBand | null; nextEnv?: string; onClear: () => void;
}) {
  const s = summary;
  const links = linksAllowed(age);
  const game = screenNextTarget(age, nextEnv);
  // one card per check: the priorities first (in their order), then the rest in check order
  const order = [...s.priorities, ...s.checks.map((c) => c.id).filter((id) => !s.priorities.includes(id))];
  return (
    <div data-screen-results className="space-y-3">
      <div className="space-y-2">
        <p data-disclaimer className="text-[15px] font-bold leading-snug text-white">{DISCLAIMER}</p>
        <StopLine />
        <PreviewLabel />
      </div>

      {s.clean ? (
        <section data-win-card className="rounded-3xl border border-[#00FF9D]/40 bg-[#00FF9D]/[0.06] p-4">
          <BandChip band="green" size="lg" />
          <p className="mt-1.5 text-[18px] font-black leading-snug">{WIN_LINE}</p>
        </section>
      ) : !s.priorities.length ? (
        <section data-no-pick className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[14px] leading-snug text-white/80">
          Not every check was read clearly, so there is nothing to rank yet. {NO_PICK_LINE}
        </section>
      ) : null}

      <section>
        <h2 className="px-1 text-[13px] font-bold uppercase tracking-[0.14em] text-white/60">Your checks</h2>
        <ul data-check-cards className="mt-2 space-y-2">
          {order.map((id) => {
            const c = s.checks.find((x) => x.id === id);
            const def = GRADED_CHECKS.find((x) => x.id === id);
            if (!c || !def) return null;
            const word = c.band ?? 'unread';
            const top = s.priorities.includes(id);
            const pad = top ? 'p-3.5' : 'px-3.5 py-2.5';
            const cueText = top ? 'text-[14px] text-white/85' : 'text-[13px] text-white/75';
            return (
              <li key={id} data-check-card={id} data-priority={top ? id : undefined} aria-label={`${def.name}: ${word === 'unread' ? 'not read' : word}`}
                className={`rounded-2xl border border-white/10 bg-white/[0.03] ${pad}`} style={{ borderLeft: `4px solid ${BAND_COLOUR[word]}` }}>
                {top ? <p data-top-priority className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/55">Top priority</p> : null}
                <p className={top ? 'text-[16px] font-black leading-snug' : 'text-[14.5px] font-bold leading-snug'}>{checkById(id).name}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <BandChip band={c.band} />
                  {c.sides ? (
                    <span className="text-[12.5px] text-white/60">
                      Left: <SideWord band={c.sides.left} /> · Right: <SideWord band={c.sides.right} />
                    </span>
                  ) : null}
                </div>
                {top || c.band === 'yellow' || c.band === 'red' ? (
                  <p data-cue className={`mt-1 leading-snug ${cueText}`}>Try this: {cueOf(id)}<EarlyTag /></p>
                ) : null}
                {top ? (
                  <div data-demo-slot className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-white/20 px-3 py-2 text-[12.5px] text-white/60">
                    <Play aria-hidden className="h-4 w-4" /> {DEMO_COMING}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {s.jumpBestIn !== null ? (
        <section data-personal-best className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <p className="text-[14px] text-white/80">Your best jump: <b className="text-[18px] text-white">{s.jumpBestIn} in</b></p>
          <p className="text-[12.5px] text-white/55">A personal best to beat next time.</p>
        </section>
      ) : null}

      {links ? (
        <div data-ctas className="space-y-2.5 pt-1">
          {s.lane ? (
            <Link href={programPath(s.lane)} prefetch={false} data-cta="program" data-variant="filled" className={primaryBtn}
              aria-label={`${BUILD_PROGRAM}: ${LANES[s.lane].name}`}>
              {BUILD_PROGRAM}
            </Link>
          ) : (
            <>
              <button type="button" disabled data-cta="program" data-variant="filled" className={primaryBtn}>{BUILD_PROGRAM}</button>
              <p className="text-center text-[12.5px] text-white/60">{NO_PICK_LINE}</p>
            </>
          )}
          {game ? <Link href={game} prefetch={false} data-cta="game" data-variant="outlined" className={outlineBtn}>{FREE_GAME}</Link> : null}
        </div>
      ) : (
        <ParentCard />
      )}
      <p data-screenshot-line className="pt-1 text-center text-[13px] text-white/70">{SCREENSHOT_LINE}</p>
      <p className="text-center text-[12.5px] text-white/60">
        <Link href={PRIVACY_PATH} prefetch={false} data-privacy-link className="underline">{PRIVACY_LINK}</Link>
      </p>
      <button type="button" onClick={onClear} data-done-clear className={quietBtn}>{DONE_CLEAR}</button>
    </div>
  );
}

function SideWord({ band }: { band: 'green' | 'yellow' | 'red' | null }) {
  return <span data-side-band={band ?? 'unread'} style={{ color: BAND_COLOUR[band ?? 'unread'] }}>{band ? BAND_WORDS[band] : UNREAD_WORD}</span>;
}
