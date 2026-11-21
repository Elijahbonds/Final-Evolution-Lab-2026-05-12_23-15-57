// SAVE TO ACCOUNT: the device's half (docs/NEXUS-STUDIO-SAVE.md §6). The Studio's account panel
// (components/nexus-studio/account-save.tsx) drives these; the decisions are cloudSave.ts's.
//
// THE DEVICE STAYS FIRST. Nothing here touches the working project's own localStorage key (storage.ts PROJECT_KEY): the
// editor's 1.5 s autosave is unchanged. This keeps two more things on the device, per ACCOUNT (the list's opaque `account`
// tag), so a browser shared by two people never mixes them:
//   - the sync records (cloudSave.ts SyncRecord): the server rev this device last agreed with, and the content's
//     fingerprint at that moment;
//   - the merge base: the project as it was at that moment, so a conflict can be merged three ways. If the device cannot
//     keep it (quota, a private window), a conflict falls back to "keep both" — nothing is lost either way.
// Every storage access is wrapped: a failure means "no record / no base", never a throw.
//
// NEVER AUTOMATIC: the first save of a project to an account ('create'); re-uploading a project deleted from another
// device ('deleted-elsewhere'); resolving a conflict that is not a clean merge. Those wait for a click.

import {
  keepBoth, mergeProjects, projectFingerprint, restoreLookCodes, syncAction, type SyncRecord,
} from './cloudSave';
import { parseProject, type StudioProject } from './doc';
import type { KV } from './storage';

export const SYNC_KEY = 'fel.nexusStudio.sync.v1';
export const BASE_PREFIX = 'fel.nexusStudio.base.v1.';
/** At most one automatic push this often while the device copy differs from the account's (§6). */
export const PUSH_MS = 20_000;
/** Browsers cap a keepalive request body at 64 kB; a bigger project waits for the next open. */
export const KEEPALIVE_MAX = 60_000;

// ── the device ───────────────────────────────────────────────────────────────────────────────────────────────────────

type Records = Record<string, Record<string, SyncRecord>>;
const ID = /^[A-Za-z0-9_:-]{1,64}$/;

export interface DeviceSync {
  record(account: string, projectId: string): SyncRecord | null;
  setRecord(account: string, rec: SyncRecord): void;
  base(account: string, projectId: string): StudioProject | null;
  setBase(account: string, project: StudioProject): void;
  forget(account: string, projectId: string): void;
}

export function deviceSync(kv: KV | null): DeviceSync {
  const read = (): Records => {
    try {
      const raw = kv?.getItem(SYNC_KEY);
      const x = raw ? JSON.parse(raw) : null;
      return x && typeof x === 'object' && x.v === 1 && x.accounts && typeof x.accounts === 'object' ? x.accounts : {};
    } catch { return {}; }
  };
  const write = (r: Records) => { try { kv?.setItem(SYNC_KEY, JSON.stringify({ v: 1, accounts: r })); } catch { /* not kept: the next open asks again */ } };
  const baseKey = (account: string, id: string) => `${BASE_PREFIX}${account}.${id}`;
  return {
    record(account, projectId) {
      const r = read()[account]?.[projectId];
      return r && typeof r.rev === 'number' && typeof r.fingerprint === 'string' ? { projectId, rev: r.rev, fingerprint: r.fingerprint } : null;
    },
    setRecord(account, rec) {
      if (!ID.test(rec.projectId)) return;
      const all = read();
      all[account] = { ...(all[account] ?? {}), [rec.projectId]: rec };
      write(all);
    },
    base(account, projectId) {
      try {
        const raw = kv?.getItem(baseKey(account, projectId));
        if (!raw) return null;
        const r = parseProject(raw);
        return r.ok ? r.project : null;
      } catch { return null; }
    },
    setBase(account, project) {
      try { kv?.setItem(baseKey(account, project.id), JSON.stringify(project)); }
      catch { try { kv?.removeItem(baseKey(account, project.id)); } catch { /* no base: a conflict keeps both */ } }
    },
    forget(account, projectId) {
      const all = read();
      if (all[account]?.[projectId]) { delete all[account][projectId]; write(all); }
      try { kv?.removeItem(baseKey(account, projectId)); } catch { /* nothing kept */ }
    },
  };
}

// ── the routes ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface AccountMeta { projectId: string; name: string; rev: number; bytes: number; updatedAt: string }
export interface AccountQuota { projects: number; maxProjects: number; bytes: number; maxBytes: number; maxProjectBytes: number }
export type ListResult =
  | { ok: true; account: string; saving: { enabled: boolean; allowed: boolean }; projects: AccountMeta[]; quota: AccountQuota }
  | { ok: false; status: number };
export type GetResult = { ok: true; project: StudioProject; rev: number } | { ok: false; status: number; error: string };
export type PutResult =
  | { ok: true; rev: number; stripped: number }
  | { ok: false; conflict: true; current: AccountMeta | null }
  | { ok: false; conflict?: false; status: number; error: string };

