// SAVE TO ACCOUNT: the route's logic, STAGED (docs/NEXUS-STUDIO-SAVE.md §5). No app/api route imports this yet.
//
// WHY IT IS NOT A ROUTE YET. A route needs a store, and the store needs the StudioProjectSave table, which needs the owner
// (schema, SQL, the committed public/_prisma client). So the handlers here take the store as an interface
// (StudioProjectStore). The tests run them on an in-memory fake (tests/helpers/studioProjectStore.ts) that keeps the
// same revision rule the Prisma store will. When the owner applies the table, the route is wiring: app/api/studio/projects/
// route.ts and [id]/route.ts read the session, build the deps, call one of these functions and return its answer. The
// Prisma store is about 40 lines; its sketch is in the doc.
//
// THE ORDER OF CHECKS, the same order every Studio route uses (app/api/cell/venue/route.ts):
//   1. the switch (writes only): NEXUS_STUDIO_ENABLED and STUDIO_CLOUD_SAVE_ENABLED, otherwise 404, before the session;
//   2. signed in, otherwise 401;
//   3. a rate limit per account, otherwise 429;
//   4. writes only: who may save (cloudSavePolicy, from User.dobYear read from the DATABASE), otherwise a neutral 403;
//   5. the body: capped, parsed, through the import gate (prepareUpload), then the quota, then the revision.
// Reading, listing and deleting what is already stored need only sign-in and the rate limit. A switch that is off, or a
// policy that has narrowed, stops new saves. It never stops anyone seeing or deleting what they saved.
//
// Logs carry a fixed event name and an error's class name only: never a user id, a project name or the document.

import { CLOUD_LIMITS, cloudSavePolicy, prepareUpload, quotaCheck, type StudioSaveAudience } from './cloudSave';
import { sanitizeProject } from './doc';

export interface StoredMeta { projectId: string; name: string; rev: number; bytes: number; updatedAt: Date }
export interface StoredProject extends StoredMeta { version: number; doc: unknown }
export interface StudioProjectWrite { projectId: string; name: string; version: number; bytes: number; doc: unknown }
export type StorePut = { ok: true; meta: StoredMeta } | { ok: false; current: StoredMeta | null };

/** One account's saved projects. Every method is scoped by userId; a store never reads across accounts. */
export interface StudioProjectStore {
  list(userId: string): Promise<StoredMeta[]>;
  get(userId: string, projectId: string): Promise<StoredProject | null>;
  /** Create when baseRev is 0 and no row exists; otherwise update only when the row's rev equals baseRev (then rev + 1).
   *  Anything else changes nothing and answers the current row's meta (null when there is none). */
  put(userId: string, row: StudioProjectWrite, baseRev: number): Promise<StorePut>;
  /** True when a row was deleted. */
  remove(userId: string, projectId: string): Promise<boolean>;
}

export interface CloudRouteDeps {
  store: StudioProjectStore;
  /** The signed-in account, from the session. Null for a guest. */
  userId: string | null;
  /** NEXUS_STUDIO_ENABLED and STUDIO_CLOUD_SAVE_ENABLED, both read per request on the server. */
  writesEnabled: boolean;
  /** User.dobYear from the database (readDobYear in lib/privacy/scanSaveGate.ts). Called for writes only. */
  dobYear: () => Promise<number | null>;
  /** lib/rate-limit.ts rateLimit, injected. */
  rateLimit: (key: string, limit: number, windowMs: number) => { ok: boolean; retryAfterSec: number };
  now?: Date;
  audience?: StudioSaveAudience;
  keepLookCodes?: boolean;
  log?: (event: string, e?: unknown) => void;
}

export interface CloudAnswer { status: number; body: unknown; headers?: Record<string, string> }

/** OWNER DECISION Q4 (with the caps). Autosave pushes at most every 20 s, so a minute's burst is a handful of writes. */
export const CLOUD_RATE = {
  write: { minute: { limit: 12, windowMs: 60_000 }, day: { limit: 1_500, windowMs: 86_400_000 } },
  read: { minute: { limit: 60, windowMs: 60_000 } },
} as const;

/** doc.ts's id shape: what a project id in a URL must look like. */
const PROJECT_ID = /^[A-Za-z0-9_:-]{1,64}$/;
const NO_STORE = { 'Cache-Control': 'no-store' };
const answer = (status: number, body: unknown, headers: Record<string, string> = {}): CloudAnswer => ({ status, body, headers: { ...NO_STORE, ...headers } });
const metaOut = (m: StoredMeta) => ({ projectId: m.projectId, name: m.name, rev: m.rev, bytes: m.bytes, updatedAt: m.updatedAt.toISOString() });

function limited(d: CloudRouteDeps, kind: 'read' | 'write', userId: string): CloudAnswer | null {
  for (const [name, w] of Object.entries(CLOUD_RATE[kind])) {
    const rl = d.rateLimit(`studio-save:${kind}:${name}:${userId}`, w.limit, w.windowMs);
    if (!rl.ok) return answer(429, { error: 'rate_limited' }, { 'Retry-After': String(rl.retryAfterSec) });
  }
  return null;
}

