// Web push's switch (offline-push, round 8, OFF-03). Server only.
//
// OFF unless PUSH_ENABLED is exactly "true" AND the VAPID key pair (OWN-19: the owner makes it with
// scripts/push/make-vapid-keys.ts and sets it in the deploy env) is present, valid and one pair, AND VAPID_SUBJECT is a
// mailto: or https: contact. Anything missing answers { on: false, reason } and nothing is ever sent.
import { vapidKeys, type VapidKeys } from './crypto';

export type PushConfig =
  | { on: true; keys: VapidKeys; publicKey: string; subject: string }
  | { on: false; reason: 'flag_off' | 'keys_missing' | 'keys_invalid' | 'subject_missing' };

export function pushConfig(env: NodeJS.ProcessEnv = process.env): PushConfig {
  if (env.PUSH_ENABLED !== 'true') return { on: false, reason: 'flag_off' };
  const pub = env.VAPID_PUBLIC_KEY, priv = env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return { on: false, reason: 'keys_missing' };
  const keys = vapidKeys(priv, pub);
  if (!keys) return { on: false, reason: 'keys_invalid' };
  const subject = String(env.VAPID_SUBJECT ?? '').trim();
  if (!/^mailto:[^\s@]+@[^\s@]+$/.test(subject) && !/^https:\/\/[^\s]+$/.test(subject)) return { on: false, reason: 'subject_missing' };
  return { on: true, keys, publicKey: pub, subject };
}
