// Challenge handoff: a /c/<code> link survives signup and login, and a signed-in
// accept goes to that mode's /play route with the code kept on ?c=.
import { loginPath } from '@/lib/auth/safeNext';
import { MODE_INFO, canonicalModeKey } from '@/lib/game-data';
import { isUnlistedPlayHref } from '@/lib/unlisted-modes';

const CHALLENGE_MODE_ALIASES: Record<string, string> = {
  showDown: 'showdown',
};

export function challengeReturnPath(code: string): string {
  return `/c/${encodeURIComponent(code)}`;
}

/** The code inside a same-origin /c/<code> return path, or null when next is not one. */
export function challengeCodeFromReturnPath(path: string | null | undefined): string | null {
  const raw = path?.match(/^\/c\/([^/?#]+)/)?.[1];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function challengeSignupHref(code: string): string {
  return `/signup?c=${encodeURIComponent(code)}`;
}

export function challengeLoginHref(code: string): string {
  return loginPath(challengeReturnPath(code));
}

export function challengePlayHref(modeKey: string, code: string): string | null {
  const key = CHALLENGE_MODE_ALIASES[modeKey] ?? canonicalModeKey(modeKey);
  const route = MODE_INFO[key]?.href;
  // Iron Paradise's /play/training 307s to /train and would drop ?c=. A parked mode has no play handoff.
  if (!route?.startsWith('/play/') || isUnlistedPlayHref(route)) return null;
  return `${route}?c=${encodeURIComponent(code)}`;
}
