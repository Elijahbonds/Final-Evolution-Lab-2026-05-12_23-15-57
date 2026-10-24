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
import { courtArtSkin } from '@/lib/modes/art/apply-art-card';
// COUCH TURNS (lane/hoops-couch, 2026-10-24): friends each take their own run, the camera's body included — lib/hoops/couchTurns.ts
import {
  activeShooter, couchBoard, couchLineup, couchTurnsBlocked, finalLine, handoffCopy, joinedCount, padDrives, phoneDrives, pickerShown,
  postsSession, shooterName, startCouch, turnLine as couchTurnLine, waitLine, wantAfterJoin, type CouchTurns, type Shooter,
} from '@/lib/hoops/couchTurns';
import { recordTurnScore, turnsDone } from '@/lib/party/turns';
import { bodyPlay } from '@/lib/move/bodyPlay';
import type { PadInfo } from '@/lib/babylon/core/InputBus';
import { TurnsFinal, TurnsHandoff, TurnsPicker } from './shoot-turns';
import type { LobbyPeer } from '@/lib/controller-link/types';
import { useEffect, useRef, useState, useCallback, useMemo, useSyncExternalStore } from 'react';
import type { GameProps, GameResult } from './game-shell';
import { BootSplash } from './boot-splash';
import { surfaceBootError } from './boot-error';
import { useBabylonBootRetry } from './use-babylon-boot-retry';
import { runMode, InputBus, type ModePhase, type SessionResult, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { rackPips, SHOT_TARGET, GOOD_BAND } from '@/lib/babylon/core/shootoutHud';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { PadChips } from '@/lib/babylon/ui/PadChips';
import { HostLobby } from '@/components/controller-link/host-lobby';
import { controllerConfigFor } from '@/lib/controller-link/schemas/registry';
import { toInputBus } from '@/lib/controller-link/modeBridge';
import { hnum } from './hud-format';
import { HudBanner, HudChip, HudFrame, HudMeter, HudPlate, HudText, ScoreValue, hudColor, type HudTone } from './tv-hud';
import { MicCaption, MicToggle } from './mic-caption';   // THE MIC (2026-09-24)
import { ThreePointOptions } from './three-point-options';   // IMPROVE (2026-10-06) #8: the shot input on the pause screen

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

type StandingRow = { name: string; score: number | string; line: string; form?: string };
/** The shootout's standings rows (the board key): YOU, then the field, each with form, score and where they stand. */
function Standings({ rows, you }: { rows: StandingRow[]; you?: string }) {
  return (
    <>
      {rows.map((r) => (
        <div key={r.name} className="flex items-baseline gap-3 py-0.5">
          {/* COUCH TURNS: the human's row carries the name of whoever is shooting this run */}
          <HudText size="body" tone={r.name === 'YOU' ? 'score' : 'text'} className="w-16 truncate">{r.name === 'YOU' && you ? you : r.name}</HudText>
          {/* IMPROVE (2026-10-06) #7: the rival's form — the reveal runs coldest first, so the HOT cards land last */}
          <HudText size="caption" tone={r.form === 'HOT' ? 'heat' : 'info'} className="w-8" style={{ fontWeight: 800 }}>{r.form ?? ''}</HudText>
          <HudText size="value" tone={r.name === 'YOU' ? 'score' : 'text'} className="w-8 text-right">{r.score}</HudText>
          <HudText size="caption" tone={r.line === 'CHAMPION' ? 'score' : r.line === 'ADVANCES' ? 'you' : 'text'} alpha={r.line === 'CHAMPION' || r.line === 'ADVANCES' ? 1 : 0.4}>{r.line}</HudText>
        </div>
      ))}
    </>
  );
}

export default function ThreePointBabylon({ onEnd }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const endedRef = useRef(false);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const [phase, setPhase] = useState<ModePhase>('loading');
  // COUCH TURNS (lane/hoops-couch): who has joined (local pads, phones), how many take turns, and the shootout once it runs.
  // The input gates read gateRef every event (the shooter who is up); the screens render from state.
  const [pads, setPads] = useState<PadInfo[]>([]);
  const [peers, setPeers] = useState<LobbyPeer[]>([]);
  const [want, setWant] = useState(1);
  const [couch, setCouch] = useState<CouchTurns | null>(null);
  const couchRef = useRef<CouchTurns | null>(null);
  const [handoff, setHandoff] = useState<{ next: Shooter; prev: Shooter | null } | null>(null);
  const [couchDone, setCouchDone] = useState(false);
  const [couchAllowed, setCouchAllowed] = useState(false);
  const [waitHint, setWaitHint] = useState('');
  const gateRef = useRef<{ shooters: Shooter[]; at: number }>({ shooters: [], at: 0 });
  const cameraRef = useRef(false);
  const [lobbyKept, setLobbyKept] = useState(false);
  /** Each couch run gets a NEW canvas: a second runMode on the same canvas failed to boot (measured on the rig: Babylon's bloom
   *  blur read an undefined kernel weight, "reading 'toFixed'", in mountLightRig). The party room remounts its game the same way. */
  const [canvasGen, setCanvasGen] = useState(0);
  const nextRunRef = useRef<() => void>(() => {});
  const [countdown, setCountdown] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hud, setHud] = useState<Hud>({});
  // THE MIC's caption lives apart from the hud (the mic sends only { mic, micWho }). IMPROVE (2026-10-06) #10: the mode sends
  // only the keys that changed now, and this host MERGES them into the hud (it replaced the whole hud every frame)
  const [micLine, setMicLine] = useState<{ text: HudValue; who: HudValue }>({ text: '', who: '' });
  const [busReady, setBusReady] = useState(false);
  const { bootAttempt, retryBoot } = useBabylonBootRetry({
    busRef,
    endedRef,
    setPhase,
    setCountdown,
    setLoadError,
    reset: () => {
      setHud({});
      setMicLine({ text: '', who: '' });
      setBusReady(false);
    },
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bus = new InputBus();
    busRef.current = bus;
    // COUCH TURNS: only the shooter who is up drives (solo: every pad, as always — padDrives answers true)
    bus.padFilter = (slot) => padDrives(gateRef.current.shooters, gateRef.current.at, slot);
    setBusReady(true);
    let stop: (() => void) | null = null;
    let disposed = false;

    const resultSink = async (r: SessionResult) => {
      if (endedRef.current) return;
      // A SHOOTOUT IS TURN-BASED. In a couch shootout the run that just ended was one shooter's: bank it under their name and
      // mount the next shooter's run (the old phone order banked a turn and waited for a remount nothing did). A couch
      // shootout never reaches onEnd — it is unranked, unstaked and unpaid (couchTurns.postsSession), like the party room.
      const score = Number(r.stats?.points ?? r.score ?? 0);
      const c = couchRef.current;
      if (c && !postsSession(c.shooters.length)) {
        const next: CouchTurns = { ...c, turns: recordTurnScore(c.turns, score) };
        couchRef.current = next;
        gateRef.current = { shooters: next.shooters, at: next.turns.at };
        setCouch(next);
        if (turnsDone(next.turns)) { setCouchDone(true); return; }
        setHandoff({ next: next.shooters[next.turns.at], prev: next.shooters[next.turns.at - 1] ?? null });
        // one camera, a new body: the space check again for THEM (the safety note, the reach for their height, a still stand)
        if (cameraRef.current) bodyPlay.handOver();
        nextRunRef.current();
        return;
      }
      endedRef.current = true;
      const pts = Number(r.stats?.points ?? r.score ?? 0);
      const rivalPts = Number(r.stats?.rivalScore ?? 0);
      const won = r.outcome === 'win';
      onEndRef.current({
        score: pts,
        stats: r.stats, outcome: r.outcome,   // pass 5 phase 3: the proof line reads these
        opponentScore: rivalPts,
        won,
        duration: r.durationSec,
        headline: won
          ? `RANGE UNLOCKED · ${pts} PTS${rivalPts > 0 ? ` vs ${rivalPts}` : ''}`
          : `SHOOTOUT COMPLETE · ${pts} PTS${rivalPts > 0 ? ` vs ${rivalPts}` : ''}`,
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
      applySkin: courtArtSkin,   // PIPELINES (2026-10-06): the player's court art card, a centre-court decal
      input: bus,
      onPhase: (p, detail) => {
        if (disposed) return;
        setPhase(p);
        setCountdown(typeof detail === 'number' ? detail : null);
        if (p === 'error') setLoadError(typeof detail === 'string' ? detail : 'load failed');
      },
      onHud: (h) => {
        if (disposed) return;
        if (!('mic' in h) && !('micWho' in h)) { setHud((prev) => ({ ...prev, ...h })); return; }
        const { mic, micWho, ...rest } = h;
        setMicLine((m) => ({ text: 'mic' in h ? mic : m.text, who: 'micWho' in h ? micWho : m.who }));
        if (Object.keys(rest).length) setHud((prev) => ({ ...prev, ...rest }));
      },
      resultSink,
    }).then((s) => { if (disposed) s(); else stop = s; })
      .catch((e) => surfaceBootError(e, { disposed, setPhase, setLoadError }));
    }, 0);

    return () => { disposed = true; clearTimeout(startTimer); stop?.(); setBusReady(false); busRef.current = null; linkSink.current = null; };
  }, [bootAttempt]);   // callbacks are refs; bootAttempt remounts after a rejected runMode().

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
  const onControllerInput = useCallback((ev: Parameters<ReturnType<typeof toInputBus>>[0], _slot: number, peerId?: string) => {
    if (!phoneDrives(gateRef.current.shooters, gateRef.current.at, peerId)) return;
    const bus = busRef.current;
    if (!bus) return;
    if (linkSink.current?.bus !== bus) linkSink.current = { bus, sink: toInputBus(bus) };
    linkSink.current.sink(ev);
  }, []);
  // a controller paired to a phone arrives canonical (the binary relay) — same turn gate, straight onto the bus
  const onPhonePad = useCallback((e: Parameters<InputBus['emit']>[0], _slot: number, peerId?: string) => {
    if (phoneDrives(gateRef.current.shooters, gateRef.current.at, peerId)) busRef.current?.emit(e);
  }, []);

  const onPeers = useCallback((next: LobbyPeer[]) => { setPeers(next); }, []);

  const controllerConfig = useMemo(() => controllerConfigFor('threepoint'), []);

  // ── COUCH TURNS (lane/hoops-couch) ──
  // the next couch run: a fresh canvas, then the same remount the error retry uses
  nextRunRef.current = () => { setCanvasGen((g) => g + 1); retryBoot(); };
  // not on a ranked, staked, challenge, Story, Carnival, online or party-room run (read once the page is in the browser)
  useEffect(() => { setCouchAllowed(couchTurnsBlocked(window.location.pathname, window.location.search) === null); }, []);
  // the camera: body play on this page (the space check running or set). Only read where a couch shootout may run.
  const cameraStage = useSyncExternalStore(
    couchAllowed ? bodyPlay.subscribe : noSubscribe,
    () => (couchAllowed ? bodyPlay.view().stage : 'off'),
    () => 'off',
  );
  const camera = cameraStage === 'checking' || cameraStage === 'set';
  cameraRef.current = camera;
  useEffect(() => { if (busReady) setLobbyKept(true); }, [busReady]);
  // the connect chips' roster, for the lineup (each new bus: a turn's remount)
  useEffect(() => {
    const b = busRef.current;
    if (!busReady || !b) return undefined;
    return b.onPads(setPads);
  }, [busReady, bootAttempt]);   // bootAttempt too: a remount's busReady false → true is batched into no change at all
  const padsIn = useMemo(() => pads.map((p) => ({ slot: p.slot, name: p.name })), [pads]);
  const phonesIn = useMemo(() => peers.map((p) => ({ peerId: p.peerId, name: p.name, slot: p.slot, ready: p.ready, connected: p.connected })), [peers]);
  const joined = joinedCount(padsIn, phonesIn);
  const joinedRef = useRef(joined);
  useEffect(() => {
    const before = joinedRef.current;   // read now: the updater below runs later, after the ref has moved on
    joinedRef.current = joined;
    setWant((w) => wantAfterJoin(w, before, joined));
  }, [joined]);
  const lineup = useMemo(() => couchLineup(want, padsIn, phonesIn), [want, padsIn, phonesIn]);
  // who drives now: the shootout's shooter, or before the first run the planned P1 (solo: nobody is gated)
  gateRef.current = couch ? { shooters: couch.shooters, at: couch.turns.at } : { shooters: couchAllowed ? lineup : [], at: 0 };
  const gateMulti = gateRef.current.shooters.length > 1;
  // the first run of a planned shootout starts it; any run starting clears the hand-over card
  useEffect(() => {
    if (phase !== 'playing') return;
    setHandoff(null);
    if (!couchRef.current && couchAllowed) {
      const c = startCouch(lineup);
      if (c) { couchRef.current = c; setCouch(c); }
    }
  }, [phase]);   // eslint-disable-line react-hooks/exhaustive-deps -- the lineup is snapshotted at the first whistle only
  // a press from a pad whose shooter is not up does nothing; it is told to wait
  useEffect(() => {
    const b = busRef.current;
    if (!busReady || !b || !gateMulti) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = b.onSlot((e, slot) => {
      if (e.t !== 'button' || !e.pressed) return;
      const g = gateRef.current;
      if (padDrives(g.shooters, g.at, slot)) return;
      setWaitHint(waitLine(g.shooters, g.at));
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setWaitHint(''), WAIT_HINT_MS);
    });
    return () => { off(); if (timer) clearTimeout(timer); };
  }, [busReady, bootAttempt, gateMulti]);
  const shootAgain = useCallback(() => {
    const c = couchRef.current;
    if (!c) return;
    const again = startCouch(c.shooters);
    couchRef.current = again;
    setCouch(again);
    setCouchDone(false);
    if (again) setHandoff({ next: again.shooters[0], prev: again.shooters[again.shooters.length - 1] ?? null });
    if (cameraRef.current) bodyPlay.handOver();
    nextRunRef.current();
  }, []);
  const backToSolo = useCallback(() => {
    couchRef.current = null;
    setCouch(null);
    setCouchDone(false);
    setHandoff(null);
    setWant(1);
    gateRef.current = { shooters: [], at: 0 };
    nextRunRef.current();
  }, []);
  const up = couch ? activeShooter(couch) : null;
  // over the run (the hand-over card on READY says it there)
  const turnLine = couch && !couchDone && (phase === 'playing' || phase === 'paused') ? couchTurnLine(couch) : '';
  const couchRows = couch ? couchBoard(couch) : [];
  const handCopy = handoff ? handoffCopy(handoff.next, handoff.prev, camera) : null;
  const showPicker = pickerShown({ allowed: couchAllowed, phase, started: couch !== null, camera, joined });

  return (
    <div className="relative h-[calc(100dvh-3.25rem)] w-full overflow-hidden rounded-none border-0 bg-transparent">
      <canvas key={canvasGen} ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* TV HUD (A9.13, lane/hud-hoops): the shootout's readouts on the shared system — same keys, same gates, same slots. */}
      <HudFrame>
      {/* Whose turn it is, on the TV, whenever more than one phone is in the room. */}
      {turnLine && (
        // top-14: under the connect line the lobby keeps at the top while a pad is in (it ran across the chip at 960 px)
        <div className="absolute left-1/2 top-14 z-[21] flex -translate-x-1/2 flex-col items-center gap-1" data-couch-turn>
          <HudChip tone="you" size="value" className="tracking-[0.2em]">{turnLine}</HudChip>
          {/* COUCH TURNS: every shooter on one line, by name — banked scores, who is up, who is still to go */}
          {phase === 'playing' && (
            <HudChip size="caption" alpha={0.85}>{couchRows.map((r) => `${r.display} ${r.score ?? (r.up ? 'UP' : '—')}`).join('  ·  ')}</HudChip>
          )}
        </div>
      )}

      {/* A+ mission #4 — Wii Sports Resort readability on top of the 2K contest: the score and the clock at couch size,
          the rack as pips (money ball gold, the loaded ball pulsing), points left, the heat, and a wide release meter
          under the shooter drawn from the SAME bands the mode grades with. */}
      {phase === 'playing' && (
        // pt-9 while a turn banner is up: at its own top-3 slot the score covered it (measured), so the stack starts under it
        <div className={`absolute inset-x-0 top-3 z-20 flex flex-col items-center gap-1.5 ${turnLine ? 'pt-[7.5rem]' : ''}`}>
          <div className="flex items-end gap-5">
            <HudPlate className="px-5 py-1.5 leading-none"><ScoreValue value={hnum(hud.score)} size="hero" tone="score" /></HudPlate>
            {/* IMPROVE (2026-10-06) #6: the practice rack has no clock (the mode sends clock: null) */}
            {typeof hud.clock === 'number'
              ? <HudPlate className="px-4 py-2 leading-none"><ScoreValue value={`${hnum(hud.clock)}s`} size="score" tone={hud.clock <= 10 ? 'danger' : 'text'} pop={false} /></HudPlate>
              : <HudPlate className="px-4 py-2 leading-none"><HudText size="stat" alpha={0.7}>NO CLOCK</HudText></HudPlate>}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <HudChip size="label" alpha={0.7}>{String(hud.round ?? 'QUALIFYING')}</HudChip>
            {hud.money ? <HudChip size="label" tone="score" style={{ fontWeight: 800 }}>MONEY BALL · 2 PTS</HudChip> : null}
            {hud.heat === 'fire' ? <HudChip size="label" tone="heat" style={{ fontWeight: 800 }}>ON FIRE ×{hnum(hud.streak)}</HudChip>
              : Number(hud.streak) >= 2 ? <HudChip size="label" tone="heat" alpha={0.8}>streak ×{hnum(hud.streak)}</HudChip> : null}
            {typeof hud.left === 'number' && <HudChip size="label" alpha={0.6}>{hud.left} LEFT</HudChip>}
          </div>
          {typeof hud.rackIdx === 'number' && typeof hud.ballIdx === 'number' && (
            <div className="flex items-center gap-3">
              {rackPips(hud.rackIdx, hud.ballIdx, undefined, undefined, typeof hud.moneyRack === 'number' ? hud.moneyRack : -1).map((row, r) => (
                <HudPlate key={r} data-hud="rack" className="flex items-start gap-1 px-1.5 py-1">
                  {row.map((p, b) => {
                    // IMPROVE (2026-10-06) #4: what each release was, under its ball — the run's timing bias at a glance
                    const grade = typeof hud.relPips === 'string' ? hud.relPips[r * 5 + b] : '.';
                    const tick = PIP_TICK[grade ?? '.'];
                    return (
                      <span key={b} className="flex flex-col items-center gap-0.5">
                        <span
                          className={`inline-block rounded-full ${p.money ? 'h-3 w-3' : 'h-2.5 w-2.5'} ${p.state === 'next' ? 'animate-pulse motion-reduce:animate-none ring-2 ring-white' : ''}`}
                          style={{ background: p.state === 'taken' ? 'rgba(255,255,255,0.18)' : p.money ? hudColor('score') : hudColor('heat'), opacity: p.state === 'ahead' ? 0.85 : 1 }}
                        />
                        <span className="inline-block h-[3px] w-2.5 rounded-full" title={tick?.label} style={{ background: tick ? hudColor(tick.tone) : 'transparent' }} />
                      </span>
                    );
                  })}
                </HudPlate>
              ))}
            </div>
          )}
          <div className="hidden">RACK {String(hud.rack ?? '—')} · BALL {String(hud.ball ?? '—')}</div>
          {/* The contest layer publishes round/money/need/board — all four
              used to be computed every frame and rendered NOWHERE (the classic
              "HUD state is not a bezel" trap; only the dev route's JSON dump
              ever showed them). This is the contest the player is in. */}
          {typeof hud.need === 'number' && (
            <HudChip tone="danger" size="value">NEED {hnum(hud.need)} TO WIN</HudChip>
          )}
          {/* IMPROVE (2026-10-06) #3: qualifying's number — projected from the field's form, the way the final shows NEED */}
          {typeof hud.cut === 'number' && (
            <HudChip tone="you" size="value">CUT ≈ {hnum(hud.cut)} · TOP 3 ADVANCE</HudChip>
          )}
          {/* IMPROVE (2026-10-06) #4: the key to the ticks under the pips (only once a ball has been shot) */}
          {typeof hud.relPips === 'string' && /[EGPL]/.test(hud.relPips) && (
            <HudPlate className="flex gap-2 px-2 py-0.5">
              {(['E', 'P', 'G', 'L'] as const).map((k) => <HudText key={k} size="caption" tone={PIP_TICK[k]?.tone ?? 'text'}>{PIP_TICK[k]?.label}</HudText>)}
            </HudPlate>
          )}
          {/* WAVE 3: the standings, on a phone (see the corner plate below) */}
          {Array.isArray(hud.board) && (
            <HudPlate className="px-3 py-1.5 sm:hidden" data-hud="standings-stack">
              <Standings rows={hud.board as StandingRow[]} you={up ? shooterName(up) : undefined} />
            </HudPlate>
          )}
        </div>
      )}

      {/* the release meter + the call — bottom centre, under the shooter, couch-size */}
      {phase === 'playing' && (
        <div className="absolute inset-x-0 bottom-24 z-20 flex flex-col items-center gap-2">
          {typeof hud.banner === 'string' && hud.banner && (
            <HudBanner flow text={hud.banner} tone={hud.banner.startsWith('MISS') ? 'text' : 'you'} />
          )}
          {typeof hud.meter === 'number' && (
            <ReleaseBar
              t={hud.meter}
              green={typeof hud.meterGreen === 'number' ? hud.meterGreen : SHOT_TARGET}
              half={typeof hud.meterHalf === 'number' ? hud.meterHalf : GOOD_BAND}
            />
          )}
        </div>
      )}

      {/* WAVE 3 (lane/w3-present): THE STANDINGS stand where the screen has room. In the right-hand corner (as it always was) from 640 px up; on a
          phone it joins the score stack, in the flow under the chips, because at 390 px the corner plate (about 250 px wide) ran across the
          score and the clock (the stack is centred and as wide as its widest chip). From 1024 px up (a TV, a desktop window) the stack's
          five rack plates and its LEFT chip reach past the plate's corner slot, so it drops below them (33 % of the stage: measured at 1080p
          and 720p). Same rows, same keys, same tones. */}
      {phase === 'playing' && Array.isArray(hud.board) && (
        <HudPlate className="absolute right-4 top-4 z-20 hidden px-3 py-2 sm:block lg:top-[33%]" data-hud="standings-corner">
          <Standings rows={hud.board as StandingRow[]} you={up ? shooterName(up) : undefined} />
        </HudPlate>
      )}
      {/* COUCH TURNS: a press from a shooter who is not up */}
      {waitHint && phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[11rem] z-20 flex justify-center" data-couch-wait>
          <HudChip tone="heat" size="label">{waitHint}</HudChip>
        </div>
      )}
      </HudFrame>

      {/* MOVEMENT PLAY P3 (2026-09-24, the step-4a review): BootSplash draws the pause now, so it sits where this host's
          own pause sat — after the turn banner, so the pause's dim covers the banner as it did (plan R11). Every other
          phase of the splash is z-40 or nothing, so the order changes only the pause. */}
      <BootSplash
        modeId="threepoint"
        title="DOWNTOWN"
        phase={phase}
        detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}
        onStart={tapStart}
        onRetry={retryBoot}
        readyLead={handCopy && !couchDone ? <TurnsHandoff title={handCopy.title} sub={handCopy.sub} rows={couchRows} /> : undefined}
        readyExtra={showPicker ? <div className="mt-3"><TurnsPicker want={want} lineup={lineup} camera={camera} onPick={setWant} /></div> : undefined}
      />

      {/* Lobby is expanded until the whistle, then collapses to a status badge
          so it never sits on top of live play. */}
      {/* COUCH TURNS: the hand-over card while the next shooter's run loads and waits on READY; the picker on the first READY;
          the board once everyone has shot. Over the splash (z-40), catching only their own taps. */}
      {couchDone && couch && (
        <div className="absolute inset-0 z-[46] grid place-items-center bg-black/55 px-4">
          <TurnsFinal line={finalLine(couch)} rows={couchRows} onAgain={shootAgain} onDone={backToSolo} />
        </div>
      )}

      {/* the lobby stays mounted across a couch shootout's runs (each run is a remount): the phones keep their link */}
      {controllerConfig && (busReady || lobbyKept) && (
        <HostLobby
          config={controllerConfig}
          onInput={onControllerInput}
          onPeers={onPeers}
          onPadInput={onPhonePad}
          collapsed={phase === 'playing'}
          lazy={process.env.NODE_ENV === 'production'}
          bus={busRef.current}
        />
      )}
      {busReady && busRef.current && <PadChips bus={busRef.current} className="left-4 top-4" />}

      {/* THE MIC: the MC's words just above the call and the meter (the scoreboard owns the top, the board the right) */}
      {phase === 'playing' && <MicCaption text={micLine.text} who={micLine.who} className="bottom-[12rem]" />}
      {/* The switch never takes focus from a click: Space is the keyboard's SHOOT and fires on keyup, and a focused button
          answers that same keyup with a click — every shot after one click on MC would flip the announcer on and off */}
      {phase === 'playing' && (
        <div className="contents" onMouseDown={(e) => e.preventDefault()}>
          <MicToggle className="left-4 top-[24%]" />
        </div>
      )}

      {/* IMPROVE (2026-10-06) #8: the shot input can be switched on the pause screen (from the next ball) — over the splash's pause
          layer, catching only its own taps (the layer's tap is the resume) */}
      {phase === 'paused' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-10 z-[31] flex justify-center px-4">
          <div className="pointer-events-auto rounded-xl bg-black/60 px-4 py-2"><ThreePointOptions variant="pause" /></div>
        </div>
      )}

      {(phase === 'playing' || phase === 'countdown') && busRef.current && (
        <TouchOverlay bus={busRef.current} modeId="threepoint" visible />
      )}
    </div>
  );
}

