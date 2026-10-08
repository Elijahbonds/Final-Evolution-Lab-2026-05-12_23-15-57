'use client';

// The phone controller. Renders whatever schemas the host's mode declared —
// this file has no per-mode knowledge and should never gain any.
//
// MUSIC-SUITE P5 (2026-09-25), phone-mpc: a button schema may carry OPT-IN hints (types.ts ButtonSchemaHints —
// haptics / velocity / compact; the rules are schemas/padFeel.ts). Still no per-mode knowledge: the page reads the hint,
// never the mode. A schema without hints renders and sends exactly what it did before — the schema list moved into
// SchemaControls (exported so padFeel.test.ts can render it) and its markup for every mode that sets no hint is pinned
// byte-for-byte against this page as it was, and a hint-less press still calls the bare `client.send(action)`.
//
// MUSIC-SUITE P6 phone-replay (2026-09-26): THE PHONE SEES THE ROOM. A config with `roomState: true` (types.ts; the rules
// are lib/controller-link/roomState.ts) is sent the host's live state, and the page draws it: a row of status chips above
// the controls, and the listed buttons lit (the live bank, PLAY while the transport runs, REC while armed). Still no
// per-mode knowledge — the page lights actions by name and prints the host's words. For every other config SchemaControls
// never reads the state at all, so its markup is byte-for-byte what it was (controller-page.test.tsx, and the 21-mode
// capture in the outbox, musicsuite/p6/phone-replay/controller-markup-proof.json).

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ControllerClient } from '@/lib/controller-link/client';
import { usePadRelay } from './use-pad-relay';
import type { TouchState } from '@/lib/controller-link/padSampler';
import {
  motionNeedsPermission, requestMotionPermission, subscribeMotion, TiltCharge,
} from '@/lib/controller-link/schemas/motion';
import { colorFor, holdActions } from '@/lib/controller-link/schemas/button';
import { DPAD_LAYOUT, dpadPayload } from '@/lib/controller-link/schemas/dpad';
import {
  buzz, canBuzz, feelLine, freshVelocityState, hasHints, hintsOf, pressMessage, readVelocity, sampleOf,
  type PadHints, type VelocityReading, type VelocityVia,
} from '@/lib/controller-link/schemas/padFeel';
import type { LinkState, ModeControllerConfig, RoomState } from '@/lib/controller-link/types';
import { isLit, roomStateOptIn } from '@/lib/controller-link/roomState';
// MULTIPLAYER (2026-10-06): the party room — the TV's per-phone view, a remembered name, and plain words when a code is dead
import type { PartyView } from '@/lib/party/protocol';
import { cleanPlayerName, PLAYER_NAME_MAX, recallPlayerName, rememberPlayerName } from '@/lib/party/playerName';
import { partyModeById } from '@/lib/party/catalog';
import { JOIN_PATH } from '@/lib/party/joinCode';
import { PhonePartyPanel } from '@/components/party/phone-party-panel';

const STATE_LABEL: Record<LinkState, string> = {
  idle: 'Ready', signaling: 'Finding host…', connecting: 'Connecting…',
  connected: 'Connected', reconnecting: 'Reconnecting…', failed: 'Disconnected',
};
const STATE_COLOR: Record<LinkState, string> = {
  idle: '#6b7280', signaling: '#ffd75e', connecting: '#ffd75e',
  connected: '#22d3ee', reconnecting: '#ff6b3d', failed: '#ef4444',
};

