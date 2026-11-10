// EVERY-SCREEN phase 1: the rig. The REAL app (a production `next build`, served by `next start`) against a LOCAL
// THROWAWAY Postgres, so a screen is scored as a phone gets it: real routes and gates, real code splitting, real APIs,
// and the switched-off features in the state production has them in today.
//
//   The database   Postgres 16 on 127.0.0.1:55441, data in /var/lib/postgresql/every-screen-pg (override ES_PG_DIR /
//                  ES_PG_PORT). `prisma db push` of prisma/schema.prisma and NOTHING from prisma/pending/ on top: the
//                  21 raw-SQL files `scripts/pending-sql/cli.ts plan` lists are not applied, as docs/LAUNCH-CHECKLIST.md
//                  C1 records for production ("not done"). assumption: production matches that; the owner's `plan`
//                  command prints the truth. Measured on the live site 2026-11-10: /groups says "Opens soon",
//                  /coaches, /studio, /live/schedule and /session/x are a 404, as on this rig.
//   The switches   every env switch at its default (off), as .env.example ships them.
//   The people     five accounts made through the real POST /api/signup and signed in through the real credentials
//                  callback: solo (an adult training alone), client (an adult with a coach), coach, admin, teen (15).
//
// Every URL this file writes to is checked to be 127.0.0.1: it refuses anything else (CLAUDE.md: Prisma only against a
// local throwaway).
//
//   npx tsx scripts/every-screen/rig.mts db-up | db-down | db-reset     the throwaway database
//   npx tsx scripts/every-screen/rig.mts build                           next build into .next-every-screen (use cpu-run.sh)
//   npx tsx scripts/every-screen/rig.mts serve                           next start on :3741 until Ctrl-C (use the gate lock)
//   npx tsx scripts/every-screen/rig.mts people                          make and sign in the five accounts (server must be up)
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const PORT = Number(process.env.ES_PORT ?? 3741);
export const ORIGIN = `http://127.0.0.1:${PORT}`;
const PG_PORT = Number(process.env.ES_PG_PORT ?? 55441);
const PG_DIR = process.env.ES_PG_DIR ?? '/var/lib/postgresql/every-screen-pg';
const PG_BIN = process.env.ES_PG_BIN ?? '/usr/lib/postgresql/16/bin';
export const DB_URL = `postgresql://es@127.0.0.1:${PG_PORT}/fel`;
/** the build folder; ES_DIST names another (a second build of the fixed tree beside the baseline's) */
export const DIST = process.env.ES_DIST ?? '.next-every-screen';
/** where the rig keeps its state (sign-ins, per-screen results, shots): never in the repo */
export const STATE = resolve(process.env.ES_OUT ?? '/tmp/every-screen');
const PEOPLE_FILE = (lit: Lit = false) => join(STATE, lit === 'cmp' ? 'people-cmp.json' : lit ? 'people-lit.json' : 'people.json');
/** The LIT rig (scripts/every-screen/dark.mts): the same build on a second throwaway database that has every additive
 *  file in prisma/pending/ applied, so a screen can be compared with and without its tables. */
/** Which rig: false = the main one (the crawl, the walks); true = LIT (every pending file applied); 'cmp' = a fresh copy
 *  of the main one that nothing has walked on, so LIT is compared with a database that differs ONLY by its tables. */
export type Lit = boolean | 'cmp';
const dbName = (lit: Lit) => (lit === 'cmp' ? 'fel_cmp' : lit ? 'fel_lit' : 'fel');
export const portOf = (lit: Lit) => PORT + (lit === 'cmp' ? 2 : lit ? 1 : 0);
export const originOf = (lit: Lit) => `http://127.0.0.1:${portOf(lit)}`;
const urlOf = (lit: Lit) => `postgresql://es@127.0.0.1:${PG_PORT}/${dbName(lit)}`;
export const LIT_ORIGIN = originOf(true);
if (!/^postgresql:\/\/es@127\.0\.0\.1:\d+\/fel$/.test(DB_URL)) throw new Error('every-screen rig: the database must be the local throwaway');

export const RIG_ENV: Record<string, string> = {
  DATABASE_URL: DB_URL, DIRECT_URL: DB_URL,
  NEXTAUTH_SECRET: 'every-screen-rig-not-a-secret', NEXTAUTH_URL: ORIGIN,
  NEXT_DIST_DIR: DIST, NEXT_TELEMETRY_DISABLED: '1',
};
/** the app's env for the rig: the caller's, with every database variable replaced by the throwaway's */
export function rigEnv(lit: Lit = false): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...RIG_ENV, ...(lit ? { DATABASE_URL: urlOf(lit), DIRECT_URL: urlOf(lit), NEXTAUTH_URL: originOf(lit) } : {}) };
  for (const k of ['CLOUD_SQL_INSTANCE', 'DB_USER', 'DB_PASS', 'DB_NAME', 'PROD_DIRECT_URL']) delete env[k];
  return env;
}

