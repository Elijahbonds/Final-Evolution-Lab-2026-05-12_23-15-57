// Sending a notification, end to end against stand-ins (offline-push, round 8, OFF-03): the store (tests/helpers/
// fakePushDb.ts), a push service that decrypts what it is sent with the browser's own keys, and a mailbox.
// The brief's definition of done: "a push encrypts and decrypts against the RFC 8291 vectors [tests/push/crypto.test.ts],
// and the sender refuses a teen and an account that did not opt in" — here.
import { createECDH } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { b64u, newVapidKeyPair } from '@/lib/push/crypto';
import { pushConfig, type PushConfig } from '@/lib/push/config';
import { DAILY_CAP, KIND_SPACING_MS, PUSH_KINDS, sendRefusal } from '@/lib/push/policy';
import { notify, type NotifyDeps } from '@/lib/push/send';
import { resetPushProbe } from '@/lib/push/store';
import { notifyCoachMessage, notifyPlanUpdate, notifyBounded } from '@/lib/push/server';
import { fakePushDb, type FakePushDb } from '../helpers/fakePushDb';
import { decryptPush } from '../helpers/pushDecrypt';

const pair = newVapidKeyPair();
const ON = pushConfig({ PUSH_ENABLED: 'true', VAPID_PUBLIC_KEY: pair.publicKey, VAPID_PRIVATE_KEY: pair.privateKey, VAPID_SUBJECT: 'mailto:ops@fel.example' } as NodeJS.ProcessEnv);
const THIS_YEAR = new Date(Date.UTC(2026, 9, 26, 12)).getFullYear();
const ADULT = THIS_YEAR - 30, TEEN = THIS_YEAR - 15, JUST18 = THIS_YEAR - 18;

function browser() {
  const e = createECDH('prime256v1');
  e.generateKeys();
  const auth = Buffer.from('authsecret-16byt');
  return { publicKey: e.getPublicKey(), privateKey: e.getPrivateKey(), auth };
}

interface Delivered { endpoint: string; headers: Record<string, string>; message: Record<string, unknown> }

function rig(o: { config?: PushConfig; emailOn?: boolean; status?: number } = {}) {
  resetPushProbe();
  const db = fakePushDb({ users: [
    { id: 'adult', dobYear: ADULT, email: 'adult@fel.test' }, { id: 'teen', dobYear: TEEN, email: 'teen@fel.test' },
    { id: 'just18', dobYear: JUST18 }, { id: 'unknown', dobYear: null }, { id: 'coach', dobYear: ADULT, coach: true },
  ] });
  const keys = new Map<string, ReturnType<typeof browser>>();
  const delivered: Delivered[] = [];
  const mails: { to: string; subject: string; text: string }[] = [];
  let status = o.status ?? 201;
  const deps: NotifyDeps = {
    db, config: o.config ?? ON, emailOn: o.emailOn ?? false,
    fetch: async (url, init) => {
      const k = keys.get(url)!;
      const plain = await decryptPush(new Uint8Array(init.body as Uint8Array), k, k.auth);
      delivered.push({ endpoint: url, headers: init.headers as Record<string, string>, message: JSON.parse(Buffer.from(plain).toString('utf8')) });
      return new Response(null, { status });
    },
    dobYear: async (id) => db.users.find((u) => u.id === id)?.dobYear ?? null,
    emailOf: async (id) => db.users.find((u) => u.id === id)?.email ?? null,
    sendMail: async (to, m) => { mails.push({ to, ...m }); return 'sent'; },
    origin: 'https://fel.example',
    now: db.now,
  };
  const subscribe = (userId: string, endpoint = `https://fcm.googleapis.com/fcm/send/${userId}-${keys.size}`) => {
    const b = browser();
    keys.set(endpoint, b);
    db.devices.push({ id: `d-${keys.size}`, userId, endpoint, p256dh: b64u.encode(b.publicKey), auth: b64u.encode(b.auth), createdAt: db.now - keys.size, failures: 0, lastSuccessAt: null });
    return endpoint;
  };
  const optIn = (userId: string, kinds: string[], email = false) => db.prefs.set(userId, { kinds, email, updatedAt: db.now });
  return { db, deps, delivered, mails, subscribe, optIn, setStatus: (s: number) => { status = s; } };
}

