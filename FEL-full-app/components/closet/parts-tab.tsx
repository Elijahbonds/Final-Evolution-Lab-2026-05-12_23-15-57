'use client';

// The Closet's PARTS tab (IMPROVE (2026-10-06), docs/CREATOR-PLAN.md phase 2): place generic shapes on any bone, with
// position, rotation, size and squash, a colour and a finish, a mirror toggle, duplicate and delete. Every edit goes
// through the Closet's undo history (a slider drag is one step) into the Creator doc, and the preview re-renders it on
// the next frame through the same identity pipe the game uses. The full Studio (on-model handles, drag to place) is
// phase 4; these sliders stay as its precise fallback.

import { useMemo, useState } from 'react';
import { Copy, FlipHorizontal, Layers, Plus, Redo2, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import { FINISHES, PART_TONES, RANGES, TONE_AXES, isSwingShape, type CreatorPart, type Finish, type PartBone, type PartShape, type Vec3 } from '@/lib/creator/look/doc';
import {
  BONE_GROUPS, BONE_LABELS, FINISH_LABELS, PART_BUDGET, PART_START, SHAPE_LABELS, SHAPE_ORDER, TONE_AXIS_LABELS, TONE_LABELS,
  duplicatePart, fitsBudget, newPart, partCost, partsCost, removePart, spikeCluster, updatePart,
} from '@/lib/creator/look/parts';

export interface PartsTabProps {
  parts: readonly CreatorPart[];
  /** Write the doc's parts. `group` coalesces a drag into one undo step. */
  onChange: (next: CreatorPart[], group?: string) => void;
  /** The colour a new part starts in. */
  accent: string;
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void;
}

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const AXES = [0, 1, 2] as const;
/** What each axis of a part's frame means (lib/creator/look/parts.ts: y runs down the bone, z faces front). */
const POS_LABELS = ['Side', 'Along', 'Front'] as const;
const ROT_LABELS = ['Tilt', 'Turn', 'Roll'] as const;
const SQUASH_LABELS = ['Width', 'Length', 'Depth'] as const;

export function PartsTab({ parts, onChange, accent, canUndo, canRedo, onUndo, onRedo }: PartsTabProps) {
  const [selectedId, setSelectedId] = useState<string | null>(parts[0]?.id ?? null);
  const [cluster, setCluster] = useState(9);
  const used = partsCost(parts);
  const selected = useMemo(() => parts.find((p) => p.id === selectedId) ?? null, [parts, selectedId]);
  const colour = HEX6.test(accent) ? accent.toUpperCase() : '#00E5FF';

  const add = (shape: PartShape) => {
    const p = newPart(parts, shape, colour);
    if (!p) return;
    onChange([...parts, p]);
    setSelectedId(p.id);
  };
  const addCluster = () => {
    const next = spikeCluster(parts, { count: cluster, colour });
    if (next.length === parts.length) return;
    onChange(next);
    setSelectedId(next[next.length - 1].id);
  };
  const edit = (patch: Partial<Omit<CreatorPart, 'id'>>, group?: string) => {
    if (!selected) return;
    onChange(updatePart(parts, selected.id, patch), group ? `part:${selected.id}:${group}` : undefined);
  };
  const setAxis = (field: 'pos' | 'rot' | 'scale', axis: number, v: number) => {
    if (!selected || !Number.isFinite(v)) return;
    const next = [...selected[field]] as Vec3;
    next[axis] = v;
    edit({ [field]: next }, `${field}${axis}`);
  };
  /** Size: all three axes together, keeping the squash. */
  const size = selected ? Math.cbrt(selected.scale[0] * selected.scale[1] * selected.scale[2]) : 1;
  const setSize = (v: number) => {
    if (!selected || !Number.isFinite(v) || v <= 0) return;
    const k = v / size;
    edit({ scale: selected.scale.map((s) => s * k) as Vec3 }, 'size');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <div className="min-w-[140px] flex-1">
          <div className="flex items-center justify-between text-[11px] text-white/60">
            <span className="flex items-center gap-1"><Layers className="h-3.5 w-3.5 text-cyan-400" /> Parts on your body</span>
            <span className="tabular-nums" aria-label="parts used">{used} / {PART_BUDGET}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full transition-all" style={{ width: `${(100 * used) / PART_BUDGET}%`, backgroundColor: used >= PART_BUDGET ? '#FF3366' : '#00E5FF' }} />
          </div>
          <p className="mt-1 text-[10px] text-white/35">A mirrored part counts twice.</p>
        </div>
        <button type="button" onClick={onUndo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)"
          className="flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-white/80 transition hover:bg-white/10 disabled:opacity-30"><Undo2 className="h-3.5 w-3.5" /> Undo</button>
        <button type="button" onClick={onRedo} disabled={!canRedo} aria-label="Redo" title="Redo (Shift+Ctrl+Z)"
          className="flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-white/80 transition hover:bg-white/10 disabled:opacity-30"><Redo2 className="h-3.5 w-3.5" /> Redo</button>
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-white/80">Add a part</h3>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
          {SHAPE_ORDER.map((shape) => {
            const ok = fitsBudget(parts, 1);
            return (
              <button key={shape} type="button" disabled={!ok} onClick={() => add(shape)} title={`Add a ${SHAPE_LABELS[shape].toLowerCase()} (starts on the ${BONE_LABELS[PART_START[shape].bone].toLowerCase()})`}
                className="flex items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[11px] text-white/80 transition hover:border-cyan-400/50 hover:bg-cyan-400/10 disabled:opacity-30">
                <Plus className="h-3 w-3 text-cyan-300/80" /> {SHAPE_LABELS[shape]}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] text-white/60">
          <span>Spike cluster</span>
          <input type="range" min={3} max={16} value={cluster} onChange={(e) => setCluster(Number(e.target.value))} className="w-28 accent-cyan-400" aria-label="Spikes in the cluster" />
          <span className="w-5 tabular-nums text-white/50">{cluster}</span>
          <button type="button" onClick={addCluster} disabled={!fitsBudget(parts, 1)}
            className="rounded-md bg-cyan-400/15 px-2 py-1 font-semibold text-cyan-200 transition hover:bg-cyan-400/25 disabled:opacity-30">Add spikes to the head</button>
          <span className="text-[10px] text-white/35">Each spike is its own part — edit or delete any of them.</span>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-white/80">Placed parts</h3>
        {parts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-white/40">No parts yet. Add one above — spikes, plates, fins, a visor — and place it anywhere on the body.</p>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-y-auto pr-1" aria-label="Placed parts">
            {parts.map((p) => {
              const on = p.id === selectedId;
              return (
                <li key={p.id}>
                  <div role="button" tabIndex={0} onClick={() => setSelectedId(p.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedId(p.id); }}
                    aria-pressed={on}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition"
                    style={{ borderColor: on ? '#00E5FF' : 'rgba(255,255,255,0.08)', backgroundColor: on ? 'rgba(0,229,255,0.08)' : 'rgba(255,255,255,0.02)' }}>
                    <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/20" style={{ backgroundColor: p.colour }} />
                    <span className="flex-1 truncate text-white/85">{SHAPE_LABELS[p.shape]} <span className="text-white/40">· {BONE_LABELS[p.bone]}</span></span>
                    {p.mirror && <span className="flex items-center gap-0.5 text-[10px] text-cyan-300/80" title="Mirrored (counts twice)"><FlipHorizontal className="h-3 w-3" /> ×2</span>}
                    <span className="text-[10px] capitalize text-white/35">{p.finish}</span>
                    <button type="button" aria-label={`Duplicate ${SHAPE_LABELS[p.shape]}`} title="Duplicate" disabled={!fitsBudget(parts, partCost(p))}
                      onClick={(e) => { e.stopPropagation(); const next = duplicatePart(parts, p.id); if (next) { onChange(next); setSelectedId(next[next.findIndex((x) => x.id === p.id) + 1].id); } }}
                      className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-30"><Copy className="h-3.5 w-3.5" /></button>
                    <button type="button" aria-label={`Delete ${SHAPE_LABELS[p.shape]}`} title="Delete"
                      onClick={(e) => { e.stopPropagation(); const i = parts.findIndex((x) => x.id === p.id); const next = removePart(parts, p.id); onChange(next); if (on) setSelectedId(next[Math.min(i, next.length - 1)]?.id ?? null); }}
                      className="rounded p-1 text-white/50 hover:bg-red-500/20 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {selected && (
        <section className="space-y-4 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.03] p-4" aria-label="Selected part">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[11px] text-white/60">
              <span>Shape</span>
              <select value={selected.shape} onChange={(e) => edit({ shape: e.target.value as PartShape })}
                className="rounded-md border border-white/10 bg-[#0b1220] px-2 py-1.5 text-xs text-white">
                {SHAPE_ORDER.map((s) => <option key={s} value={s}>{SHAPE_LABELS[s]}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-white/60">
              <span>On the</span>
              <select value={selected.bone} onChange={(e) => edit({ bone: e.target.value as PartBone })}
                className="rounded-md border border-white/10 bg-[#0b1220] px-2 py-1.5 text-xs text-white">
                {BONE_GROUPS.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.bones.map((b) => <option key={b} value={b}>{BONE_LABELS[b]}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[11px] text-white/60">
              <span>Colour</span>
              <input type="color" value={selected.colour.toLowerCase()} aria-label="Part colour"
                onChange={(e) => edit({ colour: e.target.value.toUpperCase() }, 'colour')} className="h-8 w-10 cursor-pointer rounded border border-white/15 bg-transparent" />
              <HexField value={selected.colour} onCommit={(hex) => edit({ colour: hex })} />
            </label>
            <div className="flex gap-1" role="group" aria-label="Finish">
              {FINISHES.map((f: Finish) => (
                <button key={f} type="button" aria-pressed={selected.finish === f} onClick={() => edit({ finish: f })}
                  className="rounded-full px-2.5 py-1 text-[11px] transition"
                  style={{ backgroundColor: selected.finish === f ? '#00E5FF' : 'rgba(255,255,255,0.05)', color: selected.finish === f ? '#050505' : 'rgba(255,255,255,0.75)', border: `1px solid ${selected.finish === f ? '#00E5FF' : 'rgba(255,255,255,0.12)'}` }}>
                  {FINISH_LABELS[f]}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[11px] text-white/70" title={selected.mirror ? 'Also on the other side' : fitsBudget(parts, 1) ? 'Add the mirror image on the other side (counts twice)' : 'No room left in the 64-part budget'}>
              <input type="checkbox" checked={selected.mirror} disabled={!selected.mirror && !fitsBudget(parts, 1)}
                onChange={(e) => edit({ mirror: e.target.checked })} className="accent-cyan-400" />
              <FlipHorizontal className="h-3.5 w-3.5" /> Mirror
            </label>
          </div>

          {/* CREATOR-PLAN phase 4c: a second colour (a split or a stripe), bend and sway, sit on the bulk */}
          <SliderGroup title="Second colour">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-[11px] text-white/70">
                <input type="checkbox" checked={!!selected.colour2} aria-label="Two-tone"
                  onChange={(e) => edit(e.target.checked ? { colour2: selected.colour === '#FFFFFF' ? '#111111' : '#FFFFFF' } : { colour2: undefined, tone: undefined, toneAxis: undefined, toneAt: undefined, toneWidth: undefined })} className="accent-cyan-400" />
                Two-tone
              </label>
              {selected.colour2 && (<>
                <input type="color" value={selected.colour2.toLowerCase()} aria-label="Second colour"
                  onChange={(e) => edit({ colour2: e.target.value.toUpperCase() }, 'colour2')} className="h-8 w-10 cursor-pointer rounded border border-white/15 bg-transparent" />
                <HexField value={selected.colour2} label="Second colour hex" onCommit={(hex) => edit({ colour2: hex })} />
                <div className="flex gap-1" role="group" aria-label="Two-tone kind">
                  {PART_TONES.map((t) => <Pill key={t} on={(selected.tone ?? 'split') === t} onClick={() => edit({ tone: t })}>{TONE_LABELS[t]}</Pill>)}
                </div>
                <div className="flex gap-1" role="group" aria-label="Two-tone direction">
                  {TONE_AXES.map((a) => <Pill key={a} on={(selected.toneAxis ?? 'y') === a} onClick={() => edit({ toneAxis: a })}>{TONE_AXIS_LABELS[a]}</Pill>)}
                </div>
              </>)}
            </div>
            {selected.colour2 && <NumSlider label="Where" value={selected.toneAt ?? 0.5} min={RANGES.toneAt[0]} max={RANGES.toneAt[1]} step={0.01} onChange={(v) => edit({ toneAt: v }, 'toneAt')} />}
            {selected.colour2 && selected.tone === 'band' && <NumSlider label="Width" value={selected.toneWidth ?? 0.2} min={RANGES.toneWidth[0]} max={RANGES.toneWidth[1]} step={0.01} onChange={(v) => edit({ toneWidth: v }, 'toneWidth')} />}
          </SliderGroup>
          {isSwingShape(selected.shape) && (
            <SliderGroup title="Bend and sway">
              <NumSlider label="Sway" value={selected.swing ?? 0} min={RANGES.swing[0]} max={RANGES.swing[1]} step={0.01} onChange={(v) => edit({ swing: v }, 'swing')} />
              <p className="text-[10px] text-white/35">0 keeps it rigid. Above 0 it bends along its length and swings as you move (a lighter version on phones).</p>
            </SliderGroup>
          )}
          <label className="flex items-center gap-2 text-[11px] text-white/70" title="When this body segment is bulked up (Shape tab), the part moves out with it instead of sinking in">
            <input type="checkbox" checked={!!selected.follow} onChange={(e) => edit({ follow: e.target.checked ? true : undefined })} className="accent-cyan-400" />
            Sit on top of the bulk
          </label>

          <SliderGroup title="Position (cm from the joint)">
            {AXES.map((k) => (
              <NumSlider key={k} label={POS_LABELS[k]} value={selected.pos[k] * 100} min={RANGES.partPos[0] * 100} max={RANGES.partPos[1] * 100} step={0.5}
                onChange={(v) => setAxis('pos', k, v / 100)} />
            ))}
          </SliderGroup>
          <SliderGroup title="Rotation (degrees)">
            {AXES.map((k) => (
              <NumSlider key={k} label={ROT_LABELS[k]} value={selected.rot[k]} min={RANGES.partRot[0]} max={RANGES.partRot[1]} step={1}
                onChange={(v) => setAxis('rot', k, v)} />
            ))}
          </SliderGroup>
          <SliderGroup title="Size and squash (× the base size, about 10 cm)">
            <NumSlider label="Size" value={size} min={RANGES.partScale[0]} max={RANGES.partScale[1]} step={0.01} log onChange={setSize} />
            {AXES.map((k) => (
              <NumSlider key={k} label={SQUASH_LABELS[k]} value={selected.scale[k]} min={RANGES.partScale[0]} max={RANGES.partScale[1]} step={0.01} log
                onChange={(v) => setAxis('scale', k, v)} />
            ))}
          </SliderGroup>
          <button type="button" onClick={() => { const s = PART_START[selected.shape]; edit({ bone: s.bone, pos: [...s.pos], rot: [...s.rot], scale: [...s.scale] }); }}
            className="flex items-center gap-1 text-[11px] text-cyan-300/80 hover:text-cyan-200"><RotateCcw className="h-3 w-3" /> Reset placement</button>
        </section>
      )}
    </div>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className="rounded-full px-2.5 py-1 text-[11px] transition"
      style={{ backgroundColor: on ? '#00E5FF' : 'rgba(255,255,255,0.05)', color: on ? '#050505' : 'rgba(255,255,255,0.75)', border: `1px solid ${on ? '#00E5FF' : 'rgba(255,255,255,0.12)'}` }}>
      {children}
    </button>
  );
}

export function SliderGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/45">{title}</h4>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

/** A slider with a typed value beside it. `log` makes the slider logarithmic (sizes from 0.05× to 8×). Shared with the
 *  Paint tab. */
export function NumSlider({ label, value, min, max, step, log = false, onChange }: { label: string; value: number; min: number; max: number; step: number; log?: boolean; onChange: (v: number) => void }) {
  const toSlider = (v: number) => (log ? Math.log(Math.max(min, v)) : v);
  const fromSlider = (s: number) => (log ? Math.exp(s) : s);
  const dp = step < 0.1 ? 2 : step < 1 ? 1 : 0;
  const shown = Number(value.toFixed(dp));
  return (
    <label className="flex items-center gap-3 text-xs text-white/70">
      <span className="w-14 shrink-0">{label}</span>
      <input type="range" min={toSlider(min)} max={toSlider(max)} step={log ? 0.001 : step} value={toSlider(value)}
        onChange={(e) => onChange(Math.min(max, Math.max(min, fromSlider(Number(e.target.value)))))} className="w-full accent-cyan-400" aria-label={label} />
      <input type="number" min={min} max={max} step={step} value={shown} aria-label={`${label} value`}
        onChange={(e) => { const v = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v))); }}
        className="w-16 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-right tabular-nums text-white/80" />
    </label>
  );
}

/** A hex box that commits only a whole #RRGGBB (so typing half a colour does not spray undo steps or bad colours). */
export function HexField({ value, onCommit, label = 'Part colour hex' }: { value: string; onCommit: (hex: string) => void; label?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const commit = () => { if (draft && HEX6.test(draft)) onCommit(draft.toUpperCase()); setDraft(null); };
  return (
    <input type="text" value={shown} maxLength={7} aria-label={label} spellCheck={false}
      onChange={(e) => setDraft(e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`)}
      onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setDraft(null); }}
      className="w-20 rounded border border-white/10 bg-white/5 px-1.5 py-1 font-mono text-[11px] uppercase text-white/80" />
  );
}