export default function ControllerPage({ code }: { code: string }) {
  const [name, setName] = useState('');
  const [joined, setJoined] = useState(false);
  const [state, setState] = useState<LinkState>('idle');
  const [config, setConfig] = useState<ModeControllerConfig | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  // MUSIC-SUITE P6 phone-replay: the host's live state (only an opted-in host sends one; only an opted-in config draws it)
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  // MULTIPLAYER: the party room as this phone sees it (null for every other host — the page is exactly what it was)
  const [party, setParty] = useState<PartyView | null>(null);
  const [left, setLeft] = useState(false);
  const clientRef = useRef<ControllerClient | null>(null);
  // PHASE B: a controller paired to THIS PHONE is relayed as canonical binary frames. The touch layout below
  // feeds the same frame, so the host has one code path whether this phone has a gamepad or not.
  const touchRef = useRef<TouchState>({});
  const [relayClient, setRelayClient] = useState<ControllerClient | null>(null);
  const relay = usePadRelay(relayClient, touchRef);

  // the name this phone used last time: a returning friend joins with one tap
  useEffect(() => { setName((n) => n || recallPlayerName()); }, []);

  const join = useCallback(async () => {
    rememberPlayerName(name);
    setLeft(false);
    const client = new ControllerClient({
      code,
      name: cleanPlayerName(name) || 'Player',
      onState: setState,
      onConfig: setConfig,
      onSlot: setSlot,
      onRoomState: setRoomState,
      onParty: setParty,
    });
    clientRef.current = client;
    setRelayClient(client);
    setJoined(true);
    await client.connect();
  }, [code, name]);

  useEffect(() => () => clientRef.current?.dispose(), []);

  // MULTIPLAYER: leaving is a real goodbye (the TV frees the seat at once), and rejoining is the same one tap
  const leave = useCallback(() => {
    clientRef.current?.command('leave');
    const c = clientRef.current;
    setTimeout(() => c?.dispose(), 150);   // let the goodbye reach the TV before the link closes
    clientRef.current = null;
    setRelayClient(null);
    setJoined(false); setParty(null); setConfig(null); setSlot(null); setState('idle'); setLeft(true);
  }, []);

  if (!joined) {
    return (
      <JoinScreen code={code} name={name} setName={setName} onJoin={join} left={left} />
    );
  }

  // a dead code says so, and where to go — it used to sit on "Disconnected" with nothing else on the page
  if (state === 'failed' && !config) {
    return (
      <div data-testid="controller-room-missing" className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#07090d] px-6 text-center text-white">
        <p className="font-mono text-xs tracking-[0.3em] text-white/40">ROOM {code}</p>
        <p className="fel-heading text-2xl font-black">Can’t find that game</p>
        <p className="max-w-xs text-sm text-white/55">The party screen may have closed, or the code changed. Check the code on the TV.</p>
        <a href={JOIN_PATH} className="rounded-xl bg-[#00E5FF] px-6 py-3 font-bold text-black">TYPE A CODE</a>
      </div>
    );
  }
  const partyBetween = party !== null && party.phase !== 'playing';
  const partyQuiet = party !== null && party.phase === 'playing' && (!party.seat || (party.mode.style === 'turns' && !party.yourGo));

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#07090d] text-white">
      <header className="flex items-center justify-between px-4 py-3 text-xs font-mono">
        <span className="tracking-widest text-white/50">ROOM {code}</span>
        <span className="flex items-center gap-2" style={{ color: STATE_COLOR[state] }}>
          <span className="h-2 w-2 rounded-full" style={{ background: STATE_COLOR[state] }} />
          {STATE_LABEL[state]}{slot !== null ? ` · P${slot + 1}` : ''}
        </span>
      </header>

      {/* The controller this phone is holding, and the honest truth about the link it is on. A session on
          the WebSocket fallback is playable but noticeably worse, and saying so beats letting the game
          just feel bad for no visible reason. */}
      {(relay.padName || relay.unsupported || relay.path === 'socket') && (
        <div className="px-4 pb-1 text-[11px] font-mono text-white/45">
          {relay.padName && <span>{relay.padName} · {relay.framesSent} frames</span>}
          {relay.path === 'socket' && <span className="text-[#ffd75e]"> · slow path (relay)</span>}
          {relay.unsupported && <p className="mt-1 text-[#ffd75e]">{relay.unsupported}</p>}
        </div>
      )}

      <main className="flex flex-1 flex-col justify-center gap-6 px-4 pb-8">
        {party && <PhonePartyPanel party={party} client={clientRef.current} onLeave={leave} />}
        {!config && (
          <p className="text-center text-sm text-white/40">Waiting for the host…</p>
        )}
        {config && !party && <SchemaControls config={config} client={clientRef.current} live={roomState} />}
        {config && party && !partyBetween && (
          <div data-testid="phone-party-controls" className={`flex flex-col gap-6 ${partyQuiet ? 'pointer-events-none opacity-30' : ''}`}>
            <SchemaControls config={config} client={clientRef.current} live={roomState} />
          </div>
        )}
      </main>
    </div>
  );
}

