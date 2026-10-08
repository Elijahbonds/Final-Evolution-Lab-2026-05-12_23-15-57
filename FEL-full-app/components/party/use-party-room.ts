'use client';
// usePartyRoom — the TV's half of a party room (MULTIPLAYER lane, 2026-10-06).
//
// ONE Controller Link room for the whole evening. It opens when the party screen opens, phones join it once (QR, link or
// typed code), and it stays up across every game the room plays: picking a new game swaps the layout on every phone
// (HostSession.setConfig) instead of opening a new room and making everyone scan again.
//
// What lives here, and why each is the TV's job:
//   SEATS   pads first, then phones (lib/party/seats.ts) — the order the games themselves treat players in.
//   INPUT   each phone's press is routed by its seat (lib/party/route.ts) to the running game's InputBus — the game
//           component makes its own bus, so the room reaches it through liveInputBuses() (the same door the camera's
//           body source uses), never by changing a game.
//   TURNS   a TURNS game is mounted once per player; the scores are banked here (lib/party/turns.ts).
//   PHONES  each phone is sent the room as IT sees it (lib/party/view.ts) — no ids of anybody — and its commands are
//           checked here (lib/party/protocol.ts partyCmdAllowed): only the first seated phone picks and starts.
//
// Nothing here scores, stakes or saves: a party game is free play. It never calls /api/sessions, the Arena or a wallet.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HostSession } from '@/lib/controller-link/host';
import { toInputBus } from '@/lib/controller-link/modeBridge';
import { linkErrorText } from '@/lib/controller-link/transport/signaling';
import type { ControlEvent, LinkState, LobbyPeer } from '@/lib/controller-link/types';
import { InputBus, liveInputBuses, type FelInput, type PadInfo } from '@/lib/babylon/core/InputBus';
import { PARTY_MODES, partyModeById, type PartyMode } from '@/lib/party/catalog';
import { partyControllerConfig } from '@/lib/party/controls';
import { parsePartyCmd, partyCmdAllowed, samePartyView, type PartyPhase, type PartyView } from '@/lib/party/protocol';
import { routeSeatInput } from '@/lib/party/route';
import { captainKey, PARTY_CAPACITY, seatOfPhone, seatTable, type Seat, type SeatTable } from '@/lib/party/seats';
import { currentTurn, recordTurnScore, startTurns, turnBannerLine, turnsDone, type TurnPlayer, type TurnState } from '@/lib/party/turns';
import { partyViewFor, roomCanStart } from '@/lib/party/view';
import type { GameResult } from '@/components/games/game-shell';

/** How long the "UP NEXT" card holds between two players' goes. */
const BETWEEN_MS = 2400;
/** A pad's A that was still being mashed in the game must not fire the REMATCH the instant the results appear. */
const RESULTS_ARM_MS = 1200;
const TOAST_MS = 3200;

export interface PartyRoom {
  mode: PartyMode;
  modeIndex: number;
  pickMode: (index: number) => void;
  stepMode: (delta: number) => void;
  phase: PartyPhase;
  code: string;
  linkState: LinkState;
  error: string | null;
  retry: () => void;
  table: SeatTable;
  pads: PadInfo[];
  canStart: boolean;
  start: () => void;
  rematch: () => void;
  backToLobby: () => void;
  removeSeat: (seat: Seat) => void;
  /** TURNS: the board so far; null for a BUZZ game. */
  turns: TurnState | null;
  /** The players this game started with (BUZZ: P1, P2). */
  inGame: TurnPlayer[];
  /** Between two goes of a TURNS game: the game is unmounted and the UP NEXT card shows. */
  between: boolean;
  gameKey: number;
  result: GameResult | null;
  onGameEnd: (r: GameResult) => void;
  toast: string | null;
  banner: string;
}

function toTurnPlayer(s: Seat): TurnPlayer {
  return { seat: s.index ?? 0, label: s.label, name: s.name, color: s.color };
}

