// The Quick Screen's results (SCREEN-SHIP, 2026-09-29; SCREEN-FIX; SCREEN-FIX-2), rendered from the device-side summary
// only (lib/screen/checks): the same cards on the first paint and after a refresh, "Back to my results" or the browser's
// Back, because both read the one summary (A4-5).
//
// 18 OR OLDER, in order, portrait first — SCREEN-EASY (2026-10-28): ONE screen, the rest behind "More detail":
//   the "not a medical exam" line ONCE, "If anything hurts, stop." and "Early version", above the fold (gate 3, S-13)
//   THE BIG READ: one word for the whole screen from the cards' own bands — "Good to go" on a real clean screen (the win
//   card, A4-4), "Two things to work on", or "Not fully read" with the line saying there is nothing to rank yet
//   the top 1–2 PRIORITY cards (TOP_PRIORITIES; at most 3 by the owner's rule): what we saw (the row, each side), what it
//   means, what to do next (ONE drill cue), the replay and the demo slot — docs/CUE-STYLE.md §4
//   EXACTLY ONE NEXT STEP (L5, retest 1): the Kindle book, a plain link that opens a new tab (no prefetch, no query)
//   "More detail": ONE CARD PER OTHER CHECK (S-4, retest 1; each with its worst band, icon + word + colour), the jump as a
//   personal best to beat (never a band), "Screenshot this to keep your results." and the privacy page
//   then "Done, clear my results" (A4-6). Nothing else: no Dunk Program button, no free game, no save button, no coach
//   link, no sign-up prompt, no email box.
//
// UNDER 18, OR "RATHER NOT SAY": never these cards. Their results never reach this address (nothing is kept for them:
// lib/screen/store.ts), so this is only a guard: a kid's age gets the kid view, their number and nothing else.
import Link from 'next/link';
import { priorities, type CheckBand, type ScreenSummary } from '@/lib/screen/checks';
import { BAND_WORDS, cueOf, checkById, GRADED_CHECKS, type BandWord, type CheckId } from '@/lib/screen/PROPOSED-thresholds';
import { isKid, type AgeBand } from '@/lib/screen/age';
import { PRIVACY_PATH } from '@/lib/screen/routes';
import {
  CHECK_MEANING, DISCLAIMER, DONE_CLEAR, GREEN_MEANING, GREEN_NEXT, KINDLE_BOOK_LABEL, KINDLE_BOOK_URL, NOTHING_TO_RANK,
  PRIVACY_LINK, SCREENSHOT_LINE, SCREEN_TEST_NAMES, TRY_THIS, TRUST_INFO_LINE, TRUST_WORDS, UNREAD_MEANING, UNREAD_NEXT, WIN_LINE,
  JUMP_BEST_MEANS, JUMP_BEST_NEXT,
} from '@/lib/screen/copy';
import { BandChip, EarlyTag, PreviewLabel, StopLine, TrustChip, TrustReasonLine, primaryBtn, quietBtn, BAND_COLOUR } from './screen-ui';
import { worstTrust } from '@/lib/screen/trust-rows';
import { ChevronDown } from 'lucide-react';
import { MORE_DETAIL, OVERALL_WORK_LINE } from '@/lib/screen-easy/copy';
import { KidResults } from './kid-results';
import { DrillDemo } from './drill-demo';
import { FaultReplay } from './fault-replay';
import { pickReplay } from '@/lib/screen/rep-memory';
import type { FrozenRep } from '@/lib/assess/scoring';
import { aboutInches } from '@/lib/screen/jump';   // EDU-LINKS (2026-10-07): the demo slot, filled with the 3D ExerciseDemo

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