/** A pad bank's feel: reads each press's velocity by the padFeel rule, remembering what this phone has shown so far. */
export interface PadFeel { read: (e: ReactPointerEvent<HTMLButtonElement>) => VelocityReading }

/**
 * The mode's schemas, in order (the body of the page once the host has said what it wants). MUSIC-SUITE P5: moved out of
 * ControllerPage unchanged; the only additions are for a schema that asked for a hint — and the one feel line after the
 * list, said only when some schema asked for haptics or velocity.
 * MUSIC-SUITE P6 phone-replay: `live` = the host's room state. Read ONLY for a config with `roomState: true` (the chips
 * above the controls; `lit` on its hinted buttons); for any other config it is ignored — not one byte of its markup moves.
 */
export function SchemaControls({ config, client, live = null }: { config: ModeControllerConfig; client: ControllerClient | null; live?: RoomState | null }) {
  const room = roomStateOptIn(config) ? live : null;
  const hints = hintsOf(config.schemas);
  // null until the page has looked (a server render never claims a buzz either way)
  const [vibrates, setVibrates] = useState<boolean | null>(null);
  useEffect(() => { setVibrates(canBuzz(typeof navigator === 'undefined' ? null : navigator)); }, []);
  // one velocity state for the whole controller: the rule learns this phone's readings across every pad
  const velRef = useRef(freshVelocityState());
  const [via, setVia] = useState<VelocityVia | null>(null);
  const viaRef = useRef<VelocityVia | null>(null);
  const feel = useRef<PadFeel>({
    read: (e) => {
      const r = readVelocity(velRef.current, sampleOf(e));
      velRef.current = r.state;
      if (r.via !== viaRef.current) { viaRef.current = r.via; setVia(r.via); }
      return r;
    },
  }).current;
  const line = hasHints(hints) ? feelLine(hints, { buzz: vibrates }, via) : null;
  return (
    <>
      {room && room.chips.length > 0 && <RoomChips state={room} />}
      {config.schemas.map((s, i) => {
        if (s.kind === 'motion') {
          return <MotionPad key={i} spec={s.motion} client={client} />;
        }
        if (s.kind === 'button') {
          const h: PadHints | undefined = hasHints(s) ? { haptics: s.haptics, velocity: s.velocity, compact: s.compact } : undefined;
          return (
            <div key={i} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(6, s.columns ?? 2))}, minmax(0, 1fr))` }}>
              {s.buttons.map((b, bi) => (
                h
                  ? <ActionButton key={b.action} spec={b} color={colorFor(b, bi)} client={client} hints={h} feel={h.velocity ? feel : undefined} {...(room ? { lit: isLit(room, b.action) } : {})} />
                  : <ActionButton key={b.action} spec={b} color={colorFor(b, bi)} client={client} />
              ))}
            </div>
          );
        }
        return <DpadPad key={i} action={s.dpad.action} client={client} />;
      })}
      {line && <p data-testid="pad-feel" className="text-center font-mono text-[11px] text-white/45">{line}</p>}
    </>
  );
}

/**
 * MUSIC-SUITE P6 phone-replay: the host's status chips, in its words and colours (parseRoomState kept a tone only if it is
 * a plain #rrggbb). A polite live region, so a screen reader hears 'BANK B' / 'PLAYING' / 'REC ARMED' change.
 */
function RoomChips({ state }: { state: RoomState }) {
  return (
    <div data-testid="room-state" role="status" aria-live="polite" className="flex flex-wrap items-center justify-center gap-2 font-mono text-[11px]">
      {state.chips.map((c, i) => {
        const tone = c.tone ?? '#e8d9c2';
        return (
          <span key={i} data-on={c.on ? 'true' : undefined} className="rounded-full px-3 py-1 font-bold tracking-wider"
            style={{ color: c.on ? '#07090d' : tone, background: c.on ? tone : 'transparent', border: `1px solid ${c.on ? tone : `${tone}66`}` }}>
            {c.text}
          </span>
        );
      })}
    </div>
  );
}

function JoinScreen({
  code, name, setName, onJoin, left = false,
}: { code: string; name: string; setName: (v: string) => void; onJoin: () => void; left?: boolean }) {
  // MULTIPLAYER: an invite link carries the game (?game=<id>); only a game in the party catalogue is named
  const [invitedTo, setInvitedTo] = useState<string | null>(null);
  useEffect(() => {
    try { setInvitedTo(partyModeById(new URLSearchParams(window.location.search).get('game'))?.title ?? null); } catch { /* no search */ }
  }, []);
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-[#07090d] px-6 text-white">
      <div className="text-center">
        <p className="font-mono text-xs tracking-[0.3em] text-white/40">{left ? 'YOU LEFT THE ROOM' : invitedTo ? `YOU’RE INVITED TO PLAY ${invitedTo.toUpperCase()}` : 'FEL CONTROLLER'}</p>
        <p data-testid="controller-code" className="mt-2 font-mono text-4xl font-bold tracking-[0.2em] text-[#00E5FF]">{code}</p>
      </div>
      <input
        data-testid="controller-name"
        value={name}
        onChange={(e) => setName(e.target.value.slice(0, 16))}
        placeholder="Your name"
        maxLength={16}
        autoComplete="nickname"
        className="w-full max-w-xs rounded-lg bg-white/10 px-4 py-3 text-center outline-none placeholder:text-white/30"
      />
      {name && cleanPlayerName(name) !== name.trim() && (
        <p className="-mt-4 font-mono text-[10px] text-white/40">The TV will show: {cleanPlayerName(name) || 'PLAYER'} (letters, numbers, up to {PLAYER_NAME_MAX})</p>
      )}
      {/* The join tap doubles as the user gesture iOS requires before it will
          even consider granting motion access. */}
      <button
        data-testid="controller-join"
        onClick={onJoin}
        className="w-full max-w-xs rounded-lg bg-[#00E5FF] px-6 py-4 font-bold text-black active:bg-[#00c9e0]"
      >
        {left ? 'REJOIN' : 'JOIN'}
      </button>
    </div>
  );
}

function MotionPad({
  spec, client,
}: { spec: { action: string; hint: string; fullChargeDeg?: number }; client: ControllerClient | null }) {
  const [granted, setGranted] = useState(false);
  const [needsPerm, setNeedsPerm] = useState(false);
  const [charge, setCharge] = useState(0);
  const chargeRef = useRef(new TiltCharge(spec.fullChargeDeg ?? 45));

  useEffect(() => { setNeedsPerm(motionNeedsPermission()); }, []);

  useEffect(() => {
    if (!granted) return;
    return subscribeMotion((r) => {
      const c = chargeRef.current.update(r.pitch);
      setCharge(c);
      // Stream the live charge so the TV can render the wind-up as it happens,
      // not just the final value at release.
      client?.send('charge', c);
    });
  }, [granted, client]);

  const enable = async (): Promise<void> => { setGranted(await requestMotionPermission()); };

  const release = (): void => {
    const power = chargeRef.current.release();
    setCharge(0);
    client?.send(spec.action, { power });
  };

  if (!granted) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-white/60">{spec.hint}</p>
        <button onClick={enable} className="rounded-lg bg-[#ffd75e] px-6 py-3 font-bold text-black">
          ENABLE MOTION
        </button>
        {needsPerm && (
          <p className="max-w-xs text-xs text-white/35">
            iOS needs permission and an https page for tilt. If nothing happens, use the button below.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-white/60">{spec.hint}</p>
      <div className="h-4 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-[width] duration-75"
          style={{ width: `${charge * 100}%`, background: charge > 0.85 ? '#ff6b3d' : '#22d3ee' }}
        />
      </div>
      <button
        onPointerUp={release}
        className="h-40 w-40 rounded-full bg-[#00E5FF]/20 text-lg font-bold text-[#00E5FF] active:bg-[#00E5FF]/40"
      >
        RELEASE
      </button>
    </div>
  );
}

function ActionButton({
  spec, color, client, hints, feel, lit,
}: { spec: { action: string; label: string; hold?: boolean }; color: string; client: ControllerClient | null; hints?: PadHints; feel?: PadFeel; lit?: boolean }) {
  const acts = holdActions(spec);
  const down = (e: ReactPointerEvent<HTMLButtonElement>): void => {
    if (!hints) { client?.send(spec.hold ? acts.down : spec.action); return; }   // every mode without a hint: as it always was
    // MUSIC-SUITE P5 (phone-mpc): the hit goes first (it is the latency-critical part), then the buzz
    const [a, p] = pressMessage(spec, hints, feel ? feel.read(e) : null);
    if (p === undefined) client?.send(a); else client?.send(a, p);
    if (hints.haptics) buzz(typeof navigator === 'undefined' ? null : navigator);
  };
  const up = (): void => { if (spec.hold) client?.send(acts.up); };
  if (hints) {
    // a hinted pad: no double-tap zoom / long-press callout between fast hits (touch-action), and a compact row is shorter
    // MUSIC-SUITE P6 phone-replay: LIT (the host's room state names this action — the live bank, PLAY while playing, REC
    // while armed): a filled face and a ring in the button's own colour. Unlit and unset render exactly as P5 did.
    return (
      <button
        onPointerDown={down}
        onPointerUp={up}
        onPointerCancel={up}
        className={`select-none rounded-xl ${hints.compact ? 'py-3 text-sm' : 'py-8 text-lg'} font-bold active:brightness-125`}
        style={lit
          ? { background: `${color}88`, color: '#07090d', border: `1px solid ${color}`, touchAction: 'manipulation', boxShadow: `0 0 0 2px ${color}` }
          : { background: `${color}33`, color, border: `1px solid ${color}66`, touchAction: 'manipulation' }}
        {...(lit ? { 'aria-pressed': true, 'data-lit': 'true' } : {})}
      >
        {spec.label}
      </button>
    );
  }
  return (
    <button
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      className="rounded-xl py-8 text-lg font-bold active:brightness-125"
      style={{ background: `${color}33`, color, border: `1px solid ${color}66` }}
    >
      {spec.label}
    </button>
  );
}

function DpadPad({ action, client }: { action: string; client: ControllerClient | null }) {
  return (
    <div className="mx-auto grid h-48 w-48 grid-cols-3 grid-rows-3 gap-1">
      {DPAD_LAYOUT.map(({ dir, row, col }) => (
        <button
          key={dir}
          style={{ gridRow: row, gridColumn: col }}
          onPointerDown={() => client?.send(action, dpadPayload(dir, true))}
          onPointerUp={() => client?.send(action, dpadPayload(dir, false))}
          onPointerCancel={() => client?.send(action, dpadPayload(dir, false))}
          className="rounded-lg bg-white/10 text-xl text-white/70 active:bg-white/25"
        >
          {dir === 'up' ? '▲' : dir === 'down' ? '▼' : dir === 'left' ? '◀' : '▶'}
        </button>
      ))}
    </div>
  );
}
