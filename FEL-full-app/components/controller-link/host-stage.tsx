'use client';
// HOST STAGE — the TV half of the role split (mission Phase B + C).
//
// One build, two roles. This is HOST: it renders the game, shows the join code, and holds the screen awake.
// It never captures a controller for itself — the pads do that — which is the whole point of the split: the
// TV browser in a Tizen set has no gamepad API worth relying on, and the phone in your hand does.
//
// Phase C's three presence calls live here because they all need the same thing: a user gesture. So the page
// opens on a single START button, and that press is what buys fullscreen, the wake lock and the orientation
// lock in one go. A host that tried to grab them on mount would be refused by every browser and would look
// broken while being entirely correct.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HostLobby } from '@/components/controller-link/host-lobby';
import { controllerConfigFor, MODE_CONTROLLERS } from '@/lib/controller-link/schemas/registry';
import { HostPresence, presenceSummary, type PresenceReport } from '@/lib/controller-link/presence';
import { toInputBus } from '@/lib/controller-link/modeBridge';
import { runMode, InputBus, type FelInput, type HudValue, type ModePhase, type SessionResult } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { BootSplash } from '@/components/games/boot-splash';
import { PadChips } from '@/lib/babylon/ui/PadChips';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import type { ControlEvent, LobbyPeer, ModeControllerConfig } from '@/lib/controller-link/types';
import type { PadInfo } from '@/lib/babylon/core/InputBus';
import { COUCH_ROOM_PHONES, COUCH_SEATS, CouchSession, enterCouch, openSeatHint, type SeatTable } from '@/lib/party/seats';

/**
 * QA P1-26 (2026-09-27): /host only ever offered Downtown — the page defaults ?mode= to threepoint and the stage had no
 * picker, so a TV could not choose another game without typing a URL with a remote. The start panel lists every mode the
 * controller link has a layout for (the registry), minus The Flip, whose big screen is the Academy's own room.
 */
export function hostModes(): { modeId: string; title: string }[] {
  // merge with lane/finish-release (2026-10-08): the stage now runs the mode itself (MODES), so a layout with no playable
  // TV mode would only lead to "No playable TV mode" — the chooser lists the modes that have both
  return Object.values(MODE_CONTROLLERS)
    .filter((c) => c.modeId !== 'music_flip' && !!MODES[c.modeId])
    .map((c) => ({ modeId: c.modeId, title: c.title }));
}

/**
 * COUCH (FN-0, 2026-10-19): the controller layout a couch room sends its phones. The room lets one phone past the four
 * seats connect (it waits, lib/party/seats.ts), and `couch` tells the phone's page to keep party chat and voice off.
 */
export function couchControllerConfig(config: ModeControllerConfig): ModeControllerConfig {
  return { ...config, maxPlayers: COUCH_ROOM_PHONES, couch: true };
}

export interface HostStageProps {
  modeId: string;
  /** COUCH (FN-0): the host-seat room — the signed-in host plus up to three seats by pad or phone code. No camera, no
   *  body, no party chat or voice, nothing saved per seat. The mode is the /play page's own, so there is no chooser. */
  couch?: boolean;
  /** COUCH: where "Back to solo" goes (the mode's own /play page). */
  exitHref?: string;
}

