'use client';

// NEXUS STUDIO (docs/NEXUS-STUDIO.md): the editor inside FEL. Four tracks, phased — the venue / level editor (built),
// the AI game builder (CELL: venue edits as Studio commands, beside the existing StudioShell, unchanged), characters (Closet
// share codes cast through playerIdentity) and visual scripting (event → condition → action graphs, presentation only).
// /studio is flag-gated and unlinked (lib/nav/reachability.test.ts).

import { useRef, useState } from 'react';
import { Undo2, Redo2, Save, Download, Upload, Play, Box, Sparkles, UserRound, Workflow, Check, CloudOff, AlertTriangle } from 'lucide-react';
import { StudioShell } from '@/components/studio/studio-shell';
import { parseProject } from '@/lib/nexus-studio/doc';
import { exportVenue } from '@/lib/nexus-studio/exportVenue';
import { scriptsForVenue } from '@/lib/nexus-studio/scripts';
import { browserKV, encodeInline, exportFile, writePlaytest } from '@/lib/nexus-studio/storage';
import { importProject, renameProject } from '@/lib/nexus-studio/edits';
import { targetOf } from '@/lib/nexus-studio/targets';
import { studioLoadAllowed } from '@/lib/nexus-studio/runtime';
import { useResolvedCast, useStudio, type SaveState } from './use-studio';
import { VenueEditor } from './venue-editor';
import { CharactersTrack } from './characters';
import { ScriptsTrack } from './script-editor';
import { AiVenuePanel } from './ai-venue-panel';
import { C, ToolButton } from './ui';

export type Track = 'venue' | 'ai' | 'characters' | 'scripts';
export const TRACKS: ReadonlyArray<{ id: Track; label: string; phase: string }> = [
  { id: 'venue', label: 'Venues', phase: 'Track 1' },
  { id: 'ai', label: 'AI builder', phase: 'Track 2' },
  { id: 'characters', label: 'Characters', phase: 'Track 3' },
  { id: 'scripts', label: 'Scripts', phase: 'Track 4' },
];
const TRACK_ICON: Record<Track, typeof Box> = { venue: Box, ai: Sparkles, characters: UserRound, scripts: Workflow };

const SAVE_LABEL: Record<SaveState, string> = { saved: 'Saved on this device', unsaved: 'Unsaved changes', saving: 'Saving…', 'no-storage': 'Not kept on this device — export to keep', error: 'Not saved' };