// ── the database ─────────────────────────────────────────────────────────────────────────────────────────────────────
const asPg = (cmd: string, args: string[]) => (process.getuid?.() === 0 ? spawnSync('runuser', ['-u', 'postgres', '--', join(PG_BIN, cmd), ...args], { encoding: 'utf8' }) : spawnSync(join(PG_BIN, cmd), args, { encoding: 'utf8' }));
const dbReady = () => spawnSync(join(PG_BIN, 'pg_isready'), ['-h', '127.0.0.1', '-p', String(PG_PORT)]).status === 0;
const psql = (db: string, sql: string) => execFileSync('psql', [`postgresql://es@127.0.0.1:${PG_PORT}/${db}`, '-At', '-c', sql], { encoding: 'utf8' }).trim();

/** A comparison database, made fresh each time: prisma db push, and for LIT every APPLY line of the pending-SQL tool (the
 *  owner's own command, pointed here). */
export function litDbUp(lit: Exclude<Lit, false> = true): void {
  dbUp();
  psql('postgres', `drop database if exists ${dbName(lit)} with (force)`);
  try { unlinkSync(PEOPLE_FILE(lit)); } catch { /* none saved */ }
  psql('postgres', `create database ${dbName(lit)}`);
  execFileSync(join(ROOT, 'node_modules/.bin/prisma'), ['db', 'push', '--schema=prisma/schema.prisma', '--skip-generate'], { cwd: ROOT, env: rigEnv(lit), stdio: 'inherit' });
  if (lit === true) execFileSync(join(ROOT, 'node_modules/.bin/tsx'), ['scripts/pending-sql/cli.ts', 'apply', '--url-env', 'ES_LIT_URL'], { cwd: ROOT, env: { ...rigEnv(lit), ES_LIT_URL: urlOf(lit) }, stdio: 'inherit' });
}

export function dbUp(): void {
  if (!existsSync(join(PG_DIR, 'PG_VERSION'))) {
    mkdirSync(PG_DIR, { recursive: true });
    if (process.getuid?.() === 0) { execFileSync('chown', ['postgres:postgres', PG_DIR]); execFileSync('chmod', ['700', PG_DIR]); }
    const r = asPg('initdb', ['-D', PG_DIR, '-U', 'es', '--auth=trust', '-E', 'UTF8']);
    if (r.status !== 0) throw new Error(`initdb failed: ${r.stderr}`);
  }
  if (!dbReady()) {
    const r = asPg('pg_ctl', ['-D', PG_DIR, '-o', `-p ${PG_PORT} -c listen_addresses=127.0.0.1 -c unix_socket_directories=${PG_DIR} -c fsync=off -c max_connections=60`, '-l', join(PG_DIR, 'log.txt'), '-w', 'start']);
    if (r.status !== 0) throw new Error(`pg_ctl start failed: ${r.stdout}${r.stderr}`);
  }
  if (psql('postgres', `select 1 from pg_database where datname = 'fel'`) !== '1') {
    psql('postgres', 'create database fel');
    execFileSync(join(ROOT, 'node_modules/.bin/prisma'), ['db', 'push', '--schema=prisma/schema.prisma', '--skip-generate'], { cwd: ROOT, env: rigEnv(), stdio: 'inherit' });
  }
}
export function dbDown(): void { if (dbReady()) asPg('pg_ctl', ['-D', PG_DIR, '-m', 'fast', '-w', 'stop']); }
export function dbReset(): void {
  dbUp();
  psql('postgres', 'drop database if exists fel with (force)');
  // the saved sign-ins are for accounts that no longer exist (a session token outlives its row): drop them too
  for (const f of ['people.json']) { try { unlinkSync(join(STATE, f)); } catch { /* none saved */ } }
  dbUp();
}
/** one statement against the throwaway (the rig's own fixtures only) */
export const sql = (statement: string, lit: Lit = false) => psql(dbName(lit), statement);

