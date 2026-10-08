'use client';

// The Studio's CLOTHING tab (IMPROVE (2026-10-06), CREATOR-PLAN phase 4e; owner: "You should be able to change their
// clothing too."). Pick a piece — tops, bottoms, gloves, footwear — and shape it: sleeve, hem, neckline, hood, an open
// front, leg length, rise, waistband, flare, cuff, shaft height, fit, a colour and a second colour with where it goes.
// The list is the LAYER ORDER (innermost first; ↑ ↓ move a piece in or out), Randomise rolls every unlocked kind, and
// every change is a step in the Studio's undo history (a slider drag is one step, by its group). Pure presentation: the
// Closet writes the doc, the preview builds the clothes from the body on the next frame (lib/babylon/creator/clothes).
//
// FREE. Every piece, colour and paint here costs nothing; the coin store keeps its special items. A built top, bottom
// or footwear replaces the store item in that slot while it is worn — the item stays the player's, and comes back the
// moment the built piece comes off. The tab says so, and links to the store items.

import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Lock, Plus, Redo2, Shirt, Shuffle, Trash2, Undo2, Unlock } from 'lucide-react';
import {
  CLOTH_CUFFS, CLOTH_HEMS, CLOTH_HOODS, CLOTH_KINDS, CLOTH_KIT_SLOT, CLOTH_LEGS, CLOTH_NECKS, CLOTH_RISES, CLOTH_SHAFTS, CLOTH_SLEEVES,
  CLOTH_STYLES, CLOTH_TONES, type ClothKind, type ClothStyle, type ClothTone, type CreatorCloth,
} from '@/lib/creator/look/doc';
import {
  CLOTH_KIND_LABELS, CLOTH_STYLE_LABELS, CLOTH_TONE_LABELS, CUFF_LABELS, HEM_LABELS, HOOD_LABELS, LEG_LABELS, NECK_LABELS, RISE_LABELS,
  SHAFT_LABELS, SLEEVE_LABELS, addCloth, canAddCloth, clothLabel, moveCloth, removeCloth, resolveCloth, updateCloth,
} from '@/lib/creator/look/clothes';
import { effectiveTone } from '@/lib/babylon/creator/clothes/build';
import { HexField, NumSlider, SliderGroup } from './parts-tab';

export interface ClothesTabProps {
  clothes: readonly CreatorCloth[];
  /** Write the doc's clothes. `group` coalesces a drag into one undo step. */
  onChange: (next: CreatorCloth[], group?: string) => void;
  /** The colour a new piece starts in. */
  accent: string;
  locks: readonly ClothKind[];
  onLocks: (next: ClothKind[]) => void;
  onRoll: () => void;
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void;
  /** The selection, held by the Studio when it passes these (the camera frames the selected piece). */
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** The store item worn in each kit slot (its name), so the tab can say what a built piece replaces. */
  storeItems?: Partial<Record<'tops' | 'shorts' | 'shoes', string | null>>;
  /** Open the store items (the Wearables tab). */
  onStore?: () => void;
}

const HEX6 = /^#[0-9a-fA-F]{6}$/;
/** What a new piece of each kind starts as, besides its style (a shoe gets a light sole). */
const START: Partial<Record<ClothStyle, Partial<CreatorCloth>>> = {
  shoes: { colour2: '#F2EEE6' }, boots: { colour2: '#2A2A28' },
};

