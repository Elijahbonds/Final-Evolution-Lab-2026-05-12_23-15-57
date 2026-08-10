'use client';

/**
 * components/games/board-hud.tsx
 *
 * Premium-dark minimal HUD for the board lane (fix areas 6/8):
 *  - THPS trick text popups + rolling score ticker
 *  - live combo readout "1,250 x 4" with bank flash / bail loss flash
 *  - grind balance meter (appears only while locked on)
 *  - SSX adrenaline bar with TRICKY state
 *  - wipeout vignette + recover hint
 *
 * Rendering contract: React re-renders ONLY on discrete events (popups,
 * bank, bail). Continuous data (score ticker, meters, speed) is written
 * straight to DOM nodes from one rAF loop reading a mutable state ref —
 * zero per-frame React work, mobile-Safari friendly.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { BoardModeId } from '../../lib/board/trick-table';

// ---------------------------------------------------------------------------
// Shared mutable HUD state + event bus (scene writes, HUD reads)
// ---------------------------------------------------------------------------

export interface BoardHudState {
  score: number;
  comboBase: number;
  comboMultiplier: number;
  comboOpen: boolean;
  chainWindow: number;   // 0..1 remaining ground-chain grace
  grinding: boolean;
  balance: number;       // -1..1
  boost: number;         // 0..1
  boostActive: boolean;
  tricky: boolean;
  speedNorm: number;     // 0..1
  airborne: boolean;
  wipeout: boolean;
  timeRemaining: number; // seconds
  grindChain: number;    // consecutive grinds in the current air->grind chain (Part 6 Fix 4)
  rhythm: number;        // SSX3 rhythm-boost chain length (banks landed within window)
  rhythmMult: number;    // >=1 boost-fill multiplier from the rhythm chain
}

export function createHudState(): BoardHudState {
  return {
    score: 0, comboBase: 0, comboMultiplier: 1, comboOpen: false,
    chainWindow: 0, grinding: false, balance: 0, boost: 0,
    boostActive: false, tricky: false, speedNorm: 0, airborne: false,
    wipeout: false, timeRemaining: 0, grindChain: 0,
    rhythm: 0, rhythmMult: 1,
  };
}

export type BoardHudEvent =
  | { kind: 'trick'; name: string; points: number; stale: boolean }
  | { kind: 'sketchy' }
  | { kind: 'banked'; amount: number; multiplier: number }
  | { kind: 'bail'; lost: number; reason: string }
  | { kind: 'tricky' };

export interface HudBus {
  emit(e: BoardHudEvent): void;
  subscribe(fn: (e: BoardHudEvent) => void): () => void;
}

export function createHudBus(): HudBus {
  const subs = new Set<(e: BoardHudEvent) => void>();
  return {
    emit(e) { subs.forEach((fn) => fn(e)); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Popup {
  id: number;
  text: string;
  sub?: string;
  tone: 'trick' | 'stale' | 'sketchy' | 'banked' | 'bail' | 'tricky';
}

interface BoardHudProps {
  mode: BoardModeId;
  stateRef: React.MutableRefObject<BoardHudState>;
  bus: HudBus;
}

const MODE_LABEL: Record<BoardModeId, string> = {
  skate: 'VENICE SKATEPARK',
  snow: 'MOUNTAIN SLOPE',
  surf: 'SURF BREAK',
};

let popupId = 0;

export function BoardHud({ mode, stateRef, bus }: BoardHudProps) {
  const [popups, setPopups] = useState<Popup[]>([]);
  const [wipeout, setWipeout] = useState(false);

  // continuous DOM targets
  const scoreEl = useRef<HTMLDivElement>(null);
  const comboEl = useRef<HTMLDivElement>(null);
  const comboWrapEl = useRef<HTMLDivElement>(null);
  const balanceMarkerEl = useRef<HTMLDivElement>(null);
  const balanceWrapEl = useRef<HTMLDivElement>(null);
  const chainChipEl = useRef<HTMLDivElement>(null);
  const rhythmChipEl = useRef<HTMLDivElement>(null);
  const boostFillEl = useRef<HTMLDivElement>(null);
  const boostWrapEl = useRef<HTMLDivElement>(null);
  const speedEl = useRef<HTMLDivElement>(null);
  const timeEl = useRef<HTMLDivElement>(null);
  const shownScore = useRef(0);

  // ── Event subscriptions (discrete -> React state) ────────────────────────
  useEffect(() => {
    const push = (p: Omit<Popup, 'id'>, ttl = 1500) => {
      const id = ++popupId;
      setPopups((prev) => [...prev.slice(-3), { ...p, id }]);
      window.setTimeout(
        () => setPopups((prev) => prev.filter((x) => x.id !== id)),
        ttl
      );
    };
    return bus.subscribe((e) => {
      switch (e.kind) {
        case 'trick':
          push({
            text: e.name,
            sub: `+${e.points.toLocaleString()}`,
            tone: e.stale ? 'stale' : 'trick',
          });
          break;
        case 'sketchy':
          push({ text: 'SKETCHY', tone: 'sketchy' }, 900);
          break;
        case 'banked':
          push({
            text: `+${e.amount.toLocaleString()}`,
            sub: `BANKED x${e.multiplier}`,
            tone: 'banked',
          }, 1800);
          break;
        case 'bail':
          push({
            text: 'WIPEOUT',
            sub: e.lost > 0 ? `-${e.lost.toLocaleString()} lost` : e.reason,
            tone: 'bail',
          }, 1800);
          break;
        case 'tricky':
          push({ text: 'TRICKY!', sub: 'signature armed', tone: 'tricky' }, 2000);
          break;
      }
    });
  }, [bus]);

  // ── Continuous rAF writer (no React) ─────────────────────────────────────
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const s = stateRef.current;

      // rolling score ticker
      shownScore.current += (s.score - shownScore.current) * 0.18;
      if (Math.abs(s.score - shownScore.current) < 1) shownScore.current = s.score;
      if (scoreEl.current) {
        scoreEl.current.textContent = Math.round(shownScore.current).toLocaleString();
      }

      // combo readout
      if (comboWrapEl.current && comboEl.current) {
        comboWrapEl.current.style.opacity = s.comboOpen ? '1' : '0';
        if (s.comboOpen) {
          comboEl.current.textContent =
            `${s.comboBase.toLocaleString()} × ${s.comboMultiplier}`;
          // grace window drains -> readout warms toward red
          const urgency = s.chainWindow > 0 && !s.airborne && !s.grinding
            ? 1 - s.chainWindow : 0;
          comboEl.current.style.color =
            urgency > 0.55 ? '#f87171' : urgency > 0 ? '#fbbf24' : '#e2e8f0';
        }
      }

      // balance meter
      if (balanceWrapEl.current && balanceMarkerEl.current) {
        balanceWrapEl.current.style.opacity = s.grinding ? '1' : '0';
        if (s.grinding) {
          balanceMarkerEl.current.style.left = `${50 + s.balance * 46}%`;
          const danger = Math.abs(s.balance);
          balanceMarkerEl.current.style.background =
            danger > 0.7 ? '#ef4444' : danger > 0.4 ? '#fbbf24' : '#4ade80';
        }
      }

      // grind-chain chip (THPS endless-chain read): appears at x2 and up
      if (chainChipEl.current) {
        if (s.grindChain >= 2) {
          chainChipEl.current.style.opacity = '1';
          const mult = Math.min(3, 1 + 0.5 * (s.grindChain - 1));
          chainChipEl.current.textContent = `GRIND CHAIN ×${mult.toFixed(1)}`;
          chainChipEl.current.style.color = mult >= 3 ? '#FFD700' : '#00FF9D';
        } else {
          chainChipEl.current.style.opacity = '0';
        }
      }

      // rhythm-boost chip (SSX3 rhythm read): appears once the chain multiplies
      if (rhythmChipEl.current) {
        if (s.rhythmMult > 1.001) {
          rhythmChipEl.current.style.opacity = '1';
          rhythmChipEl.current.textContent = `RHYTHM ×${s.rhythmMult.toFixed(1)}`;
          rhythmChipEl.current.style.color = s.rhythmMult >= 1.6 ? '#FFD700' : '#00E5FF';
        } else {
          rhythmChipEl.current.style.opacity = '0';
        }
      }

      // boost bar
      if (boostFillEl.current && boostWrapEl.current) {
        boostFillEl.current.style.height = `${Math.round(s.boost * 100)}%`;
        boostFillEl.current.style.background = s.tricky
          ? 'linear-gradient(180deg,#fff7cc,#ffce54)'
          : 'linear-gradient(180deg,#38bdf8,#2563eb)';
        boostWrapEl.current.style.boxShadow = s.tricky
          ? '0 0 14px 2px rgba(255,206,84,0.55)'
          : 'none';
      }

      if (speedEl.current) {
        speedEl.current.textContent = `${Math.round(s.speedNorm * 99)}`;
      }
      if (timeEl.current) {
        const m = Math.floor(s.timeRemaining / 60);
        const sec = Math.max(0, Math.floor(s.timeRemaining % 60));
        timeEl.current.textContent = `${m}:${sec.toString().padStart(2, '0')}`;
      }

      setWipeout((w) => (w === s.wipeout ? w : s.wipeout));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stateRef]);

  return (
    <div className="pointer-events-none absolute inset-0 select-none font-sans">
      <style>{`
        @keyframes fel-pop-in {
          0% { transform: translateY(14px) scale(0.7); opacity: 0; }
          22% { transform: translateY(0) scale(1.08); opacity: 1; }
          34% { transform: scale(1); }
          80% { opacity: 1; }
          100% { transform: translateY(-10px); opacity: 0; }
        }
        @keyframes fel-tricky-pulse {
          0%,100% { text-shadow: 0 0 8px rgba(255,206,84,.9); }
          50% { text-shadow: 0 0 22px rgba(255,206,84,1); }
        }
        @keyframes fel-wipeout-pulse {
          0%,100% { opacity: .55; } 50% { opacity: .8; }
        }
      `}</style>

      {/* top bar: venue / time / score */}
      <div className="absolute left-0 right-0 top-2 flex items-start justify-between px-4">
        <div>
          <div className="text-[10px] tracking-[0.3em] text-slate-400">{MODE_LABEL[mode]}</div>
          <div ref={timeEl} className="text-lg font-bold tabular-nums text-slate-200">0:00</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] tracking-[0.3em] text-slate-400">SCORE</div>
          <div
            ref={scoreEl}
            className="text-2xl font-black tabular-nums text-white"
            style={{ textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}
          >
            0
          </div>
        </div>
      </div>

      {/* trick popups */}
      <div className="absolute left-1/2 top-[30%] -translate-x-1/2 text-center">
        {popups.map((p) => (
          <div
            key={p.id}
            className="mb-1"
            style={{ animation: 'fel-pop-in 1.5s ease-out forwards' }}
          >
            <div
              className={
                p.tone === 'banked' ? 'text-3xl font-black text-emerald-300'
                : p.tone === 'bail' ? 'text-3xl font-black text-red-400'
                : p.tone === 'tricky' ? 'text-3xl font-black text-amber-300'
                : p.tone === 'sketchy' ? 'text-xl font-bold text-orange-400'
                : p.tone === 'stale' ? 'text-2xl font-bold text-slate-400'
                : 'text-2xl font-black text-sky-200'
              }
              style={{
                textShadow: '0 2px 14px rgba(0,0,0,0.7)',
                animation: p.tone === 'tricky' ? 'fel-tricky-pulse 0.6s infinite' : undefined,
              }}
            >
              {p.text}
            </div>
            {p.sub ? (
              <div className="text-sm font-semibold text-slate-300">{p.sub}</div>
            ) : null}
          </div>
        ))}
      </div>

      {/* combo readout */}
      <div
        ref={comboWrapEl}
        className="absolute bottom-[18%] left-1/2 -translate-x-1/2 transition-opacity duration-200"
        style={{ opacity: 0 }}
      >
        <div
          ref={comboEl}
          className="text-xl font-black tabular-nums"
          style={{ textShadow: '0 2px 10px rgba(0,0,0,0.7)' }}
        />
      </div>

      {/* grind-chain chip */}
      <div
        ref={chainChipEl}
        className="absolute bottom-[33%] left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-black tracking-[0.25em] transition-opacity duration-150"
        style={{
          opacity: 0,
          background: 'rgba(5,5,5,0.72)',
          border: '1px solid rgba(0,255,157,0.4)',
          textShadow: '0 0 8px rgba(0,255,157,0.55)',
        }}
      />

      {/* rhythm-boost chip */}
      <div
        ref={rhythmChipEl}
        className="absolute bottom-[27%] left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-black tracking-[0.25em] transition-opacity duration-150"
        style={{
          opacity: 0,
          background: 'rgba(5,5,5,0.72)',
          border: '1px solid rgba(0,229,255,0.4)',
          textShadow: '0 0 8px rgba(0,229,255,0.55)',
        }}
      />

      {/* grind balance meter */}
      <div
        ref={balanceWrapEl}
        className="absolute bottom-[28%] left-1/2 h-2 w-56 -translate-x-1/2 rounded-full transition-opacity duration-150"
        style={{
          opacity: 0,
          background:
            'linear-gradient(90deg, rgba(239,68,68,.8), rgba(15,23,42,.7) 30%, rgba(15,23,42,.7) 70%, rgba(239,68,68,.8))',
          border: '1px solid rgba(148,163,184,0.35)',
        }}
      >
        <div
          ref={balanceMarkerEl}
          className="absolute top-1/2 h-4 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm"
          style={{ left: '50%', background: '#4ade80' }}
        />
      </div>

      {/* boost / adrenaline bar */}
      <div
        ref={boostWrapEl}
        className="absolute bottom-8 left-4 h-32 w-2.5 overflow-hidden rounded-full"
        style={{ background: 'rgba(15,23,42,0.65)', border: '1px solid rgba(148,163,184,0.35)' }}
      >
        <div
          ref={boostFillEl}
          className="absolute bottom-0 left-0 right-0"
          style={{ height: '0%' }}
        />
      </div>
      <div className="absolute bottom-3 left-3 text-[9px] tracking-widest text-slate-400">
        BOOST
      </div>

      {/* speed readout */}
      <div className="absolute bottom-8 right-4 text-right">
        <div ref={speedEl} className="text-xl font-black tabular-nums text-slate-200">0</div>
        <div className="text-[9px] tracking-widest text-slate-400">SPEED</div>
      </div>

      {/* wipeout vignette */}
      {wipeout ? (
        <div
          className="absolute inset-0"
          style={{
            boxShadow: 'inset 0 0 90px 34px rgba(239,68,68,0.55)',
            animation: 'fel-wipeout-pulse 0.5s ease-in-out infinite',
          }}
        />
      ) : null}
    </div>
  );
}

export default BoardHud;
