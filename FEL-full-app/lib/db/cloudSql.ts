// PRODUCTION REACHES CLOUD SQL THROUGH THE CLOUD SQL NODE.JS CONNECTOR (DB-CONNECTOR, 2026-09-29).
//
// Prod used to connect by the instance's raw public IP (DATABASE_URL + ?sslmode=require), so the public network could
// not be closed without taking the site down. With CLOUD_SQL_INSTANCE set, lib/db.ts builds its client here instead:
// the connector (IAM-authorised, TLS to the instance) listens on a unix socket in a per-process temp dir, and Prisma
// talks plain Postgres to that socket. Unset, none of this runs, not even the import: lib/db.ts is the plain client on
// DATABASE_URL, exactly as before, for local dev, tests and tip=eye.
//
// Why it is shaped like this:
//   - LAZY. Nothing starts at import. `next build` imports every route and has no business opening a connection, so the
//     connector starts on the first query. A missing variable is reported there too, by every query, not thrown at
//     import: the build environment may legitimately lack the runtime secrets (DB_PASS comes from Secret Manager).
//   - ONE PER PROCESS. The connector, its proxy and the socket dir live on a process-global, so concurrent first
//     queries — and a second copy of this module (Next can evaluate one per server layer) — share one start.
//   - A FAILED START IS NOT CACHED. The next query retries. The error it throws is a PrismaClientInitializationError, so
//     lib/db/errors.ts#isUnreachable reads it as "cannot talk to the database", the path routes already handle.
//   - `prisma` STAYS SYNCHRONOUS. A query extension holds every model and raw operation until the proxy is listening,
//     and $transaction / $connect (which open an engine connection without going through an operation) are held by
//     a wrapper around the extended client. The ~180 import sites see the same PrismaClient type.
//   - NOTHING SECRET IS LOGGED. At most the instance name. The password only ever lives inside the URL handed to Prisma.
//
// The connector is loaded with a runtime import that webpack is told to leave alone. That keeps the Google auth / gRPC
// stack out of the server bundle (Node loads it from node_modules, which the deploy installs from package-lock.json),
// and means a checkout without the package still type-checks and builds — only the connector path needs it.

import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const IP_TYPES = ['PUBLIC', 'PRIVATE', 'PSC'] as const;
export type IpType = (typeof IP_TYPES)[number];
export const DEFAULT_IP_TYPE: IpType = 'PUBLIC';
export const DEFAULT_CONNECTION_LIMIT = 5;
/** Seconds a query waits for a free pooled connection. Prisma's own default, pinned so the URL says it. */
export const POOL_TIMEOUT_S = 10;
/** The file name Postgres clients look for inside the `host` directory (port 5432). */
export const SOCKET_FILE = '.s.PGSQL.5432';

const CONNECTOR_MODULE = '@google-cloud/cloud-sql-connector';
const REQUIRED = ['CLOUD_SQL_INSTANCE', 'DB_USER', 'DB_PASS', 'DB_NAME'] as const;

export interface CloudSqlConfig {
  instance: string;
  user: string;
  password: string;
  database: string;
  ipType: IpType;
  connectionLimit: number;
}

/** The connector is on only when CLOUD_SQL_INSTANCE is set to something. */
export function cloudSqlEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env.CLOUD_SQL_INSTANCE?.trim();
}

/** Read the connector's environment. Errors name the variables, never their values. */
export function readCloudSqlConfig(env: NodeJS.ProcessEnv = process.env): CloudSqlConfig {
  const missing = REQUIRED.filter((k) => !env[k]?.trim());
  if (missing.length) {
    throw new Error(`cloud-sql connector: missing environment variable(s): ${missing.join(', ')}`);
  }
  const ipType = (env.CLOUD_SQL_IP_TYPE?.trim() || DEFAULT_IP_TYPE).toUpperCase();
  if (!(IP_TYPES as readonly string[]).includes(ipType)) {
    throw new Error(`cloud-sql connector: CLOUD_SQL_IP_TYPE must be one of ${IP_TYPES.join(', ')}`);
  }
  const limit = env.DB_CONNECTION_LIMIT?.trim() || String(DEFAULT_CONNECTION_LIMIT);
  if (!/^[1-9]\d*$/.test(limit)) {
    throw new Error('cloud-sql connector: DB_CONNECTION_LIMIT must be a positive integer');
  }
  return {
    instance: env.CLOUD_SQL_INSTANCE!.trim(),
    user: env.DB_USER!,
    password: env.DB_PASS!,
    database: env.DB_NAME!,
    ipType: ipType as IpType,
    connectionLimit: Number(limit),
  };
}

