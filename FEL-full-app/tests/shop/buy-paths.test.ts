// PLAT-P07 (2026-11-02): no GET link points at a POST-only checkout route anywhere in app/ or components/. Every buy goes
// through the buy sheet, which POSTs (lib/shop/checkout.ts). Positive control: the scan finds a planted link.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const POST_ONLY = ['/api/stripe/checkout', '/api/books/checkout', '/api/coach/business/checkout', '/api/coach-store/checkout', '/api/v1/wallet/checkout', '/api/v1/wallet/shard-checkout', '/api/season/checkout', '/api/studio/credits'];
const LINK = new RegExp(`(?:href|action)\\s*=\\s*[{]?\\s*[\`'"](?:[^\`'"]*)(?:${POST_ONLY.map((p) => p.replace(/[/]/g, '\\/')).join('|')})`);

function files(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== 'node_modules' && !f.startsWith('.')) files(p, out); }
    else if (/\.(tsx|ts|jsx|js)$/.test(f) && !/\.test\./.test(f)) out.push(p);
  }
  return out;
}
const linksIn = (src: string) => src.split('\n').filter((l) => LINK.test(l));

describe('buy paths', () => {
  it('no href (or form action) to a POST-only checkout route in app/ or components/', () => {
    const hits = [...files('app'), ...files('components')].flatMap((f) => linksIn(readFileSync(f, 'utf8')).map((l) => `${f}: ${l.trim()}`));
    expect(hits).toEqual([]);
  });
  it('control: a planted GET link is found', () => {
    expect(linksIn('<a href="/api/stripe/checkout?product=FEL_PRO">Buy</a>')).toHaveLength(1);
    expect(linksIn("<Link href={`/api/books/checkout?offer=${id}`}>")).toHaveLength(1);
    expect(linksIn("fetch('/api/books/checkout', { method: 'POST' })")).toHaveLength(0);
  });
});
