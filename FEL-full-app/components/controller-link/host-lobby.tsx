'use client';

// Host-side lobby overlay — the thing on the TV that tells people how to join
// and shows who has. Mode-agnostic: it renders whatever HostSession reports.

import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { HostSession } from '@/lib/controller-link/host';
import { joinUrl } from '@/lib/controller-link/codes';
import type { ControlEvent, LinkState, LobbyPeer, ModeControllerConfig, PeerId } from '@/lib/controller-link/types';
import type { FelInput, InputBus, PadInfo } from '@/lib/babylon/core/InputBus';
import { linkErrorText } from '@/lib/controller-link/transport/signaling';
import { USB_TITLE, USB_STEPS, PHONE_TITLE, PHONE_STEPS, usbStatusLine, typeInstead } from '@/lib/controller-link/connectHelp';
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
  /**
   * The mode's InputBus, so the lobby can teach USB beside the badge and say when a pad is in (CONTROLLER-USB-QR-HELP).
   * Read through onPads only — the lobby never polls a gamepad itself.
   */
  bus?: InputBus | null;
}

/** How long the "P1 … connected" line stays beside the badge after a pad joins mid-play. */
const JOINED_MS = 4000;

/** Phones cannot open the host's own loopback address — the QR would point them at themselves. */
function loopbackHost(): boolean {
  if (typeof window === 'undefined') return false;
  return /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i.test(window.location.hostname);
}

