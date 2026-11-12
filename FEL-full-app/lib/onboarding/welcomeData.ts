// welcomeData — what /welcome reads on the server, so the client bundle does not carry the knowledge catalogue.
import { cardsForTopic } from '@/lib/knowledge/catalog';
import type { Card } from '@/lib/knowledge/types';

type LessonCard = Extract<Card, { type: 'lesson' }>;

/** learn's first win: the Playbook topic's first lesson card — the first card the feed shows, guests included. */
export function firstPlaybookCard(): LessonCard | null {
  const c = cardsForTopic('playbook').find((x): x is LessonCard => x.type === 'lesson');
  return c ?? null;
}