/** COUCH TURNS: no subscription where a couch shootout cannot run (the party room runs its own turns, a staked run none). */
const noSubscribe = (): (() => void) => () => {};
/** How long "wait for your turn" stays up after a press from a shooter who is not up (ms). */
const WAIT_HINT_MS = 1800;

/** IMPROVE (2026-10-06) #4: the release-history ticks (threePointRules.pipFor): early short, late long, the green between. */
const PIP_TICK: Record<string, { tone: HudTone; label: string } | undefined> = {
  E: { tone: 'info', label: 'EARLY' }, G: { tone: 'you', label: 'GOOD' }, P: { tone: 'score', label: 'PERFECT' }, L: { tone: 'danger', label: 'LATE' },
};

/** The timing bar the whole mode hangs on — GOOD and PERFECT bands drawn from the shared ShotMeter's OWN window
 *  (HOOPS-10PHASE-2 phase 2: the mode reports its live green centre/half-width over HUD now, so the host draws
 *  the SAME window it is graded against, however distance or TV mode widened it). */
function ReleaseBar({ t, green, half }: { t: number; green: number; half: number }) {
  const perfectHalf = half * 0.35;   // BasketballCore.ShotMeter.release(): perfect is the inner 0.35 of the good window
  // The GOOD band (owner, 2026-10-14: "turn both on"): authored as a cyan class at /35, it never drew (Tailwind has no /35 in its
  // opacity scale). It draws now, behind the PERFECT band, at the authored 0.35. The windows are the mode's own; nothing is graded
  // differently. It only shows the GOOD window that was always there.
  return (
    <HudMeter
      height="strip" width="min(520px, 70vw)" framed
      segments={[{ from: green - half, to: green + half, tone: 'you', alpha: 0.35 }, { from: green - perfectHalf, to: green + perfectHalf, tone: 'score', alpha: 0.8 }]}
      markers={[{ at: t, tone: 'text', width: 4, glow: true }]}
    />
  );
}
