'use client';

// CombineReport — the ranked report (COMBINE-DAY, 2026-10-25): the composite board (percentile within this group,
// equal weights by default, the coach's weights on top), a ranked table per station, a card per athlete, CSV made on
// this phone, and a print view. Seen by the coach only (each athlete sees their own numbers on /train/combine); there is
// no public ranking page. Camera numbers are estimates and say so; no ± and no accuracy claim (owner, until the
// force-plate pilot).
import { useMemo } from 'react';
import { Download, Minus, Plus, Printer } from 'lucide-react';
import { STATIONS, formatValue, stationName } from '@/lib/combine/catalogue';
import { NO_ACCURACY_LINE, WHO_SEES_LINE, say } from '@/lib/combine/copy';
import { combineCsv, csvFileName } from '@/lib/combine/csv';
import { setWeights } from '@/lib/combine/draft';
import { compositeTable, ordinal, stationTable, WEIGHT_MAX, WEIGHT_STEP } from '@/lib/combine/score';
import type { CombineEvent } from '@/lib/combine/types';

/** Hand the CSV to the browser as a download: a Blob URL on this page, nothing sent anywhere. */
export function downloadCsv(ev: CombineEvent, doc: Document = document): void {
  const url = URL.createObjectURL(new Blob([combineCsv(ev)], { type: 'text/csv;charset=utf-8' }));
  const a = doc.createElement('a');
  a.href = url;
  a.download = csvFileName(ev);
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const pctBar = (p: number | null) => (
  <span className="block h-1.5 w-full overflow-hidden rounded-full bg-white/10" aria-hidden>
    <span className="block h-full rounded-full bg-[#00E5FF]" style={{ width: `${p ?? 0}%` }} />
  </span>
);

export function CombineReport({ ev, onChange, onBack }: { ev: CombineEvent; onChange: (ev: CombineEvent) => void; onBack: () => void }) {
  const board = useMemo(() => compositeTable(ev, ev.weights), [ev]);
  const tables = useMemo(() => new Map(ev.stations.map((s) => [s.id, stationTable(ev, s)])), [ev]);
  const weight = (id: string, d: number) => onChange(setWeights(ev, { ...ev.weights, [id]: (ev.weights[id] ?? 1) + d }));
  const who = say(WHO_SEES_LINE);

  return (
    <div className="space-y-5 print:space-y-3" data-combine-report>
      <div className="flex items-center justify-between gap-2 print:hidden">
        <button type="button" onClick={onBack} className="text-xs font-bold text-white/55 underline">Back to the run</button>
        <div className="flex gap-2">
          <button type="button" onClick={() => downloadCsv(ev)} data-combine-csv className="flex min-h-10 items-center gap-1 rounded-lg border border-white/20 px-3 text-xs font-bold text-white/85"><Download className="h-4 w-4" /> CSV</button>
          <button type="button" onClick={() => window.print()} className="flex min-h-10 items-center gap-1 rounded-lg border border-white/20 px-3 text-xs font-bold text-white/85"><Printer className="h-4 w-4" /> Print</button>
        </div>
      </div>
      <header>
        <h2 className="text-2xl font-black text-white">{ev.name}</h2>
        <p className="text-xs text-white/50">{new Date(ev.createdAt).toLocaleDateString()}{ev.teamName ? ` · ${ev.teamName}` : ''} · {board.length} athletes · {ev.stations.length} stations</p>
      </header>

      <section className="fel-card space-y-3 rounded-xl p-4 print:hidden" data-combine-weights>
        <h3 className="text-sm font-bold uppercase tracking-wide text-white">Weights</h3>
        <p className="text-xs text-white/50">Each station counts by its weight in the composite. Equal by default; 0 leaves a station out.</p>
        <ul className="space-y-2">
          {ev.stations.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm text-white/85">{stationName(s)}</span>
              <button type="button" onClick={() => weight(s.id, -WEIGHT_STEP)} disabled={(ev.weights[s.id] ?? 1) <= 0} aria-label={`Less weight on ${stationName(s)}`} className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 text-white/70 disabled:opacity-30"><Minus className="h-4 w-4" /></button>
              <span className="w-10 text-center font-mono text-sm font-bold text-white" data-combine-weight={s.id}>×{ev.weights[s.id] ?? 1}</span>
              <button type="button" onClick={() => weight(s.id, WEIGHT_STEP)} disabled={(ev.weights[s.id] ?? 1) >= WEIGHT_MAX} aria-label={`More weight on ${stationName(s)}`} className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 text-white/70 disabled:opacity-30"><Plus className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      </section>

      <section className="fel-card rounded-xl p-4" data-combine-composite>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-white">Composite</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wider text-white/40"><th className="w-10 py-1">#</th><th>Athlete</th><th className="text-right">Score</th><th className="w-14 text-right">Done</th></tr></thead>
          <tbody>
            {board.map((r) => (
              <tr key={r.id} className="border-t border-white/5" data-combine-row={r.id}>
                <td className="py-2 font-black text-white">{r.rank ?? '–'}</td>
                <td className="py-2 font-bold text-white">{r.name}{!r.complete && r.composite !== null && <span className="ml-1.5 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/60">incomplete</span>}</td>
                <td className="py-2 text-right font-mono font-bold tabular-nums text-[#00E5FF]">{r.composite ?? '—'}</td>
                <td className="py-2 text-right text-xs text-white/50">{r.done}/{r.of}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-white/40">Score = the weighted average of each athlete’s percentile within this group (100 = best here). An athlete missing a station is shown, not ranked.</p>
      </section>

      {ev.stations.map((s) => (
        <section key={s.id} className="fel-card rounded-xl p-4 print:break-inside-avoid" data-combine-table={s.id}>
          <h3 className="mb-2 text-sm font-bold text-white">{stationName(s)} <span className="font-normal text-white/45">· best of {s.attempts}</span></h3>
          <table className="w-full text-sm">
            <tbody>
              {tables.get(s.id)!.map((r) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="w-10 py-1.5 font-black text-white">{r.rank ?? '–'}</td>
                  <td className="py-1.5 text-white/90">{r.name}</td>
                  <td className="py-1.5 text-right font-mono font-bold tabular-nums text-white">{formatValue(s.kind, r.value)}{r.touchCm != null && <span className="block text-[10px] font-normal text-white/50">touch {formatValue('approach', r.touchCm)}</span>}</td>
                  <td className="hidden w-32 py-1.5 pl-3 text-right font-mono text-[11px] text-white/45 sm:table-cell">{r.slots.map((x) => (x ? (x.value === null ? 'X' : formatValue(s.kind, x.value).replace(/ (in|s)$/, '')) : '·')).join(' / ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <section className="space-y-2" data-combine-cards>
        <h3 className="text-sm font-bold uppercase tracking-wide text-white">Athlete cards</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {board.map((r) => (
            <article key={r.id} className="fel-card space-y-2 rounded-xl p-4 print:break-inside-avoid" data-combine-card={r.id}>
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="truncate text-lg font-black text-white">{r.name}</h4>
                <span className="shrink-0 text-xs text-white/55">{r.rank ? `${ordinal(r.rank)} of ${board.filter((x) => x.rank !== null).length}` : r.composite !== null ? 'incomplete' : 'not tested'}</span>
              </div>
              <ul className="space-y-1.5">
                {ev.stations.map((s) => {
                  const row = tables.get(s.id)!.find((x) => x.id === r.id);
                  if (!row) return null;
                  const of = tables.get(s.id)!.filter((x) => x.rank !== null).length;
                  return (
                    <li key={s.id}>
                      <div className="flex justify-between gap-2 text-xs"><span className="truncate text-white/70">{stationName(s)}</span><span className="shrink-0 font-mono font-bold text-white">{formatValue(s.kind, row.value)}{row.rank ? ` · ${ordinal(row.rank)}/${of}` : ''}</span></div>
                      {pctBar(row.pct)}
                    </li>
                  );
                })}
              </ul>
              {r.composite !== null && <p className="text-xs text-white/55">Composite <b className="text-white">{r.composite}</b></p>}
            </article>
          ))}
        </div>
      </section>

      <p className="text-[11px] text-white/40">{NO_ACCURACY_LINE} {ev.stations.some((s) => STATIONS[s.kind].method === 'hand') ? 'Sprint and agility times are hand-timed by the coach.' : ''}</p>
      {who && <p className="text-[11px] text-white/40" data-combine-who>{who}</p>}
    </div>
  );
}
