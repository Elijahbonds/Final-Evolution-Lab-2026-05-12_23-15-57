import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isBinjgbShelfEnabled } from './lib/flags';

/** Screen paths only — enforced on every matched response (307, 200, RSC). */
export const SCREEN_PERMISSIONS_POLICY = 'camera=(self), microphone=()';

/**
 * BINJGB-SHELF-1 (Cyber G2, review 067e0dce): the Homebrew Shelf's own policy — no camera, no microphone, no location;
 * gamepad and fullscreen for the shelf itself only. next.config.js's appended shelf rule sends the SAME value (Cyber N-2),
 * so the two agree; the PR-time `curl -sI /play/gb-shelf` must show exactly one Permissions-Policy (Cyber F-A).
 */
export const SHELF_PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), gamepad=(self), fullscreen=(self)';
export const SHELF_REFERRER_POLICY = 'no-referrer';

/**
 * PER-ROUTE POLICY TABLE (Cyber G2). One row per route group; the first row whose prefix matches wins, so the local frame
 * (framed by the shelf page itself) sits above the shelf. 'wasm-unsafe-eval' is only ever in a row here — never in a
 * default or global policy — and only /screen*, /play/mirror/assess* and /play/gb-shelf* have one.
 *   wasm         'wasm-unsafe-eval' in script-src
 *   permissions  the Permissions-Policy header
 *   enforce      true → Content-Security-Policy (enforced); false → Content-Security-Policy-Report-Only (legacy pose routes)
 *   sandbox      F3 (Cyber build review dcbbec16): a CSP `sandbox` directive for the document itself, so the local frame is
 *                an opaque origin even when it is opened top-level or framed without the attribute. Never allow-same-origin.
 */
export interface RoutePolicy {
  prefix: string;
  wasm: boolean;
  permissions: string;
  enforce: boolean;
  frameAncestors: "'none'" | "'self'";
  referrer: string | null;
  sandbox: 'allow-scripts' | null;
}

export const ROUTE_POLICIES: readonly RoutePolicy[] = [
  { prefix: '/play/gb-shelf/local-frame', wasm: true, permissions: SHELF_PERMISSIONS_POLICY, enforce: true, frameAncestors: "'self'", referrer: SHELF_REFERRER_POLICY, sandbox: 'allow-scripts' },
  { prefix: '/play/gb-shelf', wasm: true, permissions: SHELF_PERMISSIONS_POLICY, enforce: true, frameAncestors: "'none'", referrer: SHELF_REFERRER_POLICY, sandbox: null },
  { prefix: '/screen', wasm: true, permissions: SCREEN_PERMISSIONS_POLICY, enforce: false, frameAncestors: "'none'", referrer: null, sandbox: null },
  { prefix: '/play/mirror/assess', wasm: true, permissions: SCREEN_PERMISSIONS_POLICY, enforce: false, frameAncestors: "'none'", referrer: null, sandbox: null },
];

const underPrefix = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + '/');

/** The policy row for a path, or null. */
export function routePolicyFor(pathname: string): RoutePolicy | null {
  // F6/F3 hardening (Cyber F2F6 review): match the percent-decoded, slash-collapsed spelling first, so
  // /play/gb-shelf/local%2Dframe and /play/gb-shelf//local-frame get the local-frame row (sandbox), not the shelf row.
  const norm = (p: string) => (p.length > 1 ? p.replace(/\/{2,}/g, '/').replace(/\/+$/, '') : p);
  const decoded = norm(decodedPath(pathname));
  const raw = norm(pathname);
  return ROUTE_POLICIES.find((p) => underPrefix(decoded, p.prefix)) ?? ROUTE_POLICIES.find((p) => underPrefix(raw, p.prefix)) ?? null;
}

/**
 * BINJGB-SHELF-1 (Cyber G10): public/ files skip the flag, so while BINJGB_SHELF_ENABLED is off middleware answers 404
 * for the vendored player and anything under /gb-shelf/ — no wasm, no player script, no game bytes from the live site.
 */
export const SHELF_STATIC_PREFIXES = ['/vendor/binjgb', '/gb-shelf'] as const;

