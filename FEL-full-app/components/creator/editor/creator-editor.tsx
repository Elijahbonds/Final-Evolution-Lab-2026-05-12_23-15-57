'use client';

// ONE SCREEN, EVERY SECTION (2026-09-14). Spec §10 step 2, and §1's global UI contract.
//
// "Generic editor screen component — tab strip, row list, stepper control, preview pane, glossary modal.
// Every section above is a config of this one component."
//
// The test of that claim is that this file contains NO branch on which section it is rendering. It reads a
// SectionTable, derives the tab strip from the rows, and asks `rowState` what a row displays and what a
// step does to it. Attributes, traits and animation slots all arrive here as the same shape. If a section
// ever needs a special case in this file, the abstraction the spec asked for has stopped being true.
//
// The per-kind edge cases live in `lib/creator/editor/rowState.ts` because they have real behaviour worth
// testing (a trait stepping off its first tier UNEQUIPS; a rated row cannot pass its PRQ ceiling) and a
// rule inside a React handler cannot be unit-tested without mounting a component.

import { useMemo, useState, useCallback } from 'react';
import type { AnyRow, SectionTable } from '@/lib/creator/schema/types';
import { tabsOf, rowsOfTab } from '@/lib/creator/schema/types';
import { step, canStep, displayValue, rowCeiling, type RowValue, type Axes } from '@/lib/creator/editor/rowState';
import type { Issue } from '@/lib/creator/schema/resolve';

export interface CreatorEditorProps {
  table: SectionTable;
  /** row id → value. Whatever the section stores; the component never interprets it. */
  values: Record<string, RowValue>;
  onChange: (rowId: string, next: RowValue) => void;
  /** The athlete's measured axes, for PRQ ceilings. Null for a guest — which is never a penalty. */
  axes?: Axes;
  /** From `resolve()`. Rendered BESIDE the row it names, never as a wall of text at the top. */
  issues?: Issue[];
  /** The live 3D preview. Passed in rather than built here: §10 says preview binding is a consumer. */
  preview?: React.ReactNode;
  onBack?: () => void;
}

