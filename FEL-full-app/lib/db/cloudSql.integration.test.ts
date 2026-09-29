// DB-CONNECTOR (2026-09-29): the connector path against the REAL Prisma engine and a REAL Postgres.
//
// Opt-in and local-only, like the sessions integration test: it runs when DB_CONNECTOR_IT=1 and DATABASE_URL points at a
// database on 127.0.0.1 / localhost that is not fel_dev or fel (a throwaway one with this schema applied), and is skipped
// everywhere else, CI included. Only the connector is faked, and faithfully: startLocalProxy takes a while (the real one
// fetches instance metadata and a certificate first), then listens on the unix socket it was given and pipes every
// connection to that Postgres, the way the real one pipes to Cloud SQL. Nothing leaves the machine.
//
// What the unit test cannot show, this does: Prisma 6.7 really connects through `?host=<dir>` with DATABASE_URL and
// DIRECT_URL both gone from the environment, no operation shape dials the socket before it exists, and the pool stays
// inside connection_limit. A control proves the timing matters: an unheld client dialling early fails.
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { isUnreachable } from './errors';

const DB_URL = process.env.DATABASE_URL ?? '';
const LOCAL_DB = /^postgres(?:ql)?:\/\/[^/]*@(?:127\.0\.0\.1|localhost)(?::\d+)?\/(?!fel_dev(?:[?]|$)|fel(?:[?]|$))[\w-]+(?:\?.*)?$/.test(DB_URL);
const RUN = process.env.DB_CONNECTOR_IT === '1' && LOCAL_DB;

const h = vi.hoisted(() => ({
  constructed: 0, starts: 0, closes: 0, failNext: 0,
  piped: 0, maxLive: 0,
  open: new Set<object>(), // this test's live client sockets; a late close from an earlier test deletes nothing
  upstream: { host: '127.0.0.1', port: 5432 },
  delayMs: 300,
}));

vi.mock('@google-cloud/cloud-sql-connector', async () => {
  const net = await import('node:net');
  class Connector {
    private servers: import('node:net').Server[] = [];
    private sockets = new Set<import('node:net').Socket>();
    constructor() { h.constructed++; }
    async startLocalProxy({ listenOptions }: { listenOptions: { path: string } }) {
      h.starts++;
      await new Promise((r) => setTimeout(r, h.delayMs));
      if (h.failNext > 0) { h.failNext--; throw new Error('Could not load the default credentials'); }
      const server = net.createServer((c) => {
        h.piped++;
        h.open.add(c);
        h.maxLive = Math.max(h.maxLive, h.open.size);
        const s = net.connect(h.upstream.port, h.upstream.host);
        this.sockets.add(c).add(s);
        c.pipe(s);
        s.pipe(c);
        c.once('close', () => { h.open.delete(c); s.destroy(); });
        s.once('close', () => c.destroy());
        c.on('error', () => s.destroy());
        s.on('error', () => c.destroy());
      });
      this.servers.push(server);
      await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(listenOptions.path, resolve); });
    }
    close() {
      h.closes++;
      for (const s of this.servers) s.close();
      for (const x of this.sockets) x.destroy();
    }
  }
  return { Connector };
});

