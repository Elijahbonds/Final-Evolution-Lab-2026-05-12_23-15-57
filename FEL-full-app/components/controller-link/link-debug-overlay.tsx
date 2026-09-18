'use client';
// THE DEBUG OVERLAY — "measure and expose round-trip latency" (mission Phase B).
//
// What it shows and, more importantly, what it refuses to show. Three numbers are genuinely measurable from
// a browser and one is not:
//
//   RTT is real — the control channel pings and the pad pongs, so the round trip is measured against ONE
//     clock. This is the number the acceptance criterion is about ("input-to-render under 50ms").
//   FPS is real — frames counted over a wall-clock span on the receiving side.
//   DROPS are real — frames the sequence gate rejected as out of order, over frames accepted.
//   ONE-WAY LATENCY IS NOT. Two devices' clocks are not synchronised, so a frame's timestamp minus "now"
//     carries their offset, which can be seconds. What survives the offset is the JITTER — how much that
//     difference moves — so that is what is shown, labelled as jitter.
//
// A number labelled "latency" that is actually a clock offset is worse than no number at all: it would send
// someone debugging their WiFi for an hour.

import React, { useEffect, useState } from 'react';
import type { LinkStats } from '@/lib/controller-link/hostInput';
import type { LobbyPeer } from '@/lib/controller-link/types';

export interface LinkDebugOverlayProps {
  /** Polled — the stats live inside the session, not in React state. */
  stats: () => LinkStats;
  peers: LobbyPeer[];
  /** Hz. The overlay is a debug tool; it does not need to be smooth. */
  rate?: number;
  onClose?: () => void;
}

/** The bar the acceptance criterion sets: input-to-render under 50 ms on local WiFi. */
export const RTT_TARGET_MS = 50;

export function LinkDebugOverlay({ stats, peers, rate = 4, onClose }: LinkDebugOverlayProps) {
  const [s, setS] = useState<LinkStats>({ accepted: 0, dropped: 0, dropRate: 0, jitterMs: 0, fps: 0, activeSlots: [] });

  useEffect(() => {
    const id = setInterval(() => setS(stats()), Math.max(100, 1000 / rate));
    return () => clearInterval(id);
  }, [stats, rate]);

  const rtts = peers.map((p) => p.rttMs).filter((x): x is number => typeof x === 'number');
  const worstRtt = rtts.length ? Math.max(...rtts) : null;
  const ok = worstRtt !== null && worstRtt <= RTT_TARGET_MS;

  const cell: React.CSSProperties = { padding: '2px 0', font: '400 11px/1.4 ui-monospace, monospace' };

  return (
    <div style={{
      position: 'fixed', right: 10, bottom: 10, zIndex: 60, minWidth: 232,
      padding: '10px 12px', borderRadius: 10, background: 'rgba(8,10,16,0.88)',
      border: '1px solid #26304a', color: '#cfd6e4', pointerEvents: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <strong style={{ font: '600 11px ui-monospace, monospace', letterSpacing: 0.6 }}>LINK</strong>
        <span style={{ flex: 1 }} />
        {onClose && <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer', font: '600 11px ui-monospace' }}>×</button>}
      </div>

      <div style={cell}>
        round trip{' '}
        <strong style={{ color: worstRtt === null ? '#6b7280' : ok ? '#7CE577' : '#ffd75e' }}>
          {worstRtt === null ? '—' : `${worstRtt} ms`}
        </strong>
        <span style={{ color: '#6b7280' }}> / {RTT_TARGET_MS} target</span>
      </div>
      <div style={cell}>jitter <strong>{s.jitterMs} ms</strong> <span style={{ color: '#6b7280' }}>(one-way is a clock offset, not a measurement)</span></div>
      <div style={cell}>frames <strong>{s.fps}/s</strong> · accepted {s.accepted}</div>
      <div style={cell}>
        out of order{' '}
        <strong style={{ color: s.dropRate > 0.05 ? '#ffd75e' : '#cfd6e4' }}>{(s.dropRate * 100).toFixed(1)}%</strong>
        <span style={{ color: '#6b7280' }}> ({s.dropped})</span>
      </div>
      <div style={cell}>pads <strong>{s.activeSlots.length ? s.activeSlots.map((n) => `P${n + 1}`).join(' ') : '—'}</strong></div>

      {peers.length > 0 && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #1c2334' }}>
          {peers.map((p) => (
            <div key={p.peerId} style={cell}>
              {p.slot === null ? '—' : `P${p.slot + 1}`} {p.name || 'player'}{' '}
              <span style={{ color: p.connected ? '#7CE577' : '#8A94A6' }}>{p.connected ? 'on' : 'off'}</span>{' '}
              <span style={{ color: '#6b7280' }}>{p.rttMs === null ? '' : `${p.rttMs} ms`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