// ── the server ───────────────────────────────────────────────────────────────────────────────────────────────────────
export async function serverUp(origin = ORIGIN): Promise<boolean> {
  try { const r = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(3000) }); return r.ok; } catch { return false; }
}
/** Start `next start` unless one already answers. Returns a stop function that kills only the process this call started. */
export async function serve(log?: string, lit: Lit = false): Promise<() => void> {
  const origin = originOf(lit);
  if (await serverUp(origin)) return () => {};
  if (!existsSync(join(ROOT, DIST, 'BUILD_ID'))) throw new Error(`no build in ${DIST}: run "rig.mts build" first`);
  const out = log ? (await import('node:fs')).openSync(log, 'a') : 'ignore';
  const child: ChildProcess = spawn(process.execPath, [join(ROOT, 'node_modules/next/dist/bin/next'), 'start', '-p', String(portOf(lit)), '-H', '127.0.0.1'], { cwd: ROOT, env: rigEnv(lit), stdio: ['ignore', out, out] });
  const stop = () => { try { if (child.pid) process.kill(child.pid); } catch { /* already gone */ } };
  process.on('exit', stop);
  // `timeout` ends a hold with SIGTERM, which skips 'exit' handlers: the server must never outlive the hold that started it
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.once(sig, () => { stop(); process.exit(143); });
  for (let i = 0; i < 120; i++) { if (await serverUp(origin)) return stop; await new Promise((r) => setTimeout(r, 500)); }
  stop();
  throw new Error('next start did not answer /api/health in 60 s');
}

// ── the people ───────────────────────────────────────────────────────────────────────────────────────────────────────
export const PEOPLE = ['anon', 'solo', 'client', 'coach', 'admin', 'teen'] as const;
export type Person = typeof PEOPLE[number];
const PASSWORD = 'every-screen-rig-1';
const SIGNUP: Record<Exclude<Person, 'anon'>, { email: string; name: string; birthYear: number }> = {
  solo: { email: 'solo@every-screen.test', name: 'Sam Solo', birthYear: 1996 },
  client: { email: 'client@every-screen.test', name: 'Casey Client', birthYear: 1994 },
  coach: { email: 'coach@every-screen.test', name: 'Coach Riley', birthYear: 1988 },
  admin: { email: 'admin@every-screen.test', name: 'Avery Admin', birthYear: 1985 },
  teen: { email: 'teen@every-screen.test', name: 'Taylor Teen', birthYear: new Date().getUTCFullYear() - 15 },
};
export interface People { cookies: Record<Person, string>; ids: Record<string, string> }


const setCookies = (r: Response) => (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]);
async function signIn(email: string, origin = ORIGIN): Promise<string> {
  const c = await fetch(`${origin}/api/auth/csrf`);
  const { csrfToken } = await c.json() as { csrfToken: string };
  const jar = setCookies(c).join('; ');
  const r = await fetch(`${origin}/api/auth/callback/credentials`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: jar },
    body: new URLSearchParams({ csrfToken, email, password: PASSWORD, json: 'true', callbackUrl: origin }),
  });
  const session = setCookies(r).find((x) => x.startsWith('__session='));
  if (!session) throw new Error(`sign-in failed for ${email}: ${r.status}`);
  return session;
}

