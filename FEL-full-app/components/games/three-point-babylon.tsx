'use client';

// FEL Babylon Three-Point Shootout host — also the Controller Link reference
// implementation.
//
// The Controller Link wiring here is deliberately three lines: mount HostLobby,
// point its onInput at toInputBus(bus), done. Every phone input lands on the
// same InputBus the keyboard and touch overlay already feed, so ThreePointMode
// never learns that a phone exists. That is the property that makes the next
// mode cheap.

import { readCourtLocation } from '@/lib/babylon/nexus/courtLocations';
import { freshOrder, syncLobby, slotDrives, recordTurn, turnBanner, MAX_SHOOTERS, type ShootoutOrder } from '@/lib/controller-link/shootoutTurns';
import type { LobbyPeer } from '@/lib/controller-link/types';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { rackPips, SHOT_TARGET, PERFECT_BAND, GOOD_BAND } from '@/lib/babylon/core/shootoutHud';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { PadChips } from '@/lib/babylon/ui/PadChips';
import { HostLobby } from '@/components/controller-link/host-lobby';
import { controllerConfigFor } from '@/lib/controller-link/schemas/registry';
import { toInputBus } from '@/lib/controller-link/modeBridge';
import { hnum } from './hud-format';
import { MicCaption, MicToggle } from './mic-caption';   // THE MIC (2026-09-24)

// Which harness currently owns a given canvas. React mounts effects twice in
// dev: effect A starts an async runMode(), its cleanup fires before A has even
// finished loading, then effect B starts on the SAME canvas. When A's promise
// finally resolves it tears itself down — and engine.dispose() releases the
// WebGL context of the shared canvas, killing B's render loop. The symptom is
// brutal to read: the HUD keeps streaming from B's React state while update()
// is never called again and the canvas stays black.
//
// The token lets a late teardown notice it has been superseded and leave the
// canvas alone. Leaking one dev-only engine is vastly better than a dead frame.
const canvasOwner = new WeakMap<HTMLCanvasElement, object>();


type Hud = Record<string, HudValue>;

