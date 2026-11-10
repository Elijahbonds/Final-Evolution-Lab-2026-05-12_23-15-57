// lib/binjgb/vendorHttp.ts — BINJGB-SHELF-1 G1(a) (Cyber A2/A3, 2026-11-09). The HTTP contract of /vendor/binjgb/<file>,
// shared by app/vendor/binjgb/[file]/route.ts and the middleware's flag-off 404. Pure and edge-safe: no Buffer, no fs.

/** The only two names the route serves, and the exact Content-Type each is sent with (A3). */
export const BINJGB_VENDOR_TYPES = {
  'binjgb.js': 'application/javascript; charset=utf-8',
  'binjgb.wasm': 'application/wasm',
} as const;

export type BinjgbVendorFile = keyof typeof BINJGB_VENDOR_TYPES;

/**
 * The allow-listed name, or null (A2). Refuses anything holding '%', '/', '\' or '..' before the list is consulted,
 * then compares exactly and case-sensitively: BINJGB.JS, binjgb.js/, 'binjgb.js ' and LICENSE are all null.
 */
export function binjgbVendorFile(name: unknown): BinjgbVendorFile | null {
  if (typeof name !== 'string') return null;
  if (name.includes('%') || name.includes('/') || name.includes('\\') || name.includes('..')) return null;
  if (name === 'binjgb.js') return 'binjgb.js';
  if (name === 'binjgb.wasm') return 'binjgb.wasm';
  return null;
}

/** Headers on every vendor response, 200 and 404 alike (A3). */
export const BINJGB_VENDOR_COMMON_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
};

/** The 200 headers for an allow-listed file (A3). */
export function binjgbVendorOkHeaders(file: BinjgbVendorFile): Record<string, string> {
  return { 'Content-Type': BINJGB_VENDOR_TYPES[file], ...BINJGB_VENDOR_COMMON_HEADERS };
}

/**
 * The one 404 (A2): empty body, no-store, nosniff. Flag off, an unlisted name and a refused spelling all get exactly this,
 * from the route and from middleware, so nothing about a 404 tells one case from another.
 */
export function binjgbVendorNotFound(): Response {
  return new Response(null, { status: 404, headers: { ...BINJGB_VENDOR_COMMON_HEADERS } });
}

/** The methods the route answers. HEAD is GET without a body (Next derives it from GET). */
export const BINJGB_VENDOR_ALLOW = 'GET, HEAD, OPTIONS';

/** I-2 (Cyber review 467aa397): OPTIONS — 204, no body, Allow, and the same no-store / nosniff as every other answer. */
export function binjgbVendorOptions(): Response {
  return new Response(null, { status: 204, headers: { Allow: BINJGB_VENDOR_ALLOW, ...BINJGB_VENDOR_COMMON_HEADERS } });
}

/** I-2: any other method — 405, no body, Allow, no-store, nosniff. */
export function binjgbVendorMethodNotAllowed(): Response {
  return new Response(null, { status: 405, headers: { Allow: BINJGB_VENDOR_ALLOW, ...BINJGB_VENDOR_COMMON_HEADERS } });
}
