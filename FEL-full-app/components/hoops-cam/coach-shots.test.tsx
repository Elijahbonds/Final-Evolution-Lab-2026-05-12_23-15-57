// BBS-04: the coach's shot charts. No DOM in this runner (node environment), so — as components/coach/readiness-checkin
// .test.tsx does — the first paint is a server render, the chart is rendered from a real athleteShots() window, and the
// team panel's wiring is read from the source.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AthleteChart, CoachShots, TeamShots } from './coach-shots';
import { athleteShots } from '@/lib/hoops-cam/coach';

afterEach(() => { vi.unstubAllGlobals(); });

const read = (p: string): string => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node:fs').readFileSync(new URL(p, import.meta.url), 'utf8');
};

describe('the team panel stays dark', () => {
  it('first paint is NOTHING (no card, no spinner) until the answer says the charts are available', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    expect(renderToStaticMarkup(createElement(TeamShots, { teamId: 'g1' }))).toBe('');
  });

  it('an unavailable answer (before the SQL), a 403 or a failed read all leave it at nothing', () => {
    const src = read('./coach-shots.tsx');
    expect(src).toContain('(r.ok ? r.json() : null)');
    expect(src).toContain('setT(j?.available && j.team ? j : null)');
    expect(src).toContain('.catch(() => live && setT(null))');
    expect(src).toMatch(/if \(!t\?\.members\) return null;/);
  });

  it('the group page mounts it under the roll-up, for whoever sees the roll-up (a team\'s owner and coaches)', () => {
    const g = read('../groups/group-screen.tsx');
    expect(g).toMatch(/\{g\.rollup && <TeamRollup [^\n]*\/>\}\n\s*\{\/\*[^\n]*\*\/\}\n\s*\{g\.rollup && <TeamShots teamId=\{g\.id\} \/>\}/);
  });

  it('the coach page says it opens with its table, not an error', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    expect(renderToStaticMarkup(createElement(CoachShots, {}))).toContain('Loading');
  });
});

describe('one athlete\'s chart', () => {
  it('shows made / taken, a mark per spotted shot, the zones, and the trend from two days on', () => {
    const w = athleteShots([
      { kind: 'shots', day: '2026-11-01', at: 1_761_955_200_000, placement: 'top', shots: [{ t: 0, made: true, fixed: false, x: 0.3, z: 0.4 }, { t: 1, made: false, fixed: false, x: 3, z: 6 }] },
      { kind: 'shots', day: '2026-11-02', at: 1_762_041_600_000, placement: 'top', shots: [{ t: 0, made: true, fixed: false, x: null, z: null }] },
    ]);
    const html = renderToStaticMarkup(createElement(AthleteChart, { shots: w, days: 14 }));
    expect(html).toContain('2/3 · 67%');
    expect(html.match(/data-hoops-dot="make"/g)).toHaveLength(1);
    expect(html.match(/data-hoops-dot="miss"/g)).toHaveLength(1);
    expect(html).toContain('1 with no spot');
    expect(html).toContain('Shot chart: 2 made of 3, 2 with a spot');
    expect(html).toContain('data-hoops-trend');
  });

  it('nothing tracked: one line, no chart', () => {
    const html = renderToStaticMarkup(createElement(AthleteChart, { shots: athleteShots([]), days: 14 }));
    expect(html).toContain('Nothing tracked in the last 14 days.');
    expect(html).not.toContain('data-hoops-chart');
  });
});
