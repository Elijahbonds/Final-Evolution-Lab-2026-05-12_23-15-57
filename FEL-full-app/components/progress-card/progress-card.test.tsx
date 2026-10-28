// PROGRESS CARD: the card page's pieces as the server renders them, from realistic rows (tests/helpers/progressCardRows).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildProgressCard } from '@/lib/progress-card/card';
import { READ_CAP } from '@/lib/profile-v2/load';
import type { ProfileRows } from '@/lib/profile-v2/assemble';
import { NOW, adultTwoWeeks, newUser, adultFirstWeek, teenActive } from '@/tests/helpers/progressCardRows';
import { ProgressCardView } from './progress-card-view';
import { ShareWeek, shareImageUrl } from './share-week';
import { WeekCardEntry, WEEK_CARD_HREF } from './week-entry';

const card = (rows: ProfileRows) => buildProgressCard('me', rows, NOW, READ_CAP.played);
const html = (rows: ProfileRows) => renderToStaticMarkup(createElement(ProgressCardView, { card: card(rows) }));
const tilesOf = (h: string) => [...h.matchAll(/data-tile="(\w+)"([\s\S]*?)(?=data-tile=|Games<)/g)].map((m) => [m[1], m[2]] as const);

describe('the card, rendered', () => {
  it('an adult with two weeks: the numbers, the arrows, the games and the headline', () => {
    const h = html(adultTwoWeeks());
    expect(h).toContain('data-card-state="compared"');
    expect(h).toContain('Better on 3 of 5 against last week.');
    expect(h).toContain('Oct 18 – Oct 24');
    expect(h).toContain('26.0');
    expect(h).toContain('+1.6 in vs last week');
    expect(h).toContain('−23 pts vs last week');
    expect(h).toContain('data-mode="dunkContest"');
    expect(h).toContain('9,100');
    expect(h).toContain('+700 vs last week');
    expect(h).toContain('5 runs this week, 4 runs the week before');
  });

  it('a new user: four dashes, each with a way to get its number; no number anywhere on the tiles', () => {
    const h = html(newUser());
    expect(h).toContain('data-card-state="new"');
    const tiles = tilesOf(h);
    expect(tiles.map(([k]) => k)).toEqual(['jump', 'form', 'reaction', 'streak']);
    for (const [, body] of tiles) {
      expect(body).toContain('aria-label="not measured"');
      expect(body).toMatch(/href="\//);
      expect(body).not.toMatch(/>\d/);
    }
    expect(h).toContain('No scored runs in the last two weeks.');
  });

  it('one week only: no arrow on the measured tiles, and the first-week headline', () => {
    const h = html(adultFirstWeek());
    expect(h).toContain('Your first week on record.');
    expect(h).toContain('Nothing last week to compare');
  });

  it('a teen: no name anywhere, no scores, the runs, and why the scores are not here', () => {
    const h = html(teenActive());
    expect(h).not.toMatch(/Sam|Jordan/);
    expect(h).not.toContain('9,100');
    expect(h).toContain('your game scores stay on this phone');
    expect(h).toContain('5 runs this week');
  });
});

describe('the share control', () => {
  it('an adult: the name is a choice, off by default', () => {
    const h = renderToStaticMarkup(createElement(ShareWeek, { minor: false, phoneOnly: false }));
    expect(h).toContain('data-share-name="choice"');
    expect(h).not.toMatch(/checked=""/);
    expect(h).toContain('Make the image');
    expect(shareImageUrl(false)).toBe('/api/v1/progress-card/image?name=0');
  });

  it('a teen: no name option at all, and it says why', () => {
    const h = renderToStaticMarkup(createElement(ShareWeek, { minor: true, phoneOnly: true }));
    expect(h).toContain('data-share-name="never"');
    expect(h).not.toContain('data-share-name="choice"');
    expect(h).toContain('Numbers kept only on this phone aren’t on it.');
  });
});

describe('the weekly door', () => {
  it('links the card and names the week; reads nothing', () => {
    const h = renderToStaticMarkup(createElement(WeekCardEntry, { now: NOW }));
    expect(h).toContain(`href="${WEEK_CARD_HREF}"`);
    expect(h).toContain('Your week · Oct 18 – Oct 24');
    expect(readFileSync(join(__dirname, 'week-entry.tsx'), 'utf8')).not.toMatch(/prisma|fetch\(/);
  });

  // TEST CHANGED (premium-ui P4, 2026-10-27): the Profile tab's door moved from a text link in the progress header to the
  // tab's ONE docked primary (app/profile/page.tsx), same href and the same data-testid; the intent — the weekly door is on
  // the Profile tab — is what this still holds.
  it('is on Train and is the Profile tab\'s primary', () => {
    const root = join(__dirname, '..', '..');
    expect(readFileSync(join(root, 'app/train/page.tsx'), 'utf8')).toContain('<WeekCardEntry />');
    const profile = readFileSync(join(root, 'app/profile/page.tsx'), 'utf8');
    expect(profile).toMatch(/<PrimaryCta href="\/profile\/week" docked testId="profile-week-card"/);
  });
});

it('keeps the phone cheap: no backdrop blur, no animation library in the card components', () => {
  for (const f of readdirSync(__dirname).filter((x) => x.endsWith('.tsx') && !x.endsWith('.test.tsx'))) {
    expect(readFileSync(join(__dirname, f), 'utf8'), f).not.toMatch(/backdrop-blur|backdrop-filter|framer-motion/);
  }
});
