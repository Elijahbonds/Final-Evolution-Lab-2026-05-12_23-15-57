'use client';

// The Closet's Shape tab (IMPROVE (2026-10-06), CREATOR-PLAN phase 4b, shape v2): proportions, bulk and the Studio size,
// each a slider with a typed value, with the tab's own Randomise and a lock per section. Pure presentation: every change
// goes back to the Closet, which records it on the selected character's undo history (a drag is one step, by its group).
//
// What the player is told matches what the game does (lib/creator/look/shape.ts): head, neck, hands, feet and bulk show
// in every mode; legs, torso and shoulders show in casual modes and play at 1.0 in ranked and fixed-frame modes; the
// Studio size shows only here and in photos.

import type { ReactNode } from 'react';
import { Lock, Redo2, Shuffle, Undo2, Unlock } from 'lucide-react';
import {
  FRAME_KEYS, GIRTH_KEYS, GIRTH_RANGE, PRESENTATION_RANGE, PROPORTION_RANGES, REACH_SAFE_KEYS,
  type CreatorShape, type GirthKey, type ProportionKey,
} from '@/lib/creator/look/doc';
import { SHAPE_RANDOM_FIELDS, SHAPE_RANDOM_SECTIONS, type ShapeRandomSection } from '@/lib/creator/look/randomise';
import { NumSlider } from './parts-tab';

export const PROPORTION_LABEL: Record<ProportionKey, string> = {
  head: 'Head', neck: 'Neck', hands: 'Hands', feet: 'Feet', legs: 'Legs', torso: 'Torso', shoulders: 'Shoulders',
};
export const GIRTH_LABEL: Record<GirthKey, string> = {
  head: 'Head', neck: 'Neck', chest: 'Chest', belly: 'Belly', upperArms: 'Upper arms', forearms: 'Forearms', thighs: 'Thighs', calves: 'Calves',
};

export interface ShapeTabProps {
  shape: CreatorShape;
  /** the slot's Studio size (null: 1) */
  presentation: number | null;
  /** a drag passes a group, so the whole drag is one undo step */
  onShape: (next: CreatorShape, group?: string) => void;
  onPresentation: (scale: number | null, group?: string) => void;
  locks: readonly ShapeRandomSection[];
  onLocks: (next: ShapeRandomSection[]) => void;
  onRoll: () => void;
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void;
  /** false: the numbers stay on this device (the adult's numbers opt-in is off, or a teen) */
  numbersSaved: boolean;
}

function Section({ title, note, onReset, children }: { title: string; note: string; onReset?: () => void; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">{title}</h3>
        {onReset && <button type="button" onClick={onReset} className="text-[11px] text-cyan-300/80 hover:text-cyan-200">Reset</button>}
      </div>
      <p className="mb-2 text-[10px] leading-snug text-white/40">{note}</p>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

export function ShapeTab(p: ShapeTabProps) {
  const body = (k: ProportionKey) => p.shape.body[k] ?? 1;
  const girth = (k: GirthKey) => p.shape.girth?.[k] ?? 1;
  const setBody = (k: ProportionKey, v: number) => p.onShape({ ...p.shape, body: { ...p.shape.body, [k]: v } }, `shape:${k}`);
  const setGirth = (k: GirthKey, v: number) => p.onShape({ ...p.shape, girth: { ...(p.shape.girth ?? {}), [k]: v } }, `bulk:${k}`);
  const resetBody = (keys: readonly ProportionKey[]) => {
    const next = { ...p.shape.body };
    for (const k of keys) delete next[k];
    p.onShape({ ...p.shape, body: next });
  };
  const resetGirth = () => { const { girth: _g, ...rest } = p.shape; void _g; p.onShape(rest); };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <button type="button" onClick={p.onUndo} disabled={!p.canUndo} aria-label="Undo" title="Undo (Ctrl+Z)"
          className="flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-white/80 transition hover:bg-white/10 disabled:opacity-30"><Undo2 className="h-3.5 w-3.5" /> Undo</button>
        <button type="button" onClick={p.onRedo} disabled={!p.canRedo} aria-label="Redo" title="Redo (Shift+Ctrl+Z)"
          className="flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-white/80 transition hover:bg-white/10 disabled:opacity-30"><Redo2 className="h-3.5 w-3.5" /> Redo</button>
        <button type="button" onClick={p.onRoll} disabled={p.locks.length === SHAPE_RANDOM_SECTIONS.length} aria-label="Randomise shape"
          className="flex items-center gap-1 rounded-lg bg-cyan-400/15 px-2.5 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/25 disabled:opacity-30"><Shuffle className="h-3.5 w-3.5" /> Randomise shape</button>
        <div className="flex flex-wrap gap-1.5">
          {SHAPE_RANDOM_SECTIONS.map((sec) => {
            const on = p.locks.includes(sec);
            return (
              <button key={sec} type="button" title={`${on ? 'Locked' : 'Unlocked'}: ${SHAPE_RANDOM_FIELDS[sec]}`} aria-pressed={on}
                onClick={() => p.onLocks(on ? p.locks.filter((x) => x !== sec) : [...p.locks, sec])}
                className="flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] capitalize transition"
                style={{ borderColor: on ? '#FFD700' : 'rgba(255,255,255,0.12)', color: on ? '#FFD700' : 'rgba(255,255,255,0.6)' }}>
                {on ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />} {sec}
              </button>
            );
          })}
        </div>
      </div>

      <Section title="Proportions" note="Head, neck, hands and feet show in every mode, ranked included — looks only, your reach never changes." onReset={() => resetBody(REACH_SAFE_KEYS)}>
        {REACH_SAFE_KEYS.map((k) => (
          <NumSlider key={k} label={PROPORTION_LABEL[k]} value={body(k)} min={PROPORTION_RANGES[k][0]} max={PROPORTION_RANGES[k][1]} step={0.01} onChange={(v) => setBody(k, v)} />
        ))}
      </Section>

      <Section title="Frame" note="Legs, torso and shoulders move where your hands sit, so they stay small, and ranked and fixed-frame modes play every body at 1.0." onReset={() => resetBody(FRAME_KEYS)}>
        {FRAME_KEYS.map((k) => (
          <NumSlider key={k} label={PROPORTION_LABEL[k]} value={body(k)} min={PROPORTION_RANGES[k][0]} max={PROPORTION_RANGES[k][1]} step={0.005} onChange={(v) => setBody(k, v)} />
        ))}
      </Section>

      <Section title="Bulk" note="Thicker or thinner per body part; your clothes follow. Looks only, in every mode." onReset={resetGirth}>
        {GIRTH_KEYS.map((k) => (
          <NumSlider key={k} label={GIRTH_LABEL[k]} value={girth(k)} min={GIRTH_RANGE[0]} max={GIRTH_RANGE[1]} step={0.01} onChange={(v) => setGirth(k, v)} />
        ))}
      </Section>

      <Section title="Studio size" note="Giant or tiny, shown here and in photos only. Every mode plays you at fair size." onReset={() => p.onPresentation(null)}>
        <NumSlider label="Size" value={p.presentation ?? 1} min={PRESENTATION_RANGE[0]} max={PRESENTATION_RANGE[1]} step={0.01}
          onChange={(v) => p.onPresentation(v, 'presentation')} />
      </Section>
      {!p.numbersSaved && <p className="text-[10px] leading-snug text-white/40">Shape numbers stay on this device unless you allow saving look numbers.</p>}
    </div>
  );
}
