'use client';
// useStudioProject — the Academy's open project, kept (MUSIC-SUITE P3, "Keep my work", 2026-09-25).
//
// StudioMode holds its work in ONE StudioProject (StudioProject.ts) through this hook: the store is opened once per page
// (IndexedDB, or this tab's memory — studioStore.ts), the open project is restored before the splash lets the player in,
// every edit is autosaved (debounced 400 ms; flushed when the tab hides, on pagehide, on unmount — GameShell's REPLAY
// remounts the room, game-shell.tsx is held — and before another project opens), and MY PROJECTS' operations live here.
//
// The streak post (PLAN default: STUDIO time counts) is on only when the room is mounted by GameShell: the shell mounts a
// game only once it has the signed-in player's profile, and it is the one host that provides ReplayInPlaceContext.
// /dev/music mounts the room bare (no auth, database offline), so there the context is null and nothing posts.
//
// MUSIC-SUITE P3 FIX PASS (2026-09-25) — what the review found, and what this hook does now:
//   * PER PLAYER. The store, the open project, the rescue slot and the creation day were the device's: on a shared tablet
//     player B opened player A's project, autosaved over it, could play A's voice takes and delete A's projects. The
//     store is scoped to `playerId` (studioStore forPlayer), and so are the rescue slot and the creation day.
//   * A SWITCH NEVER DROPS UNSAVED WORK. NEW / OPEN / DUPLICATE (of another project) / REMIX flushed only what was
//     pending, then baselined over a project whose save had been REFUSED (a full device) — the edits since the last good
//     save gone, and the error line replaced by "Saved on this device". A switch now retries the save first and, if the
//     open project is still not saved, is refused with a line and SWITCH ANYWAY / STAY (`blocked`).
//   * TWO TABS. The store refuses a stale save (StoreConflictError); the room says so and offers RELOAD / SAVE AS A COPY
//     (`conflict`, ops.reload / ops.saveCopy). The open project is re-checked when the tab comes back (visibilitychange,
//     pageshow from the back-forward cache) and when another tab or mount saves it (BroadcastChannel 'fel-studio'): with
//     nothing unsaved here it reloads the newer copy and says so; with unsaved edits here the conflict line shows.
//   * A RECORDING LANDS WHERE IT WAS MADE. ops.amend writes a take or a Flip source into the project it was recorded in
//     when that is no longer the open one (StudioMode: onTake / flipChange).
//   * RESCUE SLOTS. The restore reads BOTH slots (localStorage and sessionStorage — a memory-fallback page keeps its rescue
//     in sessionStorage and the next load may get IndexedDB), a rescue carries the base it was made on (a stale one opens
//     as a copy), a refused one is kept aside and said, a rescued open is always said, and deleting the open project
//     drops its rescue (it came back on the next load).
//   * navigator.storage.persist() after the first save (best-effort storage is evicted under pressure, Safari caps script
//     storage at 7 days); `persisted` false shows a quiet hint in MY PROJECTS.
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ReplayInPlaceContext } from '@/components/games/replay-in-place';
import {
  duplicateProject, migrateProject, newAudioKey, newProject, projectFromSeed, refusalLine, renameProject, repairLine,
  type AudioRef, type ProjectSeed, type StudioProject,
} from './StudioProject';
import {
  CreationLog, ProjectAutosave, StoreConflictError, audioBytes, clearRescue, conflictOf, errorText, keepAudio, openStudioStore,
  postCreationSession, readRescue, refusedRescueKey, rescueKey, restoreProject, saveFailureLine, saveStatus, writeRescue,
  type AutosaveState, type ConflictKind, type ProjectListing, type RescueStorage, type StudioStore,
} from './studioStore';

/**
 * The unload rescue's storage (studioStore.ts writeRescue), or null where reading it throws (blocked site data). With the
 * device store it is localStorage (only the unsaved tail goes there, cleared once the store has it); on the memory
 * fallback it is sessionStorage — this tab only, so the room's "a reload keeps the open project" stays exactly true.
 */
