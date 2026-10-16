'use client';

// The Studio's state: one command stack (lib/nexus-studio/commands.ts) in a reducer, the selection beside it (UI state,
// never in the document), and the save loop — load from this device on mount, autosave a beat after the last change and
// when the page hides, and say plainly when the device is not keeping it.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  createStack, execute, undo, redo, seal, markSaved, isDirty, canUndo, canRedo, undoLabel, redoLabel,
  type Command, type CommandStack,
} from '@/lib/nexus-studio/commands';
import { activeVenue, newProject, newVenue, type StudioProject, type StudioVenue } from '@/lib/nexus-studio/doc';
import { AUTOSAVE_MS, browserKV, loadProject, saveProject } from '@/lib/nexus-studio/storage';
import { DEFAULT_TARGET, PLAYTEST_TARGETS } from '@/lib/nexus-studio/targets';
import { resolveCast, type ExportCast } from '@/lib/nexus-studio/cast';

type Action =
  | { type: 'exec'; cmd: Command }
  | { type: 'undo' } | { type: 'redo' } | { type: 'seal' }
  | { type: 'saved' }
  | { type: 'open'; doc: StudioProject };

function reducer(s: CommandStack, a: Action): CommandStack {
  try {
    switch (a.type) {
      case 'exec': return execute(s, a.cmd);
      case 'undo': return undo(s);
      case 'redo': return redo(s);
      case 'seal': return seal(s);
      case 'saved': return markSaved(s);
      case 'open': return markSaved(createStack(a.doc));
    }
  } catch (e) {
    // a command that cannot apply (a stale id after an undo) is dropped, never half-applied (applyOps is all-or-nothing)
    console.warn('[NEXUS-STUDIO] command refused:', e instanceof Error ? e.message : e);
    return s;
  }
}

/** The project a first visit starts on: one venue over Tiebreak's court. */
export function starterProject(): StudioProject {
  const t = PLAYTEST_TARGETS[DEFAULT_TARGET];
  return newProject('My first venue', newVenue('Center Court remix', { spec: t.spec, target: t.key }, 'goldenHour'));
}

export type SaveState = 'saved' | 'unsaved' | 'saving' | 'no-storage' | 'error';

export function useStudio() {
  const [stack, dispatch] = useReducer(reducer, null, () => createStack(starterProject()));
  const [selected, setSelected] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const stackRef = useRef(stack); stackRef.current = stack;

  // open what this device kept, once
  useEffect(() => {
    const kv = browserKV();
    if (!kv) { setSaveState('no-storage'); setLoaded(true); return; }
    const p = loadProject(kv);
    if (p) dispatch({ type: 'open', doc: p });
    setLoaded(true);
  }, []);

  const save = useCallback((): boolean => {
    const s = stackRef.current;
    const r = saveProject(browserKV(), s.doc);
    if (r.ok) { dispatch({ type: 'saved' }); setSaveState('saved'); setSaveError(null); return true; }
    setSaveState(browserKV() ? 'error' : 'no-storage'); setSaveError(r.error);
    return false;
  }, []);

  const dirty = isDirty(stack);
  // autosave a beat after the last change
  useEffect(() => {
    if (!loaded || !dirty) return;
    setSaveState((st) => (st === 'no-storage' ? st : 'unsaved'));
    const t = setTimeout(() => { setSaveState((st) => (st === 'no-storage' ? st : 'saving')); save(); }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [stack, dirty, loaded, save]);
  // and when the page hides or closes
  useEffect(() => {
    const flush = () => { if (isDirty(stackRef.current)) save(); };
    const vis = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', vis);
    return () => { window.removeEventListener('beforeunload', flush); document.removeEventListener('visibilitychange', vis); };
  }, [save]);

  const run = useCallback((cmd: Command) => dispatch({ type: 'exec', cmd }), []);
  const venue: StudioVenue | null = useMemo(() => activeVenue(stack.doc), [stack.doc]);
  // a selection that no longer exists (deleted, undone away, another venue) is dropped
  useEffect(() => { if (selected && !venue?.objects.some((o) => o.id === selected)) setSelected(null); }, [venue, selected]);

  return {
    stack, doc: stack.doc, venue, selected, setSelected, run,
    undo: () => dispatch({ type: 'undo' }), redo: () => dispatch({ type: 'redo' }), seal: () => dispatch({ type: 'seal' }),
    open: (doc: StudioProject) => { dispatch({ type: 'open', doc }); setSelected(null); },
    canUndo: canUndo(stack), canRedo: canRedo(stack), undoLabel: undoLabel(stack), redoLabel: redoLabel(stack),
    dirty, saveState, saveError, save, loaded,
  };
}

export type StudioApi = ReturnType<typeof useStudio>;

/** Track 3: the active venue's cast, decoded (share codes decode asynchronously; a code that will not decode casts nothing). */
export function useResolvedCast(doc: StudioProject, venue: StudioVenue | null): ExportCast | null {
  const [cast, setCast] = useState<ExportCast | null>(null);
  // studio-4b: the crowd's characters too (their codes and names), so seating one or editing its look re-resolves the cast
  const ids = venue?.cast ? [venue.cast.player ?? '', ...(venue.cast.crowd ?? [])] : [];
  const key = ids.some(Boolean) ? ids.map((id) => { const c = doc.characters.find((x) => x.id === id); return `${id}|${c?.lookCode ?? ''}|${c?.name ?? ''}`; }).join('§') : '';
  useEffect(() => {
    let live = true;
    if (!key || !venue) { setCast(null); return; }
    void resolveCast(doc, venue).then((c) => { if (live) setCast(c); });
    return () => { live = false; };
    // the key names everything the cast reads
  }, [key]);
  return cast;
}
