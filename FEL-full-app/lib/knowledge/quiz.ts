// Quiz presentation helpers: a stable shuffled option order (so the right answer isn't always in the slot the author
// typed it in), and the share-as-text line (no link, no handle, no social graph — just the idea).

import type { Card, QuizCard } from './types';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** The display order: a permutation of option indexes, the same every time for the same card. */
export function optionOrder(card: QuizCard): number[] {
  const order = card.options.map((_, i) => i);
  let h = hash(card.id);
  for (let i = order.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export function isCorrect(card: QuizCard, authoredIndex: number): boolean {
  return authoredIndex === card.answer;
}

/** Plain text for the system share sheet or the clipboard. */
export function shareText(card: Card): string {
  const tail = '— learned on Final Evolution Lab';
  switch (card.type) {
    case 'lesson': return `${card.headline}\n\n${card.lines.join('\n')}\n\n${tail}`;
    case 'fact': return `Did you know? ${card.headline}\n\n${card.text}\n\n${tail}`;
    case 'quiz': return `${card.question}\n\nAnswer: ${card.options[card.answer]} — ${card.why}\n\n${tail}`;
    case 'recap': return `${card.headline}\n\n${card.points.map((p) => `• ${p}`).join('\n')}\n\n${tail}`;
    case 'deeper': return `${card.headline}\n\n${card.steps.map((s) => `${s.headline}: ${s.lines.join(' ')}`).join('\n')}\n\n${tail}`;
  }
}
