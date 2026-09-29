// DB-CONNECTOR (2026-09-29): the Cloud SQL connector path, with the connector and the Prisma engine both faked.
//
// The fake engine REFUSES any operation that reaches it before the proxy is listening, which is what the real one does
// (it dials a socket that is not there yet). So every "resolves" below is also a proof that the operation waited.
// lib/db/cloudSql.integration.test.ts runs the same shapes against the real Prisma engine and a real Postgres.
import { EventEmitter } from 'node:events';
import { existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@/public/_prisma/client';
import { isUnreachable } from './errors';
import {
  CLOUD_SQL_STATE, DEFAULT_CONNECTION_LIMIT, POOL_TIMEOUT_S, SOCKET_FILE, cloudSqlEnabled, createCloudSqlPrisma,
  readCloudSqlConfig, shutdownCloudSql, socketDatabaseUrl, type ProcessLike,
} from './cloudSql';

const h = vi.hoisted(() => ({
  loaded: 0,
  constructed: 0,
  closes: 0,
  starts: [] as { instanceConnectionName: string; ipType: string; listenOptions: { path: string } }[],
  listening: false,
  failNext: 0,
  delayMs: 15,
}));

// Registered per test (vi.doMock below) so `loaded` really counts imports: a hoisted vi.mock's factory runs once per file.
const connectorModule = () => {
  h.loaded++;
  class Connector {
    constructor() { h.constructed++; }
    async startLocalProxy(opts: (typeof h.starts)[number]) {
      h.starts.push(opts);
      await new Promise((r) => setTimeout(r, h.delayMs));
      if (h.failNext > 0) {
        h.failNext--;
        throw new Error('getaddrinfo ENOTFOUND sqladmin.googleapis.com');
      }
      h.listening = true;
    }
    close() { h.closes++; h.listening = false; }
  }
  return { Connector };
};

/** The engine: every operation that reaches it must find the proxy listening. */
class FakePrisma {
  static made: FakePrisma[] = [];
  engine: string[] = [];
  disconnects = 0;
  constructor(readonly options: { datasourceUrl: string }) { FakePrisma.made.push(this); }
  private reach(op: string) {
    if (!h.listening) throw new Error(`engine dialled for ${op} before the proxy was listening`);
    this.engine.push(op);
    return { op };
  }
  $extends(ext: { query: { $allOperations(p: { args: unknown; query: (a: unknown) => Promise<unknown> }): Promise<unknown> } }) {
    const run = (op: string, args?: unknown) => ext.query.$allOperations({ args, query: async () => this.reach(op) });
    const client: Record<string, any> = {
      user: { findMany: (a?: unknown) => run('user.findMany', a), count: (a?: unknown) => run('user.count', a) },
      $queryRaw: (...a: unknown[]) => run('$queryRaw', a),
      $executeRawUnsafe: (...a: unknown[]) => run('$executeRawUnsafe', a),
      $transaction: async (arg: unknown) => {
        this.reach('$transaction');
        return Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(client);
      },
      $connect: async () => { this.reach('$connect'); },
      $disconnect: () => this.$disconnect(),
    };
    return client;
  }
  async $disconnect() { this.disconnects++; }
}

const PASS = 'p@ss:w/rd?#%&=';
const ENV = { CLOUD_SQL_INSTANCE: 'proj:region:inst', DB_USER: 'app', DB_PASS: PASS, DB_NAME: 'fel' };
const initError = (message: string, code?: string) =>
  new Prisma.PrismaClientInitializationError(message, Prisma.prismaVersion.client, code);

function fakeProc(otherSigtermListener = true): ProcessLike & EventEmitter & { kill: ReturnType<typeof vi.fn> } {
  const p = Object.assign(new EventEmitter(), { pid: 4242, kill: vi.fn() });
  if (otherSigtermListener) p.on('SIGTERM', () => undefined); // Next's own server, say
  return p;
}
const make = (env: NodeJS.ProcessEnv = ENV, proc = fakeProc()) =>
  createCloudSqlPrisma<any>(FakePrisma, initError, { env, proc });
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CLOUD_SQL_STATE]; // a fresh process
  vi.resetModules();
  vi.doMock('@google-cloud/cloud-sql-connector', connectorModule); // loaded afresh, so `loaded` counts this test's imports
  Object.assign(h, { loaded: 0, constructed: 0, closes: 0, starts: [], listening: false, failNext: 0, delayMs: 15 });
  FakePrisma.made = [];
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(async () => {
  await shutdownCloudSql(); // removes this test's socket dir
  vi.restoreAllMocks();
});

