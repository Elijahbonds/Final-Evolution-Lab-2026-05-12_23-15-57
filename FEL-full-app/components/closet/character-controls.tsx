'use client';

// The Closet's per-character controls added in CREATOR-PLAN phase 4a (IMPROVE (2026-10-06)): free colour for skin, hair
// and eyes (swatches + any colour + hex), the slot's body and its height / build, the procedural eyes, and what to hide.
// Pure presentation: every change goes back to the Closet, which records it as an undo step on the selected slot.

import { COSMETIC_CLAMP } from '@/lib/babylon/core/playFrame';
import {
  EYE_DEFAULTS, EYE_RANGES, HIDE_KEYS, PUPIL_SHAPES,
  type CreatorEyes, type HideKey, type PupilShape, type SlotBody, type SlotFrame,
} from '@/lib/creator/look/doc';
import { HexField, NumSlider } from './parts-tab';

const HEX6 = /^#[0-9a-fA-F]{6}$/;

/** Swatches plus a free colour: the native picker and a hex box. Any colour is allowed (tool #5). */
export function ColourRow({ label, swatches, value, onPick, group }: {
  label: string; swatches: readonly string[]; value: string;
  /** `group` is set while a picker drags, so the drag is one undo step */
  onPick: (hex: string, group?: string) => void; group: string;
}) {
  const v = HEX6.test(value) ? value : '#000000';
  return (
    <div className="flex flex-wrap items-center gap-2">
      {swatches.map((c) => (
        <button key={c} type="button" onClick={() => onPick(c)} aria-label={`${label} ${c}`}
          className="h-8 w-8 rounded-full border-2 transition"
          style={{ backgroundColor: c, borderColor: value.toUpperCase() === c.toUpperCase() ? '#00E5FF' : 'rgba(255,255,255,0.15)', boxShadow: value.toUpperCase() === c.toUpperCase() ? '0 0 12px #00E5FF' : 'none' }} />
      ))}
      <span className="ml-1 flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2 py-1">
        <input type="color" value={v.toLowerCase()} aria-label={`${label}: any colour`} title="Any colour"
          onChange={(e) => onPick(e.target.value.toUpperCase(), group)} className="h-6 w-8 cursor-pointer rounded border border-white/15 bg-transparent" />
        <HexField value={v.toUpperCase()} onCommit={(h) => onPick(h)} label={`${label} hex`} />
      </span>
    </div>
  );
}

const BODY_LABEL: Record<SlotBody, string> = { male: 'Male', female: 'Female', scan: 'My scan' };

/** The slot's body and its height / build. `scan` is offered only when the server said this account owns one. */
export function BodyControls({ body, frame, scanOwned, numbersSaved, onBody, onFrame }: {
  body: SlotBody; frame: SlotFrame | null; scanOwned: boolean; numbersSaved: boolean;
  onBody: (b: SlotBody) => void; onFrame: (f: SlotFrame | null, group?: string) => void;
}) {
  const bodies: SlotBody[] = scanOwned ? ['male', 'female', 'scan'] : ['male', 'female'];
  const f = frame ?? { heightScale: 1, buildScale: 1 };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Body">
        {bodies.map((b) => (
          <button key={b} type="button" role="radio" aria-checked={body === b} onClick={() => onBody(b)}
            className="rounded-full px-3 py-1.5 text-xs font-medium transition"
            style={{ backgroundColor: body === b ? '#00E5FF' : 'rgba(255,255,255,0.05)', color: body === b ? '#050505' : 'rgba(255,255,255,0.75)', border: `1px solid ${body === b ? '#00E5FF' : 'rgba(255,255,255,0.12)'}` }}>
            {BODY_LABEL[b]}
          </button>
        ))}
      </div>
      {body !== 'scan' && (
        <div className="space-y-1.5">
          <NumSlider label="Height" value={f.heightScale} min={COSMETIC_CLAMP.height[0]} max={COSMETIC_CLAMP.height[1]} step={0.005}
            onChange={(v) => onFrame({ ...f, heightScale: v }, 'frame:height')} />
          <NumSlider label="Build" value={f.buildScale} min={COSMETIC_CLAMP.build[0]} max={COSMETIC_CLAMP.build[1]} step={0.005}
            onChange={(v) => onFrame({ ...f, buildScale: v }, 'frame:build')} />
          <p className="text-[10px] leading-snug text-white/40">
            Looks only: ranked and fixed-frame modes play every body at 1.0.
            {!numbersSaved && ' Height and build stay on this device unless you allow saving look numbers above.'}
          </p>
        </div>
      )}
    </div>
  );
}

