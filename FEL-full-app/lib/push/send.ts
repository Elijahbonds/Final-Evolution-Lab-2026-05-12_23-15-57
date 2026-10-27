// Sending one notification (offline-push, round 8, OFF-03 / OFF-04). Server only; every outside effect is injected, so
// tests/push/send.test.ts runs it whole against a stand-in store, push service and mailbox.
//
// notify(userId, ctx) — in this order, and the first "no" ends it:
//   1. push is on (lib/push/config.ts: PUSH_ENABLED + a valid VAPID pair), or — for a reminder — email is on;
//   2. the tables are applied (the pending seam);
//   3. sendRefusal (lib/push/policy.ts): a VERIFIED ADULT read from the database now, who OPTED IN to this kind, under
//      the daily cap and the kind's spacing (a count that cannot be read refuses);
//   4. the fixed message for the kind (lib/push/copy.ts), encrypted to each of the account's browsers (RFC 8291) with a
//      VAPID header (RFC 8292), POSTed to a push service host on the allowlist (checked again here);
//   5. a reminder that reached no browser goes by email instead, when the account turned email reminders on;
//   6. one PushSendLog row per channel that delivered (what the limits count).
// A browser the push service calls gone (404/410) is deleted; MAX_FAILURES in a row deletes it too.
import { b64u, encryptPayload, vapidAuthorization } from './crypto';
import type { PushConfig } from './config';
import { emailFor, messageFor, type MessageContext, type PushMessage } from './copy';
import { REMINDER_KINDS, sendRefusal, type Refusal } from './policy';
import { pushEndpointOk } from './subscription';
import {
  deviceFailed, deviceWorked, listDevices, logSend, pushTablesReady, readPrefs, sendCounts, type RawDb, type StoredDevice,
} from './store';

/** How long a push service may hold a message for an offline phone, per kind (seconds). */
export const TTL_SEC: Record<PushMessage['kind'], number> = {
  coach_message: 24 * 3600, plan_update: 24 * 3600, today: 6 * 3600, coach_alerts: 12 * 3600,
};
/** One push service request may take this long. */
export const SEND_TIMEOUT_MS = 5000;

export interface NotifyDeps {
  db: RawDb;
  config: PushConfig;
  /** EMAIL_ENABLED and a configured mailbox (lib/mail). */
  emailOn: boolean;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** User.dobYear from the database, or null (unknown is never an adult). */
  dobYear: (userId: string) => Promise<number | null>;
  /** The account's own address, or null. */
  emailOf: (userId: string) => Promise<string | null>;
  sendMail: (to: string, m: { subject: string; text: string }) => Promise<'sent' | 'off' | 'failed'>;
  /** Where email links point (lib/mail mailLinkOrigin), or null. */
  origin: string | null;
  now?: number;
}

export type NotifyResult =
  | { status: 'sent'; push: number; email: boolean }
  | { status: 'off' }
  | { status: 'not_ready' }
  | { status: 'refused'; reason: Refusal }
  | { status: 'undelivered' };

export type DeviceOutcome = 'ok' | 'gone' | 'failed';

/** One encrypted message to one browser. Never throws. */
export async function sendToDevice(d: Pick<StoredDevice, 'endpoint' | 'p256dh' | 'auth'>, m: PushMessage, config: Extract<PushConfig, { on: true }>,
  fetchImpl: NotifyDeps['fetch'], nowSec: number): Promise<DeviceOutcome> {
  if (!pushEndpointOk(d.endpoint)) return 'gone';   // stored before a host left the list: never POSTed to
  const ua = b64u.decode(d.p256dh), auth = b64u.decode(d.auth);
  if (!ua || !auth) return 'gone';
  let body: Buffer;
  try {
    body = encryptPayload({ uaPublic: ua, authSecret: auth, plaintext: Buffer.from(JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: m.tag }), 'utf8') }).body;
  } catch { return 'gone'; }
  try {
    const r = await fetchImpl(d.endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      headers: {
        Authorization: vapidAuthorization(d.endpoint, config.subject, config.keys, nowSec),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(TTL_SEC[m.kind]),
        Urgency: 'normal',
        // a newer message of the same kind replaces one still waiting on the push service
        Topic: m.tag,
      },
      body: new Uint8Array(body),
    });
    if (r.status === 404 || r.status === 410) return 'gone';
    return r.status >= 200 && r.status < 300 ? 'ok' : 'failed';
  } catch { return 'failed'; }
}

export async function notify(userId: string, ctx: MessageContext, deps: NotifyDeps): Promise<NotifyResult> {
  const now = deps.now ?? Date.now();
  const reminder = REMINDER_KINDS.includes(ctx.kind);
  if (!deps.config.on && !(reminder && deps.emailOn)) return { status: 'off' };
  if (!(await pushTablesReady(deps.db, now))) return { status: 'not_ready' };

  const [dobYear, prefs, counts] = await Promise.all([
    deps.dobYear(userId).catch(() => null), readPrefs(deps.db, userId), sendCounts(deps.db, userId, ctx.kind),
  ]);
  const refusal = sendRefusal(ctx.kind, {
    dobYear,
    prefs: prefs ?? { kinds: [], email: false },
    sentLast24h: counts ? counts.last24h : null,
    lastOfKindAt: counts ? (counts.kindAgoMs === null ? null : now - counts.kindAgoMs) : undefined,
  }, now);
  // choices that could not be read are not "did not opt in": they are unreadable, and refuse the same way
  if (refusal) return { status: 'refused', reason: refusal === 'not_opted_in' && prefs === null ? 'count_unreadable' : refusal };

  const m = messageFor(ctx);
  let pushed = 0;
  if (deps.config.on) {
    const config = deps.config;
    const devices = await listDevices(deps.db, userId);
    const outcomes = await Promise.all(devices.map((d) => sendToDevice(d, m, config, deps.fetch, Math.floor(now / 1000))));
    for (let i = 0; i < devices.length; i++) {
      if (outcomes[i] === 'ok') { pushed += 1; await deviceWorked(deps.db, devices[i].id); }
      else await deviceFailed(deps.db, devices[i].id, outcomes[i] === 'gone');
    }
    if (pushed > 0) await logSend(deps.db, userId, ctx.kind, 'push');
  }

  let emailed = false;
  if (pushed === 0 && reminder && prefs?.email && deps.emailOn) {
    const to = await deps.emailOf(userId).catch(() => null);
    if (to && (await deps.sendMail(to, emailFor(m, deps.origin)).catch(() => 'failed' as const)) === 'sent') {
      emailed = true;
      await logSend(deps.db, userId, ctx.kind, 'email');
    }
  }
  return pushed > 0 || emailed ? { status: 'sent', push: pushed, email: emailed } : { status: 'undelivered' };
}
