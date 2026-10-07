'use client';

// THE END SCREEN (owner, 2026-10-06): "Let's make the reward screen and ending screen more rewarding. It felt anticlimactic
// upon a game's finish. We should be excited to play the next game or the next mode. We should be excited we earned
// rewards from the game we played." Played on a TV, so it is built like a console results screen: a dark glass panel over
// the live scene, the result slamming in, every reward revealed one at a time with a tick, the next thing to earn, and
// Play again focused and ready — d-pad / stick + A / B, the keyboard, or touch.
//
// PRESENTATION ONLY. Everything on it is what GameShell already holds from the servers' answers; what counts as a win is
// still decided in the shell (cardWon / cardHeadline), and no payout, cap or economy rule is read or changed here. The
// pieces are pure and tested on their own: reveal.ts (order, pace, skip), season-bar.ts (the tier-up maths), records.ts
// (the device's personal bests), recommend.ts (what's next), nav.ts (focus movement), progress.ts (next to earn).
//
// IMPROVE (2026-10-06, owner decisions): the player level bar (level-bar.ts, off lib/player-level.ts), today's three
// goals (goals.ts, the server's lib/goals/daily-goals.ts), "Coin limit reached today" when the cap cut a run's coins to
// nothing, and — for a verified adult — the personal best on the ACCOUNT (records.ts mergeAccountBest, GET /api/bests).
//
// SLOTS for the lanes working on the same card: `extraActions` (lane/multiplayer's Challenge a friend / rematch) join the
// action row and its focus grid; `sideCards` (lane/knowledge-feed's card) render under the rewards — any element inside
// marked `data-end-focus="<id>"` is reachable by pad and keyboard.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Trophy, Sparkles, Gem, Coins, TrendingUp, TrendingDown, Award, Share2, Check, Loader2, RotateCcw, ArrowRight,
  LayoutGrid, Home, PartyPopper, Map as MapIcon, Flame, Star, Zap, BookOpen, Target, Ban,
} from 'lucide-react';
import { reducedMotion as deviceReducedMotion } from '@/lib/a11y/reducedMotion';
import { unpaidLine, unpaidTitle } from '@/lib/sessions/unpaidCopy';
import { modeMenuMetaFor } from '@/lib/mode-menu';
import { StoryRefusedPanel } from '../end-card-refusal';
import { FormBlock } from '../form-block';   // HOOPS BODY (2026-10-07): the FORM block
import type { EndScreenAction, EndScreenProps } from './types';
import {
  buildSteps, stepDurations, initialReveal, revealReducer, isShown, revealDone, pressIntent, cueFor, ARM_MS, type StepId,
} from './reveal';
import { applyRun, browserStore, localDay, playedOn, browserAccountBest, mergeAccountBest, ACCOUNT_BEST_WAIT_MS, type AccountBest } from './records';
import { levelFill } from './level-bar';
import { LevelCard } from './level-card';
import { goalLines, goalsDoneCount } from './goals';
import { recommendNext, type NextPick } from './recommend';
import { gradeBadge } from './grade';
import { highlights } from './highlights';
import { progressLines, calloutChips } from './progress';
import { keyIntent, padFrame, padIntents, spatialNext, type Intent, type PadFrame } from './nav';
import { browserFx, type EndFx } from './fx';
import { useCountUp } from './use-count-up';
import { SeasonCard } from './season-card';
import { ArenaCard, CarnivalCard, ChallengeCard, MpCard, StoryRewardCard } from './outcome-cards';
import { Confetti } from './confetti';

const fmt = (v: number) => Math.round(v).toLocaleString('en-US');

/** The figures under the headline: the Arena's settled pair when the run was staked, else the mode's own. */
export function scoreFigures(p: Pick<EndScreenProps, 'run' | 'arenaVerdict' | 'arenaResult'>): { mine: number; vs: number | null; vsLabel: string | null } {
  const arenaOpp = p.arenaVerdict && p.arenaVerdict !== 'PENDING' ? p.arenaResult?.oppScore : undefined;
  if (p.arenaVerdict && p.arenaVerdict !== 'PENDING' && typeof arenaOpp === 'number') {
    return { mine: p.arenaResult?.myScore ?? p.run.score, vs: arenaOpp, vsLabel: 'house rival' };
  }
  const opp = p.run.opponentScore;
  return { mine: p.run.score, vs: typeof opp === 'number' && opp > 0 ? opp : null, vsLabel: null };
}

/** Where B (and the card's exit) goes. */
export function exitHrefFor(storyNodeId: string | null): string {
  return storyNodeId ? '/story' : '/play';
}

/** A block that waits for its beat: present for layout, invisible until shown, instant under reduced motion. */
function Beat({ show, instant, children, className = '' }: { show: boolean; instant: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div
      aria-hidden={show ? undefined : true}
      data-beat={show ? 'shown' : 'waiting'}
      className={`${className} ${instant ? '' : 'transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.2,1.4,0.4,1)]'} ${show ? 'opacity-100' : 'pointer-events-none translate-y-3 scale-95 opacity-0'}`}
    >
      {children}
    </div>
  );
}