export function NexusStudioApp() {
  const studio = useStudio();
  const [track, setTrack] = useState<Track>('venue');
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { doc, venue } = studio;
  const cast = useResolvedCast(doc, venue);

  const doExport = () => {
    const f = exportFile(doc);
    const url = URL.createObjectURL(new Blob([f.text], { type: f.type }));
    const a = document.createElement('a'); a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(`Exported ${f.name}`);
  };
  const doImport = async (file: File) => {
    const r = parseProject(await file.text());
    if (!r.ok) { setMessage(`Could not import: ${r.error}`); return; }
    studio.run(importProject(r.project)); studio.setSelected(null);
    setMessage(`Imported “${r.project.name}”${r.dropped ? ` — ${r.dropped} item(s) this Studio cannot read were left out` : ''}. Undo puts the old project back.`);
  };
  const playtest = () => {
    if (!venue) return;
    const t = targetOf(venue.base.target);
    if (!t) { setMessage('This venue has no mode to play it in yet.'); return; }
    if (!studioLoadAllowed()) { setMessage('Play-test runs in a development build only (the mode’s ?venue= load path is dev-only).'); return; }
    const exp = exportVenue(venue, cast, scriptsForVenue(doc.scripts, venue.id));   // tracks 3 + 4: the cast (decoded, synchronously: a popup must open in the click) and the scripts this venue runs (studio-4b: per-venue scope) ride the export
    const w = writePlaytest(browserKV(), exp);
    const param = w.ok ? exp.venueId : encodeInline(exp);
    if (!param) { setMessage(`Could not hand the venue over: ${w.ok ? '' : w.error}`); return; }
    // place=home: the mode's place pick (a saved Clay, say) must not re-light a Studio venue (moodResolver reads it)
    window.open(`${t.route(param)}&place=home`, '_blank', 'noopener');
    setMessage(`Opened ${t.label} with “${venue.name}”.`);
  };

  const SaveIcon = studio.saveState === 'saved' ? Check : studio.saveState === 'no-storage' ? CloudOff : studio.saveState === 'error' ? AlertTriangle : Save;

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col" style={{ background: C.bg, color: C.text }} data-testid="nexus-studio">
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-1.5" style={{ borderColor: C.line, background: C.surface }}>
        <span className="font-display text-[13px] font-bold uppercase tracking-[0.22em]" style={{ color: C.cyan }}>Nexus Studio</span>
        <input aria-label="Project name" value={doc.name} maxLength={60} onChange={(e) => studio.run(renameProject(e.target.value || 'Untitled project'))} onBlur={studio.seal}
          className="w-44 rounded border bg-transparent px-2 py-0.5 text-[12px] outline-none focus:border-[color:var(--fel-cyan)]" style={{ borderColor: C.line }} />
        <nav className="ml-2 flex gap-1" role="tablist" aria-label="Studio tracks">
          {TRACKS.map((t) => {
            const Icon = TRACK_ICON[t.id];
            return (
              <button key={t.id} type="button" role="tab" aria-selected={track === t.id} onClick={() => setTrack(t.id)} title={t.phase}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px]"
                style={{ background: track === t.id ? 'rgba(0,229,255,0.12)' : 'transparent', color: track === t.id ? C.cyan : C.dim }}>
                <Icon className="h-3.5 w-3.5" aria-hidden /> {t.label}
              </button>
            );
          })}
        </nav>
        <span className="ml-auto flex items-center gap-1">
          <ToolButton title={studio.undoLabel ? `Undo ${studio.undoLabel}` : 'Undo'} shortcut="Ctrl+Z" disabled={!studio.canUndo} onClick={studio.undo}><Undo2 className="h-4 w-4" /></ToolButton>
          <ToolButton title={studio.redoLabel ? `Redo ${studio.redoLabel}` : 'Redo'} shortcut="Ctrl+Shift+Z" disabled={!studio.canRedo} onClick={studio.redo}><Redo2 className="h-4 w-4" /></ToolButton>
          <span className="mx-1 flex items-center gap-1 text-[11px]" style={{ color: studio.saveState === 'saved' ? C.dim : studio.saveState === 'error' || studio.saveState === 'no-storage' ? C.ember : C.gold }} title={studio.saveError ?? undefined} data-testid="save-state">
            <SaveIcon className="h-3.5 w-3.5" aria-hidden /> {SAVE_LABEL[studio.saveState]}
          </span>
          <ToolButton title="Save now" shortcut="Ctrl+S" onClick={() => studio.save()}><Save className="h-4 w-4" /></ToolButton>
          <ToolButton title="Export the project (.nexus.json)" onClick={doExport}><Download className="h-4 w-4" /></ToolButton>
          <ToolButton title="Import a project" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /></ToolButton>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ''; }} />
          {track !== 'ai' && (
            <button type="button" onClick={playtest} className="ml-1 flex items-center gap-1.5 rounded-md px-3 py-1 text-[12px] font-semibold" style={{ background: C.cyan, color: '#050505' }} title="Open the mode with this venue (development build)">
              <Play className="h-3.5 w-3.5" aria-hidden /> Play-test in {targetOf(venue?.base.target ?? '')?.label ?? 'mode'}
            </button>
          )}
        </span>
      </header>
      {message && (
        <div className="flex items-center justify-between border-b px-3 py-1 text-[12px]" style={{ borderColor: C.line, color: C.gold }} role="status">
          <span>{message}</span>
          <button type="button" onClick={() => setMessage(null)} className="text-[11px]" style={{ color: C.dim }}>Dismiss</button>
        </div>
      )}
      {track === 'venue' && <VenueEditor studio={studio} />}
      {track === 'ai' && (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(320px,420px)_1fr]">
          <aside className="min-h-0 overflow-y-auto border-r" style={{ borderColor: C.line, background: C.surface }}>
            <AiVenuePanel studio={studio} onApplied={() => { setTrack('venue'); setMessage(`CELL’s edits are in “${venue?.name ?? 'the venue'}” as one step — Undo takes them back.`); }} />
          </aside>
          {/* CELL's game-file builder, unchanged (its file holds the ABACUS guard lines) */}
          <div className="relative min-h-0 overflow-hidden"><StudioShell /></div>
        </div>
      )}
      {track === 'characters' && <CharactersTrack studio={studio} onPreview={() => setTrack('venue')} />}
      {track === 'scripts' && <ScriptsTrack studio={studio} />}
    </div>
  );
}
