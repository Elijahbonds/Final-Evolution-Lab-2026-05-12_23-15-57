'use client';

// LearnFeed — the Knowledge Feed at /learn (KNOWLEDGE-FEED v1, owner 2026-10-06; docs/KNOWLEDGE-FEED.md).
//
// A full-screen vertical timeline, one card per screen, CSS scroll-snap so a thumb swipe or a mouse wheel moves one
// card; arrows/j/k/space and a gamepad's d-pad move exactly one card through lib/knowledge/feedNav. What comes next is
// lib/knowledge/scheduler (new cards from your topics, spaced reviews of quizzes, weighted by what you like).
//
// Safety, by construction: no user-generated content, no comments, no followers, nothing uploaded. Progress lives on
// this device (lib/knowledge/storage). Rewards are learning XP and a streak — never coins or shards for scrolling.

import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SessionContext } from 'next-auth/react';
import { toast } from 'sonner';
import { BarChart3, Bookmark, ChevronUp, EyeOff, Flame, Heart, Share2, SlidersHorizontal, X } from 'lucide-react';
import { CARDS } from '@/lib/knowledge/catalog';
import { availableTopics } from '@/lib/knowledge/topics';
import { planFeed, seeded, type PlanItem } from '@/lib/knowledge/scheduler';
import {
  lessOfThis, recordAnswer, recordView, setTopics, toggleLike, toggleSave, freshState, type LearnState,
} from '@/lib/knowledge/state';
import { clearState, loadState, saveState } from '@/lib/knowledge/storage';
import { DAILY_GOAL, doneToday, liveStreak, localDay } from '@/lib/knowledge/day';
import { keyAction, moveFocus, padActions, padStateFrom, freshTracker, stepIndex, type NavAction } from '@/lib/knowledge/feedNav';
import { optionOrder, shareText } from '@/lib/knowledge/quiz';
import { readPad } from '@/lib/input/profiles';
import { motionPolicy, onMotionChange } from '@/lib/a11y/reducedMotion';
import { FeedCard, TestYourself, type FeedSlide } from './feed-card';
import { TopicPicker } from './topic-picker';
import { GoalRing, ProgressView } from './progress-view';
import type { TopicId } from '@/lib/knowledge/types';

type View = 'feed' | 'picker' | 'topics' | 'progress';
const FIRST_BATCH = 10;
const NEXT_BATCH = 8;
const REFILL_WHEN_LEFT = 4;

