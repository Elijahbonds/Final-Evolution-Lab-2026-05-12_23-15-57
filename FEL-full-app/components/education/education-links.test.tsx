// EDU-LINKS (2026-10-07), Mirror & coaching plan Phase 5: the education surfaces' new links and the chapter check, as the
// server renders them (the first paint). The hrefs themselves are proved to resolve in lib/education/lessonMovement.test.ts.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlaybookCard } from './playbook-card';
import { PlaybookCardLinks } from './playbook-card-links';
import { CameraLink } from './camera-link';
import { ChapterReader } from './chapter-reader';
import { CHECK_COPY, ChapterCheckView, type CheckInfo, type CheckResult } from './chapter-check';
import { chapterByNumber } from '@/lib/education/course';
import { FeedCard } from '@/components/learn/feed-card';
import { buildPlaybookPack } from '@/lib/knowledge/playbookPack';
import { CARDS } from '@/lib/knowledge/catalog';

const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const noop = () => {};

describe('the Playbook card on /education', () => {
  const h = renderToStaticMarkup(createElement(PlaybookCard));
  it('opens the course and its quick cards in the feed', () => {
    expect(h).toContain('data-playbook-card');
    expect(h).toMatch(/<a [^>]*href="\/education\/playbook"[^>]*data-playbook-open|<a [^>]*data-playbook-open[^>]*href="\/education\/playbook"/);
    expect(h).toMatch(/<a [^>]*href="\/learn"[^>]*data-playbook-feed|<a [^>]*data-playbook-feed[^>]*href="\/learn"/);
    expect(text(h)).toContain('Open the Playbook');
  });

  it('is mounted on /education', () => {
    expect(readFileSync('app/education/page.tsx', 'utf8')).toMatch(/<PlaybookCard \/>/);
  });
});

describe('a Playbook card in the Knowledge Feed', () => {
  it('links to its chapter and, when the chapter teaches a movement, to the camera', () => {
    const h = renderToStaticMarkup(createElement(PlaybookCardLinks, { cardId: 'playbook.ch8-remember-1' }));
    expect(h).toMatch(/<a [^>]*href="\/education\/playbook\/8"[^>]*data-chapter-link|<a [^>]*data-chapter-link[^>]*href="\/education\/playbook\/8"/);
    expect(h).toMatch(/href="\/play\/mirror\?pattern=hinge"[^>]*data-camera-link="hinge"/);
    expect(text(h)).toContain('Read chapter 8');
    expect(text(h)).toContain('Check it on camera: Hip hinge');
  });

  it('the feed itself draws them under a Playbook card, and nothing under any other card', () => {
    const feed = (card: (typeof CARDS)[number]) => renderToStaticMarkup(createElement(FeedCard, {
      slide: { key: card.id, card, reason: 'new' as const }, picked: undefined, focus: null, onPick: noop, active: true, reduced: true,
    }));
    const ch8 = buildPlaybookPack().cards.find((c) => c.id.startsWith('playbook.ch8-'))!;
    const h = feed(ch8);
    expect(h).toContain('data-playbook-links');
    expect(h).toContain('href="/education/playbook/8"');
    expect(h).toContain('href="/play/mirror?pattern=hinge"');
    const other = CARDS.find((c) => c.topic !== 'playbook')!;
    expect(feed(other)).not.toContain('data-playbook-links');
  });

  it('a chapter with no Mirror movement gets the chapter link only; a card from another topic gets nothing', () => {
    const h = renderToStaticMarkup(createElement(PlaybookCardLinks, { cardId: 'playbook.ch9-remember-2' }));
    expect(h).toContain('href="/education/playbook/9"');
    expect(h).not.toContain('data-camera-link');
    expect(renderToStaticMarkup(createElement(PlaybookCardLinks, { cardId: 'science.atoms' }))).toBe('');
  });
});

