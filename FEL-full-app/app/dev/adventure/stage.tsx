'use client';

// /dev/adventure — the Adventure's test yard on the real ModeHarness (ADVENTURE PLAN A4). Mounts MODES.adventure the way
// /dev/mode/[key] mounts any registered mode (one harness per canvas, deferred past StrictMode's phantom mount), and
// draws only what the owner allows during play: the HUD. Before START and on a pause it shows the controls screen —
// the same button map every mode's start screen reads (lib/creator/cardSlot buttonMap) plus the keyboard and touch
// columns of the Adventure's mapper (adventure/host/inputMap CONTROLS_SHEET). On a touch screen the app's touch rig
// (TouchOverlay: stick, d-pad, JUMP / DASH / LIGHT / HEAVY) and the Adventure's radial (lock, cast, fuse·ride, slow,
// guard, partner) appear while playing.

import { useEffect, useRef, useState } from 'react';
import { runMode, InputBus, type ModePhase, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { buttonMap } from '@/lib/creator/cardSlot';
import { CONTROLS_SHEET } from '@/lib/babylon/adventure/host/inputMap';
import { AdventureRadial } from './radial';

const MODE_KEY = 'adventure';

export function AdventureStage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const mountedRef = useRef(false);
  const [phase, setPhase] = useState<ModePhase>('loading');
  const [hud, setHud] = useState<Record<string, HudValue>>({});
  const [err, setErr] = useState<string | null>(null);
  const [touch, setTouch] = useState(false);

  useEffect(() => {
    try { setTouch(window.matchMedia('(pointer: coarse)').matches); } catch { setTouch(false); }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const def = MODES[MODE_KEY];
    if (!canvas || mountedRef.current) return;
    mountedRef.current = true;
    if (!def) { setErr('the adventure mode is not registered'); return; }
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
        resultSink: async (r) => console.info('[dev adventure] result', r),
      }).then((s) => { if (disposed) s(); else stop = s; })
        .catch((e) => { if (!disposed) setErr(String(e?.message ?? e)); });
    }, 0);
    return () => { disposed = true; mountedRef.current = false; stop?.(); clearTimeout(startTimer); };
  }, []);

  const start = () => busRef.current?.emit({ t: 'button', btn: 'START', pressed: true });
  const playing = phase === 'playing' || phase === 'countdown';

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black font-mono text-xs text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none outline-none" />
      {playing && <Hud hud={hud} />}
      {(phase === 'ready' || phase === 'loading') && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/70 p-4">
          <p className="text-[10px] tracking-[0.3em] text-white/50">DEV · THE ADVENTURE · TEST YARD [PLACEHOLDER]</p>
          <Controls />
          <button type="button" disabled={phase !== 'ready'} onClick={(e) => { e.currentTarget.blur(); start(); }}
            className="rounded bg-[#00E5FF] px-6 py-2 font-bold text-black disabled:opacity-40">
            {phase === 'ready' ? 'START' : 'LOADING…'}
          </button>
          {err && <p className="text-red-400">{err}</p>}
        </div>
      )}
      {phase === 'paused' && (
        // a dev runner prints its phase (the game hosts' pause is BootSplash's PausedLayer: one layer, one headline)
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/70 p-4">
          <p className="text-[10px] tracking-[0.3em] text-white/50">DEV · PAUSED</p>
          <Controls />
          <button type="button" onClick={(e) => { e.currentTarget.blur(); start(); }} className="rounded bg-[#00E5FF] px-6 py-2 font-bold text-black">RESUME</button>
        </div>
      )}
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

/** The controls screen: the start screen's button map for this mode, then the keyboard and touch columns. */
function Controls() {
  const rows = buttonMap(MODE_KEY);
  return (
    <div className="max-h-[70vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-white/10 bg-black/60 p-3" data-testid="adventure-controls">
      <p className="mb-2 text-[9px] font-black tracking-[0.3em] text-white/45">BUTTONS</p>
      <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        {rows.map((r) => (
          <p key={r.input + r.action} className="flex justify-between gap-2"><span className="text-white/50">{r.input}</span><span className="font-bold">{r.action}</span></p>
        ))}
      </div>
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

/** The HUD: HP, energy, the special and the fusion meters, the lock, the spell slot, the partner's command. */
function Hud({ hud }: { hud: Record<string, HudValue> }) {
  const n = (k: string) => (typeof hud[k] === 'number' ? (hud[k] as number) : 0);
  const s = (k: string) => (typeof hud[k] === 'string' ? (hud[k] as string) : null);
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-10 w-56 space-y-1" style={{ right: 'max(0.75rem, env(safe-area-inset-right))' }} data-testid="adventure-hud">
      <Meter label="HP" fill={bar(n('hp'), n('hpMax'))} color="#ef4444" text={`${n('hp')}/${n('hpMax')}`} />
      <Meter label="EN" fill={bar(n('energy'), n('energyMax'))} color="#38bdf8" text={`${n('energy')}`} />
      <Meter label="SP" fill={bar(n('special'), 100)} color="#facc15" text={`${n('special')}%`} />
      <Meter label="FU" fill={bar(n('fusion'), 100)} color="#a78bfa" text={n('fused') > 0 ? `FUSED ${n('fused')}s · T${n('tier')}` : `${n('fusion')}% · T${n('tier')}`} />
      <p className="text-[10px] text-white/70">{`SLOT ${n('slot')}${s('spell') ? ` · ${s('spell')}` : ''}${s('partner') ? ` · PARTNER ${s('partner')!.toUpperCase()}` : ''}`}</p>
      {s('lock') && <p className="text-[10px] font-bold text-[#e6fbff]">◎ {s('lock')}</p>}
    </div>
  );
}

function Meter({ label, fill, color, text }: { label: string; fill: string; color: string; text: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-5 text-[9px] text-white/50">{label}</span>
      <div className="relative h-2.5 flex-1 overflow-hidden rounded bg-white/10">
        <div className="absolute inset-y-0 left-0" style={{ width: fill, background: color }} />
      </div>
      <span className="w-20 text-right text-[9px] text-white/70">{text}</span>
    </div>
  );
}
