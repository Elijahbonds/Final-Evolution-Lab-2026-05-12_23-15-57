'use client';

// SpeedApp — /train/speed: sprint speed by camera (SPRINT-SPEED, 2026-10-25; owner: "measure sprint speed by camera",
// camera only, no accuracy claim until a validation pilot).
//
//   1. the test: a sprint to a line (one phone on the finish line), a flying 10/20 (two lines in one frame), a speed
//      trace (side-on, top speed and the Samozino profile) or the 5-10-5 (beta)
//   2. its settings and the setup diagram (where the phone goes), then components/sprint/sprint-runner.tsx: the camera,
//      the taps, the run
//   3. the result (every number an estimate with its ±), kept ON THIS PHONE with the history, and a CSV of it
//
// The page (app/train/speed/page.tsx) mounts this only for a verified adult.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, Trash2 } from 'lucide-react';
import { BODY_POINTS, BODY_POINT_LABEL, type BodyPointKind } from '@/lib/sprint/geometry';
import { YD } from '@/lib/sprint/cameraSprint';
import { toRecord, type RunConfig, type RunResult, type StartMode } from '@/lib/sprint/session';
import { clearRuns, keepRun, readRuns, runStorage, runsCsv, TEST_LABEL, type SprintRecord, type SprintTest } from '@/lib/sprint/store';
import { lastComparable } from '@/lib/results/sprint';
import { timeWithBand, speedWithBand } from '@/lib/sprint/copy';
import { csvFileName } from '@/lib/csv/csv';
import { downloadCsv } from '@/lib/csv/download';
import { SprintRunner, type RunBase } from './sprint-runner';
import { RunResultCard } from './run-result';
import { SetupDiagram, SETUP_STEPS } from './setup-diagram';

const TESTS: SprintTest[] = ['gate', 'flying', 'trace', 'agility'];
const GATE_DISTANCES: { id: string; label: string; m: number }[] = [
  { id: '10yd', label: '10 yd', m: 10 * YD }, { id: '20yd', label: '20 yd', m: 20 * YD }, { id: '40yd', label: '40 yd', m: 40 * YD },
  { id: '10m', label: '10 m', m: 10 }, { id: '20m', label: '20 m', m: 20 }, { id: '30m', label: '30 m', m: 30 }, { id: '60m', label: '60 m', m: 60 },
];
const num = (s: string): number | null => { const n = Number(s.replace(',', '.')); return s.trim() && Number.isFinite(n) ? n : null; };

function Chip({ on, onClick, children, data }: { on: boolean; onClick: () => void; children: React.ReactNode; data?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} data-sprint-chip={data}
      className={`min-h-10 rounded-lg border px-3 text-sm font-bold ${on ? 'border-[#00E5FF] bg-[#00E5FF]/15 text-[#00E5FF]' : 'border-white/15 text-white/70'}`}>{children}</button>
  );
}