function rescueStorage(persistent: boolean): RescueStorage | null {
  try { return typeof window === 'undefined' ? null : persistent ? window.localStorage : window.sessionStorage; } catch { return null; }
}
/** MUSIC-SUITE P3 FIX PASS: both slots — a restore reads the one this load did not write too. */
function allRescueStorages(): RescueStorage[] {
  return [rescueStorage(true), rescueStorage(false)].filter((s): s is RescueStorage => !!s);
}

/** MUSIC-SUITE P3 FIX PASS: who the store belongs to when the room was not told (a bare mount): nobody signed in. */
export const GUEST_PLAYER = 'guest';
/** MUSIC-SUITE P3 FIX PASS: the channel tabs (and remounts) tell each other a project was saved on. */
export const STUDIO_CHANNEL = 'fel-studio';

declare global {
  interface Window {
    /** Dev/probe hook: the open project and how it is kept. */
    __FEL_PROJECT__?: {
      id: string; title: string; generation: number; store: 'indexeddb' | 'memory' | null; phase: string; savedAt: number | null;
      status: string; notice: string | null; projects: number; creationPosts: number; canPost: boolean;
      /** MUSIC-SUITE P3 FIX PASS */
      player: string; conflict: string | null; blocked: string | null;
    };
  }
}

export interface ProjectOps {
  /** A new project. `seed` (a remix) is saved at once; a blank one is saved on its first edit. MUSIC-SUITE P3: a remix's
   *  seed carries its Flip rows' chops (studioEdit.remixSeed), so its Flip rows play the published sounds. MUSIC-SUITE P3
   *  FIX PASS: resolves to the new project's id (null when it did not open — the open one is unsaved, or it failed). */
  create(seed?: ProjectSeed, opts?: SwitchOpts): Promise<string | null>;
  open(id: string, opts?: SwitchOpts): Promise<void>;
  rename(id: string, title: string): Promise<void>;
  duplicate(id: string, opts?: SwitchOpts): Promise<void>;
  remove(id: string): Promise<void>;
  /** MUSIC-SUITE P3 FIX PASS: open the stored copy of the open project again (another tab saved it), dropping this tab's edits. */
  reload(): Promise<void>;
  /** MUSIC-SUITE P3 FIX PASS: keep what is on screen as a new project (a conflict, a project deleted elsewhere). */
  saveCopy(): Promise<void>;
  /** MUSIC-SUITE P3 FIX PASS: change a project that is not open (a recording that finished after another one opened). */
  amend(id: string, fn: (p: StudioProject) => StudioProject, what: string): Promise<boolean>;
}
/** MUSIC-SUITE P3 FIX PASS: `discard` = the player chose SWITCH ANYWAY (the open project's unsaved edits go). */
export interface SwitchOpts { discard?: boolean }

export interface ProjectRoom {
  project: StudioProject;
  /** The one way the room edits its work. */
  update: (fn: (p: StudioProject) => StudioProject) => void;
  /** The store is open and the first project is in (the splash waits for it). */
  restored: boolean;
  /** Bumps whenever a different project is opened (the first restore included): the room reloads the engine's sounds. */
  generation: number;
  status: { tone: 'ok' | 'warn' | 'error'; line: string };
  /** A one-off line from opening (a refusal, the repairs made); cleared by the next open. */
  notice: string | null;
  projects: ProjectListing[];
  refreshProjects: () => void;
  ops: ProjectOps;
  /** Keep a recording's bytes (this session at once, the store behind it); the ref is what the project holds. */
  saveAudio: (blob: Blob) => Promise<AudioRef>;
  loadAudio: (ref: AudioRef) => Promise<ArrayBuffer | null>;
  /** A render happened (the song render, a publish): counts toward the day's creation session. */
  noteCreation: () => void;
  /** MUSIC-SUITE P3 FIX PASS: the open project's save was refused on purpose (another tab, a newer FEL, another player). */
  conflict: ConflictKind | null;
  /** MUSIC-SUITE P3 FIX PASS: a switch refused because the open project is not saved — SWITCH ANYWAY / STAY. */
  blocked: { line: string; discard: () => void; stay: () => void } | null;
  /** MUSIC-SUITE P3 FIX PASS: the browser's answer to navigator.storage.persisted() (null = not known / not asked). */
  persisted: boolean | null;
  /** MUSIC-SUITE P3 FIX PASS: is `id` the open project of a mounted room (else a recording goes through ops.amend)? */
  isOpen: (id: string) => boolean;
}