export function LearnFeed() {
  // the context, not useSession(): this renders outside a SessionProvider in tests (and must not throw there)
  const status = useContext(SessionContext)?.status ?? 'unauthenticated';
  const signedIn = status === 'authenticated';
  const [state, setState] = useState<LearnState | null>(null);
  const [view, setView] = useState<View>('feed');
  const [slides, setSlides] = useState<FeedSlide[]>([]);
  const [exhausted, setExhausted] = useState(false);
  const [active, setActive] = useState(0);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [focus, setFocus] = useState<number | null>(null);
  const [reduced, setReduced] = useState(false);

  const scroller = useRef<HTMLDivElement>(null);
  const stateRef = useRef<LearnState | null>(null);
  const slidesRef = useRef<FeedSlide[]>([]);
  const seq = useRef(0);
  const rng = useRef(seeded((Date.now() ^ 0x5f3759df) >>> 0));
  const entered = useRef({ index: 0, at: Date.now() });
  slidesRef.current = slides;
  stateRef.current = state;

  const update = useCallback((fn: (s: LearnState) => LearnState) => {
    const prev = stateRef.current;
    if (!prev) return;
    const next = fn(prev);
    if (next === prev) return;
    stateRef.current = next;
    saveState(next);
    setState(next);
    const day = localDay();
    if (doneToday(prev.today, day) < DAILY_GOAL && doneToday(next.today, day) >= DAILY_GOAL) {
      toast.success(`Daily goal done — ${DAILY_GOAL} cards. ${liveStreak(next.streak, day)}-day streak.`);
    }
  }, []);

  const expand = useCallback((items: PlanItem[]): FeedSlide[] => items.flatMap((it): FeedSlide[] => (
    it.card.type === 'deeper'
      ? it.card.steps.map((_, i) => ({ key: `${it.card.id}#${++seq.current}`, card: it.card, reason: it.reason, step: i }))
      : [{ key: `${it.card.id}#${++seq.current}`, card: it.card, reason: it.reason }]
  )), []);

  const plan = useCallback((s: LearnState, existing: FeedSlide[], count: number): PlanItem[] => {
    const allowed = new Set(availableTopics(signedIn).map((t) => t.id));
    const tail: PlanItem[] = [];
    for (const x of existing.slice(-6)) if (tail[tail.length - 1]?.card.id !== x.card.id) tail.push({ card: x.card, reason: x.reason });
    return planFeed({
      catalog: CARDS,
      state: { ...s, topics: s.topics.filter((t) => allowed.has(t)) },
      today: localDay(),
      nowMs: Date.now(),
      count,
      rng: rng.current,
      exclude: new Set(existing.map((x) => x.card.id)),
      tail,
    });
  }, [signedIn]);

  const goTo = useCallback((i: number) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: i * el.clientHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [reduced]);

  const restart = useCallback((s: LearnState) => {
    const first = expand(plan(s, [], FIRST_BATCH));
    setSlides(first);
    setExhausted(first.length === 0);
    setPicks({});
    setActive(0);
    setFocus(null);
    entered.current = { index: 0, at: Date.now() };
    scroller.current?.scrollTo({ top: 0 });
  }, [expand, plan]);

  // ── load (client only: storage is per device), once the session is known so the Playbook topic resolves ──
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current || status === 'loading') return;
    loaded.current = true;
    const s = loadState();
    stateRef.current = s;
    setState(s);
    if (s.onboarded) restart(s); else setView('picker');
  }, [status, restart]);

  useEffect(() => {
    setReduced(motionPolicy().reduced);
    return onMotionChange(() => setReduced(motionPolicy().reduced));
  }, []);

  // ── dwell: record the card you leave, with how long you stayed ──
  const recordLeave = useCallback((index: number, dwellMs: number) => {
    const slide = slidesRef.current[index];
    if (slide) update((s) => recordView(s, slide.card, localDay(), Date.now(), dwellMs));
  }, [update]);

  useEffect(() => {
    const prev = entered.current;
    if (prev.index === active) return;
    recordLeave(prev.index, Date.now() - prev.at);
    entered.current = { index: active, at: Date.now() };
    setFocus(null);
  }, [active, recordLeave]);

  useEffect(() => {
    const flush = () => {
      if (document.visibilityState !== 'hidden') { entered.current.at = Date.now(); return; }
      const cur = entered.current;
      recordLeave(cur.index, Date.now() - cur.at);
      entered.current = { index: cur.index, at: Date.now() };
    };
    document.addEventListener('visibilitychange', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      const cur = entered.current;
      recordLeave(cur.index, Date.now() - cur.at);
    };
  }, [recordLeave]);

  // ── refill as you near the end ──
  useEffect(() => {
    const s = stateRef.current;
    if (!s || view !== 'feed' || exhausted || !s.onboarded) return;
    if (active < slides.length - REFILL_WHEN_LEFT) return;
    const more = plan(s, slides, NEXT_BATCH);
    if (more.length === 0) setExhausted(true);
    else setSlides((prev) => [...prev, ...expand(more)]);
  }, [active, slides, view, exhausted, plan, expand]);

  // ── which card is on screen ──
  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el || !el.clientHeight) return;
    const i = Math.round(el.scrollTop / el.clientHeight);
    setActive((a) => (a === i ? a : i));
  }, []);

  // ── actions ──
  const current = slides[active];
  const pick = useCallback((slide: FeedSlide, authored: number) => {
    if (slide.card.type !== 'quiz' || picks[slide.key] !== undefined) return;
    setPicks((p) => ({ ...p, [slide.key]: authored }));
    update((s) => recordAnswer(s, slide.card, authored === (slide.card as { answer: number }).answer, localDay(), Date.now()));
  }, [picks, update]);

  const share = useCallback(async (slide: FeedSlide) => {
    const text = shareText(slide.card);
    try {
      if (typeof navigator.share === 'function') { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      toast('Copied — paste it anywhere.');
    } catch { /* the share sheet was dismissed */ }
  }, []);

  const less = useCallback((slide: FeedSlide) => {
    update((s) => lessOfThis(s, slide.card));
    // the rest of what's queued from that topic goes too; the next batch is weighted down (scheduler.topicWeight)
    setSlides((prev) => prev.filter((x, i) => i <= active || x.card.topic !== slide.card.topic));
    toast('Got it — less like this.');
    setTimeout(() => goTo(active + 1), 0);
  }, [update, active, goTo]);

  const moveDomFocus = (delta: number) => {
    const els = [...document.querySelectorAll<HTMLElement>('[data-learn-sheet] [data-pad-focus]')].filter((e) => !(e as HTMLButtonElement).disabled);
    if (!els.length) return;
    const at = els.indexOf(document.activeElement as HTMLElement);
    const next = at < 0 ? (delta > 0 ? 0 : els.length - 1) : (at + delta + els.length) % els.length;
    els[next].focus();
    els[next].scrollIntoView({ block: 'nearest' });
  };

  const act = (a: NavAction) => {
    if (view !== 'feed') {
      if (a === 'next' || a === 'right') moveDomFocus(1);
      else if (a === 'prev' || a === 'left') moveDomFocus(-1);
      else if (a === 'select') (document.activeElement as HTMLElement | null)?.click();
      else if (a === 'back' && view !== 'picker') setView('feed');
      return;
    }
    if (!current) { if (a === 'prev' || a === 'first') goTo(stepIndex(active, a, slides.length + 1)); return; }
    const quiz = current.card.type === 'quiz' ? current.card : null;
    const answered = picks[current.key] !== undefined;
    const total = slides.length + (exhausted ? 1 : 0);
    if (a === 'next' || a === 'prev' || a === 'first' || a === 'last') { goTo(stepIndex(active, a, total)); return; }
    if ((a === 'left' || a === 'right') && quiz && !answered) { setFocus((f) => moveFocus(f, a, quiz.options.length)); return; }
    if (a === 'select' && quiz && !answered && focus !== null) { pick(current, optionOrder(quiz)[focus]); return; }
    if (typeof a === 'object' && quiz && !answered && a.pick < quiz.options.length) { pick(current, optionOrder(quiz)[a.pick]); return; }
    if (a === 'like') update((s) => toggleLike(s, current.card));
    if (a === 'save') update((s) => toggleSave(s, current.card));
  };
  const actRef = useRef(act);
  actRef.current = act;

  // keyboard (the feed only; sheets keep native Tab/Enter)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      const a = keyAction(e.key, e.shiftKey);
      if (!a) return;
      if (view !== 'feed') { if (a === 'back') { e.preventDefault(); actRef.current(a); } return; }
      // a focused button or link keeps its own Enter/Space
      if ((a === 'select' || e.key === ' ') && t && t.closest('button, a')) return;
      e.preventDefault();
      actRef.current(a);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  // gamepad: the canonical pad (lib/input/profiles.readPad), edge-detected in lib/knowledge/feedNav
  useEffect(() => {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
    let raf = 0;
    let tracker = freshTracker();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      let pad: Gamepad | null = null;
      for (const p of navigator.getGamepads()) if (p && p.connected) { pad = p; break; }
      if (!pad) { tracker = freshTracker(); return; }
      const r = padActions(tracker, padStateFrom(readPad(pad)), performance.now());
      tracker = r.tracker;
      for (const a of r.actions) actRef.current(a);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── render ──
  if (!state) return <div className="fixed inset-0 z-[60] bg-[#050505]" aria-busy="true" />;

  const today = localDay();
  const done = doneToday(state.today, today);
  const streak = liveStreak(state.streak, today);
  const topicsOffered = availableTopics(signedIn);
  const closeHref = signedIn ? '/train' : '/';

  const onTopicsDone = (picked: TopicId[]) => {
    const next = setTopics(stateRef.current ?? freshState(), picked);
    update(() => next);
    setView('feed');
    restart(next);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-[#050505] text-white" data-learn-root>
      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-2 bg-gradient-to-b from-[#050505] via-[#050505cc] to-transparent px-3 pb-6 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-6">
        <Link href={closeHref} aria-label="Close the feed" className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-white/8 text-white/85 hover:bg-white/15">
          <X className="h-5 w-5" />
        </Link>
        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/8 px-3 py-1.5" aria-label={`${Math.min(done, DAILY_GOAL)} of ${DAILY_GOAL} cards today, ${streak}-day streak`}>
          <span className="font-black tracking-wide md:text-lg">Learn</span>
          <span className="mx-1 h-4 w-px bg-white/15" />
          <Flame className="h-4 w-4 text-orange-400" />
          <span className="font-mono text-sm font-bold tabular-nums" data-learn-streak>{streak}</span>
          <span className="ml-1 flex items-center gap-1">
            <GoalRing done={done} size={22} />
            <span className="font-mono text-sm font-bold tabular-nums" data-learn-goal>{Math.min(done, DAILY_GOAL)}/{DAILY_GOAL}</span>
          </span>
        </div>
        <div className="pointer-events-auto flex gap-2">
          <button type="button" onClick={() => setView('topics')} aria-label="Change topics" className="grid h-11 w-11 place-items-center rounded-full bg-white/8 text-white/85 hover:bg-white/15">
            <SlidersHorizontal className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => setView('progress')} aria-label="Your progress" data-learn-open-progress className="grid h-11 w-11 place-items-center rounded-full bg-white/8 text-white/85 hover:bg-white/15">
            <BarChart3 className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* the timeline */}
      <div
        ref={scroller}
        onScroll={onScroll}
        className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollBehavior: reduced ? 'auto' : 'smooth' }}
        aria-label="Learning feed"
        data-learn-feed
      >
        {slides.map((s, i) => (
          <section key={s.key} className="h-full snap-start snap-always pb-[max(6.5rem,calc(env(safe-area-inset-bottom)+5.5rem))] pl-5 pr-[4.6rem] pt-20 md:px-24 md:pb-24 md:pt-24" data-slide-index={i}>
            {Math.abs(i - active) <= 2 ? (
              <FeedCard slide={s} picked={picks[s.key]} focus={i === active ? focus : null} onPick={(a) => pick(s, a)} active={i === active} reduced={reduced} />
            ) : <div className="h-full" />}
          </section>
        ))}
        {exhausted && (
          <section className="flex h-full snap-start snap-always flex-col items-center justify-center gap-4 px-6 text-center" data-learn-end>
            <h2 className="text-[clamp(1.6rem,4vw,3rem)] font-black">You're all caught up</h2>
            <p className="max-w-md text-white/65 md:text-xl">Missed questions come back for review, and new reviews are due over the next few days. Add a topic for more.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => setView('topics')} className="rounded-full bg-white px-5 py-2.5 font-bold text-black">Add topics</button>
              <TestYourself accent="#C58BFF" />
            </div>
          </section>
        )}
      </div>

      {/* the action rail: like, save, less of this, share — the card on screen */}
      {view === 'feed' && current && (
        <div className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-3 z-20 flex flex-col gap-2.5 md:bottom-1/2 md:right-6 md:translate-y-1/2">
          <RailButton label="Like" on={state.liked.includes(current.card.id)} onClick={() => update((s) => toggleLike(s, current.card))} icon={<Heart className="h-5 w-5" fill={state.liked.includes(current.card.id) ? 'currentColor' : 'none'} />} activeColor="#FF6A8A" />
          <RailButton label="Save" on={state.saved.includes(current.card.id)} onClick={() => update((s) => toggleSave(s, current.card))} icon={<Bookmark className="h-5 w-5" fill={state.saved.includes(current.card.id) ? 'currentColor' : 'none'} />} activeColor="#FFD166" />
          <RailButton label="Less" on={false} onClick={() => less(current)} icon={<EyeOff className="h-5 w-5" />} activeColor="#ffffff" />
          <RailButton label="Share" on={false} onClick={() => share(current)} icon={<Share2 className="h-5 w-5" />} activeColor="#ffffff" />
        </div>
      )}

      {view === 'feed' && active === 0 && slides.length > 1 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-10 flex flex-col items-center text-white/45" aria-hidden>
          <ChevronUp className={reduced ? 'h-5 w-5' : 'h-5 w-5 animate-bounce'} />
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] md:text-sm">Swipe · scroll · ↓ · d-pad</span>
        </div>
      )}

      {/* sheets */}
      {view !== 'feed' && (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-[#050505]" data-learn-sheet>
          {view === 'picker' && <TopicPicker topics={topicsOffered} initial={[]} onDone={onTopicsDone} />}
          {view === 'topics' && (
            <TopicPicker topics={topicsOffered} initial={state.topics} onDone={onTopicsDone} title="Your topics" cta="Update feed" onCancel={() => setView('feed')} />
          )}
          {view === 'progress' && (
            <ProgressView
              state={state}
              today={today}
              catalog={CARDS}
              onClose={() => setView('feed')}
              onChangeTopics={() => setView('topics')}
              onUnsave={(id) => update((s) => ({ ...s, saved: s.saved.filter((x) => x !== id) }))}
              onClear={() => {
                if (!window.confirm('Clear your topics, streak and progress on this device?')) return;
                clearState();
                const s = freshState();
                stateRef.current = s;
                setState(s);
                setSlides([]);
                setView('picker');
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function RailButton({ label, on, onClick, icon, activeColor }: { label: string; on: boolean; onClick: () => void; icon: React.ReactNode; activeColor: string }) {
  return (
    <button type="button" onClick={(e) => { e.currentTarget.blur(); onClick(); }} aria-label={label} aria-pressed={on}
      className="flex flex-col items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-white/70 md:text-xs">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-white/10 backdrop-blur md:h-12 md:w-12" style={{ color: on ? activeColor : '#fff' }}>{icon}</span>
      {label}
    </button>
  );
}
