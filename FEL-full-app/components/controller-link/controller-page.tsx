'use client';

// The phone controller. Renders whatever schemas the host's mode declared —
// this file has no per-mode knowledge and should never gain any.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ControllerClient } from '@/lib/controller-link/client';
import {
  motionNeedsPermission, requestMotionPermission, subscribeMotion, TiltCharge,
} from '@/lib/controller-link/schemas/motion';
import { colorFor, holdActions } from '@/lib/controller-link/schemas/button';
import { DPAD_LAYOUT, dpadPayload } from '@/lib/controller-link/schemas/dpad';
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

  const join = useCallback(async () => {
    const client = new ControllerClient({
      code,
      name: name.trim() || 'Player',
      onState: setState,
      onConfig: setConfig,
      onSlot: setSlot,
    });
    clientRef.current = client;
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

      <main className="flex flex-1 flex-col justify-center gap-6 px-4 pb-8">
        {!config && (
          <p className="text-center text-sm text-white/40">Waiting for the host…</p>
        )}
        {config?.schemas.map((s, i) => {
          if (s.kind === 'motion') {
            return <MotionPad key={i} spec={s.motion} client={clientRef.current} />;
          }
          if (s.kind === 'button') {
            return (
              <div key={i} className="grid grid-cols-2 gap-3">
                {s.buttons.map((b, bi) => (
                  <ActionButton key={b.action} spec={b} color={colorFor(b, bi)} client={clientRef.current} />
                ))}
              </div>
            );
          }
          return <DpadPad key={i} action={s.dpad.action} client={clientRef.current} />;
        })}
      </main>
    </div>
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
  spec, color, client,
}: { spec: { action: string; label: string; hold?: boolean }; color: string; client: ControllerClient | null }) {
  const acts = holdActions(spec);
  const down = (): void => { client?.send(spec.hold ? acts.down : spec.action); };
  const up = (): void => { if (spec.hold) client?.send(acts.up); };
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
