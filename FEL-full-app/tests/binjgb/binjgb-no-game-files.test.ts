// BINJGB-SHELF-1 — T-NO-GAME-FILES (OQ-10 + Cyber N-1, review a412644b) and T-SHELF-ZERO-TITLES.
// Walks EVERY file in the app tree (excluding node_modules and .git) and fails on: (1) a .gb / .gbc / .sgb extension;
// (2) a .zip / .7z / .rar under public/; (3) a cartridge header in any file — a power-of-two size ≥ 32 KiB, a valid
// header checksum at 0x14D over 0x134–0x14C, a cartridge type at 0x147 on the mapper allow-list, and a size byte at 0x148
// that matches the length; (4) any manifest entry or any sha256 field in the manifest. Only binjgb.js and binjgb.wasm are
// exempt, and only by their pinned sha256. No logo bytes are in this test.
import { closeSync, openSync, readFileSync, readSync, readdirSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { looksLikeCart } from '@/lib/binjgb/cart';
import { SHELF_TITLES } from '@/lib/binjgb/manifest';
import { BINJGB_JS_SHA256, BINJGB_WASM_SHA256 } from '@/lib/binjgb/vendor';
import { ROOT, read, syntheticCart } from './helpers';

const EXEMPT_SHA256 = new Set([BINJGB_JS_SHA256, BINJGB_WASM_SHA256]);
const isPow2 = (n: number) => n > 0 && (n & (n - 1)) === 0;

function walk(): string[] {
  const out: string[] = [];
  const go = (abs: string) => {
    for (const e of readdirSync(abs)) {
      if (e === 'node_modules' || e === '.git') continue;
      const p = join(abs, e);
      const st = lstatSync(p);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) go(p);
      else if (st.isFile()) out.push(p);
    }
  };
  go(ROOT);
  return out;
}

/** Header check on a file without reading all of it: size first, then only the header bytes. */
function fileLooksLikeCart(abs: string, size: number): boolean {
  if (size < 32 * 1024 || !isPow2(size) || size > 8 * 1024 * 1024) return false;
  const head = new Uint8Array(0x150);
  const fd = openSync(abs, 'r');
  try { readSync(fd, head, 0, head.length, 0); } finally { closeSync(fd); }
  // looksLikeCart needs the real length; hand it a view that reports it without allocating the file.
  const probe = new Uint8Array(size);
  probe.set(head);
  return looksLikeCart(probe);
}

describe('T-NO-GAME-FILES: the app tree holds no game file of any name', () => {
  const files = walk();

  it('walked the real tree', () => {
    expect(files.length).toBeGreaterThan(1000);
    expect(files.some((f) => f.endsWith(join('public', 'vendor', 'binjgb', 'binjgb.wasm')))).toBe(true);
  });

  it('(1) no .gb / .gbc / .sgb file anywhere (case-insensitive)', () => {
    expect(files.filter((f) => /\.(gb|gbc|sgb)$/i.test(f)).map((f) => relative(ROOT, f))).toEqual([]);
  });

  it('(2) no .zip / .7z / .rar under public/', () => {
    const pub = join(ROOT, 'public');
    expect(files.filter((f) => f.startsWith(pub) && /\.(zip|7z|rar)$/i.test(f)).map((f) => relative(ROOT, f))).toEqual([]);
  });

  it('(3) no cartridge header in any file, whatever it is called (only the pinned js/wasm are exempt)', () => {
    const hits: string[] = [];
    for (const f of files) {
      const size = lstatSync(f).size;
      if (!fileLooksLikeCart(f, size)) continue;
      const sha = createHash('sha256').update(readFileSync(f)).digest('hex');
      if (!EXEMPT_SHA256.has(sha)) hits.push(relative(ROOT, f));
    }
    expect(hits).toEqual([]);
  });

  it('(3) self-test: the detector flags a synthetic in-memory 32 KiB image with a valid header (never stored as a file)', () => {
    const b = syntheticCart(32 * 1024);
    expect(looksLikeCart(b)).toBe(true);
    expect(looksLikeCart(syntheticCart(64 * 1024, 0x19))).toBe(true);
    const bad = syntheticCart(32 * 1024);
    bad[0x14d] ^= 0xff;
    expect(looksLikeCart(bad)).toBe(false);
    const wrongSize = syntheticCart(32 * 1024);
    wrongSize[0x148] = 1;   // claims 64 KiB
    expect(looksLikeCart(wrongSize)).toBe(false);
    const badMapper = syntheticCart(32 * 1024, 0xfc);
    expect(looksLikeCart(badMapper)).toBe(false);
  });

  it('(4) T-SHELF-ZERO-TITLES: the manifest has no entry and no sha256 field', () => {
    expect(SHELF_TITLES.length).toBe(0);
    const src = read('lib/binjgb/manifest.ts');
    expect(src).not.toMatch(/sha256/i);
    expect(src).toMatch(/export const SHELF_TITLES: readonly ShelfTitle\[\] = \[\];/);
  });

  it('no per-title folders: nothing under public/gb-shelf/', () => {
    expect(files.filter((f) => f.startsWith(join(ROOT, 'public', 'gb-shelf')))).toEqual([]);
  });
});
