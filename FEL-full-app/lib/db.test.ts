// DB-CONNECTOR (2026-09-29): lib/db.ts, the one place the app builds its Prisma client.
//
// Two promises to keep. With CLOUD_SQL_INSTANCE unset, nothing changes: the plain client on DATABASE_URL, byte for
// byte, with no connector loaded — that is local dev, every test, tip=eye and fel_dev. With it set, the client goes
// through the connector, lazily. And the guards: DATABASE_URL/DIRECT_URL stay in the schema and the env validator, and
// the production instance name is written into no code.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  loaded: 0,
  constructed: 0,
  starts: [] as { instanceConnectionName: string; listenOptions: { path: string } }[],
  made: [] as { args: unknown[]; url: string | undefined }[],
}));

vi.mock('@/public/_prisma/client', () => {
  class PrismaClientInitializationError extends Error {
    constructor(message: string, readonly clientVersion: string, readonly errorCode?: string) { super(message); }
  }
  /** Resolves its URL the way Prisma does: an explicit datasource URL, else the schema's env("DATABASE_URL"). */
  class PrismaClient {
    readonly url: string | undefined;
    constructor(...args: any[]) {
      this.url = args[0]?.datasourceUrl ?? args[0]?.datasources?.db?.url ?? process.env.DATABASE_URL;
      h.made.push({ args, url: this.url });
    }
    $extends(ext: any) {
      const run = (op: string) => ext.query.$allOperations({ args: undefined, query: async () => op });
      return { user: { count: () => run('user.count') }, $transaction: async () => 'tx', $connect: async () => undefined, $disconnect: async () => undefined };
    }
    user = { count: async () => 'plain user.count' };
    async $disconnect() {}
  }
  return { PrismaClient, Prisma: { PrismaClientInitializationError, prismaVersion: { client: '6.7.0' } } };
});

const connectorModule = () => {
  h.loaded++;
  class Connector {
    constructor() { h.constructed++; }
    async startLocalProxy(opts: (typeof h.starts)[number]) { h.starts.push(opts); }
    close() {}
  }
  return { Connector };
};

const KEYS = ['DATABASE_URL', 'CLOUD_SQL_INSTANCE', 'DB_USER', 'DB_PASS', 'DB_NAME', 'CLOUD_SQL_IP_TYPE', 'DB_CONNECTION_LIMIT'];
const saved: Record<string, string | undefined> = {};
const g = globalThis as unknown as { prisma?: unknown } & Record<symbol, unknown>;

