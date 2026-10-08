'use client';

// /play/adventure-br — The Adventure's Battle Royale on the real ModeHarness (ADVENTURE PLAN Phase C). Mounts
// MODES.adventure_br the way /dev/adventure mounts the yard (one harness per canvas, deferred past StrictMode's phantom
// mount). On screen during play: the HUD only (owner rule) — who is left, the zone's timer, your bars, and the map (a
// small round chart of the circle, the next circle and you, drawn in the HUD, not in the world). Before START and on a
// pause: the controls screen. At the end: the result through the harness's result sink — your place, knockouts,
// damage, time — and PLAY AGAIN. No reward is posted (no session-route row for the BR yet: plan open decision 7).

import { useEffect, useRef, useState } from 'react';
import { runMode, InputBus, type ModePhase, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { buttonMap } from '@/lib/creator/cardSlot';
import { CONTROLS_SHEET } from '@/lib/babylon/adventure/host/inputMap';
import type { BRResult } from '@/lib/babylon/adventure/br/match';
import { AdventureRadial } from './radial';

const MODE_KEY = 'adventure_br';

export function AdventureBRStage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const mountedRef = useRef(false);
  const [phase, setPhase] = useState<ModePhase>('loading');
  const [hud, setHud] = useState<Record<string, HudValue>>({});
  const [err, setErr] = useState<string | null>(null);
  const [touch, setTouch] = useState(false);
  const [result, setResult] = useState<BRResult | null>(null);

  useEffect(() => {
    try { setTouch(window.matchMedia('(pointer: coarse)').matches); } catch { setTouch(false); }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const def = MODES[MODE_KEY];
    if (!canvas || mountedRef.current) return;
    mountedRef.current = true;
    if (!def) { setErr('the battle royale is not registered'); return; }
    const bus = new InputBus();
    busRef.current = bus;
    let stop: (() => void) | null = null;
    let disposed = false;
    const startTimer = setTimeout(() => {
      if (disposed) return;
      runMode(def, {
        canvas,
        input: bus,
        onPhase: (p, d) => { if (!disposed) { setPhase(p); if (p === 'error') setErr(String(d)); } },
        onHud: (h) => { if (!disposed) setHud((prev) => ({ ...prev, ...h })); },
        // the end screen: the result as the sink gets it (nothing is posted: no reward route for the BR yet)
        resultSink: async (r) => { if (!disposed) setResult((r as { detail?: BRResult }).detail ?? null); },
      }).then((s) => { if (disposed) s(); else stop = s; })
        .catch((e) => { if (!disposed) setErr(String(e?.message ?? e)); });
    }, 0);
    return () => { disposed = true; mountedRef.current = false; stop?.(); clearTimeout(startTimer); };
  }, []);

  const start = () => busRef.current?.emit({ t: 'button', btn: 'START', pressed: true });
  const playing = (phase === 'playing' || phase === 'countdown') && !result;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black font-mono text-xs text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none outline-none" />
      {playing && <Hud hud={hud} />}
      {(phase === 'ready' || phase === 'loading') && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/70 p-4">
          <p className="text-[10px] tracking-[0.3em] text-white/50">THE ADVENTURE · BATTLE ROYALE [PLACEHOLDER] · 12 FIGHTERS · NO GUNS</p>
          <Controls />
          <button type="button" disabled={phase !== 'ready'} onClick={(e) => { e.currentTarget.blur(); start(); }}
            className="rounded bg-[#00E5FF] px-6 py-2 font-bold text-black disabled:opacity-40" data-testid="br-start">
            {phase === 'ready' ? 'START' : 'LOADING…'}
          </button>
          {err && <p className="text-red-400">{err}</p>}
        </div>
      )}
      {phase === 'paused' && !result && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/70 p-4">
          <p className="text-[10px] tracking-[0.3em] text-white/50">PAUSED</p>
          <Controls />
          <button type="button" onClick={(e) => { e.currentTarget.blur(); start(); }} className="rounded bg-[#00E5FF] px-6 py-2 font-bold text-black">RESUME</button>
        </div>
      )}
      {result && <EndScreen r={result} />}
      {phase === 'error' && <p className="absolute left-3 top-3 z-20 text-red-400">{err}</p>}
      {touch && busRef.current && playing && (
        <>
          <TouchOverlay bus={busRef.current} modeId={MODE_KEY} visible />
          <AdventureRadial bus={busRef.current} />
        </>
      )}
    </div>
  );
}