describe('the sender refuses a teen and an account that did not opt in', () => {
  it('a teen who opted in (a row written by hand, or before a birth year was corrected) gets nothing', async () => {
    const r = rig();
    r.optIn('teen', [...PUSH_KINDS], true);
    r.subscribe('teen');
    for (const ctx of [{ kind: 'coach_message', toCoach: false }, { kind: 'plan_update' }, { kind: 'today', program: true }] as const) {
      expect(await notify('teen', ctx, r.deps)).toEqual({ status: 'refused', reason: 'not_adult' });
    }
    expect(r.delivered).toEqual([]);
    expect(r.db.log).toEqual([]);
  });

  it('an unknown age, and the year someone turns 18 (strict rule), are not adults', async () => {
    const r = rig();
    for (const id of ['unknown', 'just18']) { r.optIn(id, ['plan_update']); r.subscribe(id); }
    expect(await notify('unknown', { kind: 'plan_update' }, r.deps)).toEqual({ status: 'refused', reason: 'not_adult' });
    expect(await notify('just18', { kind: 'plan_update' }, r.deps)).toEqual({ status: 'refused', reason: 'not_adult' });
    expect(r.delivered).toEqual([]);
  });

  it('an adult who did not opt in to this kind gets nothing; one who opted in to another kind neither', async () => {
    const r = rig();
    r.subscribe('adult');
    expect(await notify('adult', { kind: 'plan_update' }, r.deps)).toEqual({ status: 'refused', reason: 'not_opted_in' });
    r.optIn('adult', ['today']);
    expect(await notify('adult', { kind: 'plan_update' }, r.deps)).toEqual({ status: 'refused', reason: 'not_opted_in' });
    expect(r.delivered).toEqual([]);
  });
});

