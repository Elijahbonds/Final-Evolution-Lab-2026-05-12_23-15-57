'use client';

// LearnWhileYouWait — one Knowledge Feed card for an idle moment: a loading screen, the end of a match, a lobby.
// Self-contained so any surface can drop it in with one line: <LearnWhileYouWait />. (The end-screen lane moves it into
// its side-card slot at merge; this component needs nothing from where it is mounted.)
//
// The catalogue is imported LAZILY, so a game route doesn't carry ~200 cards in its first load. It reads and writes
// the same on-device progress as /learn, so a card answered here counts toward today's goal and won't repeat soon.
// Before onboarding it draws from every topic open to the viewer.

import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SessionContext } from 'next-auth/react';
import { ArrowRight, Check, X } from 'lucide-react';
import type { PlanItem } from '@/lib/knowledge/scheduler';
import type { LearnState } from '@/lib/knowledge/state';
import type { Card } from '@/lib/knowledge/types';

type Mods = {
  catalog: typeof import('@/lib/knowledge/catalog');
  scheduler: typeof import('@/lib/knowledge/scheduler');
  state: typeof import('@/lib/knowledge/state');
  storage: typeof import('@/lib/knowledge/storage');
  day: typeof import('@/lib/knowledge/day');
  topics: typeof import('@/lib/knowledge/topics');
  quiz: typeof import('@/lib/knowledge/quiz');
  access: typeof import('@/lib/knowledge/access');
  sync: typeof import('@/lib/knowledge/syncClient');
};

let modsPromise: Promise<Mods> | null = null;
function loadMods(): Promise<Mods> {
  modsPromise ??= Promise.all([
    import('@/lib/knowledge/catalog'), import('@/lib/knowledge/scheduler'), import('@/lib/knowledge/state'),
    import('@/lib/knowledge/storage'), import('@/lib/knowledge/day'), import('@/lib/knowledge/topics'), import('@/lib/knowledge/quiz'),
    import('@/lib/knowledge/access'), import('@/lib/knowledge/syncClient'),
  ]).then(([catalog, scheduler, state, storage, day, topics, quiz, access, sync]) => ({ catalog, scheduler, state, storage, day, topics, quiz, access, sync }));
  return modsPromise;
}

export function LearnWhileYouWait({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  // the context, not useSession(): this renders outside a SessionProvider in tests (and must not throw there)
  const session = useContext(SessionContext);
  const status = session?.status ?? 'unauthenticated';
  const signedIn = status === 'authenticated';
  // KNOWLEDGE-FEED v2: a device /learn has linked to this account also sends the idle card's views and answers up
  const userId = (session?.data?.user as { id?: string } | undefined)?.id ?? null;
  const [mods, setMods] = useState<Mods | null>(null);
  const [item, setItem] = useState<PlanItem | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const shownAt = useRef(Date.now());
  const rng = useRef<(() => number) | null>(null);

  const draw = useCallback((m: Mods, exclude?: string) => {
    const s: LearnState = m.storage.loadState();
    const st = exclude ? { ...s, recent: [...s.recent, exclude] } : s;
    const now = Date.now();
    rng.current ??= m.scheduler.seeded((now ^ 0x2545f491) >>> 0);
    const all = m.topics.availableTopics(signedIn).map((t) => t.id);
    const allowed = new Set(all);
    const scoped = { ...st, topics: st.topics.filter((t) => allowed.has(t)) };
    setItem(m.scheduler.pickIdle(m.access.visibleCards(m.catalog.CARDS, signedIn), scoped, m.day.localDay(now), now, rng.current, all) ?? null);
    setPicked(null);
    shownAt.current = now;
  }, [signedIn]);

  useEffect(() => {
    if (status === 'loading') return;
    let alive = true;
    loadMods().then((m) => { if (alive) { setMods(m); draw(m); } }).catch(() => { /* the card is a bonus; no card, no harm */ });
    return () => { alive = false; };
  }, [status, draw]);

  if (!mods || !item) return null;
  const card: Card = item.card;
  const topic = mods.topics.topicById(card.topic);
  const accent = topic.accent;

  const next = () => {
    const s = mods.storage.loadState();
    const today = mods.day.localDay();
    const dwellMs = Date.now() - shownAt.current;
    mods.storage.saveState(mods.state.recordView(s, card, today, Date.now(), dwellMs));
    if (mods.sync.isLinked(userId)) void mods.sync.postEvent(today, { kind: 'view', cardId: card.id, dwellMs });
    draw(mods, card.id);
  };

  const answer = (authored: number) => {
    if (card.type !== 'quiz' || picked !== null) return;
    setPicked(authored);
    const s = mods.storage.loadState();
    mods.storage.saveState(mods.state.recordAnswer(s, card, authored === card.answer, mods.day.localDay(), Date.now()));
    if (mods.sync.isLinked(userId)) void mods.sync.postEvent(mods.day.localDay(), { kind: 'answer', cardId: card.id, choice: authored });
  };

  const text = card.type === 'lesson' ? card.lines.slice(0, compact ? 1 : 2).join(' ')
    : card.type === 'fact' ? card.text
      : card.type === 'recap' ? card.points.slice(0, 2).join(' · ')
        : '';
  const headline = card.type === 'quiz' ? card.question : card.headline;

  return (
    <aside
      className={`w-full max-w-sm rounded-2xl border p-3.5 text-left ${className}`}
      style={{ borderColor: `${accent}44`, background: 'rgba(5,6,10,0.78)', backdropFilter: 'blur(8px)', fontFamily: 'var(--font-sans, ui-sans-serif)' }}
      aria-label="Learn while you wait"
      data-learn-idle
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Learn while you wait</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: accent }}>{topic.label}</span>
      </div>
      <p className="mt-1.5 text-[14px] font-bold leading-snug text-white">{card.type === 'fact' ? `Did you know? ${headline}` : headline}</p>
      {text && <p className="mt-1 text-[12.5px] leading-snug text-white/70">{text}</p>}

      {card.type === 'quiz' && (
        <div className="mt-2 grid gap-1.5">
          {mods.quiz.optionOrder(card).map((authored) => {
            const tone = picked === null ? 'idle' : authored === card.answer ? 'right' : authored === picked ? 'wrong' : 'dim';
            return (
              <button key={authored} type="button" disabled={picked !== null} onClick={() => answer(authored)}
                className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[12.5px] font-semibold"
                style={{
                  borderColor: tone === 'right' ? '#3DDC97' : tone === 'wrong' ? '#FF6A5B' : 'rgba(255,255,255,0.12)',
                  color: tone === 'dim' ? 'rgba(255,255,255,0.4)' : '#fff',
                }}>
                {tone === 'right' ? <Check className="h-3.5 w-3.5 text-[#3DDC97]" /> : tone === 'wrong' ? <X className="h-3.5 w-3.5 text-[#FF6A5B]" /> : null}
                {card.options[authored]}
              </button>
            );
          })}
          {picked !== null && <p className="text-[12px] leading-snug text-white/70">{card.why}</p>}
        </div>
      )}

      {topic.notAdvice && <p className="mt-1.5 text-[10.5px] text-amber-200/60">{mods.topics.NOT_ADVICE_LINE[topic.notAdvice]}</p>}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <button type="button" onClick={next} className="rounded-full bg-white/10 px-3 py-1 text-[12px] font-bold text-white hover:bg-white/20">
          {card.type === 'quiz' && picked === null ? 'Skip' : 'Next card'}
        </button>
        {!compact && (
          <Link href="/learn" className="flex items-center gap-1 text-[12px] font-bold" style={{ color: accent }}>
            Open the feed <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </aside>
  );
}
