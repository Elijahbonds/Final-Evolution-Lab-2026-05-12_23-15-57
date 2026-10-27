// /api/push's rules (lib/push/settings.ts) and the subscription check (lib/push/subscription.ts): opt-in, adults only,
// opt-out open to everyone, nothing free-form stored, and no request can point the server at an address of its choosing.
import { createECDH } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { b64u, newVapidKeyPair } from '@/lib/push/crypto';
import { pushConfig } from '@/lib/push/config';
import { MAX_PAYLOAD_BYTES } from '@/lib/push/crypto';
import { messageFor, emailFor, type MessageContext } from '@/lib/push/copy';
import { pushSettingsGet, pushSettingsRemove, pushSettingsSave } from '@/lib/push/settings';
import { parseSubscription, pushEndpointOk } from '@/lib/push/subscription';
import { resetPushProbe } from '@/lib/push/store';
import { fakePushDb } from '../helpers/fakePushDb';

const pair = newVapidKeyPair();
const ON = pushConfig({ PUSH_ENABLED: 'true', VAPID_PUBLIC_KEY: pair.publicKey, VAPID_PRIVATE_KEY: pair.privateKey, VAPID_SUBJECT: 'mailto:ops@fel.example' } as NodeJS.ProcessEnv);
const NOW = Date.UTC(2026, 9, 26, 12);
const Y = new Date(NOW).getFullYear();
const env = { config: ON, emailOn: true, now: NOW };

function sub(endpoint = 'https://fcm.googleapis.com/fcm/send/abc:123') {
  const e = createECDH('prime256v1'); e.generateKeys();
  return { endpoint, expirationTime: null, keys: { p256dh: b64u.encode(e.getPublicKey()), auth: b64u.encode(Buffer.from('0123456789abcdef')) } };
}
function db(tables = true) {
  resetPushProbe();
  return fakePushDb({ tables, now: NOW, users: [{ id: 'adult', dobYear: Y - 30 }, { id: 'teen', dobYear: Y - 16 }, { id: 'coach', dobYear: Y - 40, coach: true }] });
}

describe('opting in', () => {
  it('a teen is refused, and NOTHING is written — not a choice, not a browser', async () => {
    const d = db();
    const r = await pushSettingsSave(d, 'teen', { kinds: ['today', 'coach_message'], email: true, subscription: sub() }, env);
    expect(r).toEqual({ status: 403, body: { error: 'adults_only' } });
    expect(d.prefs.size).toBe(0);
    expect(d.devices).toEqual([]);
    expect(d.statements.filter((s) => s !== 'probe')).toEqual([]);
  });

  it('an adult saves kinds, email and this browser', async () => {
    const d = db();
    const r = await pushSettingsSave(d, 'adult', { kinds: ['today', 'plan_update'], email: true, subscription: sub() }, env);
    expect(r).toEqual({ status: 200, body: { ok: true, prefs: { kinds: ['today', 'plan_update'], email: true }, devices: 1 } });
    expect(d.devices[0]).toMatchObject({ userId: 'adult', endpoint: 'https://fcm.googleapis.com/fcm/send/abc:123' });
  });

  it.each([
    [{ kinds: ['marketing'] }, 'bad_kinds'], [{ kinds: ['today', 'promo'] }, 'bad_kinds'], [{ kinds: 'today' }, 'bad_kinds'],
    [{ kinds: [], note: 'hi' }, 'unexpected_field'], [{ kinds: [], email: 'yes' }, 'bad_email'], [[], 'bad_body'],
  ])('%j is refused (%s)', async (body, error) => {
    const d = db();
    expect(await pushSettingsSave(d, 'adult', body, env)).toEqual({ status: 400, body: { error } });
    expect(d.prefs.size).toBe(0);
  });

  it('a browser needs push on and a real push service subscription', async () => {
    const d = db();
    expect(await pushSettingsSave(d, 'adult', { kinds: ['today'], subscription: sub() }, { ...env, config: { on: false, reason: 'keys_missing' } })).toEqual({ status: 503, body: { error: 'push_off' } });
    expect(await pushSettingsSave(d, 'adult', { kinds: ['today'], subscription: sub('https://evil.example/x') }, env)).toEqual({ status: 400, body: { error: 'bad_subscription' } });
    expect(d.devices).toEqual([]);
  });

  it('before the tables exist: 503 not_ready, nothing written', async () => {
    const d = db(false);
    expect(await pushSettingsSave(d, 'adult', { kinds: ['today'] }, env)).toEqual({ status: 503, body: { error: 'not_ready' } });
  });

  it('one browser is one row: signed into another account on the same phone, it moves', async () => {
    const d = db();
    const s = sub();
    await pushSettingsSave(d, 'adult', { kinds: ['today'], subscription: s }, env);
    await pushSettingsSave(d, 'coach', { kinds: ['coach_alerts'], subscription: s }, env);
    expect(d.devices.map((x) => x.userId)).toEqual(['coach']);
  });

  it('at most ten browsers per account; the oldest goes', async () => {
    const d = db();
    for (let i = 0; i < 12; i++) await pushSettingsSave(d, 'adult', { kinds: ['today'], subscription: sub(`https://fcm.googleapis.com/fcm/send/n${i}`) }, env);
    expect(d.devices).toHaveLength(10);
    expect(d.devices.map((x) => x.endpoint)).not.toContain('https://fcm.googleapis.com/fcm/send/n0');
  });
});

