'use client';

// Brain Brawl — Babylon host (A+ mission #11). THIN: owns the canvas, boots the harness with BrainBrawlMode, draws the
// couch-size challenge card over the Neuro Arena: the category chip, the display (grids, sequences, expressions), the
// four answers on the faces (P2 on the arrows), the clock, the claims strip, the final board.
//
// BRAINBRAWL-MAJOR (2026-09-24): the card is the other half of the reveal. It used to vanish the instant a challenge
// resolved, so the right answer was a hint string and nothing said which button you had pressed. Now it stays up through
// the result: the answer marked ✓, a wrong pick marked ✗ with the seat that made it, every other option dimmed, and a
// verdict pill per seat. A solo lock-in lights the pick at once; a duel keeps both picks hidden until the reveal (one
// screen, two players — P2 must not read P1's answer off it). Grid answers (the ANALYZE rotations and shape matches) were
// "■ · ■ / · ■ · / ■ ■ ·" strings, truncated on a phone: they draw as the little grids they are. The clock is a bar too.
//
// BRAINBRAWL-RESIDUAL (2026-09-24):
//   · THE CARD COVERED THE WHEEL AND THE LECTERNS (the eye: its top at ~45 % of the stage, over the wheel's lower half, the
//     answers over both lecterns in a duel). The set now puts the wheel in the top band and the lecterns at the sides, and the
//     card is the centre column under the wheel — 40 % wide, sized to fit between the wheel's rim and the bottom edge. The
//     claim banner rides the card's top during the reveal instead of floating over the wheel.
//   · A LOGIC '?' ON ITS OWN LINE: a sequence is one row of tiles now, the gap last, never wrapped.
//   · THE ROOM TALKS: each contestant's line in a bubble over their podium (anchored to the head through the live camera),
//     the host's line in a bubble over him while he is in view and on the card's header while the card is up.
//   · GO AGAIN IN PLACE: the mode runs `continuous` (its finish reports a card and keeps the stage), and the shell's REPLAY
//     calls replayBrainBrawl through ReplayInPlaceContext — round one's spin, same players, no splash, no remount.

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { replayBrainBrawl } from '@/lib/babylon/modes/BrainBrawlMode';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode, hnum } from './hud-format';
import { useReplayInPlace } from './replay-in-place';
import { CATEGORIES, CATEGORY_COLOR, type Category } from '@/lib/babylon/core/BrainBrawlCore';

type Hud = Record<string, HudValue>;
const OPTS = [
  { key: 'optA', face: 'A', btn: 'A', dpad: '▲', color: '#22d3ee' }, { key: 'optB', face: 'B', btn: 'B', dpad: '▶', color: '#f43f5e' },
  { key: 'optX', face: 'C', btn: 'X', dpad: '▼', color: '#a855f7' }, { key: 'optY', face: 'D', btn: 'Y', dpad: '◀', color: '#facc15' },
] as const;
const SEAT = ['#22d3ee', '#facc15'];
const HOST_COLOR = '#b9b2ff';
const HOST_LINE_MS = 2600;
const isBoard = (v: unknown): v is { name: string; score: number | string; line: string }[] =>
  Array.isArray(v) && v.every((r) => !!r && typeof r === 'object' && 'line' in (r as object));
const anchorOf = (v: unknown): [number, number] | null => {
  if (typeof v !== 'string') return null;
  const [x, y] = v.split(',').map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
};

/** An answer that is a shape (rows joined by " / ") draws as rows, not as one truncated line. */
function OptionText({ text }: { text: string }) {
  if (!text.includes(' / ')) return <span className="line-clamp-2 min-w-0 break-words leading-tight">{text}</span>;   // two lines, never an ellipsis on a phone
  return (
    <span className="grid min-w-0 gap-0 font-mono text-[11px] leading-[1.05] tracking-[0.2em] sm:text-sm">
      {text.split(' / ').map((row, i) => <span key={i} className="whitespace-pre">{row}</span>)}
    </span>
  );
}

