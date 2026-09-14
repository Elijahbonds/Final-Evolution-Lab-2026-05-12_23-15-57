'use client';

// Host-side lobby overlay — the thing on the TV that tells people how to join
// and shows who has. Mode-agnostic: it renders whatever HostSession reports.

import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { HostSession } from '@/lib/controller-link/host';
import { joinUrl } from '@/lib/controller-link/codes';
import type { ControlEvent, LinkState, LobbyPeer, ModeControllerConfig, PeerId } from '@/lib/controller-link/types';
import type { FelInput } from '@/lib/babylon/core/InputBus';
import { readDisplaySetting, writeDisplaySetting, displayBanner, MIRROR_FACTOR, type DisplaySetting } from '@/lib/controller-link/tvMode';

export interface HostLobbyProps {
  config: ModeControllerConfig;
  /** Where inputs go — usually toInputBus(bus) from modeBridge. */
  onInput: (ev: ControlEvent, slot: number, peerId: PeerId) => void;
  /** Collapse the panel once play starts; the badge stays visible. */
  collapsed?: boolean;
  /** Who is connected, for a host that needs a running order (see shootoutTurns). */
  onPeers?: (peers: LobbyPeer[]) => void;
  /** A controller paired to a PHONE, relayed as canonical FelInput (HostSession's binary pad relay), tagged by slot. */
  onPadInput?: (e: FelInput, slot: number, peerId: PeerId) => void;
  /**
   * Open no room until someone taps the badge (CONTROLLER-UNIVERSAL-MULTI). /try is the guest landing: a room per
   * page view would be a signaling poll for every visitor who never owns a second phone.
   */
  lazy?: boolean;
  /** Where the badge and panel sit on the stage (Tailwind position classes). */
  anchor?: string;
}

/** Phones cannot open the host's own loopback address — the QR would point them at themselves. */
function loopbackHost(): boolean {
  if (typeof window === 'undefined') return false;
  return /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i.test(window.location.hostname);
}