export function HostLobby({ config, onInput, collapsed, onPeers, onPadInput, lazy = false, anchor = 'right-4 top-4', bus = null }: HostLobbyProps) {
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
  // A failed room is retryable: bumping this re-runs the session effect (the eye's one "Failed to fetch" used to be final).
  const [attempt, setAttempt] = useState(0);
  const [pads, setPads] = useState<PadInfo[]>([]);
  // A pad's first press also starts play (START-UNSTICK), which collapses the lobby in the same frame, so the
  // "P1 … connected" line beside the badge holds for JOINED_MS after a join even while playing.
  const [justJoined, setJustJoined] = useState(false);
  useEffect(() => {
    if (!bus) return undefined;
    let seen = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = bus.onPads((next) => {
      setPads(next);
      if (next.length > seen) {
        setJustJoined(true);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => setJustJoined(false), JOINED_MS);
      }
      seen = next.length;
    });
    return () => { off(); if (timer) clearTimeout(timer); };
  }, [bus]);
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
      .catch((e) => { if (!disposed) setError(linkErrorText(e)); });

    return () => { disposed = true; session.dispose(); };
  }, [config, armed, attempt]);

  useEffect(() => {
    if (!code) return;
    QRCode.toDataURL(joinUrl(code), { margin: 1, width: 320 })
      .then(setQr)
      .catch(() => setQr(null));   // the code + URL alone are still enough to join
  }, [code]);

  const url = useMemo(() => (code ? joinUrl(code) : ''), [code]);
  const connected = peers.filter((p) => p.connected);

  const retry = () => { setError(null); setCode(''); setQr(null); setAttempt((a) => a + 1); };
  const openPanel = () => { if (error) retry(); setArmed(true); setOpen(true); };

  const showPanel = open ?? (connected.length > 0 && !collapsed);
  if (!showPanel) {
    // The USB line sits under the badge until play starts: plugging a pad in needs no tap at all, only a button press.
    const usbLine = bus && (!collapsed || (justJoined && pads.length > 0)) ? (
      <span
        data-testid="usb-connect-hint"
        className={`rounded-full px-3 py-0.5 text-[10px] ${pads.length ? 'text-[#22d3ee]' : 'text-white/70'}`}
        style={{ background: '#000000aa' }}
      >
        {usbStatusLine(pads)}
      </span>
    ) : null;
    if (error) {
      return (
        <Stack anchor={anchor}>
          <Badge tone="#ffd75e" onClick={openPanel}>CONTROLLER · phone link offline ({error}) · tap to retry</Badge>
          {usbLine}
        </Stack>
      );
    }
    if (armed && code && (collapsed || connected.length > 0)) {
      return (
        <Stack anchor={anchor}>
          <Badge tone={connected.length ? '#22d3ee' : '#6b7280'} onClick={openPanel}>
            {code} · {connected.length}/{config.maxPlayers} connected
            {connected[0]?.rttMs != null ? ` · ${connected[0].rttMs}ms` : ''}
            {display.mode === 'mirrored' ? ' · TV MODE' : ''}
          </Badge>
          {usbLine}
        </Stack>
      );
    }
    return (
      <Stack anchor={anchor}>
        <Badge tone="#00E5FF" onClick={openPanel}>
          CONNECT A CONTROLLER · USB or phone QR{armed && code ? ` · ${code}` : ''}{display.mode === 'mirrored' ? ' · TV MODE' : ''}
        </Badge>
        {usbLine}
      </Stack>
    );
  }

  return (
    <div data-testid="host-lobby-panel" className={`pointer-events-auto absolute ${anchor} z-[45] max-h-[calc(100vh-5rem)] w-[320px] overflow-y-auto rounded-xl border border-white/10 bg-black/80 p-4 font-mono text-xs text-white backdrop-blur`}>
      <div className="flex items-center justify-between">
        <span className="tracking-[0.25em] text-white/40">CONNECT A CONTROLLER</span>
        <span className="flex items-center gap-2 text-white/30">
          {state}
          <button type="button" aria-label="Close controller link" onClick={() => setOpen(false)} className="rounded px-1.5 text-white/60 hover:bg-white/10 hover:text-white">×</button>
        </span>
      </div>

      {/* ① USB — needs no room, so it teaches even when the phone link is down */}
      <section data-testid="usb-connect-help" className="mt-3">
        <p className="font-bold text-white">① {USB_TITLE}</p>
        <Steps steps={USB_STEPS} />
        <p className={`mt-1.5 text-[10px] ${pads.length ? 'text-[#22d3ee]' : 'text-white/45'}`}>
          {bus ? (pads.length ? usbStatusLine(pads) : 'Waiting for a button press…') : ''}
        </p>
      </section>

      {/* ② PHONE — the QR, and how to use it */}
      <section data-testid="qr-connect-help" className="mt-3 border-t border-white/10 pt-3">
        <p className="font-bold text-white">② {PHONE_TITLE}</p>
        {error ? (
          <div className="mt-2 rounded bg-[#ffd75e]/10 px-2 py-2 text-[10px] leading-snug text-[#ffd75e]">
            Phone link offline — {error}.
            <button type="button" data-testid="host-lobby-retry" onClick={retry} className="ml-2 rounded border border-[#ffd75e]/60 px-2 py-0.5 font-bold hover:bg-[#ffd75e]/10">RETRY</button>
          </div>
        ) : (
          <>
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} data-testid="host-lobby-qr" alt={`QR code to join — scan with your phone camera (code ${code})`} className="mx-auto mt-2 h-40 w-40 rounded bg-white p-1" />
            ) : (
              <div className="mx-auto mt-2 grid h-40 w-40 place-items-center rounded border border-white/10 text-[10px] text-white/40">Opening a room…</div>
            )}
            <p className="mt-2 text-center text-3xl font-bold tracking-[0.25em] text-[#00E5FF]">
              {code || '····'}
            </p>
            <Steps steps={PHONE_STEPS} />
            <p className="mt-1.5 break-all text-[10px] text-white/35">{typeInstead(url)}</p>
          </>
        )}
      </section>
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

function Stack({ children, anchor }: { children: React.ReactNode; anchor: string }) {
  return <div className={`pointer-events-none absolute ${anchor} z-[45] flex flex-col items-start gap-1 font-mono`}>{children}</div>;
}

function Steps({ steps }: { steps: readonly string[] }) {
  return (
    <ol className="mt-1.5 space-y-1 text-[10px] leading-snug text-white/75">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-1.5"><span className="text-[#00E5FF]">{i + 1}.</span><span>{s}</span></li>
      ))}
    </ol>
  );
}

function Badge({ children, tone, onClick }: { children: React.ReactNode; tone: string; onClick?: () => void }) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      data-testid="host-lobby-badge"
      onClick={onClick}
      className={`${onClick ? 'pointer-events-auto cursor-pointer hover:bg-white/10' : 'pointer-events-none'} rounded-full border px-3 py-1 font-mono text-[10px]`}
      style={{ borderColor: `${tone}55`, color: tone, background: '#000000aa' }}
    >
      {children}
    </div>
  );
}
