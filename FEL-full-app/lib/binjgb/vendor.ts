// lib/binjgb/vendor.ts — BINJGB-SHELF-1: where the vendored player lives and what its bytes must hash to (Cyber G3).
// The record is third_party/binjgb/VENDOR.md (G1(a): outside public/); tests/binjgb/binjgb-vendor.test.ts pins both, and
// tests/binjgb/binjgb-g1a-route.test.ts pins the bytes app/vendor/binjgb/[file]/route.ts actually serves.

/** Same-origin vendor URL (G5: locateFile points here, never a CDN), served by a route handler. 404 while BINJGB_SHELF_ENABLED is off (G10). */
export const BINJGB_VENDOR_PATH = '/vendor/binjgb/';
export const BINJGB_JS_PATH = '/vendor/binjgb/binjgb.js';
export const BINJGB_WASM_PATH = '/vendor/binjgb/binjgb.wasm';

/** Upstream commit the files come from. */
export const BINJGB_COMMIT = '16621111ed0ee73bcc45c912a823bcebedcffc0f';
/** sha256 of the shipped files at that commit (spec §3.2; Cyber review 067e0dce). */
export const BINJGB_JS_SHA256 = 'a68e5854b5d68339a34c0aa0b6dbeacd615ed316657ee17b63dafa5e00561b09';
export const BINJGB_WASM_SHA256 = '52c165069441a09180b4bd63464318aa7b861b1d36e0d05e8047b48619fd2f0b';
