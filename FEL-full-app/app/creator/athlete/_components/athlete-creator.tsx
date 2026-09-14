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
import dynamic from 'next/dynamic';
import CreatorEditor from '@/components/creator/editor/creator-editor';
import { bindPreview } from '@/lib/creator/editor/previewBinding';

// The preview pulls Babylon in; it must not be in the page's first bundle, and it cannot render on the
// server at all.
const CreatorPreview = dynamic(() => import('@/components/creator/editor/creator-preview'), { ssr: false });
import { SIDEBAR } from '@/lib/creator/schema/sections';
import { resolve, LOOK_SECTIONS, type CreatorBuild } from '@/lib/creator/schema/resolve';
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
  // The name plate is free text, which is not one of the three row kinds — so it lives here rather than
  // becoming a fourth kind that puts a special case in the generic screen.
  const [plate, setPlate] = useState<string>('');

  const entry = SIDEBAR.find((s) => s.key === openKey) ?? SIDEBAR[6];

  /** The build, assembled from the per-section maps the editor writes into. */
  const build: CreatorBuild = useMemo(() => ({
    attributes: numeric(values.attributes),
    tendencies: numeric(values.tendencies),
    traits: numeric(values.traits),
    hotZones: strings(values.hotZones),
    mechanics: nullableStrings(values.mechanics),
    // The cosmetic sections go in under one key, the way the resolver walks them — the shell does not
    // name Vitals or Gear individually, so a new one appears here without this file being edited.
    look: Object.fromEntries(Object.keys(LOOK_SECTIONS).map((k) => [k, values[k] ?? {}])),
    prq: axes,
  }), [values, axes]);

  const resolution = useMemo(() => resolve(build), [build]);

  // §10 step 6: the preview CONSUMES the build. It is derived here, once, and handed down — the editor
  // screen renders whatever node it is given and knows nothing about Babylon.
  const binding = useMemo(() => bindPreview(values, plate), [values, plate]);

  const onChange = useCallback((section: string, rowId: string, next: RowValue) => {
    setValues((v) => ({ ...v, [section]: { ...(v[section] ?? {}), [rowId]: next } }));
  }, []);

  const doExport = useCallback(() => {
    const p = emptyAthleteProfile(profileId, new Date().toISOString());
    p.attributes = build.attributes; p.tendencies = build.tendencies ?? {};
    p.traits = build.traits; p.hot_zones = build.hotZones ?? {};
    p.mechanics = build.mechanics ?? {}; p.prq = axes;
    p.vitals = values.vitals ?? {}; p.appearance = values.appearance ?? {}; p.body = values.body ?? {};
    // Accessories rides in `gear`: the profile has no separate field for it, both sections are wearable
    // slots keyed by row id, and the ids are unique across the two — so the merge is lossless and the
    // alternative is a schema bump for one row.
    p.gear = { ...(values.gear ?? {}), ...(values.accessories ?? {}) };
    p.vitals = { ...p.vitals, namePlate: binding.jersey.name };
    p.budgets = {
      attribute_points_spent: resolution.budgets.attributePointsSpent,
      trait_points_spent: resolution.budgets.traitPointsSpent,
      hot_zones_spent: resolution.budgets.hotZonePointsSpent,
    };
    // Handed to the player as text rather than a download: the viewer sandbox makes script-driven saves
    // inert, and a button that silently does nothing is worse than a box you can copy from.
    setNote(exportProfile(p));
  }, [build, resolution, axes, profileId, values, binding]);

  const doImport = useCallback((raw: string) => {
    const r = importProfile(raw);
    setValues({
      attributes: r.profile.attributes as Record<string, RowValue>,
      tendencies: r.profile.tendencies as Record<string, RowValue>,
      traits: r.profile.traits as Record<string, RowValue>,
      hotZones: r.profile.hot_zones as Record<string, RowValue>,
      mechanics: r.profile.mechanics as Record<string, RowValue>,
      vitals: r.profile.vitals as Record<string, RowValue>,
      appearance: r.profile.appearance as Record<string, RowValue>,
      body: r.profile.body as Record<string, RowValue>,
      // Split back out by asking each table which ids are its own, rather than by remembering the merge.
      gear: pick(r.profile.gear, LOOK_SECTIONS.gear.rows.map((x) => x.id)),
      accessories: pick(r.profile.gear, LOOK_SECTIONS.accessories.rows.map((x) => x.id)),
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

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {/* IDENTITY HEADER (§1). The name plate is free text and therefore not a schema row — putting it
            here is what keeps the editor three row kinds wide. It is sanitised by the closet's own
            sanitizeJersey before it reaches the preview, so what is on the hero's back is what saves. */}
        <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
          <label htmlFor="plate" className="font-mono text-[10px] uppercase tracking-widest text-white/40">Name plate</label>
          <input id="plate" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="SURNAME"
            maxLength={12} className="w-40 rounded-lg bg-black/40 px-2 py-1 font-mono text-xs uppercase text-white placeholder:text-white/25" />
          <span className="font-mono text-[10px] text-white/35">{binding.jersey.name || '—'} · #{binding.jersey.number}</span>
        </div>

      <main className="min-h-[70vh] flex-1 rounded-2xl bg-white/[0.02]">
        {entry.table ? (
          <CreatorEditor
            table={entry.table}
            values={values[entry.key] ?? {}}
            onChange={(rowId, next) => onChange(entry.key, rowId, next)}
            axes={axes}
            issues={resolution.issues.filter((i) => i.section === entry.key)}
            preview={<CreatorPreview binding={binding} />}
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
            <p className="mt-2 max-w-prose font-mono text-xs leading-relaxed text-white/50">
              {entry.reason ?? 'Not built yet. The schema layer is in place; this section’s rows are not authored.'}
            </p>
          </div>
        )}
      </main>
      </div>
    </div>
  );
}

/** The entries of `m` whose keys are in `ids` — how a merged section is split back apart on import. */
const pick = (m: Record<string, unknown>, ids: string[]): Record<string, RowValue> => {
  const out: Record<string, RowValue> = {};
  for (const id of ids) {
    const v = m?.[id];
    if (typeof v === 'string' || typeof v === 'number' || v === null) out[id] = v;
  }
  return out;
};

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
