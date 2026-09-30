// The Quick Screen's results (SCREEN-SHIP, 2026-09-29; SCREEN-FIX; SCREEN-FIX-2), rendered from the device-side summary
// only (lib/screen/checks): the same cards on the first paint and after a refresh, "Back to my results" or the browser's
// Back, because both read the one summary (A4-5).
//
// 18 OR OLDER, in order, portrait first:
//   the "not a medical exam" line ONCE, "If anything hurts, stop." and "Early version", above the fold (gate 3, S-13)
//   a real clean screen's win card (A4-4), or a line saying there is nothing to rank yet
//   ONE CARD PER CHECK (S-4, retest 1): the four checks the start card lists, not one per graded row. Each card carries
//   its worst band (icon + word + colour), and when that is Yellow or Red, the row behind it with ONE drill cue. The
//   cards holding the top 1–2 priorities come first, marked, with a demo slot; then the rest in check order
//   the jump as a personal best to beat, never a band (the draft)
//   EXACTLY ONE NEXT STEP (L5, retest 1): the Kindle book, a plain link that opens a new tab (no prefetch, no query)
//   then "Screenshot this to keep your results.", the privacy page, and "Done, clear my results" (A4-6). Nothing else:
//   no Dunk Program button, no free game, no save button, no coach link, no sign-up prompt, no email box.
//
// UNDER 18, OR "RATHER NOT SAY": never these cards. Their results never reach this address (nothing is kept for them:
// lib/screen/store.ts), so this is only a guard: a kid's age gets the kid view, their number and nothing else.
import Link from 'next/link';
import { Play } from 'lucide-react';
import { priorities, type CheckBand, type ScreenSummary } from '@/lib/screen/checks';
import { BAND_WORDS, cueOf, checkById, GRADED_CHECKS, type BandWord, type CheckId } from '@/lib/screen/PROPOSED-thresholds';
import { isKid, type AgeBand } from '@/lib/screen/age';
import { PRIVACY_PATH } from '@/lib/screen/routes';
import {
  DEMO_COMING, DISCLAIMER, DONE_CLEAR, KINDLE_BOOK_LABEL, KINDLE_BOOK_URL, NOTHING_TO_RANK, PRIVACY_LINK, SCREENSHOT_LINE,
  SCREEN_TEST_NAMES, WIN_LINE,
} from '@/lib/screen/copy';
import { BandChip, EarlyTag, PreviewLabel, StopLine, primaryBtn, quietBtn, BAND_COLOUR, UNREAD_WORD } from './screen-ui';
import { KidResults } from './kid-results';

type TestId = keyof typeof SCREEN_TEST_NAMES;
/** The checks the start card lists, in check order (A3-3). */
const CHECKS: readonly TestId[] = [...new Set(GRADED_CHECKS.map((c) => c.test))];

/** One card per check: its worst band, and the row behind it (the check's highest-ranked Yellow or Red row). */
export interface CheckCard { test: TestId; band: BandWord | null; row: CheckBand | null; top: boolean }

/**
 * The four cards, priorities first. A check is Red or Yellow when any of its rows is; "Not read" when none is flagged
 * and a row was not read (a check never reads "Good to go" on a row it could not see); Green only when every row is.
 */
export function checkCards(s: ScreenSummary): CheckCard[] {
  const ranked = priorities(s.checks, GRADED_CHECKS.length);
  const cards = CHECKS.map((test): CheckCard => {
    const rows = s.checks.filter((c) => checkById(c.id).test === test);
    const row = ranked.map((id) => rows.find((r) => r.id === id)).find((r): r is CheckBand => !!r) ?? null;
    const band: BandWord | null = row ? row.band : rows.some((r) => r.band === null) ? null : 'green';
    return { test, band, row, top: !!row && s.priorities.includes(row.id) };
  });
  const firstTop = (c: CheckCard) => (c.top && c.row ? s.priorities.indexOf(c.row.id) : s.priorities.length);
  return cards.map((c, i) => ({ c, i })).sort((a, b) => (firstTop(a.c) - firstTop(b.c)) || (a.i - b.i)).map((x) => x.c);
}

/** A row's plain name without the check it belongs to: "Knees cave in (overhead squat)" → "Knees cave in". */
const rowName = (id: CheckId): string => checkById(id).name.replace(/\s*\([^)]*\)$/, '');

export function ResultsView({ summary, age, onClear, onRunAgain }: {
  summary: ScreenSummary; age: AgeBand | null; onClear: () => void; onRunAgain: () => void;
}) {
  const s = summary;
  if (isKid(age)) return <KidResults jumpIn={s.jumpBestIn} lastIn={null} onRunAgain={onRunAgain} />;
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
          {NOTHING_TO_RANK}
        </section>
      ) : null}

      <section>
        <h2 className="px-1 text-[13px] font-bold uppercase tracking-[0.14em] text-white/60">Your checks</h2>
        <ul data-check-cards className="mt-2 space-y-2">
          {checkCards(s).map(({ test, band, row, top }) => {
            const word = band ?? 'unread';
            const pad = top ? 'p-3.5' : 'px-3.5 py-2.5';
            const cueText = top ? 'text-[14px] text-white/85' : 'text-[13px] text-white/75';
            return (
              <li key={test} data-check-card={test} data-priority={top ? test : undefined} aria-label={`${SCREEN_TEST_NAMES[test]}: ${word === 'unread' ? 'not read' : word}`}
                className={`rounded-2xl border border-white/10 bg-white/[0.03] ${pad}`} style={{ borderLeft: `4px solid ${BAND_COLOUR[word]}` }}>
                {top ? <p data-top-priority className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/55">Top priority</p> : null}
                <p className={top ? 'text-[16px] font-black leading-snug' : 'text-[14.5px] font-bold leading-snug'}>{SCREEN_TEST_NAMES[test]}</p>
                <div className="mt-0.5"><BandChip band={band} /></div>
                {row ? (
                  <>
                    <p data-check-row={row.id} className="mt-1 text-[13.5px] font-bold leading-snug text-white/90">
                      {rowName(row.id)}
                      {row.sides ? (
                        <span className="ml-2 text-[12.5px] font-normal text-white/60">
                          Left: <SideWord band={row.sides.left} /> · Right: <SideWord band={row.sides.right} />
                        </span>
                      ) : null}
                    </p>
                    <p data-cue className={`mt-1 leading-snug ${cueText}`}>Try this: {cueOf(row.id)}<EarlyTag /></p>
                  </>
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

      <div data-next-step className="pt-1">
        {/* the one next step: a plain link (never next/link: no prefetch), a new tab, the address byte for byte */}
        <a href={KINDLE_BOOK_URL} target="_blank" rel="noopener noreferrer" data-cta="book" className={primaryBtn}>{KINDLE_BOOK_LABEL}</a>
      </div>
      <p data-screenshot-line className="pt-1 text-center text-[13px] text-white/70">{SCREENSHOT_LINE}</p>
      <p className="text-center text-[12.5px] text-white/60">
        <Link href={PRIVACY_PATH} prefetch={false} data-privacy-link className="underline">{PRIVACY_LINK}</Link>
      </p>
      <button type="button" onClick={onClear} data-done-clear className={quietBtn}>{DONE_CLEAR}</button>
    </div>
  );
}

function SideWord({ band }: { band: BandWord | null }) {
  return <span data-side-band={band ?? 'unread'} style={{ color: BAND_COLOUR[band ?? 'unread'] }}>{band ? BAND_WORDS[band] : UNREAD_WORD}</span>;
}