/** The pathname once percent-decoded (the static server decodes before it looks up a file); the raw one if malformed. */
function decodedPath(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

/** F6: raw OR percent-decoded spelling — /vendor%2Fbinjgb/… and /%76endor/binjgb/… count as the vendored folder too. */
export function isShelfStaticPath(pathname: string): boolean {
  const decoded = decodedPath(pathname);
  return SHELF_STATIC_PREFIXES.some((p) => underPrefix(pathname, p) || underPrefix(decoded, p));
}

/**
 * Open with no session. Middleware must never send these to /login.
 * /links is the Instagram bio page. /elijah redirects there; /books redirects to /press (the book shop).
 */
export const PUBLIC_ROUTE_ALLOWLIST = ['/links', '/books', '/elijah'] as const;

export function isPublicRoute(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return (PUBLIC_ROUTE_ALLOWLIST as readonly string[]).includes(path);
}

function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let raw = '';
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw);
}

function scriptSrc(nonce: string, policy: RoutePolicy): string {
  return `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${policy.wasm ? " 'wasm-unsafe-eval'" : ''}`;
}

function cspReportOnly(nonce: string, policy: RoutePolicy): string {
  return [
    "default-src 'self'",
    scriptSrc(nonce, policy),
    "connect-src 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "worker-src 'self'",
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    `frame-ancestors ${policy.frameAncestors}`,
    "form-action 'self'",
    // No `upgrade-insecure-requests` here: a report-only policy ignores it, and every page that carries this header
    // logged "The Content Security Policy directive 'upgrade-insecure-requests' is ignored when delivered in a
    // report-only policy" as a console ERROR on each load (/screen*, /play/mirror/assess*; bug sweep 2026-10-14). Add it
    // back when this policy is switched to enforcing.
  ].join('; ');
}

/**
 * BINJGB-SHELF-1 (Cyber G2): the shelf's ENFORCED policy, exactly as specified (spec §3.3.2 item 3). connect-src 'self'
 * backs the no-upload / no-third-party rules (G5, T-LOCAL-NET); frame-ancestors is 'none' for the shelf and 'self' for
 * the local frame, which only the shelf page embeds.
 */
export function cspEnforced(nonce: string, policy: RoutePolicy): string {
  return [
    "default-src 'self'",
    scriptSrc(nonce, policy),
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "manifest-src 'self'",
    "connect-src 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    `frame-ancestors ${policy.frameAncestors}`,
    "form-action 'self'",
    ...(policy.sandbox ? [`sandbox ${policy.sandbox}`] : []),
  ].join('; ');
}

/** Next 14 reads the nonce from the request's content-security-policy header (not report-only alone). */
function requestCsp(nonce: string, policy: RoutePolicy): string {
  return scriptSrc(nonce, policy);
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }
  if (isShelfStaticPath(pathname)) {
    return isBinjgbShelfEnabled() ? NextResponse.next() : new NextResponse(null, { status: 404 });
  }
  const policy = routePolicyFor(pathname);
  if (!policy) {
    if (!request.headers.has('x-nonce')) return NextResponse.next();
    const stripped = new Headers(request.headers);
    stripped.delete('x-nonce');   // only middleware mints the nonce (Cyber F2F6 C3)
    return NextResponse.next({ request: { headers: stripped } });
  }

  const nonce = makeNonce();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', requestCsp(nonce, policy));

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (policy.enforce) response.headers.set('Content-Security-Policy', cspEnforced(nonce, policy));
  else response.headers.set('Content-Security-Policy-Report-Only', cspReportOnly(nonce, policy));
  response.headers.set('Permissions-Policy', policy.permissions);
  if (policy.referrer) response.headers.set('Referrer-Policy', policy.referrer);
  return response;
}

export const config = {
  matcher: [
    '/links', '/books', '/elijah', '/screen', '/screen/:path*', '/play/mirror/assess', '/play/mirror/assess/:path*',
    // BINJGB-SHELF-1: the shelf routes (G2 policy) and its static files (G10 flag-off 404). No /play/gb-local (OQ-6).
    '/play/gb-shelf', '/play/gb-shelf/:path*', '/vendor/binjgb/:path*', '/gb-shelf/:path*',
  ],
};
