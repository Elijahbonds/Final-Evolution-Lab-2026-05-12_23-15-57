// The notification settings behind /api/push (offline-push, round 8, OFF-03). Server only; the database is injected.
//
// OPT-IN, ADULTS ONLY. Saving any choice — a kind, email reminders, a browser — needs a VERIFIED ADULT (User.dobYear
// read from the database, lib/privacy/verifiedAdult.ts). A 13–17 account (or an unknown age) gets 403 adults_only and
// NOTHING is written; the settings block tells them notifications are for adults for now. Turning things OFF is open to
// every signed-in account (nobody is ever kept subscribed). Unknown body fields are refused, so nothing free-form is
// stored. Before the pending SQL is applied: available false, saves answer 503 not_ready.
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';
import { mailReady } from '@/lib/mail';
import { pushConfig, type PushConfig } from './config';
import { cleanKinds, NO_PREFS, PUSH_KINDS, type Prefs } from './policy';
import { addDevice, clearPrefs, countDevices, pushTablesReady, readPrefs, removeDevices, writePrefs, type RawDb } from './store';
import { parseSubscription, pushEndpointOk } from './subscription';

/** (new) Settings changes one account may make an hour. */
export const PUSH_SETTINGS_PER_HOUR = 30;

export type PushSettingsDb = RawDb & {
  user: { findUnique(a: unknown): Promise<{ dobYear?: number | null } | null> };
  coachingProgram: { count(a: unknown): Promise<number> };
};

export interface SettingsEnv { config?: PushConfig; emailOn?: boolean; now?: number }

async function dobYearOf(db: PushSettingsDb, userId: string): Promise<number | null> {
  try { return (await db.user.findUnique({ where: { id: userId }, select: { dobYear: true } }))?.dobYear ?? null; } catch { return null; }
}

export async function pushSettingsGet(db: PushSettingsDb, userId: string, env: SettingsEnv = {}) {
  const config = env.config ?? pushConfig();
  const now = env.now ?? Date.now();
  const [ready, dobYear, coach] = await Promise.all([
    pushTablesReady(db, now), dobYearOf(db, userId),
    db.coachingProgram.count({ where: { coachId: userId } }).then((n) => n > 0).catch(() => false),
  ]);
  const adult = verifiedAdult(dobYear, new Date(now));
  const prefs: Prefs = ready && adult ? (await readPrefs(db, userId)) ?? NO_PREFS : NO_PREFS;
  return {
    available: config.on && ready,
    publicKey: config.on ? config.publicKey : null,
    adult,
    coach,
    email: { available: ready && (env.emailOn ?? mailReady()) },
    kinds: PUSH_KINDS,
    prefs,
    devices: ready && adult ? await countDevices(db, userId) : 0,
  };
}

const ALLOWED = new Set(['kinds', 'email', 'subscription']);

export async function pushSettingsSave(db: PushSettingsDb, userId: string, body: unknown, env: SettingsEnv = {}): Promise<{ status: number; body: unknown }> {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { status: 400, body: { error: 'bad_body' } };
  if (Object.keys(b).some((k) => !ALLOWED.has(k))) return { status: 400, body: { error: 'unexpected_field' } };
  if (!Array.isArray(b.kinds) || b.kinds.some((k) => !(PUSH_KINDS as readonly unknown[]).includes(k))) return { status: 400, body: { error: 'bad_kinds' } };
  if (b.email !== undefined && typeof b.email !== 'boolean') return { status: 400, body: { error: 'bad_email' } };
  const now = env.now ?? Date.now();
  // the age first: a teen's request writes nothing, whatever else it carries
  if (!verifiedAdult(await dobYearOf(db, userId), new Date(now))) return { status: 403, body: { error: 'adults_only' } };
  if (!(await pushTablesReady(db, now))) return { status: 503, body: { error: 'not_ready' } };
  let sub = null;
  if (b.subscription !== undefined) {
    const config = env.config ?? pushConfig();
    if (!config.on) return { status: 503, body: { error: 'push_off' } };
    sub = parseSubscription(b.subscription);
    if (!sub) return { status: 400, body: { error: 'bad_subscription' } };
  }
  const prefs: Prefs = { kinds: cleanKinds(b.kinds), email: b.email === true };
  if (!(await writePrefs(db, userId, prefs))) return { status: 500, body: { error: 'failed' } };
  if (sub && !(await addDevice(db, userId, sub))) return { status: 500, body: { error: 'failed' } };
  return { status: 200, body: { ok: true, prefs, devices: await countDevices(db, userId) } };
}

export async function pushSettingsRemove(db: PushSettingsDb, userId: string, body: unknown, env: SettingsEnv = {}): Promise<{ status: number; body: unknown }> {
  const b = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  if (Object.keys(b).some((k) => k !== 'endpoint')) return { status: 400, body: { error: 'unexpected_field' } };
  if (b.endpoint !== undefined && !pushEndpointOk(b.endpoint)) return { status: 400, body: { error: 'bad_endpoint' } };
  if (!(await pushTablesReady(db, env.now ?? Date.now()))) return { status: 200, body: { ok: true, removed: 0 } };   // nothing was ever stored
  if (typeof b.endpoint === 'string') return { status: 200, body: { ok: true, removed: await removeDevices(db, userId, b.endpoint) } };
  const removed = await removeDevices(db, userId, null);
  await clearPrefs(db, userId);
  return { status: 200, body: { ok: true, removed, prefs: NO_PREFS } };
}