describe('the connector environment', () => {
  it('is on only when CLOUD_SQL_INSTANCE is set to something', () => {
    expect(cloudSqlEnabled({})).toBe(false);
    expect(cloudSqlEnabled({ CLOUD_SQL_INSTANCE: '' })).toBe(false);
    expect(cloudSqlEnabled({ CLOUD_SQL_INSTANCE: '   ' })).toBe(false);
    expect(cloudSqlEnabled({ CLOUD_SQL_INSTANCE: 'proj:region:inst' })).toBe(true);
  });

  it('defaults: CLOUD_SQL_IP_TYPE unset is PUBLIC, DB_CONNECTION_LIMIT unset is 5', () => {
    const cfg = readCloudSqlConfig(ENV);
    expect(cfg).toEqual({ instance: 'proj:region:inst', user: 'app', password: PASS, database: 'fel', ipType: 'PUBLIC', connectionLimit: 5 });
    expect(DEFAULT_CONNECTION_LIMIT).toBe(5);
  });

  it('both defaults are overridable', () => {
    expect(readCloudSqlConfig({ ...ENV, CLOUD_SQL_IP_TYPE: 'PRIVATE', DB_CONNECTION_LIMIT: '12' })).toMatchObject({ ipType: 'PRIVATE', connectionLimit: 12 });
    expect(readCloudSqlConfig({ ...ENV, CLOUD_SQL_IP_TYPE: 'psc' }).ipType).toBe('PSC');
  });

  it('refuses a bad IP type or pool size by NAMING the variable', () => {
    expect(() => readCloudSqlConfig({ ...ENV, CLOUD_SQL_IP_TYPE: 'SQL_DATA' })).toThrow(/CLOUD_SQL_IP_TYPE must be one of PUBLIC, PRIVATE, PSC/);
    for (const bad of ['0', '-1', 'five', '2.5']) {
      expect(() => readCloudSqlConfig({ ...ENV, DB_CONNECTION_LIMIT: bad })).toThrow(/DB_CONNECTION_LIMIT must be a positive integer/);
    }
  });

  it('a missing variable is named, and no value is ever echoed', () => {
    let message = '';
    try { readCloudSqlConfig({ CLOUD_SQL_INSTANCE: 'proj:region:inst', DB_PASS: PASS }); } catch (e) { message = (e as Error).message; }
    expect(message).toBe('cloud-sql connector: missing environment variable(s): DB_USER, DB_NAME');
    expect(() => readCloudSqlConfig({})).toThrow('CLOUD_SQL_INSTANCE, DB_USER, DB_PASS, DB_NAME');
  });
});

describe('the URL Prisma gets', () => {
  it('is the local socket: localhost, host=<dir>, a pool bound, no sslmode, credentials encoded', () => {
    const dir = join(tmpdir(), 'fel-cloudsql-test');
    const url = socketDatabaseUrl(readCloudSqlConfig(ENV), dir);
    const u = new URL(url);
    expect(u.protocol).toBe('postgresql:');
    expect(u.hostname).toBe('localhost');
    expect(u.port).toBe('');
    expect(decodeURIComponent(u.username)).toBe('app');
    expect(decodeURIComponent(u.password)).toBe(PASS);
    expect(u.pathname).toBe('/fel');
    expect(u.searchParams.get('host')).toBe(dir);
    expect(u.searchParams.get('connection_limit')).toBe('5');
    expect(u.searchParams.get('pool_timeout')).toBe(String(POOL_TIMEOUT_S));
    expect(u.searchParams.has('sslmode')).toBe(false);
    expect(url).not.toContain(PASS); // only ever percent-encoded, so ':' '@' '/' '?' '#' cannot break the URL
  });
});