describe('what the settings block is told', () => {
  it('a teen: adult false, no choices shown; a coach: coach true', async () => {
    const d = db();
    expect(await pushSettingsGet(d, 'teen', env)).toMatchObject({ available: true, adult: false, prefs: { kinds: [], email: false }, devices: 0 });
    expect(await pushSettingsGet(d, 'coach', env)).toMatchObject({ adult: true, coach: true, publicKey: pair.publicKey, email: { available: true } });
    expect(await pushSettingsGet(d, 'adult', { ...env, config: { on: false, reason: 'flag_off' } })).toMatchObject({ available: false, publicKey: null });
  });
});

describe('opting out is open to every account', () => {
  it('one browser, or everything (the choices row goes too)', async () => {
    const d = db();
    await pushSettingsSave(d, 'adult', { kinds: ['today'], email: true, subscription: sub('https://fcm.googleapis.com/fcm/send/a') }, env);
    await pushSettingsSave(d, 'adult', { kinds: ['today'], email: true, subscription: sub('https://fcm.googleapis.com/fcm/send/b') }, env);
    expect(await pushSettingsRemove(d, 'adult', { endpoint: 'https://fcm.googleapis.com/fcm/send/a' }, env)).toEqual({ status: 200, body: { ok: true, removed: 1 } });
    expect(await pushSettingsRemove(d, 'adult', {}, env)).toEqual({ status: 200, body: { ok: true, removed: 1, prefs: { kinds: [], email: false } } });
    expect(d.prefs.size).toBe(0);
    expect(d.devices).toEqual([]);
  });

  it('a teen\'s opt-out writes nothing either', async () => {
    const d = db();
    await pushSettingsRemove(d, 'teen', {}, env);
    expect(d.prefs.size).toBe(0);
  });

  it('refuses another field or a non-push endpoint', async () => {
    const d = db();
    expect(await pushSettingsRemove(d, 'adult', { userId: 'someone' }, env)).toEqual({ status: 400, body: { error: 'unexpected_field' } });
    expect(await pushSettingsRemove(d, 'adult', { endpoint: 'http://localhost/x' }, env)).toEqual({ status: 400, body: { error: 'bad_endpoint' } });
  });
});

describe('the push endpoint allowlist (the server POSTs there)', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/gAAA',
    'https://web.push.apple.com/QGm3', 'https://wns2-par02p.notify.windows.com/w/?token=BQYA',
  ])('%s is a push service', (u) => expect(pushEndpointOk(u)).toBe(true));
  it.each([
    'http://fcm.googleapis.com/fcm/send/abc', 'https://fcm.googleapis.com:8443/x', 'https://fcm.googleapis.com.evil.example/x',
    'https://evil.example/fcm.googleapis.com', 'https://localhost/x', 'https://127.0.0.1/x', 'https://169.254.169.254/latest',
    'https://user:pw@fcm.googleapis.com/x', 'https://notify.windows.com.evil.example/x', 'not a url', 42, null, `https://fcm.googleapis.com/${'a'.repeat(1100)}`,
  ])('%s is refused', (u) => expect(pushEndpointOk(u)).toBe(false));

  it('keys must be a P-256 point and a 16-byte secret', () => {
    const good = sub();
    expect(parseSubscription(good)).toMatchObject({ endpoint: good.endpoint });
    expect(parseSubscription({ ...good, keys: { ...good.keys, auth: b64u.encode(Buffer.alloc(8)) } })).toBeNull();
    expect(parseSubscription({ ...good, keys: { ...good.keys, p256dh: b64u.encode(Buffer.alloc(65, 4)) } })).toBeNull();
    expect(parseSubscription({ endpoint: good.endpoint })).toBeNull();
  });
});

describe('the copy', () => {
  const all: MessageContext[] = [
    { kind: 'coach_message', toCoach: true }, { kind: 'coach_message', toCoach: false }, { kind: 'plan_update' },
    { kind: 'today', program: true }, { kind: 'today', program: false, streakDays: 0 }, { kind: 'today', program: false, streakDays: 12 },
    { kind: 'coach_alerts', athletes: 1 }, { kind: 'coach_alerts', athletes: 3 },
  ];
  it('every message is short, opens a page of ours, and fits one encrypted record', () => {
    for (const c of all) {
      const m = messageFor(c);
      expect(m.title.length).toBeLessThanOrEqual(80);
      expect(m.body.length).toBeLessThanOrEqual(200);
      expect(m.url).toMatch(/^\/[a-z]/);
      expect(Buffer.byteLength(JSON.stringify(m))).toBeLessThan(MAX_PAYLOAD_BYTES);
      expect(`${m.title} ${m.body}`).not.toMatch(/sale|offer|buy|discount|%|free|store|upgrade|pro\b/i);
    }
    expect(messageFor({ kind: 'coach_alerts', athletes: 1 }).title).toBe('1 athlete missed planned sessions');
    expect(messageFor({ kind: 'coach_alerts', athletes: 3 }).title).toBe('3 athletes missed planned sessions');
  });
  it('a reminder email says why it came and where to stop it', () => {
    const e = emailFor(messageFor({ kind: 'today', program: true }), 'https://fel.example');
    expect(e.subject).toBe("FEL: Today's session is ready");
    expect(e.text).toContain('https://fel.example/coach');
    expect(e.text).toMatch(/account settings/);
  });
});
