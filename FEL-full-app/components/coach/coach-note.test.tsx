// A screen prescription's coach note links the Mirror's written corrective on Today (MIRROR-COACH P9 fix, 2026-09-30,
// code review: rule (e) wants the correctives "reachable from a coach prescription", and the draft's corrective reached
// only the coach's panel). The note is built by the real coachNoteFor over the real coachDraft; Today renders it through
// CoachNote, server-rendered here.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CoachNote, splitCorrectiveLink } from './coach-note';
import { coachDraft, coachNoteFor, type CatalogueExercise } from '@/lib/coach/mirrorToProgram';
import { FIXTURE_CATALOGUE, fixtureScreens } from '@/app/dev/coach-prescribe/fixture';

const render = (note: string) => renderToStaticMarkup(createElement(CoachNote, { note }));
const flags = fixtureScreens('flags');
const draft = (youth: 'minor' | 'unknownAge' | null) =>
  coachDraft(flags.rows, FIXTURE_CATALOGUE as unknown as CatalogueExercise[], { youth });

describe('Today shows the written corrective a screen prescription points to, as a link', () => {
  it('an adult client\'s added Prep row: the finding as text, then a link to the corrective\'s section', () => {
    const p = draft(null).prescriptions.find((x) => x.corrective)!;
    expect(p).toBeTruthy();
    const html = render(coachNoteFor(p));
    expect(html).toMatch(/data-corrective-link/);
    expect(html).toMatch(new RegExp(`href="${p.corrective!.href}"`));
    expect(html).toContain('From the screen:');
  });

  it('youth rules: no corrective in the note, so no link', () => {
    for (const youth of ['minor', 'unknownAge'] as const) {
      for (const p of draft(youth).prescriptions) expect(render(coachNoteFor(p))).not.toMatch(/data-corrective-link/);
    }
  });

  it('only the correctives page is ever linked: a URL or another path a coach typed stays text', () => {
    for (const typed of ['See https://example.com/x', 'Try /play/mirror', 'javascript:alert(1)', '/play/mirror/correctivesX nope']) {
      const html = render(typed);
      expect(html).not.toMatch(/<a /);
    }
    expect(splitCorrectiveLink('a /play/mirror/correctives#release b')).toEqual({ before: 'a ', href: '/play/mirror/correctives#release', after: ' b' });
    expect(splitCorrectiveLink('no link here')).toBeNull();
  });

  it('a plain note renders exactly as it did ("Coach: …")', () => {
    expect(render('Keep the bar close.').replace(/<[^>]+>/g, '')).toBe('Coach: Keep the bar close.');
  });
});
