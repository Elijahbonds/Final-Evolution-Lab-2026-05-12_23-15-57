import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function wordsBetween(src: string, start: string, end: string): string[] {
  const from = src.indexOf(start);
  expect(from, `${start} not found`).toBeGreaterThanOrEqual(0);
  const to = src.indexOf(end, from + start.length);
  expect(to, `${end} not found after ${start}`).toBeGreaterThan(from);
  return src.slice(from + start.length, to).trim().split(/\s+/).filter(Boolean);
}

describe('play gauntlet route coverage', () => {
  it('maps every /play gauntlet mode to a route slug', () => {
    const src = readFileSync('scripts/gauntlet-play.sh', 'utf8');
    const routeTokens = wordsBetween(src, 'typeset -A ROUTE=(', ')\n{');
    const routes: Record<string, string> = {};
    for (let i = 0; i < routeTokens.length; i += 2) {
      routes[routeTokens[i]] = routeTokens[i + 1];
    }

    const loopModes = wordsBetween(src, 'for m in ', '; do');
    expect(loopModes.filter((mode) => !routes[mode])).toEqual([]);
    expect(routes.freerun).toBe('freerun');
    expect(routes.sprint).toBe('sprint');
  });
});