/** The game's `?players=` (Brain Brawl and Who Scene It read it at load and skip their own player-count screen). */
function setPlayersParam(n: number | null): void {
  try {
    const u = new URL(window.location.href);
    if (n === null) u.searchParams.delete('players'); else u.searchParams.set('players', String(n));
    window.history.replaceState(window.history.state, '', u.toString());
  } catch { /* a URL the browser refuses: the game shows its own picker instead */ }
}

function setModeParam(id: string): void {
  try {
    const u = new URL(window.location.href);
    u.searchParams.set('mode', id);
    window.history.replaceState(window.history.state, '', u.toString());
  } catch { /* cosmetic */ }
}

export function usePartyRoom(initialModeId: string | null): PartyRoom {
  const initialIndex = Math.max(0, PARTY_MODES.findIndex((m) => m.id === (partyModeById(initialModeId)?.id ?? '')));
  const [modeIndex, setModeIndex] = useState(initialIndex);
  const mode = PARTY_MODES[modeIndex];
  const [phase, setPhase] = useState<PartyPhase>('lobby');
  const [code, setCode] = useState('');
  const [linkState, setLinkState] = useState<LinkState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [phones, setPhones] = useState<LobbyPeer[]>([]);
  const [pads, setPads] = useState<PadInfo[]>([]);
  const [turns, setTurns] = useState<TurnState | null>(null);
  const [inGame, setInGame] = useState<TurnPlayer[]>([]);
  const [between, setBetween] = useState(false);
  const [gameKey, setGameKey] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const table = useMemo(() => seatTable(
    pads.map((p) => ({ slot: p.slot, name: p.name })),
    phones.map((p) => ({ peerId: p.peerId, name: p.name, slot: p.slot, ready: p.ready, connected: p.connected })),
    PARTY_CAPACITY,
  ), [pads, phones]);
  const canStart = roomCanStart({ mode, table });

  // ── refs: the input path runs outside React's render, at gesture rate ─────────────────────────────────────────────
  const sessionRef = useRef<HostSession | null>(null);
  const lobbyBusRef = useRef<InputBus | null>(null);
  const tableRef = useRef(table); tableRef.current = table;
  const modeRef = useRef(mode); modeRef.current = mode;
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const turnsRef = useRef(turns); turnsRef.current = turns;
  const betweenRef = useRef(between); betweenRef.current = between;
  /** Seat key → seat number, frozen when the game starts: a late joiner plays the next game, not this one. */
  const gameSeatsRef = useRef(new Map<string, number>());
  const sinksRef = useRef(new Map<string, (ev: ControlEvent) => void>());
  const resultsAtRef = useRef(0);
  /** What each phone was last sent, and a tick that forces a resend when a phone's link comes (back) up. */
  const sentRef = useRef(new Map<string, PartyView>());
  const [upTick, setUpTick] = useState(0);

  /** The running game's buses: every live bus but the lobby's own. Returns how many it reached. */
  const toGame = useCallback((e: FelInput): number => {
    let n = 0;
    for (const b of liveInputBuses()) if (b !== lobbyBusRef.current) { b.emit(e); n++; }
    return n;
  }, []);

  const routeFromPhone = useCallback((peerId: string, e: FelInput) => {
    if (phaseRef.current !== 'playing' || betweenRef.current) return;
    const m = modeRef.current;
    const seat = gameSeatsRef.current.get(`phone:${peerId}`) ?? null;
    const turnSeat = turnsRef.current ? currentTurn(turnsRef.current)?.seat ?? null : null;
    for (const out of routeSeatInput(e, { style: m.style, seat, seatsInGame: gameSeatsRef.current.size, turnSeat })) {
      const buses = toGame(out);
      // a probe's window into the routing (scripts/probes/_party-probe.mts sets the array; nothing else does)
      const log = (window as { __FEL_PARTY_LOG__?: unknown[] }).__FEL_PARTY_LOG__;
      if (Array.isArray(log) && log.length < 500) log.push({ seat, e: out, buses });
    }
  }, [toGame]);

  const onPhoneInput = useCallback((ev: ControlEvent, peerId: string) => {
    let sink = sinksRef.current.get(peerId);
    if (!sink) {
      // one adapter PER PHONE: toInputBus holds a held charge's ramp and the d-pad's held directions between events
      const shim = { emit: (e: FelInput) => routeFromPhone(peerId, e) } as unknown as InputBus;
      sink = toInputBus(shim);
      sinksRef.current.set(peerId, sink);
    }
    sink(ev);
  }, [routeFromPhone]);

  // ── the game flow ─────────────────────────────────────────────────────────────────────────────────────────────────
  const start = useCallback(() => {
    const m = modeRef.current;
    const seats = tableRef.current.seats.slice(0, m.maxPlayers);
    if (seats.length < m.minPlayers) return;
    gameSeatsRef.current = new Map(seats.map((s) => [s.key, s.index ?? 0]));
    sinksRef.current.clear();
    const players = seats.map(toTurnPlayer);
    setInGame(players);
    setResult(null);
    if (m.style === 'turns') {
      setTurns(startTurns(players));
      setBetween(players.length > 1);
      setPlayersParam(null);
    } else {
      setTurns(null);
      setBetween(false);
      setPlayersParam(Math.max(1, Math.min(m.maxPlayers, players.length)));
    }
    setPhase('playing');
    setGameKey((k) => k + 1);
  }, []);

  const backToLobby = useCallback(() => {
    setPhase('lobby');
    setTurns(null);
    setResult(null);
    setBetween(false);
    setPlayersParam(null);
    gameSeatsRef.current = new Map();
  }, []);

  const onGameEnd = useCallback((r: GameResult) => {
    if (phaseRef.current !== 'playing') return;
    if (modeRef.current.style === 'turns' && turnsRef.current) {
      const next = recordTurnScore(turnsRef.current, Number(r.score ?? 0));
      setTurns(next);
      if (turnsDone(next)) { setResult(r); resultsAtRef.current = Date.now(); setPhase('results'); }
      else setBetween(true);
      return;
    }
    setResult(r);
    resultsAtRef.current = Date.now();
    setPhase('results');
  }, []);

  // between two goes: hold the UP NEXT card, then mount the game for the next player
  useEffect(() => {
    if (phase !== 'playing' || !between) return undefined;
    const t = setTimeout(() => { setBetween(false); setGameKey((k) => k + 1); }, BETWEEN_MS);
    return () => clearTimeout(t);
  }, [phase, between]);

  const pickMode = useCallback((i: number) => {
    if (phaseRef.current !== 'lobby') return;
    const n = PARTY_MODES.length;
    setModeIndex(((i % n) + n) % n);
  }, []);
  const stepMode = useCallback((d: number) => {
    if (phaseRef.current !== 'lobby') return;
    setModeIndex((i) => (((i + d) % PARTY_MODES.length) + PARTY_MODES.length) % PARTY_MODES.length);
  }, []);

  // ── phone commands ────────────────────────────────────────────────────────────────────────────────────────────────
  const onCmd = useCallback((raw: string, peerId: string) => {
    const cmd = parsePartyCmd(raw);
    if (!cmd) return;
    const t = tableRef.current;
    const who = { seated: seatOfPhone(t, peerId) !== null, captain: captainKey(t) === `phone:${peerId}` };
    if (!partyCmdAllowed(cmd, who, phaseRef.current)) return;
    const session = sessionRef.current;
    switch (cmd) {
      case 'ready': session?.setReady(peerId, true); return;
      case 'unready': session?.setReady(peerId, false); return;
      case 'leave': sinksRef.current.delete(peerId); session?.drop(peerId); return;
      case 'prev': stepMode(-1); return;
      case 'next': stepMode(1); return;
      case 'start': if (roomCanStart({ mode: modeRef.current, table: t })) start(); return;
      case 'rematch': start(); return;
      case 'lobby': backToLobby(); return;
    }
  }, [start, backToLobby, stepMode]);
  const cmdRef = useRef(onCmd); cmdRef.current = onCmd;
  const inputRef = useRef(onPhoneInput); inputRef.current = onPhoneInput;
  const padRef = useRef(routeFromPhone); padRef.current = routeFromPhone;

  // ── the room: opened once, kept across games ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let disposed = false;
    const session = new HostSession({
      config: partyControllerConfig(modeRef.current),
      onInput: (ev, _slot, peerId) => inputRef.current(ev, peerId),
      onPadInput: (e, _slot, peerId) => padRef.current(peerId, e),
      onLobby: (ps) => { if (!disposed) setPhones(ps); },
      onState: (s) => { if (!disposed) setLinkState(s); },
      onPartyCmd: (cmd, peerId) => cmdRef.current(cmd, peerId),
      // a link (re)opened: forget what that phone was sent, so the effect below sends it the room again
      onPeerUp: (peerId) => { if (!disposed) { sentRef.current.delete(peerId); setUpTick((n) => n + 1); } },
    });
    sessionRef.current = session;
    session.start()
      .then((c) => { if (!disposed) setCode(c); })
      .catch((e) => { if (!disposed) setError(linkErrorText(e)); });
    return () => { disposed = true; session.dispose(); if (sessionRef.current === session) sessionRef.current = null; };
  }, [attempt]);

  const retry = useCallback(() => { setError(null); setCode(''); setPhones([]); setAttempt((a) => a + 1); }, []);

  // the phones' layout follows the picked game
  useEffect(() => {
    const s = sessionRef.current;
    if (s && s.config.modeId !== mode.id) s.setConfig(partyControllerConfig(mode));
    setModeParam(mode.id);
  }, [mode, code]);

  // ── pads: a press seats them (InputBus only sees a pad once a button is pressed on it) ───────────────────────────────
  const navRef = useRef<(e: FelInput) => void>(() => undefined);
  navRef.current = (e: FelInput) => {
    const p = phaseRef.current;
    if (p === 'lobby') {
      if (e.t === 'dpad' && e.pressed && (e.dir === 'left' || e.dir === 'right')) stepMode(e.dir === 'right' ? 1 : -1);
      else if (e.t === 'button' && e.pressed && e.btn === 'START') start();
    } else if (p === 'results') {
      if (Date.now() - resultsAtRef.current < RESULTS_ARM_MS) return;
      if (e.t === 'button' && e.pressed && (e.btn === 'A' || e.btn === 'START')) start();
      else if (e.t === 'button' && e.pressed && e.btn === 'B') backToLobby();
    }
  };
  useEffect(() => {
    const bus = new InputBus();
    lobbyBusRef.current = bus;
    bus.start();
    const offPads = bus.onPads(setPads);
    const offSlot = bus.onSlot((e) => navRef.current(e));
    setPads(bus.pads());
    return () => { offPads(); offSlot(); bus.stop(); if (lobbyBusRef.current === bus) lobbyBusRef.current = null; };
  }, []);

  // the TV's own keyboard: ◀ ▶ pick, Enter start / rematch, Backspace back to the lobby
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const p = phaseRef.current;
      if (p === 'lobby') {
        if (ev.key === 'ArrowLeft') stepMode(-1);
        else if (ev.key === 'ArrowRight') stepMode(1);
        else if (ev.key === 'Enter') start();
      } else if (p === 'results') {
        if (ev.key === 'Enter') start();
        else if (ev.key === 'Backspace') backToLobby();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [start, backToLobby, stepMode]);

  const removeSeat = useCallback((seat: Seat) => {
    if (seat.kind !== 'phone') return;
    const peerId = seat.key.slice('phone:'.length);
    sinksRef.current.delete(peerId);
    sessionRef.current?.drop(peerId);
  }, []);

  // ── what everyone reads: the banner, the toast, each phone's view ────────────────────────────────────────────────────
  const turn = turns ? currentTurn(turns) : null;
  const banner = phase === 'playing'
    ? (between && turn ? `UP NEXT · ${turn.label} · ${turn.name}` : turns ? turnBannerLine(turns) : '')
    : phase === 'results' ? resultLine(mode, result, turns, inGame) : lobbyLine(mode, table, canStart);

  const prevKeys = useRef<Map<string, Seat>>(new Map());
  useEffect(() => {
    const now = new Map([...table.seats, ...table.waiting].map((s) => [s.key, s]));
    const joined = [...now.values()].find((s) => !prevKeys.current.has(s.key));
    const left = [...prevKeys.current.values()].find((s) => !now.has(s.key));
    prevKeys.current = now;
    const line = joined
      ? `${joined.index !== null ? joined.label : 'NEXT UP'} JOINED · ${joined.name}${phaseRef.current === 'playing' ? ' — in from the next game' : ''}`
      : left ? `${left.name} LEFT` : null;
    if (!line) return undefined;
    setToast(line);
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [table]);

  useEffect(() => {
    const s = sessionRef.current;
    if (!s) return;
    const snap = { phase, mode, table, turns, note: banner };
    for (const p of phones) {
      if (!p.connected) { sentRef.current.delete(p.peerId); continue; }
      const view = partyViewFor(p.peerId, snap);
      if (samePartyView(sentRef.current.get(p.peerId) ?? null, view)) continue;
      if (s.sendTo(p.peerId, { type: 'party', party: view })) sentRef.current.set(p.peerId, view);
    }
    for (const id of [...sentRef.current.keys()]) if (!phones.some((p) => p.peerId === id)) sentRef.current.delete(id);
  }, [phase, mode, table, turns, between, banner, phones, upTick]);

  return {
    mode, modeIndex, pickMode, stepMode, phase, code, linkState, error, retry, table, pads, canStart, start, rematch: start,
    backToLobby, removeSeat, turns, inGame, between, gameKey, result, onGameEnd, toast, banner,
  };
}