describe.skipIf(!RUN)('DB-CONNECTOR against the real Prisma engine and a throwaway Postgres (DB_CONNECTOR_IT=1)', () => {
  const up = new URL(DB_URL || 'postgresql://x@127.0.0.1:5432/x');
  const DB = decodeURIComponent(up.pathname.slice(1));
  const ENV = {
    CLOUD_SQL_INSTANCE: 'proj:region:inst',
    DB_USER: decodeURIComponent(up.username),
    DB_PASS: 'ignored-by-local-trust-auth',
    DB_NAME: DB,
  };
  let PrismaClient: any;
  let Prisma: any;
  let cloud: typeof import('./cloudSql');
  const proc = () => Object.assign(new EventEmitter(), { pid: process.pid, kill: vi.fn() }).on('SIGTERM', () => undefined);
  const initError = (m: string, c?: string) => new Prisma.PrismaClientInitializationError(m, Prisma.prismaVersion.client, c);
  const make = (env: NodeJS.ProcessEnv = ENV, p = proc()) => cloud.createCloudSqlPrisma<any>(PrismaClient, initError, { env, proc: p });
  const stateDir = () => (globalThis as any)[Symbol.for('fel.db.cloudSql')].dir as string;

  beforeAll(async () => {
    h.upstream = { host: up.hostname, port: Number(up.port || 5432) };
    ({ PrismaClient, Prisma } = await import('@/public/_prisma/client'));
    cloud = await import('./cloudSql');
  });

  it('plain path: with CLOUD_SQL_INSTANCE unset, lib/db runs one simple query on DATABASE_URL, no connector', async () => {
    const before = process.env.CLOUD_SQL_INSTANCE;
    delete process.env.CLOUD_SQL_INSTANCE;
    const { prisma } = await import('@/lib/db');
    const [{ db }] = (await prisma.$queryRaw`SELECT current_database() AS db`) as { db: string }[];
    expect(db).toBe(DB);
    expect(h.constructed).toBe(0);
    await prisma.$disconnect();
    if (before !== undefined) process.env.CLOUD_SQL_INSTANCE = before;
  });

  describe('connector path, with DATABASE_URL and DIRECT_URL removed from the environment', () => {
    const saved: Record<string, string | undefined> = {};
    beforeAll(() => { for (const k of ['DATABASE_URL', 'DIRECT_URL']) { saved[k] = process.env[k]; delete process.env[k]; } });
    afterAll(() => { for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v; });
    beforeEach(() => {
      delete (globalThis as any)[Symbol.for('fel.db.cloudSql')];
      Object.assign(h, { constructed: 0, starts: 0, closes: 0, failNext: 0, piped: 0, maxLive: 0, open: new Set(), delayMs: 300 });
      vi.spyOn(console, 'info').mockImplementation(() => undefined);
    });
    afterEach(async () => {
      await cloud.shutdownCloudSql();
      vi.restoreAllMocks();
    });

    it('control: an UNHELD client dialling the socket before the proxy listens fails; the same client works once it does', async () => {
      const gated = make();
      const raw = new PrismaClient({ datasourceUrl: cloud.socketDatabaseUrl(cloud.readCloudSqlConfig(ENV), stateDir()) });
      const early = await raw.$queryRaw`SELECT 1 AS one`.catch((e: unknown) => e);
      expect(early).toBeInstanceOf(Error);
      expect(isUnreachable(early)).toBe(true);
      await gated.$queryRaw`SELECT 1 AS one`;
      await expect(raw.$queryRaw`SELECT 1 AS one`).resolves.toEqual([{ one: 1 }]);
      await raw.$disconnect();
    });

    const FIRST_CALLS: [string, (p: any) => Promise<unknown>, (r: any) => void][] = [
      ['$queryRaw', (p) => p.$queryRaw`SELECT current_database() AS db`, (r) => expect(r).toEqual([{ db: DB }])],
      ['$executeRawUnsafe', (p) => p.$executeRawUnsafe('SELECT 1'), (r) => expect(typeof r).toBe('number')],
      ['a model operation', (p) => p.user.count(), (r) => expect(typeof r).toBe('number')],
      ['an array $transaction', (p) => p.$transaction([p.user.count(), p.$queryRaw`SELECT 1 AS one`]),
        (r) => { expect(typeof r[0]).toBe('number'); expect(r[1]).toEqual([{ one: 1 }]); }],
      ['an interactive $transaction', (p) => p.$transaction(async (tx: any) => {
        const [a] = await tx.$queryRaw`SELECT txid_current()::text AS x`;
        await tx.user.count();
        const [b] = await tx.$queryRaw`SELECT txid_current()::text AS x`;
        return a.x === b.x; // one transaction, on one proxied connection
      }), (r) => expect(r).toBe(true)],
      ['$connect', (p) => p.$connect().then(() => p.$queryRaw`SELECT 1 AS one`), (r) => expect(r).toEqual([{ one: 1 }])],
    ];
    it.each(FIRST_CALLS)('%s as the very first call waits for the proxy and goes through it', async (_name, call, check) => {
      expect(process.env.DATABASE_URL).toBeUndefined();
      const prisma = make();
      check(await call(prisma));
      expect(h.piped).toBeGreaterThan(0);
      expect(h.constructed).toBe(1);
      expect(h.starts).toBe(1);
    });

    it('20 concurrent first queries: one Connector, one proxy start, all resolve, never more than connection_limit sockets', async () => {
      const prisma = make({ ...ENV, DB_CONNECTION_LIMIT: '3' });
      const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => FIRST_CALLS[i % FIRST_CALLS.length][1](prisma)));
      expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
      expect(h.constructed).toBe(1);
      expect(h.starts).toBe(1);
      expect(h.maxLive).toBeGreaterThan(0);
      expect(h.maxLive).toBeLessThanOrEqual(3);
    });

    it('a failed first start is not cached: the query fails as unreachable, the next one connects', async () => {
      const prisma = make();
      h.failNext = 1;
      const e = await prisma.user.count().catch((x: unknown) => x);
      expect(e).toBeInstanceOf(Prisma.PrismaClientInitializationError);
      expect(isUnreachable(e)).toBe(true);
      await expect(prisma.$queryRaw`SELECT 1 AS one`).resolves.toEqual([{ one: 1 }]);
      expect(h.constructed).toBe(2);
    });

    it('SIGTERM: Prisma disconnects, the proxy closes, the socket dir goes, and a later query fails as unreachable', async () => {
      const p = proc();
      const prisma = make(ENV, p);
      await prisma.user.count();
      const dir = stateDir();
      expect(existsSync(join(dir, cloud.SOCKET_FILE))).toBe(true);
      p.emit('SIGTERM');
      await cloud.shutdownCloudSql();
      expect(h.closes).toBe(1);
      expect(existsSync(dir)).toBe(false);
      await new Promise((r) => setTimeout(r, 50));
      expect(h.open.size).toBe(0); // every pooled connection closed
      const after = await prisma.user.count().catch((x: unknown) => x);
      expect(isUnreachable(after)).toBe(true);
      expect(p.kill).not.toHaveBeenCalled();
    });
  });
});