export default function CreatorEditor({ table, values, onChange, axes, issues = [], preview, onBack }: CreatorEditorProps) {
  const tabs = useMemo(() => tabsOf(table), [table]);
  const [tabIdx, setTabIdx] = useState(0);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [glossaryFor, setGlossaryFor] = useState<AnyRow | null>(null);

  const tab = tabs[Math.min(tabIdx, tabs.length - 1)] ?? '';
  const rows = useMemo(() => {
    const all = rowsOfTab(table, tab);
    const q = filter.trim().toLowerCase();
    return q ? all.filter((r) => r.label.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)) : all;
  }, [table, tab, filter]);

  // Issues are indexed by row so each complaint renders next to the control that caused it. A validation
  // list at the top of a long form is a list nobody reads.
  const issueFor = useMemo(() => {
    const m = new Map<string, Issue[]>();
    for (const i of issues) m.set(i.rowId, [...(m.get(i.rowId) ?? []), i]);
    return m;
  }, [issues]);

  const page = useCallback((d: -1 | 1) => {
    setTabIdx((i) => Math.max(0, Math.min(tabs.length - 1, i + d)));
    setFocusId(null);
  }, [tabs.length]);

  const bump = useCallback((row: AnyRow, d: -1 | 1) => {
    const next = step(row, values[row.id] ?? null, d, axes);
    if (next !== (values[row.id] ?? null)) onChange(row.id, next);
  }, [values, axes, onChange]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 text-white">
      {/* breadcrumb + title (§1) */}
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-white/40">/{table.section}</p>
        <h2 className="fel-heading text-2xl font-bold">{table.title}</h2>
      </div>

      {/* tab strip: bumper paging, dot indicator, filter (§1) */}
      <div className="flex items-center gap-2">
        <button onClick={() => page(-1)} disabled={tabIdx === 0}
          className="fel-panel px-2 py-1 font-mono text-xs disabled:opacity-30" aria-label="Previous tab">L</button>
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-1">
            {tabs.map((t, i) => (
              <button key={t} onClick={() => { setTabIdx(i); setFocusId(null); }}
                className={`whitespace-nowrap rounded-lg px-3 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors ${
                  i === tabIdx ? 'bg-[var(--fel-cyan)] text-black' : 'fel-panel text-white/70'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => page(1)} disabled={tabIdx >= tabs.length - 1}
          className="fel-panel px-2 py-1 font-mono text-xs disabled:opacity-30" aria-label="Next tab">R</button>
        <span className="font-mono text-[10px] text-white/40">{tabIdx + 1}/{tabs.length}</span>
      </div>

      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…"
        className="fel-panel w-full rounded-lg px-3 py-1.5 font-mono text-xs text-white placeholder:text-white/30" />

      <div className="flex min-h-0 flex-1 gap-3">
        {/* the row list — one renderer, three row kinds */}
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {rows.length === 0 && <p className="px-2 py-6 font-mono text-xs text-white/40">Nothing matches that filter.</p>}
          {rows.map((row) => {
            const focused = focusId === row.id;
            const val = values[row.id] ?? null;
            const cap = rowCeiling(row, axes);
            const rowIssues = issueFor.get(row.id) ?? [];
            const bad = rowIssues.some((i) => i.kind === 'violation');
            return (
              <div key={row.id} onClick={() => setFocusId(row.id)}
                className={`mb-1 rounded-xl px-3 py-2 transition-colors ${
                  focused ? 'bg-white/10 ring-1 ring-[var(--fel-cyan)]/60' : 'bg-white/[0.03]'} ${bad ? 'ring-1 ring-[var(--fel-red)]/70' : ''}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[11px] uppercase tracking-wide text-white/70">{row.label}</p>
                    {cap !== null && cap < 99 && (
                      <p className="font-mono text-[9px] text-white/35">ceiling {cap}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {focused && (
                      <button onClick={(e) => { e.stopPropagation(); bump(row, -1); }}
                        disabled={!canStep(row, val, -1, axes)}
                        className="fel-panel h-7 w-7 font-mono text-sm disabled:opacity-25" aria-label={`Decrease ${row.label}`}>◀</button>
                    )}
                    <span className={`min-w-[7ch] text-right fel-stat font-mono text-sm ${bad ? 'text-[var(--fel-red)]' : ''}`}>
                      {displayValue(row, val)}
                    </span>
                    {focused && (
                      <button onClick={(e) => { e.stopPropagation(); bump(row, 1); }}
                        disabled={!canStep(row, val, 1, axes)}
                        className="fel-panel h-7 w-7 font-mono text-sm disabled:opacity-25" aria-label={`Increase ${row.label}`}>▶</button>
                    )}
                  </div>
                </div>
                {/* the complaint sits with the control that caused it */}
                {rowIssues.map((i, n) => (
                  <p key={n} className={`mt-1 font-mono text-[10px] ${i.kind === 'violation' ? 'text-[var(--fel-red)]' : 'text-[var(--fel-gold)]'}`}>
                    {i.message}
                  </p>
                ))}
                {focused && (
                  <button onClick={(e) => { e.stopPropagation(); setGlossaryFor(row); }}
                    className="mt-1 font-mono text-[10px] text-[var(--fel-cyan)]/70 underline">What does this do?</button>
                )}
              </div>
            );
          })}
        </div>

        {/* live preview pane — a consumer of everything else, never a dependency of it (§10 step 6) */}
        {preview && <div className="hidden w-[38%] shrink-0 overflow-hidden rounded-xl bg-black/30 md:block">{preview}</div>}
      </div>

      {/* footer hint bar (§1) */}
      <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-wide text-white/45">
        <span>Rotate</span><span>·</span><span>Select</span>
        {focusId && <><span>·</span><span>Glossary</span></>}
        <span>·</span>
        <button onClick={onBack} className="underline">Back</button>
      </div>

      {/* glossary modal — every row carries its text (§6), tiers included where there are tiers */}
      {glossaryFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setGlossaryFor(null)}>
          <div className="fel-panel max-w-md rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="fel-heading text-lg font-bold">{glossaryFor.label}</h3>
            <p className="mt-2 text-sm text-white/80">{glossaryFor.glossary}</p>
            {glossaryFor.kind === 'trait' && (
              <ul className="mt-3 space-y-1">
                {glossaryFor.tiers.map((t, i) => (
                  <li key={t} className="font-mono text-[11px] text-white/60">
                    <span className="text-[var(--fel-gold)]">{t}</span> · {glossaryFor.tierText[i]} · {glossaryFor.cost[i]} pts
                  </li>
                ))}
              </ul>
            )}
            <button onClick={() => setGlossaryFor(null)} className="mt-4 w-full rounded-xl bg-[var(--fel-cyan)] px-4 py-2 fel-heading text-sm font-bold text-black">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
