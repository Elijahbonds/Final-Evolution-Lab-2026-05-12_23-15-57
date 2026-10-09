'use client';

// The Studio's HISTORY STRIP (CREATOR-PLAN phase 4d, 2026-10-06): every step of the selected character's undo history as a
// chip — what it changed, oldest to newest, the present lit — with undo / redo either side. A tap on any chip jumps there
// (a run of undos or redos, so the future stays until the next edit). The labels come from historyStrip.stripEntries.

import { useEffect, useRef } from 'react';
import { Redo2, Undo2 } from 'lucide-react';
import type { StripEntry } from '@/lib/creator/look/studio/historyStrip';

export function HistoryStrip({ entries, canUndo, canRedo, onUndo, onRedo, onJump }: {
  entries: readonly StripEntry[];
  canUndo: boolean; canRedo: boolean;
  onUndo: () => void; onRedo: () => void;
  onJump: (offset: number) => void;
}) {
  const box = useRef<HTMLOListElement>(null);
  const here = entries.findIndex((e) => e.current);
  // keep the present in view as the history grows
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('[data-current="true"]');
    el?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [here, entries.length]);
  const btn = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/50 text-white/80 backdrop-blur transition hover:border-cyan-400/50 disabled:opacity-30';
  return (
    <div className="flex items-center gap-1.5" aria-label="History">
      <button type="button" className={btn} onClick={onUndo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl/Cmd+Z, pad X)"><Undo2 className="h-4 w-4" /></button>
      <ol ref={box} className="flex min-w-0 flex-1 gap-1 overflow-x-auto py-0.5 [scrollbar-width:none]" aria-label="Steps">
        {entries.map((e) => (
          <li key={e.offset}>
            <button type="button" data-current={e.current} onClick={() => onJump(e.offset)} aria-current={e.current ? 'step' : undefined}
              title={e.offset === 0 ? 'Now' : e.offset < 0 ? `${-e.offset} step${e.offset === -1 ? '' : 's'} back` : `${e.offset} step${e.offset === 1 ? '' : 's'} forward (redo)`}
              className="whitespace-nowrap rounded-md border px-2 py-1 font-display text-[10px] uppercase tracking-wide transition"
              style={{
                borderColor: e.current ? 'var(--fel-cyan)' : 'rgba(255,255,255,0.1)',
                background: e.current ? 'rgba(0,229,255,0.15)' : e.offset > 0 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.45)',
                color: e.current ? 'var(--fel-cyan)' : e.offset > 0 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.7)',
              }}>
              {e.label}
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className={btn} onClick={onRedo} disabled={!canRedo} aria-label="Redo" title="Redo (Shift+Ctrl/Cmd+Z, pad Y)"><Redo2 className="h-4 w-4" /></button>
    </div>
  );
}
