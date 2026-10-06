'use client';

// THE SLOT BAR (IMPROVE (2026-10-06), CREATOR-PLAN phase 4a). The owner: "1 slot that looks like me, then switch to
// another character I made … 5 max slots." Five cards across the top of the Closet: select one to edit it, "Play as" to
// make it the one every mode spawns, and new / duplicate / rename / delete / paste-a-code-as-a-new-slot / copy its code.
//
// The bar owns no character data: the Closet passes the slots (lib/creator/look/slots.ts does every operation) and gets
// each action back. Selecting a slot is not an undo step (the Closet keeps one history per slot); deleting asks in the
// page first. Rename goes through the jersey plate's name rule (sanitizeStampText), as the slot is stored.

import { useEffect, useState } from 'react';
import { Check, Copy, Play, Plus, Trash2, ClipboardPaste, Pencil, X } from 'lucide-react';
import { MAX_SLOTS, type CreatorSlotV2 } from '@/lib/creator/look/doc';
import { summaryOf } from '@/lib/creator/look/slots';
import { sanitizeStampText } from '@/lib/creator/look/sanitize';

export interface SlotBarProps {
  slots: readonly CreatorSlotV2[];
  selected: string;
  active: string;
  /** a slot is unsaved (the Closet has edits not yet saved) */
  dirty?: boolean;
  onSelect: (id: string) => void;
  onPlayAs: (id: string) => void;
  onNew: () => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
  /** paste a share code: resolves to an error message, or null when a slot was made */
  onPaste: (code: string) => Promise<string | null>;
  /** CREATOR-PLAN phase 4d: the Studio's own "Paste a code" button opens the paste box here (a counter: each bump opens it). */
  openPaste?: number;
  /** the selected slot's share code (numbers = include the face sculpt sliders) */
  onShare: (numbers: boolean) => Promise<string>;
  accent?: string;
}

/** A tiny figure in the slot's own colours: hair over a face over a body in its accent. */
export function SlotThumb({ slot, size = 34 }: { slot: CreatorSlotV2; size?: number }) {
  const { chips } = summaryOf(slot);
  const bald = slot.base.hairStyle === 'Bald' || slot.doc.flags.hide?.hair || slot.doc.flags.hide?.head;
  return (
    <span aria-hidden className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <span className="absolute left-1/2 -translate-x-1/2 rounded-t-lg" style={{ bottom: 0, width: size * 0.78, height: size * 0.36, background: chips.accent }} />
      <span className="absolute left-1/2 -translate-x-1/2 rounded-full" style={{ top: size * 0.12, width: size * 0.46, height: size * 0.5, background: chips.skin }} />
      {!bald && <span className="absolute left-1/2 -translate-x-1/2 rounded-t-full" style={{ top: size * 0.06, width: size * 0.5, height: size * 0.2, background: chips.hair }} />}
    </span>
  );
}

