// Knowledge Feed — the card schema (KNOWLEDGE-FEED v1, owner request 2026-10-06; docs/KNOWLEDGE-FEED.md).
//
// The content is static JSON (lib/knowledge/packs/*.json), one pack per topic, validated by lib/knowledge/validate.ts
// on every test run. No media URLs: every visual is a small description that components/learn/card-visual.tsx draws
// in SVG/CSS, so a card can never 404 and a pack can never carry a tracking pixel.
//
// Pure types only — imported by the scheduler, the validator, the feed and the idle card alike.

export const TOPIC_IDS = [
  'psychology', 'money', 'history', 'science', 'health', 'productivity',
  'philosophy', 'language', 'tech', 'art', 'nature', 'space', 'playbook',
] as const;
export type TopicId = (typeof TOPIC_IDS)[number];

/** The emblems card-visual.tsx can draw. A pack naming anything else fails validation. */
export const MOTIFS = [
  'brain', 'coin', 'column', 'atom', 'heart', 'clock', 'scale', 'quote', 'chip', 'note', 'leaf', 'planet', 'book',
  'wheel', 'perspective', 'thirds',
] as const;
export type MotifId = (typeof MOTIFS)[number];

export interface Topic {
  id: TopicId;
  label: string;
  blurb: string;
  accent: string;
  motif: MotifId;
  /** Health and money topics carry a standing "educational, not advice" line under every card. */
  notAdvice?: 'medical' | 'financial';
  /** Shown only to a signed-in player (the Playbook is behind sign-in at /education, so it is here too). */
  signedInOnly?: boolean;
}

export type Visual =
  | { kind: 'stat'; value: string; caption: string }
  | { kind: 'bars'; items: { label: string; value: number }[]; unit?: string; caption?: string }
  | { kind: 'compare'; left: { label: string; text: string }; right: { label: string; text: string } }
  | { kind: 'cycle'; steps: string[] }
  | { kind: 'timeline'; points: { at: string; label: string }[] }
  | { kind: 'motif'; motif: MotifId };

interface CardBase {
  /** `<topic>.<slug>` — unique across every pack. Progress is keyed by it, so never rename a shipped id. */
  id: string;
  topic: TopicId;
  /** A textbook-level reference description (author, title, year) — never a URL. */
  source: string;
}

export interface LessonCard extends CardBase {
  type: 'lesson';
  headline: string;
  lines: string[];
  visual: Visual;
}

export interface QuizCard extends CardBase {
  type: 'quiz';
  question: string;
  options: string[];
  /** Index into `options` as authored. The feed shows them in a seeded order (lib/knowledge/quiz.ts). */
  answer: number;
  why: string;
}

export interface FactCard extends CardBase {
  type: 'fact';
  headline: string;
  text: string;
  visual?: Visual;
}

export interface RecapCard extends CardBase {
  type: 'recap';
  headline: string;
  points: string[];
}

export interface DeeperStep {
  headline: string;
  lines: string[];
  visual?: Visual;
}

export interface DeeperCard extends CardBase {
  type: 'deeper';
  headline: string;
  steps: DeeperStep[];
}

export type Card = LessonCard | QuizCard | FactCard | RecapCard | DeeperCard;
export type CardType = Card['type'];

export interface Pack {
  topic: TopicId;
  version: number;
  cards: Card[];
}
