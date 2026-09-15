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
import QRCode from 'qrcode';
import { HostSession } from '@/lib/controller-link/host';
import { joinUrl } from '@/lib/controller-link/codes';
import { controllerConfigFor } from '@/lib/controller-link/schemas/registry';
import { HostPresence, presenceSummary, type PresenceReport } from '@/lib/controller-link/presence';
import { readDisplaySetting, writeDisplaySetting, displayBanner, MIRROR_FACTOR, type DisplaySetting } from '@/lib/controller-link/tvMode';
import { LinkDebugOverlay } from './link-debug-overlay';
import { linkErrorText } from '@/lib/controller-link/transport/signaling';
import { PHONE_STEPS, typeInstead } from '@/lib/controller-link/connectHelp';
import type { LobbyPeer } from '@/lib/controller-link/types';

export function HostStage({ modeId }: { modeId: string }) {
  const config = useMemo(() => controllerConfigFor(modeId), [modeId]);
  const [started, setStarted] = useState(false);
  const [code, setCode] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [peers, setPeers] = useState<LobbyPeer[]>([]);
  const [presence, setPresence] = useState<PresenceReport | null>(null);
  const [display, setDisplay] = useState<DisplaySetting>({ mode: 'direct', factor: 1, chosen: false });
  const [showDebug, setShowDebug] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);   // a failed room retries on a tap, not a reload
  const sessionRef = useRef<HostSession | null>(null);
  const presenceRef = useRef(new HostPresence());
  const stageRef = useRef<HTMLDivElement | null>(null);

  // the guess needs the browser, so it is read after mount rather than during render
  useEffect(() => {
    setDisplay(readDisplaySetting({
      userAgent: navigator.userAgent,
      touchPoints: navigator.maxTouchPoints,
      width: window.innerWidth,
      height: window.innerHeight,
    }));
  }, []);

  useEffect(() => {
    if (!started || !config) return;
    let disposed = false;
    const session = new HostSession({
      config,
      onInput: () => { /* the schema layer: the mounted mode's own bridge consumes these */ },
      onPadInput: () => { /* the binary relay: likewise, once a mode is mounted on this stage */ },
      onLobby: setPeers,
    });
    sessionRef.current = session;
    session.start().then((c) => { if (!disposed) setCode(c); }).catch((e) => { if (!disposed) setError(linkErrorText(e)); });
    return () => { disposed = true; session.dispose(); sessionRef.current = null; };
  }, [started, config, attempt]);

  useEffect(() => {
    if (!code) return;
    QRCode.toDataURL(joinUrl(code), { margin: 1, width: 420 }).then(setQr).catch(() => setQr(null));
  }, [code]);

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

  const setMode = useCallback((mode: 'direct' | 'mirrored') => {
    writeDisplaySetting(mode, mode === 'mirrored' ? MIRROR_FACTOR : 1);
    setDisplay(readDisplaySetting());
  }, []);

  const panel: React.CSSProperties = {
    background: 'rgba(8,10,16,0.82)', border: '1px solid #26304a', borderRadius: 14, padding: '18px 20px',
  };

  if (!config) {
    return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#05070c', color: '#cfd6e4' }}>
      <p style={{ font: '400 15px system-ui' }}>No controller layout for “{modeId}”.</p>
    </main>;
  }

  return (
    <main ref={stageRef} style={{ minHeight: '100vh', background: '#05070c', color: '#eef2f8', display: 'grid', placeItems: 'center', padding: 24 }}>
      {!started ? (
        <div style={{ ...panel, textAlign: 'center', maxWidth: 520 }}>
          <h1 style={{ margin: '0 0 6px', font: '700 26px system-ui', letterSpacing: 1 }}>{config.title.toUpperCase()}</h1>
          <p style={{ margin: '0 0 18px', color: '#8A94A6', font: '400 14px/1.5 system-ui' }}>
            This screen shows the game. Everyone plays on their phone — up to {config.maxPlayers}.
          </p>
          <button
            onClick={start}
            style={{ padding: '14px 28px', borderRadius: 12, border: 'none', background: '#00E5FF', color: '#04202a', cursor: 'pointer', font: '700 16px system-ui', letterSpacing: 1 }}
          >START THE SCREEN</button>
          <p style={{ margin: '14px 0 0', color: '#6b7280', font: '400 12px/1.5 system-ui' }}>
            Goes fullscreen and keeps the screen awake.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 18, justifyItems: 'center' }}>
          <div style={{ ...panel, display: 'grid', gap: 12, justifyItems: 'center' }}>
            <h2 style={{ margin: 0, font: '700 20px system-ui', letterSpacing: 1 }}>JOIN ON YOUR PHONE</h2>
            {qr && <img src={qr} data-testid="host-stage-qr" alt={`QR code to join — scan with your phone camera (code ${code})`} width={260} height={260} style={{ borderRadius: 10, background: '#fff', padding: 8 }} />}
            <p style={{ margin: 0, font: '700 34px ui-monospace, monospace', letterSpacing: 8 }}>{code || '······'}</p>
            <ol data-testid="qr-connect-help" style={{ margin: 0, padding: '0 0 0 20px', color: '#cfd6e4', font: '400 14px/1.6 system-ui', textAlign: 'left' }}>
              {PHONE_STEPS.map((s) => <li key={s}>{s}</li>)}
            </ol>
            <p style={{ margin: 0, color: '#8A94A6', font: '400 13px system-ui' }}>{code ? typeInstead(joinUrl(code)) : joinUrl('XXXXXX')}</p>
            {error && (
              <p style={{ margin: 0, color: '#ffd75e', font: '400 13px system-ui' }}>
                Phone link offline — {error}.{' '}
                <button onClick={() => { setError(null); setCode(''); setQr(null); setAttempt((a) => a + 1); }}
                  style={{ marginLeft: 6, padding: '4px 10px', borderRadius: 8, border: '1px solid #ffd75e88', background: 'transparent', color: '#ffd75e', cursor: 'pointer', font: '700 12px system-ui' }}>RETRY</button>
              </p>
            )}
          </div>

          <div style={{ ...panel, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
            <span style={{ font: '400 13px system-ui', color: '#8A94A6' }}>{displayBanner(display)}</span>
            <button onClick={() => setMode(display.mode === 'mirrored' ? 'direct' : 'mirrored')}
              style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid #33384a', background: 'transparent', color: '#cfd6e4', cursor: 'pointer', font: '600 12px system-ui' }}>
              {display.mode === 'mirrored' ? 'TURN OFF TV MODE' : 'TURN ON TV MODE'}
            </button>
            <button onClick={() => setShowDebug((v) => !v)}
              style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid #33384a', background: 'transparent', color: '#8A94A6', cursor: 'pointer', font: '600 12px system-ui' }}>
              {showDebug ? 'HIDE LINK STATS' : 'LINK STATS'}
            </button>
          </div>

          <p style={{ margin: 0, color: '#6b7280', font: '400 12px/1.5 system-ui', maxWidth: 520, textAlign: 'center' }}>
            {presence ? presenceSummary(presence) : ''}
            {presence?.notes.length ? ` · ${presence.notes.join(' ')}` : ''}
          </p>

          <p style={{ margin: 0, color: '#8A94A6', font: '400 13px system-ui' }}>
            {peers.filter((p) => p.connected).length} of {config.maxPlayers} connected
          </p>
        </div>
      )}

      {showDebug && sessionRef.current && (
        <LinkDebugOverlay
          stats={() => sessionRef.current!.padStats()}
          peers={peers}
          onClose={() => setShowDebug(false)}
        />
      )}
    </main>
  );
}
