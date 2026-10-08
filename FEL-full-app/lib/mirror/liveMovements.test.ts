// MIRROR-FIRST P1 (2026-10-07): the live movements Form Check links to are the Mirror's own tabs, said the Mirror's way.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MIRROR_LIVE_MOVEMENTS, MIRROR_PATH, mirrorMovementHref } from './liveMovements';
import { LUNGE_FAULT_LABEL } from './lungeStage';
import { screenText } from '@/lib/share/screen';

const harness = readFileSync(new URL('../../app/play/mirror/_components/mirror-harness.tsx', import.meta.url), 'utf8');
/** The harness's PATTERN_SHORT map, read from its source: key → the tab's label. */
const tabs = (() => {
  const block = harness.slice(harness.indexOf('const PATTERN_SHORT'), harness.indexOf('};', harness.indexOf('const PATTERN_SHORT')));
  return Object.fromEntries([...block.matchAll(/(\w+): '([^']+)'/g)].map((m) => [m[1], m[2]]));
})();

describe('the Mirror\'s live movements', () => {
  it('are exactly the harness\'s tabs, each by its own key and label (a tab added or renamed there fails here)', () => {
    expect(Object.keys(tabs).length).toBeGreaterThanOrEqual(5);
    expect(Object.fromEntries(MIRROR_LIVE_MOVEMENTS.map((m) => [m.id, m.tab]))).toEqual(tabs);
  });

  it('link to /play/mirror?pattern=<the tab key> (the address plan Phase 2 reads)', () => {
    for (const m of MIRROR_LIVE_MOVEMENTS) expect(mirrorMovementHref(m.id)).toBe(`${MIRROR_PATH}?pattern=${m.id}`);
    expect(MIRROR_PATH).toBe('/play/mirror');
  });

  it('say only what the Mirror does: the lunge reads five ways and speaks, no clinical words', () => {
    expect(Object.keys(LUNGE_FAULT_LABEL)).toHaveLength(5);
    const lunge = MIRROR_LIVE_MOVEMENTS.find((m) => m.id === 'lunge')!;
    expect(lunge.reads).toMatch(/five/);
    // MIRROR-MOVES P2: the lunge speaks now (lungeStage.ts LUNGE_CUE_TABLE, wired in the harness) — this said it did not
    expect(lunge.reads).toMatch(/spoken cues/i);
    expect(harness).toMatch(/lungeCueRef\.current\.decide\(/);
    for (const m of MIRROR_LIVE_MOVEMENTS) {
      expect(m.reads, m.id).not.toMatch(/\bmeasur/i);              // a camera number is an estimate
      expect(screenText(`${m.title}. ${m.reads}`), m.id).toEqual([]);
    }
  });
});
