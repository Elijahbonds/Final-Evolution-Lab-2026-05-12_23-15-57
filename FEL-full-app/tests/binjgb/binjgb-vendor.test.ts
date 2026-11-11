// BINJGB-SHELF-1 — the vendored player (Cyber G3) and its credit. T-JS-PIN, T-WASM-PIN, T-LICENSE-BINJGB.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BINJGB_COMMIT, BINJGB_JS_PATH, BINJGB_JS_SHA256, BINJGB_WASM_PATH, BINJGB_WASM_SHA256 } from '@/lib/binjgb/vendor';
import { BINJGB_CREDIT_LINE } from '@/lib/binjgb/copy';
import { CREDITS, creditForPublicPath, licenceRule, OPEN_LICENCES } from '@/lib/credits/credits';
import { ROOT } from './helpers';

const DIR = join(ROOT, 'third_party/binjgb');
const sha256 = (f: string) => createHash('sha256').update(readFileSync(join(DIR, f))).digest('hex');

describe('the vendored files are exactly the pinned ones (G3)', () => {
  it('T-JS-PIN: binjgb.js is the pinned 13,640 bytes', () => {
    expect(readFileSync(join(DIR, 'binjgb.js')).length).toBe(13_640);
    expect(sha256('binjgb.js')).toBe('a68e5854b5d68339a34c0aa0b6dbeacd615ed316657ee17b63dafa5e00561b09');
    expect(BINJGB_JS_SHA256).toBe(sha256('binjgb.js'));
  });

  it('T-WASM-PIN: binjgb.wasm is the pinned 88,269 bytes', () => {
    expect(readFileSync(join(DIR, 'binjgb.wasm')).length).toBe(88_269);
    expect(sha256('binjgb.wasm')).toBe('52c165069441a09180b4bd63464318aa7b861b1d36e0d05e8047b48619fd2f0b');
    expect(BINJGB_WASM_SHA256).toBe(sha256('binjgb.wasm'));
  });

  it('T-LICENSE-BINJGB: the upstream MIT licence, Ben Smith, verbatim', () => {
    const l = readFileSync(join(DIR, 'LICENSE'), 'utf8');
    expect(l.startsWith('Copyright (c) 2016 Ben Smith\n')).toBe(true);
    expect(l).toContain('Permission is hereby granted, free of charge, to any person obtaining a copy');
    expect(l).toContain('The above copyright notice and this permission notice shall be included in');
    expect(sha256('LICENSE')).toBe('5a7b61a51a5efb789721b3480b502f324094911aeca46937956c561b52638009');
  });

  it('ships only js, wasm, LICENSE and VENDOR.md — no demo, no idb/vue/sha1 helpers, no cart', () => {
    expect(readdirSync(DIR).sort()).toEqual(['LICENSE', 'VENDOR.md', 'binjgb.js', 'binjgb.wasm']);
  });

  it('VENDOR.md records the upstream, the commit and both hashes', () => {
    const v = readFileSync(join(DIR, 'VENDOR.md'), 'utf8');
    expect(v).toContain('https://github.com/binji/binjgb');
    expect(v).toContain(BINJGB_COMMIT);
    expect(v).toContain(BINJGB_JS_SHA256);
    expect(v).toContain(BINJGB_WASM_SHA256);
  });

  it('the paths the code loads are the same-origin vendor folder (G5)', () => {
    expect(BINJGB_JS_PATH).toBe('/vendor/binjgb/binjgb.js');
    expect(BINJGB_WASM_PATH).toBe('/vendor/binjgb/binjgb.wasm');
  });

  it('the engine builds no thread, worker or eval path (why no COEP is needed, G2 item 4)', () => {
    const js = readFileSync(join(DIR, 'binjgb.js'), 'utf8');
    expect(js).not.toMatch(/SharedArrayBuffer|new Worker|\beval\(|new Function/);
  });
});

describe('the credit (permissive, text only)', () => {
  const c = CREDITS.find((x) => x.id === 'binjgb')!;

  it('one binjgb entry, MIT, open, linked to its licence text and to nothing else', () => {
    expect(CREDITS.filter((x) => x.id === 'binjgb')).toHaveLength(1);
    expect(c.licence).toBe('MIT');
    expect(c.status).toBe('open');
    expect(licenceRule(c)).toBeNull();
    expect(c.licenceUrl).toBe(OPEN_LICENCES.MIT);
    expect(c.link).toBeUndefined();   // G5: no outbound link to a code or game page
    expect(c.used).toBe(BINJGB_CREDIT_LINE);
    expect(BINJGB_CREDIT_LINE).toBe('Homebrew player: binjgb by Ben Smith (binji), MIT License.');
  });

  it('covers every vendored file', () => {
    for (const f of readdirSync(DIR)) expect(creditForPublicPath(`vendor/binjgb/${f}`)?.id, f).toBe('binjgb');
  });
});