export function SpeedApp({ adult = true }: { adult?: boolean }) {
  const [test, setTest] = useState<SprintTest>('gate');
  const [gateDist, setGateDist] = useState('40yd');
  const [start, setStart] = useState<StartMode>('go');
  const [point, setPoint] = useState<BodyPointKind>('torso');
  const [flyM, setFlyM] = useState('10');
  const [camM, setCamM] = useState('');
  const [traceStart, setTraceStart] = useState<StartMode | 'none'>('movement');
  const [useMarkers, setUseMarkers] = useState(true);
  const [markerM, setMarkerM] = useState('20');
  const [heightCm, setHeightCm] = useState('');
  const [massKg, setMassKg] = useState('');
  const [last, setLast] = useState<RunResult | null>(null);
  const [runs, setRuns] = useState<SprintRecord[]>([]);
  const [kept, setKept] = useState<boolean | null>(null);
  // PLAT-P03: the last comparable run on this phone, read BEFORE this one is kept (the card's arrow)
  const [prior, setPrior] = useState<SprintRecord | null>(null);
  useEffect(() => { setRuns(readRuns(runStorage())); }, []);

  const base: RunBase = useMemo(() => {
    if (test === 'gate') {
      const d = GATE_DISTANCES.find((x) => x.id === gateDist) ?? GATE_DISTANCES[2];
      return { test, label: d.label, distanceM: d.m, start, point };
    }
    if (test === 'flying') { const m = num(flyM) ?? 10; return { test, label: `Flying ${m} m`, distanceM: m, cameraM: num(camM), point }; }
    if (test === 'trace') {
      const h = num(heightCm);
      return { test, label: 'Speed trace', start: traceStart, useMarkers, markerM: num(markerM) ?? 20, startAtOrigin: true, statureM: h ? h / 100 : null, massKg: adult ? num(massKg) : null };
    }
    return { test, label: '5-10-5', start };
  }, [test, gateDist, start, point, flyM, camM, traceStart, useMarkers, markerM, heightCm, massKg, adult]);

  const onResult = useCallback((r: RunResult, cfg: RunConfig) => {
    setLast(r);
    if (!r.ok) { setKept(null); return; }
    const store = runStorage();
    setPrior(lastComparable(readRuns(store), r));
    const ok = keepRun(store, toRecord(r, cfg));
    setKept(ok);
    setRuns(readRuns(store));
  }, []);

  const exportCsv = () => { downloadCsv(csvFileName('sprint-times'), runsCsv(runs)); };

  // PLAT-P03: a result is the screen. The card comes first; the set-up, the settings and the history fold away until
  // "Run it again" (the runner stays mounted, so the camera and the tapped lines are still there for the next run).
  const showing = !!last;
  const again = () => setLast(null);

  return (
    <div className="space-y-4" data-speed-app data-sprint-showing={showing ? 'result' : 'setup'}>
      {last && <RunResultCard result={last} last={prior} onAgain={again} />}
      {last?.ok && kept !== null && <p className="text-center text-xs text-white/50" data-sprint-kept={kept ? 'device' : 'none'}>{kept ? 'Kept in your history on this phone.' : 'Could not keep it on this phone (storage is off).'}</p>}

      <div className={`space-y-4 ${showing ? 'hidden' : ''}`}>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Test">
        {TESTS.map((t) => <Chip key={t} on={test === t} onClick={() => { setTest(t); setLast(null); }} data={`test:${t}`}>{TEST_LABEL[t]}{t === 'agility' ? ' (beta)' : ''}</Chip>)}
      </div>

      <section className="fel-card space-y-3 rounded-xl p-4" data-sprint-setup>
        <SetupDiagram test={test} />
        <ol className="list-decimal space-y-1 pl-5 text-sm text-white/75">{SETUP_STEPS[test].map((s) => <li key={s}>{s}</li>)}</ol>
      </section>

      <section className="fel-card space-y-3 rounded-xl p-4" data-sprint-settings>
        {test === 'gate' && (
          <>
            <div className="text-xs font-semibold text-white/60">Distance</div>
            <div className="flex flex-wrap gap-2">{GATE_DISTANCES.map((d) => <Chip key={d.id} on={gateDist === d.id} onClick={() => setGateDist(d.id)} data={`dist:${d.id}`}>{d.label}</Chip>)}</div>
          </>
        )}
        {(test === 'gate' || test === 'agility') && (
          <>
            <div className="text-xs font-semibold text-white/60">Start</div>
            <div className="flex flex-wrap gap-2">
              <Chip on={start === 'go'} onClick={() => setStart('go')} data="start:go">The phone says Go</Chip>
              <Chip on={start === 'movement'} onClick={() => setStart('movement')} data="start:movement">First movement (start in view)</Chip>
            </div>
          </>
        )}
        {(test === 'gate' || test === 'flying') && (
          <>
            <div className="text-xs font-semibold text-white/60">Timed on</div>
            <div className="flex flex-wrap gap-2">{BODY_POINTS.map((p) => <Chip key={p} on={point === p} onClick={() => setPoint(p)} data={`point:${p}`}>{BODY_POINT_LABEL[p]}</Chip>)}</div>
          </>
        )}
        {test === 'flying' && (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-white/60">Lines apart (m)<input inputMode="decimal" value={flyM} onChange={(e) => setFlyM(e.target.value)} data-sprint-fly-m className="mt-1 min-h-11 w-full rounded-lg border border-white/15 bg-black/40 px-3 text-base text-white" /></label>
            <label className="text-xs text-white/60">Phone to lane (m, optional)<input inputMode="decimal" value={camM} onChange={(e) => setCamM(e.target.value)} placeholder="e.g. 15" className="mt-1 min-h-11 w-full rounded-lg border border-white/15 bg-black/40 px-3 text-base text-white placeholder:text-white/30" /></label>
          </div>
        )}
        {test === 'trace' && (
          <>
            <div className="text-xs font-semibold text-white/60">Start</div>
            <div className="flex flex-wrap gap-2">
              <Chip on={traceStart === 'movement'} onClick={() => setTraceStart('movement')} data="tstart:movement">From still, in view</Chip>
              <Chip on={traceStart === 'go'} onClick={() => setTraceStart('go')} data="tstart:go">The phone says Go</Chip>
              <Chip on={traceStart === 'none'} onClick={() => setTraceStart('none')} data="tstart:none">Already running</Chip>
            </div>
            <div className="text-xs font-semibold text-white/60">Scale</div>
            <div className="flex flex-wrap gap-2">
              <Chip on={useMarkers} onClick={() => setUseMarkers(true)} data="scale:markers">Two markers (best)</Chip>
              <Chip on={!useMarkers} onClick={() => setUseMarkers(false)} data="scale:height">The athlete&apos;s height</Chip>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {useMarkers && <label className="text-xs text-white/60">Markers apart (m)<input inputMode="decimal" value={markerM} onChange={(e) => setMarkerM(e.target.value)} data-sprint-marker-m className="mt-1 min-h-11 w-full rounded-lg border border-white/15 bg-black/40 px-3 text-base text-white" /></label>}
              <label className="text-xs text-white/60">Height (cm{useMarkers ? ', optional' : ''})<input inputMode="decimal" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} data-sprint-height className="mt-1 min-h-11 w-full rounded-lg border border-white/15 bg-black/40 px-3 text-base text-white" /></label>
              {adult && <label className="text-xs text-white/60">Body mass (kg, optional, never kept)<input inputMode="decimal" value={massKg} onChange={(e) => setMassKg(e.target.value)} data-sprint-mass className="mt-1 min-h-11 w-full rounded-lg border border-white/15 bg-black/40 px-3 text-base text-white" /></label>}
            </div>
          </>
        )}
      </section>

      <SprintRunner base={base} onResult={onResult} />

      <section className="fel-card space-y-2 rounded-xl p-4" data-sprint-history>
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-white">History <span className="font-normal text-white/45">(this phone)</span></div>
          <div className="flex gap-2">
            <button type="button" onClick={exportCsv} disabled={!runs.length} data-sprint-csv className="flex min-h-10 items-center gap-1.5 rounded-lg border border-white/20 px-3 text-xs font-bold text-white disabled:opacity-40"><Download className="h-3.5 w-3.5" /> CSV</button>
            <button type="button" onClick={() => { if (window.confirm('Clear every run kept on this phone?')) { clearRuns(runStorage()); setRuns([]); } }} disabled={!runs.length} aria-label="Clear history" className="flex min-h-10 items-center rounded-lg border border-white/20 px-3 text-white/70 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        {runs.length === 0 ? <p className="text-sm text-white/50">No runs yet.</p> : (
          <ul className="divide-y divide-white/10" data-sprint-history-list>
            {runs.slice(0, 30).map((r) => (
              <li key={r.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate text-white/80">{r.label} <span className="text-white/40">· {new Date(r.at).toLocaleDateString()}</span></span>
                <span className="shrink-0 font-mono tabular-nums text-white">{r.timeS !== null ? timeWithBand(r.timeS, r.sdS) : r.topSpeed !== null ? speedWithBand(r.topSpeed, r.topSpeedSd) : '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
      <p className="text-center text-xs text-white/40"><Link href="/train" className="underline">Back to Train</Link></p>
    </div>
  );
}
