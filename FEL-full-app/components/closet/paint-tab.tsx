'use client';

// The Closet's PAINT tab (IMPROVE (2026-10-06), docs/CREATOR-PLAN.md phase 3): a layer stack painted onto the body —
// fills per region, patterns, stamps and text — and suit mode, which hides the clothes so the paint is the outfit.
// Every edit goes through the Closet's undo history (a slider drag is one step) into the Creator doc, and the preview
// redraws only what changed on the next frame, through the same identity pipe the game uses. The full Studio (stickers
// dragged onto the body, on-model handles) is phase 4; these controls stay as its precise fallback.

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, FlipHorizontal, Paintbrush, Plus, Redo2, Shirt, Trash2, Undo2 } from 'lucide-react';
import { PAINT_BLENDS, PAINT_SURFACES, RANGES, type PaintLayer, type PaintPattern, type PaintRegion, type PaintStamp, type PaintSurface, type PaintType } from '@/lib/creator/look/doc';
import {
  BLEND_LABELS, PAINT_BUDGET, PATTERN_LABELS, PATTERN_ORDER, REGION_GROUPS, REGION_LABELS, STAMP_LABELS, STAMP_ORDER, SURFACE_LABELS, TYPE_LABELS,
  addMarkLayer, duplicateLayer, fitsMarkBudget, fitsPaintBudget, layerName, moveLayer, newLayer, redrawMark, removeLayer, suitBase, toggleHidden,
  updateLayer, usedMarks, weightLabel,
} from '@/lib/creator/look/paint';
import { sanitizeStampText } from '@/lib/creator/look/sanitize';
import { MAX_MARKS, decodeMark, discMark, type CreatorMark } from '@/lib/creator/look/marks';
import { MarkPad } from './mark-pad';
import { HexField, NumSlider, SliderGroup } from './parts-tab';

export interface PaintTabProps {
  layers: readonly PaintLayer[];
  suit: boolean;
  /** Write the doc's paint layers. `group` coalesces a drag into one undo step. */
  onChange: (next: PaintLayer[], group?: string) => void;
  /** Suit mode on/off, with the layers it comes with (a base fill when turning it on over bare skin): one undo step. */
  onSuit: (on: boolean, layers: PaintLayer[]) => void;
  /** The colour a new layer starts in. */
  accent: string;
  /** Phase 4c: the doc's player-drawn stamps, and a write of layers and marks together (one undo step). */
  marks?: readonly CreatorMark[];
  onMarks?: (paint: PaintLayer[], marks: CreatorMark[], group?: string) => void;
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void;
}

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const TYPES: readonly PaintType[] = ['fill', 'pattern', 'stamp', 'text', 'mark'];
/** What each colour does, per layer type. */
const COLOUR_ROLES: Record<PaintType, readonly string[]> = {
  fill: ['Colour'],
  pattern: ['Ink', 'Ground', 'Accent'],
  stamp: ['Fill', 'Outline', 'Detail'],
  text: ['Letters', 'Outline'],
  mark: ['Fill', 'Outline'],
};
const SECOND = '#111111', THIRD = '#FFFFFF';