export default function ThreePointBabylon({ onEnd }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const endedRef = useRef(false);
  const [phase, setPhase] = useState<ModePhase>('loading');
  // the running order lives in a ref AND state: the input callback reads it every frame (ref) while the
  // banner renders from it (state)
  const orderRef = useRef<ShootoutOrder>(freshOrder());
  const [order, setOrder] = useState<ShootoutOrder>(orderRef.current);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hud, setHud] = useState<Hud>({});
  // THE MIC's caption lives apart from the hud: the mode pushes its WHOLE hud every frame and this host replaces it (setHud(h)),
  // while the mic sends only { mic, micWho } — merged into the hud, a caption would blank the scoreboard for a frame and the
  // next frame's hud would wipe the caption
  const [micLine, setMicLine] = useState<{ text: HudValue; who: HudValue }>({ text: '', who: '' });
  const [busReady, setBusReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bus = new InputBus();
    busRef.current = bus;
    setBusReady(true);
    let stop: (() => void) | null = null;
    let disposed = false;

    const resultSink = async (r: SessionResult) => {
      if (endedRef.current) return;
      // A SHOOTOUT IS TURN-BASED. With phones in the room the run that just ended was one player's turn:
      // bank it, pass the ball, and only end the session once the last shooter has been.
      const score = Number(r.stats?.points ?? r.score ?? 0);
      if (orderRef.current.shooters.length > 1) {
        const next = recordTurn(orderRef.current, score);
        orderRef.current = next;
        setOrder(next);
        if (!next.done) return;      // the next phone is up; the host remounts for their turn
      }
      endedRef.current = true;
      onEnd({
        score: Number(r.stats?.points ?? r.score ?? 0),
        stats: r.stats, outcome: r.outcome,   // pass 5 phase 3: the proof line reads these
        opponentScore: 0,
        won: r.outcome === 'win',
        duration: r.durationSec,
        headline: r.outcome === 'win' ? 'RANGE UNLOCKED' : 'SHOOTOUT COMPLETE',
      } satisfies GameResult);
    };

    // DEFER THE BOOT BY A TICK (suite pass, 2026-09-16 — the dunk component's guard, ported). StrictMode runs
    // effect -> cleanup -> effect, and `stop` is only assigned once the async load resolves, so the phantom mount's
    // cleanup could cancel nothing: TWO shootouts loaded on the same canvas at once — two venue kits, two heroes, ten
    // sideline bodies — and on the dev server the device reset ("WebGL context lost … Graphics were reset"), the
    // canvas black until the harness reloaded it. A zero-delay timer lets the phantom mount be cancelled before it
    // builds anything.
    const startTimer = setTimeout(() => {
    if (disposed) return;
    runMode(MODES.threepoint, {
      canvas,
      location: readCourtLocation(),   // court location pick (docs/SPEC-COURT-LOCATIONS.md)
      input: bus,
      onPhase: (p, detail) => {
        if (disposed) return;
        setPhase(p);
        setCountdown(typeof detail === 'number' ? detail : null);
        if (p === 'error') setLoadError(typeof detail === 'string' ? detail : 'load failed');
      },
      onHud: (h) => {
        if (disposed) return;
        if (!('mic' in h) && !('micWho' in h)) { setHud(h); return; }
        const { mic, micWho, ...rest } = h;
        setMicLine((m) => ({ text: 'mic' in h ? mic : m.text, who: 'micWho' in h ? micWho : m.who }));
        if (Object.keys(rest).length) setHud(rest);
      },
      resultSink,
    }).then((s) => { if (disposed) s(); else stop = s; })
      .catch((e) => { if (!disposed) setLoadError(String(e?.message ?? e)); });
    }, 0);

    return () => { disposed = true; clearTimeout(startTimer); stop?.(); };
  }, []);   // mount once — see onEndRef above

  const emit = useCallback((i: Parameters<InputBus['emit']>[0]) => {
    busRef.current?.emit(i);
  }, []);

  const tapStart = useCallback(() => {
    emit({ t: 'button', btn: 'START', pressed: true });
  }, [emit]);

  // FOUR PHONES, ONE BALL (Phase C). A phone's input is fed to the same bus as every other input source —
  // but a shootout has ONE shooter, so without a turn order four phones would be four people fighting over
  // one pair of hands. slotDrives() answers the single question this callback needs; with no phones
  // connected it is always true, so keyboard and local-pad play are never gated by a lobby nobody is using.
  // ONE adapter per bus (CONTROLLER-UNIVERSAL-MULTI): toInputBus holds the held-charge ramp between events, and a
  // fresh adapter per event could never stop the ramp its own 'charge:down' started.
  const linkSink = useRef<{ bus: InputBus; sink: ReturnType<typeof toInputBus> } | null>(null);
  const onControllerInput = useCallback((ev: Parameters<ReturnType<typeof toInputBus>>[0], slot: number) => {
    if (!slotDrives(orderRef.current, slot)) return;
    const bus = busRef.current;
    if (!bus) return;
    if (linkSink.current?.bus !== bus) linkSink.current = { bus, sink: toInputBus(bus) };
    linkSink.current.sink(ev);
  }, []);
  // a controller paired to a phone arrives canonical (the binary relay) — same turn gate, straight onto the bus
  const onPhonePad = useCallback((e: Parameters<InputBus['emit']>[0], slot: number) => {
    if (slotDrives(orderRef.current, slot)) busRef.current?.emit(e);
  }, []);

  const onPeers = useCallback((peers: LobbyPeer[]) => {
    const next = syncLobby(orderRef.current, peers.map((p) => ({ slot: p.slot, name: p.name, connected: p.connected })));
    orderRef.current = next;
    setOrder(next);
  }, []);

  const controllerConfig = useMemo(() => controllerConfigFor('threepoint'), []);
  const turnLine = turnBanner(order);
  void MAX_SHOOTERS;

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      <BootSplash
        modeId="threepoint"
        title="DOWNTOWN"
        phase={phase}
        detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
        onStart={tapStart}
        onRetry={tapStart}
      />
      {/* Whose turn it is, on the TV, whenever more than one phone is in the room. */}
      {turnLine && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-lg bg-black/70 px-4 py-1.5">
          <span className="fel-heading text-sm font-bold tracking-[0.2em] text-[#00E5FF]">{turnLine}</span>
        </div>
      )}

      {phase === 'paused' && (
        <button onClick={tapStart} className="absolute inset-0 flex items-center justify-center bg-black/60">
          <span className="fel-heading text-3xl font-bold text-white">PAUSED — TAP TO RESUME</span>
        </button>
      )}

      {/* Lobby is expanded until the whistle, then collapses to a status badge
          so it never sits on top of live play. */}
      {controllerConfig && busReady && (
        <HostLobby
          config={controllerConfig}
          onInput={onControllerInput}
          onPeers={onPeers}
          onPadInput={onPhonePad}
          collapsed={phase === 'playing'}
          bus={busRef.current}
        />
      )}
      {busReady && busRef.current && <PadChips bus={busRef.current} className="left-4 top-4" />}

      {/* A+ mission #4 — Wii Sports Resort readability on top of the 2K contest: the score and the clock at couch size,
          the rack as pips (money ball gold, the loaded ball pulsing), points left, the heat, and a wide release meter
          under the shooter drawn from the SAME bands the mode grades with. */}
      {phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex flex-col items-center gap-1.5 font-mono text-white">
          <div className="flex items-end gap-5">
            <div className="fel-panel px-5 py-1.5 text-5xl font-black leading-none text-[#ffd75e]">{hnum(hud.score)}</div>
            <div className={`fel-panel px-4 py-2 text-3xl font-bold leading-none ${Number(hud.clock) <= 10 ? 'text-[#ff2d78]' : 'text-white'}`}>{hnum(hud.clock)}s</div>
          </div>
          <div className="flex items-center gap-2 text-[11px] tracking-widest">
            <span className="fel-panel px-2 py-0.5 text-white/70">{String(hud.round ?? 'QUALIFYING')}</span>
            {hud.money ? <span className="fel-panel px-2 py-0.5 font-bold text-[#ffd75e]">MONEY BALL · 2 PTS</span> : null}
            {hud.heat === 'fire' ? <span className="fel-panel px-2 py-0.5 font-bold text-[#ff6a00]">ON FIRE ×{hnum(hud.streak)}</span>
              : Number(hud.streak) >= 2 ? <span className="fel-panel px-2 py-0.5 text-[#ffb347]">streak ×{hnum(hud.streak)}</span> : null}
            {typeof hud.left === 'number' && <span className="fel-panel px-2 py-0.5 text-white/60">{hud.left} LEFT</span>}
          </div>
          {typeof hud.rackIdx === 'number' && typeof hud.ballIdx === 'number' && (
            <div className="flex items-center gap-3">
              {rackPips(hud.rackIdx, hud.ballIdx).map((row, r) => (
                <div key={r} className="flex items-center gap-1 rounded bg-black/45 px-1.5 py-1">
                  {row.map((p, b) => (
                    <span
                      key={b}
                      className={`inline-block rounded-full ${p.money ? 'h-3 w-3' : 'h-2.5 w-2.5'} ${p.state === 'next' ? 'animate-pulse ring-2 ring-white' : ''}`}
                      style={{ background: p.state === 'taken' ? 'rgba(255,255,255,0.18)' : p.money ? '#ffd75e' : '#e8742c', opacity: p.state === 'ahead' ? 0.85 : 1 }}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
          <div className="hidden">RACK {String(hud.rack ?? '—')} · BALL {String(hud.ball ?? '—')}</div>
          {/* The contest layer publishes round/money/need/board — all four
              used to be computed every frame and rendered NOWHERE (the classic
              "HUD state is not a bezel" trap; only the dev route's JSON dump
              ever showed them). This is the contest the player is in. */}
          {typeof hud.need === 'number' && (
            <div className="fel-panel px-3 py-1 text-sm font-bold text-[#ff2d78]">NEED {hnum(hud.need)} TO WIN</div>
          )}
        </div>
      )}

      {/* the release meter + the call — bottom centre, under the shooter, couch-size */}
      {phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex flex-col items-center gap-2 font-mono">
          {typeof hud.banner === 'string' && hud.banner && (
            <div className={`fel-heading fel-panel px-5 py-1.5 text-3xl font-black ${hud.banner.startsWith('MISS') ? 'text-white/70' : 'text-[#00E5FF]'}`}>{hud.banner}</div>
          )}
          {typeof hud.meter === 'number' && <ReleaseBar t={hud.meter} />}
        </div>
      )}

      {/* THE MIC: the MC's words just above the call and the meter (the scoreboard owns the top, the board the right) */}
      {phase === 'playing' && <MicCaption text={micLine.text} who={micLine.who} className="bottom-[12rem]" />}
      {/* The switch never takes focus from a click: Space is the keyboard's SHOOT and fires on keyup, and a focused button
          answers that same keyup with a click — every shot after one click on MC would flip the announcer on and off */}
      {phase === 'playing' && (
        <div className="contents" onMouseDown={(e) => e.preventDefault()}>
          <MicToggle className="left-4 top-[24%]" />
        </div>
      )}

      {phase === 'playing' && Array.isArray(hud.board) && (
        <div className="pointer-events-none absolute right-4 top-4 z-20 rounded-lg border border-white/15 bg-black/60 px-3 py-2 font-mono text-xs text-white backdrop-blur-sm">
          {(hud.board as { name: string; score: number | string; line: string }[]).map((r) => (
            <div key={r.name} className={`flex items-baseline gap-3 py-0.5 ${r.name === 'YOU' ? 'text-[#ffd75e]' : ''}`}>
              <span className="w-16 truncate">{r.name}</span>
              <span className="w-8 text-right text-base font-bold">{r.score}</span>
              <span className={`text-[10px] tracking-wider ${
                r.line === 'CHAMPION' ? 'text-[#ffd75e]' : r.line === 'ADVANCES' ? 'text-[#22d3ee]' : 'text-white/40'
              }`}>{r.line}</span>
            </div>
          ))}
        </div>
      )}

      {(phase === 'playing' || phase === 'countdown') && busRef.current && (
        <TouchOverlay bus={busRef.current} modeId="threepoint" visible />
      )}
    </div>
  );
}

/** The timing bar the whole mode hangs on — the GOOD and PERFECT bands drawn from the mode's own constants. */
function ReleaseBar({ t }: { t: number }) {
  const good = { left: `${(SHOT_TARGET - GOOD_BAND) * 100}%`, width: `${GOOD_BAND * 200}%` };
  const perfect = { left: `${(SHOT_TARGET - PERFECT_BAND) * 100}%`, width: `${PERFECT_BAND * 200}%` };
  return (
    <div className="relative h-5 w-[min(520px,70vw)] overflow-hidden rounded-md border border-white/20 bg-black/55">
      <div className="absolute inset-y-0 bg-[#22d3ee]/35" style={good} />
      <div className="absolute inset-y-0 bg-[#ffd75e]/80" style={perfect} />
      <div className="absolute inset-y-0 w-[4px] -translate-x-1/2 bg-white shadow-[0_0_8px_#fff]" style={{ left: `${t * 100}%` }} />
    </div>
  );
}
