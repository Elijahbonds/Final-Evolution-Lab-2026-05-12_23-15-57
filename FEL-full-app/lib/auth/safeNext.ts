// Where a signed-in person may be sent after login (S-16). A same-origin relative path only.
// Absolute URLs and protocol-relative URLs are refused, so ?next= cannot be an open redirect.
// The shape matches lib/feel/rhythm-calibrate.ts safeReturnPath, plus a check on the parsed path:
// a browser decodes %2F, and "/%2F%2Fevil.example" would otherwise become "//evil.example".
// Decoding is repeated (capped) so a double-encoded "/%252F%252Fevil.example" is refused too,
// along with encoded backslashes (%5C) and encoded control characters (%09, %00).

const MAX_LEN = 512;
const DECODE_ROUNDS = 5;

/** True when a path (raw or after a decode round) could leave this origin. */
function leavesOrigin(p: string): boolean {
  if (!p.startsWith('/') || p.startsWith('//') || p.startsWith('/\\')) return true;
  if (/[\\\u0000-\u001f\u007f]/.test(p)) return true;
  if (p.includes('://')) return true;
  return false;
}

/** A same-origin path (plus its query and hash), or null when it must be ignored. */
export function safeLoginNext(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const p = raw.trim();
  if (!p || p.length > MAX_LEN || leavesOrigin(p)) return null;
  try {
    const base = 'https://fel.invalid';
    const u = new URL(p, base);
    if (u.origin !== base) return null;
    const out = u.pathname + u.search + u.hash;
    let decoded = out;
    for (let i = 0; i < DECODE_ROUNDS; i++) {
      if (leavesOrigin(decoded)) return null;
      let next: string;
      try { next = decodeURIComponent(decoded); } catch { return null; }
      if (next === decoded) return out;
      decoded = next;
    }
    // Still percent-encoded after the cap: refuse rather than guess.
    return null;
  } catch {
    return null;
  }
}

/**
 * Login's landing path. A safe ?next= wins; anything else (including https:// and //host) is ignored
 * and the caller keeps the path it would have used anyway.
 */
export function loginDestination(nextRaw: unknown, fallback: string): string {
  return safeLoginNext(nextRaw) ?? fallback;
}

/** A login URL that returns to a same-origin app path after sign-in. An unsafe path is /login with no next. */
export function loginPath(nextPath: string): string {
  const safe = safeLoginNext(nextPath);
  return safe ? `/login?next=${encodeURIComponent(safe)}` : '/login';
}

/** The bare pathname of a path-plus-query-plus-hash string: everything before the first `?` or `#`, with any
 *  trailing slash trimmed (so `/login/` and `/login` compare equal). Used only to spot "is this the login page". */
function barePath(p: string): string {
  const cut = p.split(/[?#]/)[0];
  return cut.length > 1 ? cut.replace(/\/+$/, '') : cut;
}

/**
 * LOGIN-LOOP-FIX (2026-10-04): where to land once sign-in actually succeeds. Wraps loginDestination with one more
 * guarantee a plain ?next= check does not give you — the result can never be the login page itself. Without this,
 * `next=/login` (handed straight in, or nested as `next=/login?next=/login`) is a perfectly "safe" same-origin
 * path by safeLoginNext's rules, and a caller that trusted it blind would send a just-authenticated athlete right
 * back to the sign-in screen. `loginPathValue` defaults to this app's own /login but is a parameter (not a hardcoded
 * literal) so the rule is testable on its own terms rather than by re-deriving this module's constant.
 */
export function safePostSignInDestination(nextRaw: unknown, fallback: string, loginPathValue = '/login'): string {
  const dest = loginDestination(nextRaw, fallback);
  return barePath(dest) === barePath(loginPathValue) ? fallback : dest;
}