describe('an opted-in adult', () => {
  it('gets the fixed message, encrypted to each browser, with a VAPID header, a TTL and a topic', async () => {
    const r = rig();
    r.optIn('adult', ['coach_message']);
    const a = r.subscribe('adult'), b = r.subscribe('adult', 'https://updates.push.services.mozilla.com/wpush/v2/xyz');
    expect(await notify('adult', { kind: 'coach_message', toCoach: false }, r.deps)).toEqual({ status: 'sent', push: 2, email: false });
    expect(r.delivered.map((d) => d.endpoint).sort()).toEqual([a, b].sort());
    for (const d of r.delivered) {
      expect(d.message).toEqual({ title: 'Your coach sent a message', body: 'Open FEL to read it.', url: '/coach', tag: 'coach_message' });
      expect(d.headers.Authorization).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${pair.publicKey}$`));
      expect(d.headers['Content-Encoding']).toBe('aes128gcm');
      expect(d.headers.TTL).toBe('86400');
      expect(d.headers.Topic).toBe('coach_message');
    }
    expect(r.db.log.map((l) => [l.userId, l.kind, l.channel])).toEqual([['adult', 'coach_message', 'push']]);
  });

  it('is capped: the kind\'s spacing, then the daily ceiling', async () => {
    const r = rig();
    r.optIn('adult', [...PUSH_KINDS]);
    r.subscribe('adult');
    expect((await notify('adult', { kind: 'coach_message', toCoach: false }, r.deps)).status).toBe('sent');
    expect(await notify('adult', { kind: 'coach_message', toCoach: false }, r.deps)).toEqual({ status: 'refused', reason: 'too_soon' });
    r.db.now += KIND_SPACING_MS.coach_message;
    expect((await notify('adult', { kind: 'coach_message', toCoach: false }, { ...r.deps, now: r.db.now })).status).toBe('sent');
    for (let i = r.db.log.length; i < DAILY_CAP; i++) r.db.log.push({ id: `x${i}`, userId: 'adult', kind: 'plan_update', channel: 'push', sentAt: r.db.now - 3 * 3600_000 });
    expect(await notify('adult', { kind: 'today', program: true }, { ...r.deps, now: r.db.now })).toEqual({ status: 'refused', reason: 'daily_cap' });
  });

  it('a count that cannot be read refuses (fail closed)', async () => {
    const r = rig();
    r.optIn('adult', ['plan_update']);
    r.subscribe('adult');
    r.db.failNext = { name: 'sendCounts', error: Object.assign(new Error('connection reset'), { code: 'P1017' }) };
    expect(await notify('adult', { kind: 'plan_update' }, r.deps)).toEqual({ status: 'refused', reason: 'count_unreadable' });
    r.db.failNext = { name: 'readPrefs', error: Object.assign(new Error('connection reset'), { code: 'P1017' }) };
    expect(await notify('adult', { kind: 'plan_update' }, r.deps)).toEqual({ status: 'refused', reason: 'count_unreadable' });
    expect(r.delivered).toEqual([]);
  });

  it('a browser the push service calls gone is deleted; five failures in a row delete one too', async () => {
    const r = rig({ status: 410 });
    r.optIn('adult', ['coach_message']);
    r.subscribe('adult');
    expect(await notify('adult', { kind: 'coach_message', toCoach: false }, r.deps)).toEqual({ status: 'undelivered' });
    expect(r.db.devices).toEqual([]);
    r.setStatus(500);
    r.subscribe('adult');
    for (let i = 0; i < 5; i++) await notify('adult', { kind: 'coach_message', toCoach: false }, { ...r.deps, now: r.db.now + i * KIND_SPACING_MS.coach_message });
    expect(r.db.devices).toEqual([]);
    expect(r.db.log).toEqual([]);   // nothing delivered, nothing counted
  });

  it('a stored endpoint whose host is not a push service is never POSTed to, and is dropped', async () => {
    const r = rig();
    r.optIn('adult', ['plan_update']);
    r.db.devices.push({ id: 'evil', userId: 'adult', endpoint: 'https://169.254.169.254/latest/meta-data', p256dh: 'x', auth: 'y', createdAt: 0, failures: 0, lastSuccessAt: null });
    expect(await notify('adult', { kind: 'plan_update' }, r.deps)).toEqual({ status: 'undelivered' });
    expect(r.delivered).toEqual([]);
    expect(r.db.devices).toEqual([]);
  });
});

describe('reminders by email', () => {
  it('a reminder that reached no browser goes by email, when the account turned email reminders on and email is on', async () => {
    const r = rig({ emailOn: true });
    r.optIn('adult', ['today'], true);
    expect(await notify('adult', { kind: 'today', program: false, streakDays: 4 }, r.deps)).toEqual({ status: 'sent', push: 0, email: true });
    expect(r.mails).toEqual([{ to: 'adult@fel.test', subject: "FEL: Today's drill is ready", text: expect.stringContaining('Keep your 4-day streak going.\n\nhttps://fel.example/train/today-drill') }]);
    expect(r.db.log.map((l) => l.channel)).toEqual(['email']);
  });

  it('works with push off (reminders only), never for a coach message, never for a teen, never without the email opt-in', async () => {
    const r = rig({ emailOn: true, config: { on: false, reason: 'flag_off' } });
    r.optIn('adult', ['today', 'coach_message'], true);
    r.optIn('teen', ['today'], true);
    r.optIn('coach', ['coach_alerts'], false);
    expect(await notify('adult', { kind: 'coach_message', toCoach: false }, r.deps)).toEqual({ status: 'off' });
    expect(await notify('teen', { kind: 'today', program: true }, r.deps)).toEqual({ status: 'refused', reason: 'not_adult' });
    expect(await notify('coach', { kind: 'coach_alerts', athletes: 2 }, r.deps)).toEqual({ status: 'undelivered' });
    expect((await notify('adult', { kind: 'today', program: true }, r.deps)).status).toBe('sent');
    expect(r.mails.map((m) => m.to)).toEqual(['adult@fel.test']);
  });
});

describe('off, and before the tables exist: nothing happens', () => {
  it.each([
    [{ on: false, reason: 'flag_off' }], [{ on: false, reason: 'keys_missing' }],
  ] as const)('push %j: a coach message is off and touches nothing', async (config) => {
    const r = rig({ config });
    r.optIn('adult', ['coach_message']);
    r.subscribe('adult');
    expect(await notify('adult', { kind: 'coach_message', toCoach: false }, r.deps)).toEqual({ status: 'off' });
    expect(r.db.statements).toEqual([]);
  });

  it('tables not applied: not_ready, no statement but the probe', async () => {
    const r = rig();
    r.db.tables = false;
    expect(await notify('adult', { kind: 'plan_update' }, r.deps)).toEqual({ status: 'not_ready' });
    expect(r.db.statements).toEqual(['probe']);
  });
});

describe('the config switch (OWN-19)', () => {
  it('stays off without the flag, the keys, a matching pair, or a contact', () => {
    const other = newVapidKeyPair();
    const env = (e: Record<string, string>) => pushConfig(e as NodeJS.ProcessEnv);
    expect(env({})).toEqual({ on: false, reason: 'flag_off' });
    expect(env({ PUSH_ENABLED: '1', VAPID_PUBLIC_KEY: pair.publicKey, VAPID_PRIVATE_KEY: pair.privateKey, VAPID_SUBJECT: 'mailto:a@b.c' })).toEqual({ on: false, reason: 'flag_off' });
    expect(env({ PUSH_ENABLED: 'true' })).toEqual({ on: false, reason: 'keys_missing' });
    expect(env({ PUSH_ENABLED: 'true', VAPID_PUBLIC_KEY: other.publicKey, VAPID_PRIVATE_KEY: pair.privateKey, VAPID_SUBJECT: 'mailto:a@b.c' })).toEqual({ on: false, reason: 'keys_invalid' });
    expect(env({ PUSH_ENABLED: 'true', VAPID_PUBLIC_KEY: pair.publicKey, VAPID_PRIVATE_KEY: pair.privateKey })).toEqual({ on: false, reason: 'subject_missing' });
    expect(env({ PUSH_ENABLED: 'true', VAPID_PUBLIC_KEY: pair.publicKey, VAPID_PRIVATE_KEY: pair.privateKey, VAPID_SUBJECT: 'https://fel.example/contact' }).on).toBe(true);
  });
});

describe('the coach-route hooks', () => {
  let r: ReturnType<typeof rig>;
  beforeEach(() => { r = rig(); for (const id of ['adult', 'coach']) { r.optIn(id, ['coach_message', 'plan_update']); r.subscribe(id); } });

  it('a coach\'s message tells the athlete, an athlete\'s tells the coach, and neither carries the words', async () => {
    await notifyCoachMessage({ coachId: 'coach', clientId: 'adult' }, 'coach', r.deps);
    await notifyCoachMessage({ coachId: 'coach', clientId: 'adult' }, 'adult', r.deps);
    expect(r.delivered.map((d) => [d.endpoint.includes('adult') ? 'adult' : 'coach', d.message.title])).toEqual([
      ['adult', 'Your coach sent a message'], ['coach', 'An athlete sent you a message'],
    ]);
  });

  it('a plan update reaches the draft\'s athlete only when something was written', async () => {
    r.db.drafts.push({ id: 'draft1', clientId: 'adult' });
    await notifyPlanUpdate('draft1', 0, r.deps);
    expect(r.delivered).toEqual([]);
    await notifyPlanUpdate('draft1', 2, r.deps);
    expect(r.delivered.map((d) => d.message.title)).toEqual(['Your coach updated your plan']);
    await notifyPlanUpdate('no-such-draft', 2, r.deps);
    expect(r.delivered).toHaveLength(1);
  });

  it('never waits past its bound and never throws', async () => {
    const slow: NotifyDeps = { ...r.deps, dobYear: () => new Promise(() => {}) };
    expect(await notifyBounded('adult', { kind: 'plan_update' }, slow, 20)).toBe('timeout');
    const broken: NotifyDeps = { ...r.deps, db: { ...r.db, $queryRawUnsafe: () => { throw new Error('boom'); } } as never };
    resetPushProbe();
    expect(await notifyBounded('adult', { kind: 'plan_update' }, broken, 200)).toEqual({ status: 'not_ready' });
  });
});

describe('policy', () => {
  it('there is no marketing kind, and nothing but these four can be stored or sent', () => {
    expect([...PUSH_KINDS]).toEqual(['coach_message', 'plan_update', 'today', 'coach_alerts']);
    for (const k of PUSH_KINDS) expect(k).not.toMatch(/market|promo|offer|sale|store|deal|news/i);
  });
  it('sendRefusal checks age before anything else', () => {
    const now = Date.UTC(2026, 9, 26, 12);
    expect(sendRefusal('today', { dobYear: TEEN, prefs: { kinds: ['today'], email: false }, sentLast24h: null, lastOfKindAt: undefined }, now)).toBe('not_adult');
    expect(sendRefusal('today', { dobYear: ADULT, prefs: { kinds: [], email: false }, sentLast24h: 0, lastOfKindAt: null }, now)).toBe('not_opted_in');
    expect(sendRefusal('today', { dobYear: ADULT, prefs: { kinds: ['today'], email: false }, sentLast24h: 0, lastOfKindAt: null }, now)).toBeNull();
  });
});