export function ResultsView({ summary, age, onClear, onRunAgain, trainWithElijahHref = null, replay = null }: {
  summary: ScreenSummary; age: AgeBand | null; onClear: () => void; onRunAgain: () => void;
  /** MIRROR step 2: the frozen worst-rep frames held in page memory (lib/screen/rep-memory.ts); drawn for adults only. */
  replay?: readonly FrozenRep[] | null;
  /** Set by the server only for a verified adult while the coach store is on. Hidden for a kid answer. */
  trainWithElijahHref?: string | null;
}) {
  const s = summary;
  if (isKid(age)) return <KidResults jumpIn={s.jumpBestIn} lastIn={null} onRunAgain={onRunAgain} />;
  const jumpTrust = s.trust?.find((r) => r.id === 'jump.height') ?? null;
  const cards = checkCards(s);
  // SCREEN-EASY (2026-10-28): ONE screen — the big read, then at most TOP_PRIORITIES priority cards, each what we saw /
  // what it means / what to do next (docs/CUE-STYLE.md §4), then the one next step. Everything else (the other checks,
  // the jump, the screenshot line, the privacy page) sits behind "More detail". The cards and words are the same ones.
  const top = cards.filter((c) => c.top);
  const rest = cards.filter((c) => !c.top);
  const read = overallRead(s);
  const card = ({ test, band, row, top: isTop }: CheckCard, idx: number) => {
    const word = band ?? 'unread';
    const pad = isTop ? 'p-3.5' : 'px-3.5 py-2.5';
    const cueText = isTop ? 'text-[16px] text-white/85' : 'text-[16px] text-white/75';
    // MIRROR-TRUST-RATING: the card's trust is its worst row's (a sided row: its worse side); the jump height has its own block
    const trust = s.trust ? worstTrust(s.trust.filter((r) => r.id !== 'jump.height' && checkById(r.id).test === test)) : null;
    return (
      <li key={test} data-check-card={test} data-priority={isTop ? test : undefined} aria-label={`${SCREEN_TEST_NAMES[test]}: ${word === 'unread' ? 'not read' : word}${trust ? `, ${TRUST_WORDS[trust.level]}` : ''}`}
        className={`rounded-2xl border border-white/10 bg-white/[0.03] ${pad}`} style={{ borderLeft: `4px solid ${BAND_COLOUR[word]}` }}>
        {isTop ? <p data-top-priority className="text-[16px] font-bold uppercase tracking-[0.14em] text-white/55">Top priority</p> : null}
        <p className={isTop ? 'text-[16px] font-black leading-snug' : 'text-[16px] font-bold leading-snug'}>{SCREEN_TEST_NAMES[test]}</p>
        <div className="mt-0.5"><BandChip band={band} /></div>
        {trust ? (
          <div data-trust-row className="mt-0.5">
            <TrustChip level={trust.level} reasons={trust.reasons} />
            <TrustReasonLine level={trust.level} reasons={trust.reasons} />
          </div>
        ) : null}
        {row ? (
          <>
            <p data-check-row={row.id} className="mt-1 text-[16px] font-bold leading-snug text-white/90">
              {rowName(row.id)}
            </p>
            {row.sides ? <SideRow left={row.sides.left} right={row.sides.right} /> : null}
            {/* CUE-REWRITE (2026-10-27): what it means, then the one next step (docs/CUE-STYLE.md) */}
            <p data-means className={`mt-1 leading-snug ${cueText}`}>{CHECK_MEANING[row.id]}</p>
            <p data-cue className={`mt-1 leading-snug ${cueText}`}><b>{TRY_THIS}</b> {cueOf(row.id)}<EarlyTag /></p>
          </>
        ) : (
          <>
            <p data-means className={`mt-1 leading-snug ${cueText}`}>{band === 'green' ? GREEN_MEANING : UNREAD_MEANING}</p>
            <p data-next className={`mt-1 leading-snug ${cueText}`}>{band === 'green' ? GREEN_NEXT : UNREAD_NEXT}</p>
          </>
        )}
        {isTop && idx === 0 ? (() => {   // the replay: the TOP-RANKED card only (first in sort order; a tie goes to the first)
          const rep = pickReplay(replay, row);
          return rep ? <FaultReplay rep={rep} /> : null;
        })() : null}
        {isTop ? (
          <div data-demo-slot className="mt-2">
            <DrillDemo test={test} drill={row ? cueOf(row.id) : SCREEN_TEST_NAMES[test]} />
          </div>
        ) : null}
      </li>
    );
  };
  return (
    <div data-screen-results className="space-y-3">
      <div className="space-y-1">
        <p data-disclaimer className="text-[16px] font-bold leading-snug text-white">{DISCLAIMER}</p>
        <StopLine />
        <PreviewLabel line={false} />
      </div>

      {/* the big read: one word for the whole screen, from the same bands (never a score) */}
      <section data-overall={read.kind} {...(s.clean ? { 'data-win-card': true } : {})} {...(read.kind === 'unread' ? { 'data-no-pick': true } : {})}
        className="rounded-3xl border p-4" style={{ borderColor: `${BAND_COLOUR[read.colour]}66`, background: `${BAND_COLOUR[read.colour]}0f` }}>
        <p data-overall-word className="text-[clamp(30px,9vw,40px)] font-black leading-none" style={{ color: BAND_COLOUR[read.colour] }}>{read.word}</p>
        <p className="mt-2 text-[16px] font-bold leading-snug text-white/85">{read.line}</p>
      </section>

      {/* MIRROR-TRUST-RATING: the one info line, above the cards and "Your checks" */}
      {s.trust?.length ? <p data-trust-info className="px-1 text-[16px] leading-snug text-white/70">{TRUST_INFO_LINE}</p> : null}
      {top.length ? <ul data-check-cards data-priorities className="space-y-2">{top.map(card)}</ul> : null}

      <div data-next-step className="pt-1">
        {/* the one next step: a plain link (never next/link: no prefetch), a new tab, the address byte for byte */}
        <a href={KINDLE_BOOK_URL} target="_blank" rel="noopener noreferrer" data-cta="book" data-primary className={primaryBtn}>{KINDLE_BOOK_LABEL}</a>
      </div>

      <details data-more-detail className="group rounded-2xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-[16px] font-bold text-white/80">
          {MORE_DETAIL}<ChevronDown aria-hidden className="h-5 w-5 transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-3 pb-1 pt-2">
          <h2 className="px-1 text-[16px] font-bold uppercase tracking-[0.14em] text-white/60">Your checks</h2>
          {rest.length ? <ul data-check-cards className="space-y-2">{rest.map((c, i) => card(c, top.length + i))}</ul> : null}
          {s.jumpBestIn !== null ? (
            <section data-personal-best className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              {jumpTrust?.level === 'low' ? (
                // a Low jump hides the inches and shows only the reason (MIRROR-TRUST-RATING §5)
                <div data-jump-trust-hidden>
                  <TrustChip level="low" reasons={jumpTrust.reasons} />
                  <TrustReasonLine level="low" reasons={jumpTrust.reasons} />
                </div>
              ) : (
                <>
                  <p className="text-[16px] text-white/80">Your best jump: <b className="text-[16px] text-white">{aboutInches(s.jumpBestIn)}</b></p>
                  {jumpTrust ? (
                    <div data-trust-row className="mt-0.5">
                      <TrustChip level={jumpTrust.level} reasons={jumpTrust.reasons} />
                      <TrustReasonLine level={jumpTrust.level} reasons={jumpTrust.reasons} />
                    </div>
                  ) : null}
                  <p data-means className="text-[16px] text-white/70">{JUMP_BEST_MEANS}</p>
                  <p data-next className="text-[16px] text-white/55">{JUMP_BEST_NEXT}</p>
                </>
              )}
            </section>
          ) : null}
          {trainWithElijahHref && !isKid(age) ? (
            <p className="text-center text-[16px]">
              <a href={trainWithElijahHref} data-train-with-elijah>Train with Elijah</a>
            </p>
          ) : null}
          <p data-screenshot-line className="text-center text-[16px] text-white/70">{SCREENSHOT_LINE}</p>
          <p className="text-center text-[16px] text-white/60">
            <Link href={PRIVACY_PATH} prefetch={false} data-privacy-link className="underline">{PRIVACY_LINK}</Link>
          </p>
        </div>
      </details>
      <button type="button" onClick={onClear} data-done-clear className={quietBtn}>{DONE_CLEAR}</button>
    </div>
  );
}