/** Prisma's URL for the proxy's socket. No sslmode: the connector does the TLS, and a unix socket has none. */
export function socketDatabaseUrl(cfg: CloudSqlConfig, dir: string): string {
  const query = new URLSearchParams({
    host: dir,
    connection_limit: String(cfg.connectionLimit),
    pool_timeout: String(POOL_TIMEOUT_S),
  });
  const auth = `${encodeURIComponent(cfg.user)}:${encodeURIComponent(cfg.password)}`;
  return `postgresql://${auth}@localhost/${encodeURIComponent(cfg.database)}?${query}`;
}

// The parts of the connector this uses (1.12.0). startLocalProxy resolves once the socket is listening; the proxy
// server belongs to the connector, and connector.close() closes it along with every piped socket and refresh timer.
interface ConnectorLike {
  startLocalProxy(options: {
    instanceConnectionName: string;
    ipType: IpType;
    listenOptions: { path: string };
  }): Promise<void>;
  close(): void;
}
interface ConnectorModule {
  Connector: new () => ConnectorLike;
}

/** Just enough of `process` to hook shutdown — a seam for the tests. */
export interface ProcessLike {
  pid: number;
  on(event: 'SIGTERM' | 'beforeExit', listener: () => void): unknown;
  removeListener(event: 'SIGTERM', listener: () => void): unknown;
  listenerCount(event: 'SIGTERM'): number;
  kill(pid: number, signal: 'SIGTERM'): unknown;
}

/** The PrismaClient surface this touches. The generated client's own types are too generic to name structurally. */
interface GateableClient {
  $extends(extension: {
    query: {
      $allOperations(params: { args: unknown; query: (args: unknown) => Promise<unknown> }): Promise<unknown>;
    };
  }): GateableClient;
  $transaction(...args: unknown[]): Promise<unknown>;
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
}

/** Builds the error queries reject with — lib/db.ts passes Prisma's PrismaClientInitializationError. */
export type InitErrorFactory = (message: string, errorCode?: string) => Error;

interface CloudSqlState {
  dir: string;
  clients: Set<GateableClient>;
  connector?: ConnectorLike;
  starting?: Promise<void>;
  hooked: boolean;
  shutdown?: Promise<void>;
}

/** The process-global that makes the connector one per server instance. Tests delete it for a fresh process. */
export const CLOUD_SQL_STATE = Symbol.for('fel.db.cloudSql');

function state(): CloudSqlState {
  const g = globalThis as unknown as Record<symbol, CloudSqlState | undefined>;
  // The dir is only NAMED here; it is created when the connector starts.
  return (g[CLOUD_SQL_STATE] ??= {
    dir: join(tmpdir(), `fel-cloudsql-${randomBytes(6).toString('hex')}`),
    clients: new Set(),
    hooked: false,
  });
}

export interface CloudSqlOptions {
  env?: NodeJS.ProcessEnv;
  proc?: ProcessLike;
}

/**
 * A PrismaClient that reaches Cloud SQL through the connector's local socket. Synchronous: nothing connects until the
 * first operation, which waits for the one shared proxy start.
 */