function RewardTile({ show, instant, ms, value, prefix = '+', label, sub, color, Icon, data, capped }: {
  show: boolean; instant: boolean; ms: number; value: number; prefix?: string; label: string; sub?: string; color: string;
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; data: string; capped?: boolean;
}) {
  const v = useCountUp(value, { active: show, instant, ms: Math.max(200, ms - 60) });
  const decimals = Math.abs(value) < 10 && !Number.isInteger(value) ? 1 : 0;
  return (
    <Beat show={show} instant={instant}>
      <div data-recap={data} data-capped={capped ? '1' : undefined} className="flex h-full items-center gap-[0.5em] rounded-2xl border border-white/10 bg-white/[0.04] px-[0.6em] py-[0.4em]" style={{ boxShadow: show ? `inset 0 0 0 1px ${color}22, 0 0 24px ${color}14` : undefined }}>
        <Icon className="h-[1.4em] w-[1.4em] shrink-0" style={{ color }} />
        <div className="min-w-0">
          <div className="font-mono text-[1.35em] font-bold leading-none" style={{ color }}>{prefix}{v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</div>
          <div className="mt-[0.2em] text-[0.72em] uppercase tracking-[0.12em] text-white/60">{label}</div>
          {sub && <div className="text-[0.72em] text-white/50">{sub}</div>}
        </div>
      </div>
    </Beat>
  );
}

const btnBase = 'fel-heading flex items-center justify-center gap-[0.4em] rounded-xl font-bold outline-none transition-[transform,box-shadow,background-color] duration-150 data-[focused=true]:scale-[1.04] data-[focused=true]:ring-4 data-[focused=true]:ring-offset-2 data-[focused=true]:ring-offset-black disabled:opacity-60';

function ActionButton({ a, focused, onPress }: { a: EndScreenAction; focused: boolean; onPress: (a: EndScreenAction) => void }) {
  const tone = a.tone === 'primary' ? 'bg-[#00E5FF] text-black data-[focused=true]:ring-white'
    : a.tone === 'violet' ? 'border border-[#A855F7]/60 bg-[#A855F7]/10 text-[#C99BFF] data-[focused=true]:ring-[#A855F7]'
    : 'border border-white/20 bg-white/[0.04] text-white/85 data-[focused=true]:ring-[#00E5FF]';
  return (
    <button type="button" data-end-focus={`x-${a.id}`} data-focused={focused} disabled={a.disabled} onClick={(e) => { e.stopPropagation(); onPress(a); }} className={`${btnBase} ${tone} px-[0.9em] py-[0.55em] text-[0.9em]`}>
      {a.label}
    </button>
  );
}

function NextTeaser({ pick, focused, onPress }: { pick: NextPick; focused: boolean; onPress: () => void }) {
  const meta = pick.modeKey ? modeMenuMetaFor(pick.modeKey) : null;
  const color = meta?.color ?? (pick.kind.startsWith('story') ? '#A855F7' : '#FFD700');
  const Icon = meta?.icon ?? (pick.kind.startsWith('story') ? BookOpen : PartyPopper);
  return (
    <button
      type="button"
      data-end-focus="next"
      data-focused={focused}
      data-next-kind={pick.kind}
      onClick={(e) => { e.stopPropagation(); onPress(); }}
      className="group relative flex min-w-0 flex-1 items-center gap-[0.7em] overflow-hidden rounded-xl border bg-black/40 px-[0.8em] py-[0.5em] text-left outline-none transition-[transform,box-shadow] duration-150 data-[focused=true]:scale-[1.03] data-[focused=true]:ring-4 data-[focused=true]:ring-offset-2 data-[focused=true]:ring-offset-black"
      style={{ borderColor: `${color}66`, boxShadow: `inset 0 0 40px ${color}1f`, ['--tw-ring-color' as string]: color }}
    >
      <span className="grid h-[2.3em] w-[2.3em] shrink-0 place-items-center rounded-lg" style={{ background: `${color}22`, color }}>
        <Icon className="h-[1.3em] w-[1.3em]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.68em] font-bold uppercase tracking-[0.14em]" style={{ color }}>Next · {pick.reason}</span>
        <span className="fel-heading block truncate text-[1.1em] font-bold text-white">{pick.title}</span>
        {pick.detail && <span className="block truncate text-[0.75em] text-white/55 [@media(max-height:500px)]:hidden">{pick.detail}</span>}
      </span>
      <ArrowRight className="h-[1.2em] w-[1.2em] shrink-0 text-white/70" />
    </button>
  );
}

export function EndScreen(props: EndScreenProps) {
  const {
    mode, run, headline, won, proofLine, arenaRefused, recap: answer, coins, storyNodeId, storyReward, storyRefused,
    mpResult, challengeResult, arenaResult, carnivalRun, signatureRun, share, onReplay, onNavigate, extraActions, sideCards,
  } = props;
  const now = props.now ?? Date.now;
  const fx: EndFx = props.fx ?? browserFx;
  const store = props.store ?? browserStore;
  const [instant] = useState<boolean>(() => props.reducedMotion ?? deviceReducedMotion());
  const mountedAt = useRef<number>(now());

  // ── THE ACCOUNT'S BEST (verified adults): asked once the run has a session id, with that run left out. Until it answers
  // (or ACCOUNT_BEST_WAIT_MS passes) the rewards wait under "Tallying rewards…", so the callouts are decided once, on the
  // merged records. A teen, a guest or a failure answers null: this device's records alone, as before. ──
  const fetchBest = props.fetchAccountBest ?? browserAccountBest;
  const bestSid = answer && !answer.noPlay && !answer.unpaid && typeof answer.sessionId === 'string' && answer.sessionId ? answer.sessionId : null;
  const [acct, setAcct] = useState<{ sid: string | null; best: AccountBest | null }>({ sid: null, best: null });
  useEffect(() => {
    if (!bestSid) return;
    let live = true;
    const done = (best: AccountBest | null) => { if (live) { live = false; setAcct({ sid: bestSid, best }); } };
    const t = setTimeout(() => done(null), ACCOUNT_BEST_WAIT_MS);
    fetchBest(mode, bestSid).then(done, () => done(null));
    return () => { live = false; clearTimeout(t); };
  }, [bestSid, mode, fetchBest]);
  const bestReady = !bestSid || acct.sid === bestSid;
  const recap = bestReady ? answer : null;

  // ── THE DEVICE'S RECORDS: read once, before this run; this run's callouts are computed from that snapshot ──
  const [deviceBefore] = useState(() => store.load());
  const before = useMemo(() => mergeAccountBest(deviceBefore, bestReady ? acct.best : null), [deviceBefore, bestReady, acct.best]);
  const day = useMemo(() => localDay(mountedAt.current), []);
  const settled = Boolean(recap) && (!props.staked || Boolean(arenaResult));
  const accepted = Boolean(recap && !recap.noPlay && !recap.unpaid && !arenaRefused);
  const applied = useMemo(
    () => (settled ? applyRun(before, { mode, score: Math.max(0, Math.round(run.score)), won, accepted, signatureRun, nowMs: mountedAt.current }) : null),
    [settled, before, mode, run.score, won, accepted, signatureRun],
  );
  const callouts = applied?.callouts ?? null;
  const saved = useRef(false);
  useEffect(() => {
    if (!applied || saved.current) return;
    saved.current = true;
    store.save(applied.next);
  }, [applied, store]);

  // ── WHAT'S NEXT ──
  const pick = useMemo(() => {
    const played = playedOn(before, day);
    played.add(mode);
    return recommendNext({
      mode, storyNodeId, storyCompleted: Boolean(storyReward), carnivalRun, signatureRun,
      playedToday: played, signaturePlayedToday: before.signatureDay === day, nowMs: mountedAt.current,
    });
  }, [before, day, mode, storyNodeId, storyReward, carnivalRun, signatureRun]);

  // ── THE BEATS ──
  const grade = useMemo(() => gradeBadge(mode, run), [mode, run]);
  const lights = useMemo(() => highlights(run), [run]);
  const chips = useMemo(() => calloutChips(callouts, recap, won), [callouts, recap, won]);
  const progress = useMemo(() => progressLines(recap, callouts, won), [recap, callouts, won]);
  const tierUps = recap?.season?.tierUps?.length ?? 0;
  const paidRecap = Boolean(recap && !recap.noPlay && !recap.unpaid);
  const lvl = useMemo(() => (paidRecap && recap ? levelFill(recap.profileXp, recap.xp) : null), [paidRecap, recap]);
  const levelUps = lvl?.levelUps ?? 0;
  const goals = useMemo(() => (paidRecap && recap ? goalLines(recap.goals) : []), [paidRecap, recap]);
  const goalsDone = goals.filter((g) => g.justDone).length;
  const steps = useMemo(() => buildSteps({
    hasGrade: Boolean(grade),
    recap: recap ? { ...recap, season: recap.season ?? null, mastery: recap.mastery ?? null } : null,
    coins,
    hasCallouts: chips.length > 0,
    storyReward: Boolean(storyReward),
    storyRefused: Boolean(storyRefused),
    arena: Boolean(arenaResult),
    mp: Boolean(mpResult),
    challenge: Boolean(challengeResult),
    hasProgress: progress.length > 0,
    hasLevel: Boolean(lvl),
    hasGoals: goals.length > 0,
  }), [grade, recap, coins, chips.length, storyReward, storyRefused, arenaResult, mpResult, challengeResult, progress.length, lvl, goals.length]);
  const durs = useMemo(() => stepDurations(steps, tierUps, undefined, levelUps), [steps, tierUps, levelUps]);
  const [rv, dispatch] = useReducer(revealReducer, instant, initialReveal);
  const at = (id: StepId) => steps.indexOf(id);
  const shown = (id: StepId) => { const i = at(id); return i >= 0 && isShown(rv, i); };
  const msOf = (id: StepId) => durs[at(id)] ?? 300;
  const fast = instant || rv.skipped;

  useEffect(() => {
    if (revealDone(rv, steps.length)) return;
    const t = setTimeout(() => dispatch({ type: 'advance', total: steps.length }), durs[Math.max(0, rv.shown - 1)] ?? 300);
    return () => clearTimeout(t);
  }, [rv, steps.length, durs]);

  // one cue per beat as it lands; a skip plays one tick; reduced motion plays the moment's cue once
  const cued = useRef(0);
  const newBest = Boolean(callouts?.newBest);
  useEffect(() => {
    if (instant) { if (cued.current === 0) { cued.current = 1; fx.cue(won ? 'win' : 'soft'); } return; }
    if (rv.skipped) { if (cued.current < steps.length) { cued.current = steps.length; fx.cue(tierUps > 0 || levelUps > 0 || newBest ? 'levelUp' : 'tick'); } return; }
    while (cued.current < rv.shown && cued.current < steps.length) {
      fx.cue(cueFor(steps[cued.current], { won, newBest, tierUps, levelUps, goalsDone }));
      cued.current += 1;
    }
  }, [rv, steps, instant, won, newBest, tierUps, levelUps, goalsDone, fx]);

  // ── FOCUS + INPUT ──
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [focusId, setFocusId] = useState('primary');
  const focusRef = useRef(focusId); focusRef.current = focusId;
  const rvRef = useRef(rv); rvRef.current = rv;
  const stepsLen = useRef(steps.length); stepsLen.current = steps.length;
  const exitHref = exitHrefFor(storyNodeId);
  const navRef = useRef(onNavigate); navRef.current = onNavigate;
  const armed = () => now() - mountedAt.current >= ARM_MS;

  const focusables = useCallback((): HTMLElement[] => {
    const root = rootRef.current;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>('[data-end-focus]')).filter((el) => !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0);
  }, []);

  // the focus mark follows focusId — on the card's own buttons and on anything a slot mounted
  useEffect(() => {
    for (const el of focusables()) {
      const on = el.dataset.endFocus === focusId;
      el.dataset.focused = on ? 'true' : 'false';
      if (on && document.activeElement !== el) {
        try { el.focus({ preventScroll: true }); el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); } catch { /* detached */ }
      }
    }
  }, [focusId, focusables, steps.length, pick, extraActions]);

  const onIntent = useCallback((it: Intent) => {
    const since = now() - mountedAt.current;
    if (it === 'select') {
      const p = pressIntent(rvRef.current, stepsLen.current, since);
      if (p === 'skip') dispatch({ type: 'skip' });
      else if (p === 'activate') focusables().find((el) => el.dataset.endFocus === focusRef.current)?.click();
      return;
    }
    if (it === 'back') { if (since >= ARM_MS) navRef.current(exitHref); return; }
    const els = focusables();
    if (!els.length) return;
    const from = Math.max(0, els.findIndex((el) => el.dataset.endFocus === focusRef.current));
    const to = spatialNext(els.map((el) => el.getBoundingClientRect()), from, it);
    const id = els[to]?.dataset.endFocus;
    if (id) setFocusId(id);
  }, [focusables, exitHref, now]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.isTrusted) return;   // the shell's pad bridge (legacy DOM modes) — the pad is read below, once
      const it = keyIntent(e.key);
      if (!it) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat && (it === 'select' || it === 'back')) return;
      onIntent(it);
    };
    window.addEventListener('keydown', onKey, true);
    let raf = 0;
    const prev = new Map<number, PadFrame>();
    const poll = () => {
      try {
        const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
        for (const pad of Array.from(pads ?? [])) {
          if (!pad) continue;
          const f = padFrame(pad);
          for (const it of padIntents(prev.get(pad.index) ?? null, f)) onIntent(it);
          prev.set(pad.index, f);
        }
      } catch { /* no pads */ }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => { window.removeEventListener('keydown', onKey, true); cancelAnimationFrame(raf); };
  }, [onIntent]);

  const guard = (fn: () => void) => () => { if (armed()) fn(); };
  const onPanelTap = () => { if (armed() && !revealDone(rvRef.current, stepsLen.current)) dispatch({ type: 'skip' }); };

  // ── WHAT IS SHOWN ──
  const fig = scoreFigures(props);
  const score = useCountUp(fig.mine, { active: true, instant: fast, ms: Math.max(250, durs[1] ?? 500) });
  const confettiWin = !instant && won;
  const confettiGold = !instant && newBest && shown('callouts');
  const longHead = headline.length > 16;
  const primary: { label: string; Icon: typeof RotateCcw; act: () => void; gold?: boolean } = carnivalRun
    ? carnivalRun.index < carnivalRun.lineup.length
      ? { label: `Next: ${pick?.title ?? 'next stop'}`, Icon: ArrowRight, act: () => onNavigate(pick?.href ?? '/play/carnival'), gold: true }
      : { label: 'See carnival results', Icon: PartyPopper, act: () => onNavigate('/play/carnival/recap'), gold: true }
    : { label: 'Play again', Icon: RotateCcw, act: onReplay };
  const showTeaser = Boolean(pick) && !carnivalRun;
  const tilesShown = recap && !recap.noPlay && !recap.unpaid;
  // (a coins limit that cut the earn to nothing is a tile too — "Coin limit reached today", owner decision 2026-10-06)
  const coinLimit = Boolean(coins && coins.coins <= 0 && coins.capped);
  const anyTile = Boolean(tilesShown && (recap!.xp > 0 || recap!.shards > 0 || recap!.credits > 0 || recap!.prqDelta !== 0 || (coins && coins.coins > 0) || coinLimit));

  return (
    <motion.div
      data-end-screen
      data-reveal={revealDone(rv, steps.length) ? 'done' : 'playing'}
      initial={instant ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-50 overflow-hidden"
      style={{
        // NO backdrop-filter, here or on the panel (measured 2026-10-06, /dev/end-screen, headless Chromium, swiftshader):
        // the panel with a 10 px backdrop blur held 0.7 fps while the reveal animated, 60 fps without it, 52 fps with it under
        // reduced motion (nothing moving). Under the card the live 3D scene changes every frame, so a backdrop blur would be
        // recomputed every frame for as long as the card is up — on a TV browser the most expensive thing on screen. The
        // glass is a near-opaque dark gradient instead; the scene shows faintly through it.
        background: 'radial-gradient(120% 90% at 50% 30%, rgba(0,0,0,0.35) 0%, rgba(3,4,8,0.8) 70%, rgba(3,4,8,0.9) 100%)',
        padding: 'max(5vh, env(safe-area-inset-top)) max(5vw, env(safe-area-inset-right)) max(5vh, env(safe-area-inset-bottom)) max(5vw, env(safe-area-inset-left))',
      }}
      onClick={onPanelTap}
    >
      {confettiWin && <Confetti />}
      {confettiGold && <Confetti key="gold" gold />}
      <div className="flex h-full w-full items-center justify-center">
        <motion.section
          ref={rootRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${props.title} results: ${headline}`}
          initial={instant ? false : { y: 40, opacity: 0, scale: 0.97 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 24, stiffness: 260 }}
          onFocusCapture={(e) => { const id = (e.target as HTMLElement).dataset?.endFocus; if (id && id !== focusRef.current) setFocusId(id); }}
          className="relative flex max-h-full w-full max-w-[1500px] flex-col overflow-hidden rounded-[1.6em] border border-white/10 text-white shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
          style={{ fontSize: 'clamp(15px, calc(1vw + 0.5vh), 28px)', background: 'linear-gradient(160deg, rgba(18,23,34,0.9), rgba(8,10,16,0.93))' }}
        >
          {/* the win glow along the top edge */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[0.25em]" style={{ background: won ? 'linear-gradient(90deg, transparent, #FFD700, transparent)' : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)' }} />

          <div className="grid min-h-0 flex-1 gap-[1em] overflow-y-auto p-[1em] md:grid-cols-[0.95fr_1.1fr] md:px-[1.3em] md:py-[1em]">
            {/* ── 1. THE MOMENT ── */}
            <div className="flex min-w-0 flex-col">
            <div className="my-auto flex flex-col items-center gap-[0.6em] text-center [@media(max-height:560px)]:!my-0">
              <motion.div
                initial={instant ? false : { scale: 0.3, rotate: -18, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: 'spring', damping: 11, stiffness: 220, delay: instant ? 0 : 0.08 }}
              >
                <Trophy data-end-trophy={won ? 'gold' : 'dim'} className={`h-[min(2.6em,9vh)] w-[min(2.6em,9vh)] ${won ? 'text-[#FFD700] drop-shadow-[0_0_24px_rgba(255,215,0,0.7)]' : 'text-white/30'}`} />
              </motion.div>
              <motion.h2
                data-end-headline
                initial={instant ? false : { scale: 1.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', damping: 14, stiffness: 260 }}
                className="fel-heading max-w-full break-words font-bold leading-[0.95]"
                style={{
                  willChange: instant ? undefined : 'transform, opacity',
                  fontSize: longHead ? 'clamp(24px, min(calc(2.4vw + 1vh), 8vh), 68px)' : 'clamp(28px, min(calc(4vw + 1vh), 11vh), 112px)',
                  color: won ? '#FFFFFF' : 'rgba(255,255,255,0.88)',
                  textShadow: won ? '0 0 30px rgba(0,229,255,0.45), 0 0 70px rgba(0,229,255,0.2)' : 'none',
                }}
              >
                {headline}
              </motion.h2>

              <Beat show={shown('score')} instant={fast}>
                <div className="flex items-end justify-center gap-[0.6em]">
                  <div>
                    <div
                      data-end-score={fig.mine}
                      className="font-mono font-bold leading-none tabular-nums"
                      style={{ fontSize: 'clamp(28px, min(calc(3vw + 1vh), 8vh), 96px)', color: newBest && shown('callouts') ? '#FFD700' : '#FFFFFF', textShadow: newBest && shown('callouts') ? '0 0 28px rgba(255,215,0,0.6)' : undefined }}
                    >
                      {fmt(score)}
                    </div>
                    <div className="mt-[0.25em] text-[0.75em] uppercase tracking-[0.2em] text-white/55">
                      {fig.vs !== null ? <>Score · vs {fmt(fig.vs)}{fig.vsLabel ? ` ${fig.vsLabel}` : ''}</> : 'Score'}
                    </div>
                  </div>
                  {grade && (
                    <Beat show={shown('grade')} instant={fast}>
                      <div
                        data-end-grade={grade.label}
                        className="fel-heading grid place-items-center rounded-2xl border-2 font-bold leading-none"
                        style={{ borderColor: grade.color, color: grade.color, boxShadow: `0 0 26px ${grade.color}55`, minWidth: '2.6em', height: '2.6em', padding: '0 0.3em', fontSize: grade.kind === 'letter' ? '1.6em' : '0.85em' }}
                      >
                        {grade.kind === 'medal' ? <span className="flex flex-col items-center gap-[0.15em]"><Award className="h-[1.3em] w-[1.3em]" />{grade.label}</span> : grade.label}
                      </div>
                    </Beat>
                  )}
                </div>
                {lights.length > 0 && (
                  <div data-end-highlights className="mt-[0.6em] flex flex-wrap justify-center gap-[0.4em]">
                    {lights.map((l) => (
                      <span key={l.key} data-highlight={l.key} className="rounded-lg border border-white/12 bg-white/[0.05] px-[0.6em] py-[0.2em] text-[0.8em] text-white/70">
                        {l.label} <b className="font-mono text-white">{l.value}</b>
                      </span>
                    ))}
                  </div>
                )}
              </Beat>

              {chips.length > 0 && (
                <Beat show={shown('callouts')} instant={fast}>
                  <div className="flex flex-wrap justify-center gap-[0.5em]" data-end-callouts>
                    {chips.map((c) => (
                      <span
                        key={c.id}
                        data-callout={c.id}
                        className={`fel-heading inline-flex items-center gap-[0.35em] rounded-full border px-[0.8em] py-[0.3em] text-[0.85em] font-bold ${c.gold ? 'border-[#FFD700]/70 bg-[#FFD700]/15 text-[#FFD700] shadow-[0_0_24px_rgba(255,215,0,0.35)]' : 'border-white/20 bg-white/[0.06] text-white/90'}`}
                      >
                        {c.id === 'best' ? <Star className="h-[1em] w-[1em]" /> : c.id === 'streak' ? <Flame className="h-[1em] w-[1em] text-[#FF7A2F]" /> : c.id === 'winRun' ? <Zap className="h-[1em] w-[1em] text-[#00E5FF]" /> : <Sparkles className="h-[1em] w-[1em]" />}
                        {c.text}
                        {c.sub && <span className="font-mono text-[0.8em] font-normal opacity-75">· {c.sub}</span>}
                      </span>
                    ))}
                  </div>
                </Beat>
              )}

              <div className="flex w-full max-w-[34em] flex-col gap-[0.5em]">
                {carnivalRun && <CarnivalCard run={carnivalRun} />}
                {mpResult && <Beat show={shown('mp')} instant={fast}><MpCard r={mpResult} /></Beat>}
                {challengeResult && <Beat show={shown('challenge')} instant={fast}><ChallengeCard r={challengeResult} onNavigate={onNavigate} /></Beat>}
                {arenaResult && <Beat show={shown('arena')} instant={fast}><ArenaCard r={arenaResult} onNavigate={onNavigate} /></Beat>}
              </div>
            </div>
            </div>

            {/* ── 2. THE REWARDS · 3. NEXT TO EARN ── */}
            <div className="flex min-w-0 flex-col gap-[0.5em]">
              <div className="flex items-center gap-[0.5em] text-[0.75em] font-bold uppercase tracking-[0.2em] text-white/55">
                <Sparkles className="h-[1.1em] w-[1.1em] text-[#FFD700]" /> Rewards
              </div>
              {!recap ? (
                <div data-recap="pending" className="flex items-center gap-[0.5em] rounded-2xl border border-white/10 bg-white/[0.03] p-[0.8em] text-white/70">
                  <Loader2 className="h-[1.1em] w-[1.1em] animate-spin text-[#00E5FF]" /> Tallying rewards…
                </div>
              ) : recap.noPlay ? (
                <Beat show={shown('noplay')} instant={fast}>
                  <div data-recap="noplay" className="rounded-2xl border border-white/10 bg-white/[0.04] p-[0.8em] text-center">
                    <div className="font-mono font-bold text-white/80">NO PLAY RECORDED</div>
                    <div className="mt-[0.2em] text-[0.85em] text-white/55">The run ended before you got going — nothing earned, nothing counted. Play again to score.</div>
                  </div>
                </Beat>
              ) : (
                <>
                  {recap.unpaid && (
                    <Beat show={shown('unpaid')} instant={fast}>
                      <div data-recap="unpaid" className="rounded-2xl border border-white/10 bg-white/[0.04] p-[0.7em] text-center">
                        <div className="font-mono font-bold text-white/80">{unpaidTitle(recap.unpaid)}</div>
                        <div className="mt-[0.2em] text-[0.85em] text-white/55">{unpaidLine(recap.unpaid)}</div>
                      </div>
                    </Beat>
                  )}
                  {recap.capMessage && (
                    <Beat show={shown('cap')} instant={fast}>
                      <div data-recap="cap" className="rounded-2xl border border-[#FFB020]/30 bg-[#FFB020]/[0.06] p-[0.6em] text-center font-mono text-[0.85em] text-white/75">{recap.capMessage}</div>
                    </Beat>
                  )}
                  {!recap.unpaid && (
                    anyTile ? (
                      <div className="grid grid-cols-2 gap-[0.5em] lg:grid-cols-3">
                        {recap.xp > 0 && <RewardTile show={shown('xp')} instant={fast} ms={msOf('xp')} value={recap.xp} label="XP" color="#00FF9D" Icon={Sparkles} data="xp" />}
                        {coins && coins.coins > 0 && <RewardTile show={shown('coins')} instant={fast} ms={msOf('coins')} value={coins.coins} label={coins.capped ? 'Wallet coins · limit reached' : 'Wallet coins'} color="#FFB020" Icon={Coins} data="coins" capped={coins.capped} />}
                        {coinLimit && (
                          <Beat show={shown('coins')} instant={fast}>
                            <div data-recap="coins-limit" data-capped="1" className="flex h-full items-center gap-[0.5em] rounded-2xl border border-[#FFB020]/25 bg-[#FFB020]/[0.05] px-[0.6em] py-[0.4em]">
                              <Ban className="h-[1.2em] w-[1.2em] shrink-0 text-[#FFB020]/80" />
                              <div className="min-w-0 text-[0.8em] font-bold leading-tight text-white/75">Coin limit reached today</div>
                            </div>
                          </Beat>
                        )}
                        {recap.shards > 0 && <RewardTile show={shown('shards')} instant={fast} ms={msOf('shards')} value={recap.shards} label="Shards" color="#A855F7" Icon={Gem} data="shards" />}
                        {recap.credits > 0 && <RewardTile show={shown('credits')} instant={fast} ms={msOf('credits')} value={recap.credits} label="Lab Credits" sub={recap.streakBonus && recap.streakBonus > 0 ? `incl. +${fmt(recap.streakBonus)} streak` : undefined} color="#FFD700" Icon={Coins} data="credits" />}
                        {recap.prqDelta !== 0 && (
                          <RewardTile
                            show={shown('prq')} instant={fast} ms={msOf('prq')} value={recap.prqDelta} prefix={recap.prqDelta > 0 ? '+' : ''}
                            label="PRQ" sub={`now ${Math.round(recap.prqAfter)}${recap.grade?.label ? ` · ${recap.grade.label}` : ''}`}
                            color={recap.prqDelta > 0 ? '#00E5FF' : '#FF3366'} Icon={recap.prqDelta > 0 ? TrendingUp : TrendingDown} data="prq"
                          />
                        )}
                      </div>
                    ) : (
                      <div data-recap="none" className="rounded-2xl border border-white/10 bg-white/[0.03] p-[0.6em] text-center text-[0.85em] text-white/55">No rewards recorded for this run.</div>
                    )
                  )}
                  {lvl && recap.xp > 0 && (
                    <Beat show={shown('level')} instant={fast}>
                      <LevelCard fill={lvl} gained={recap.xp} active={shown('level')} instant={fast} ms={msOf('level')} onLevelUp={() => fx.cue('levelUp')} />
                    </Beat>
                  )}
                </>
              )}

              {storyRefused && <Beat show={shown('storyRefused')} instant={fast} className="[&_p]:!text-[0.85em]"><StoryRefusedPanel refusal={storyRefused} /></Beat>}
              {storyReward && <Beat show={shown('story')} instant={fast}><StoryRewardCardCounted r={storyReward} show={shown('story')} instant={fast} ms={msOf('story')} /></Beat>}

              {recap?.season && (
                <Beat show={shown('season')} instant={fast}>
                  <SeasonCard season={recap.season} active={shown('season')} instant={fast} ms={msOf('season')} onTierUp={() => fx.cue('levelUp')} />
                </Beat>
              )}
              {recap?.mastery && recap.mastery.ups.length > 0 && (
                <Beat show={shown('mastery')} instant={fast}>
                  <div data-recap="mastery" className="rounded-2xl border border-[#00E5FF]/35 bg-[#00E5FF]/10 px-[0.6em] py-[0.4em] text-center">
                    <p className="flex items-center justify-center gap-[0.4em] font-bold text-[#00E5FF]">
                      <Award className="h-[1.1em] w-[1.1em]" /> MASTERY UP — {recap.mastery.ups[recap.mastery.ups.length - 1].tier}
                    </p>
                  </div>
                </Beat>
              )}

              {goals.length > 0 && (
                <Beat show={shown('goals')} instant={fast}>
                  <div data-end-goals className="rounded-2xl border border-[#FF7A2F]/25 bg-[#FF7A2F]/[0.05] px-[0.7em] py-[0.45em]">
                    <div className="mb-[0.3em] flex items-center gap-[0.4em] text-[0.72em] font-bold uppercase tracking-[0.2em] text-white/55">
                      <Target className="h-[1.1em] w-[1.1em] text-[#FF7A2F]" /> Today&apos;s goals <span className="ml-auto font-mono normal-case tracking-normal text-white/45">{goalsDoneCount(goals)}</span>
                    </div>
                    <ul className="grid gap-[0.3em] md:grid-cols-3">
                      {goals.map((g) => (
                        <li key={g.id} data-goal={g.id} data-goal-state={g.justDone ? 'just-done' : g.done ? 'done' : 'open'} className={`min-w-0 rounded-lg border px-[0.5em] py-[0.3em] ${g.justDone ? 'border-[#FFD700]/60 bg-[#FFD700]/10' : 'border-white/10 bg-black/20'}`}>
                          <div className="flex items-center gap-[0.3em] text-[0.82em] font-bold text-white/90">
                            {g.done && <Check className={`h-[1em] w-[1em] shrink-0 ${g.justDone ? 'text-[#FFD700]' : 'text-[#00FF9D]'}`} />}
                            <span className="truncate">{g.text}</span>
                          </div>
                          <div className="mt-[0.2em] h-[0.3em] overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full" style={{ width: `${g.pct}%`, background: g.done ? '#00FF9D' : '#FF7A2F' }} /></div>
                          <div className={`mt-[0.15em] truncate text-[0.72em] ${g.justDone ? 'font-bold text-[#FFD700]' : 'text-white/55'}`}>{g.detail}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Beat>
              )}

              {progress.length > 0 && (
                <Beat show={shown('progress')} instant={fast}>
                  <div data-end-progress className="rounded-2xl border border-white/10 bg-white/[0.03] px-[0.7em] py-[0.5em]">
                    <div className="mb-[0.35em] text-[0.72em] font-bold uppercase tracking-[0.2em] text-white/50">Next to earn</div>
                    <ul className="flex flex-col gap-[0.25em]">
                      {progress.map((l) => (
                        <li key={l.id} data-progress={l.id} className="flex items-center gap-[0.5em] text-[0.92em] text-white/85">
                          <span className="h-[0.4em] w-[0.4em] shrink-0 rounded-full bg-[#00E5FF]" />
                          <span className="min-w-0 flex-1">{l.text}</span>
                          {typeof l.pct === 'number' && (
                            <span className="h-[0.35em] w-[4.5em] shrink-0 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-[#FFD700]" style={{ width: `${l.pct}%` }} /></span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </Beat>
              )}

              {/* HOOPS BODY (2026-10-07, Mirror & coaching Phase 7): P10's FORM block — the run's camera form read (3PT, Dunk, the
                  fights); renders nothing unless the body played this run in a game with a block */}
              <FormBlock />
              {sideCards && <div data-end-slot="side-cards" className="flex flex-col gap-[0.6em]">{sideCards}</div>}
            </div>
          </div>

          {/* ── 4. WHAT'S NEXT — always on screen, Play again focused ── */}
          <footer data-end-actions className="border-t border-white/10 bg-black/45 p-[0.7em] md:px-[1.4em]" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col gap-[0.6em] md:flex-row md:items-stretch">
              <button
                type="button"
                data-end-focus="primary"
                data-focused={focusId === 'primary'}
                onClick={guard(primary.act)}
                className={`${btnBase} min-h-[2.6em] shrink-0 px-[1.4em] text-[1.15em] md:min-w-[11em] [@media(max-height:500px)]:min-h-[2.1em] ${primary.gold ? 'bg-[#FFD700] text-black data-[focused=true]:ring-white' : 'bg-[#00E5FF] text-black shadow-[0_0_30px_rgba(0,229,255,0.45)] data-[focused=true]:ring-white'}`}
              >
                <span aria-hidden className="grid h-[1.4em] w-[1.4em] place-items-center rounded-full bg-black/80 text-[0.7em] font-bold text-[#00FF9D]">A</span>
                <primary.Icon className="h-[1em] w-[1em]" /> {primary.label}
              </button>
              {showTeaser && pick && <NextTeaser pick={pick} focused={focusId === 'next'} onPress={guard(() => onNavigate(pick.href))} />}
            </div>
            <div className="mt-[0.6em] flex flex-wrap items-center gap-[0.5em]">
              <button type="button" data-end-focus="modes" data-focused={focusId === 'modes'} onClick={guard(() => onNavigate('/play'))} className={`${btnBase} border border-white/20 bg-white/[0.04] px-[0.9em] py-[0.55em] text-[0.9em] text-white/85 data-[focused=true]:ring-[#00E5FF]`}>
                <LayoutGrid className="h-[1em] w-[1em]" /> All modes
              </button>
              <button type="button" data-end-focus="home" data-focused={focusId === 'home'} onClick={guard(() => onNavigate(storyNodeId ? '/story' : '/'))} className={`${btnBase} border border-white/20 bg-white/[0.04] px-[0.9em] py-[0.55em] text-[0.9em] text-white/85 data-[focused=true]:ring-[#00E5FF]`}>
                {storyNodeId ? <><MapIcon className="h-[1em] w-[1em]" /> Story map</> : <><Home className="h-[1em] w-[1em]" /> Home</>}
              </button>
              {/* M13.4 share challenge (K-factor loop) — not for a score the Arena refused */}
              {!arenaRefused && (
                <button type="button" data-end-focus="challenge" data-focused={focusId === 'challenge'} onClick={guard(share.onChallenge)} disabled={share.state === 'minting'} className={`${btnBase} border border-[#A855F7]/60 bg-[#A855F7]/10 px-[0.9em] py-[0.55em] text-[0.9em] text-[#C99BFF] data-[focused=true]:ring-[#A855F7]`}>
                  {share.state === 'copied' ? <><Check className="h-[1em] w-[1em]" /> Challenge link copied</> : share.state === 'minting' ? <><Loader2 className="h-[1em] w-[1em] animate-spin" /> Minting…</> : <><Share2 className="h-[1em] w-[1em]" /> Challenge a friend</>}
                </button>
              )}
              {proofLine && (
                <button type="button" data-end-focus="proof" data-focused={focusId === 'proof'} onClick={guard(share.onProof)} disabled={share.state === 'minting'} className={`${btnBase} max-w-full border border-[#00E5FF]/50 bg-[#00E5FF]/10 px-[0.9em] py-[0.55em] text-[0.9em] text-[#00E5FF] data-[focused=true]:ring-[#00E5FF]`}>
                  <Share2 className="h-[1em] w-[1em] shrink-0" /> <span className="truncate">Share proof · {proofLine}</span>
                </button>
              )}
              {(extraActions ?? []).map((a) => (
                <ActionButton key={a.id} a={a} focused={focusId === `x-${a.id}`} onPress={(x) => { if (!armed()) return; if (x.href) onNavigate(x.href); else x.onSelect?.(); }} />
              ))}
              <span aria-hidden className="ml-auto hidden items-center gap-[0.9em] text-[0.72em] uppercase tracking-[0.14em] text-white/45 [@media(hover:hover)]:flex">
                <span><b className="text-[#00FF9D]">A</b> {revealDone(rv, steps.length) ? 'Select' : 'Skip'}</span>
                <span><b className="text-[#FF3366]">B</b> Back</span>
                <span>✚ Move</span>
              </span>
            </div>
            {share.url && <p className="mt-[0.4em] break-all font-mono text-[0.7em] text-white/45">{share.url}</p>}
          </footer>
        </motion.section>
      </div>
    </motion.div>
  );
}

function StoryRewardCardCounted({ r, show, instant, ms }: { r: NonNullable<EndScreenProps['storyReward']>; show: boolean; instant: boolean; ms: number }) {
  const lc = useCountUp(r.rewardLC, { active: show, instant, ms: Math.max(200, ms - 60) });
  return <StoryRewardCard r={r} lc={lc} />;
}