describe('the connector client', () => {
  it('is lazy: constructing it loads nothing and starts nothing; the first query starts the one proxy', async () => {
    const prisma = make();
    expect(h.loaded).toBe(0);
    expect(h.constructed).toBe(0);
    const url = new URL(FakePrisma.made[0].options.datasourceUrl);
    const dir = url.searchParams.get('host')!;
    expect(dirname(dir)).toBe(tmpdir());
    expect(existsSync(dir)).toBe(false); // named, not created, until the connector starts

    await expect(prisma.user.findMany()).resolves.toEqual({ op: 'user.findMany' });
    expect(h.loaded).toBe(1);
    expect(h.constructed).toBe(1);
    expect(h.starts).toEqual([{ instanceConnectionName: 'proj:region:inst', ipType: 'PUBLIC', listenOptions: { path: join(dir, SOCKET_FILE) } }]);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });

  it('passes the configured IP type to the proxy', async () => {
    const prisma = make({ ...ENV, CLOUD_SQL_IP_TYPE: 'PRIVATE' });
    await prisma.$queryRaw`SELECT 1`;
    expect(h.starts[0].ipType).toBe('PRIVATE');
  });

  const FIRST_CALLS: [string, (p: any) => Promise<unknown>][] = [
    ['a model operation', (p) => p.user.count()],
    ['$queryRaw', (p) => p.$queryRaw`SELECT 1`],
    ['$executeRawUnsafe', (p) => p.$executeRawUnsafe('SELECT 1')],
    ['an array $transaction', (p) => p.$transaction([p.user.count(), p.$queryRaw`SELECT 1`])],
    ['an interactive $transaction', (p) => p.$transaction(async (tx: any) => tx.user.findMany())],
    ['$connect', (p) => p.$connect()],
  ];
  it.each(FIRST_CALLS)('%s as the very first call waits for the proxy', async (_name, call) => {
    const prisma = make();
    await call(prisma); // the fake engine throws if it is dialled before the proxy listens
    expect(FakePrisma.made[0].engine.length).toBeGreaterThan(0);
    expect(h.constructed).toBe(1);
    expect(h.starts).toHaveLength(1);
  });

  it('20 concurrent first queries share ONE Connector and ONE startLocalProxy, and all resolve', async () => {
    const prisma = make();
    const calls = Array.from({ length: 20 }, (_, i) => FIRST_CALLS[i % FIRST_CALLS.length][1](prisma));
    const results = await Promise.allSettled(calls);
    expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
    expect(h.loaded).toBe(1);
    expect(h.constructed).toBe(1);
    expect(h.starts).toHaveLength(1);
  });

  it('a second client in the same process (a second copy of lib/db) shares the proxy and its socket', async () => {
    const a = make();
    const b = make();
    await Promise.all([a.user.count(), b.user.count()]);
    expect(FakePrisma.made[0].options.datasourceUrl).toBe(FakePrisma.made[1].options.datasourceUrl);
    expect(h.constructed).toBe(1);
  });

  it('a failed start is not cached: it rejects as an unreachable database, cleans up, and the next query retries', async () => {
    const prisma = make();
    h.failNext = 1;
    const dir = new URL(FakePrisma.made[0].options.datasourceUrl).searchParams.get('host')!;
    const [first, second] = await Promise.allSettled([prisma.user.count(), prisma.$queryRaw`SELECT 1`]);
    for (const r of [first, second]) {
      expect(r.status).toBe('rejected');
      const e = (r as PromiseRejectedResult).reason;
      expect(e).toBeInstanceOf(Prisma.PrismaClientInitializationError);
      expect(isUnreachable(e)).toBe(true); // lib/db/errors.ts: the existing "cannot reach the database" path
      expect(e.errorCode).toBe('P1001');
      expect(e.message).toContain('could not start for instance proj:region:inst');
      expect(e.message).toContain('ENOTFOUND');
    }
    expect(h.constructed).toBe(1);
    expect(h.closes).toBe(1); // the half-started connector is closed, not leaked
    expect(existsSync(dir)).toBe(false);

    await expect(prisma.user.count()).resolves.toEqual({ op: 'user.count' });
    expect(h.constructed).toBe(2);
    expect(h.starts).toHaveLength(2);
  });

  it('an incomplete config rejects every query naming the missing variables, and never loads the connector', async () => {
    const prisma = make({ CLOUD_SQL_INSTANCE: 'proj:region:inst', DB_USER: 'app', DB_NAME: 'fel' });
    for (let i = 0; i < 2; i++) {
      const e = await prisma.user.count().catch((x: unknown) => x);
      expect(e).toBeInstanceOf(Prisma.PrismaClientInitializationError);
      expect(isUnreachable(e)).toBe(true);
      expect((e as Error).message).toBe('cloud-sql connector: missing environment variable(s): DB_PASS');
    }
    await expect(prisma.$transaction(async () => 1)).rejects.toThrow('DB_PASS');
    expect(h.loaded).toBe(0);
    expect(h.constructed).toBe(0);
  });
});

