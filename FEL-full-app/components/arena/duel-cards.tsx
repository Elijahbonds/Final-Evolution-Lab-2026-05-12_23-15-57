'use client';

// WHAT THE OTHER PLAYER THREW (2026-09-13).
//
// Owner: "in multiplayer we should see other peoples dunk and score."
//
// An Arena duel stored two integers, so the only thing a result screen could ever say was "214 v 198". This
// renders both cards side by side: every attempt, the dunk that was thrown, the three judges' scores, and
// one line naming the thing that actually decided it.
//
// Two rules the component enforces because they are player-facing, not cosmetic:
//   · the opponent's card is HIDDEN until you have posted your own score, and it says so rather than showing
//     an empty panel. Reading someone's dunks before your run turns an async duel into a target list.
//   · a card that cannot be parsed degrades to the score. Cards live in a JSON column that outlives deploys,
//     and a results screen must never white-screen on one written by an older build.

import { parseCard, attemptLine, cardHeadline, duelSummary, type DunkCard } from '@/lib/mp/dunkCard';

export function DuelCards(props: {
  myScore: number | null;
  oppScore: number | null;
  myCard: unknown;
  oppCard: unknown;
  oppCardLocked: boolean;
  oppName?: string;
}) {
  const mine = parseCard(props.myCard);
  const theirs = parseCard(props.oppCard);
  const them = props.oppName || 'OPPONENT';

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <CardPanel title="YOU" score={props.myScore} card={mine} tint="#00E5FF" />
      {props.oppCardLocked ? (
        <div className="rounded-xl border border-white/10 bg-black/40 p-3">
          <p className="text-[10px] font-black tracking-[0.3em] text-white/45">{them}</p>
          <p className="mt-2 text-sm text-white/70">
            Their card unlocks once you&rsquo;ve posted your score.
          </p>
          <p className="mt-1 text-[11px] leading-snug text-white/40">
            You shouldn&rsquo;t get to see the dunks you have to beat before you take your run.
          </p>
        </div>
      ) : (
        <CardPanel title={them} score={props.oppScore} card={theirs} tint="#FF3366" />
      )}

      {mine && theirs && (
        <p className="sm:col-span-2 rounded-lg bg-white/5 px-3 py-2 text-center font-mono text-[12px] text-white/80">
          {duelSummary(mine, theirs)}
        </p>
      )}
    </div>
  );
}

function CardPanel({ title, score, card, tint }: { title: string; score: number | null; card: DunkCard | null; tint: string }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: `${tint}33`, background: 'rgba(5,6,10,0.55)' }}>
      <p className="text-[10px] font-black tracking-[0.3em]" style={{ color: tint }}>{title}</p>

      {/* the score is ALWAYS shown, card or no card — that is the fallback for a run posted by an older build */}
      <p className="mt-1 text-3xl font-black text-white">{score ?? '—'}</p>

      {card ? (
        <>
          <p className="mt-0.5 text-[11px] text-white/50">{cardHeadline(card, '').replace(/^ — /, '')}</p>
          <ul className="mt-2 space-y-1">
            {card.attempts.map((a, i) => (
              <li
                key={i}
                className="flex items-baseline justify-between gap-2 font-mono text-[11px]"
                style={{ opacity: a.made ? 1 : 0.55 }}
              >
                <span className="text-white/75">{attemptLine(a)}</span>
                {!a.made && <span className="text-[10px] font-bold text-rose-300">MISS</span>}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-2 text-[11px] text-white/40">No card for this run.</p>
      )}
    </div>
  );
}
