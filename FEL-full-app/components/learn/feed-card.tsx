'use client';

// FeedCard — one screen of the Knowledge Feed. A lesson, a quiz, a "did you know", a recap, or one step of a "go
// deeper" sequence. Phone-first; the type scales up with the viewport so the same card reads from a sofa on a TV.

import Link from 'next/link';
import { Check, X, Repeat2, Brain } from 'lucide-react';
import { CardVisual, Motif } from './card-visual';
import { optionOrder } from '@/lib/knowledge/quiz';
import { NOT_ADVICE_LINE, topicById } from '@/lib/knowledge/topics';
import type { PlanReason } from '@/lib/knowledge/scheduler';
import type { Card } from '@/lib/knowledge/types';

export interface FeedSlide {
  key: string;
  card: Card;
  reason: PlanReason;
  /** For a "go deeper" sequence: which step this screen is. */
  step?: number;
}

const TYPE_LABEL: Record<Card['type'], string> = {
  lesson: 'Lesson', quiz: 'Quick quiz', fact: 'Did you know?', recap: 'Recap', deeper: 'Go deeper',
};

const H1 = 'font-black leading-[1.08] tracking-tight text-white text-[clamp(1.65rem,4.6vw,3.4rem)]';
const BODY = 'text-white/80 leading-snug text-[clamp(1.02rem,2.1vw,1.65rem)]';

export function FeedCard({
  slide, picked, focus, onPick, active, reduced,
}: {
  slide: FeedSlide;
  /** The authored index the viewer picked on this screen, if any. */
  picked: number | undefined;
  /** The focused option's display index (keyboard/pad), if any. */
  focus: number | null;
  onPick: (authoredIndex: number) => void;
  active: boolean;
  reduced: boolean;
}) {
  const { card } = slide;
  const topic = topicById(card.topic);
  const accent = topic.accent;
  const deeperOf = card.type === 'deeper' ? card.steps.length : 0;
  const label = card.type === 'deeper' ? `${TYPE_LABEL.deeper} · ${(slide.step ?? 0) + 1} of ${deeperOf}` : TYPE_LABEL[card.type];

  return (
    <article
      className="mx-auto flex h-full w-full max-w-[min(100%,62rem)] flex-col justify-center gap-[clamp(0.9rem,2.4vh,1.8rem)]"
      style={{
        opacity: active || reduced ? 1 : 0.35,
        transform: active || reduced ? 'none' : 'scale(0.97)',
        transition: reduced ? 'none' : 'opacity 260ms ease, transform 260ms ease',
      }}
      aria-roledescription="card"
      aria-label={`${topic.label}: ${label}`}
      data-card-type={card.type}
      data-card-id={card.id}
    >
      <header className="flex flex-wrap items-center gap-2">
        <span className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] md:text-sm"
          style={{ color: accent, background: `${accent}18`, boxShadow: `inset 0 0 0 1px ${accent}44` }}>
          {topic.label}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45 md:text-sm">{label}</span>
        {slide.reason === 'review' && (
          <span className="flex items-center gap-1 rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70 md:text-sm">
            <Repeat2 className="h-3.5 w-3.5" /> Review
          </span>
        )}
      </header>

      {card.type === 'lesson' && (
        <>
          <h2 className={H1}>{card.headline}</h2>
          <div className="flex min-h-[7rem] items-center justify-center py-1"><CardVisual visual={card.visual} accent={accent} /></div>
          <div className="space-y-2.5">{card.lines.map((l) => <p key={l} className={BODY}>{l}</p>)}</div>
        </>
      )}

      {card.type === 'fact' && (
        <>
          <p className="text-[clamp(0.85rem,1.6vw,1.2rem)] font-bold uppercase tracking-[0.2em]" style={{ color: accent }}>Did you know?</p>
          <h2 className={H1}>{card.headline}</h2>
          <div className="flex min-h-[6rem] items-center justify-center py-1">
            {card.visual ? <CardVisual visual={card.visual} accent={accent} /> : <Motif motif={topic.motif} accent={accent} />}
          </div>
          <p className={BODY}>{card.text}</p>
        </>
      )}

      {card.type === 'recap' && (
        <>
          <h2 className={H1}>{card.headline}</h2>
          <ol className="space-y-2.5">
            {card.points.map((p, i) => (
              <li key={p} className="flex gap-3">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-black text-black md:h-9 md:w-9 md:text-base" style={{ background: accent }}>{i + 1}</span>
                <span className={BODY}>{p}</span>
              </li>
            ))}
          </ol>
          <TestYourself accent={accent} />
        </>
      )}

      {card.type === 'deeper' && (() => {
        const i = slide.step ?? 0;
        const step = card.steps[i];
        return (
          <>
            <p className="text-[clamp(0.85rem,1.6vw,1.2rem)] font-bold uppercase tracking-[0.18em]" style={{ color: accent }}>{card.headline}</p>
            <h2 className={H1}>{step.headline}</h2>
            <div className="flex min-h-[6rem] items-center justify-center py-1">
              {step.visual ? <CardVisual visual={step.visual} accent={accent} /> : <Motif motif={topic.motif} accent={accent} size={84} />}
            </div>
            <div className="space-y-2.5">{step.lines.map((l) => <p key={l} className={BODY}>{l}</p>)}</div>
            <div className="flex gap-1.5" aria-hidden>
              {card.steps.map((_, k) => (
                <span key={k} className="h-1.5 flex-1 rounded-full" style={{ background: k <= i ? accent : 'rgba(255,255,255,0.14)' }} />
              ))}
            </div>
          </>
        );
      })()}

      {card.type === 'quiz' && (
        <QuizBody card={card} picked={picked} focus={focus} onPick={onPick} accent={accent} />
      )}

      <footer className="space-y-1 pt-1">
        {topic.notAdvice && <p className="text-[11px] font-semibold text-amber-200/70 md:text-sm">{NOT_ADVICE_LINE[topic.notAdvice]}</p>}
        <p className="line-clamp-2 text-[10.5px] leading-snug md:text-[13px]" style={{ color: 'rgba(255,255,255,0.42)' }}>Source: {card.source}</p>
      </footer>
    </article>
  );
}

