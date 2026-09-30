import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Screen paths only — enforced on every matched response (307, 200, RSC). */
export const SCREEN_PERMISSIONS_POLICY = 'camera=(self), microphone=()';

function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let raw = '';
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw);
}

function cspReportOnly(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'`,
    "connect-src 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "worker-src 'self'",
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}

/** Next 14 reads the nonce from the request's content-security-policy header (not report-only alone). */
function requestCsp(nonce: string): string {
  return `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'`;
}

export function middleware(request: NextRequest) {
  const nonce = makeNonce();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', requestCsp(nonce));

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy-Report-Only', cspReportOnly(nonce));
  response.headers.set('Permissions-Policy', SCREEN_PERMISSIONS_POLICY);
  return response;
}

export const config = {
  matcher: ['/screen', '/screen/:path*', '/play/mirror/assess', '/play/mirror/assess/:path*'],
};
