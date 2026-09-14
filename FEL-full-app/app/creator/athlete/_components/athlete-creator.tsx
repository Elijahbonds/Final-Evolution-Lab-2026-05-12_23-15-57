'use client';

// THE CREATOR SHELL (2026-09-14). Spec §1's top-level: sidebar nav, jump anywhere, Finalize gates save.
//
// This file owns THREE things and nothing else: which section is open, the build in progress, and the
// save. Every screen it shows is the one generic editor reading a table out of the schema — there is no
// per-section rendering here, which is the same rule genericScreen.test.ts holds for the editor itself.
//
// SECTIONS WITHOUT ROWS SAY SO. A creator that opens a blank "Ink" page has told the player it is broken;
// one that says "not built yet" has told them the truth, and the truth is cheaper to trust.

import { useCallback, useMemo, useState } from 'react';
import CreatorEditor from '@/components/creator/editor/creator-editor';
import { SIDEBAR } from '@/lib/creator/schema/sections';
import { resolve, type CreatorBuild } from '@/lib/creator/schema/resolve';
import { emptyAthleteProfile, exportProfile, importProfile } from '@/lib/creator/schema/athleteProfile';
import type { RowValue } from '@/lib/creator/editor/rowState';
import type { PrqAxisId } from '@/lib/creator/schema/types';

interface Props {
  /** The athlete's measured axes, resolved server-side. Null for someone with no scan — never a penalty. */
  axes: Partial<Record<PrqAxisId, number>> | null;
  profileId: string;
}

type Values = Record<string, Record<string, RowValue>>;