function QuizBody({ card, picked, focus, onPick, accent }: {
  card: Extract<Card, { type: 'quiz' }>; picked: number | undefined; focus: number | null; onPick: (i: number) => void; accent: string;
}) {
  const order = optionOrder(card);
  const answered = picked !== undefined;
  const right = answered && picked === card.answer;
  return (
    <>
      <h2 className={H1}>{card.question}</h2>
      <div className="grid gap-2.5 md:grid-cols-2 md:gap-3" role="group" aria-label="Answers">
        {order.map((authored, display) => {
          const isAnswer = authored === card.answer;
          const isPicked = authored === picked;
          const tone = !answered ? 'idle' : isAnswer ? 'right' : isPicked ? 'wrong' : 'dim';
          return (
            <button
              key={authored}
              type="button"
              disabled={answered}
              onClick={() => onPick(authored)}
              data-quiz-option={display}
              aria-pressed={isPicked}
              className="flex min-h-[3.4rem] items-center gap-3 rounded-2xl border px-4 py-3 text-left text-[clamp(1rem,1.9vw,1.45rem)] font-semibold transition-colors md:min-h-[4.2rem]"
              style={{
                borderColor: tone === 'right' ? '#3DDC97' : tone === 'wrong' ? '#FF6A5B' : focus === display ? accent : 'rgba(255,255,255,0.14)',
                background: tone === 'right' ? 'rgba(61,220,151,0.14)' : tone === 'wrong' ? 'rgba(255,106,91,0.14)' : focus === display ? `${accent}1c` : 'rgba(255,255,255,0.04)',
                color: tone === 'dim' ? 'rgba(255,255,255,0.4)' : '#fff',
                outline: focus === display && !answered ? `2px solid ${accent}` : 'none',
                outlineOffset: 2,
              }}
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/10 font-mono text-[13px] md:h-9 md:w-9 md:text-base">
                {tone === 'right' ? <Check className="h-4 w-4 text-[#3DDC97]" /> : tone === 'wrong' ? <X className="h-4 w-4 text-[#FF6A5B]" /> : display + 1}
              </span>
              <span>{card.options[authored]}</span>
            </button>
          );
        })}
      </div>
      <div aria-live="polite" className="min-h-[3.5rem]">
        {answered && (
          <div className="rounded-2xl border px-4 py-3" style={{ borderColor: right ? '#3DDC9766' : '#FF6A5B66', background: right ? 'rgba(61,220,151,0.08)' : 'rgba(255,106,91,0.08)' }}>
            <p className="text-[clamp(1rem,1.8vw,1.35rem)] font-black" style={{ color: right ? '#3DDC97' : '#FF6A5B' }}>
              {right ? 'Right!' : 'Not quite — it comes back for review.'}
            </p>
            <p className="mt-1 text-[clamp(0.95rem,1.7vw,1.3rem)] leading-snug text-white/80">{card.why}</p>
          </div>
        )}
      </div>
    </>
  );
}

export function TestYourself({ accent }: { accent: string }) {
  return (
    <Link href="/play/brain-brawl"
      className="inline-flex items-center gap-2 self-start rounded-full border px-4 py-2 text-[13px] font-bold text-white md:text-base"
      style={{ borderColor: `${accent}77`, background: `${accent}14` }}>
      <Brain className="h-4 w-4" style={{ color: accent }} /> Test yourself in Brain Brawl
    </Link>
  );
}