/**
 * SCREEN-EASY: the whole screen in one word, from the bands the cards already carry — Good to go (a clean screen), the
 * number of priorities to work on (Red when the first one is Red), or Not fully read. Never a score.
 */
export function overallRead(s: ScreenSummary): { kind: 'clean' | 'work' | 'unread'; word: string; line: string; colour: BandWord | 'unread' } {
  if (s.clean) return { kind: 'clean', word: BAND_WORDS.green, line: WIN_LINE, colour: 'green' };
  if (s.priorities.length) {
    const n = s.priorities.length;
    const first: BandWord = s.checks.find((c) => c.id === s.priorities[0])?.band ?? 'yellow';
    return { kind: 'work', word: n === 1 ? 'One thing to work on' : `${n === 2 ? 'Two' : 'Three'} things to work on`, line: OVERALL_WORK_LINE, colour: first };
  }
  return { kind: 'unread', word: 'Not fully read', line: NOTHING_TO_RANK, colour: 'unread' };
}

/** UX advice §4: left and right side by side, each with its own chip (icon + word + colour, never colour alone). No gap chip. */
function SideRow({ left, right }: { left: BandWord | null; right: BandWord | null }) {
  return (
    <div data-side-row className="mt-1.5 grid grid-cols-2 gap-2">
      {([['left', 'Left', left], ['right', 'Right', right]] as const).map(([key, label, band]) => (
        <div key={key} data-side={key} data-side-band={band ?? 'unread'} className="rounded-xl border border-white/10 bg-white/[0.02] px-2.5 py-1.5">
          <p className="text-[16px] font-bold text-white/60">{label}</p>
          <BandChip band={band} />
        </div>
      ))}
    </div>
  );
}
