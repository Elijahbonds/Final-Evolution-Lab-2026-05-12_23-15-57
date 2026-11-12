// PLAT-P04 (2026-10-27): Learn is one home. Continue is one tap back into your lesson; the Playbook's chapters, Practice,
// the feed and the Academy follow; /education lands here; the menu has one Learn door.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CHAPTERS, lessonId } from '@/lib/education/course';
import { DOORS } from '@/lib/nav/doors';
import { TOPICS } from '@/lib/knowledge/topics';
import { LearnHome, LEARN_HERO_IMAGE } from './learn-home';
import { continueTarget, lessonHref, LEARN_FEED_PATH } from './continue';
import { practiceRows } from './practice';
import { TopicPicker } from './topic-picker';

const NONE = new Set<string>();

describe('Continue: one tap back into your lesson', () => {
  it('the lesson you were last in, first', () => {
    const t = continueTarget({ last: { chapter: 6, lesson: 'the-safe-landing-check', at: 1 }, done: NONE, signedIn: true, feedStarted: true });
    expect(t.kind).toBe('last');
    expect(t.href).toBe('/education/playbook/6?lesson=the-safe-landing-check');
    expect(t.cta).toBe('Continue');
  });

  it('signed in with no marker: the first lesson the course says is not done', () => {
    const ch1 = CHAPTERS[0];
    const done = new Set(ch1.lessons.map((l) => lessonId(1, l.key)));
    const t = continueTarget({ last: null, done, signedIn: true, feedStarted: false });
    expect(t.kind).toBe('progress');
    expect(t.href).toBe(lessonHref(2, CHAPTERS[1].lessons[0].key));
  });

  it('a guest who has used the feed: back into the feed; nobody yet: chapter 1', () => {
    expect(continueTarget({ last: null, done: NONE, signedIn: false, feedStarted: true }).href).toBe(LEARN_FEED_PATH);
    const t = continueTarget({ last: null, done: NONE, signedIn: false, feedStarted: false });
    expect(t.kind).toBe('start');
    expect(t.href).toBe(lessonHref(1, CHAPTERS[0].lessons[0].key));
  });

  it('a marker for a lesson the book lost falls back, never to a dead link', () => {
    expect(continueTarget({ last: { chapter: 6, lesson: 'gone', at: 1 }, done: NONE, signedIn: false, feedStarted: false }).kind).toBe('start');
  });
});

describe('the Learn home, top to bottom', () => {
  const html = renderToStaticMarkup(createElement(LearnHome));
  const at = (s: string) => html.indexOf(s);

  it('Continue, the Playbook, Practice, the feed, then the Academy', () => {
    const order = ['data-testid="learn-continue"', 'data-learn-playbook', 'data-learn-practice', 'data-learn-feed-door', 'data-learn-academy'].map(at);
    expect(order.every((x) => x > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('one primary, and it is Continue', () => {
    expect((html.match(/data-fel-primary/g) ?? []).length).toBe(1);
    const a = /<a [^>]*data-testid="learn-continue"[^>]*>/.exec(html)?.[0] ?? '';
    expect(a).toMatch(/href="\/education\/playbook\/1\?lesson=[^"]+"/);
  });

  it('ten chapter rings, each a door to its chapter', () => {
    for (const c of CHAPTERS) expect(html).toContain(`href="/education/playbook/${c.number}" data-learn-chapter="${c.number}"`);
    expect((html.match(/data-fel-ring/g) ?? []).length).toBe(CHAPTERS.length);
  });

  it('Practice opens the lessons that teach a camera check or a drill', () => {
    const rows = practiceRows();
    expect(rows.length).toBeGreaterThanOrEqual(8);
    for (const r of rows) expect(html).toContain(`href="${r.href.replace(/&/g, '&amp;')}"`);
  });

  it('the feed has its own page, and a guest is offered the Academy by sign-in', () => {
    expect(html).toContain(`href="${LEARN_FEED_PATH}"`);
    expect(html).toContain('data-testid="learn-academy-signin"');
  });

  it('the hero picture is the owner\'s own, credited (public/brand)', () => {
    expect(LEARN_HERO_IMAGE.startsWith('/brand/')).toBe(true);
    expect(readFileSync(`public${LEARN_HERO_IMAGE}`).length).toBeGreaterThan(1000);
    expect(readFileSync('lib/credits/credits.ts', 'utf8')).toMatch(/covers: \['brand\/'\]/);
  });

  it('the page asks no server for anything new: the course\'s own progress route only', () => {
    const src = readFileSync('components/learn/learn-home.tsx', 'utf8');
    expect([...src.matchAll(/fetch\(\s*['"`]([^'"`]+)/g)].map((m) => m[1])).toEqual(['/api/education/playbook']);
  });
});

describe('three doors become one', () => {
  it('/education redirects to /learn, and the feed lives at /learn/feed', () => {
    expect(readFileSync('app/education/page.tsx', 'utf8')).toMatch(/redirect\('\/learn'\)/);
    expect(readFileSync('app/learn/feed/page.tsx', 'utf8')).toMatch(/<LearnFeed \/>/);
    expect(readFileSync('app/learn/page.tsx', 'utf8')).toMatch(/<LearnHome \/>/);
  });

  it('the menu has one Learn door and no Education door', () => {
    expect(DOORS.filter((d) => d.href === '/learn' || d.href.startsWith('/education'))).toEqual([{ href: '/learn', label: 'Learn', tab: 'train' }]);
  });
});

describe('the feed\'s topics: the Playbook first, the rest under More topics', () => {
  it('assumption: every pack stays on offer, the Playbook leads', () => {
    const html = renderToStaticMarkup(createElement(TopicPicker, { topics: TOPICS, initial: [], onDone: () => {} }));
    expect(html.indexOf('data-topic="playbook"')).toBeLessThan(html.indexOf('data-topic="psychology"'));
    expect(html.indexOf('More topics')).toBeGreaterThan(html.indexOf('data-topic="playbook"'));
    expect(html.indexOf('More topics')).toBeLessThan(html.indexOf('data-topic="psychology"'));
    expect((html.match(/data-topic="/g) ?? []).length).toBe(TOPICS.length);
  });
});
