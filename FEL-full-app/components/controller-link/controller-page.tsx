'use client';

// The phone controller. Renders whatever schemas the host's mode declared —
// this file has no per-mode knowledge and should never gain any.
//
// MUSIC-SUITE P5 (2026-09-25), phone-mpc: a button schema may carry OPT-IN hints (types.ts ButtonSchemaHints —
// haptics / velocity / compact; the rules are schemas/padFeel.ts). Still no per-mode knowledge: the page reads the hint,
// never the mode. A schema without hints renders and sends exactly what it did before — the schema list moved into
// SchemaControls (exported so padFeel.test.ts can render it) and its markup for every mode that sets no hint is pinned
// byte-for-byte against this page as it was, and a hint-less press still calls the bare `client.send(action)`.

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
import type { LinkState, ModeControllerConfig } from '@/lib/controller-link/types';

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
  const clientRef = useRef<ControllerClient | null>(null);
  // PHASE B: a controller paired to THIS PHONE is relayed as canonical binary frames. The touch layout below
  // feeds the same frame, so the host has one code path whether this phone has a gamepad or not.
  const touchRef = useRef<TouchState>({});
  const [relayClient, setRelayClient] = useState<ControllerClient | null>(null);
  const relay = usePadRelay(relayClient, touchRef);

  const join = useCallback(async () => {
    const client = new ControllerClient({
      code,
      name: name.trim() || 'Player',
      onState: setState,
      onConfig: setConfig,
      onSlot: setSlot,
    });
    clientRef.current = client;
    setRelayClient(client);
    setJoined(true);
    await client.connect();
  }, [code, name]);

  useEffect(() => () => clientRef.current?.dispose(), []);

  if (!joined) {
    return (
      <JoinScreen code={code} name={name} setName={setName} onJoin={join} />
    );
  }

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
        {!config && (
          <p className="text-center text-sm text-white/40">Waiting for the host…</p>
        )}
        {config && <SchemaControls config={config} client={clientRef.current} />}
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
 */
export function SchemaControls({ config, client }: { config: ModeControllerConfig; client: ControllerClient | null }) {
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
                  ? <ActionButton key={b.action} spec={b} color={colorFor(b, bi)} client={client} hints={h} feel={h.velocity ? feel : undefined} />
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

function JoinScreen({
  code, name, setName, onJoin,
}: { code: string; name: string; setName: (v: string) => void; onJoin: () => void }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-[#07090d] px-6 text-white">
      <div className="text-center">
        <p className="font-mono text-xs tracking-[0.3em] text-white/40">FEL CONTROLLER</p>
        <p className="mt-2 font-mono text-4xl font-bold tracking-[0.2em] text-[#00E5FF]">{code}</p>
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value.slice(0, 16))}
        placeholder="Your name"
        className="w-full max-w-xs rounded-lg bg-white/10 px-4 py-3 text-center outline-none placeholder:text-white/30"
      />
      {/* The join tap doubles as the user gesture iOS requires before it will
          even consider granting motion access. */}
      <button
        onClick={onJoin}
        className="w-full max-w-xs rounded-lg bg-[#00E5FF] px-6 py-4 font-bold text-black active:bg-[#00c9e0]"
      >
        JOIN
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
  spec, color, client, hints, feel,
}: { spec: { action: string; label: string; hold?: boolean }; color: string; client: ControllerClient | null; hints?: PadHints; feel?: PadFeel }) {
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
    return (
      <button
        onPointerDown={down}
        onPointerUp={up}
        onPointerCancel={up}
        className={`select-none rounded-xl ${hints.compact ? 'py-3 text-sm' : 'py-8 text-lg'} font-bold active:brightness-125`}
        style={{ background: `${color}33`, color, border: `1px solid ${color}66`, touchAction: 'manipulation' }}
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
