'use client';

// §11 PREFAB STAMPS: the built-in shelf (lamp row, bleacher pair, flood corner set, palm avenue, lantern string) and the
// project's own, saved from a selection. Click a stamp to place it at the view's centre, or drag it into the view to place it
// there — one undo step either way. The project's stamps are renamed and deleted here, each one step too.

import { useState, type ReactNode } from 'react';
import { Stamp, Trash2, PackagePlus } from 'lucide-react';
import { builtInStamps } from '@/lib/nexus-studio/stamps';
import { LIMITS, type StudioProject, type StudioStamp } from '@/lib/nexus-studio/doc';
import { DRAG_MIME } from './asset-browser';
import { C, PanelTitle, TextField, ToolButton } from './ui';

/** The drag payload a stamp carries (the viewport's drop hands it back; catalog ids never start with it). */
export const STAMP_DRAG_PREFIX = 'stamp|';

const BUILT_IN = builtInStamps();

/** Pure: a stamp's one-line summary ("5 · Lights"). */
export function stampSummary(s: StudioStamp): string {
  const kinds = [...new Set(s.objects.map((o) => (o.type === 'fixture' ? 'Lights' : o.type === 'crowdStand' ? 'Crowd' : o.type === 'kitProp' || o.type === 'specProp' ? 'Dressing' : o.type === 'meshyProp' ? 'Scans' : o.type === 'decal' ? 'Marks' : 'Camera')))];
  return `${s.objects.length} · ${kinds.join(', ')}`;
}

function StampRow({ s, onPlace, children }: { s: StudioStamp; onPlace(): void; children?: ReactNode }) {
  return (
    <li className="flex items-center gap-1 rounded-md border px-2 py-1" style={{ borderColor: C.line }}
      draggable onDragStart={(e) => { e.dataTransfer.setData(DRAG_MIME, `${STAMP_DRAG_PREFIX}${s.id}`); e.dataTransfer.effectAllowed = 'copy'; }}>
      <button type="button" onClick={onPlace} className="flex min-w-0 flex-1 items-center gap-2 text-left" title={`Place ${s.name} at the view's centre (or drag it into the view)`} aria-label={`Place ${s.name}`}>
        <Stamp className="h-3.5 w-3.5 shrink-0" style={{ color: C.gold }} aria-hidden />
        <span className="min-w-0">
          <span className="block truncate text-[12px]" style={{ color: C.text }}>{s.name}</span>
          <span className="block truncate text-[12px]" style={{ color: C.dim }}>{stampSummary(s)}</span>
        </span>
      </button>
      {children}
    </li>
  );
}

export function StampShelf({ project, selectionCount, onPlace, onSave, onRename, onRemove, onDone }: {
  project: StudioProject;
  selectionCount: number;
  onPlace(s: StudioStamp): void;
  onSave(name: string): void;
  onRename(id: string, name: string): void;
  onRemove(id: string): void;
  /** a rename's field lost focus: the caller seals the coalesced step */
  onDone(): void;
}) {
  const [name, setName] = useState('');
  const mine = project.stamps ?? [];
  const full = mine.length >= LIMITS.stamps;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-3" data-testid="stamp-shelf">
      <PanelTitle>Stamps</PanelTitle>
      <ul className="grid gap-1 px-2" aria-label="Built-in stamps">
        {BUILT_IN.map((s) => <StampRow key={s.id} s={s} onPlace={() => onPlace(s)} />)}
      </ul>
      <PanelTitle>This project</PanelTitle>
      <div className="flex items-center gap-1 px-2 pb-2">
        <input type="text" value={name} maxLength={LIMITS.name} onChange={(e) => setName(e.target.value)} placeholder={selectionCount ? `Name for ${selectionCount} selected` : 'Select objects first'} aria-label="New stamp name"
          className="min-w-0 flex-1 rounded-md border bg-transparent px-2 py-1 text-[12px] outline-none" style={{ borderColor: C.line, color: C.text }} />
        <ToolButton title="Save selection as stamp" disabled={!selectionCount || full} onClick={() => { onSave(name); setName(''); }}><PackagePlus className="h-4 w-4" /></ToolButton>
      </div>
      {full && <p className="px-3 pb-1 text-[12px]" style={{ color: C.ember }}>A project keeps {LIMITS.stamps} stamps at most.</p>}
      <ul className="grid gap-1 px-2" aria-label="Project stamps">
        {mine.map((s) => (
          <StampRow key={s.id} s={s} onPlace={() => onPlace(s)}>
            <span className="w-24"><TextField label={`Rename ${s.name}`} value={s.name} onChange={(v) => onRename(s.id, v)} onDone={onDone} /></span>
            <button type="button" onClick={() => onRemove(s.id)} title={`Delete the stamp ${s.name} (placed copies stay)`} aria-label={`Delete stamp ${s.name}`} className="rounded p-1 hover:bg-white/5">
              <Trash2 className="h-3.5 w-3.5" style={{ color: C.crimson }} />
            </button>
          </StampRow>
        ))}
      </ul>
      {!mine.length && <p className="px-3 pt-1 text-[12px]" style={{ color: C.dim }}>Select a few objects (Shift-drag a box in the view), name them, and save them as a stamp. They are kept in the project and its export.</p>}
    </div>
  );
}