export function PaintTab({ layers, suit, onChange, onSuit, accent, marks, onMarks, canUndo, canRedo, onUndo, onRedo }: PaintTabProps) {
  const [selectedId, setSelectedId] = useState<string | null>(layers[layers.length - 1]?.id ?? null);
  const selected = useMemo(() => layers.find((l) => l.id === selectedId) ?? null, [layers, selectedId]);
  const colour = HEX6.test(accent) ? accent.toUpperCase() : '#00E5FF';
  const full = !fitsPaintBudget(layers);

  const add = (type: PaintType) => {
    if (type === 'mark') {
      // a drawn stamp starts as a disc on the chest, to draw on or erase from (its pad opens below)
      const made = onMarks ? addMarkLayer(layers, marks, discMark(), [colour, SECOND]) : null;
      if (!made) return;
      onMarks!(made.paint, made.marks);
      setSelectedId(made.id);
      return;
    }
    const l = newLayer(layers, type, type === 'pattern' ? [colour, SECOND] : type === 'stamp' || type === 'text' ? [colour, SECOND] : [colour]);
    if (!l) return;
    onChange([...layers, l]);
    setSelectedId(l.id);
  };
  const edit = (patch: Partial<Omit<PaintLayer, 'id'>>, group?: string) => {
    if (!selected) return;
    onChange(updateLayer(layers, selected.id, patch), group ? `paint:${selected.id}:${group}` : undefined);
  };
  const setAt = (k: keyof PaintLayer['at'], v: number) => { if (selected && Number.isFinite(v)) edit({ at: { ...selected.at, [k]: v } }, `at.${k}`); };
  const setColour = (i: number, hex: string, group?: string) => {
    if (!selected) return;
    const next = [...selected.colours]; next[i] = hex.toUpperCase();
    edit({ colours: next }, group);
  };
  const roles = selected ? COLOUR_ROLES[selected.type] : [];
  const wl = selected ? weightLabel(selected) : null;
  const placed = selected && (selected.type === 'stamp' || selected.type === 'text' || selected.type === 'mark');
  const selectedMark = selected?.type === 'mark' ? marks?.find((m) => m.id === selected.mark) ?? null : null;
  const markCells = useMemo(() => (selectedMark ? decodeMark(selectedMark.data) : null), [selectedMark]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <div className="min-w-[140px] flex-1">
          <div className="flex items-center justify-between text-[11px] text-white/60">
            <span className="flex items-center gap-1"><Paintbrush className="h-3.5 w-3.5 text-cyan-400" /> Paint layers</span>
            <span className="tabular-nums" aria-label="layers used">{layers.length} / {PAINT_BUDGET}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full transition-all" style={{ width: `${(100 * layers.length) / PAINT_BUDGET}%`, backgroundColor: full ? '#FF3366' : '#00E5FF' }} />
          </div>
          <p className="mt-1 text-[10px] text-white/35">The top of the list paints over the layers under it.</p>
        </div>
        <button type="button" onClick={onUndo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)"
          className="flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-white/80 transition hover:bg-white/10 disabled:opacity-30"><Undo2 className="h-3.5 w-3.5" /> Undo</button>
        <button type="button" onClick={onRedo} disabled={!canRedo} aria-label="Redo" title="Redo (Shift+Ctrl+Z)"
          className="flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-white/80 transition hover:bg-white/10 disabled:opacity-30"><Redo2 className="h-3.5 w-3.5" /> Redo</button>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-xs transition"
        style={{ borderColor: suit ? '#00E5FF' : 'rgba(255,255,255,0.1)', backgroundColor: suit ? 'rgba(0,229,255,0.07)' : 'rgba(255,255,255,0.02)' }}>
        <input type="checkbox" checked={suit} aria-label="Suit mode" className="mt-0.5 accent-cyan-400"
          onChange={(e) => onSuit(e.target.checked, e.target.checked ? suitBase(layers, colour) : [...layers])} />
        <span>
          <span className="flex items-center gap-1 font-semibold text-white/85"><Shirt className="h-3.5 w-3.5" /> Suit mode</span>
          <span className="text-white/50">Hides your clothes and paints the whole body — a skin-tight suit, a full-head mask and a chest emblem are all paint. Parts stay on.</span>
        </span>
      </label>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-white/80">Add a layer</h3>
        <div className="grid grid-cols-5 gap-1.5">
          {TYPES.map((t) => (
            <button key={t} type="button" disabled={full || (t === 'mark' && (!onMarks || !fitsMarkBudget(marks)))} onClick={() => add(t)} title={t === 'mark' ? `Draw your own stamp (up to ${MAX_MARKS})` : `Add a ${TYPE_LABELS[t].toLowerCase()} layer`}
              className="flex items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[11px] text-white/80 transition hover:border-cyan-400/50 hover:bg-cyan-400/10 disabled:opacity-30">
              <Plus className="h-3 w-3 text-cyan-300/80" /> {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-white/80">Layers</h3>
        {layers.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-white/40">No paint yet. Add a fill, a pattern, a stamp or text above — or switch on suit mode and paint the whole body.</p>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-y-auto pr-1" aria-label="Paint layers">
            {[...layers].reverse().map((l, ri) => {
              const on = l.id === selectedId;
              const top = ri === 0, bottom = ri === layers.length - 1;
              return (
                <li key={l.id}>
                  <div role="button" tabIndex={0} onClick={() => setSelectedId(l.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedId(l.id); }}
                    aria-pressed={on}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition"
                    style={{ borderColor: on ? '#00E5FF' : 'rgba(255,255,255,0.08)', backgroundColor: on ? 'rgba(0,229,255,0.08)' : 'rgba(255,255,255,0.02)', opacity: l.hidden ? 0.5 : 1 }}>
                    <span className="flex shrink-0 -space-x-1">
                      {l.colours.map((c, i) => <span key={i} className="h-3.5 w-3.5 rounded-full border border-white/20" style={{ backgroundColor: c }} />)}
                    </span>
                    <span className="flex-1 truncate text-white/85">{layerName(l)}</span>
                    {l.mirror && <FlipHorizontal className="h-3 w-3 text-cyan-300/80" aria-label="mirrored" />}
                    <IconBtn label={`${l.hidden ? 'Show' : 'Hide'} ${layerName(l)}`} onClick={() => onChange(toggleHidden(layers, l.id))}>{l.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</IconBtn>
                    <IconBtn label={`Move ${layerName(l)} up`} disabled={top} onClick={() => onChange(moveLayer(layers, l.id, 1))}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
                    <IconBtn label={`Move ${layerName(l)} down`} disabled={bottom} onClick={() => onChange(moveLayer(layers, l.id, -1))}><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
                    <IconBtn label={`Duplicate ${layerName(l)}`} disabled={full} onClick={() => { const next = duplicateLayer(layers, l.id); if (next) { onChange(next); setSelectedId(next[next.findIndex((x) => x.id === l.id) + 1].id); } }}><Copy className="h-3.5 w-3.5" /></IconBtn>
                    <IconBtn label={`Delete ${layerName(l)}`} danger onClick={() => { const i = layers.findIndex((x) => x.id === l.id); const next = removeLayer(layers, l.id); if (l.type === 'mark' && onMarks) onMarks(next, usedMarks(next, marks)); else onChange(next); if (on) setSelectedId(next[Math.min(i, next.length - 1)]?.id ?? null); }}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {selected && (
        <section className="space-y-4 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.03] p-4" aria-label="Selected layer">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[11px] text-white/60">
              <span>Where</span>
              <select value={selected.region} aria-label="Region" onChange={(e) => edit({ region: e.target.value as PaintRegion })}
                className="rounded-md border border-white/10 bg-[#0b1220] px-2 py-1.5 text-xs text-white">
                {REGION_GROUPS.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.regions.map((r) => <option key={r} value={r}>{REGION_LABELS[r]}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <div className="flex flex-col gap-1 text-[11px] text-white/60">
              <span>Paints {suit && <span className="text-white/35">(suit mode: the skin)</span>}</span>
              <div className="flex gap-1" role="group" aria-label="Surface">
                {PAINT_SURFACES.map((s: PaintSurface) => (
                  <Pill key={s} on={selected.surface === s} disabled={suit} onClick={() => edit({ surface: s })}>{SURFACE_LABELS[s]}</Pill>
                ))}
              </div>
            </div>
          </div>

          {selected.type === 'pattern' && (
            <Picker label="Pattern" items={PATTERN_ORDER} names={PATTERN_LABELS} value={selected.pattern!} onPick={(p: PaintPattern) => edit({ pattern: p })} />
          )}
          {selected.type === 'stamp' && (
            <Picker label="Shape" items={STAMP_ORDER} names={STAMP_LABELS} value={selected.stamp!} onPick={(s: PaintStamp) => edit({ stamp: s })} />
          )}
          {selected.type === 'text' && (
            <TextField value={selected.text ?? ''} onCommit={(t) => edit({ text: t })} />
          )}
          {selected.type === 'mark' && selectedMark && onMarks && (
            <MarkPad cells={markCells} onCommit={(cells) => { const next = redrawMark(marks, selectedMark.id, cells); if (!next) return false; onMarks([...layers], next); return true; }} />
          )}

          <div className="space-y-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-white/45">Colours</h4>
            {selected.colours.map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-[11px] text-white/60">
                <span className="w-14">{roles[i] ?? `Colour ${i + 1}`}</span>
                <input type="color" value={c.toLowerCase()} aria-label={`${roles[i] ?? 'Colour'} colour`}
                  onChange={(e) => setColour(i, e.target.value, `colour${i}`)} className="h-8 w-10 cursor-pointer rounded border border-white/15 bg-transparent" />
                <HexField value={c} label={`${roles[i] ?? 'Colour'} hex`} onCommit={(hex) => setColour(i, hex)} />
                {i > 0 && (
                  <button type="button" onClick={() => edit({ colours: selected.colours.filter((_, k) => k !== i) })}
                    className="rounded px-1.5 py-0.5 text-white/40 hover:bg-white/10 hover:text-white/80" aria-label={`Remove the ${roles[i] ?? 'colour'}`}>×</button>
                )}
              </div>
            ))}
            {selected.colours.length < roles.length && (
              <button type="button" onClick={() => edit({ colours: [...selected.colours, selected.colours.length === 1 ? SECOND : THIRD] })}
                className="flex items-center gap-1 text-[11px] text-cyan-300/80 hover:text-cyan-200"><Plus className="h-3 w-3" /> Add {roles[selected.colours.length].toLowerCase()}</button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1" role="group" aria-label="Blend">
              {PAINT_BLENDS.map((b) => (
                <Pill key={b} on={(selected.blend ?? 'normal') === b} onClick={() => edit({ blend: b === 'normal' ? undefined : b })}>{BLEND_LABELS[b]}</Pill>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[11px] text-white/70" title={placed ? 'Also on the other side, mirrored' : 'Mirror left and right'}>
              <input type="checkbox" checked={selected.mirror} onChange={(e) => edit({ mirror: e.target.checked })} className="accent-cyan-400" aria-label="Mirror" />
              <FlipHorizontal className="h-3.5 w-3.5" /> Mirror
            </label>
          </div>

          {selected.type !== 'fill' && (
            <SliderGroup title={placed ? 'Placement (across and up the region)' : 'Pattern offset (across and up the region)'}>
              <NumSlider label="Across" value={selected.at.x * 100} min={0} max={100} step={0.5} onChange={(v) => setAt('x', v / 100)} />
              <NumSlider label="Up" value={selected.at.y * 100} min={0} max={100} step={0.5} onChange={(v) => setAt('y', v / 100)} />
              <NumSlider label="Rotation" value={selected.at.rot} min={RANGES.paintRot[0]} max={RANGES.paintRot[1]} step={1} onChange={(v) => setAt('rot', v)} />
              <NumSlider label="Size" value={selected.at.scale} min={RANGES.paintScale[0]} max={RANGES.paintScale[1]} step={0.01} log onChange={(v) => setAt('scale', v)} />
              <NumSlider label="Stretch" value={selected.at.stretch} min={RANGES.paintStretch[0]} max={RANGES.paintStretch[1]} step={0.01} log onChange={(v) => setAt('stretch', v)} />
            </SliderGroup>
          )}
          <SliderGroup title="Look">
            <NumSlider label="Opacity" value={selected.opacity * 100} min={0} max={100} step={1} onChange={(v) => edit({ opacity: v / 100 }, 'opacity')} />
            {wl && <NumSlider label={wl} value={(selected.weight ?? 0.5) * 100} min={RANGES.paintWeight[0] * 100} max={RANGES.paintWeight[1] * 100} step={1} onChange={(v) => edit({ weight: v / 100 }, 'weight')} />}
          </SliderGroup>
        </section>
      )}
    </div>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`rounded p-1 text-white/50 disabled:opacity-25 ${danger ? 'hover:bg-red-500/20 hover:text-red-300' : 'hover:bg-white/10 hover:text-white'}`}>{children}</button>
  );
}

function Pill({ on, onClick, disabled, children }: { on: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} disabled={disabled} onClick={onClick}
      className="rounded-full px-2.5 py-1 text-[11px] transition disabled:opacity-40"
      style={{ backgroundColor: on ? '#00E5FF' : 'rgba(255,255,255,0.05)', color: on ? '#050505' : 'rgba(255,255,255,0.75)', border: `1px solid ${on ? '#00E5FF' : 'rgba(255,255,255,0.12)'}` }}>
      {children}
    </button>
  );
}

function Picker<T extends string>({ label, items, names, value, onPick }: { label: string; items: readonly T[]; names: Record<T, string>; value: T; onPick: (v: T) => void }) {
  return (
    <div>
      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/45">{label}</h4>
      <div className="grid grid-cols-3 gap-1 sm:grid-cols-4" role="group" aria-label={label}>
        {items.map((it) => (
          <button key={it} type="button" aria-pressed={value === it} onClick={() => onPick(it)}
            className="rounded-md border px-2 py-1 text-[11px] transition"
            style={{ borderColor: value === it ? '#00E5FF' : 'rgba(255,255,255,0.1)', backgroundColor: value === it ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.02)', color: 'rgba(255,255,255,0.8)' }}>
            {names[it]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Text for a text layer: the jersey plate's rule (A–Z, 0–9, space, hyphen; 12 characters), committed when it is whole. */
function TextField({ value, onCommit }: { value: string; onCommit: (t: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const commit = () => { const t = sanitizeStampText(draft ?? value); if (draft !== null && t) onCommit(t); setDraft(null); };
  return (
    <label className="flex flex-col gap-1 text-[11px] text-white/60">
      <span>Text <span className="text-white/35">(A–Z, 0–9, space and hyphen; 12 characters)</span></span>
      <input type="text" value={shown} maxLength={12} aria-label="Layer text" spellCheck={false}
        onChange={(e) => setDraft(e.target.value.toUpperCase())}
        onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setDraft(null); }}
        className="rounded border border-white/10 bg-white/5 px-2 py-1.5 font-mono text-xs uppercase tracking-wider text-white/85" />
    </label>
  );
}
