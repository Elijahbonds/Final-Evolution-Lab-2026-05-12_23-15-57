// A browser's PushSubscription, checked before it is stored (offline-push, round 8). Pure.
//
// The endpoint is a URL the SERVER will POST to, so it is not taken on trust: https, the default port, and a host that
// belongs to a browser's push service. Anything else (an internal address, another site) is refused — the server never
// becomes a way to send requests somewhere chosen by a request body. The keys must be a P-256 point on the curve and a
// 16-byte secret (RFC 8291 §7).
import { b64u, isP256Point } from './crypto';

/** Chrome / Edge-Chromium / Opera / Samsung (FCM), Firefox (Mozilla autopush), Safari (APNs web push), Edge legacy (WNS). */
export const PUSH_HOSTS: readonly RegExp[] = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
];

export function pushEndpointOk(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 1024) return false;
  let u: URL;
  try { u = new URL(endpoint); } catch { return false; }
  return u.protocol === 'https:' && u.port === '' && !u.username && !u.password && PUSH_HOSTS.some((h) => h.test(u.hostname));
}

export interface CleanSubscription { endpoint: string; p256dh: string; auth: string }

export function parseSubscription(v: unknown): CleanSubscription | null {
  const s = v as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (!s || typeof s !== 'object' || !pushEndpointOk(s.endpoint)) return null;
  const p = b64u.decode(s.keys?.p256dh);
  const a = b64u.decode(s.keys?.auth);
  if (!p || !isP256Point(p) || !a || a.length !== 16) return null;
  return { endpoint: s.endpoint, p256dh: b64u.encode(p), auth: b64u.encode(a) };
}
