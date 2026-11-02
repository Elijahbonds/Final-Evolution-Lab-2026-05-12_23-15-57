'use client';

// ProgressView — My progress (/train/progress; PLAT-P03, 2026-10-28): one row per measure, the latest number, the arrow
// against the one before it (that tool's own band, lib/results) and a six-point sparkline. Tap a row: its history.
//
// SOURCES: the saved rows the server read (a verified adult who opted in; lib/results/progressServer.ts), the copies
// this phone keeps (read here, once, on mount: the jump history, the sprint runs, the bar-speed sets, the readiness
// days), and the athlete's combines (re-test history, TRY-08).
//
// THIS PAGE WRITES NOTHING: no fetch, no storage write, no send. It reads localStorage and draws (tests/plat-p03 hold
// the source to it, and the rig's fetch spy counts 0 writes).
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, ChevronDown, Minus } from 'lucide-react';
import { Sparkline } from '@/components/profile-v2/sparkline';
import { PrimaryCta } from '@/components/ui/fel/primary-cta';
import { loadJumps } from '@/lib/jump/historyStore';
import { reachStorage } from '@/lib/jump/reachStore';
import { readRuns, runStorage } from '@/lib/sprint/store';
import { readDeviceSets, deviceStorage as vbtStorage } from '@/lib/vbt/sets';
import { readDeviceHistory, deviceStorage as readinessStorage } from '@/lib/coach/readiness/deviceHistory';
import { byNewest, combineRows, deviceJumpRows, readinessRow, savedJumpRow, sprintRows, vbtRows, type ProgressRow } from '@/lib/results/progress';
import type { SavedProgress } from '@/lib/results/progressServer';
import { PROGRESS_COPY } from '@/lib/results/copy';
import { JUMP_CHECK_HREF } from '@/lib/profile-v2/tiles';
import { LOOK } from './look';

interface DeviceCopies { rows: ProgressRow[] }

/** Everything this phone keeps, as rows. Reads only; any storage error reads as nothing kept. */
export function deviceRows(): ProgressRow[] {
  const safe = <T,>(f: () => T, empty: T): T => { try { return f(); } catch { return empty; } };
  const days = safe(() => readDeviceHistory(readinessStorage()), []);
  return [
    ...safe(() => deviceJumpRows(loadJumps(reachStorage())), []),
    ...safe(() => sprintRows(readRuns(runStorage())), []),
    ...safe(() => vbtRows(readDeviceSets(vbtStorage()), 'device'), []),
    ...safe(() => { const r = readinessRow(days.map((d) => ({ day: d.day, bestCm: d.bestCm, band: d.band, belowReal: d.belowReal })), 'device'); return r ? [r] : []; }, []),
  ];
}

/** The rows from what the server read. */
export function savedRows(saved: SavedProgress): ProgressRow[] {
  const jump = savedJumpRow(saved.jumps);
  const ready = readinessRow(saved.readiness, 'account');
  return [...(jump ? [jump] : []), ...(ready ? [ready] : []), ...vbtRows(saved.sets, 'account'), ...combineRows(saved.combines.events)];
}

const SOURCE_WORDS: Record<ProgressRow['source'], string> = { account: PROGRESS_COPY.saved, device: PROGRESS_COPY.device, combine: PROGRESS_COPY.combine };
const day = (at: number) => new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function VsIcon({ vs }: { vs: ProgressRow['vsLast'] }) {
  const I = vs === 'up' ? ArrowUpRight : vs === 'down' ? ArrowDownRight : Minus;
  return <I aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2.5} />;
}

function tone(r: Pick<ProgressRow, 'vsLast' | 'better'>): string {
  if (r.vsLast === null || r.vsLast === 'same') return LOOK.same;
  return r.vsLast === r.better ? LOOK.better : LOOK.worse;
}

function Row({ row, open, onToggle }: { row: ProgressRow; open: boolean; onToggle: () => void }) {
  return (
    <li data-progress-row={row.key} data-source={row.source} data-vs={row.vsLast ?? 'none'} className={LOOK.row}>
      <button type="button" aria-expanded={open} onClick={onToggle} className={LOOK.rowButton}>
        <span className="min-w-0 flex-1 text-left">
          <span className={LOOK.measure}>{row.measure}</span>
          <span className={LOOK.source}>{SOURCE_WORDS[row.source]}</span>
          <span className={`${LOOK.vs} ${tone(row)}`} data-progress-vs>
            <VsIcon vs={row.vsLast} />{row.vsLine ?? day(row.latestAt)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className={LOOK.latest}><span data-progress-latest>{row.latest}</span> <span className={LOOK.unit}>{row.unit}</span></span>
          <span className="w-24"><Sparkline values={row.spark} color="#00E5FF" height={28} width={96} label={`${row.measure}: the last ${row.spark.length}`} /></span>
        </span>
        <ChevronDown aria-hidden className={`h-5 w-5 shrink-0 text-fel-dim transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <ol data-progress-history className={LOOK.history}>
          {row.history.map((h, i) => (
            <li key={`${h.at}-${i}`} className={LOOK.historyRow}>
              <span className="text-fel-dim">{day(h.at)}</span>
              <span className="flex items-center gap-1.5 font-bold text-white">
                <span className={tone({ vsLast: h.vs, better: row.better })}><VsIcon vs={h.vs} /></span>
                {h.value} {row.unit}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}

export function ProgressView({ saved }: { saved: SavedProgress }) {
  const [device, setDevice] = useState<DeviceCopies | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  // the phone's copies, read once after the page arrives (localStorage exists only here)
  useEffect(() => { setDevice({ rows: deviceRows() }); }, []);
  const rows = useMemo(() => byNewest([...savedRows(saved), ...(device?.rows ?? [])]), [saved, device]);

  if (device && !rows.length) {
    return (
      <div data-progress="empty" className="fel-surface flex flex-col items-center gap-4 px-6 py-8 text-center">
        <p className={LOOK.emptyLine}>{PROGRESS_COPY.empty}</p>
        <PrimaryCta href={JUMP_CHECK_HREF} prefetch={false}>{PROGRESS_COPY.emptyCta}</PrimaryCta>
      </div>
    );
  }
  return (
    <div data-progress={device ? rows.length : 'loading'} className="space-y-3">
      <ul className="space-y-3">
        {rows.map((r) => <Row key={r.key} row={r} open={open === r.key} onToggle={() => setOpen(open === r.key ? null : r.key)} />)}
      </ul>
      {!saved.combines.available ? <p data-progress-combine-soon className={LOOK.foot}>{PROGRESS_COPY.combineSoon}</p> : null}
      <p className={LOOK.foot}>{PROGRESS_COPY.privacy} <Link href="/train" className="underline">Train</Link></p>
    </div>
  );
}
