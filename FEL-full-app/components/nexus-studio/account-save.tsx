'use client';

// SAVE TO ACCOUNT, the Studio's panel (docs/NEXUS-STUDIO-SAVE.md §6; owner answers Q0–Q9, 2026-10-17). A status button in
// the title bar and, under it, the account's projects. The device save beside it is unchanged: this is a second layer.
//
//   - HIDDEN unless GET /api/studio/projects answers for this account AND either saving is switched on
//     (STUDIO_CLOUD_SAVE_ENABLED) or the account already has saved projects (which it can always open and delete).
//   - "Save to my account" is a click, never automatic (a shared browser's working project may be someone else's).
//   - After that, changes go up at most every 20 s (cloudSync.ts PUSH_MS) and when the page hides; a change made on
//     another device comes down; different things changed on both sides merge (one undoable step); the same thing changed
//     on both sides is a CONFLICT the creator resolves: keep both (default), use this device's, or use the account's.
//   - Opening another saved project first asks when the working one holds work the account does not have.
//   - Teens 13+ and adults may save; for anyone else (and with saving switched off) the panel says so neutrally (no age).
// Every document change this panel makes is ONE undoable command (replaceProject), like an import.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Cloud, CloudOff, CloudUpload, FolderOpen, Loader2, Trash2 } from 'lucide-react';
import {
  deviceSync, fetchAccountApi, hasUnsavedWork, keepBothSides, open, push, pushDelay, reconcile, removeFromAccount, saveNew,
  useMine, useTheirs, type AccountApi, type AccountMeta, type AccountQuota, type ListResult, type Outcome, type SyncCtx,
} from '@/lib/nexus-studio/cloudSync';
import { projectFingerprint } from '@/lib/nexus-studio/cloudSave';
import type { Command } from '@/lib/nexus-studio/commands';
import type { StudioProject } from '@/lib/nexus-studio/doc';
import { browserKV, type KV } from '@/lib/nexus-studio/storage';
import type { StudioApi } from './use-studio';
import { C } from './ui';

export type AccountStatus = 'hidden' | 'idle' | 'offer' | 'saving' | 'in-account' | 'pending' | 'offline' | 'conflict' | 'deleted-elsewhere' | 'error';

export interface AccountState {
  status: AccountStatus;
  saving: { enabled: boolean; allowed: boolean };
  projects: AccountMeta[];
  quota: AccountQuota | null;
  note: string | null;
  conflict: { theirs: StudioProject; theirsRev: number; conflicts: string[] } | null;
  confirm: { kind: 'open' | 'delete'; projectId: string; name: string } | null;
  panelOpen: boolean;
  busy: boolean;
  currentId: string;
}

export const INITIAL_ACCOUNT_STATE: AccountState = {
  status: 'hidden', saving: { enabled: false, allowed: false }, projects: [], quota: null, note: null, conflict: null,
  confirm: null, panelOpen: false, busy: false, currentId: '',
};

const replace = (project: StudioProject, label: string): Command => ({ label, ops: [{ op: 'replaceProject', project }] });

/** Plain words for the route's error codes. */
export function accountErrorText(error: string): string {
  switch (error) {
    case 'project_too_large': return 'This project is too big to save to your account (1 MB). It is still saved on this device — export it to keep a copy.';
    case 'quota_projects': return 'Your account holds 20 projects. Delete one to save another.';
    case 'quota_bytes': return 'Your account is full (8 MB). Delete a project to save more.';
    case 'studio_save_unavailable': return 'Saving to your account isn’t available for this account. Your project is saved on this device — export it to keep a copy.';
    case 'rate_limited': return 'Saving is busy — it will try again shortly.';
    case 'not_found': return 'Saving to your account is switched off right now.';
    case 'invalid_project': return 'This project could not be read for saving.';
    default: return 'Could not save to your account just now. Your project is still saved on this device.';
  }
}

type StudioLike = Pick<StudioApi, 'doc' | 'loaded' | 'run' | 'setSelected'>;

