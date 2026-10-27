// An in-memory stand-in for web push's tables (prisma/pending/2026-10-26-push-subscriptions.sql), answering
// lib/push/store.ts's statements BY NAME (SQL), plus the two generated-client reads the push code makes (user.findUnique
// for dobYear and email, coachingProgram.count) and the CoachProgramDraft lookup. `tables: false` is production before
// the owner applies the SQL: the probe finds nothing and every statement throws "relation does not exist" (42P01).
// tests/push/store.integration.test.ts runs the same statements against a real Postgres.
import { SQL } from '@/lib/push/store';

export interface FakeUser { id: string; dobYear: number | null; email?: string | null; coach?: boolean }
export interface FakePushDb {
  tables: boolean;
  /** ms since epoch: the database's clock. */
  now: number;
  users: FakeUser[];
  prefs: Map<string, { kinds: string[]; email: boolean; updatedAt: number }>;
  devices: { id: string; userId: string; endpoint: string; p256dh: string; auth: string; createdAt: number; failures: number; lastSuccessAt: number | null }[];
  log: { id: string; userId: string; kind: string; channel: string; sentAt: number }[];
  drafts: { id: string; clientId: string }[];
  statements: string[];
  /** A statement name to fail once with this error (to test fail-closed paths). */
  failNext: { name: keyof typeof SQL; error: unknown } | null;
  $queryRawUnsafe<T = unknown>(q: string, ...v: unknown[]): Promise<T>;
  $executeRawUnsafe(q: string, ...v: unknown[]): Promise<number>;
  user: { findUnique(a: { where: { id: string }; select: Record<string, boolean> }): Promise<Record<string, unknown> | null> };
  coachingProgram: { count(a: { where: { coachId?: string } }): Promise<number> };
}

const missing = () => Object.assign(new Error('relation "PushSendLog" does not exist'), { code: '42P01' });
const nameOf = (q: string) => (Object.keys(SQL) as (keyof typeof SQL)[]).find((k) => SQL[k] === q);

export function fakePushDb(o: { tables?: boolean; now?: number; users?: FakeUser[] } = {}): FakePushDb {
  let seq = 0;
  const db: FakePushDb = {
    tables: o.tables ?? true,
    now: o.now ?? Date.UTC(2026, 9, 26, 12),
    users: o.users ?? [],
    prefs: new Map(),
    devices: [],
    log: [],
    drafts: [],
    statements: [],
    failNext: null,
    async $queryRawUnsafe<T>(q: string, ...v: unknown[]): Promise<T> {
      if (q.includes('information_schema')) { db.statements.push('probe'); return (q === SQL.probe && db.tables ? [{ ok: 1 }] : []) as T; }
      if (q.includes('"CoachProgramDraft"')) return db.drafts.filter((d) => d.id === v[0]).map((d) => ({ clientId: d.clientId })) as T;
      const name = nameOf(q);
      if (!name) throw new Error(`fakePushDb: unknown query ${q.slice(0, 60)}`);
      db.statements.push(name);
      if (!db.tables) throw missing();
      if (db.failNext?.name === name) { const e = db.failNext.error; db.failNext = null; throw e; }
      const uid = v[0] as string;
      switch (name) {
        case 'readPrefs': { const p = db.prefs.get(uid); return (p ? [{ kinds: [...p.kinds], email: p.email }] : []) as T; }
        case 'listDevices': return db.devices.filter((d) => d.userId === uid).sort((a, b) => b.createdAt - a.createdAt).slice(0, 10)
          .map(({ id, endpoint, p256dh, auth, failures }) => ({ id, endpoint, p256dh, auth, failures })) as T;
        case 'countDevices': return [{ n: db.devices.filter((d) => d.userId === uid).length }] as T;
        case 'sendCounts': {
          const rows = db.log.filter((l) => l.userId === uid && l.sentAt > db.now - 24 * 3600_000);
          const ofKind = rows.filter((l) => l.kind === v[1]).map((l) => l.sentAt);
          return [{ n: rows.length, ago: ofKind.length ? db.now - Math.max(...ofKind) : null }] as T;
        }
        case 'prefsWithAny': {
          const want = v[0] as string[];
          return [...db.prefs.entries()].filter(([, p]) => p.kinds.some((k) => want.includes(k)))
            .sort((a, b) => a[1].updatedAt - b[1].updatedAt).slice(0, v[1] as number)
            .map(([userId, p]) => ({ userId, kinds: [...p.kinds], email: p.email })) as T;
        }
        default: throw new Error(`fakePushDb: ${name} is not a query`);
      }
    },
    async $executeRawUnsafe(q: string, ...v: unknown[]): Promise<number> {
      const name = nameOf(q);
      if (!name) throw new Error(`fakePushDb: unknown statement ${q.slice(0, 60)}`);
      db.statements.push(name);
      if (!db.tables) throw missing();
      if (db.failNext?.name === name) { const e = db.failNext.error; db.failNext = null; throw e; }
      switch (name) {
        case 'writePrefs': db.prefs.set(v[0] as string, { kinds: [...(v[1] as string[])], email: v[2] === true, updatedAt: db.now + seq++ }); return 1;
        case 'clearPrefs': return db.prefs.delete(v[0] as string) ? 1 : 0;
        case 'addDevice': {
          const [id, userId, endpoint, p256dh, auth] = v as string[];
          const old = db.devices.find((d) => d.endpoint === endpoint);
          if (old) Object.assign(old, { userId, p256dh, auth, failures: 0, createdAt: db.now + seq++ });
          else db.devices.push({ id, userId, endpoint, p256dh, auth, createdAt: db.now + seq++, failures: 0, lastSuccessAt: null });
          return 1;
        }
        case 'trimDevices': {
          const mine = db.devices.filter((d) => d.userId === v[0]).sort((a, b) => b.createdAt - a.createdAt);
          const drop = new Set(mine.slice(10).map((d) => d.id));
          db.devices = db.devices.filter((d) => !drop.has(d.id));
          return drop.size;
        }
        case 'removeAllDevices': { const n = db.devices.length; db.devices = db.devices.filter((d) => d.userId !== v[0]); return n - db.devices.length; }
        case 'removeDevice': { const n = db.devices.length; db.devices = db.devices.filter((d) => !(d.userId === v[0] && d.endpoint === v[1])); return n - db.devices.length; }
        case 'deviceWorked': { const d = db.devices.find((x) => x.id === v[0]); if (d) { d.failures = 0; d.lastSuccessAt = db.now; } return d ? 1 : 0; }
        case 'deviceGone': { const n = db.devices.length; db.devices = db.devices.filter((d) => d.id !== v[0]); return n - db.devices.length; }
        case 'deviceFailed': { const d = db.devices.find((x) => x.id === v[0]); if (d) d.failures += 1; return d ? 1 : 0; }
        case 'deviceDropFailing': { const n = db.devices.length; db.devices = db.devices.filter((d) => !(d.id === v[0] && d.failures >= 5)); return n - db.devices.length; }
        case 'logSend': { const [id, userId, kind, channel] = v as string[]; db.log.push({ id, userId, kind, channel, sentAt: db.now }); return 1; }
        default: throw new Error(`fakePushDb: ${name} is not a statement`);
      }
    },
    user: {
      async findUnique(a) {
        const u = db.users.find((x) => x.id === a.where.id);
        return u ? { dobYear: u.dobYear, email: u.email ?? null } : null;
      },
    },
    coachingProgram: { async count(a) { return db.users.find((u) => u.id === a.where.coachId)?.coach ? 1 : 0; } },
  };
  return db;
}
