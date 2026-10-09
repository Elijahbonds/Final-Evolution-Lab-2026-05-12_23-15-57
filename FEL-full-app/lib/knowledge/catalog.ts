// The whole catalogue: the twelve authored packs plus the Playbook pack built from the imported book.
// Imported lazily by the idle card (components/learn/learn-while-you-wait.tsx) so the game routes don't carry it.

import psychology from './packs/psychology.json';
import money from './packs/money.json';
import history from './packs/history.json';
import science from './packs/science.json';
import health from './packs/health.json';
import productivity from './packs/productivity.json';
import philosophy from './packs/philosophy.json';
import language from './packs/language.json';
import tech from './packs/tech.json';
import art from './packs/art.json';
import nature from './packs/nature.json';
import space from './packs/space.json';
import { buildPlaybookPack } from './playbookPack';
import type { Card, Pack, TopicId } from './types';

export const AUTHORED_PACKS: Pack[] = [
  psychology, money, history, science, health, productivity, philosophy, language, tech, art, nature, space,
] as unknown as Pack[];

export const PACKS: Pack[] = [...AUTHORED_PACKS, buildPlaybookPack()];

export const CARDS: Card[] = PACKS.flatMap((p) => p.cards);

const BY_ID = new Map(CARDS.map((c) => [c.id, c]));

export function cardById(id: string): Card | undefined {
  return BY_ID.get(id);
}

export function cardsForTopic(topic: TopicId): Card[] {
  return CARDS.filter((c) => c.topic === topic);
}