/**
 * MUSIC-SUITE P3 (2026-09-25, tier-honesty-editing): `keepAudio` names audio the store must keep although no project
 * references it — a published song's Flip chops (StudioMode passes studioEdit.publishedAudioKeys of the library), so the
 * song still remixes to the same sounds after the project it came from is deleted. Read at each sweep / delete.
 * MUSIC-SUITE P3 FIX PASS: and the audio the undo history can bring back. `playerId` scopes everything to the player.
 */
export function useStudioProject(say: (msg: string) => void, opts: { keepAudio?: () => ReadonlySet<string>; playerId?: string | null } = {}): ProjectRoom {
  const canPost = useContext(ReplayInPlaceContext) !== null;
  const player = opts.playerId && opts.playerId.length <= 128 ? opts.playerId : GUEST_PLAYER;
  const slot = rescueKey(player);
  const [project, setProject] = useState<StudioProject>(() => newProject({ now: Date.now() }));
  const projectRef = useRef(project);
  projectRef.current = project;
  const [restored, setRestored] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [save, setSave] = useState<AutosaveState>({ phase: 'idle', savedAt: null, error: null, projectId: null });
  const [audioError, setAudioError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectListing[]>([]);
  const [persistent, setPersistent] = useState(true);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<ProjectRoom['blocked']>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const storeRef = useRef<StudioStore | null>(null);
  const autosaveRef = useRef<ProjectAutosave | null>(null);
  const creationRef = useRef<CreationLog | null>(null);
  const mountedRef = useRef(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const askedPersist = useRef(false);
  const sayRef = useRef(say);
  sayRef.current = say;
  const keepRef = useRef(opts.keepAudio);
  keepRef.current = opts.keepAudio;
  const kept = useCallback((): ReadonlySet<string> => { try { return keepRef.current?.() ?? new Set(); } catch { return new Set(); } }, []);

  const refreshProjects = useCallback((): void => {
    const s = storeRef.current;
    if (!s) return;
    void s.listProjects().then(setProjects, () => { /* the list is a view; the status line carries failures */ });
  }, []);

  /** Tell other tabs (and a remount in this one) that a project of this player was saved. */
  const announce = useCallback((id: string): void => {
    // an unmounted room (a take kept by ops.amend after a REPLAY remount) has closed its channel: a one-off one tells the
    // new mount, so it opens the take instead of refusing its next save as "changed in another tab"
    try {
      const own = channelRef.current;
      const ch = own ?? (typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(STUDIO_CHANNEL));
      ch?.postMessage({ type: 'saved', owner: player, id });
      if (ch && ch !== own) ch.close();
    } catch { /* no channel: the visibility re-check still runs */ }
  }, [player]);

  /** The browser keeps FEL's storage only best-effort unless asked; ask once, after the first save (a user gesture came first). */
  const askPersist = useCallback((): void => {
    if (askedPersist.current) return;
    askedPersist.current = true;
    try {
      const st = typeof navigator !== 'undefined' ? navigator.storage : undefined;
      if (!st?.persist) return;
      void st.persist().then((ok) => setPersisted(ok), () => undefined);
    } catch { /* not offered here */ }
  }, []);

  // open the store, restore, start autosaving — once per mount (a REPLAY remount runs it again and finds the work)
  useEffect(() => {
    let alive = true;
    mountedRef.current = true;
    void (async () => {
      const page = await openStudioStore();
      if (!alive) return;
      const store = page.forPlayer(player);
      storeRef.current = store;
      setPersistent(store.persistent);
      setFallbackReason(store.fallbackReason);
      const autosave = new ProjectAutosave({
        save: (p, base) => store.saveProject(p, { open: true, base }),
        now: Date.now,
        onState: (s) => {
          if (s.phase === 'saved') for (const st of allRescueStorages()) clearRescue(st, s.projectId, slot);   // the store has it: the rescue is spent
          if (s.phase === 'saved' && s.projectId) announce(s.projectId);
          if (!alive) return;
          setSave(s);
          if (s.phase === 'saved') { setLoaded(true); creationRef.current?.note(); refreshProjects(); if (store.persistent) askPersist(); }
        },
      });
      autosaveRef.current = autosave;
      // the creation day is the player's (the store view's meta), and nothing posts for a player the room does not know
      creationRef.current = new CreationLog({ enabled: canPost && player !== GUEST_PLAYER, meta: store, post: () => postCreationSession(), now: Date.now });
      const rescues = allRescueStorages().map((st) => readRescue(st, slot));
      const r = await restoreProject(store, { now: Date.now(), rescue: rescues });
      if (!alive) { autosave.dispose(); return; }
      let line = r.notice;
      if (r.refusedRescue) {
        // a newer FEL's unsaved edits: never opened by this one, never thrown away — kept aside, and said
        try { rescueStorage(true)?.setItem(refusedRescueKey(player), JSON.stringify(r.refusedRescue)); } catch { /* the line still says it */ }
        line = [line, 'Unsaved changes kept when the page closed were written by a newer version of FEL — they are kept aside on this device, not opened here.'].filter(Boolean).join(' ');
      }
      if (!r.rescued) for (const st of allRescueStorages()) clearRescue(st, null, slot);   // older than what the store holds (or none)
      // opening is not an edit (a fresh blank project is written on its first change) — but a rescue is newer than the
      // store's copy, so it is written at once (against the stored copy it was made on)
      autosave.baseline(r.rescued ? null : r.project, r.storedAt);
      setProject(r.project);
      setLoaded(r.loaded);
      setNotice(line);
      setGeneration((g) => g + 1);
      setRestored(true);
      refreshProjects();
      void store.sweepAudio(Date.now(), undefined, kept()).catch(() => undefined);
      try { const st = navigator.storage; if (st?.persisted) void st.persisted().then((ok) => { if (alive) setPersisted(ok); }, () => undefined); } catch { /* not offered */ }
    })();
    return () => {
      alive = false;
      mountedRef.current = false;
      const a = autosaveRef.current;
      autosaveRef.current = null;
      if (a) { void a.flush().finally(() => a.dispose()); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // every edit schedules a save (a render that changed nothing writes nothing: the autosave compares content)
  useEffect(() => { if (restored) autosaveRef.current?.schedule(project); }, [project, restored]);

  /** Put `p` on the floor as the open project (already saved, or a blank that needs no save). */
  const show = useCallback((p: StudioProject, o: { saved: boolean; storedAt: number | null; notice?: string | null }): void => {
    autosaveRef.current?.baseline(o.saved ? p : p.tracks.some((t) => t.pattern.some(Boolean)) ? null : p, o.storedAt);
    setProject(p);
    setLoaded(o.saved);
    setNotice(o.notice ?? null);
    setAudioError(null);
    setBlocked(null);
    setGeneration((g) => g + 1);
  }, []);

  /**
   * MUSIC-SUITE P3 FIX PASS: is the stored copy of the open project newer than the one this tab builds on? With nothing
   * unsaved here it opens (and says so); with unsaved edits here the save is marked refused, so the conflict line and
   * RELOAD / SAVE AS A COPY show before anything is written.
   */
  const recheck = useCallback(async (): Promise<void> => {
    const s = storeRef.current, a = autosaveRef.current;
    if (!s || !a || !s.persistent) return;
    const cur = projectRef.current;
    const base = a.storedAt;
    if (typeof base !== 'number') return;                             // never stored from here: nothing to compare
    let rec;
    try { rec = await s.loadProject(cur.id); } catch { return; }
    if (projectRef.current.id !== cur.id || autosaveRef.current !== a) return;
    if (rec && rec.updatedAt <= base) return;
    if (!rec) {                                                        // deleted in another tab
      if (a.current.phase !== 'error') { a.baseline(null, base); a.schedule(projectRef.current); await a.flush(); }
      return;
    }
    if (!a.unsaved()) {
      const m = migrateProject(rec.body, { now: Date.now() });
      if (!m.ok) return;
      show(m.project, { saved: true, storedAt: rec.updatedAt, notice: `"${m.project.title}" was saved in another tab — this is that version now.` });
      return;
    }
    await a.flush();                                                   // the store refuses it: the conflict line shows
  }, [show]);
  const recheckRef = useRef(recheck); recheckRef.current = recheck;

  // the tab going away writes what is pending now — and, because an IndexedDB write started as the page unloads is
  // dropped (measured: an edit then a reload 42 ms later lost the edit), keeps it synchronously too (the unload rescue).
  // MUSIC-SUITE P3 FIX PASS: the tab coming back (or out of the back-forward cache) re-checks the open project.
  useEffect(() => {
    const flush = (): void => {
      const a = autosaveRef.current;
      if (!a) return;
      // on the memory fallback "saved" is only this page's memory, so the whole open project is rescued into this tab's
      // sessionStorage (a reload keeps the grid wherever that works; its takes' audio does not come back, and says so)
      const persistentNow = storeRef.current?.persistent ?? true;
      const u = a.unsaved() ?? (persistentNow ? null : projectRef.current);
      if (u) writeRescue(rescueStorage(persistentNow), u, Date.now(), { key: slot, base: a.storedAt ?? null, inflightAt: a.inflightAt, store: persistentNow ? 'indexeddb' : 'memory' });
      void a.flush();
    };
    const onVis = (): void => {
      if (document.visibilityState === 'hidden') flush();
      else void recheckRef.current();
    };
    const onShow = (e: PageTransitionEvent): void => { if (e.persisted) void recheckRef.current(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    window.addEventListener('pageshow', onShow);
    let ch: BroadcastChannel | null = null;
    try {
      ch = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(STUDIO_CHANNEL);
      if (ch) ch.onmessage = (ev: MessageEvent) => {
        const m = ev.data as { type?: string; owner?: string; id?: string } | null;
        if (m?.type === 'saved' && m.owner === player && m.id === projectRef.current.id) void recheckRef.current();
      };
    } catch { ch = null; }
    channelRef.current = ch;
    return () => {
      document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', flush); window.removeEventListener('pageshow', onShow);
      try { ch?.close(); } catch { /* closed */ }
      channelRef.current = null;
    };
  }, [slot, player]);

  const update = useCallback((fn: (p: StudioProject) => StudioProject): void => { setProject((p) => fn(p)); }, []);

  const guard = useCallback(async <T>(what: string, fn: (s: StudioStore) => Promise<T>, fallback: T): Promise<T> => {
    const s = storeRef.current;
    if (!s) { sayRef.current('Your projects are still opening — try again in a moment'); return fallback; }
    try { return await fn(s); }
    catch (e) { sayRef.current(saveFailureLine(e, what)); return fallback; }
    finally { refreshProjects(); }
  }, [refreshProjects]);

  /** Drop the rescue slots for `id` (a project deleted here, or edits the player chose to discard). */
  const dropRescue = useCallback((id: string): void => { for (const st of allRescueStorages()) clearRescue(st, id, slot); }, [slot]);

  const opsRef = useRef<ProjectOps | null>(null);
  /**
   * MUSIC-SUITE P3 FIX PASS: before another project opens, the open one is saved — the refused save tried again — and if
   * it still is not, the switch is refused with the reason and SWITCH ANYWAY / STAY (`retry` runs the switch discarding).
   */
  const readyToSwitch = useCallback(async (o: SwitchOpts | undefined, retry: () => void): Promise<boolean> => {
    const a = autosaveRef.current;
    if (!a) return true;
    await a.flush();
    if (o?.discard) { dropRescue(projectRef.current.id); return true; }
    if (a.current.phase !== 'error') return true;
    const title = projectRef.current.title;
    const line = `"${title}" has changes that are NOT saved (${conflictOf(a.current.error) ? 'another tab saved it' : errorText(a.current.error)}) — switching now would lose them.`;
    setBlocked({ line, discard: () => { setBlocked(null); retry(); }, stay: () => setBlocked(null) });
    sayRef.current(`${line} Free some space or SAVE AS A COPY first — or SWITCH ANYWAY.`);
    return false;
  }, [dropRescue]);

  const ops = useMemo<ProjectOps>(() => {
    const o: ProjectOps = {
      create: (seed, sw) => guard('The new project', async () => {
        if (!(await readyToSwitch(sw, () => void opsRef.current?.create(seed, { discard: true })))) return null;
        const { project: seeded, issues } = projectFromSeed(seed, { now: Date.now(), kit: projectRef.current.kit });
        // a seeded project is saved at once; a blank one on its first edit
        show(seeded, { saved: false, storedAt: null, notice: seed?.tracks ? repairLine(seeded.title, issues) : null });
        if (!seed) sayRef.current('New project — it saves itself as you work');   // a remix says its own line
        return seeded.id;
      }, null),
      open: (id, sw) => guard('Opening that project', async (s) => {
        if (id === projectRef.current.id) return;
        if (!(await readyToSwitch(sw, () => void opsRef.current?.open(id, { discard: true })))) return;
        const rec = await s.loadProject(id);
        const m = migrateProject(rec?.body ?? null, { now: Date.now() });
        if (!m.ok) { sayRef.current(refusalLine(m, rec?.title ?? null).replace(' this is a new project.', ' nothing changed here.')); return; }
        await s.setOpenId(m.project.id);
        show(m.project, { saved: true, storedAt: rec?.updatedAt ?? null, notice: repairLine(m.project.title, m.issues) });
        sayRef.current(`Opened "${m.project.title}"`);
      }, undefined),
      rename: (id, title) => guard('The new name', async (s) => {
        if (id === projectRef.current.id) { setProject((p) => renameProject(p, title)); return; }
        const rec = await s.loadProject(id);
        const m = migrateProject(rec?.body ?? null, { now: Date.now() });
        if (!m.ok || !rec) { sayRef.current("That project can't be read, so it can't be renamed — you can delete it"); return; }
        const renamed = renameProject(m.project, title);
        if (renamed !== m.project) { await s.saveProject({ ...renamed, updatedAt: Date.now() }, { base: rec.updatedAt }); announce(id); }
      }, undefined),
      duplicate: (id, sw) => guard('The copy', async (s) => {
        // a copy of the OPEN project carries what is on screen (its unsaved edits included): nothing is lost by switching
        if (id !== projectRef.current.id && !(await readyToSwitch(sw, () => void opsRef.current?.duplicate(id, { discard: true })))) return;
        if (id === projectRef.current.id) await autosaveRef.current?.flush();
        let src: StudioProject | null = id === projectRef.current.id ? projectRef.current : null;
        if (!src) {
          const m = migrateProject((await s.loadProject(id))?.body ?? null, { now: Date.now() });
          if (!m.ok) { sayRef.current("That project can't be read, so it can't be copied"); return; }
          src = m.project;
        }
        const copy = duplicateProject(src, { now: Date.now() });
        await s.saveProject(copy, { open: true, base: null });
        show(copy, { saved: true, storedAt: copy.updatedAt });
        sayRef.current(`Copied — you're working in "${copy.title}" now`);
      }, undefined),
      remove: (id) => guard('Deleting', async (s) => {
        const isOpen = id === projectRef.current.id;
        if (isOpen) autosaveRef.current?.baseline(null);   // its pending edits go with it
        else await autosaveRef.current?.flush();
        await s.deleteProject(id, kept());
        dropRescue(id);                                   // MUSIC-SUITE P3 FIX PASS: a deleted project never comes back from its rescue
        if (!isOpen) {
          sayRef.current('Project deleted');
          if (autosaveRef.current?.current.phase === 'error') await autosaveRef.current.flush();   // space freed: try the refused save again
          return;
        }
        // the open one went: open the next newest readable project, or a blank one
        const next = (await s.listProjects()).find((l) => l.readable);
        const m = next ? migrateProject((await s.loadProject(next.id))?.body ?? null, { now: Date.now() }) : null;
        if (m?.ok && next) { await s.setOpenId(m.project.id); show(m.project, { saved: true, storedAt: next.updatedAt }); sayRef.current(`Project deleted — opened "${m.project.title}"`); }
        else { show(newProject({ now: Date.now(), kit: projectRef.current.kit }), { saved: false, storedAt: null }); sayRef.current('Project deleted — this is a new one'); }
      }, undefined),
      reload: () => guard('Reloading', async (s) => {
        const cur = projectRef.current;
        const rec = await s.loadProject(cur.id);
        if (!rec) { sayRef.current(`"${cur.title}" is not on this device any more (deleted in another tab) — SAVE AS A COPY keeps what is on screen`); return; }
        const m = migrateProject(rec.body, { now: Date.now() });
        if (!m.ok) { sayRef.current(refusalLine(m, rec.title).replace(' this is a new project.', ' nothing changed here.')); return; }
        dropRescue(cur.id);
        show(m.project, { saved: true, storedAt: rec.updatedAt, notice: repairLine(m.project.title, m.issues) });
        sayRef.current(`Reloaded "${m.project.title}" — the version saved last`);
      }, undefined),
      saveCopy: () => guard('The copy', async (s) => {
        const cur = projectRef.current;
        const copy = duplicateProject(cur, { now: Date.now() });
        await s.saveProject(copy, { open: true, base: null });
        dropRescue(cur.id);
        show(copy, { saved: true, storedAt: copy.updatedAt });
        sayRef.current(`Saved as "${copy.title}" — the other copy of "${cur.title}" is kept as it was`);
      }, undefined),
      amend: (id, fn, what) => guard(what, async (s) => {
        const rec = await s.loadProject(id);
        const m = migrateProject(rec?.body ?? null, { now: Date.now() });
        if (!rec || !m.ok) { sayRef.current(`${what} could not be added to the project it was recorded in — that project is not on this device any more`); return false; }
        await s.saveProject({ ...fn(m.project), updatedAt: Date.now() }, { base: rec.updatedAt });
        announce(id);
        sayRef.current(`${what} was kept in "${m.project.title}", the project it was recorded in`);
        return true;
      }, false),
    };
    return o;
  }, [guard, show, kept, readyToSwitch, dropRescue, announce]);
  opsRef.current = ops;

  const saveAudio = useCallback(async (blob: Blob): Promise<AudioRef> => {
    const ref: AudioRef = { key: newAudioKey(), mime: blob.type || 'application/octet-stream', bytes: blob.size };
    await keepAudio(storeRef.current, blob, ref, (line) => setAudioError(line));
    return ref;
  }, []);
  const loadAudio = useCallback((ref: AudioRef): Promise<ArrayBuffer | null> => audioBytes(storeRef.current, ref), []);
  const noteCreation = useCallback((): void => { creationRef.current?.note(); }, []);
  const isOpen = useCallback((id: string): boolean => mountedRef.current && projectRef.current.id === id, []);

  const status = useMemo(
    () => saveStatus({ persistent, phase: save.phase, savedAt: save.savedAt, error: save.error, audioError, loaded, fallbackReason }),
    [persistent, save, audioError, loaded, fallbackReason],
  );
  const conflict = save.phase === 'error' ? conflictOf(save.error) : null;

  useEffect(() => {
    window.__FEL_PROJECT__ = {
      id: project.id, title: project.title, generation, store: storeRef.current ? storeRef.current.kv.kind : null,
      phase: save.phase, savedAt: save.savedAt, status: status.line, notice, projects: projects.length,
      creationPosts: creationRef.current?.posts ?? 0, canPost, player, conflict, blocked: blocked?.line ?? null,
    };
  }, [project.id, project.title, generation, save, status, notice, projects, canPost, player, conflict, blocked]);

  // say a store that could not be opened once, where the player will read it (the status line keeps saying it)
  useEffect(() => {
    if (restored && storeRef.current?.fallbackReason) console.info(`[studio] keeping work in this tab only: ${errorText(storeRef.current.fallbackReason)}`);
  }, [restored]);

  return {
    project, update, restored, generation, status, notice, projects, refreshProjects, ops, saveAudio, loadAudio, noteCreation,
    conflict, blocked, persisted, isOpen,
  };
}

/** Tests: the error a refused save carries (re-exported so the room can name it without importing the store). */
export { StoreConflictError };