/** A sequence (LOGIC: numbers or shapes with the gap last) as ONE row of tiles — the '?' lit in the category's colour. */
function SequenceRow({ line, color }: { line: string; color: string }) {
  const tokens = line.trim().split(/\s+/);
  const size = tokens.length <= 6 ? 'text-xl sm:text-2xl' : tokens.length <= 8 ? 'text-lg sm:text-xl' : 'text-base sm:text-lg';
  return (
    <div data-bb="sequence" className={`flex max-w-full flex-nowrap items-center justify-center gap-1 sm:gap-1.5 ${size}`}>
      {tokens.map((t, i) => (
        <span key={i} className="grid min-w-[1.6em] place-items-center rounded-md px-1 py-0.5 font-mono font-bold leading-none sm:px-1.5 sm:py-1"
          style={t === '?' ? { background: color, color: '#111' } : { background: 'rgba(255,255,255,0.08)', color: '#fff' }}>{t}</span>
      ))}
    </div>
  );
}

/**
 * A speech bubble at a head (anchor = % of the stage): over it (`above`), or beside it on the stage's side (`left`: the box to
 * the left, the tail pointing right at the head — the host's, stage right of the card).
 *
 * ONE bubble per speaker (POLISH-2 N1). Keyed by the line, a new line used to mount a second bubble while the last one was still
 * fading out, so on every landing two DOC VOLT bubbles ("Welcome to Brain Brawl!" under "Memory! Look closely.") stacked
 * half-transparent and neither read. The bubble is keyed by the SPEAKER now: a new line replaces the old one in place and the box
 * pops; it only fades when the speaker goes quiet.
 */
