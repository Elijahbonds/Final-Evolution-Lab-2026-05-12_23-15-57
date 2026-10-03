import { MODE_INFO, canonicalModeKey } from '@/lib/game-data';

const CHALLENGE_MODE_ALIASES: Record<string, string> = {
  showDown: 'showdown',
};

export function challengeReturnPath(code: string): string {
  return `/c/${encodeURIComponent(code)}`;
}

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
  return `/login?next=${encodeURIComponent(challengeReturnPath(code))}`;
}

export function challengePlayHref(modeKey: string, code: string): string | null {
  const key = CHALLENGE_MODE_ALIASES[modeKey] ?? canonicalModeKey(modeKey);
  const route = MODE_INFO[key]?.href;
  if (!route?.startsWith('/play/')) return null;
  return `${route}?c=${encodeURIComponent(code)}`;
}

