'use client';

// Host-side lobby overlay — the thing on the TV that tells people how to join
// and shows who has. Mode-agnostic: it renders whatever HostSession reports.

import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { HostSession } from '@/lib/controller-link/host';
import { joinUrl } from '@/lib/controller-link/codes';
import type { ControlEvent, LinkState, LobbyPeer, ModeControllerConfig, PeerId } from '@/lib/controller-link/types';

export interface HostLobbyProps {
  config: ModeControllerConfig;
  /** Where inputs go — usually toInputBus(bus) from modeBridge. */
  onInput: (ev: ControlEvent, slot: number, peerId: PeerId) => void;
  /** Collapse the panel once play starts; the badge stays visible. */
  collapsed?: boolean;
}

export function HostLobby({ config, onInput, collapsed }: HostLobbyProps) {
  const [code, setCode] = useState('');
  const [peers, setPeers] = useState<LobbyPeer[]>([]);
  const [state, setState] = useState<LinkState>('idle');
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<HostSession | null>(null);
  // Keep the latest sink in a ref so the session is created once, not per render.
  const inputRef = useRef(onInput);
  inputRef.current = onInput;

  useEffect(() => {
    let disposed = false;
    const session = new HostSession({
      config,
      onInput: (ev, slot, peerId) => inputRef.current(ev, slot, peerId),
      onLobby: setPeers,
      onState: setState,
    });
    sessionRef.current = session;

    session.start()
      .then((c) => { if (!disposed) setCode(c); })
      .catch((e) => { if (!disposed) setError(String(e?.message ?? e)); });

    return () => { disposed = true; session.dispose(); };
  }, [config]);

  useEffect(() => {
    if (!code) return;
    QRCode.toDataURL(joinUrl(code), { margin: 1, width: 320 })
      .then(setQr)
      .catch(() => setQr(null));   // the code + URL alone are still enough to join
  }, [code]);

  const url = useMemo(() => (code ? joinUrl(code) : ''), [code]);
  const connected = peers.filter((p) => p.connected);

  if (error) {
    return (
      <Badge tone="#ef4444">Controller link unavailable — {error}</Badge>
    );
  }

  if (collapsed) {
    return (
      <Badge tone={connected.length ? '#22d3ee' : '#6b7280'}>
        {code || '····'} · {connected.length}/{config.maxPlayers} connected
        {connected[0]?.rttMs != null ? ` · ${connected[0].rttMs}ms` : ''}
      </Badge>
    );
  }

  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-30 w-[300px] rounded-xl border border-white/10 bg-black/80 p-4 font-mono text-xs text-white backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="tracking-[0.25em] text-white/40">CONTROLLER LINK</span>
        <span className="text-white/30">{state}</span>
      </div>

      <p className="mt-3 text-center text-3xl font-bold tracking-[0.25em] text-[#00E5FF]">
        {code || '····'}
      </p>

      {qr && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt={`Join code ${code}`} className="mx-auto mt-3 h-40 w-40 rounded bg-white p-1" />
      )}

      <p className="mt-2 break-all text-center text-[10px] text-white/35">{url}</p>

      <div className="mt-3 border-t border-white/10 pt-3">
        <p className="text-white/40">
          PLAYERS {connected.length}/{config.maxPlayers}
        </p>
        {peers.length === 0 && (
          <p className="mt-2 text-white/30">Scan the code with a phone to join.</p>
        )}
        <ul className="mt-2 space-y-1">
          {peers.map((p) => (
            <li key={p.peerId} className="flex items-center justify-between">
              <span className={p.connected ? 'text-white' : 'text-white/35'}>
                {p.slot !== null ? `P${p.slot + 1} ` : ''}{p.name}
              </span>
              <span className={p.connected ? 'text-[#22d3ee]' : 'text-[#ff6b3d]'}>
                {p.connected ? (p.rttMs != null ? `${p.rttMs}ms` : '—') : 'reconnecting'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: string }) {
  return (
    <div
      className="pointer-events-none absolute right-4 top-4 z-30 rounded-full border px-3 py-1 font-mono text-[10px]"
      style={{ borderColor: `${tone}55`, color: tone, background: '#000000aa' }}
    >
      {children}
    </div>
  );
}