describe('shutdown', () => {
  it('SIGTERM disconnects Prisma, closes the connector (and with it the proxy) and removes the socket dir — once', async () => {
    const proc = fakeProc();
    const prisma = make(ENV, proc);
    await prisma.user.count();
    const dir = dirname(h.starts[0].listenOptions.path);
    expect(existsSync(dir)).toBe(true);

    proc.emit('SIGTERM');
    await shutdownCloudSql();
    expect(FakePrisma.made[0].disconnects).toBe(1);
    expect(h.closes).toBe(1);
    expect(existsSync(dir)).toBe(false);

    proc.emit('SIGTERM');
    proc.emit('beforeExit', 0);
    await shutdownCloudSql();
    await flush();
    expect(FakePrisma.made[0].disconnects).toBe(1);
    expect(h.closes).toBe(1);
    expect(proc.kill).not.toHaveBeenCalled(); // someone else is listening: they own the exit
  });

  it('beforeExit alone does the same cleanup, once', async () => {
    const proc = fakeProc();
    const prisma = make(ENV, proc);
    await prisma.user.count();
    proc.emit('beforeExit', 0);
    proc.emit('beforeExit', 0);
    await shutdownCloudSql();
    expect(FakePrisma.made[0].disconnects).toBe(1);
    expect(h.closes).toBe(1);
  });

  it('as the ONLY SIGTERM listener it hands the signal back after cleanup, instead of swallowing it', async () => {
    const proc = fakeProc(false);
    const prisma = make(ENV, proc);
    await prisma.user.count();
    let atKill: { closes: number; disconnects: number; listeners: number } | undefined;
    proc.kill.mockImplementation(() => {
      atKill = { closes: h.closes, disconnects: FakePrisma.made[0].disconnects, listeners: proc.listenerCount('SIGTERM') };
    });
    proc.emit('SIGTERM');
    await shutdownCloudSql();
    await flush();
    expect(proc.kill).toHaveBeenCalledTimes(1);
    expect(proc.kill).toHaveBeenCalledWith(4242, 'SIGTERM');
    // cleanup first, and the listener gone, so the re-sent signal takes Node's default: exit
    expect(atKill).toEqual({ closes: 1, disconnects: 1, listeners: 0 });
  });

  it('registers its handlers once per process, however many clients, queries and retries', async () => {
    const proc = fakeProc(false);
    const a = make(ENV, proc);
    const b = make(ENV, proc);
    h.failNext = 1;
    await a.user.count().catch(() => undefined);
    await Promise.all([a.user.count(), b.$queryRaw`SELECT 1`, b.user.findMany()]);
    expect(proc.listenerCount('SIGTERM')).toBe(1);
    expect(proc.listenerCount('beforeExit')).toBe(1);
  });

  it('registers nothing until the first query', () => {
    const proc = fakeProc(false);
    make(ENV, proc);
    expect(proc.listenerCount('SIGTERM')).toBe(0);
    expect(proc.listenerCount('beforeExit')).toBe(0);
  });

  it('waits out a start in flight, then closes it; later queries reject instead of reopening', async () => {
    const proc = fakeProc();
    const prisma = make(ENV, proc);
    h.delayMs = 40;
    const inFlight = prisma.user.count().catch((e: unknown) => e);
    await flush();
    proc.emit('SIGTERM');
    await shutdownCloudSql();
    expect(h.closes).toBe(1);
    await inFlight;
    const e = await prisma.user.count().catch((x: unknown) => x);
    expect(isUnreachable(e)).toBe(true);
    expect((e as Error).message).toBe('cloud-sql connector: shut down');
    expect(h.constructed).toBe(1);
  });
});

describe('secrets', () => {
  it('nothing logged or thrown carries the password or a credentialed URL — through a start, a failed start, a bad config and cleanup', async () => {
    const said: string[] = [];
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { said.push(args.map(String).join(' ')); });
    }
    const thrown: string[] = [];
    const keep = (e: unknown) => { thrown.push(String((e as Error)?.message ?? e), String((e as Error)?.stack ?? '')); };

    const proc = fakeProc();
    const prisma = make(ENV, proc);
    const url = FakePrisma.made[0].options.datasourceUrl;
    h.failNext = 1;
    await prisma.user.count().catch(keep);
    await prisma.user.count();
    await make({ ...ENV, DB_NAME: '' }).user.count().catch(keep);
    try { readCloudSqlConfig({ ...ENV, CLOUD_SQL_IP_TYPE: 'nope' }); } catch (e) { keep(e); }
    proc.emit('SIGTERM');
    await shutdownCloudSql();
    await prisma.user.count().catch(keep);

    expect(said).toEqual(['cloud-sql connector: enabled for instance proj:region:inst']);
    expect(thrown.length).toBeGreaterThan(0);
    for (const text of [...said, ...thrown]) {
      expect(text).not.toContain(PASS);
      expect(text).not.toContain(encodeURIComponent(PASS));
      expect(text).not.toContain(url);
      expect(text).not.toContain('postgresql://');
    }
  });
});
