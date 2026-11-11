// ARENA-AGE-1 — Cyber addendum T4 (PM decision 2, 2026-11-04: teens play house rivals only). A teen duel's second seat
// is always a House Rival; the teen Arena has no lobby, no join, no create and no human pairing; there is no chat, DM,
// friend-invite or voice surface in any Arena file. (A teen calling /api/arena/join is refused: arenaTeenGate.route.test.ts.)
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
function walk(dir: string): string[] {
  return readdirSync(join(process.cwd(), dir)).flatMap((n) => {
    const rel = `${dir}/${n}`;
    return statSync(join(process.cwd(), rel)).isDirectory() ? walk(rel) : [rel];
  });
}

describe('teen pairing', () => {
  const teen = src('app/api/arena/teen-match/route.ts');

  it('seat 2 is always a House Rival from the house roster, never a lobby pick', () => {
    expect(teen).toContain('ensureHouseRivals(prisma)');
    expect(teen).toContain('player2Id: rivalId');
    expect(teen).toContain("status: 'ACTIVE'");
    expect(teen).not.toMatch(/status:\s*'WAITING'/);
  });

  it('the practice route locks nothing (no entry on either seat)', () => {
    expect(teen).not.toMatch(/arenaLockEntry\s*\(/);
    expect(teen).toContain('entryFeeCents: 0');
    expect(teen).toContain('rakePercent: 0');
  });

  it('the teen view never calls the human-pairing or entry routes', () => {
    const view = src('components/arena/teen-arena-view.tsx');
    for (const r of ['/api/arena/join', '/api/arena/create', '/api/arena/quick-match']) expect(view).not.toContain(r);
    expect(view).toContain('/api/arena/teen-match');
  });

  it('no chat, DM, friend-invite or voice surface exists in any Arena route or component', () => {
    const files = [...walk('app/api/arena'), ...walk('components/arena'), 'components/arena-view.tsx', 'app/arena/page.tsx']
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f));
    const hits = files.filter((f) => /\b(chat|direct message|friend invite|getUserMedia|voice chat)\b/i.test(src(f)));
    expect(hits).toEqual([]);
  });
});
