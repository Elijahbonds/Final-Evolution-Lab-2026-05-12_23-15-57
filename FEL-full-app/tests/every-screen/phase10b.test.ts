// EVERY-SCREEN P10 part B (2026-11-12): "prove" — the four journeys stay in the suite, the /story check exists with its
// control, every screen that does not pass is named with what it needs, and the scorecard carries before → after.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { JOBS } from '../../scripts/every-screen/jobs-list.mts';

const src = (p: string) => readFileSync(p, 'utf8');

describe('the four journeys are walks in the suite', () => {
  const ids = ['journey-new-athlete', 'journey-client', 'journey-coach', 'journey-games'] as const;
  it('one for each person: a new athlete alone, a coached client, the coach, a player who only wants the games', () => {
    const who = Object.fromEntries(JOBS.filter((j) => (ids as readonly string[]).includes(j.id)).map((j) => [j.id, j.who]));
    expect(who).toEqual({ 'journey-new-athlete': 'anon', 'journey-client': 'client', 'journey-coach': 'coach', 'journey-games': 'solo' });
  });
  it('each moves through the app by its own links and tabs: an address is opened only at the start', () => {
    for (const id of ids) {
      const j = JOBS.find((x) => x.id === id)!;
      const gotos = j.steps.map((s, i) => (s.goto ? i : -1)).filter((i) => i >= 0);
      expect(gotos.every((i) => i < 3), id).toBe(true);   // the start (and the shared Train/roster prelude)
      expect(j.steps.length, id).toBeGreaterThan(6);
    }
  });
});

describe('the /story check', () => {
  it('reads every zone marker and label at 390 px, at 100 % and 150 % text, and has a planted control', () => {
    const s = src('scripts/every-screen/story-map-check.mts');
    expect(s).toContain("for (const size of ['100%', '150%'])");
    expect(s).toContain('viewport: { width: 390, height: 844 }');
    expect(s).toContain('STORY_CHECK_PLANT');
  });
});

describe('every screen that does not pass is named, with what it needs', () => {
  it('the scorecard\'s failing screens each have a need (an alias needs nothing: it sends you on)', () => {
    const card = JSON.parse(src('docs/every-screen/scorecard.json')) as { screens: { route: string; state: string; passAll: boolean }[] };
    const needs = JSON.parse(src('docs/every-screen/needs.json')) as Record<string, string>;
    const missing = card.screens.filter((s) => !s.passAll && s.state !== 'alias' && !needs[s.route]).map((s) => s.route);
    expect(missing).toEqual([]);
  });
  it('the scorecard page carries the phase-1 → phase-10 table for every screen', () => {
    expect(existsSync('docs/every-screen/scorecard-phase1.json')).toBe(true);
    const page = src('docs/EVERY-SCREEN-SCORECARD.md');
    expect(page).toContain('## Before (phase 1) → after (phase 10), every screen');
    const card = JSON.parse(src('docs/every-screen/scorecard.json')) as { screens: { route: string }[] };
    for (const s of card.screens) expect(page, s.route).toContain(`| \`${s.route}\` |`);
  });
});

describe('small fixes the re-score found', () => {
  it('the controller\'s name field has a name of its own (it had only a placeholder)', () => {
    expect(src('components/controller-link/controller-page.tsx')).toContain('aria-label="Your name"');
  });
  it('the big screen\'s "keeps the screen awake" line reads at 4.5:1 or better', () => {
    expect(src('components/controller-link/host-stage.tsx')).not.toContain("color: '#6b7280', font: '400 12px/1.5 system-ui'");
  });
});
