// lib/pipelines/feedCommunity.ts — PIPELINES (owner, 2026-10-06, "writing home = both: Knowledge Feed Community topic +
// Story shelf"; teens may read approved community writing): approved writing cards as Knowledge Feed fact cards. Pure.
//
// lane/knowledge-feed holds lib/knowledge/** (not on this branch). Its FactCard is {id, topic, source, type:'fact',
// headline, text, visual?} and its rules are strict: NO URLs anywhere (a card can never 404 or carry a tracking pixel),
// `source` is a plain reference line, never a link, and every visual is drawn in SVG/CSS from a motif id. So a community
// read becomes a fact card whose source credits the creator ("by <name> — FEL Creator Card"), whose text is the excerpt
// with any URL removed, and whose visual is the 'book' motif. Its id is `community.<cardId>` (stable: progress is keyed
// by it). The ROUTED part (knowledge-feed): add 'community' to TOPIC_IDS with a Topic entry, and feed it
//   (await fetchCommunity('reads')).map(feedCardOf)
// next to the static packs. The shape here mirrors FactCard structurally so it type-checks there unchanged.

import type { ReadEntry } from './community';

export const COMMUNITY_TOPIC = 'community' as const;
export const FEED_TEXT_MAX = 280;
export const FEED_HEADLINE_MAX = 60;

export interface CommunityFeedCard {
  id: string;
  topic: typeof COMMUNITY_TOPIC;
  type: 'fact';
  /** The creator line. Never a URL (the feed's own rule). */
  source: string;
  headline: string;
  text: string;
  visual: { kind: 'motif'; motif: 'book' };
}

const URLISH = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|app|gg|ly|co)(?:\/\S*)?/gi;

/** Text with every link-looking run removed and whitespace tidied. */
export const stripUrls = (t: string): string => t.replace(URLISH, '').replace(/[ \t]{2,}/g, ' ').replace(/\s+\n/g, '\n').trim();

export function feedCardOf(r: ReadEntry): CommunityFeedCard | null {
  const text = stripUrls(r.excerpt).slice(0, FEED_TEXT_MAX);
  const headline = stripUrls(r.title).slice(0, FEED_HEADLINE_MAX);
  if (!text || !headline) return null;
  const by = stripUrls(r.creator.name) || 'a FEL creator';
  return {
    id: `community.${r.cardId}`, topic: COMMUNITY_TOPIC, type: 'fact',
    source: `by ${by} — FEL Creator Card`, headline, text, visual: { kind: 'motif', motif: 'book' },
  };
}

export const feedCardsOf = (reads: readonly ReadEntry[]): CommunityFeedCard[] =>
  reads.map(feedCardOf).filter((c): c is CommunityFeedCard => c !== null);
