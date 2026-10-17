// Test helper for the staged Studio save-to-account route (lib/nexus-studio/cloudRoute.ts): an in-memory StudioProjectStore
// that keeps the revision rule the Prisma store will keep (docs/NEXUS-STUDIO-SAVE.md §5): create only at baseRev 0 when no
// row exists; update only when the row's rev equals baseRev, then rev + 1; anything else changes nothing and answers the
// current row; then the quota sees the account's rows. Single-threaded JS runs each put whole, which is the lock the Prisma
// store takes per account. `fail` makes the next call throw, as a missing table or a dropped connection would.

import type { QuotaAdmit, StoredMeta, StoredProject, StudioProjectStore, StudioProjectWrite, StorePut } from '@/lib/nexus-studio/cloudRoute';

export interface MemoryProjectStore extends StudioProjectStore {
  rows: Map<string, Map<string, StoredProject>>;
  fail: boolean;
  /** The clock rows are stamped with; tests move it. */
  clock: Date;
}

const meta = (r: StoredProject): StoredMeta => ({ projectId: r.projectId, name: r.name, rev: r.rev, bytes: r.bytes, updatedAt: r.updatedAt });

export function memoryProjectStore(clock = new Date('2026-10-17T12:00:00Z')): MemoryProjectStore {
  const s: MemoryProjectStore = {
    rows: new Map(),
    fail: false,
    clock,
    async list(userId) { check(); return [...(s.rows.get(userId)?.values() ?? [])].map(meta); },
    async get(userId, projectId) { check(); const r = s.rows.get(userId)?.get(projectId); return r ? { ...r, doc: JSON.parse(JSON.stringify(r.doc)), updatedAt: new Date(r.updatedAt) } : null; },
    async put(userId: string, row: StudioProjectWrite, baseRev: number, admit: QuotaAdmit): Promise<StorePut> {
      check();
      const mine = s.rows.get(userId) ?? new Map<string, StoredProject>();
      const cur = mine.get(row.projectId);
      if ((cur ? cur.rev : 0) !== baseRev) return { ok: false, current: cur ? meta(cur) : null };
      const q = admit([...mine.values()].map(meta));
      if (!q.ok) return { ok: false, quota: q.error };
      const next: StoredProject = { ...row, doc: JSON.parse(JSON.stringify(row.doc)), rev: baseRev + 1, updatedAt: new Date(s.clock) };
      mine.set(row.projectId, next);
      s.rows.set(userId, mine);
      return { ok: true, meta: meta(next) };
    },
    async remove(userId, projectId) { check(); return s.rows.get(userId)?.delete(projectId) ?? false; },
  };
  function check() { if (s.fail) { s.fail = false; const e = new Error('relation "StudioProjectSave" does not exist'); e.name = 'PrismaClientKnownRequestError'; throw e; } }
  return s;
}
