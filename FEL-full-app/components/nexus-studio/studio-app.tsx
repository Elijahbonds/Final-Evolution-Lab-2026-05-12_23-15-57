'use client';

// NEXUS STUDIO (docs/NEXUS-STUDIO.md): the editor inside FEL. Four tracks, phased — the venue / level editor (built),
// the AI game builder (CELL: venue edits as Studio commands, beside the existing StudioShell, unchanged), characters (Closet
// share codes cast through playerIdentity) and visual scripting (event → condition → action graphs, presentation only).
// /studio is flag-gated and unlinked (lib/nav/reachability.test.ts).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Undo2, Redo2, Save, Download, Upload, Play, Box, Sparkles, UserRound, Workflow, Check, CloudOff, AlertTriangle, ArrowLeft, FolderOpen, CircleHelp } from 'lucide-react';
import Link from 'next/link';
import { StudioShell } from '@/components/studio/studio-shell';
import { parseProject } from '@/lib/nexus-studio/doc';
import { exportVenue } from '@/lib/nexus-studio/exportVenue';
import { scriptsForVenue } from '@/lib/nexus-studio/scripts';
import { browserKV, encodeInline, exportFile, saveProject, writePlaytest } from '@/lib/nexus-studio/storage';
import { importProject, renameProject } from '@/lib/nexus-studio/edits';
import { targetOf } from '@/lib/nexus-studio/targets';
import { studioLoadAllowed } from '@/lib/nexus-studio/runtime';
import { handOff, modeRoute, playtestKey } from '@/lib/nexus-studio/shareHandoff';
import { offerGuide, readGuideMark, writeGuideMark } from '@/lib/nexus-studio/firstCourt';
import { shellCommand } from '@/lib/nexus-studio/shortcuts';
import { useAiStatus } from '@/lib/abacus/useAiStatus';
import { starterProject, useResolvedCast, useStudio, type SaveState } from './use-studio';
import { VenueEditor, typingTarget, type VenueEditorHandle } from './venue-editor';
import { FirstCourt } from './first-court';
import { HelpSheet } from './help-sheet';
import { ProjectsSheet } from './projects-sheet';
import { listShelf, removeShelved, swapIn, type ShelfSummary } from '@/lib/nexus-studio/projectShelf';
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
  // NEX-05 (owner 2026-10-20 Q8: "the whole editor, AI-first"): on a phone the Studio opens on the AI builder — describe a change,
  // review it, apply it — and its tab comes first; every other track is one tap away
  // STUDIO-EASY: only while the AI builder is ON — with the switch off (the default: it calls a paid model) a phone opened on a
  // track that could do nothing, so it opens on the court and the first-court guide instead
  const [aiState] = useAiStatus('studio');
  const aiFirstDone = useRef(false);
  useEffect(() => {
    if (aiState !== 'available' || aiFirstDone.current) return;
    aiFirstDone.current = true;
    try { if (window.matchMedia('(max-width: 767px)').matches && !guideRef.current) setTrack('ai'); } catch { /* no matchMedia: desktop */ }
  }, [aiState]);
  const [message, setMessage] = useState<string | null>(null);
  const [cellOpen, setCellOpen] = useState(false);   // NEX-05: on a phone CELL's game-file builder is one tap away, below the venue builder
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { doc, venue } = studio;
  const cast = useResolvedCast(doc, venue);
  // STUDIO-EASY: the first-court guide (an untouched first project opens on it), Help ("?"), and New project
  const [guide, setGuide] = useState(false);
  const guideRef = useRef(guide); guideRef.current = guide;
  const [help, setHelp] = useState(false);
  const [projects, setProjects] = useState(false);
  const [shelf, setShelf] = useState<ShelfSummary[]>([]);
  const [projErr, setProjErr] = useState<string | null>(null);
  const editor = useRef<VenueEditorHandle | null>(null);
  const onHandle = useCallback((h: VenueEditorHandle | null) => { editor.current = h; }, []);
  const offered = useRef(false);
  useEffect(() => {
    if (!studio.loaded || offered.current) return;
    offered.current = true;
    if (offerGuide(doc, readGuideMark(browserKV()))) setGuide(true);
  }, [studio.loaded, doc]);
  const endGuide = (mark: 'done' | 'skipped') => { writeGuideMark(browserKV(), mark); setGuide(false); };
  const startGuide = () => { setHelp(false); setTrack('venue'); setGuide(true); };
  // the project list (projectShelf.ts): the open project moves to the list, never replaced
  const showProjects = () => { setProjErr(null); setShelf(listShelf(browserKV())); setProjects(true); };
  const switchTo = (nextId: string | null) => {
    const kv = browserKV();
    const r = swapIn(kv, doc, nextId);
    if (!r.ok) { setProjErr(r.error); return; }
    const next = r.next ?? starterProject();
    saveProject(kv, next);
    studio.open(next);
    setProjects(false); setTrack('venue');
    if (!nextId) setGuide(true);
    setMessage(nextId ? `Opened “${next.name}”. “${doc.name}” is in Projects.` : `New project started. “${doc.name}” is in Projects.`);
  };
  const newProject = () => switchTo(null);
  // Undo, Redo, Save and "?" on every track (the venue editor answers its own keys; this covers the other three)
  const trackRef = useRef(track); trackRef.current = track;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typingTarget(e.target)) return;
      const c = shellCommand(e);
      if (!c) return;
      if (c === 'keys') { e.preventDefault(); setHelp(true); return; }
      if (trackRef.current === 'venue') return;
      e.preventDefault();
      if (c === 'undo') studio.undo(); else if (c === 'redo') studio.redo(); else studio.save();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [studio]);

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
    if (!t) { setMessage('This venue has no game to play it in yet.'); return; }
    if (!studioLoadAllowed()) {
      // STUDIO-EASY: a production build plays the venue on the game's own page, as a share link does (practice, never ranked)
      const key = playtestKey();
      const route = modeRoute(t.key, key);
      let store: Storage | null = null; try { store = window.sessionStorage; } catch { /* blocked */ }
      if (!route || !handOff(store, key, exportVenue(venue, null, scriptsForVenue(doc.scripts, venue.id)))) {
        setMessage('This browser would not hand the court to the game (a private window?). Try a normal tab.'); return;
      }
      studio.save();
      window.location.assign(route);
      return;
    }
    const exp = exportVenue(venue, cast, scriptsForVenue(doc.scripts, venue.id));   // tracks 3 + 4: the cast (decoded, synchronously: a popup must open in the click) and the scripts this venue runs (studio-4b: per-venue scope) ride the export
    const w = writePlaytest(browserKV(), exp);
    const param = w.ok ? exp.venueId : encodeInline(exp);
    if (!param) { setMessage(`Could not open the game: ${w.ok ? 'the court is too big to send' : w.error}`); return; }
    // place=home: the mode's place pick (a saved Clay, say) must not re-light a Studio venue (moodResolver reads it)
    window.open(`${t.route(param)}&place=home`, '_blank', 'noopener');
    setMessage(`Opened ${t.label} with “${venue.name}”.`);
  };

  const SaveIcon = studio.saveState === 'saved' ? Check : studio.saveState === 'no-storage' ? CloudOff : studio.saveState === 'error' ? AlertTriangle : Save;

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col" style={{ background: C.bg, color: C.text }} data-testid="nexus-studio">
      {track === 'venue' && <SkipLinks />}
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-1.5" style={{ borderColor: C.line, background: C.surface }}>
        {/* STUDIO-EASY: the Studio fills the screen (no app bar above it), so it carries its own way back */}
        <Link href="/play" aria-label="Leave the Studio" title="Back to FEL" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-white/5" style={{ color: C.dim }}><ArrowLeft className="h-4 w-4" aria-hidden /></Link>
        <h1 className="font-display text-[13px] font-bold uppercase tracking-[0.22em]" style={{ color: C.cyan }}>Nexus Studio</h1>
        <input aria-label="Project name" value={doc.name} maxLength={60} onChange={(e) => studio.run(renameProject(e.target.value || 'Untitled project'))} onBlur={studio.seal}
          className="w-32 rounded border bg-transparent px-2 py-0.5 text-[12px] outline-none md:w-44 focus:border-[color:var(--fel-cyan)]" style={{ borderColor: C.line }} />
        <nav className="flex flex-wrap gap-1 md:ml-2" role="tablist" aria-label="Studio tracks">
          {TRACKS.map((t) => {
            const Icon = TRACK_ICON[t.id];
            return (
              <button key={t.id} type="button" role="tab" aria-selected={track === t.id} onClick={() => setTrack(t.id)} title={t.phase}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] max-md:min-h-10 ${t.id === 'ai' ? 'max-md:order-first' : ''}`}
                style={{ background: track === t.id ? 'rgba(0,229,255,0.12)' : 'transparent', color: track === t.id ? C.cyan : C.dim }}>
                <Icon className="h-3.5 w-3.5" aria-hidden /> {t.label}
              </button>
            );
          })}
        </nav>
        <span className="flex flex-wrap items-center gap-1 md:ml-auto">
          <ToolButton title="Projects: new, open" onClick={showProjects} active={projects}><FolderOpen className="h-4 w-4" /><span className="hidden xl:inline">Projects</span></ToolButton>
          <ToolButton title="Help and keys" shortcut="?" onClick={() => setHelp(true)}><CircleHelp className="h-4 w-4" /><span className="hidden xl:inline">Help</span></ToolButton>
          <ToolButton title={studio.undoLabel ? `Undo ${studio.undoLabel}` : 'Undo'} shortcut="Ctrl+Z" disabled={!studio.canUndo} onClick={studio.undo}><Undo2 className="h-4 w-4" /></ToolButton>
          <ToolButton title={studio.redoLabel ? `Redo ${studio.redoLabel}` : 'Redo'} shortcut="Ctrl+Shift+Z" disabled={!studio.canRedo} onClick={studio.redo}><Redo2 className="h-4 w-4" /></ToolButton>
          <span className="mx-1 flex items-center gap-1 text-[12px]" style={{ color: studio.saveState === 'saved' ? C.dim : studio.saveState === 'error' || studio.saveState === 'no-storage' ? C.ember : C.gold }} title={studio.saveError ?? undefined} data-testid="save-state">
            <SaveIcon className="h-3.5 w-3.5" aria-hidden /> {SAVE_LABEL[studio.saveState]}
          </span>
          <ToolButton title="Save now" shortcut="Ctrl+S" onClick={() => studio.save()}><Save className="h-4 w-4" /></ToolButton>
          <ToolButton title="Export the project (.nexus.json)" onClick={doExport}><Download className="h-4 w-4" /><span className="hidden xl:inline">Export</span></ToolButton>
          <ToolButton title="Import a project" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /><span className="hidden xl:inline">Import</span></ToolButton>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ''; }} />
          {track !== 'ai' && (
            <button type="button" onClick={playtest} className="ml-1 flex items-center gap-1.5 rounded-md px-3 py-1 text-[12px] font-semibold" style={{ background: C.cyan, color: '#050505' }} title="Play your court in the game (practice: not ranked, earns nothing)">
              <Play className="h-3.5 w-3.5" aria-hidden /> Play-test in {targetOf(venue?.base.target ?? '')?.label ?? 'mode'}
            </button>
          )}
        </span>
      </header>
      {message && (
        <div className="flex items-center justify-between border-b px-3 py-1 text-[12px]" style={{ borderColor: C.line, color: C.gold }} role="status">
          <span>{message}</span>
          <button type="button" onClick={() => setMessage(null)} className="text-[12px]" style={{ color: C.dim }}>Dismiss</button>
        </div>
      )}
      {track === 'venue' && <VenueEditor studio={studio} onHandle={onHandle} />}
      {track === 'venue' && guide && venue && (
        // over the viewport: above the budget strip on a desktop (right of the 260 px left panel), a bottom card on a phone
        <div className="pointer-events-none fixed inset-x-2 bottom-2 z-30 md:inset-x-auto md:bottom-12 md:left-[276px]">
          <FirstCourt venue={venue} run={studio.run} onPlaced={(ids) => studio.setSelection(ids)}
            onWatch={() => editor.current?.previewIntro('walkIn') ?? false}
            onFinish={() => endGuide('done')} onSkip={() => endGuide('skipped')} onPlay={playtest} />
        </div>
      )}
      {help && <HelpSheet onClose={() => setHelp(false)} onGuide={startGuide} />}
      {projects && (
        <ProjectsSheet open={doc} shelf={shelf} error={projErr} onNew={newProject} onOpen={(id) => switchTo(id)} onExport={doExport} onClose={() => setProjects(false)}
          onDelete={(id) => { const r = removeShelved(browserKV(), id); if (!r.ok) setProjErr(r.error); setShelf(listShelf(browserKV())); }} />
      )}
      {track === 'ai' && (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto md:grid md:grid-cols-[minmax(320px,420px)_minmax(0,1fr)] md:overflow-visible">
          <aside className="min-h-0 shrink-0 border-b md:overflow-y-auto md:border-b-0 md:border-r" style={{ borderColor: C.line, background: C.surface }}>
            <AiVenuePanel studio={studio} onApplied={() => { setTrack('venue'); setMessage(`CELL’s edits are in “${venue?.name ?? 'the venue'}” as one step — Undo takes them back.`); }}
              onBuildByHand={() => setTrack('venue')} onGuide={startGuide} />
          </aside>
          {/* CELL's game-file builder, unchanged (its file holds the ABACUS guard lines) */}
          <button type="button" onClick={() => setCellOpen((v) => !v)} aria-expanded={cellOpen} className="min-h-11 border-b px-3 text-left text-[12px] md:hidden" style={{ borderColor: C.line, color: C.dim }} data-testid="cell-toggle">
            {cellOpen ? 'Hide' : 'Show'} CELL’s game-file builder
          </button>
          <div className={`${cellOpen ? 'block' : 'hidden'} relative min-h-[70dvh] min-w-0 overflow-hidden md:block md:min-h-0`}><StudioShell /></div>
        </div>
      )}
      {track === 'characters' && <CharactersTrack studio={studio} onPreview={() => setTrack('venue')} />}
      {track === 'scripts' && <ScriptsTrack studio={studio} />}
    </div>
  );
}

/** STUDIO-EASY (coordinator decision 7): skip links, first in the Tab order and hidden until focused — straight to the 3D view, the
 *  settings (inspector) or the things to add. On a phone the panel's sheet is opened first. */
export const SKIP_TARGETS: ReadonlyArray<{ label: string; sheet?: string; focus: string }> = [
  { label: 'Skip to the 3D view', focus: '[data-testid=studio-canvas]' },
  { label: 'Skip to settings', sheet: '[data-testid=sheet-inspect]', focus: '#studio-inspector' },
  { label: 'Skip to things to add', sheet: '[data-testid=sheet-assets]', focus: '[data-testid=asset-list] button[tabindex="0"]' },
];

function SkipLinks() {
  const go = (t: (typeof SKIP_TARGETS)[number]) => {
    const tab = t.sheet ? document.querySelector<HTMLElement>(t.sheet) : null;
    if (tab && tab.offsetParent !== null && tab.getAttribute('aria-selected') !== 'true') tab.click();
    requestAnimationFrame(() => document.querySelector<HTMLElement>(t.focus)?.focus());
  };
  return (
    <nav aria-label="Skip links" className="contents">
      {SKIP_TARGETS.map((t) => (
        <button key={t.label} type="button" onClick={() => go(t)}
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:px-4 focus:py-3 focus:text-[14px] focus:font-semibold"
          style={{ background: C.cyan, color: '#050505' }}>{t.label}</button>
      ))}
    </nav>
  );
}