export function SlotBar(p: SlotBarProps) {
  const accent = p.accent ?? '#00E5FF';
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [code, setCode] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [share, setShare] = useState<string | null>(null);
  const [shareNumbers, setShareNumbers] = useState(false);
  const full = p.slots.length >= MAX_SLOTS;
  const sel = p.slots.find((s) => s.id === p.selected);
  useEffect(() => { if (p.openPaste) { setPasting(true); setPasteError(null); } }, [p.openPaste]);

  const btn = 'flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-[11px] text-white/80 transition hover:bg-white/10 disabled:opacity-30';
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3" aria-label="Saved characters">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">Characters <span className="text-white/35">{p.slots.length}/{MAX_SLOTS}</span></h2>
        <div className="flex gap-1.5">
          <button type="button" className={btn} onClick={p.onNew} disabled={full} title={full ? `${MAX_SLOTS} characters is the most` : 'A new character'}><Plus className="h-3 w-3" /> New</button>
          <button type="button" className={btn} onClick={() => p.onDuplicate(p.selected)} disabled={full} title="Copy this character into a new slot"><Copy className="h-3 w-3" /> Duplicate</button>
          <button type="button" className={btn} onClick={() => { setPasting((v) => !v); setPasteError(null); }} disabled={full} title="Paste a share code as a new character"><ClipboardPaste className="h-3 w-3" /> Paste code</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="listbox" aria-label="Characters">
        {p.slots.map((s) => {
          const on = s.id === p.selected;
          const playing = s.id === p.active;
          return (
            <div key={s.id} role="option" aria-selected={on}
              className="flex flex-col gap-1 rounded-xl border p-2 transition"
              style={{ borderColor: on ? accent : 'rgba(255,255,255,0.1)', backgroundColor: on ? `${accent}14` : 'rgba(255,255,255,0.02)' }}>
              <button type="button" onClick={() => p.onSelect(s.id)} className="flex items-center gap-2 text-left" aria-label={`Edit ${s.label || 'character'}`}>
                <SlotThumb slot={s} />
                <span className="min-w-0">
                  {renaming === s.id ? null : <span className="block truncate font-mono text-[11px] font-bold tracking-wider text-white">{s.label || '—'}</span>}
                  <span className="block text-[9px] uppercase tracking-wider text-white/40">{s.body === 'scan' ? 'scan body' : s.body}</span>
                </span>
              </button>
              {renaming === s.id && (
                <span className="flex items-center gap-1">
                  <input autoFocus value={draft} maxLength={12} aria-label="Character name"
                    onChange={(e) => setDraft(sanitizeStampText(e.target.value))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { p.onRename(s.id, draft); setRenaming(null); } if (e.key === 'Escape') setRenaming(null); }}
                    className="w-full rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[11px] uppercase text-white" />
                  <button type="button" aria-label="Save name" onClick={() => { p.onRename(s.id, draft); setRenaming(null); }}><Check className="h-3.5 w-3.5 text-cyan-300" /></button>
                </span>
              )}
              <div className="flex items-center gap-1">
                {playing
                  ? <span className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-black tracking-wider text-black" style={{ background: accent }}><Play className="h-2.5 w-2.5" /> PLAYING</span>
                  : <button type="button" onClick={() => p.onPlayAs(s.id)} className="rounded-full border border-white/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white/75 hover:bg-white/10" title="Play as this character in every mode">PLAY AS</button>}
                <span className="flex-1" />
                <button type="button" aria-label={`Rename ${s.label}`} title="Rename" onClick={() => { setRenaming(s.id); setDraft(s.label); }} className="text-white/45 hover:text-white"><Pencil className="h-3 w-3" /></button>
                <button type="button" aria-label={`Delete ${s.label}`} title={p.slots.length <= 1 ? 'Your only character' : 'Delete'} disabled={p.slots.length <= 1}
                  onClick={() => setConfirmDelete(s.id)} className="text-white/45 hover:text-red-300 disabled:opacity-20"><Trash2 className="h-3 w-3" /></button>
              </div>
            </div>
          );
        })}
      </div>

      {confirmDelete && (
        <div role="alertdialog" aria-label="Delete character" className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 p-2 text-[11px] text-red-100">
          <span>Delete <b>{p.slots.find((s) => s.id === confirmDelete)?.label}</b>? This can&apos;t be undone once you save.</span>
          <button type="button" className="rounded bg-red-500/80 px-2 py-0.5 font-bold text-white" onClick={() => { p.onDelete(confirmDelete); setConfirmDelete(null); }}>Delete</button>
          <button type="button" className="rounded bg-white/10 px-2 py-0.5" onClick={() => setConfirmDelete(null)}>Cancel</button>
        </div>
      )}

      {pasting && (
        <div className="mt-2 flex flex-col gap-1.5 rounded-xl border border-white/10 bg-white/[0.02] p-2">
          <label className="text-[10px] uppercase tracking-wider text-white/45" htmlFor="slot-code">Share code</label>
          <textarea id="slot-code" rows={2} value={code} onChange={(e) => setCode(e.target.value)} placeholder="FEL2.…"
            className="w-full rounded border border-white/10 bg-white/5 p-1.5 font-mono text-[10px] text-white/80" />
          {pasteError && <p className="text-[11px] text-red-300">{pasteError}</p>}
          <div className="flex gap-1.5">
            <button type="button" className={btn} disabled={!code.trim() || full} onClick={async () => {
              const err = await p.onPaste(code);
              setPasteError(err);
              if (!err) { setCode(''); setPasting(false); }
            }}><Plus className="h-3 w-3" /> Add as new character</button>
            <button type="button" className={btn} onClick={() => setPasting(false)}><X className="h-3 w-3" /> Close</button>
          </div>
        </div>
      )}

      {sel && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/60">
          <button type="button" className={btn} onClick={async () => setShare(await p.onShare(shareNumbers))}><Copy className="h-3 w-3" /> Share code for {sel.label || 'this character'}</button>
          <label className="flex items-center gap-1" title="The face sculpt numbers (a face scan writes these). Off unless you choose.">
            <input type="checkbox" checked={shareNumbers} onChange={(e) => { setShareNumbers(e.target.checked); setShare(null); }} /> include face sculpt
          </label>
          {p.dirty && <span className="text-yellow-300/80">unsaved changes</span>}
        </div>
      )}
      {share && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <input readOnly value={share} aria-label="Share code" onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded border border-white/10 bg-white/5 px-1.5 py-1 font-mono text-[10px] text-white/70" />
          <button type="button" className={btn} onClick={() => { void navigator.clipboard?.writeText(share).catch(() => {}); }}>Copy</button>
          <span className="shrink-0 text-[10px] text-white/35">{share.length} chars</span>
        </div>
      )}
    </div>
  );
}