export function useAccountSave(studio: StudioLike, o: { api?: AccountApi; kv?: KV | null; now?: () => number } = {}) {
  const [st, setSt] = useState<AccountState>(INITIAL_ACCOUNT_STATE);
  const stRef = useRef(st); stRef.current = st;
  const docRef = useRef(studio.doc); docRef.current = studio.doc;
  const studioRef = useRef(studio); studioRef.current = studio;
  const ctxRef = useRef<SyncCtx | null>(null);
  const lastPush = useRef<number | null>(null);
  const now = o.now ?? Date.now;
  const apiRef = useRef<AccountApi | null>(o.api ?? null);
  const kvRef = useRef<KV | null | undefined>(o.kv);
  const patch = useCallback((p: Partial<AccountState>) => setSt((s) => ({ ...s, ...p })), []);

  /** The account's list (and, the first time or for another account, the device's sync context for it). */
  const loadList = useCallback(async (): Promise<ListResult> => {
    const api = apiRef.current ?? (apiRef.current = fetchAccountApi());
    const l = await api.list();
    if (!l.ok) return l;
    if (!ctxRef.current || ctxRef.current.account !== l.account) {
      ctxRef.current = { api, device: deviceSync(kvRef.current === undefined ? browserKV() : kvRef.current), account: l.account };
    }
    patch({ saving: l.saving, projects: l.projects, quota: l.quota });
    return l;
  }, [patch]);
  const listOnly = useCallback(async () => { await loadList(); }, [loadList]);

  const apply = useCallback((out: Outcome, label: string) => {
    const s = studioRef.current;
    switch (out.kind) {
      case 'in-step': patch({ status: 'in-account', conflict: null, busy: false }); return;
      case 'saved':
        lastPush.current = now();
        patch({ status: 'in-account', conflict: null, busy: false, note: out.stripped ? 'Saved to your account. Character looks stay on this device.' : null });
        return;
      case 'offer': patch({ status: 'offer', busy: false }); return;
      case 'deleted-elsewhere': patch({ status: 'deleted-elsewhere', busy: false }); return;
      case 'pulled':
        s.run(replace(out.project, label)); s.setSelected(null);
        lastPush.current = now();
        patch({ status: 'in-account', conflict: null, busy: false, currentId: out.project.id });
        return;
      case 'merged':
        s.run(replace(out.project, 'Merge with your account')); s.setSelected(null);
        lastPush.current = now();
        patch({ status: 'in-account', conflict: null, busy: false, note: 'Merged with changes from another device. Undo takes the merge back on this device.' });
        return;
      case 'conflict': patch({ status: 'conflict', conflict: { theirs: out.theirs, theirsRev: out.theirsRev, conflicts: out.conflicts }, panelOpen: true, busy: false }); return;
      case 'kept-both':
        s.run(replace(out.project, 'Keep both: open your account’s copy')); s.setSelected(null);
        lastPush.current = now();
        patch({ status: 'in-account', conflict: null, busy: false, currentId: out.project.id, note: `This device’s version is saved to your account as “${out.copy.name}”.` });
        return;
      case 'error':
        patch(out.status === 0 ? { status: 'offline', busy: false } : { status: 'error', busy: false, note: accountErrorText(out.error) });
    }
  }, [now, patch]);

  const refresh = useCallback(async (first = false) => {
    const l = await loadList();
    // the first answer decides whether the panel exists at all (a guest, the routes absent, offline at load: hidden)
    if (!l.ok) { patch({ status: first || stRef.current.status === 'hidden' ? 'hidden' : 'offline' }); return; }
    if (!l.saving.enabled && !l.projects.length) { patch({ status: 'hidden' }); return; }
    const ctx = ctxRef.current!;
    const doc = docRef.current;
    patch({ currentId: doc.id });
    if (!l.saving.allowed) { patch({ status: 'idle' }); return; }
    apply(await reconcile(ctx, doc, l.projects.find((p) => p.projectId === doc.id) ?? null), 'Load from your account');
  }, [apply, loadList, patch]);

  // once the device's own project is open
  useEffect(() => { if (studio.loaded) void refresh(true); }, [studio.loaded, refresh]);
  // another project became the working one (an import, an open): ask again what the account has of it
  const seenId = useRef<string | null>(null);
  useEffect(() => {
    const id = studio.doc.id;
    if (seenId.current !== null && seenId.current !== id && ctxRef.current && stRef.current.status !== 'hidden') void refresh();
    seenId.current = id;
  }, [studio.doc.id, refresh]);

  // changes go up at most every PUSH_MS while the working project is in the account and differs from what it agreed
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || !st.saving.allowed || (st.status !== 'in-account' && st.status !== 'pending')) return;
    const rec = ctx.device.record(ctx.account, studio.doc.id);
    if (!rec) return;
    if (projectFingerprint(studio.doc) === rec.fingerprint) { if (st.status === 'pending') patch({ status: 'in-account' }); return; }
    if (st.status !== 'pending') patch({ status: 'pending' });
    const t = setTimeout(() => {
      // already sent (the page-hide push got there first): nothing to do
      const now2 = ctx.device.record(ctx.account, docRef.current.id);
      if (now2 && projectFingerprint(docRef.current) === now2.fingerprint) { patch({ status: 'in-account' }); return; }
      lastPush.current = now();
      patch({ status: 'saving' });
      void push(ctx, docRef.current).then((out) => { apply(out, 'Load from your account'); void listOnly(); });
    }, pushDelay(lastPush.current, now()));
    return () => clearTimeout(t);
  }, [studio.doc, st.status, st.saving.allowed, apply, listOnly, now, patch]);

  // when the page hides: send what is pending now (a keepalive request, when it is small enough to ride one)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const vis = () => {
      const ctx = ctxRef.current;
      if (document.visibilityState !== 'hidden' || !ctx || stRef.current.status !== 'pending') return;
      lastPush.current = now();
      void push(ctx, docRef.current, undefined, { keepalive: true }).then((out) => apply(out, 'Load from your account'));
    };
    const online = () => { if (stRef.current.status === 'offline') void refresh(); };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('online', online);
    return () => { document.removeEventListener('visibilitychange', vis); window.removeEventListener('online', online); };
  }, [apply, now, refresh]);

  const run = useCallback(async (step: (ctx: SyncCtx) => Promise<Outcome> | Outcome, label: string) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    patch({ busy: true, note: null, confirm: null });
    apply(await step(ctx), label);
    await listOnly();
  }, [apply, listOnly, patch]);

  const metaOf = (id: string) => stRef.current.projects.find((p) => p.projectId === id) ?? null;

  return {
    state: { ...st, currentId: studio.doc.id },
    togglePanel: () => patch({ panelOpen: !stRef.current.panelOpen }),
    saveToAccount: () => run((ctx) => saveNew(ctx, docRef.current), 'Load from your account'),
    keepOnlyHere: () => { const ctx = ctxRef.current; if (ctx) ctx.device.forget(ctx.account, docRef.current.id); patch({ status: 'offer', note: null }); },
    keepBoth: () => { const c = stRef.current.conflict; if (c) void run((ctx) => keepBothSides(ctx, docRef.current, c.theirs, c.theirsRev), 'Keep both'); },
    useMine: () => { const c = stRef.current.conflict; if (c) void run((ctx) => useMine(ctx, docRef.current, c.theirsRev), 'Use this device’s'); },
    useTheirs: () => { const c = stRef.current.conflict; if (c) void run((ctx) => useTheirs(ctx, c.theirs, c.theirsRev), 'Use your account’s copy'); },
    requestOpen: (projectId: string) => {
      const ctx = ctxRef.current;
      if (!ctx || projectId === docRef.current.id) return;
      const name = metaOf(projectId)?.name ?? 'project';
      if (hasUnsavedWork(ctx, docRef.current, metaOf(docRef.current.id))) { patch({ confirm: { kind: 'open', projectId, name } }); return; }
      void run((c) => open(c, projectId, docRef.current), `Open “${name}” from your account`);
    },
    confirmOpen: () => {
      const c = stRef.current.confirm;
      if (c?.kind === 'open') void run((ctx) => open(ctx, c.projectId, docRef.current), `Open “${c.name}” from your account`);
    },
    requestDelete: (projectId: string) => patch({ confirm: { kind: 'delete', projectId, name: metaOf(projectId)?.name ?? 'project' } }),
    confirmDelete: () => {
      const c = stRef.current.confirm;
      if (c?.kind !== 'delete') return;
      void run(async (ctx) => {
        const ok = await removeFromAccount(ctx, c.projectId);
        if (!ok) return { kind: 'error', status: 500, error: 'delete_failed' };
        return c.projectId === docRef.current.id ? { kind: 'offer' } : { kind: 'in-step' };
      }, 'Delete');
    },
    cancelConfirm: () => patch({ confirm: null }),
  };
}