function Bubble({ id, text, anchor, color, who, place = 'above' }: { id: string; text: string; anchor: [number, number] | null; color: string; who: string; place?: 'above' | 'left' }) {
  const left = place === 'left';
  return (
    <AnimatePresence>
      {text && anchor && (
        <motion.div key={who} data-bb-bubble={who} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.16 } }}
          className="pointer-events-none absolute z-10 font-mono"
          style={{ left: `${Math.max(left ? 30 : 20, Math.min(left ? 94 : 80, anchor[0]))}%`, top: `${Math.max(16, anchor[1])}%` }}>   {/* never off the stage's edge */}
          <div className={`relative ${left ? '-translate-x-full -translate-y-1/2' : '-translate-x-1/2 -translate-y-full'}`}>
            <motion.div key={id} initial={{ opacity: 0.3, scale: 0.78 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 560, damping: 26 }}
              className={`w-max max-w-[130px] rounded-2xl border-2 bg-white px-2.5 py-1 text-center text-[11px] font-black leading-tight text-[#120c2c] shadow-lg sm:max-w-[300px] sm:px-3 sm:py-1.5 sm:text-sm ${left ? 'origin-right' : 'origin-bottom'}`} style={{ borderColor: color }}>
              <span className="mr-1 text-[9px] font-bold tracking-wider" style={{ color }}>{who}</span>{text}
            </motion.div>
            {left
              ? <div className="absolute left-full top-1/2 h-0 w-0 -translate-y-1/2 border-y-[8px] border-l-[10px] border-y-transparent" style={{ borderLeftColor: color }} />
              : <div className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-[8px] border-t-[10px] border-x-transparent" style={{ borderTopColor: color }} />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const POP_TONE: Record<string, string> = { correct: '#4ade80', wrong: '#ff5c5c', timeout: '#e2e8f0' };

/**
 * A seat's score pop (POLISH-2 R1): "+94" / "WRONG" / "TIME" beside the podium, on its outboard side. The shared 3D pop it replaces
 * was dark green / dark red on the dark set and drew BEHIND the gallery bodies; this one is the card layer's — always in front,
 * bright text on a dark plate with the verdict's colour round it.
 */
function ScorePop({ id, text, tone, anchor }: { id: string; text: string; tone: string; anchor: [number, number] | null }) {
  const color = POP_TONE[tone] ?? '#ffffff';
  return (
    <AnimatePresence>
      {text && anchor && (
        <motion.div key={id} data-bb-pop={tone} initial={{ opacity: 0, scale: 0.4, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, y: -16, transition: { duration: 0.3 } }}
          transition={{ type: 'spring', stiffness: 460, damping: 17 }}
          className="pointer-events-none absolute z-20 font-mono"
          style={{ left: `${Math.max(7, Math.min(93, anchor[0]))}%`, top: `${Math.max(14, Math.min(90, anchor[1]))}%` }}>
          <div className="-translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-xl border-2 bg-[#0a0618]/90 px-2.5 py-0.5 text-2xl font-black leading-none tracking-tight shadow-lg sm:px-3 sm:py-1 sm:text-4xl"
            style={{ color, borderColor: color, textShadow: `0 0 14px ${color}99, 0 2px 0 #000` }}>{text}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * The question (POLISH-2 N4). The MEMORY prompt wrapped inside its own range — "(rows A–C, columns 1–" / "3)" — because a line
 * may break after an en dash. A closing aside in brackets goes on its own line and never breaks, and a range (A–C, 1–3) never
 * splits anywhere.
 */
function PromptText({ text }: { text: string }) {
  const keep = (s: string) => s.replace(/(\w)–(\w)/g, '$1⁠–⁠$2');   // word joiners: no break inside a range
  const m = text.match(/^(.*\S)\s*(\([^()]*\))$/);
  if (!m) return <>{keep(text)}</>;
  return (
    <>
      <span className="block">{keep(m[1])}</span>
      <span data-bb="prompt-aside" className="block whitespace-nowrap text-[0.85em] font-semibold text-white/75">{keep(m[2])}</span>
    </>
  );
}

const VERDICT_PILL: Record<string, { label: (gain: number) => string; color: string }> = {
  correct: { label: (g) => `+${g}`, color: '#4ade80' },
  wrong: { label: () => 'WRONG', color: '#f87171' },
  timeout: { label: () => 'TIME', color: '#94a3b8' },
};

export default function BrainBrawlBabylon({ onEnd }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const endedRef = useRef(false);
  /** When the current match began, if it began on a REPLAY (the harness's clock started with the first one). */
  const replayAtRef = useRef<number | null>(null);
  const onEndRef = useRef(onEnd); onEndRef.current = onEnd;
  const [phase, setPhase] = useState<ModePhase>('loading');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hud, setHud] = useState<Hud>({});
  const [hostLive, setHostLive] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const bus = new InputBus(); busRef.current = bus;
    let stop: (() => void) | null = null; let disposed = false;
    // one sink for a finish either way: the mode reports through card() on this continuous host (end() elsewhere)
    const resultSink = async (r: SessionResult) => {
      if (endedRef.current) return; endedRef.current = true;
      const won = r.outcome === 'win';
      const duration = replayAtRef.current !== null ? Math.round((performance.now() - replayAtRef.current) / 100) / 10 : r.durationSec;
      const result: GameResult = { score: r.score, stats: r.stats, outcome: r.outcome, opponentScore: Number(r.stats?.p2score ?? 0), won, duration, headline: won ? 'BIG BRAIN' : 'BRAWL OVER' };
      onEndRef.current(result);
    };
    const startTimer = setTimeout(() => {
      if (disposed) return;
      runMode(MODES.brainbrawl, {
        canvas, input: bus,
        onPhase: (p, cd) => { setPhase(p); setCountdown(p === 'countdown' && typeof cd === 'number' ? cd : null); setLoadError(p === 'error' ? (typeof cd === 'string' ? cd : 'Failed to load this mode.') : null); },
        onHud: (u) => setHud((prev) => ({ ...prev, ...u })),
        resultSink,
        // GO AGAIN in place: the finish reports its card and the stage stays up for REPLAY (replayBrainBrawl)
        continuous: true, cardSink: resultSink,
      }).then((s) => { if (disposed) { s(); return; } stop = s; }).catch((e) => console.error('[FEL-BRAINBRAWL] boot failed', e));
    }, 0);
    return () => { disposed = true; clearTimeout(startTimer); stop?.(); busRef.current = null; };
  }, []);

  // REPLAY on the shell's end card: a new match on this stage, same players, straight into round one's spin
  const restart = useCallback((): boolean => {
    const ok = replayBrainBrawl();
    if (ok) { endedRef.current = false; replayAtRef.current = performance.now(); }
    return ok;
  }, []);
  useReplayInPlace(restart);

  // the host's line: a bubble over him while he is in view, the card's header while the card is up — for HOST_LINE_MS
  const hostN = hnum(hud.hostN, 0);
  useEffect(() => {
    if (!hostN) return;
    setHostLive(true);
    const t = setTimeout(() => setHostLive(false), HOST_LINE_MS);
    return () => clearTimeout(t);
  }, [hostN]);

  const emit = useCallback((e: Parameters<InputBus['emit']>[0]) => { busRef.current?.emit(e); }, []);
  const tapStart = useCallback(() => emit({ t: 'button', btn: 'START', pressed: true }), [emit]);
  const claims = typeof hud.claims === 'string' ? Object.fromEntries(hud.claims.split(',').map((kv) => { const [k, v] = kv.split(':'); return [k, v]; })) : {};
  const twoP = Number(hud.players) === 2;
  const display = typeof hud.display === 'string' && hud.display ? hud.display.split('\n') : [];
  const revealed = hud.phase === 'result' && typeof hud.reveal === 'number' && hud.reveal >= 0;
  const answer = revealed ? hnum(hud.reveal, -1) : -1;
  // a solo lock-in shows the pick at once; a duel only at the reveal (one screen, two players)
  const picks = [hnum(hud.pickP1, -1), hnum(hud.pickP2, -1)];
  const showPick = (seat: number) => picks[seat] >= 0 && (revealed || (!twoP && seat === 0));
  const clockFrac = typeof hud.clockFrac === 'number' ? hud.clockFrac : null;
  const catColor = typeof hud.categoryColor === 'string' && hud.categoryColor ? hud.categoryColor : '#ffffff';
  const sequence = display.length === 1 && display[0].trim().endsWith('?');
  const dense = display.length >= 5;   // a 5- or 6-row grid (tier 2–3 counts) must still fit under the wheel
  const cardUp = phase === 'playing' && typeof hud.prompt === 'string' && !!hud.prompt;
  const hostSay = hostLive && typeof hud.hostSay === 'string' ? hud.hostSay : '';
  const banner = phase === 'playing' && typeof hud.banner === 'string' ? hud.banner : '';

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* top bar: scores + claims strip + clock */}
      <div data-bb="topbar" className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-2 py-2 font-mono sm:px-4 sm:py-3">
        <div className="fel-panel px-2 py-1 text-sm sm:px-3 sm:py-1.5">
          <span className="text-[10px] tracking-wider text-[#22d3ee]">{twoP ? 'P1' : 'YOU'}</span> <span className="fel-stat text-base sm:text-xl">{hnode(hud.score, 0)}</span>
          {twoP && <><span className="mx-2 text-white/40">·</span><span className="text-[10px] tracking-wider text-[#facc15]">P2</span> <span className="fel-stat text-base sm:text-xl">{hnode(hud.p2score, 0)}</span></>}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-1.5">
          {CATEGORIES.map((c: Category) => {
            const holder = claims[c];
            const mine = holder === '0', theirs = holder === '1';
            return (
              <span key={c} className="rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider sm:px-2 sm:py-1 sm:text-[10px]" style={{ background: mine || theirs ? CATEGORY_COLOR[c] : 'rgba(0,0,0,0.5)', color: mine || theirs ? '#111' : CATEGORY_COLOR[c], outline: hud.category === c ? '2px solid #fff' : 'none' }}>
                {c}{twoP && (mine || theirs) ? ` · ${mine ? 'P1' : 'P2'}` : ''}
              </span>
            );
          })}
        </div>
        {typeof hud.clock === 'number' && <span className={`fel-panel px-2 py-0.5 fel-stat text-lg sm:px-3 sm:py-1 sm:text-2xl ${hud.clock <= 3 ? 'text-[#ff2d78]' : 'text-white'}`}>{hud.clock}s</span>}
      </div>

      {/* the room talking: the contestants over their podiums, the host over his head while the card is not in front of him */}
      {phase === 'playing' && (
        <>
          <Bubble id={`s1-${hnum(hud.sayN1, 0)}`} text={typeof hud.say1 === 'string' ? hud.say1 : ''} anchor={anchorOf(hud.anchor1)} color={SEAT[0]} who={twoP ? 'P1' : 'YOU'} />
          {twoP && <Bubble id={`s2-${hnum(hud.sayN2, 0)}`} text={typeof hud.say2 === 'string' ? hud.say2 : ''} anchor={anchorOf(hud.anchor2)} color={SEAT[1]} who="P2" />}
          {!cardUp && !(hud.phase === 'done' && isBoard(hud.board)) && <Bubble id={`h-${hostN}`} text={hostSay} anchor={anchorOf(hud.anchorHost)} color={HOST_COLOR} who={String(hnode(hud.hostName, 'HOST'))} place={hud.hostBubble === 'left' ? 'left' : 'above'} />}
          {/* the verdict beside each podium (R1) */}
          <ScorePop id={`p1-${hnum(hud.popN1, 0)}`} text={typeof hud.pop1 === 'string' ? hud.pop1 : ''} tone={String(hnode(hud.popTone1, ''))} anchor={anchorOf(hud.anchorPop1)} />
          {twoP && <ScorePop id={`p2-${hnum(hud.popN2, 0)}`} text={typeof hud.pop2 === 'string' ? hud.pop2 : ''} tone={String(hnode(hud.popTone2, ''))} anchor={anchorOf(hud.anchorPop2)} />}
        </>
      )}

      {/* the challenge card — the centre column under the wheel, up through the question, the answer window AND the reveal */}
      {cardUp && (
        <div data-bb="card" className="absolute inset-x-0 bottom-1.5 flex flex-col items-center px-2 font-mono sm:bottom-2 sm:px-3">
          {/* between the lecterns (at ~18 % and ~82 % of the width) and under the wheel's rim (~44 % down): 40 % wide on a stage */}
          <div className="flex w-full max-w-[620px] flex-col items-center gap-1 rounded-2xl bg-[#07051a]/75 p-1 sm:w-[40%] sm:min-w-[400px] sm:gap-1.5 sm:p-1.5">
            {revealed && banner && <div data-bb="banner" className="fel-heading fel-panel px-4 py-1 text-center text-base font-black text-white sm:text-xl">{banner}</div>}
            <div className="fel-panel flex w-full items-center gap-2 px-3 py-1 sm:px-4">
              <span className="shrink-0 text-[10px] font-bold tracking-widest sm:text-[11px]" style={{ color: catColor }}>{hnode(hud.category, '')} · TIER {hnode(hud.tier, 1)}</span>
              {/* the host's call while the card is up — the WHOLE line, wrapped when it is long (POLISH-2 N3: it was cut to "That is a
                  no, I am afrai…") */}
              <span data-bb="host-line" className="min-w-0 flex-1 whitespace-normal break-words text-center text-[10px] leading-tight sm:text-[11px]" style={{ color: HOST_COLOR }}>{hostSay ? `🎙 ${hostSay}` : ''}</span>
              {/* the clock as a bar: it drains in step with the number, red in the last third */}
              <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-white/10 sm:w-20">
                {clockFrac !== null && <span className="block h-full rounded-full transition-[width] duration-300 ease-linear" style={{ width: `${Math.round(clockFrac * 100)}%`, background: clockFrac < 0.34 ? '#ff2d78' : '#22d3ee' }} />}
              </span>
            </div>
            <div data-bb="prompt" className="fel-panel max-w-full px-4 py-1 text-center text-sm font-bold text-white sm:px-5 sm:py-1.5 sm:text-base"><PromptText text={String(hud.prompt)} /></div>
            {display.length > 0 && !revealed && (
              sequence
                ? <div className="fel-panel max-w-full px-3 py-2 sm:px-4"><SequenceRow line={display[0]} color={catColor} /></div>
                : <div data-bb="display" className={`fel-panel max-w-full px-4 py-1.5 text-center text-white whitespace-pre sm:px-6 sm:py-2 ${dense ? 'text-xs leading-[1.2] tracking-[0.12em] sm:text-sm' : 'text-lg leading-snug tracking-[0.15em] sm:text-xl'}`}>{display.join('\n')}</div>
            )}
            {typeof hud.optA === 'string' && hud.optA && (
              <div className="grid w-full grid-cols-2 gap-1.5">
                {OPTS.map((o, idx) => {
                  const isAnswer = revealed && idx === answer;
                  const seats = [0, 1].filter((s) => showPick(s) && picks[s] === idx);
                  const wrongPick = revealed && !isAnswer && seats.length > 0;
                  const state = isAnswer ? 'correct' : wrongPick ? 'wrong-pick' : seats.length ? 'picked' : revealed ? 'dim' : 'idle';
                  const ring = isAnswer ? '#4ade80' : wrongPick ? '#f87171' : seats.length ? '#ffffff' : `${o.color}66`;
                  return (
                    <button key={o.key} data-bb-opt={state} onPointerDown={(e) => { e.preventDefault(); emit({ t: 'button', btn: o.btn, pressed: true }); }}
                      className={`fel-panel flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs text-white transition-opacity duration-200 sm:gap-2.5 sm:px-3 sm:py-2 sm:text-base ${state === 'dim' ? 'opacity-40' : ''}`}
                      style={{ borderColor: ring, borderWidth: state === 'idle' ? undefined : 2, background: isAnswer ? 'rgba(22,78,44,0.92)' : wrongPick ? 'rgba(90,24,32,0.92)' : 'rgba(12,10,32,0.9)' }}>
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold text-black sm:h-7 sm:w-7 sm:text-[12px]" style={{ background: o.color }}>{o.face}</span>
                      <OptionText text={String(hnode(hud[o.key], ''))} />
                      <span className="ml-auto flex shrink-0 items-center gap-1">
                        {seats.map((s) => <span key={s} className="rounded px-1 text-[10px] font-bold text-black" style={{ background: SEAT[s] }}>{twoP ? `P${s + 1}` : 'YOU'}</span>)}
                        {isAnswer && <span className="text-base font-black text-[#4ade80] sm:text-xl">✓</span>}
                        {wrongPick && <span className="text-base font-black text-[#f87171] sm:text-xl">✗</span>}
                        {twoP && !revealed && <span className="text-sm text-white/55">{o.dpad}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex min-h-[18px] items-center gap-2">
              {!revealed && hud.answeredP1 === true && <span className="fel-panel px-2 py-0.5 text-[11px] text-[#22d3ee]">{twoP ? 'P1 LOCKED' : 'LOCKED'}</span>}
              {!revealed && hud.answeredP2 === true && <span className="fel-panel px-2 py-0.5 text-[11px] text-[#facc15]">P2 LOCKED</span>}
              {revealed && ['verdictP1', 'verdictP2'].map((k, s) => {
                const v = typeof hud[k] === 'string' ? (hud[k] as string) : '';
                const pill = VERDICT_PILL[v]; if (!pill) return null;
                return <span key={k} data-bb-verdict={v} className="fel-panel px-2 py-0.5 text-[11px] font-bold" style={{ color: pill.color }}>{twoP ? `P${s + 1} ` : ''}{pill.label(hnum(hud[s ? 'gainP2' : 'gainP1'], 0))}</span>;
              })}
              {typeof hud.hint === 'string' && hud.hint && !revealed && <span className="fel-panel px-3 py-0.5 text-[11px] text-white/70">{hud.hint}</span>}
              {revealed && <span className="fel-panel px-3 py-0.5 text-[11px] text-white/60">A · next</span>}
            </div>
          </div>
        </div>
      )}

      {/* banner: under the wheel's rim, over the host's head (the spin, the landing, the pick, the finish) — the reveal's rides the card */}
      {banner && !revealed && (
        <div data-bb="banner" className="pointer-events-none absolute inset-x-0 top-[45%] flex flex-col items-center gap-2 px-4 text-center font-mono">
          <span className="fel-heading fel-panel whitespace-pre px-5 py-1.5 text-xl font-black text-white sm:px-6 sm:py-2 sm:text-3xl" style={{ color: hud.phase === 'spin' && typeof hud.categoryColor === 'string' && hud.categoryColor ? hud.categoryColor : undefined }}>{banner}</span>
          {!cardUp && typeof hud.hint === 'string' && hud.hint && <span className="fel-panel px-3 py-1 text-xs text-white/70">{hud.hint}</span>}
        </div>
      )}
      {phase === 'playing' && hud.phase === 'done' && isBoard(hud.board) && typeof hud.boardTitle === 'string' && hud.boardTitle && (
        <div className="pointer-events-none absolute inset-x-0 top-[56%] flex justify-center px-4 font-mono">
          <div className="fel-panel w-full max-w-[420px] px-5 py-3">
            <div className="grid gap-1.5">
              {hud.board.map((r, i) => (
                <div key={r.name} className="flex items-center justify-between gap-3 rounded-lg bg-black/40 px-3 py-1.5">
                  <span className="text-sm font-bold" style={{ color: i === 0 ? '#22d3ee' : '#facc15' }}>{r.name}</span>
                  <span className="truncate text-[11px] text-white/70">{r.line}</span>
                  <span className="fel-stat text-lg">{r.score}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 text-center text-[11px] text-[var(--fel-gold)]">{hud.boardTitle}</div>
          </div>
        </div>
      )}

      <BootSplash modeId="brainbrawl" title="BRAIN BRAWL" phase={phase} detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)} onStart={tapStart} onRetry={tapStart} />
      {phase === 'paused' && <button onClick={tapStart} className="absolute inset-0 flex items-center justify-center bg-black/60"><span className="fel-heading text-3xl font-bold text-white">PAUSED — TAP TO RESUME</span></button>}
      {(phase === 'playing' || phase === 'countdown') && busRef.current && <TouchOverlay bus={busRef.current} modeId="brainbrawl" visible />}
    </div>
  );
}