export function createCloudSqlPrisma<C>(
  Client: new (options: { datasourceUrl: string }) => object,
  initError: InitErrorFactory,
  options: CloudSqlOptions = {},
): C {
  const s = state();
  const proc = options.proc ?? process;
  let cfg: CloudSqlConfig | undefined;
  let configError: string | undefined;
  try {
    cfg = readCloudSqlConfig(options.env);
  } catch (e) {
    configError = (e as Error).message;
  }

  const ready = (): Promise<void> => {
    if (!cfg) return Promise.reject(initError(configError!));
    if (s.shutdown) return Promise.reject(initError('cloud-sql connector: shut down'));
    const config = cfg;
    s.starting ??= start(s, config, proc).catch((e: unknown) => {
      s.starting = undefined; // not cached: the next query tries again
      throw initError(`cloud-sql connector: could not start for instance ${config.instance}: ${describe(e)}`, 'P1001');
    });
    return s.starting;
  };

  // Placeholder URL when the config is incomplete: never dialled, since every operation waits on ready() first.
  const url = cfg ? socketDatabaseUrl(cfg, s.dir) : `postgresql://localhost/unconfigured?host=${encodeURIComponent(s.dir)}`;
  const base = new Client({ datasourceUrl: url }) as unknown as GateableClient;
  s.clients.add(base);

  const gated = base.$extends({
    query: {
      async $allOperations({ args, query }) {
        await ready();
        return query(args);
      },
    },
  });
  const held = {
    $transaction: (...args: unknown[]) => ready().then(() => gated.$transaction(...args)),
    $connect: () => ready().then(() => gated.$connect()),
  };
  return new Proxy(gated, {
    get(target, prop, receiver) {
      if (prop === '$transaction' || prop === '$connect') return held[prop];
      return Reflect.get(target, prop, receiver);
    },
  }) as unknown as C;
}

async function start(s: CloudSqlState, cfg: CloudSqlConfig, proc: ProcessLike): Promise<void> {
  hookShutdown(s, proc);
  mkdirSync(s.dir, { recursive: true, mode: 0o700 });
  let connector: ConnectorLike | undefined;
  try {
    const { Connector } = (await import(/* webpackIgnore: true */ CONNECTOR_MODULE)) as ConnectorModule;
    connector = new Connector();
    await connector.startLocalProxy({
      instanceConnectionName: cfg.instance,
      ipType: cfg.ipType,
      listenOptions: { path: join(s.dir, SOCKET_FILE) },
    });
  } catch (e) {
    connector?.close();
    rmSync(s.dir, { recursive: true, force: true });
    throw e;
  }
  s.connector = connector;
  console.info(`cloud-sql connector: enabled for instance ${cfg.instance}`);
}

/** Close everything once, however many signals arrive. Waits out a start in flight so it cannot leak a connector. */
export function shutdownCloudSql(): Promise<void> {
  const s = state();
  s.shutdown ??= (async () => {
    await s.starting?.catch(() => undefined);
    await Promise.allSettled([...s.clients].map(async (c) => c.$disconnect())); // one failing client cannot stop the rest
    s.connector?.close(); // the local proxy server and every socket it piped
    s.connector = undefined;
    rmSync(s.dir, { recursive: true, force: true });
  })();
  return s.shutdown;
}

// Registered on the first start, once per process (a dev hot reload re-evaluates this module but keeps the global).
// A SIGTERM listener replaces Node's default of exiting, so when this is the only one — nobody else (Next's server,
// the functions framework) will end the process — the signal is handed back after cleanup rather than swallowed.
// When others are listening, they own the exit; this never calls process.exit itself.
function hookShutdown(s: CloudSqlState, proc: ProcessLike): void {
  if (s.hooked) return;
  s.hooked = true;
  // Cleanup never rejects out of a handler: an unhandled rejection would crash the process mid-shutdown.
  const cleanup = () => shutdownCloudSql().catch(() => undefined);
  const onSigterm = () => {
    void cleanup().then(() => {
      if (proc.listenerCount('SIGTERM') === 1) {
        proc.removeListener('SIGTERM', onSigterm);
        proc.kill(proc.pid, 'SIGTERM');
      }
    });
  };
  proc.on('SIGTERM', onSigterm);
  proc.on('beforeExit', () => void cleanup());
}

/** The connector's own failure, told without anything it was handed: its errors carry no database credential. */
function describe(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}