describe('the chapter reader', () => {
  it('a lesson that teaches a Mirror movement offers "Check it on camera"', () => {
    // chapter 6 opens on "How a Jump Actually Works", which maps to the Mirror's jump
    const h = renderToStaticMarkup(createElement(ChapterReader, { chapter: chapterByNumber(6)! }));
    expect(h).toMatch(/href="\/play\/mirror\?pattern=jump"[^>]*data-camera-link="jump"/);
    const none = renderToStaticMarkup(createElement(ChapterReader, { chapter: chapterByNumber(9)! }));
    expect(none).not.toContain('data-camera-link');
  });

  it('"Next chapter" opens the next chapter; the false "kept locally" toast is gone', () => {
    const src = readFileSync('components/education/chapter-reader.tsx', 'utf8');
    expect(src).toMatch(/const next = nextChapterHref\(chapter\.number\)/);
    expect(src).toMatch(/href=\{next\}/);
    expect(src).not.toMatch(/kept locally/);
    expect(src).not.toMatch(/href="\/education\/playbook"\s*\n\s*className="mt-4/);
  });
});

describe('the chapter check, drawn', () => {
  const info: CheckInfo = {
    available: true, draft: true, passMark: 80, saves: true, passedBefore: false, worth: 15,
    questions: [
      { id: 'q-6-0', question: 'First?', options: ['a', 'b', 'c', 'd'], draft: true },
      { id: 'q-6-1', question: 'Second?', options: ['e', 'f', 'g', 'h'], draft: true },
    ],
  };
  const view = (o: Partial<{ info: CheckInfo; picked: Record<string, string>; result: CheckResult | null; error: boolean }> = {}) =>
    renderToStaticMarkup(createElement(ChapterCheckView, {
      info: o.info ?? info, picked: o.picked ?? {}, result: o.result ?? null, busy: false, error: o.error ?? false,
      onPick: noop, onSubmit: noop, onRetry: noop,
    }));

  it('says DRAFT on a draft check, the pass mark, and what a pass pays', () => {
    const t = text(view());
    expect(t).toContain(CHECK_COPY.draft);
    expect(t).toContain(CHECK_COPY.rule(80));
    expect(t).toContain(CHECK_COPY.worth(15));
    expect(view({ info: { ...info, draft: false } })).not.toContain('data-check-draft');
  });

  it('submit stays disabled until every question has an answer', () => {
    expect(view()).toMatch(/<button[^>]*disabled=""[^>]*data-check-submit/);
    expect(view({ picked: { 'q-6-0': 'a', 'q-6-1': 'f' } })).not.toMatch(/<button[^>]*disabled=""[^>]*data-check-submit/);
  });

  it('a minor (saves:false) is told the result stays on the device — no shard promise', () => {
    const t = text(view({ info: { ...info, saves: false, worth: 0 } }));
    expect(t).toContain(CHECK_COPY.device);
    expect(t).not.toContain('A pass pays');
  });

  it('a fail says nothing is paid and offers a retry; a pass shows what was paid', () => {
    const fail: CheckResult = { score: 50, passed: false, correct: 1, total: 2, passMark: 80, awarded: 0, bonus: 0,
      results: [{ id: 'q-6-0', correct: true }, { id: 'q-6-1', correct: false }] };
    const f = view({ result: fail });
    expect(f).toContain('data-check-result="fail"');
    expect(text(f)).toContain(CHECK_COPY.fail(50, 80));
    expect(f).toContain('data-check-retry');
    expect(f).toMatch(/data-check-question="q-6-1" data-verdict="wrong"/);
    expect(f).not.toContain('data-check-awarded');
    const pass = view({ result: { ...fail, score: 100, passed: true, correct: 2, awarded: 15, bonus: 50 } });
    expect(pass).toContain('data-check-result="pass"');
    expect(text(pass)).toContain('+15 shards');
    expect(text(pass)).toContain('+ 50 for finishing the Playbook');
  });
});

describe('CameraLink', () => {
  it('is a plain anchor (no prefetch of the camera page) to the movement', () => {
    const h = renderToStaticMarkup(createElement(CameraLink, { movement: 'pushup' }));
    expect(h).toMatch(/^<a href="\/play\/mirror\?pattern=pushup"/);
    expect(text(h)).toBe('Check it on camera: Push-up');
  });
});
