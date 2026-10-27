// The browser half of web push's setup (offline-push, round 8). Client-safe: no Node imports.

/** A base64url VAPID public key as the bytes PushManager.subscribe wants (applicationServerKey). */
export function applicationServerKey(b64url: string): Uint8Array {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** What the settings block can offer on this browser. */
export type PushSupport = 'ok' | 'no_worker' | 'no_push' | 'denied' | 'ios_needs_install';

export function pushSupport(w: {
  navigator?: { serviceWorker?: unknown; standalone?: boolean; userAgent?: string };
  PushManager?: unknown; Notification?: { permission?: string };
  matchMedia?: (q: string) => { matches: boolean };
}): PushSupport {
  const nav = w.navigator;
  if (!nav || !nav.serviceWorker) return 'no_worker';
  const ios = /iPhone|iPad|iPod/.test(nav.userAgent ?? '');
  const standalone = nav.standalone === true || w.matchMedia?.('(display-mode: standalone)').matches === true;
  // Safari on iPhone and iPad offers web push only to an app added to the home screen (iOS 16.4+)
  if (!w.PushManager || !w.Notification) return ios && !standalone ? 'ios_needs_install' : 'no_push';
  if (w.Notification.permission === 'denied') return 'denied';
  return 'ok';
}
