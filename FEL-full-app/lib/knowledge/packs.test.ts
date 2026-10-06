import { describe, expect, it } from 'vitest';
import { AUTHORED_PACKS, CARDS, PACKS } from './catalog';
import { buildPlaybookPack, toCardLines } from './playbookPack';
import { TOPICS } from './topics';
import { CHAPTERS } from '@/lib/education/course';
import { cardErrors, catalogErrors, LIMITS, packErrors } from './validate';
import { TOPIC_IDS, type Card, type Pack } from './types';

describe('the Knowledge Feed packs', () => {
  it('every pack passes the validator (ids unique, answers valid, lengths within card limits)', () => {
    expect(catalogErrors(PACKS)).toEqual([]);
  });

  it('has a pack for every topic, and every topic in the picker', () => {
    expect(PACKS.map((p) => p.topic).sort()).toEqual([...TOPIC_IDS].sort());
    expect(TOPICS.map((t) => t.id).sort()).toEqual([...TOPIC_IDS].sort());
  });

  it('carries at least 15 cards per authored topic and at least 180 authored cards', () => {
    for (const p of AUTHORED_PACKS) expect(p.cards.length, p.topic).toBeGreaterThanOrEqual(15);
    expect(AUTHORED_PACKS.reduce((n, p) => n + p.cards.length, 0)).toBeGreaterThanOrEqual(180);
  });

  it('gives every authored topic all five card types', () => {
    for (const p of AUTHORED_PACKS) {
      const types = new Set(p.cards.map((c) => c.type));
      expect([...types].sort(), p.topic).toEqual(['deeper', 'fact', 'lesson', 'quiz', 'recap']);
    }
  });

  it('spreads quiz answers across positions (the feed shuffles, but the authoring should not lean on one slot)', () => {
    const quizzes = CARDS.filter((c): c is Extract<Card, { type: 'quiz' }> => c.type === 'quiz');
    expect(quizzes.length).toBeGreaterThanOrEqual(60);
    const at0 = quizzes.filter((q) => q.answer === 0).length;
    expect(at0 / quizzes.length).toBeLessThan(0.6);
  });

  it('no card carries a URL or a medical/financial instruction to the reader', () => {
    for (const c of CARDS) {
      const text = JSON.stringify(c);
      expect(text, c.id).not.toMatch(/https?:\/\//);
      expect(text, c.id).not.toMatch(/\byou should (buy|sell|invest|take|stop taking)\b/i);
    }
  });
});

describe('the validator catches what it claims to', () => {
  const lesson: Card = {
    id: 'science.x', topic: 'science', type: 'lesson', headline: 'A headline', lines: ['one line', 'two lines'],
    visual: { kind: 'motif', motif: 'atom' }, source: 'A textbook.',
  };
  const quiz: Card = {
    id: 'science.q', topic: 'science', type: 'quiz', question: 'Q?', options: ['a', 'b', 'c'], answer: 1, why: 'Because.', source: 'A textbook.',
  };

  it('passes good cards', () => {
    expect(cardErrors(lesson)).toEqual([]);
    expect(cardErrors(quiz)).toEqual([]);
  });

  it('rejects an answer index that points at nothing', () => {
    expect(cardErrors({ ...quiz, answer: 3 } as Card).join()).toMatch(/answer 3/);
    expect(cardErrors({ ...quiz, answer: -1 } as Card).join()).toMatch(/answer -1/);
  });

  it('rejects duplicate options, too many options, and an over-long line', () => {
    expect(cardErrors({ ...quiz, options: ['a', 'A', 'c'] } as Card).join()).toMatch(/duplicate options/);
    expect(cardErrors({ ...quiz, options: ['a', 'b', 'c', 'd', 'e'] } as Card).join()).toMatch(/options/);
    expect(cardErrors({ ...lesson, lines: ['x'.repeat(LIMITS.line + 1), 'ok'] } as Card).join()).toMatch(/chars/);
  });

  it('rejects a lesson with one line or no visual, an unknown motif, and a URL', () => {
    expect(cardErrors({ ...lesson, lines: ['only one'] } as Card).join()).toMatch(/lines/);
    expect(cardErrors({ ...lesson, visual: undefined } as unknown as Card).join()).toMatch(/needs a visual/);
    expect(cardErrors({ ...lesson, visual: { kind: 'motif', motif: 'dragon' } } as unknown as Card).join()).toMatch(/unknown motif/);
    expect(cardErrors({ ...lesson, source: 'see https://example.com' } as Card).join()).toMatch(/URL/);
  });

  it('rejects an id whose prefix is not its topic, and duplicate ids across packs', () => {
    expect(cardErrors({ ...lesson, id: 'money.x' } as Card).join()).toMatch(/prefix/);
    const a: Pack = { topic: 'science', version: 1, cards: [lesson] };
    const b: Pack = { topic: 'science', version: 1, cards: [lesson] };
    expect(catalogErrors([a, b]).join()).toMatch(/duplicate id/);
    expect(packErrors({ topic: 'money', version: 1, cards: [lesson] }).join()).toMatch(/in the money pack/);
  });
});

describe('the Playbook pack is the book, not a paraphrase', () => {
  const pack = buildPlaybookPack();

  it('builds lesson cards from every chapter recap, and they validate', () => {
    expect(packErrors(pack)).toEqual([]);
    const withRecap = CHAPTERS.filter((c) => c.remember.length > 0);
    expect(withRecap.length).toBeGreaterThan(5);
    expect(pack.cards.filter((c) => c.type === 'lesson').length).toBeGreaterThanOrEqual(15);
  });

  it('every word on a Playbook card appears in the book in the same order', () => {
    const squash = (s: string) => s.replace(/^\s*\d+\.\s*/, '').replace(/\s+/g, ' ').trim();
    const bookText = CHAPTERS.flatMap((c) => [...c.remember, c.thesis]).map(squash);
    for (const c of pack.cards) {
      if (c.type !== 'lesson') continue;
      const joined = squash(c.lines.join(' ')).replace(/\s+—\s+/g, ' — ');
      expect(bookText.some((t) => t.replace(/\s+—\s+/g, ' — ') === joined || t.includes(joined)), c.id).toBe(true);
    }
  });

  it('breaks a long sentence at a natural pause without losing words', () => {
    const s = 'Protect the athlete with red flags and good questions — pain normalization, skipped prep, in-season overload, early specialization, lost joy, and late-session form collapse all demand a conversation.';
    const lines = toCardLines(s);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(LIMITS.line);
    expect(lines.join(' ').replace(/\s+/g, ' ')).toBe(s);
  });
});
