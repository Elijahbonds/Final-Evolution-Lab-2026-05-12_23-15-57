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

export type LoginRedirectSearchParams = Record<string, string | string[] | undefined> | URLSearchParams;

function serializeSearchParams(searchParams: LoginRedirectSearchParams | undefined): string {
  if (!searchParams) return '';
  if (searchParams instanceof URLSearchParams) return searchParams.toString();
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) params.append(key, item);
  }
  return params.toString();
}

/** Build /login?next=... for protected pages while preserving a safe relative return path. */
export function loginRedirect(path: string, searchParams?: LoginRedirectSearchParams): string {
  const query = serializeSearchParams(searchParams);
  const candidate = query ? `${path}${path.includes('?') ? '&' : '?'}${query}` : path;
  const next = safeLoginNext(candidate) ?? '/play';
  return `/login?next=${encodeURIComponent(next)}`;
}