export interface AccountApi {
  list(): Promise<ListResult>;
  get(projectId: string): Promise<GetResult>;
  put(project: StudioProject, baseRev: number, o?: { keepalive?: boolean }): Promise<PutResult>;
  remove(projectId: string): Promise<{ ok: boolean; status: number }>;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** The routes over fetch. A network failure is status 0 ("offline"), never a throw. */
export function fetchAccountApi(f: Fetch = (u, i) => fetch(u, i)): AccountApi {
  const call = async (url: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> => {
    try {
      const r = await f(url, { credentials: 'same-origin', cache: 'no-store', ...init });
      let body: Record<string, unknown> = {};
      try { body = (await r.json()) as Record<string, unknown>; } catch { /* an empty or non-JSON answer */ }
      return { status: r.status, body };
    } catch { return { status: 0, body: { error: 'offline' } }; }
  };
  const one = (id: string) => `/api/studio/projects/${encodeURIComponent(id)}`;
  const err = (b: Record<string, unknown>) => (typeof b.error === 'string' ? b.error : 'failed');
  return {
    async list() {
      const { status, body } = await call('/api/studio/projects');
      if (status !== 200 || typeof body.account !== 'string') return { ok: false, status };
      const saving = (body.saving ?? {}) as { enabled?: unknown; allowed?: unknown };
      return {
        ok: true, account: body.account,
        saving: { enabled: saving.enabled === true, allowed: saving.allowed === true },
        projects: Array.isArray(body.projects) ? (body.projects as AccountMeta[]) : [],
        quota: body.quota as AccountQuota,
      };
    },
    async get(id) {
      const { status, body } = await call(one(id));
      if (status !== 200) return { ok: false, status, error: err(body) };
      const r = parseProject(JSON.stringify(body.project));
      return r.ok ? { ok: true, project: r.project, rev: Number(body.rev) } : { ok: false, status: 422, error: 'unreadable_project' };
    },
    async put(project, baseRev, o = {}) {
      const text = JSON.stringify({ baseRev, project });
      const { status, body } = await call(one(project.id), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: text,
        ...(o.keepalive && text.length <= KEEPALIVE_MAX ? { keepalive: true } : {}),
      });
      if (status === 200) return { ok: true, rev: Number(body.rev), stripped: Number(body.stripped) || 0 };
      if (status === 409) return { ok: false, conflict: true, current: (body.current ?? null) as AccountMeta | null };
      return { ok: false, status, error: err(body) };
    },
    async remove(id) {
      const { status } = await call(one(id), { method: 'DELETE' });
      return { ok: status === 200, status };
    },
  };
}

// ── the steps ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface SyncCtx { api: AccountApi; device: DeviceSync; account: string }

export type Outcome =
  | { kind: 'in-step' }
  | { kind: 'offer' }
  | { kind: 'deleted-elsewhere' }
  | { kind: 'saved'; rev: number; stripped: number }
  /** Take this project as the working one (the account's copy, look codes put back from this device). */
  | { kind: 'pulled'; project: StudioProject }
  /** A clean three-way merge, already in the account: take it as the working one. */
  | { kind: 'merged'; project: StudioProject; fromTheirs: number; rev: number }
  /** Changed on both sides and not mergeable (or no base kept): the creator picks. */
  | { kind: 'conflict'; theirs: StudioProject; theirsRev: number; conflicts: string[] }
  /** keepBoth: the account's copy is the working one now; this device's work is the new project `copy`, also saved. */
  | { kind: 'kept-both'; project: StudioProject; copy: StudioProject }
  | { kind: 'error'; status: number; error: string };

const agree = (ctx: SyncCtx, project: StudioProject, rev: number) => {
  ctx.device.setRecord(ctx.account, { projectId: project.id, rev, fingerprint: projectFingerprint(project) });
  ctx.device.setBase(ctx.account, project);
};

/** How long to wait before the next automatic push (0 = now). */
export function pushDelay(lastPushAt: number | null, now: number): number {
  return lastPushAt === null ? 0 : Math.max(0, lastPushAt + PUSH_MS - now);
}

/** Send `local` based on `baseRev` (default: the record's; 0 = a new project). A conflict comes back for resolve(). */
export async function push(ctx: SyncCtx, local: StudioProject, baseRev?: number, o?: { keepalive?: boolean }): Promise<Outcome> {
  const rev = baseRev ?? ctx.device.record(ctx.account, local.id)?.rev ?? 0;
  const r = await ctx.api.put(local, rev, o);
  if (r.ok) { agree(ctx, local, r.rev); return { kind: 'saved', rev: r.rev, stripped: r.stripped }; }
  if (r.conflict) return resolve(ctx, local);
  return { kind: 'error', status: r.status, error: r.error };
}

/** Both sides changed: fetch the account's copy, merge three ways when this device kept the base, else hand it over. */
export async function resolve(ctx: SyncCtx, local: StudioProject): Promise<Outcome> {
  const g = await ctx.api.get(local.id);
  if (!g.ok) return g.status === 404 ? { kind: 'deleted-elsewhere' } : { kind: 'error', status: g.status, error: g.error };
  const theirs = restoreLookCodes(g.project, local);
  const base = ctx.device.base(ctx.account, local.id);
  if (!base) return { kind: 'conflict', theirs, theirsRev: g.rev, conflicts: [] };
  const m = mergeProjects(base, local, theirs);
  if (!m.ok) return { kind: 'conflict', theirs, theirsRev: g.rev, conflicts: m.conflicts };
  const r = await ctx.api.put(m.project, g.rev);
  if (r.ok) { agree(ctx, m.project, r.rev); return { kind: 'merged', project: m.project, fromTheirs: m.fromTheirs, rev: r.rev }; }
  if (r.conflict) return { kind: 'conflict', theirs, theirsRev: g.rev, conflicts: [] };   // it moved again: let the creator pick
  return { kind: 'error', status: r.status, error: r.error };
}

/** What to do about the working project, given the account's list. Pushes and pulls; never creates or re-uploads. */
export async function reconcile(ctx: SyncCtx, local: StudioProject, server: AccountMeta | null): Promise<Outcome> {
  const a = syncAction(local, ctx.device.record(ctx.account, local.id), server);
  switch (a.kind) {
    case 'none': return { kind: 'in-step' };
    case 'create': return { kind: 'offer' };
    case 'deleted-elsewhere': return { kind: 'deleted-elsewhere' };
    case 'push': return push(ctx, local, a.baseRev);
    case 'pull': return open(ctx, local.id, local);
    case 'conflict': return a.base === 'known' ? resolve(ctx, local) : resolveUnknown(ctx, local);
  }
}

async function resolveUnknown(ctx: SyncCtx, local: StudioProject): Promise<Outcome> {
  const g = await ctx.api.get(local.id);
  if (!g.ok) return { kind: 'error', status: g.status, error: g.error };
  return { kind: 'conflict', theirs: restoreLookCodes(g.project, local), theirsRev: g.rev, conflicts: [] };
}

/** "Save to my account" (the explicit first save, or "save it again" after a delete elsewhere): a NEW row, base 0. */
export async function saveNew(ctx: SyncCtx, local: StudioProject): Promise<Outcome> {
  ctx.device.forget(ctx.account, local.id);
  return push(ctx, local, 0);
}

/** Open one of the account's projects. `local` gives look codes back only when it is the same project. */
export async function open(ctx: SyncCtx, projectId: string, local: StudioProject | null): Promise<Outcome> {
  const g = await ctx.api.get(projectId);
  if (!g.ok) return g.status === 404 ? { kind: 'deleted-elsewhere' } : { kind: 'error', status: g.status, error: g.error };
  const project = restoreLookCodes(g.project, local && local.id === projectId ? local : null);
  agree(ctx, project, g.rev);
  return { kind: 'pulled', project };
}

/** Conflict: keep both. This device's work goes to the account as a new project FIRST; only then does the working project
 *  become the account's copy. If the copy cannot be saved, nothing changes (the creator can still export). */
export async function keepBothSides(ctx: SyncCtx, local: StudioProject, theirs: StudioProject, theirsRev: number, now = new Date()): Promise<Outcome> {
  const copy = keepBoth(local, now);
  const saved = await push(ctx, copy, 0);
  if (saved.kind !== 'saved') return saved.kind === 'error' ? saved : { kind: 'error', status: 409, error: 'copy_not_saved' };
  agree(ctx, theirs, theirsRev);
  return { kind: 'kept-both', project: theirs, copy };
}

/** Conflict: use this device's — sent on top of the account's current revision. */
export function useMine(ctx: SyncCtx, local: StudioProject, theirsRev: number): Promise<Outcome> {
  return push(ctx, local, theirsRev);
}

/** Conflict: use the account's. */
export function useTheirs(ctx: SyncCtx, theirs: StudioProject, theirsRev: number): Outcome {
  agree(ctx, theirs, theirsRev);
  return { kind: 'pulled', project: theirs };
}

/** Delete one project from the account; the device forgets its record (the working copy on the device is untouched). */
export async function removeFromAccount(ctx: SyncCtx, projectId: string): Promise<boolean> {
  const r = await ctx.api.remove(projectId);
  if (r.ok) ctx.device.forget(ctx.account, projectId);
  return r.ok;
}

/** Does the working project hold work the account does not have? (Asked before opening another project.) */
export function hasUnsavedWork(ctx: SyncCtx, local: StudioProject, server: AccountMeta | null): boolean {
  const a = syncAction(local, ctx.device.record(ctx.account, local.id), server);
  return a.kind !== 'none' && a.kind !== 'pull';
}