export function HostStage({ modeId: initialModeId, couch = false, exitHref }: HostStageProps) {
  const [modeId, setModeId] = useState(initialModeId);
  const config = useMemo(() => {
    const c = controllerConfigFor(modeId);
    return c && couch ? couchControllerConfig(c) : c;
  }, [modeId, couch]);
  const def = useMemo(() => MODES[modeId] ?? null, [modeId]);
  const choose = useCallback((id: string) => {
    setModeId(id);
    // ?mode= still names it, so a reload (or a bookmark on the TV) opens the same game
    try { const u = new URL(window.location.href); u.searchParams.set('mode', id); window.history.replaceState(null, '', u.toString()); } catch { /* no window: a test */ }
  }, []);
  const modes = useMemo(() => hostModes(), []);
  const chooser = (
    <div data-host-modes style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', margin: '0 0 18px' }}>
      {modes.map((m) => (
        <button key={m.modeId} type="button" data-mode={m.modeId} aria-pressed={m.modeId === modeId} onClick={() => choose(m.modeId)}
          style={{ padding: '8px 12px', borderRadius: 10, border: `1px solid ${m.modeId === modeId ? '#00E5FF' : '#26304a'}`, background: m.modeId === modeId ? '#00E5FF22' : 'transparent', color: m.modeId === modeId ? '#00E5FF' : '#cfd6e4', cursor: 'pointer', font: '600 13px system-ui' }}>
          {m.title}
        </button>
      ))}
    </div>
  );
  const [started, setStarted] = useState(false);
  const [phase, setPhase] = useState<ModePhase>('loading');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hud, setHud] = useState<Record<string, HudValue>>({});
  const [result, setResult] = useState<SessionResult | null>(null);
  const [presence, setPresence] = useState<PresenceReport | null>(null);
  const [bus, setBus] = useState<InputBus | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const linkSink = useRef<{ bus: InputBus; sink: ReturnType<typeof toInputBus> } | null>(null);
  const presenceRef = useRef(new HostPresence());
  const stageRef = useRef<HTMLDivElement | null>(null);

  // ── COUCH (FN-0): the seats, in this component's memory only ──
  const couchRef = useRef<CouchSession>(new CouchSession());
  const [pads, setPads] = useState<PadInfo[]>([]);
  const [phones, setPhones] = useState<LobbyPeer[]>([]);
  const seatIn = useRef({ pads, phones }); seatIn.current = { pads, phones };
  const seatNow = useCallback(() => couchRef.current.seat(
    seatIn.current.pads.map((p) => ({ slot: p.slot, name: p.name })),
    seatIn.current.phones.map((p) => ({ peerId: p.peerId, name: p.name, slot: p.slot, ready: p.ready, connected: p.connected })),
  ), []);
  const table = useMemo<SeatTable>(() => seatNow(), [pads, phones, seatNow]);
  // a couch has no party chat or voice on this screen (the dock reads it); the seats are forgotten when the room closes
  // (and re-seated if the same stage opens again — StrictMode's second effect run)
  useEffect(() => {
    if (!couch) return undefined;
    const leave = enterCouch();
    const seats = couchRef.current;
    seatNow();
    return () => { leave(); seats.end(); };
  }, [couch, seatNow]);
  useEffect(() => (couch && bus ? bus.onPads(setPads) : undefined), [couch, bus]);
  /** One adapter per phone (a held charge's ramp and the d-pad's held directions live in it), each feeding its own seat. */
  const couchSinks = useRef(new Map<string, { bus: InputBus; sink: ReturnType<typeof toInputBus> }>());

  useEffect(() => {
    if (!started || !def) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const input = new InputBus();
    busRef.current = input;
    setBus(input);
    setPhase('loading');
    setCountdown(null);
    setLoadError(null);
    setHud({});
    setResult(null);

    let disposed = false;
    let stop: (() => void) | null = null;
    const startTimer = setTimeout(() => {
      if (disposed) return;
      runMode(def, {
        canvas,
        input,
        couch,
        seatCount: () => couchRef.current.seatCount(),
        onPhase: (p, detail) => {
          if (disposed) return;
          setPhase(p);
          setCountdown(typeof detail === 'number' ? detail : null);
          if (p === 'error') setLoadError(typeof detail === 'string' ? detail : 'Failed to load the arena.');
        },
        onHud: (next) => {
          if (!disposed) setHud((prev) => ({ ...prev, ...next }));
        },
        resultSink: async (next) => {
          if (!disposed) setResult(next);
        },
        cardSink: async (next) => {
          if (!disposed) setResult(next);
        },
      }).then((dispose) => {
        if (disposed) dispose();
        else stop = dispose;
      }).catch((e) => {
        if (!disposed) {
          setPhase('error');
          setLoadError(String((e as Error)?.message ?? e));
        }
      });
    }, 0);

    return () => {
      disposed = true;
      clearTimeout(startTimer);
      stop?.();
      if (busRef.current === input) {
        busRef.current = null;
        linkSink.current = null;
      }
      setBus((current) => (current === input ? null : current));
    };
  }, [started, def, couch]);

  // release the wake lock and leave fullscreen when the stage goes away
  useEffect(() => () => { void presenceRef.current.exit(); }, []);

  const start = useCallback(() => {
    // THE SESSION STARTS FIRST. Presence is best-effort and must never gate the game: `requestFullscreen()`
    // can stay PENDING FOREVER rather than rejecting (measured in headless Chromium, where a host that
    // awaited it never opened a room at all), and a TV browser may have none of these APIs. So the room
    // opens immediately and the screen niceties are acquired alongside it.
    //
    // Still inside the click handler, because all three APIs need the gesture — starting them here rather
    // than awaiting them loses nothing: the gesture is what they check, not the await.
    setStarted(true);
    void presenceRef.current.enter(stageRef.current).then(setPresence).catch(() => {});
  }, []);

  const tapStart = useCallback(() => {
    busRef.current?.emit({ t: 'button', btn: 'START', pressed: true });
  }, []);

  /** COUCH: a phone's press goes to the seat it holds (CouchSession.route); a waiting phone reaches nobody. */
  const toSeat = useCallback((peerId: string, e: FelInput) => {
    const input = busRef.current;
    if (input) couchRef.current.route(peerId, e, input);
  }, []);

  const onControllerInput = useCallback((ev: ControlEvent, _slot?: number, peerId?: string) => {
    const input = busRef.current;
    if (!input) return;
    if (couch) {
      if (!peerId) return;
      let s = couchSinks.current.get(peerId);
      if (s?.bus !== input) {
        const shim = { emit: (e: FelInput) => toSeat(peerId, e) } as unknown as InputBus;
        s = { bus: input, sink: toInputBus(shim) };
        couchSinks.current.set(peerId, s);
      }
      s.sink(ev);
      return;
    }
    if (linkSink.current?.bus !== input) linkSink.current = { bus: input, sink: toInputBus(input) };
    linkSink.current.sink(ev);
  }, [couch, toSeat]);

  const onPhonePad = useCallback((e: FelInput, slot: number, peerId?: string) => {
    const input = busRef.current;
    if (!input) return;
    if (couch) { if (peerId) toSeat(peerId, e); return; }
    if (config && config.maxPlayers > 1) input.emitSlot(slot, e);
    else input.emit(e);
  }, [config, couch, toSeat]);

  const panel: React.CSSProperties = {
    background: 'rgba(8,10,16,0.82)', border: '1px solid #26304a', borderRadius: 14, padding: '18px 20px',
  };

  if (!config) {
    return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#05070c', color: '#cfd6e4' }}>
      <div style={{ textAlign: 'center', maxWidth: 640 }}>
        <p style={{ font: '400 15px system-ui' }}>No controller layout for “{modeId}”. Pick a game:</p>
        {chooser}
      </div>
    </main>;
  }

  if (!def) {
    return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#05070c', color: '#cfd6e4' }}>
      <div style={{ textAlign: 'center', maxWidth: 640 }}>
        <p style={{ font: '400 15px system-ui' }}>No playable TV mode for “{modeId}”. Pick a game:</p>
        {chooser}
      </div>
    </main>;
  }

  const showTouchOverlay = started && bus && (phase === 'playing' || phase === 'countdown');

  return (
    <main ref={stageRef} style={{ minHeight: '100vh', background: '#05070c', color: '#eef2f8', display: 'grid', placeItems: 'center', padding: started ? 0 : 24 }}>
      {!started ? (
        <div style={{ ...panel, textAlign: 'center', maxWidth: 520 }}>
          <h1 style={{ margin: '0 0 6px', font: '700 26px system-ui', letterSpacing: 1 }}>{config.title.toUpperCase()}</h1>
          {couch ? (
            <p data-testid="couch-intro" style={{ margin: '0 0 18px', color: '#8A94A6', font: '400 14px/1.5 system-ui' }}>
              Couch play: you are P1, and up to three more sit down beside you — press a button on a controller, or join
              with the code on a phone. Nobody needs an account, and nothing about a seat is saved.
            </p>
          ) : (
            <p style={{ margin: '0 0 18px', color: '#8A94A6', font: '400 14px/1.5 system-ui' }}>
              This screen shows the game. Everyone plays on their phone — up to {config.maxPlayers}.
            </p>
          )}
          {couch ? null : chooser}
          <button
            onClick={start}
            style={{ padding: '14px 28px', borderRadius: 12, border: 'none', background: '#00E5FF', color: '#04202a', cursor: 'pointer', font: '700 16px system-ui', letterSpacing: 1 }}
          >START THE SCREEN</button>
          <p style={{ margin: '14px 0 0', color: '#6b7280', font: '400 12px/1.5 system-ui' }}>
            Goes fullscreen and keeps the screen awake.
          </p>
          {couch && exitHref ? (
            <p style={{ margin: '10px 0 0' }}>
              <a href={exitHref} style={{ color: '#8A94A6', font: '600 13px system-ui' }}>Back to solo</a>
            </p>
          ) : null}
        </div>
      ) : (
        <div className="relative h-screen w-screen overflow-hidden bg-black">
          <canvas ref={canvasRef} data-testid="host-stage-canvas" className="absolute inset-0 h-full w-full touch-none" />

          {couch ? (
            <CouchSplash title={config.title.toUpperCase()} phase={phase} error={loadError} onStart={tapStart} />
          ) : (
            <BootSplash
              modeId={def.modeId}
              title={config.title.toUpperCase()}
              phase={phase}
              detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
              onStart={tapStart}
              onRetry={tapStart}
            />
          )}
          {couch ? <CouchSeats table={table} hasPads={pads.length > 0} /> : null}

          <HostLobby
            config={config}
            onInput={onControllerInput}
            onPadInput={onPhonePad}
            onPeers={couch ? setPhones : undefined}
            collapsed={phase === 'playing'}
            lazy={false}
            anchor="right-4 top-4"
            bus={bus}
          />
          {bus && <PadChips bus={bus} className="left-4 top-4" />}
          {showTouchOverlay && <TouchOverlay bus={bus} modeId={modeId} visible />}

          <div data-testid="host-stage-status" className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex flex-col items-center gap-2 px-4 font-mono text-xs text-white/60">
            {typeof hud.banner === 'string' && hud.banner ? (
              <span className="rounded-lg border border-[#00E5FF]/25 bg-black/65 px-4 py-1 text-base font-bold tracking-[0.12em] text-[#00E5FF]">{hud.banner}</span>
            ) : null}
            {result ? (
              <span className="rounded bg-black/65 px-3 py-1 text-[#ffd75e]">
                COMPLETE · {result.outcome.toUpperCase()} · SCORE {Math.round(result.score)}
              </span>
            ) : null}
            <span>
              {presence ? presenceSummary(presence) : ''}
              {presence?.notes.length ? ` · ${presence.notes.join(' ')}` : ''}
            </span>
          </div>
        </div>
      )}
    </main>
  );
}