export function HostLobby({ config, onInput, collapsed, onPeers, onPadInput, lazy = false, anchor = 'right-4 top-4' }: HostLobbyProps) {
  // Owner call 2026-09-05: on desktop the pairing panel is a badge until a phone joins or the player taps it — the
  // panel used to sit open beside play on every three-point load. A connected peer opens it on its own.
  // null = automatic (open while a phone is connected and play is not live); true / false = the player's own choice.
  const [open, setOpen] = useState<boolean | null>(null);
  const [armed, setArmed] = useState(!lazy);
  // TV MODE lives on the host because the host is what is being mirrored (tvMode.ts). The guess needs the browser,
  // so it is read after mount; the player's toggle is stored and read by the mode at its next attempt.
  const [display, setDisplay] = useState<DisplaySetting>({ mode: 'direct', factor: 1, chosen: false });
  useEffect(() => {
    setDisplay(readDisplaySetting({ userAgent: navigator.userAgent, touchPoints: navigator.maxTouchPoints, width: window.innerWidth, height: window.innerHeight }));
  }, []);
  const toggleTv = () => {
    const mode = display.mode === 'mirrored' ? 'direct' : 'mirrored';
    writeDisplaySetting(mode, mode === 'mirrored' ? MIRROR_FACTOR : 1);
    setDisplay(readDisplaySetting());
  };
  const [code, setCode] = useState('');
  const [peers, setPeers] = useState<LobbyPeer[]>([]);
  const [state, setState] = useState<LinkState>('idle');
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<HostSession | null>(null);
  // Keep the latest sink in a ref so the session is created once, not per render.
  const inputRef = useRef(onInput);
  inputRef.current = onInput;
  // same ref trick as the input sink: the session is created once, not per render
  const peersRef = useRef(onPeers);
  peersRef.current = onPeers;
  const padRef = useRef(onPadInput);
  padRef.current = onPadInput;

  useEffect(() => {
    if (!armed) return;
    let disposed = false;
    const session = new HostSession({
      config,
      onInput: (ev, slot, peerId) => inputRef.current(ev, slot, peerId),
      onPadInput: (e, slot, peerId) => padRef.current?.(e, slot, peerId),
      onLobby: (ps) => { setPeers(ps); peersRef.current?.(ps); },
      onState: setState,
    });
    sessionRef.current = session;

    session.start()
      .then((c) => { if (!disposed) setCode(c); })
      .catch((e) => { if (!disposed) setError(String(e?.message ?? e)); });

    return () => { disposed = true; session.dispose(); };
  }, [config, armed]);

  useEffect(() => {
    if (!code) return;
    QRCode.toDataURL(joinUrl(code), { margin: 1, width: 320 })
      .then(setQr)
      .catch(() => setQr(null));   // the code + URL alone are still enough to join
  }, [code]);

  const url = useMemo(() => (code ? joinUrl(code) : ''), [code]);
  const connected = peers.filter((p) => p.connected);

  const openPanel = () => { setArmed(true); setOpen(true); };

  if (error) {
    return (
      <Badge anchor={anchor} tone="#ef4444">Controller link unavailable — {error}</Badge>
    );
  }

  const showPanel = open ?? (connected.length > 0 && !collapsed);
  if (!showPanel) {
    if (armed && code && (collapsed || connected.length > 0)) {
      return (
        <Badge anchor={anchor} tone={connected.length ? '#22d3ee' : '#6b7280'} onClick={openPanel}>
          {code} · {connected.length}/{config.maxPlayers} connected
          {connected[0]?.rttMs != null ? ` · ${connected[0].rttMs}ms` : ''}
          {display.mode === 'mirrored' ? ' · TV MODE' : ''}
        </Badge>
      );
    }
    return (
      <Badge anchor={anchor} tone="#6b7280" onClick={openPanel}>
        CONTROLLER LINK{armed && code ? ` · ${code}` : ''} · pair a phone{display.mode === 'mirrored' ? ' · TV MODE' : ' · TV mode'}
      </Badge>
    );
  }

  return (
    <div data-testid="host-lobby-panel" className={`pointer-events-auto absolute ${anchor} z-[45] w-[300px] rounded-xl border border-white/10 bg-black/80 p-4 font-mono text-xs text-white backdrop-blur`}>
      <div className="flex items-center justify-between">
        <span className="tracking-[0.25em] text-white/40">CONTROLLER LINK</span>
        <span className="flex items-center gap-2 text-white/30">
          {state}
          <button type="button" aria-label="Close controller link" onClick={() => setOpen(false)} className="rounded px-1.5 text-white/60 hover:bg-white/10 hover:text-white">×</button>
        </span>
      </div>

      <p className="mt-3 text-center text-3xl font-bold tracking-[0.25em] text-[#00E5FF]">
        {code || '····'}
      </p>

      {qr && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt={`Join code ${code}`} className="mx-auto mt-3 h-40 w-40 rounded bg-white p-1" />
      )}

      <p className="mt-2 break-all text-center text-[10px] text-white/35">{url}</p>
      {loopbackHost() && (
        <p className="mt-2 rounded bg-[#ffd75e]/10 px-2 py-1 text-[10px] leading-snug text-[#ffd75e]">
          Phones cannot open localhost. Open this page on the host at its network address (http://&lt;this computer&apos;s IP&gt;:port) or the live site, then scan.
        </p>
      )}

      {/* TV MODE — the host is the screen being mirrored, so the switch lives with it */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
        <span className="text-[10px] leading-snug text-white/55">{displayBanner(display)}</span>
        <button
          type="button"
          data-testid="tv-mode-toggle"
          onClick={toggleTv}
          className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-bold ${display.mode === 'mirrored' ? 'border-[#00E5FF] text-[#00E5FF]' : 'border-white/25 text-white/70'}`}
        >
          {display.mode === 'mirrored' ? 'TV MODE ON' : 'TV MODE OFF'}
        </button>
      </div>
      <p className="mt-1 text-[10px] text-white/30">AirPlay / screen mirroring? Turn it on — applies from the next attempt.</p>

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

function Badge({ children, tone, onClick, anchor }: { children: React.ReactNode; tone: string; onClick?: () => void; anchor: string }) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      data-testid="host-lobby-badge"
      onClick={onClick}
      className={`${onClick ? 'pointer-events-auto cursor-pointer hover:bg-white/10' : 'pointer-events-none'} absolute ${anchor} z-[45] rounded-full border px-3 py-1 font-mono text-[10px]`}
      style={{ borderColor: `${tone}55`, color: tone, background: '#000000aa' }}
    >
      {children}
    </div>
  );
}