/** The controls screen: the Adventure's button map (the BR plays on the Adventure's buttons) and the mapper's sheet. */
function Controls() {
  const rows = buttonMap('adventure');
  return (
    <div className="max-h-[70vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-white/10 bg-black/60 p-3" data-testid="br-controls">
      <p className="mb-2 text-[9px] font-black tracking-[0.3em] text-white/45">BUTTONS</p>
      <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        {rows.map((r) => (
          <p key={r.input + r.action} className="flex justify-between gap-2"><span className="text-white/50">{r.input}</span><span className="font-bold">{r.action}</span></p>
        ))}
      </div>
      <p className="mb-2 text-[9px] text-white/50">Loot is picked up by walking over it · stand at a chest to open it · the storm closes in five phases · D-PAD ▲ calls your partner</p>
      <table className="w-full text-left text-[10px]">
        <thead className="text-white/40"><tr><th className="pr-2">ACTION</th><th className="pr-2">PAD</th><th className="pr-2">KEYS</th><th>TOUCH</th></tr></thead>
        <tbody>
          {CONTROLS_SHEET.map((r) => (
            <tr key={r.action} className="border-t border-white/5"><td className="py-0.5 pr-2">{r.action}</td><td className="pr-2 text-white/70">{r.pad}</td><td className="pr-2 text-white/70">{r.keys}</td><td className="text-white/70">{r.touch}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const bar = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%`;

/** The HUD: who is left, the zone, your bars, the map. Minimal by rule. */
function Hud({ hud }: { hud: Record<string, HudValue> }) {
  const n = (k: string) => (typeof hud[k] === 'number' ? (hud[k] as number) : 0);
  const s = (k: string) => (typeof hud[k] === 'string' ? (hud[k] as string) : null);
  const stage = s('zoneStage');
  return (
    <>
      <div className="pointer-events-none absolute left-1/2 top-3 z-10 flex -translate-x-1/2 gap-3 rounded bg-black/45 px-3 py-1 text-[11px] font-bold" data-testid="br-hud-top">
        <span>{n('alive')} LEFT</span>
        <span className={hud.storm ? 'text-fuchsia-300' : 'text-white/80'}>
          {stage === 'closed' ? 'STORM CLOSED' : `${stage === 'shrink' ? 'CLOSING' : 'ZONE'} ${n('zone')}s`}
        </span>
        {n('kos') > 0 && <span className="text-amber-300">{n('kos')} KO</span>}
      </div>
      <div className="pointer-events-none absolute right-3 top-3 z-10 w-48 space-y-1" style={{ right: 'max(0.75rem, env(safe-area-inset-right))' }} data-testid="br-hud">
        <MiniMap hud={hud} />
        <Meter label="HP" fill={bar(n('hp'), n('hpMax'))} color={hud.downed ? '#f59e0b' : '#ef4444'} text={hud.downed ? `DOWN ${n('bleed')}s` : `${n('hp')}`} />
        <Meter label="EN" fill={bar(n('energy'), n('energyMax'))} color="#38bdf8" text={`${n('energy')}`} />
        <Meter label="FU" fill={bar(n('fusion'), 100)} color="#a78bfa" text={n('fused') > 0 ? `FUSED ${n('fused')}s` : `${n('fusion')}%`} />
        <p className="text-[10px] text-white/70">{`SLOT ${n('slot')}${s('spell') ? ` · ${s('spell')!.replace('[PLACEHOLDER] ', '')}` : ''} · PARTNER ${s('summon') ?? ''}`}</p>
      </div>
    </>
  );
}

/** The map indicator, in the HUD: the circle, the next circle, you (an arrow), north up. */
function MiniMap({ hud }: { hud: Record<string, HudValue> }) {
  const n = (k: string) => (typeof hud[k] === 'number' ? (hud[k] as number) : 0);
  const half = n('mapHalf') || 160;
  const S = 88;
  const sx = (x: number) => ((x + half) / (2 * half)) * S;
  const sz = (z: number) => S - ((z + half) / (2 * half)) * S;
  const k = S / (2 * half);
  const yaw = n('pyaw');
  return (
    <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} className="ml-auto block rounded bg-black/45" data-testid="br-map">
      <rect x={0.5} y={0.5} width={S - 1} height={S - 1} fill="none" stroke="rgba(255,255,255,0.2)" />
      <circle cx={sx(n('zx'))} cy={sz(n('zz'))} r={Math.max(0.5, n('zr') * k)} fill="rgba(124,58,237,0.12)" stroke="#a78bfa" strokeWidth={1} />
      {n('nr') > 0 && <circle cx={sx(n('nx'))} cy={sz(n('nz'))} r={n('nr') * k} fill="none" stroke="#f8fafc" strokeWidth={0.8} strokeDasharray="2 2" />}
      <g transform={`translate(${sx(n('px'))} ${sz(n('pz'))}) rotate(${(yaw * 180) / Math.PI})`}>
        <path d="M0 -4 L3 3 L0 1.5 L-3 3 Z" fill="#00E5FF" />
      </g>
    </svg>
  );
}

function Meter({ label, fill, color, text }: { label: string; fill: string; color: string; text: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-5 text-[9px] text-white/50">{label}</span>
      <div className="relative h-2.5 flex-1 overflow-hidden rounded bg-white/10">
        <div className="absolute inset-y-0 left-0" style={{ width: fill, background: color }} />
      </div>
      <span className="w-16 text-right text-[9px] text-white/70">{text}</span>
    </div>
  );
}

function EndScreen({ r }: { r: BRResult }) {
  const mins = Math.floor(r.survivedSec / 60), secs = String(r.survivedSec % 60).padStart(2, '0');
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/75 p-4 text-center" data-testid="br-end">
      <p className="text-[10px] tracking-[0.3em] text-white/50">{r.mode === 'duo' ? 'DUOS' : 'SOLOS'} · BATTLE ROYALE</p>
      <p className={`text-4xl font-black ${r.won ? 'text-[#00E5FF]' : 'text-white'}`}>{r.won ? 'LAST ONE STANDING' : `#${r.place} OF ${r.teams}`}</p>
      <div className="flex gap-6 text-sm">
        <span><b>{r.kos}</b> KO</span><span><b>{r.damage}</b> DAMAGE</span><span><b>{mins}:{secs}</b> SURVIVED</span>
      </div>
      <p className="text-[10px] text-white/45">Offline match · nothing found in a match carries out of it · no rewards yet</p>
      <button type="button" onClick={() => { try { window.location.reload(); } catch { /* fine */ } }} className="rounded bg-[#00E5FF] px-6 py-2 font-bold text-black">PLAY AGAIN</button>
    </div>
  );
}
