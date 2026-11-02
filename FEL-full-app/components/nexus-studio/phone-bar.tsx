'use client';

// THE STUDIO ON A PHONE (NEX-05, round 8; owner 2026-10-20 Q8: "the whole editor, AI-first"). Every keyboard command of the venue
// editor has a touch path. Most were already buttons (the toolbar's tools and cameras, the header's undo / redo / save, the scene
// tree's eye and lock); the ones that were keys only — select all, multi-select, deselect, delete, duplicate, copy, hide, lock,
// nudge, turn — are this thumb bar, shown under the toolbar on a narrow screen (md:hidden). TOUCH_PATHS is the table, one row per
// key; phone-bar.test.tsx holds it to the editor's own key handler, so a new shortcut without a touch path fails the test.

import { CopyPlus, Copy, Trash2, Eye, Lock, BoxSelect, SquareDashedMousePointer, X, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, RotateCcw, RotateCw } from 'lucide-react';
import { C } from './ui';

/** Where each keyboard command lives on a touch screen. `bar` is a button on this bar (its data-testid); the rest name the button. */
export const TOUCH_PATHS: ReadonlyArray<{ key: string; command: string; touch: string }> = [
  { key: 'mod+z', command: 'Undo', touch: 'header: Undo' },
  { key: 'mod+shift+z', command: 'Redo', touch: 'header: Redo' },
  { key: 'mod+y', command: 'Redo', touch: 'header: Redo' },
  { key: 'mod+s', command: 'Save', touch: 'header: Save now' },
  { key: 'mod+d', command: 'Duplicate', touch: 'bar: phone-duplicate' },
  { key: 'mod+c', command: 'Copy', touch: 'bar: phone-copy' },
  { key: 'mod+v', command: 'Paste', touch: 'toolbar: Paste' },
  { key: 'mod+a', command: 'Select all', touch: 'bar: phone-select-all' },
  { key: 'q', command: 'Select tool', touch: 'toolbar: Select' },
  { key: 'w', command: 'Move tool', touch: 'toolbar: Move' },
  { key: 'e', command: 'Rotate tool', touch: 'toolbar: Rotate' },
  { key: 'r', command: 'Scale tool', touch: 'toolbar: Scale' },
  { key: '1', command: 'Orbit camera', touch: 'toolbar: Orbit camera' },
  { key: '2', command: 'Pan camera', touch: 'toolbar: Pan camera' },
  { key: '3', command: 'Fly camera', touch: 'toolbar: Fly camera' },
  { key: 'f', command: 'Frame selection', touch: 'toolbar: Frame selection' },
  { key: 'g', command: 'Grid', touch: 'toolbar: Grid' },
  { key: 'n', command: 'Snap', touch: 'toolbar: Snap' },
  { key: 'escape', command: 'Deselect / stop a preview', touch: 'bar: phone-deselect' },
  { key: 'delete', command: 'Delete', touch: 'bar: phone-delete' },
  { key: 'backspace', command: 'Delete', touch: 'bar: phone-delete' },
  { key: 'h', command: 'Hide / show', touch: 'bar: phone-hide' },
  { key: 'l', command: 'Lock / unlock', touch: 'bar: phone-lock' },
  { key: 'arrowleft', command: 'Nudge left', touch: 'bar: phone-nudge-left' },
  { key: 'arrowright', command: 'Nudge right', touch: 'bar: phone-nudge-right' },
  { key: 'arrowup', command: 'Nudge forward', touch: 'bar: phone-nudge-up' },
  { key: 'arrowdown', command: 'Nudge back', touch: 'bar: phone-nudge-down' },
  { key: 'click+ctrl', command: 'Add to / take from the selection', touch: 'bar: phone-multi' },
];

export interface PhoneBarProps {
  count: number;
  multi: boolean;
  onMulti(v: boolean): void;
  onSelectAll(): void;
  onDeselect(): void;
  onDelete(): void;
  onDuplicate(): void;
  onCopy(): void;
  onHide(): void;
  onLock(): void;
  onNudge(dx: number, dz: number): void;
  onTurn(deg: number): void;
}

function Btn({ id, label, onClick, disabled, active, children }: { id: string; label: string; onClick(): void; disabled?: boolean; active?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" data-testid={id} aria-label={label} title={label} onClick={onClick} disabled={disabled} aria-pressed={active}
      className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border disabled:opacity-35"
      style={{ borderColor: active ? C.cyan : C.line, background: active ? 'rgba(0,229,255,0.14)' : 'transparent', color: active ? C.cyan : C.text }}>
      {children}
    </button>
  );
}

/** The thumb bar: 44 px targets in one row that scrolls sideways inside itself (the page never gets wider than the screen). */
export function PhoneBar(p: PhoneBarProps) {
  const none = p.count === 0;
  const i = 'h-5 w-5';
  return (
    <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto border-b px-2 py-1.5 md:hidden" style={{ borderColor: C.line, background: C.surface }} role="toolbar" aria-label="Touch actions" data-testid="phone-bar">
      <Btn id="phone-multi" label={p.multi ? 'Multi-select on: a tap adds or removes' : 'Multi-select'} active={p.multi} onClick={() => p.onMulti(!p.multi)}><SquareDashedMousePointer className={i} /></Btn>
      <Btn id="phone-select-all" label="Select all" onClick={p.onSelectAll}><BoxSelect className={i} /></Btn>
      <Btn id="phone-deselect" label="Deselect" disabled={none} onClick={p.onDeselect}><X className={i} /></Btn>
      <span className="shrink-0 whitespace-nowrap px-1 text-[12px] tabular-nums" style={{ color: C.dim }} data-testid="phone-count">{p.count} selected</span>
      <Btn id="phone-duplicate" label="Duplicate" disabled={none} onClick={p.onDuplicate}><CopyPlus className={i} /></Btn>
      <Btn id="phone-copy" label="Copy" disabled={none} onClick={p.onCopy}><Copy className={i} /></Btn>
      <Btn id="phone-hide" label="Hide / show" disabled={none} onClick={p.onHide}><Eye className={i} /></Btn>
      <Btn id="phone-lock" label="Lock / unlock" disabled={none} onClick={p.onLock}><Lock className={i} /></Btn>
      <Btn id="phone-delete" label="Delete" disabled={none} onClick={p.onDelete}><Trash2 className={i} /></Btn>
      <Btn id="phone-nudge-left" label="Nudge left" disabled={none} onClick={() => p.onNudge(-1, 0)}><ArrowLeft className={i} /></Btn>
      <Btn id="phone-nudge-up" label="Nudge forward" disabled={none} onClick={() => p.onNudge(0, -1)}><ArrowUp className={i} /></Btn>
      <Btn id="phone-nudge-down" label="Nudge back" disabled={none} onClick={() => p.onNudge(0, 1)}><ArrowDown className={i} /></Btn>
      <Btn id="phone-nudge-right" label="Nudge right" disabled={none} onClick={() => p.onNudge(1, 0)}><ArrowRight className={i} /></Btn>
      <Btn id="phone-turn-left" label="Turn 15° left" disabled={none} onClick={() => p.onTurn(-15)}><RotateCcw className={i} /></Btn>
      <Btn id="phone-turn-right" label="Turn 15° right" disabled={none} onClick={() => p.onTurn(15)}><RotateCw className={i} /></Btn>
    </div>
  );
}
