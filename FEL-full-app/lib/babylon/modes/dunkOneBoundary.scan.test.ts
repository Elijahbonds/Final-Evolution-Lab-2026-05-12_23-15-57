// FDB-2 (2026-10-17): where "before dunk 1" ends, on the page's own clock.
//
// AM's 42167fdb phone run listed rivals/jinx.glb (CASS's body, 605 KB) as loaded before dunk 1. It is not: it is the contest
// set's first download, requested by the line after `[DUNK-BUDGET] dunk 1 is in` — 2.3 ms after it in the FDB-2 capture (prod
// build, CDP wall clock for both). A harness that stamps the console line when its own process receives it (a Playwright
// `console` event resolves its arguments first) can stamp it after the request. So the mode marks the moment for the page:
// `performance.mark('fel:dunk1-in')`, on the clock Resource Timing's startTime uses. dunkFirstBudget.scan holds the rest
// (load() spawns no rival body; bringRival is the only spawn of it, and the contest set starts it).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const dunk = readFileSync(path.join(ROOT, 'lib/babylon/modes/DunkMode.ts'), 'utf8');
const between = (src: string, from: string, to: string) => { const a = src.indexOf(from); const b = src.indexOf(to, a + from.length); return a < 0 || b < 0 ? '' : src.slice(a, b); };

describe('the dunk-1 boundary', () => {
  const set = between(dunk, 'function startContestSet(ctx: ModeContext)', '\n  /** His body,');
  it('the contest set marks fel:dunk1-in after its console line and before his body is asked for', () => {
    const line = set.indexOf("console.info('[DUNK-BUDGET] dunk 1 is in");
    const mark = set.indexOf("performance.mark('fel:dunk1-in')");
    const body = set.indexOf('rivalArrival = bringRival(ctx);');
    expect(line).toBeGreaterThan(0);
    expect(mark).toBeGreaterThan(line);
    expect(body).toBeGreaterThan(mark);
    expect(set).toMatch(/try \{ performance\.mark\('fel:dunk1-in'\); \} catch/);   // a browser without User Timing still plays
  });
  it('it is marked once per mount: the guard returns before it on a second call', () => {
    const guard = set.indexOf('if (contestSetStarted || ctx.scene.isDisposed) return;');
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(guard).toBeLessThan(set.indexOf("performance.mark('fel:dunk1-in')"));
    expect(dunk.match(/performance\.mark\('fel:dunk1-in'\)/g)).toHaveLength(1);
  });
  it('CASS — the first rival a fresh visitor meets — wears jinx, so jinx.glb is the first GLB after the mark', () => {
    const rivals = readFileSync(path.join(ROOT, 'lib/babylon/core/DunkRivals.ts'), 'utf8');
    expect(rivals).toMatch(/\{ id: 'cass',[^}]*body: 'jinx' \}/);
    expect(rivals).toContain('const i = lastId ? DUNK_RIVALS.findIndex((r) => r.id === lastId) : -1;');   // nobody faced yet → DUNK_RIVALS[0]
    expect(between(dunk, 'async function bringRival(', '\n  /** The corner props')).toContain('rival = await spawnRivalBody(ctx, foe);');
  });
});