function lobbyLine(mode: PartyMode, t: SeatTable, canStart: boolean): string {
  const n = t.seats.length;
  if (n === 0) return 'Scan the code to join — or press any button on a controller';
  if (n < mode.minPlayers) return `${mode.title} needs ${mode.minPlayers} players`;
  const notReady = t.seats.filter((s) => !s.ready && s.connected).length;
  if (!canStart) return `${notReady} still to ready up`;
  return n < mode.maxPlayers ? `Ready! Room for ${mode.maxPlayers - n} more — or start now` : 'Everyone is in. Start the game!';
}

function resultLine(mode: PartyMode, r: GameResult | null, turns: TurnState | null, inGame: TurnPlayer[]): string {
  if (mode.style === 'turns' && turns) {
    const scores = turns.scores.map((s) => s ?? -1);
    const best = Math.max(...scores);
    const winners = turns.players.filter((_, i) => scores[i] === best && best >= 0);
    if (turns.players.length < 2) return winners[0] ? `${winners[0].name} · ${best}` : 'GAME OVER';
    return winners.length === 1 ? `${winners[0].label} ${winners[0].name} WINS` : 'TIE AT THE TOP';
  }
  if (!r) return 'GAME OVER';
  if (inGame.length < 2) return r.headline ?? 'GAME OVER';
  const p1 = Number(r.score ?? 0);
  const p2 = Number(r.opponentScore ?? 0);
  if (p1 === p2) return 'DEAD HEAT';
  const w = p1 > p2 ? inGame[0] : inGame[1];
  return w ? `${w.label} ${w.name} WINS` : (r.headline ?? 'GAME OVER');
}
