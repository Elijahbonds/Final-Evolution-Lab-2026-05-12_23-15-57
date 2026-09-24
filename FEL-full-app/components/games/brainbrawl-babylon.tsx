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

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode, hnum } from './hud-format';
import { CATEGORIES, CATEGORY_COLOR, type Category } from '@/lib/babylon/core/BrainBrawlCore';

type Hud = Record<string, HudValue>;
const OPTS = [
  { key: 'optA', face: 'A', btn: 'A', dpad: '▲', color: '#22d3ee' }, { key: 'optB', face: 'B', btn: 'B', dpad: '▶', color: '#f43f5e' },
  { key: 'optX', face: 'C', btn: 'X', dpad: '▼', color: '#a855f7' }, { key: 'optY', face: 'D', btn: 'Y', dpad: '◀', color: '#facc15' },
] as const;
const SEAT = ['#22d3ee', '#facc15'];
const isBoard = (v: unknown): v is { name: string; score: number | string; line: string }[] =>
  Array.isArray(v) && v.every((r) => !!r && typeof r === 'object' && 'line' in (r as object));

/** An answer that is a shape (rows joined by " / ") draws as rows, not as one truncated line. */
function OptionText({ text }: { text: string }) {
  if (!text.includes(' / ')) return <span className="line-clamp-2 min-w-0 break-words leading-tight">{text}</span>;   // two lines, never an ellipsis on a phone
  return (
    <span className="grid min-w-0 gap-0 font-mono text-[11px] leading-[1.05] tracking-[0.2em] sm:text-sm">
      {text.split(' / ').map((row, i) => <span key={i} className="whitespace-pre">{row}</span>)}
    </span>
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
  const [phase, setPhase] = useState<ModePhase>('loading');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hud, setHud] = useState<Hud>({});

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const bus = new InputBus(); busRef.current = bus;
    let stop: (() => void) | null = null; let disposed = false;
    const resultSink = async (r: SessionResult) => {
      if (endedRef.current) return; endedRef.current = true;
      const won = r.outcome === 'win';
      const result: GameResult = { score: r.score, stats: r.stats, outcome: r.outcome, opponentScore: Number(r.stats?.p2score ?? 0), won, duration: r.durationSec, headline: won ? 'BIG BRAIN' : 'BRAWL OVER' };
      onEnd(result);
    };
    const startTimer = setTimeout(() => {
      if (disposed) return;
      runMode(MODES.brainbrawl, {
        canvas, input: bus,
        onPhase: (p, cd) => { setPhase(p); setCountdown(p === 'countdown' && typeof cd === 'number' ? cd : null); setLoadError(p === 'error' ? (typeof cd === 'string' ? cd : 'Failed to load this mode.') : null); },
        onHud: (u) => setHud((prev) => ({ ...prev, ...u })),
        resultSink,
      }).then((s) => { if (disposed) { s(); return; } stop = s; }).catch((e) => console.error('[FEL-BRAINBRAWL] boot failed', e));
    }, 0);
    return () => { disposed = true; clearTimeout(startTimer); stop?.(); busRef.current = null; };
  }, [onEnd]);

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
  const dense = display.length >= 5;   // a 5- or 6-row grid (tier 2–3 counts) must not push the card over the top bar

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

      {/* the challenge card — up through the question, the answer window AND the reveal */}
      {phase === 'playing' && typeof hud.prompt === 'string' && hud.prompt && (
        <div data-bb="card" className="absolute inset-x-0 bottom-2 flex flex-col items-center px-2 font-mono sm:bottom-3 sm:px-3">
          {/* the middle of the stage, not all of it: the podiums stand at ~25 % and ~75 % of the width, and the bodies on them
              are half the reveal — a 760 px card covered both from the chest down on every question */}
          <div className="flex w-full max-w-[760px] flex-col items-center gap-1.5 sm:w-[48%] sm:min-w-[440px] sm:gap-2">
            <div className="fel-panel flex w-full items-center gap-3 px-3 py-1 sm:px-4">
              <span className="shrink-0 text-[10px] font-bold tracking-widest sm:text-[11px]" style={{ color: typeof hud.categoryColor === 'string' && hud.categoryColor ? hud.categoryColor : '#fff' }}>{hnode(hud.category, '')} · TIER {hnode(hud.tier, 1)}</span>
              <span className="min-w-0 flex-1" />
              {/* the clock as a bar: it drains in step with the number, red in the last third */}
              <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-white/10 sm:w-24">
                {clockFrac !== null && <span className="block h-full rounded-full transition-[width] duration-300 ease-linear" style={{ width: `${Math.round(clockFrac * 100)}%`, background: clockFrac < 0.34 ? '#ff2d78' : '#22d3ee' }} />}
              </span>
            </div>
            <div className="fel-panel max-w-full px-4 py-1 text-center text-sm font-bold text-white sm:px-5 sm:py-2 sm:text-lg">{hud.prompt}</div>
            {display.length > 0 && !revealed && (
              <div className={`fel-panel max-w-full px-4 py-2 text-center text-white whitespace-pre sm:px-6 sm:py-3 ${dense ? 'text-base leading-snug tracking-[0.12em] sm:text-xl' : 'text-lg leading-relaxed tracking-[0.15em] sm:text-2xl'}`}>{display.join('\n')}</div>
            )}
            {typeof hud.optA === 'string' && hud.optA && (
              <div className="grid w-full grid-cols-2 gap-1.5 sm:gap-2">
                {OPTS.map((o, idx) => {
                  const isAnswer = revealed && idx === answer;
                  const seats = [0, 1].filter((s) => showPick(s) && picks[s] === idx);
                  const wrongPick = revealed && !isAnswer && seats.length > 0;
                  const state = isAnswer ? 'correct' : wrongPick ? 'wrong-pick' : seats.length ? 'picked' : revealed ? 'dim' : 'idle';
                  const ring = isAnswer ? '#4ade80' : wrongPick ? '#f87171' : seats.length ? '#ffffff' : `${o.color}66`;
                  return (
                    <button key={o.key} data-bb-opt={state} onPointerDown={(e) => { e.preventDefault(); emit({ t: 'button', btn: o.btn, pressed: true }); }}
                      className={`fel-panel flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs text-white transition-opacity duration-200 sm:gap-3 sm:px-4 sm:py-3 sm:text-base md:text-lg ${state === 'dim' ? 'opacity-40' : ''}`}
                      style={{ borderColor: ring, borderWidth: state === 'idle' ? undefined : 2, background: isAnswer ? 'rgba(34,197,94,0.22)' : wrongPick ? 'rgba(239,68,68,0.20)' : undefined }}>
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold text-black sm:h-8 sm:w-8 sm:text-[13px]" style={{ background: o.color }}>{o.face}</span>
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
            <div className="flex min-h-[20px] items-center gap-2">
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

      {/* banner (above the wheel's pin, not on it) + pick screen + the final board */}
      {phase === 'playing' && typeof hud.banner === 'string' && hud.banner && (
        <div data-bb="banner" className="pointer-events-none absolute inset-x-0 top-[13%] flex flex-col items-center gap-2 px-4 text-center font-mono">
          <span className="fel-heading fel-panel px-5 py-1.5 text-xl font-black text-white sm:px-6 sm:py-2 sm:text-3xl" style={{ color: hud.phase === 'spin' && typeof hud.categoryColor === 'string' && hud.categoryColor ? hud.categoryColor : undefined }}>{hud.banner}</span>
          {!(typeof hud.prompt === 'string' && hud.prompt) && typeof hud.hint === 'string' && hud.hint && <span className="fel-panel px-3 py-1 text-xs text-white/70">{hud.hint}</span>}
        </div>
      )}
      {phase === 'playing' && hud.phase === 'done' && isBoard(hud.board) && typeof hud.boardTitle === 'string' && hud.boardTitle && (
        <div className="pointer-events-none absolute inset-x-0 top-[44%] flex justify-center px-4 font-mono">
          <div className="fel-panel w-full max-w-[460px] px-5 py-3">
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
