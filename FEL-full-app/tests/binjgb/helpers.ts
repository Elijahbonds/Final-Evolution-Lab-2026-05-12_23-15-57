// tests/binjgb/helpers.ts — shared fixtures for the BINJGB-SHELF-1 tests. Every cartridge-shaped buffer here is generated
// in memory and never written to disk (Cyber N-1: no game file in the tree, not even a fixture). No logo bytes.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = join(__dirname, '..', '..');

/** A synthetic, blank, header-valid image of `size` bytes (a power of two ≥ 32 KiB): plain cart type, valid checksum. */
export function syntheticCart(size = 32 * 1024, mapper = 0x00): Uint8Array {
  const b = new Uint8Array(size);
  b[0x143] = 0x00;
  b[0x147] = mapper;
  b[0x148] = Math.log2(size / (32 * 1024));
  let x = 0;
  for (let i = 0x134; i <= 0x14c; i++) x = (x - b[i] - 1) & 0xff;
  b[0x14d] = x;
  return b;
}

/** Every non-test source file under these folders (relative to the app root). */
export function sources(dirs: string[]): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    const abs = join(ROOT, rel);
    let st;
    try { st = statSync(abs); } catch { return; }
    if (st.isDirectory()) { for (const e of readdirSync(abs)) walk(`${rel}/${e}`); return; }
    if (/\.(tsx?|js|mjs)$/.test(rel) && !/\.test\.tsx?$/.test(rel)) out.push(rel);
  };
  for (const d of dirs) walk(d);
  return out;
}

export const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/** The shelf's own code: what ships for BINJGB-SHELF-1 (not the vendored engine). */
export const SHELF_CODE_DIRS = ['lib/binjgb', 'components/binjgb', 'app/play/gb-shelf'];
