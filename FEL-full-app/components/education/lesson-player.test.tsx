// PLAT-P04 (2026-10-27): the lesson player shows before it tells — the demo, the steps as short cards, the camera, and
// the book behind Read more, IN THE BOOK'S OWN WORDS. These hold the order, the card length, and the book byte for byte.
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CHAPTERS, chapterByNumber } from '@/lib/education/course';
import { BookText, ChapterReader } from './chapter-reader';
import { STEP_CARD_MAX_WORDS, SUMMARY_MAX_WORDS, cardsForStep, sentences, stepCards, summaryLine, wordCount } from './lesson-steps';
import { LAST_LESSON_KEY, parseLastLesson, readLastLesson, writeLastLesson } from './last-lesson';

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
/** The text of every element carrying `attr`, decoded, in order. */
const texts = (html: string, attr: string) => [...html.matchAll(new RegExp(`<[a-z]+ ${attr}[^>]*>([^<]*)<`, 'g'))].map((m) => decode(m[1]));
const at = (html: string, needle: string) => html.indexOf(needle);

describe('the book is the owner\'s: byte for byte', () => {
  it('playbook.data.json is the imported book, unchanged by this lane (re-import → re-pin, deliberately)', () => {
    const sha = createHash('sha256').update(readFileSync('lib/education/playbook.data.json')).digest('hex');
    expect(sha).toBe('d624ad3f2fa52fdc7b0146b191d6d85bd568e618d64846a71fddb5f33d00d6e4');
  });

  it('every lesson\'s purpose, paragraphs and trainer\'s note render behind Read more exactly as the book has them', () => {
    let n = 0;
    for (const c of CHAPTERS) for (const l of c.lessons) {
      const html = renderToStaticMarkup(createElement(BookText, { lesson: l }));
      expect(texts(html, 'data-book-para'), `${c.number}:${l.key}`).toEqual(l.prose);
      if (l.purpose) expect(texts(html, 'data-book-purpose')).toEqual([l.purpose]);
      if (l.note) expect(texts(html, 'data-book-note')).toEqual([l.note]);
      n += l.prose.length;
    }
    expect(n).toBeGreaterThan(200);
  });

  it('Read more is collapsed by default', () => {
    const html = renderToStaticMarkup(createElement(BookText, { lesson: chapterByNumber(6)!.lessons[0] }));
    expect(html).toMatch(/<details data-read-more[^>]*>/);
    expect(html).not.toMatch(/<details[^>]* open/);
  });
});

describe('step cards: the book\'s steps, at most 18 words, split only between sentences', () => {
  // The book's sentences longer than the card: shown whole, never cut or reworded (listed in the lane report).
  const OVER = ['3:the-knee-window', '5:release-the-locks', '5:pressurize-the-system', '5:prime-the-launch', '8:the-hip-hinge', '9:legs-up-the-wall'];

  it('cards reassemble each step exactly; only the listed single sentences run over', () => {
    const over: string[] = [];
    for (const c of CHAPTERS) for (const l of c.lessons) {
      l.steps.forEach((s, i) => {
        const cards = cardsForStep(s, i);
        expect(cards.map((x) => x.text).join(' '), `${c.number}:${l.key}#${i}`).toBe(s.trim().replace(/\s+/g, ' '));
        for (const x of cards) {
          if (x.over) { expect(sentences(x.text)).toHaveLength(1); over.push(`${c.number}:${l.key}`); }
          else expect(wordCount(x.text)).toBeLessThanOrEqual(STEP_CARD_MAX_WORDS);
        }
      });
    }
    expect([...new Set(over)]).toEqual(OVER);
  });

  it('sentences never split inside "e.g."', () => {
    expect(sentences('Hold it, e.g. Two seconds. Then go.')).toEqual(['Hold it, e.g. Two seconds.', 'Then go.']);
  });

  it('a summary line is the book\'s first sentence, a real one, within the paragraph limit', () => {
    for (const c of CHAPTERS) for (const l of c.lessons) {
      const s = summaryLine(l);
      if (!s) continue;
      expect(wordCount(s)).toBeLessThanOrEqual(SUMMARY_MAX_WORDS);
      expect(wordCount(s)).toBeGreaterThan(3);
      expect(l.purpose.startsWith(s) || (l.prose[0] ?? '').startsWith(s), `${c.number}:${l.key}`).toBe(true);
    }
  });
});

