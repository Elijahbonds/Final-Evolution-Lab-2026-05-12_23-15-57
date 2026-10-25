'use client';

// PilotCapture — the force-plate pilot's capture panel (JUMP-TESTS, 2026-10-25; docs/JUMP-PILOT-PROTOCOL.md). OFF: it
// renders nothing unless the build set NEXT_PUBLIC_JUMP_PILOT_CAPTURE=1 (lib/jump/pilot.ts pilotEnabled), and only on an
// adult's jump result. It logs the live check's trials when it mounts (the jump tests and the slow-mo reader log theirs
// as they read), takes the lab's participant and session codes (never a name) and an optional body mass for the power
// columns, and exports every trial's raw timing as CSV. Page memory only; nothing is stored or sent.
import { useEffect, useRef, useState } from 'react';
import type { T5Extra } from '@/lib/assess/scoring';
import { clearPilot, logCapture, PILOT_CODE, pilotCsv, pilotEnabled, pilotFileName, pilotRows } from '@/lib/jump/pilot';
import { downloadCsv } from '@/lib/csv/download';

export function PilotCapture({ adult, liveT5 = null, enabled = pilotEnabled(), onExport }: { adult: boolean; liveT5?: T5Extra | null; enabled?: boolean; onExport?: (name: string, text: string) => void }) {
  const [participant, setParticipant] = useState('');
  const [session, setSession] = useState('');
  const [mass, setMass] = useState('');
  const [count, setCount] = useState(0);
  const logged = useRef<T5Extra | null>(null);
  useEffect(() => {
    if (!enabled || !adult) return;
    if (liveT5 && logged.current !== liveT5) {
      logged.current = liveT5;
      logCapture({ test: 'check', source: 'live', t5: liveT5, fps: liveT5.poseFps, timeOrigin: typeof performance !== 'undefined' ? performance.timeOrigin : null });
    }
    setCount(pilotRows().length);
    const t = setInterval(() => setCount(pilotRows().length), 1000);
    return () => clearInterval(t);
  }, [enabled, adult, liveT5]);
  if (!enabled || !adult) return null;
  const okCodes = PILOT_CODE.test(participant) && PILOT_CODE.test(session);
  const m = Number(mass);
  const massKg = mass.trim() && Number.isFinite(m) && m >= 35 && m <= 200 ? m : null;
  const exportCsv = () => {
    const name = pilotFileName(participant, session), text = pilotCsv({ participant, session, massKg });
    if (onExport) onExport(name, text); else downloadCsv(name, text);
  };
  return (
    <section data-pilot className="space-y-3 rounded-3xl border border-[#FFB020]/50 bg-[#FFB020]/[0.06] p-5">
      <h2 className="text-[18px] font-black text-white">Pilot capture</h2>
      <p className="text-[16px] leading-snug text-white/75">For the research pilot only. Every trial&apos;s timing on this page, for the lab to line up with its own data. Kept in this page until exported.</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[16px] text-white/75">Participant code
          <input data-pilot-participant value={participant} onChange={(e) => setParticipant(e.target.value.trim())} className="mt-1 min-h-12 w-full rounded-2xl border border-white/20 bg-black/30 px-3 text-[16px] text-white" />
        </label>
        <label className="text-[16px] text-white/75">Session
          <input data-pilot-session value={session} onChange={(e) => setSession(e.target.value.trim())} className="mt-1 min-h-12 w-full rounded-2xl border border-white/20 bg-black/30 px-3 text-[16px] text-white" />
        </label>
      </div>
      <label className="block text-[16px] text-white/75">Body mass, kg (optional, for the power columns; not kept)
        <input data-pilot-mass inputMode="decimal" value={mass} onChange={(e) => setMass(e.target.value)} className="mt-1 min-h-12 w-full rounded-2xl border border-white/20 bg-black/30 px-3 text-[16px] text-white" />
      </label>
      <p data-pilot-count className="text-[16px] text-white/85">{count} trial{count === 1 ? '' : 's'} logged</p>
      {!okCodes ? <p className="text-[16px] text-white/65">Codes: letters, digits, - and _ only. No names.</p> : null}
      <div className="flex gap-2">
        <button type="button" data-pilot-export disabled={!okCodes || !count} onClick={exportCsv} className="min-h-12 flex-1 rounded-2xl bg-white px-4 text-[16px] font-black text-black disabled:opacity-40">Export pilot CSV</button>
        <button type="button" data-pilot-clear disabled={!count} onClick={() => { clearPilot(); logged.current = null; setCount(0); }} className="min-h-12 flex-1 rounded-2xl border border-white/20 px-4 text-[16px] font-bold text-white/85 disabled:opacity-40">Clear</button>
      </div>
    </section>
  );
}