export default function AthleteCreator({ axes, profileId }: Props) {
  const [openKey, setOpenKey] = useState<string>('attributes');
  const [values, setValues] = useState<Values>({});
  const [note, setNote] = useState<string>('');

  const entry = SIDEBAR.find((s) => s.key === openKey) ?? SIDEBAR[6];

  /** The build, assembled from the per-section maps the editor writes into. */
  const build: CreatorBuild = useMemo(() => ({
    attributes: numeric(values.attributes),
    tendencies: numeric(values.tendencies),
    traits: numeric(values.traits),
    hotZones: strings(values.hotZones),
    mechanics: nullableStrings(values.mechanics),
    prq: axes,
  }), [values, axes]);

  const resolution = useMemo(() => resolve(build), [build]);

  const onChange = useCallback((section: string, rowId: string, next: RowValue) => {
    setValues((v) => ({ ...v, [section]: { ...(v[section] ?? {}), [rowId]: next } }));
  }, []);

  const doExport = useCallback(() => {
    const p = emptyAthleteProfile(profileId, new Date().toISOString());
    p.attributes = build.attributes; p.tendencies = build.tendencies ?? {};
    p.traits = build.traits; p.hot_zones = build.hotZones ?? {};
    p.mechanics = build.mechanics ?? {}; p.prq = axes;
    p.budgets = {
      attribute_points_spent: resolution.budgets.attributePointsSpent,
      trait_points_spent: resolution.budgets.traitPointsSpent,
      hot_zones_spent: resolution.budgets.hotZonePointsSpent,
    };
    // Handed to the player as text rather than a download: the viewer sandbox makes script-driven saves
    // inert, and a button that silently does nothing is worse than a box you can copy from.
    setNote(exportProfile(p));
  }, [build, resolution, axes, profileId]);

  const doImport = useCallback((raw: string) => {
    const r = importProfile(raw);
    setValues({
      attributes: r.profile.attributes as Record<string, RowValue>,
      tendencies: r.profile.tendencies as Record<string, RowValue>,
      traits: r.profile.traits as Record<string, RowValue>,
      hotZones: r.profile.hot_zones as Record<string, RowValue>,
      mechanics: r.profile.mechanics as Record<string, RowValue>,
    });
    setNote(r.notes.join(' ') || 'Loaded.');
  }, []);

  const violations = resolution.issues.filter((i) => i.kind === 'violation').length;

  return (
    <div className="mx-auto flex max-w-6xl gap-3 px-3 py-4">
      {/* sidebar — jump anywhere; Finalize is the only gate */}
      <nav className="w-48 shrink-0">
        {SIDEBAR.map((s) => (
          <button key={s.key} onClick={() => setOpenKey(s.key)}
            className={`mb-0.5 block w-full rounded-lg px-3 py-1.5 text-left font-mono text-[11px] uppercase tracking-wide transition-colors ${
              openKey === s.key ? 'bg-[var(--fel-cyan)] text-black' : s.table ? 'text-white/70 hover:bg-white/5' : 'text-white/25'}`}>
            {s.label}
          </button>
        ))}
        <div className="mt-3 px-3 font-mono text-[10px] text-white/40">
          <p>ATTR {resolution.budgets.attributePointsSpent}/{resolution.budgets.attributePointsCap}</p>
          <p>TRAIT {resolution.budgets.traitPointsSpent}/{resolution.budgets.traitPointsCap}</p>
          <p>ZONES {resolution.budgets.hotZonePointsSpent}/{resolution.budgets.hotZonePointsCap}</p>
          <p className={violations ? 'text-[var(--fel-red)]' : 'text-[var(--fel-emerald)]'}>
            {violations ? `${violations} to fix` : 'VALID'}
          </p>
        </div>
      </nav>

      <main className="min-h-[70vh] flex-1 rounded-2xl bg-white/[0.02]">
        {entry.table ? (
          <CreatorEditor
            table={entry.table}
            values={values[entry.key] ?? {}}
            onChange={(rowId, next) => onChange(entry.key, rowId, next)}
            axes={axes}
            issues={resolution.issues.filter((i) => i.section === entry.key)}
          />
        ) : entry.key === 'export' ? (
          <div className="p-4">
            <button onClick={doExport} className="rounded-xl bg-[var(--fel-cyan)] px-4 py-2 fel-heading text-sm font-bold text-black">Export</button>
            {note && <textarea readOnly value={note} className="mt-3 h-64 w-full rounded-xl bg-black/40 p-3 font-mono text-[10px] text-white/70" />}
          </div>
        ) : entry.key === 'import' ? (
          <div className="p-4">
            <textarea placeholder="Paste an Athlete Profile…" onChange={(e) => e.target.value.trim() && doImport(e.target.value)}
              className="h-64 w-full rounded-xl bg-black/40 p-3 font-mono text-[10px] text-white/70" />
            {note && <p className="mt-2 font-mono text-[11px] text-[var(--fel-gold)]">{note}</p>}
          </div>
        ) : entry.key === 'finalize' ? (
          <div className="p-6">
            <h2 className="fel-heading text-xl font-bold">Finalize</h2>
            <p className="mt-2 font-mono text-xs text-white/60">
              {violations ? `${violations} thing${violations === 1 ? '' : 's'} to fix before this can be saved.` : 'This build is valid.'}
            </p>
            <ul className="mt-3 space-y-1">
              {resolution.issues.map((i, n) => (
                <li key={n} className={`font-mono text-[11px] ${i.kind === 'violation' ? 'text-[var(--fel-red)]' : 'text-[var(--fel-gold)]'}`}>
                  <button onClick={() => setOpenKey(i.section)} className="underline">{i.section}</button> · {i.message}
                </li>
              ))}
            </ul>
            <button disabled={violations > 0}
              className="mt-4 rounded-xl bg-[var(--fel-cyan)] px-5 py-2 fel-heading text-sm font-bold text-black disabled:opacity-30">
              Save Athlete
            </button>
          </div>
        ) : (
          <div className="p-6">
            <h2 className="fel-heading text-xl font-bold">{entry.label}</h2>
            <p className="mt-2 font-mono text-xs text-white/50">Not built yet. The schema layer is in place; this section&rsquo;s rows are not authored.</p>
          </div>
        )}
      </main>
    </div>
  );
}

const numeric = (m?: Record<string, RowValue>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(m ?? {})) if (typeof v === 'number') out[k] = v;
  return out;
};
const strings = (m?: Record<string, RowValue>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(m ?? {})) if (typeof v === 'string') out[k] = v;
  return out;
};
const nullableStrings = (m?: Record<string, RowValue>): Record<string, string | null> => {
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(m ?? {})) if (typeof v === 'string' || v === null) out[k] = v;
  return out;
};
