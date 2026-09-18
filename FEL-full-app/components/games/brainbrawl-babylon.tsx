'use client';

// Brain Brawl — Babylon host (A+ mission #11). THIN: owns the canvas, boots the harness with BrainBrawlMode, draws the
// couch-size challenge card over the Neuro Arena: the category chip, the display (grids, sequences, expressions), the
// four answers on the faces (P2 on the arrows), the clock, the claims strip, the scoreboard between rounds.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { hnode } from './hud-format';
import { CATEGORIES, CATEGORY_COLOR, type Category } from '@/lib/babylon/core/BrainBrawlCore';

type Hud = Record<string, HudValue>;
const OPTS = [
  { key: 'optA', face: 'A', dpad: '▲', color: '#22d3ee' }, { key: 'optB', face: 'B', dpad: '▶', color: '#f43f5e' },
  { key: 'optX', face: 'C', dpad: '▼', color: '#a855f7' }, { key: 'optY', face: 'D', dpad: '◀', color: '#facc15' },
] as const;
const isBoard = (v: unknown): v is { name: string; score: number | string; line: string }[] =>
  Array.isArray(v) && v.every((r) => !!r && typeof r === 'object' && 'line' in (r as object));

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

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* top bar: scores + claims strip + clock */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-4 py-3 font-mono">
        <div className="fel-panel px-3 py-1.5 text-sm">
          <span className="text-[10px] tracking-wider text-[#22d3ee]">{twoP ? 'P1' : 'YOU'}</span> <span className="fel-stat text-xl">{hnode(hud.score, 0)}</span>
          {twoP && <><span className="mx-2 text-white/40">·</span><span className="text-[10px] tracking-wider text-[#facc15]">P2</span> <span className="fel-stat text-xl">{hnode(hud.p2score, 0)}</span></>}
        </div>
        <div className="flex items-center gap-1.5">
          {CATEGORIES.map((c: Category) => {
            const holder = claims[c];
            const mine = holder === '0', theirs = holder === '1';
            return (
              <span key={c} className="rounded px-2 py-1 text-[10px] font-bold tracking-wider" style={{ background: mine || theirs ? CATEGORY_COLOR[c] : 'rgba(0,0,0,0.5)', color: mine || theirs ? '#111' : CATEGORY_COLOR[c], outline: hud.category === c ? '2px solid #fff' : 'none' }}>
                {c}{twoP && (mine || theirs) ? ` · ${mine ? 'P1' : 'P2'}` : ''}
              </span>
            );
          })}
        </div>
        {typeof hud.clock === 'number' && <span className={`fel-panel px-3 py-1 fel-stat text-2xl ${hud.clock <= 3 ? 'text-[#ff2d78]' : 'text-white'}`}>{hud.clock}s</span>}
      </div>

      {/* the challenge card */}
      {phase === 'playing' && typeof hud.prompt === 'string' && hud.prompt && (
        <div className="absolute inset-x-0 bottom-3 flex flex-col items-center gap-2 px-3 font-mono">
          <div className="fel-panel px-4 py-1 text-[11px] font-bold tracking-widest" style={{ color: typeof hud.categoryColor === 'string' && hud.categoryColor ? hud.categoryColor : '#fff' }}>{hnode(hud.category, '')} · TIER {hnode(hud.tier, 1)}</div>
          <div className="fel-panel max-w-[760px] px-5 py-2 text-center text-lg font-bold text-white">{hud.prompt}</div>
          {display.length > 0 && (
            <div className="fel-panel max-w-[760px] px-6 py-3 text-center text-2xl leading-relaxed tracking-[0.15em] text-white whitespace-pre">{display.join('\n')}</div>
          )}
          {typeof hud.optA === 'string' && hud.optA && (
            <div className="grid w-full max-w-[760px] grid-cols-2 gap-2">
              {OPTS.map((o) => (
                <button key={o.key} onPointerDown={(e) => { e.preventDefault(); emit({ t: 'button', btn: o.face === 'C' ? 'X' : o.face === 'D' ? 'Y' : o.face, pressed: true }); }}
                  className="fel-panel flex items-center gap-3 rounded-xl px-4 py-3 text-left text-base text-white md:text-lg" style={{ borderColor: `${o.color}66` }}>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full font-mono text-[13px] font-bold text-black" style={{ background: o.color }}>{o.face}</span>
                  <span className="truncate">{hnode(hud[o.key], '')}</span>
                  {twoP && <span className="ml-auto shrink-0 text-sm text-white/55">{o.dpad}</span>}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            {hud.answeredP1 === true && <span className="fel-panel px-2 py-0.5 text-[11px] text-[#22d3ee]">{twoP ? 'P1 LOCKED' : 'LOCKED'}</span>}
            {hud.answeredP2 === true && <span className="fel-panel px-2 py-0.5 text-[11px] text-[#facc15]">P2 LOCKED</span>}
            {typeof hud.hint === 'string' && hud.hint && <span className="fel-panel px-3 py-0.5 text-[11px] text-white/70">{hud.hint}</span>}
          </div>
        </div>
      )}

      {/* banner + pick screen + scoreboard */}
      {phase === 'playing' && typeof hud.banner === 'string' && hud.banner && (
        <div className="pointer-events-none absolute inset-x-0 top-[26%] flex flex-col items-center gap-2 px-4 text-center font-mono">
          <span className="fel-heading fel-panel px-6 py-2 text-3xl font-black text-white">{hud.banner}</span>
          {!(typeof hud.prompt === 'string' && hud.prompt) && typeof hud.hint === 'string' && hud.hint && <span className="fel-panel px-3 py-1 text-xs text-white/70">{hud.hint}</span>}
        </div>
      )}
      {phase === 'playing' && isBoard(hud.board) && typeof hud.boardTitle === 'string' && hud.boardTitle && (
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