/**
 * COUCH (FN-0): the couch room's start card. BootSplash is the solo card and carries body play (the camera choice, the
 * self-view), the character switcher and the party invite; a couch offers none of them, so its card is only the game's
 * name, the load, START and a retry.
 */
export function CouchSplash({ title, phase, error, onStart }: { title: string; phase: ModePhase; error: string | null; onStart: () => void }) {
  if (phase !== 'loading' && phase !== 'ready' && phase !== 'error') return null;
  return (
    <div data-testid="couch-splash" className="absolute inset-0 z-20 grid place-items-center bg-black/70">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-2xl font-black tracking-widest text-white">{title}</h1>
        {phase === 'loading' ? <p className="font-mono text-xs tracking-widest text-white/60">LOADING…</p> : null}
        {phase === 'ready' ? (
          <button type="button" onClick={(e) => { e.currentTarget.blur(); onStart(); }}
            className="rounded-2xl bg-[#00E5FF] px-10 py-4 text-lg font-black text-black">TAP TO START</button>
        ) : null}
        {phase === 'error' ? (
          <>
            <p className="max-w-sm text-sm text-rose-300">{error ?? 'The game did not load.'}</p>
            <button type="button" onClick={onStart} className="rounded-xl border border-white/30 px-6 py-2 text-sm font-bold text-white">TRY AGAIN</button>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** COUCH (FN-0): the four seats and anyone waiting, small, in the stage's bottom-left corner. */
export function CouchSeats({ table, hasPads }: { table: SeatTable; hasPads: boolean }) {
  const open = Math.max(0, COUCH_SEATS - table.seats.length);
  return (
    <div data-testid="couch-seats" className="pointer-events-none absolute bottom-4 left-4 z-30 flex flex-col gap-1 font-mono text-[11px]">
      <div className="flex gap-1">
        {table.seats.map((s) => (
          <span key={s.key} data-seat={s.label} data-kind={s.kind} className="rounded bg-black/70 px-2 py-0.5 font-bold" style={{ color: s.color }}>
            {s.label} · {s.name}
          </span>
        ))}
        {Array.from({ length: open }, (_, i) => (
          <span key={`open-${i}`} className="rounded border border-white/15 px-2 py-0.5 text-white/40">P{table.seats.length + i + 1}</span>
        ))}
      </div>
      {open > 0 ? <span className="text-white/50">{openSeatHint(hasPads)}</span> : null}
      {table.waiting.length ? (
        <span data-testid="couch-waiting" className="text-white/60">NEXT UP · {table.waiting.map((w) => w.name).join(', ')}</span>
      ) : null}
    </div>
  );
}
