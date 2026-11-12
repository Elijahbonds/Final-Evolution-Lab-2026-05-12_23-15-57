// DAILY-DRILL × the progress card: the week's line (days with the drill done in the last seven PT days), read by the
// claims' own ledger keys, and drawn under the card on /profile/week — never on the share image.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { dailyDrillKey, drillDaysThisWeek, lastPtDays } from '@/lib/daily-drill/load';
import { DrillWeekLine, drillWeekText } from '@/components/daily-drill/week-line';
import { NOW } from '@/tests/helpers/dailyDrillRows';

describe('the daily drill\'s week', () => {
  it('the last seven PT days, today first, across the November DST change', () => {
    expect(lastPtDays(NOW)).toEqual(['2026-10-24', '2026-10-23', '2026-10-22', '2026-10-21', '2026-10-20', '2026-10-19', '2026-10-18']);
    expect(lastPtDays(new Date('2026-11-03T18:00:00Z'))).toEqual(['2026-11-03', '2026-11-02', '2026-11-01', '2026-10-31', '2026-10-30', '2026-10-29', '2026-10-28']);
  });

  it('one count over the seven claim keys, nothing else read; a failed read is null (no line), not 0', async () => {
    const seen: unknown[] = [];
    const db = { walletLedgerEntry: { findUnique: async () => null, count: async (a: unknown) => { seen.push(a); return 3; } } };
    expect(await drillDaysThisWeek(db, 'u1', NOW)).toBe(3);
    expect(seen).toEqual([{ where: { idempotencyKey: { in: lastPtDays(NOW).map((d) => dailyDrillKey('u1', d)) } } }]);
    expect(await drillDaysThisWeek({ walletLedgerEntry: { findUnique: async () => null, count: async () => { throw new Error('x'); } } }, 'u1', NOW)).toBeNull();
    expect(await drillDaysThisWeek({} as never, 'u1', NOW)).toBeNull();
  });

  it('the line', () => {
    expect(drillWeekText(0)).toBe('No daily drill in the last 7 days yet.');
    expect(drillWeekText(3)).toBe('Daily drill done on 3 of the last 7 days.');
    const html = renderToStaticMarkup(createElement(DrillWeekLine, { days: 3 }));
    expect(html).toContain('href="/train/today-drill"');
    expect(renderToStaticMarkup(createElement(DrillWeekLine, { days: null }))).toBe('');
  });
});
