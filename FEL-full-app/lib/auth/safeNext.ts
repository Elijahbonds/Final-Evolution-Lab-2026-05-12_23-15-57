// Where a signed-in person may be sent after login (S-16). A same-origin relative path only.
// Absolute URLs and protocol-relative URLs are refused, so ?next= cannot be an open redirect.
// The shape matches lib/feel/rhythm-calibrate.ts safeReturnPath, plus a check on the parsed path:
// a browser decodes %2F, and "/%2F%2Fevil.example" would otherwise become "//evil.example".

const MAX_LEN = 512;

/** A same-origin path (plus its query and hash), or null when it must be ignored. */
export function safeLoginNext(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const p = raw.trim();
  if (!p || p.length > MAX_LEN || p[0] !== '/' || p[1] === '/' || p[1] === '\\') return null;
  if (/[\\\u0000-\u001f\u007f]/.test(p)) return null;
  if (p.includes('://')) return null;
  try {
    const base = 'https://fel.invalid';
    const u = new URL(p, base);
    if (u.origin !== base) return null;
    const out = u.pathname + u.search + u.hash;
    // Node leaves %2F encoded. A browser that decodes it would turn "/%2F%2Fhost" into "//host".
    let decoded = out;
    try { decoded = decodeURIComponent(out); } catch { return null; }
    if (!decoded.startsWith('/') || decoded.startsWith('//')) return null;
    if (/[\\\u0000-\u001f\u007f]/.test(decoded)) return null;
    return out;
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

/** A login URL that returns to a same-origin app path after sign-in. */
export function loginPath(nextPath: string): string {
  const safe = safeLoginNext(nextPath);
  return safe ? `/login?next=${encodeURIComponent(safe)}` : '/login';
}