export type AccountSaveApi = ReturnType<typeof useAccountSave>;

// ── the view (pure: renders from the state, so every state is tested as markup) ────────────────────────────────────────

const LABEL: Record<Exclude<AccountStatus, 'hidden'>, string> = {
  idle: 'Your account', offer: 'Not in your account', saving: 'Saving to your account…', 'in-account': 'In your account',
  pending: 'Changes not in your account yet', offline: 'Offline: saved on this device', conflict: 'Changed on another device',
  'deleted-elsewhere': 'Deleted from your account', error: 'Not saved to your account',
};
const ICON: Record<Exclude<AccountStatus, 'hidden'>, typeof Cloud> = {
  idle: Cloud, offer: CloudUpload, saving: Loader2, 'in-account': Check, pending: CloudUpload, offline: CloudOff,
  conflict: AlertTriangle, 'deleted-elsewhere': AlertTriangle, error: AlertTriangle,
};
const kb = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} kB`);

export function AccountSaveView({ a }: { a: AccountSaveApi }) {
  const s = a.state;
  if (s.status === 'hidden') return null;
  const Icon = ICON[s.status];
  const warn = s.status === 'conflict' || s.status === 'error' || s.status === 'deleted-elsewhere';
  const btn = 'rounded-md px-2.5 py-1 text-[12px] font-semibold disabled:opacity-50';
  return (
    <span className="relative" data-testid="account-save">
      <button type="button" onClick={a.togglePanel} aria-expanded={s.panelOpen} aria-haspopup="dialog" data-testid="account-status"
        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px]" style={{ color: warn ? C.ember : s.status === 'in-account' ? C.dim : C.gold }}>
        <Icon className={`h-3.5 w-3.5 ${s.status === 'saving' ? 'animate-spin' : ''}`} aria-hidden /> {LABEL[s.status]}
      </button>
      {s.panelOpen && (
        <div role="dialog" aria-label="Your account’s projects" className="fixed inset-x-2 top-28 z-30 max-h-[70vh] overflow-y-auto rounded-lg border p-3 text-[12px] shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-1 sm:w-[360px]"
          style={{ background: C.surface, borderColor: C.line, color: C.text }} data-testid="account-panel">
          {s.status === 'offer' && (
            <div className="mb-3">
              <p className="mb-2" style={{ color: C.dim }}>This project is saved on this device. Save it to your account to open it on any device you sign in on. Character looks stay on this device.</p>
              <button type="button" className={btn} style={{ background: C.cyan, color: '#050505' }} disabled={s.busy} onClick={() => void a.saveToAccount()} data-testid="save-to-account">Save to my account</button>
            </div>
          )}
          {s.status === 'conflict' && s.conflict && (
            <div className="mb-3" data-testid="account-conflict">
              <p className="mb-2">This project changed on another device too{s.conflict.conflicts.length ? `, in ${s.conflict.conflicts.length} of the same place${s.conflict.conflicts.length === 1 ? '' : 's'}` : ''}. Nothing has been overwritten.</p>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className={btn} style={{ background: C.cyan, color: '#050505' }} disabled={s.busy} onClick={a.keepBoth} data-testid="keep-both">Keep both</button>
                <button type="button" className={btn} style={{ border: `1px solid ${C.line}` }} disabled={s.busy} onClick={a.useMine}>Use this device’s</button>
                <button type="button" className={btn} style={{ border: `1px solid ${C.line}` }} disabled={s.busy} onClick={a.useTheirs}>Use my account’s</button>
              </div>
              <p className="mt-1.5 text-[11px]" style={{ color: C.dim }}>Keep both saves this device’s version as a new project, then opens your account’s copy.</p>
            </div>
          )}
          {s.status === 'deleted-elsewhere' && (
            <div className="mb-3">
              <p className="mb-2">This project was deleted from your account on another device. It is still saved on this device.</p>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className={btn} style={{ background: C.cyan, color: '#050505' }} disabled={s.busy} onClick={() => void a.saveToAccount()}>Save it again</button>
                <button type="button" className={btn} style={{ border: `1px solid ${C.line}` }} onClick={a.keepOnlyHere}>Keep it only on this device</button>
              </div>
            </div>
          )}
          {s.status === 'idle' && (
            <p className="mb-3" style={{ color: C.dim }} data-testid="account-idle">
              {s.saving.enabled
                ? 'Saving to your account isn’t available for this account. Your project is saved on this device — export it to keep a copy.'
                : 'Saving to your account is switched off right now. You can still open or delete what you saved.'}
            </p>
          )}
          {s.note && <p className="mb-3" style={{ color: s.status === 'error' ? C.ember : C.gold }} role="status">{s.note}</p>}
          {s.confirm && (
            <div className="mb-3 rounded-md border p-2" style={{ borderColor: C.ember }} data-testid="account-confirm">
              <p className="mb-1.5">{s.confirm.kind === 'delete'
                ? `Delete “${s.confirm.name}” from your account? It stays on any device that has it open.`
                : `The project open now has changes that are not in your account. Open “${s.confirm.name}” anyway? Export first to keep a copy.`}</p>
              <div className="flex gap-1.5">
                <button type="button" className={btn} style={{ background: C.ember, color: '#050505' }} onClick={s.confirm.kind === 'delete' ? a.confirmDelete : a.confirmOpen}>{s.confirm.kind === 'delete' ? 'Delete' : 'Open anyway'}</button>
                <button type="button" className={btn} style={{ border: `1px solid ${C.line}` }} onClick={a.cancelConfirm}>Cancel</button>
              </div>
            </div>
          )}
          <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-[0.14em]" style={{ color: C.dim }}>
            <span>Saved projects</span>
            {s.quota && <span data-testid="account-quota">{s.quota.projects} of {s.quota.maxProjects} · {kb(s.quota.bytes)} of {kb(s.quota.maxBytes)}</span>}
          </div>
          {s.projects.length === 0 && <p style={{ color: C.dim }}>None yet.</p>}
          <ul className="max-h-60 space-y-1 overflow-y-auto" data-testid="account-projects">
            {s.projects.map((p) => (
              <li key={p.projectId} className="flex items-center gap-2 rounded px-1.5 py-1" style={{ background: p.projectId === s.currentId ? 'rgba(0,229,255,0.08)' : 'transparent' }}>
                <span className="min-w-0 flex-1 truncate" title={p.name}>{p.name}{p.projectId === s.currentId ? ' (open)' : ''}</span>
                <span className="shrink-0 text-[11px]" style={{ color: C.dim }}>{kb(p.bytes)}</span>
                <button type="button" title={`Open “${p.name}”`} aria-label={`Open ${p.name}`} disabled={s.busy || p.projectId === s.currentId} onClick={() => a.requestOpen(p.projectId)} className="disabled:opacity-40"><FolderOpen className="h-3.5 w-3.5" /></button>
                <button type="button" title={`Delete “${p.name}” from your account`} aria-label={`Delete ${p.name}`} disabled={s.busy} onClick={() => a.requestDelete(p.projectId)} className="disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}

/** The title-bar piece. Renders nothing until the account answers, and nothing at all when saving is off and nothing was saved. */
export function AccountSave({ studio }: { studio: StudioLike }) {
  const a = useAccountSave(studio);
  return <AccountSaveView a={a} />;
}