const PUPIL_LABEL: Record<PupilShape, string> = { round: 'Round', slit: 'Slit', none: 'None' };

/** The procedural eyes: sclera colour, iris size, pupil shape and size, glow. (The iris colour is the Eye Colour row.) */
export function EyeControls({ eyes, onChange }: { eyes: CreatorEyes | undefined; onChange: (e: CreatorEyes, group?: string) => void }) {
  const e = { ...EYE_DEFAULTS, ...(eyes ?? {}) };
  const set = (patch: Partial<CreatorEyes>, group?: string) => onChange({ ...(eyes ?? {}), ...patch }, group);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-white/70">
        <span className="w-24 shrink-0">Whites</span>
        <ColourRow label="Eye whites" swatches={['#F2EEE8', '#FFFFFF', '#0B0B0B', '#C8102E', '#FFD800']} value={e.sclera} onPick={(h, g) => set({ sclera: h }, g)} group="eyes:sclera" />
      </div>
      <NumSlider label="Iris size" value={e.size} min={EYE_RANGES.size[0]} max={EYE_RANGES.size[1]} step={0.01} onChange={(v) => set({ size: v }, 'eyes:size')} />
      <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
        <span className="w-24 shrink-0">Pupil</span>
        {PUPIL_SHAPES.map((p) => (
          <button key={p} type="button" aria-pressed={e.pupil === p} onClick={() => set({ pupil: p })}
            className="rounded-full px-3 py-1 text-[11px] transition"
            style={{ backgroundColor: e.pupil === p ? '#00E5FF' : 'rgba(255,255,255,0.05)', color: e.pupil === p ? '#050505' : 'rgba(255,255,255,0.75)' }}>{PUPIL_LABEL[p]}</button>
        ))}
      </div>
      {e.pupil !== 'none' && <NumSlider label="Pupil size" value={e.pupilSize} min={EYE_RANGES.pupilSize[0]} max={EYE_RANGES.pupilSize[1]} step={0.01} onChange={(v) => set({ pupilSize: v }, 'eyes:pupil')} />}
      <NumSlider label="Glow" value={e.glow} min={EYE_RANGES.glow[0]} max={EYE_RANGES.glow[1]} step={0.01} onChange={(v) => set({ glow: v }, 'eyes:glow')} />
    </div>
  );
}

const HIDE_LABEL: Record<HideKey, string> = { eyes: 'Eyes', ears: 'Ears', head: 'Whole head', hair: 'Hair' };

/** What to take off the body (for masks, helmets and mascot heads made of parts). Looks only. */
export function HideControls({ hide, onChange }: { hide: Partial<Record<HideKey, true>> | undefined; onChange: (h: Partial<Record<HideKey, true>>) => void }) {
  const h = hide ?? {};
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {HIDE_KEYS.map((k) => {
          const on = h[k] === true;
          return (
            <button key={k} type="button" aria-pressed={on}
              onClick={() => { const next = { ...h }; if (on) delete next[k]; else next[k] = true; onChange(next); }}
              className="rounded-full px-3 py-1.5 text-xs font-medium transition"
              style={{ backgroundColor: on ? '#FF3366' : 'rgba(255,255,255,0.05)', color: on ? '#050505' : 'rgba(255,255,255,0.75)', border: `1px solid ${on ? '#FF3366' : 'rgba(255,255,255,0.12)'}` }}>
              {on ? 'Hidden: ' : 'Hide '}{HIDE_LABEL[k]}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[10px] leading-snug text-white/40">For masks, helmets and mascot heads built from parts. Looks only — nothing about how you play changes.</p>
    </div>
  );
}