beforeEach(() => {
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  delete g.prisma;
  delete g[Symbol.for('fel.db.cloudSql')];
  vi.resetModules();
  vi.doMock('@google-cloud/cloud-sql-connector', connectorModule);
  Object.assign(h, { loaded: 0, constructed: 0, starts: [], made: [] });
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(async () => {
  if (h.starts.length) await (await import('@/lib/db/cloudSql')).shutdownCloudSql();
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  delete g.prisma;
  vi.restoreAllMocks();
});

describe('lib/db with CLOUD_SQL_INSTANCE unset (local dev, tests, tip=eye, fel_dev)', () => {
  it('is the plain client, and the URL Prisma uses is DATABASE_URL byte for byte', async () => {
    const LOCAL = 'postgresql://elijahbonds@127.0.0.1:5432/fel_dev';
    process.env.DATABASE_URL = LOCAL;
    const { prisma } = await import('@/lib/db');
    expect(h.made).toHaveLength(1);
    expect(h.made[0].args).toEqual([]); // `new PrismaClient()`: no datasource override of any kind
    expect(h.made[0].url).toBe(LOCAL);
    expect(process.env.DATABASE_URL).toBe(LOCAL); // not rewritten either
    for (const added of ['connection_limit', 'pool_timeout', 'host=', 'sslmode']) expect(h.made[0].url).not.toContain(added);
    await expect((prisma as any).user.count()).resolves.toBe('plain user.count');
    expect(h.loaded).toBe(0); // the connector module is never even imported
    expect(h.constructed).toBe(0);
  });

  it('an empty CLOUD_SQL_INSTANCE is unset', async () => {
    process.env.DATABASE_URL = 'postgresql://elijahbonds@localhost:5432/fel_dbconn_tmp';
    process.env.CLOUD_SQL_INSTANCE = '';
    await import('@/lib/db');
    expect(h.made[0].args).toEqual([]);
    expect(h.loaded).toBe(0);
  });

  it('keeps the dev globalThis cache: a hot reload gets the same client', async () => {
    process.env.DATABASE_URL = 'postgresql://elijahbonds@127.0.0.1:5432/fel_dev';
    const first = (await import('@/lib/db')).prisma;
    expect(g.prisma).toBe(first);
    vi.resetModules();
    const second = (await import('@/lib/db')).prisma;
    expect(second).toBe(first);
    expect(h.made).toHaveLength(1);
  });
});

describe('lib/db with CLOUD_SQL_INSTANCE set (production)', () => {
  beforeEach(() => {
    Object.assign(process.env, { CLOUD_SQL_INSTANCE: 'proj:region:inst', DB_USER: 'app', DB_PASS: 's3cret', DB_NAME: 'fel' });
    process.env.DATABASE_URL = 'postgresql://app:s3cret@203.0.113.9:5432/fel?sslmode=require';
  });

  it('hands Prisma the socket URL, and importing it starts nothing', async () => {
    await import('@/lib/db');
    expect(h.made).toHaveLength(1);
    const u = new URL(h.made[0].url!);
    expect(u.hostname).toBe('localhost');
    expect(u.searchParams.get('host')).toMatch(/fel-cloudsql-[0-9a-f]{12}$/);
    expect(u.searchParams.get('connection_limit')).toBe('5');
    expect(u.searchParams.has('sslmode')).toBe(false);
    expect(h.loaded).toBe(0);
    expect(h.constructed).toBe(0);
  });

  it('the first query starts the proxy for the instance named in the environment', async () => {
    const { prisma } = await import('@/lib/db');
    await expect((prisma as any).user.count()).resolves.toBe('user.count');
    expect(h.constructed).toBe(1);
    expect(h.starts[0].instanceConnectionName).toBe('proj:region:inst');
    expect(h.starts[0].listenOptions.path).toBe(join(new URL(h.made[0].url!).searchParams.get('host')!, '.s.PGSQL.5432'));
  });

  it('a failed start surfaces as Prisma\'s initialization error', async () => {
    delete process.env.DB_PASS;
    const { prisma } = await import('@/lib/db');
    const { Prisma } = await import('@/public/_prisma/client');
    const e = await (prisma as any).user.count().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(Prisma.PrismaClientInitializationError);
    expect(e.message).toBe('cloud-sql connector: missing environment variable(s): DB_PASS');
  });
});

describe('guards', () => {
  it('prisma/schema.prisma still reads DATABASE_URL and DIRECT_URL (prisma migrate / generate need them)', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8');
    expect(schema).toContain('    url       = env("DATABASE_URL")\n');
    expect(schema).toContain('    directUrl = env("DIRECT_URL")\n');
  });

  it('lib/env.ts still lists DATABASE_URL as required', () => {
    const src = readFileSync('lib/env.ts', 'utf8');
    const required = /const REQUIRED_VARS[^=]*=\s*\[([\s\S]*?)\]/.exec(src)?.[1] ?? '';
    expect(required).toContain("'DATABASE_URL'");
  });

  it('the production instance name is written nowhere in code, config or tests', () => {
    // Built from parts so this file does not contain what it looks for.
    const needles = [['elijahbonds', 'fdc'].join('-'), ['final-evolution-lab', ''].join(':')];
    const hits: string[] = [];
    const scan = (p: string) => {
      const st = statSync(p);
      if (st.isDirectory()) {
        for (const name of readdirSync(p)) if (name !== 'node_modules' && !name.startsWith('.next')) scan(join(p, name));
        return;
      }
      if (!/\.(ts|tsx|js|mjs|cjs|json|prisma|sql|sh)$/.test(p) || st.size > 2_000_000) return;
      const text = readFileSync(p, 'utf8');
      for (const n of needles) if (text.includes(n)) hits.push(`${p}: ${n}`);
    };
    for (const root of ['lib', 'app', 'components', 'tests', 'next.config.js', 'package.json', '.env.example']) {
      try { statSync(root); } catch { continue; }
      if (root === '.env.example') { const t = readFileSync(root, 'utf8'); for (const n of needles) if (t.includes(n)) hits.push(`${root}: ${n}`); }
      else scan(root);
    }
    expect(hits).toEqual([]);
  });
});