/** Make the five accounts through the real sign-up route (once), make one an admin, and sign each in. */
export async function people(fresh = false, lit: Lit = false): Promise<People> {
  const origin = originOf(lit);
  mkdirSync(STATE, { recursive: true });
  if (!fresh && existsSync(PEOPLE_FILE(lit))) {
    const saved = JSON.parse(readFileSync(PEOPLE_FILE(lit), 'utf8')) as People;
    const ok = await fetch(`${origin}/api/auth/session`, { headers: { cookie: saved.cookies.solo } }).then((r) => r.json()).catch(() => null) as { user?: unknown } | null;
    if (ok?.user) return saved;
  }
  const cookies = { anon: '' } as Record<Person, string>;
  const ids: Record<string, string> = {};
  for (const [who, p] of Object.entries(SIGNUP) as [Exclude<Person, 'anon'>, typeof SIGNUP['solo']][]) {
    if (sql(`select count(*) from "User" where email = '${p.email}'`, lit) === '0') {
      const r = await fetch(`${origin}/api/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: p.email, password: PASSWORD, name: p.name, birthYear: p.birthYear }) });
      if (!r.ok) throw new Error(`sign-up failed for ${who}: ${r.status} ${await r.text()}`);
    }
    ids[who] = sql(`select id from "User" where email = '${p.email}'`, lit);
  }
  sql(`update "User" set role = 'admin' where email = '${SIGNUP.admin.email}'`, lit);
  // the rig's coach is a certified coach (the Camp Blueprint credential /api/coach/programs asks for): written straight
  // into the throwaway database, because earning it is a course, not a screen
  sql(`insert into "FacilitatorProfile" (id, "userId", "certificationStatus", "certifiedAt", "createdAt", "updatedAt") values ('es-coach-fac', '${ids.coach}', 'certified', now(), now(), now()) on conflict ("userId") do update set "certificationStatus" = 'certified'`, lit);
  for (const [who, p] of Object.entries(SIGNUP) as [Exclude<Person, 'anon'>, typeof SIGNUP['solo']][]) cookies[who] = await signIn(p.email, origin);
  const out: People = { cookies, ids };
  writeFileSync(PEOPLE_FILE(lit), JSON.stringify(out, null, 1));
  return out;
}

/**
 * The coached pair, made through the app's own routes (once): the coach invites, the client accepts, the coach writes a
 * four-week program and puts three exercises in every session of week 1. So the client has a session to start today and the
 * coach has someone on the roster. Returns what happened, for the run's log.
 */
export async function seedCoaching(p: People, lit: Lit = false): Promise<string> {
  const origin = originOf(lit);
  if (sql(`select count(*) from "CoachingProgram" where "clientId" = '${p.ids.client}'`, lit) !== '0') return 'coached pair: already there';
  const call = async (who: Person, method: string, path: string, body?: unknown) => {
    const r = await fetch(origin + path, { method, headers: { 'content-type': 'application/json', cookie: p.cookies[who] }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => null) as Record<string, unknown> | null };
  };
  const inv = await call('coach', 'POST', '/api/coach/invite', { use: 'once' });
  const token = (inv.json?.invite as { token?: string } | undefined)?.token;
  if (!token) return `coached pair: the invite answered ${inv.status}`;
  const join = await call('client', 'POST', `/api/coach/invite/${encodeURIComponent(token)}`);
  if (join.status >= 400) return `coached pair: joining answered ${join.status}`;
  const prog = await call('coach', 'POST', '/api/coach/programs', { name: 'Rig block 1', clientId: p.ids.client, durationWeeks: 4, sessionsPerWeek: 3 });
  if (prog.status >= 400) return `coached pair: the program answered ${prog.status} ${JSON.stringify(prog.json).slice(0, 120)}`;
  const programId = sql(`select id from "CoachingProgram" where "clientId" = '${p.ids.client}' limit 1`, lit);
  const sessions = sql(`select s.id from "Session" s join "Block" b on b.id = s."blockId" where b."programId" = '${programId}' and b."order" = 1 order by s."order"`, lit).split('\n').filter(Boolean);
  const made: string[] = [];
  for (const [name, sets, reps] of [['Rig goblet squat', 3, '8'], ['Rig push-up', 3, '10'], ['Rig split squat', 2, '8']] as [string, number, string][]) {
    const ex = await call('coach', 'POST', '/api/coach/programs/exercises', { name });
    const exerciseId = ex.json?.id as string | undefined;
    if (!exerciseId) { made.push(`${name}: ${ex.status}`); continue; }
    for (const sessionId of sessions) { const add = await call('coach', 'POST', `/api/coach/programs/${programId}/exercises`, { action: 'add', sessionId, exerciseId, sets, reps }); if (add.status >= 400) made.push(`add ${name}: ${add.status} ${JSON.stringify(add.json).slice(0, 80)}`); }
  }
  return `coached pair: program ${programId}, ${sessions.length} sessions in week 1${made.length ? `; problems: ${made.join('; ')}` : ''}`;
}

/** a Playwright storage state for one person */
export function storageState(p: People, who: Person) {
  const c = p.cookies[who];
  if (!c) return { cookies: [], origins: [] };
  const [name, ...v] = c.split('=');
  return { cookies: [{ name, value: v.join('='), domain: '127.0.0.1', path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' as const }], origins: [] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  if (cmd === 'db-up') { dbUp(); console.log(`database up: ${DB_URL}`); }
  else if (cmd === 'db-down') { dbDown(); console.log('database stopped'); }
  else if (cmd === 'db-reset') { dbReset(); console.log('database reset to prisma db push'); }
  else if (cmd === 'build') { dbUp(); const r = spawnSync(process.execPath, [join(ROOT, 'node_modules/next/dist/bin/next'), 'build'], { cwd: ROOT, env: rigEnv(), stdio: 'inherit' }); process.exit(r.status ?? 1); }
  else if (cmd === 'serve') { dbUp(); await serve(); console.log(`serving ${ORIGIN} (Ctrl-C stops it)`); await new Promise(() => {}); }
  else if (cmd === 'people') { dbUp(); const stop = await serve(); const p = await people(process.argv.includes('--fresh')); console.log(Object.keys(p.ids).join(', ')); stop(); }
  else { console.error('usage: rig.mts db-up | db-down | db-reset | build | serve | people'); process.exit(2); }
}