/** Sign-in and the rate limit: the gate every handler starts with. */
function gate(d: CloudRouteDeps, kind: 'read' | 'write'): { userId: string } | CloudAnswer {
  if (!d.userId) return answer(401, { error: 'Unauthorized' });
  return limited(d, kind, d.userId) ?? { userId: d.userId };
}

async function guarded(d: CloudRouteDeps, event: string, run: () => Promise<CloudAnswer>): Promise<CloudAnswer> {
  try { return await run(); } catch (e) {
    d.log?.(event, e);
    return answer(503, { error: 'save_unavailable' });
  }
}

/** GET /api/studio/projects → the account's projects (no documents) and its quota. */
export async function listProjects(d: CloudRouteDeps): Promise<CloudAnswer> {
  const g = gate(d, 'read');
  if ('status' in g) return g;
  return guarded(d, 'studio_save_list_failed', async () => {
    const rows = await d.store.list(g.userId);
    const used = rows.reduce((n, r) => n + r.bytes, 0);
    return answer(200, {
      projects: [...rows].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).map(metaOut),
      quota: { projects: rows.length, maxProjects: CLOUD_LIMITS.projects, bytes: used, maxBytes: CLOUD_LIMITS.accountBytes, maxProjectBytes: CLOUD_LIMITS.projectBytes },
    });
  });
}

/** GET /api/studio/projects/:id → the project (sanitised again on the way out), its revision and when it was saved. */
export async function getProject(d: CloudRouteDeps, projectId: string): Promise<CloudAnswer> {
  const g = gate(d, 'read');
  if ('status' in g) return g;
  if (!PROJECT_ID.test(projectId)) return answer(400, { error: 'bad_project_id' });
  return guarded(d, 'studio_save_get_failed', async () => {
    const row = await d.store.get(g.userId, projectId);
    if (!row) return answer(404, { error: 'not_found' });
    const r = sanitizeProject(row.doc, d.now ?? new Date());
    if (!r.ok) return answer(422, { error: 'unreadable_project', detail: r.error, ...metaOut(row) });
    return answer(200, { project: r.project, ...metaOut(row) });
  });
}

/** PUT /api/studio/projects/:id  { baseRev, project } → { rev, updatedAt, bytes, stripped } | 409 { error: 'conflict', current }. */
export async function putProject(d: CloudRouteDeps, projectId: string, bodyText: string): Promise<CloudAnswer> {
  if (!d.writesEnabled) return answer(404, { error: 'not_found' });
  const g = gate(d, 'write');
  if ('status' in g) return g;
  return guarded(d, 'studio_save_put_failed', async () => {
    const now = d.now ?? new Date();
    if (!cloudSavePolicy({ signedIn: true, dobYear: await d.dobYear(), now, audience: d.audience }).allowed) {
      return answer(403, { error: 'studio_save_unavailable' });
    }
    if (!PROJECT_ID.test(projectId)) return answer(400, { error: 'bad_project_id' });
    if (new TextEncoder().encode(bodyText).length > CLOUD_LIMITS.bodyBytes) return answer(413, { error: 'project_too_large' });
    let body: unknown;
    try { body = JSON.parse(bodyText); } catch { return answer(400, { error: 'bad_json' }); }
    const b = (body && typeof body === 'object' ? body : {}) as { baseRev?: unknown; project?: unknown };
    if (typeof b.baseRev !== 'number' || !Number.isInteger(b.baseRev) || b.baseRev < 0) return answer(400, { error: 'bad_base_rev' });
    const prep = prepareUpload(b.project, { projectId, keepLookCodes: d.keepLookCodes, now });
    if (!prep.ok) return answer(prep.status, { error: prep.error, ...(prep.detail ? { detail: prep.detail } : {}) });
    const q = quotaCheck(await d.store.list(g.userId), { projectId, bytes: prep.bytes });
    if (!q.ok) return answer(403, { error: q.error, maxProjects: CLOUD_LIMITS.projects, maxBytes: CLOUD_LIMITS.accountBytes });
    const put = await d.store.put(g.userId, { projectId, name: prep.project.name, version: prep.project.version, bytes: prep.bytes, doc: prep.project }, b.baseRev);
    if (!put.ok) return answer(409, { error: 'conflict', current: put.current ? metaOut(put.current) : null });
    return answer(200, { ...metaOut(put.meta), stripped: prep.stripped, dropped: prep.dropped });
  });
}

/** DELETE /api/studio/projects/:id → { deleted: boolean }. Idempotent; never behind the write switch or the age rule. */
export async function deleteProject(d: CloudRouteDeps, projectId: string): Promise<CloudAnswer> {
  const g = gate(d, 'write');
  if ('status' in g) return g;
  if (!PROJECT_ID.test(projectId)) return answer(400, { error: 'bad_project_id' });
  return guarded(d, 'studio_save_delete_failed', async () => answer(200, { deleted: await d.store.remove(g.userId, projectId) }));
}
