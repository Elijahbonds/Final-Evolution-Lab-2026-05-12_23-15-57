import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CARDS } from './catalog';
import { PLAYBOOK } from '@/lib/education/course';

// KNOWLEDGE-FEED v2, owner decision 6 (2026-10-06): "Playbook quiz cards: draft them, the owner approves before they
// ship." docs/PLAYBOOK-QUIZ-DRAFTS.md is the draft. This guards both halves of that sentence.
const DOC = readFileSync('docs/PLAYBOOK-QUIZ-DRAFTS.md', 'utf8');
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('the Playbook quiz drafts', () => {
  const drafts = DOC.split(/^### /m).slice(1);

  it('ship NONE of them: no Playbook quiz card is in the packs until the owner approves', () => {
    expect(CARDS.filter((c) => c.topic === 'playbook' && c.type === 'quiz')).toEqual([]);
  });

  it('cover the book: about one per content section, every chapter', () => {
    expect(drafts.length).toBeGreaterThanOrEqual(80);
    for (const n of PLAYBOOK.chapters.map((c) => c.number)) expect(DOC, `chapter ${n}`).toContain(`## Chapter ${n} — `);
  });

  it('every draft has a question, four options, an answer that is one of them, and a book line', () => {
    for (const d of drafts) {
      const head = d.split('\n')[0];
      expect(d, head).toMatch(/^\*\*Q\.\*\* .+\?$/m);
      const opts = [...d.matchAll(/^- ([ABCD])\. (.+)$/gm)].map((m) => m[2]);
      expect(opts, head).toHaveLength(4);
      expect(new Set(opts).size, head).toBe(4);
      const ans = /^\*\*Answer:\*\* ([ABCD]) — (.+)$/m.exec(d);
      expect(ans, head).toBeTruthy();
      expect(opts['ABCD'.indexOf(ans![1])], head).toBe(ans![2]);
      expect(d, head).toMatch(/^> .+$/m);
    }
  });

  it('every book line is quoted exactly — it is still in the imported book, word for word', () => {
    const book = squash(PLAYBOOK.chapters.flatMap((c) => c.sections.flatMap((s) => [s.purpose, ...s.prose, ...s.steps])).join(' '));
    const quotes = drafts.map((d) => /^> (.+)$/m.exec(d)![1]);
    for (const q of quotes) expect(book.includes(squash(q)), q.slice(0, 60)).toBe(true);
  });
});