export function ClothesTab(p: ClothesTabProps) {
  const [ownId, setOwnId] = useState<string | null>(p.clothes[0]?.id ?? null);
  const selectedId = p.selectedId !== undefined ? p.selectedId : ownId;
  const setSelected = (id: string | null) => { setOwnId(id); p.onSelect?.(id); };
  const selected = useMemo(() => p.clothes.find((c) => c.id === selectedId) ?? null, [p.clothes, selectedId]);
  const colour = HEX6.test(p.accent) ? p.accent.toUpperCase() : '#00E5FF';

  const add = (style: ClothStyle) => {
    const r = addCloth(p.clothes, style, colour, START[style] ?? {});
    if (!r) return;
    p.onChange(r.list);
    setSelected(r.piece.id);
  };
  const edit = (patch: Partial<Omit<CreatorCloth, 'id' | 'kind'>>, group?: string) => {
    if (!selected) return;
    p.onChange(updateCloth(p.clothes, selected.id, patch), group ? `cloth:${selected.id}:${group}` : undefined);
  };
  const r = selected ? resolveCloth(selected) : null;
  const replaced = (['tops', 'shorts', 'shoes'] as const).filter((slot) => p.clothes.some((c) => CLOTH_KIT_SLOT[c.kind] === slot) && p.storeItems?.[slot]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <Shirt className="h-4 w-4 text-cyan-400" />
        <div className="min-w-[160px] flex-1">
          <div className="text-xs font-semibold text-white/80">Clothing — free, built from your body</div>
          <div className="text-[10px] text-white/40">{p.clothes.length} / 6 pieces · top of the list is worn innermost</div>
        </div>
        <button type="button" onClick={p.onUndo} disabled={!p.canUndo} aria-label="Undo" title="Undo (Ctrl+Z)" className="rounded p-1.5 text-white/60 hover:bg-white/10 disabled:opacity-30"><Undo2 className="h-4 w-4" /></button>
        <button type="button" onClick={p.onRedo} disabled={!p.canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" className="rounded p-1.5 text-white/60 hover:bg-white/10 disabled:opacity-30"><Redo2 className="h-4 w-4" /></button>
        <button type="button" onClick={p.onRoll} className="flex items-center gap-1 rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-400/20" title="Randomise every unlocked kind">
          <Shuffle className="h-3.5 w-3.5" /> Randomise
        </button>
        <div className="flex w-full flex-wrap gap-1.5" role="group" aria-label="Randomise locks">
          {CLOTH_KINDS.map((k) => {
            const on = p.locks.includes(k);
            return (
              <button key={k} type="button" aria-pressed={on} onClick={() => p.onLocks(on ? p.locks.filter((x) => x !== k) : [...p.locks, k])}
                className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: on ? '#FFD700' : 'rgba(255,255,255,0.12)', color: on ? '#FFD700' : 'rgba(255,255,255,0.6)' }}
                title={on ? `${CLOTH_KIND_LABELS[k]} locked — Randomise keeps them` : `Lock ${CLOTH_KIND_LABELS[k].toLowerCase()}`}>
                {on ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />} {CLOTH_KIND_LABELS[k]}
              </button>
            );
          })}
        </div>
      </div>

      {replaced.length > 0 && (
        <p className="rounded-lg border border-[#FFD700]/30 bg-[#FFD700]/5 px-3 py-2 text-[11px] text-white/70" role="note">
          Your built pieces replace {replaced.map((s) => `${p.storeItems?.[s]}`).join(', ')} while you wear them — still yours, back when the piece comes off.
          {p.onStore && <button type="button" onClick={p.onStore} className="ml-1 text-cyan-300 hover:text-cyan-200">Store items</button>}
        </p>
      )}

      <section aria-label="Add a piece" className="space-y-2">
        {CLOTH_KINDS.map((k) => (
          <div key={k}>
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/45">{CLOTH_KIND_LABELS[k]}</h3>
            <div className="flex flex-wrap gap-1.5">
              {(CLOTH_STYLES[k] as readonly ClothStyle[]).map((style) => (
                <button key={style} type="button" disabled={!canAddCloth(p.clothes, k)} onClick={() => add(style)} title={`Add ${CLOTH_STYLE_LABELS[style].toLowerCase()}`}
                  className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-white/80 transition hover:border-cyan-400/50 disabled:opacity-35">
                  <Plus className="h-3 w-3" /> {CLOTH_STYLE_LABELS[style]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      {p.clothes.length > 0 && (
        <section aria-label="Pieces, innermost first" className="space-y-1">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/45">Worn — innermost first</h3>
          {p.clothes.map((c, i) => (
            <div key={c.id} role="button" tabIndex={0} aria-pressed={c.id === selectedId} onClick={() => setSelected(c.id)} onKeyDown={(e) => { if (e.key === 'Enter') setSelected(c.id); }}
              className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs text-white/80" style={{ borderColor: c.id === selectedId ? '#00E5FF' : 'rgba(255,255,255,0.08)', backgroundColor: c.id === selectedId ? 'rgba(0,229,255,0.08)' : 'transparent' }}>
              <span className="h-4 w-4 shrink-0 rounded-full border border-white/20" style={{ background: c.colour2 ? `linear-gradient(135deg, ${c.colour} 55%, ${c.colour2} 55%)` : c.colour }} />
              <span className="flex-1">{clothLabel(c)} <span className="text-white/40">· {CLOTH_KIND_LABELS[c.kind].toLowerCase()}</span></span>
              <IconBtn label="Wear further in" disabled={i === 0} onClick={() => p.onChange(moveCloth(p.clothes, c.id, -1))}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
              <IconBtn label="Wear further out" disabled={i === p.clothes.length - 1} onClick={() => p.onChange(moveCloth(p.clothes, c.id, 1))}><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
              <IconBtn label="Take off" danger onClick={() => { p.onChange(removeCloth(p.clothes, c.id)); if (c.id === selectedId) setSelected(null); }}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
            </div>
          ))}
        </section>
      )}

      {selected && r && (
        <section aria-label="The selected piece" className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <Chips label="Style" items={CLOTH_STYLES[selected.kind] as readonly ClothStyle[]} names={CLOTH_STYLE_LABELS} value={selected.style} onPick={(v) => edit({ style: v })} />
          {selected.kind === 'top' && <>
            <Chips label="Sleeves" items={CLOTH_SLEEVES} names={SLEEVE_LABELS} value={r.sleeve} onPick={(v) => edit({ sleeve: v })} />
            <Chips label="Hem" items={CLOTH_HEMS} names={HEM_LABELS} value={r.hem} onPick={(v) => edit({ hem: v })} />
            <Chips label="Neckline" items={CLOTH_NECKS} names={NECK_LABELS} value={r.neck} onPick={(v) => edit({ neck: v })} />
            <Chips label="Hood" items={CLOTH_HOODS} names={HOOD_LABELS} value={r.hood} onPick={(v) => edit({ hood: v })} />
          </>}
          {selected.kind === 'bottom' && <>
            <Chips label={selected.style === 'skirt' ? 'Length' : 'Leg'} items={CLOTH_LEGS} names={LEG_LABELS} value={r.leg} onPick={(v) => edit({ leg: v })} />
            <Chips label="Rise" items={CLOTH_RISES} names={RISE_LABELS} value={r.rise} onPick={(v) => edit({ rise: v })} />
            <label className="flex items-center gap-2 text-[11px] text-white/70">
              <input type="checkbox" checked={r.waistband} onChange={(e) => edit({ waistband: e.target.checked })} className="accent-cyan-400" aria-label="Waistband" /> Waistband
            </label>
          </>}
          {selected.kind === 'gloves' && <Chips label="Cuff" items={CLOTH_CUFFS} names={CUFF_LABELS} value={r.cuff} onPick={(v) => edit({ cuff: v })} />}
          {selected.kind === 'feet' && <Chips label="Height" items={CLOTH_SHAFTS} names={SHAFT_LABELS} value={r.shaft} onPick={(v) => edit({ shaft: v })} />}
          <SliderGroup title="Fit">
            <NumSlider label="Fit" value={Math.round(r.fit * 100)} min={0} max={100} step={1} onChange={(v) => edit({ fit: v / 100 }, 'fit')} />
            {selected.kind === 'top' && <NumSlider label="Open" value={Math.round(r.open * 100)} min={0} max={100} step={1} onChange={(v) => edit({ open: v / 100 }, 'open')} />}
            {(selected.kind === 'bottom' || (selected.kind === 'top' && (r.hem === 'thigh' || r.hem === 'knee'))) && (
              <NumSlider label="Flare" value={Math.round(r.flare * 100)} min={0} max={100} step={1} onChange={(v) => edit({ flare: v / 100 }, 'flare')} />
            )}
            <p className="text-[10px] text-white/35">Fit 0 is skin-tight, 100 loose. Open splits a top down the front.</p>
          </SliderGroup>
          <SliderGroup title="Colour">
            <div className="flex flex-wrap items-center gap-2">
              <input type="color" value={selected.colour.toLowerCase()} onChange={(e) => edit({ colour: e.target.value.toUpperCase() }, 'colour')} aria-label="Piece colour" className="h-8 w-10 cursor-pointer rounded border border-white/15 bg-transparent" />
              <HexField value={selected.colour} onCommit={(hex) => edit({ colour: hex })} label="Piece colour hex" />
              <label className="ml-2 flex items-center gap-1.5 text-[11px] text-white/70">
                <input type="checkbox" checked={!!selected.colour2} aria-label="Second colour"
                  onChange={(e) => edit(e.target.checked ? { colour2: selected.kind === 'feet' ? '#F2EEE6' : '#FFFFFF' } : { colour2: undefined, tone: undefined })} className="accent-cyan-400" /> Second colour
              </label>
              {selected.colour2 && <>
                <input type="color" value={selected.colour2.toLowerCase()} onChange={(e) => edit({ colour2: e.target.value.toUpperCase() }, 'colour2')} aria-label="Second colour" className="h-8 w-10 cursor-pointer rounded border border-white/15 bg-transparent" />
                <HexField value={selected.colour2} onCommit={(hex) => edit({ colour2: hex })} label="Second colour hex" />
              </>}
            </div>
            {selected.colour2 && <Chips label="Where" items={tonesFor(selected.kind)} names={CLOTH_TONE_LABELS} value={effectiveTone(r)} onPick={(v) => edit({ tone: v })} />}
            <p className="text-[10px] text-white/35">Patterns, stamps and text on clothes: the Paint tab, on “Clothes” or “Both”.</p>
          </SliderGroup>
        </section>
      )}
    </div>
  );
}

/** The tones a kind can show (build.effectiveTone sends the rest to the trim). */
function tonesFor(kind: ClothKind): readonly ClothTone[] {
  return CLOTH_TONES.filter((t) => (t === 'sole' ? kind === 'feet' : t === 'sleeves' || t === 'yoke' ? kind === 'top' : true));
}

function Chips<T extends string>({ label, items, names, value, onPick }: { label: string; items: readonly T[]; names: Record<T, string>; value: T; onPick: (v: T) => void }): ReactNode {
  return (
    <div>
      <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/45">{label}</h4>
      <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
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

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`rounded p-1 text-white/50 disabled:opacity-25 ${danger ? 'hover:bg-red-500/20 hover:text-red-300' : 'hover:bg-white/10 hover:text-white'}`}>{children}</button>
  );
}