describe('a drill lesson shows before it tells', () => {
  const ch6 = chapterByNumber(6)!;

  it('the countermovement check: demo, then the step cards, then the camera, then Read more', () => {
    const html = renderToStaticMarkup(createElement(ChapterReader, { chapter: ch6, startAt: 'the-countermovement-geometry-check' }));
    expect(html).toContain('data-lesson-demo="ex_cmj_dip"');
    const order = ['data-lesson-demo', 'data-step-cards', 'data-camera-link', 'data-read-more'].map((a) => at(html, a));
    expect(order.every((x) => x > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const cards = stepCards(ch6.lessons.find((l) => l.key === 'the-countermovement-geometry-check')!.steps);
    expect((html.match(/data-step-card="/g) ?? []).length).toBe(cards.length);
    // one primary, on the thumb
    expect((html.match(/data-fel-primary/g) ?? []).length).toBe(1);
  });

  it('a lesson with no loop has no demo box (never a borrowed movement): the hip hinge leads with its cards', () => {
    const html = renderToStaticMarkup(createElement(ChapterReader, { chapter: chapterByNumber(8)!, startAt: 'the-hip-hinge' }));
    expect(html).not.toContain('data-lesson-demo');
    expect(html).toContain('data-step-cards');
  });

  it('a concept lesson is one line of the book, then Read more', () => {
    const ch1 = chapterByNumber(1)!;
    const html = renderToStaticMarkup(createElement(ChapterReader, { chapter: ch1 }));
    expect(texts(html, 'data-lesson-summary')).toEqual([summaryLine(ch1.lessons[0])]);
    expect(html).not.toContain('data-step-cards');
    expect(at(html, 'data-lesson-summary')).toBeLessThan(at(html, 'data-read-more'));
  });

  it('?lesson= opens that lesson; an unknown key opens the first', () => {
    expect(renderToStaticMarkup(createElement(ChapterReader, { chapter: ch6, startAt: 'the-safe-landing-check' }))).toContain('data-lesson="6:the-safe-landing-check"');
    expect(renderToStaticMarkup(createElement(ChapterReader, { chapter: ch6, startAt: 'nope' }))).toContain(`data-lesson="6:${ch6.lessons[0].key}"`);
  });
});

describe('the place-marker stays on the device', () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m }; };

  it('round-trips, and forgets a lesson the book no longer has', () => {
    const s = mem();
    writeLastLesson(s, { chapter: 6, lesson: 'the-safe-landing-check', at: 1 });
    expect(readLastLesson(s)).toEqual({ chapter: 6, lesson: 'the-safe-landing-check', at: 1 });
    expect(parseLastLesson(JSON.stringify({ chapter: 6, lesson: 'gone' }))).toBeNull();
    expect(parseLastLesson('{bad')).toBeNull();
    expect([...s.m.keys()]).toEqual([LAST_LESSON_KEY]);
  });

  it('survives blocked storage', () => {
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(readLastLesson(blocked)).toBeNull();
    expect(() => writeLastLesson(blocked, { chapter: 1, lesson: 'x', at: 0 })).not.toThrow();
  });

  it('the player sends nothing new: its only requests are the course\'s own progress route', () => {
    const src = readFileSync('components/education/chapter-reader.tsx', 'utf8');
    expect([...src.matchAll(/fetch\(\s*['"`]([^'"`]+)/g)].map((m) => m[1])).toEqual(['/api/education/playbook', '/api/education/playbook']);
  });
});
