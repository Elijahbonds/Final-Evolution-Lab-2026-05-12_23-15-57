'use client';

// PROJECTS (STUDIO-EASY, 2026-10-28; lib/nexus-studio/projectShelf.ts): New project, and every project kept on this device — open
// one, delete one (asked twice), export first. The open project is listed first and marked. Opening or starting one keeps the
// one that was open: it moves to the list, it is never replaced.

import { useEffect, useRef, useState } from 'react';
import { X, Plus, FolderOpen, Trash2, Download } from 'lucide-react';
import { TYPE } from '@/lib/design/type';
import type { StudioProject } from '@/lib/nexus-studio/doc';
import type { ShelfSummary } from '@/lib/nexus-studio/projectShelf';
import { C } from './ui';

const when = (iso: string) => { try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return ''; } };

export function ProjectsSheet({ open, shelf, onNew, onOpen, onDelete, onExport, onClose, error }: {
  open: StudioProject; shelf: readonly ShelfSummary[];
  onNew(): void; onOpen(id: string): void; onDelete(id: string): void; onExport(): void; onClose(): void;
  error?: string | null;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); back?.focus?.(); };
  }, [onClose]);
  const objects = open.venues.reduce((n, v) => n + v.objects.length, 0);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose} data-own-input>
      <div role="dialog" aria-modal="true" aria-labelledby="studio-projects-title" data-testid="studio-projects"
        className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border p-5 sm:rounded-2xl" style={{ background: C.surface, borderColor: C.line }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <h2 id="studio-projects-title" className={`${TYPE.heading} text-white`}>Projects</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close projects" className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/5" style={{ color: C.dim }}><X className="h-5 w-5" aria-hidden /></button>
        </div>
        <button type="button" onClick={onNew} data-testid="projects-new" data-fel-primary
          className="fel-press mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-full font-sans text-[15px] font-bold" style={{ background: 'linear-gradient(180deg, #4df0ff 0%, var(--fel-accent, #00E5FF) 55%, #00c8e0 100%)', color: '#050505' }}>
          <Plus className="h-5 w-5" aria-hidden /> New project
        </button>
        {error && <p className={`${TYPE.small} mt-2`} style={{ color: C.ember }} role="alert">{error}</p>}
        <p className={`${TYPE.small} mt-3`} style={{ color: 'var(--fel-text-soft, #c3cad3)' }}>Kept on this device. Export one to keep it anywhere.</p>
        <ul className="mt-2 divide-y" style={{ borderColor: C.line }} aria-label="Your projects">
          <li className="flex min-h-14 items-center gap-3 py-2" data-testid="projects-open-row">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-sans text-[15px] font-semibold text-white">{open.name}</span>
              <span className="block text-[13px]" style={{ color: C.dim }}>Open now · {objects} {objects === 1 ? 'thing' : 'things'} placed</span>
            </span>
            <button type="button" onClick={onExport} className="inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 text-[13px]" style={{ borderColor: C.line, color: C.text }}><Download className="h-4 w-4" aria-hidden /> Export</button>
          </li>
          {shelf.map((p) => (
            <li key={p.id} className="flex min-h-14 flex-wrap items-center gap-3 py-2" data-testid="projects-row">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-sans text-[15px] text-white">{p.name}</span>
                <span className="block text-[13px]" style={{ color: C.dim }}>{when(p.updatedAt)} · {p.objects} {p.objects === 1 ? 'thing' : 'things'} placed</span>
              </span>
              {asking === p.id ? (
                <span className="flex items-center gap-2" role="group" aria-label={`Delete ${p.name}?`}>
                  <button type="button" onClick={() => { onDelete(p.id); setAsking(null); }} className="min-h-10 rounded-md px-3 text-[13px] font-semibold" style={{ background: C.crimson, color: '#050505' }}>Delete for good</button>
                  <button type="button" onClick={() => setAsking(null)} className="min-h-10 rounded-md px-3 text-[13px]" style={{ color: C.dim }}>Keep</button>
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <button type="button" onClick={() => onOpen(p.id)} className="inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 text-[13px]" style={{ borderColor: C.line, color: C.text }} aria-label={`Open ${p.name}`}><FolderOpen className="h-4 w-4" aria-hidden /> Open</button>
                  <button type="button" onClick={() => setAsking(p.id)} className="inline-flex h-10 w-10 items-center justify-center rounded-md" style={{ color: C.dim }} aria-label={`Delete ${p.name}`}><Trash2 className="h-4 w-4" aria-hidden /></button>
                </span>
              )}
            </li>
          ))}
        </ul>
        {!shelf.length && <p className={`${TYPE.small} mt-2`} style={{ color: C.dim }}>No other projects yet.</p>}
      </div>
    </div>
  );
}
