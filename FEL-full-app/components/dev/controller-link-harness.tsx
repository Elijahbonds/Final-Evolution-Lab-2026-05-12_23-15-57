'use client';

// Dev host harness for Controller Link.
//
// Exists because every /play/* route is auth-gated, so the real host page can't
// be exercised without a database. This mounts the SAME HostSession + HostLobby
// the game host uses, so it tests the actual transport rather than a mock:
// room creation, WebRTC offer/answer, data-channel open, input delivery,
// reconnect, and the round-trip measurement.

import { useCallback, useRef, useState } from 'react';
import { HostLobby } from '@/components/controller-link/host-lobby';
import { controllerConfigFor } from '@/lib/controller-link/schemas/registry';
import type { ControlEvent } from '@/lib/controller-link/types';

interface LogRow { t: number; slot: number; action: string; payload: string; latency: number }

export default function ControllerLinkHarness() {
  const [log, setLog] = useState<LogRow[]>([]);
  const [stats, setStats] = useState<{ n: number; min: number; max: number; mean: number; p95: number } | null>(null);
  const samples = useRef<number[]>([]);

  const config = controllerConfigFor('threepoint');

  const onInput = useCallback((ev: ControlEvent, slot: number) => {
    // One-way latency: phone stamped ev.t at send, we are reading it on arrival.
    // Clocks are not synchronised between devices, so treat this as indicative
    // for same-machine testing and rely on the lobby's ping/pong RTT for the
    // real cross-device number.
    const latency = Date.now() - ev.t;
    samples.current.push(latency);
    if (samples.current.length > 500) samples.current.shift();

    const s = [...samples.current].sort((a, b) => a - b);
    setStats({
      n: s.length,
      min: s[0],
      max: s[s.length - 1],
      mean: Math.round(s.reduce((a, b) => a + b, 0) / s.length),
      p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))],
    });

    setLog((prev) => [
      { t: Date.now(), slot, action: ev.a, payload: JSON.stringify(ev.p ?? null), latency },
      ...prev,
    ].slice(0, 40));
  }, []);

  if (!config) return <p className="p-8 text-white">No controller config for &quot;threepoint&quot;.</p>;

  return (
    <div className="relative min-h-screen bg-[#07090d] p-6 font-mono text-xs text-white">
      <h1 className="text-lg font-bold text-[#00E5FF]">Controller Link — dev harness</h1>
      <p className="mt-1 text-white/40">
        Scan the QR (or open the URL on another device on this network) to join as a controller.
      </p>

      <HostLobby config={config} onInput={onInput} />

      <section className="mt-6 max-w-md rounded-lg border border-white/10 bg-black/40 p-4">
        <h2 className="text-white/50">INPUT LATENCY (phone send → host receive)</h2>
        {stats ? (
          <div className="mt-2 grid grid-cols-5 gap-2 text-center">
            {(['n', 'min', 'mean', 'p95', 'max'] as const).map((k) => (
              <div key={k}>
                <div className="text-white/40">{k}</div>
                <div className="text-lg text-[#22d3ee]">{stats[k]}{k === 'n' ? '' : 'ms'}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-white/30">No inputs yet.</p>
        )}
        <p className="mt-3 text-[10px] leading-relaxed text-white/30">
          Cross-device clocks are not synchronised, so this figure is only exact when both
          ends are the same machine. For a real phone, read the RTT in the lobby panel —
          that is measured by ping/pong over the same data channel and needs no shared clock.
        </p>
      </section>

      <section className="mt-4 max-w-2xl">
        <h2 className="text-white/50">EVENTS</h2>
        <ul className="mt-2 space-y-1">
          {log.map((r, i) => (
            <li key={i} className="flex gap-4 text-white/70">
              <span className="text-white/30">{new Date(r.t).toLocaleTimeString()}</span>
              <span className="text-[#ffd75e]">P{r.slot + 1}</span>
              <span className="text-[#00E5FF]">{r.action}</span>
              <span className="text-white/40">{r.payload}</span>
              <span className="ml-auto text-white/30">{r.latency}ms</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
