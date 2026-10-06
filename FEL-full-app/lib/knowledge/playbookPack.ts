// The Playbook topic — the game's own training knowledge, built from the imported book, never retyped.
//
// lib/education/course.ts holds the rule this follows: "The content is imported, never retyped … a paraphrase is
// where a wrong number gets in." So every line on these cards is the book's own text from playbook.data.json (the
// chapter's "What to Remember" items, and two chapter theses), only broken into lines that fit a phone card. A
// revision of the book is re-imported and this pack follows it.
//
// No quiz cards: a question about the owner's book would be our paraphrase of it. Writing those is an owner decision
// (docs/KNOWLEDGE-FEED.md).

import { CHAPTERS, PLAYBOOK, type Chapter } from '@/lib/education/course';
import { LIMITS } from './validate';
import type { LessonCard, Pack, RecapCard } from './types';

/** Chapters whose thesis is a teaching line rather than an anecdote opener, and which have no recap of their own. */
const THESIS_CHAPTERS = [5, 8];

const BREAKS = [' — ', '; ', ': ', ', '];

function sentences(text: string): string[] {
  const t = text.replace(/^\s*\d+\.\s*/, '').trim();
  return (t.match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? [t]).map((s) => s.trim()).filter(Boolean);
}

/** Split one piece of text at the break nearest its middle. The words are untouched; only a line break is added. */
function splitNearMiddle(s: string): [string, string] | null {
  let best = -1;
  let bestLen = 0;
  for (const b of BREAKS) {
    let i = s.indexOf(b);
    while (i > 0) {
      if (best < 0 || Math.abs(i - s.length / 2) < Math.abs(best - s.length / 2)) { best = i; bestLen = b.length; }
      i = s.indexOf(b, i + 1);
    }
  }
  if (best < 0) return null;
  const sep = s.slice(best, best + bestLen).trim();
  const head = sep === '—' ? s.slice(0, best).trim() : (s.slice(0, best) + sep).trim();
  const tail = (sep === '—' ? '— ' : '') + s.slice(best + bestLen).trim();
  return [head, tail];
}

/** The book's words as 2–4 card lines, each within the card limit. */
export function toCardLines(text: string): string[] {
  let lines = sentences(text);
  // long sentences break at a dash, semicolon, colon or comma
  for (let pass = 0; pass < 3; pass++) {
    const out: string[] = [];
    for (const l of lines) {
      const cut = l.length > LIMITS.line ? splitNearMiddle(l) : null;
      if (cut) out.push(...cut); else out.push(l);
    }
    lines = out;
  }
  if (lines.length === 1) {
    const cut = splitNearMiddle(lines[0]);
    if (cut) lines = cut;
  }
  while (lines.length > LIMITS.linesMax) {
    // fold the two shortest neighbours together rather than drop a word
    let k = 0;
    for (let i = 1; i < lines.length - 1; i++) if (lines[i].length + lines[i + 1].length < lines[k].length + lines[k + 1].length) k = i;
    lines.splice(k, 2, `${lines[k]} ${lines[k + 1]}`);
  }
  return lines;
}

function rememberItems(ch: Chapter): string[] {
  return ch.remember.map((r) => r.trim()).filter(Boolean);
}

const sourceFor = (ch: Chapter, what: string) => `${PLAYBOOK.source}, ch. ${ch.number} '${ch.title}', ${what}.`;

export function buildPlaybookPack(chapters: Chapter[] = CHAPTERS): Pack {
  const cards: (LessonCard | RecapCard)[] = [];
  const recapPoints: string[] = [];
  const recapChapters = new Set<number>();   // one takeaway per chapter, so the recap spans the book

  for (const ch of chapters) {
    rememberItems(ch).forEach((item, i) => {
      const lines = toCardLines(item);
      if (lines.length < LIMITS.linesMin || lines.some((l) => l.length > LIMITS.line)) return;   // never a card that overflows
      cards.push({
        id: `playbook.ch${ch.number}-remember-${i + 1}`,
        topic: 'playbook',
        type: 'lesson',
        headline: ch.title.slice(0, LIMITS.headline),
        lines,
        visual: { kind: 'motif', motif: 'book' },
        source: sourceFor(ch, 'What to Remember'),
      });
      const first = sentences(item)[0];
      if (first && first.length <= LIMITS.recapPoint && recapPoints.length < LIMITS.recapMax && !recapChapters.has(ch.number)) {
        recapPoints.push(first);
        recapChapters.add(ch.number);
      }
    });
    if (THESIS_CHAPTERS.includes(ch.number) && ch.thesis) {
      const lines = toCardLines(ch.thesis);
      if (lines.length >= LIMITS.linesMin && lines.every((l) => l.length <= LIMITS.line)) {
        cards.push({
          id: `playbook.ch${ch.number}-thesis`,
          topic: 'playbook',
          type: 'lesson',
          headline: ch.title.slice(0, LIMITS.headline),
          lines,
          visual: { kind: 'motif', motif: 'book' },
          source: sourceFor(ch, 'chapter opening'),
        });
      }
    }
  }

  if (recapPoints.length >= LIMITS.recapMin) {
    cards.push({
      id: 'playbook.recap',
      topic: 'playbook',
      type: 'recap',
      headline: 'The Playbook: the takeaways',
      points: recapPoints,
      source: `${PLAYBOOK.source}, the chapters' What to Remember lists.`,
    });
  }
  return { topic: 'playbook', version: 1, cards };
}
