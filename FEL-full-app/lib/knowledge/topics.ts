// The topic list the "What do you want to learn?" picker offers. Twelve broad topics written for the feed, plus the
// game's own training knowledge — the Playbook's chapter recaps, read straight from the imported book
// (lib/knowledge/playbookPack.ts), never retyped.

import type { Topic, TopicId } from './types';

export const TOPICS: Topic[] = [
  { id: 'psychology', label: 'Psychology', blurb: 'How minds remember, decide and form habits', accent: '#C58BFF', motif: 'brain' },
  { id: 'money', label: 'Money', blurb: 'Interest, inflation, markets — how money works', accent: '#FFD166', motif: 'coin', notAdvice: 'financial' },
  { id: 'history', label: 'History', blurb: 'The turning points that made today', accent: '#E8A87C', motif: 'column' },
  { id: 'science', label: 'Science', blurb: 'Atoms, energy, DNA and how we know', accent: '#4FD1E8', motif: 'atom' },
  { id: 'health', label: 'Health & sport science', blurb: 'Sleep, muscles, energy and recovery', accent: '#FF6A5B', motif: 'heart', notAdvice: 'medical' },
  { id: 'productivity', label: 'Productivity', blurb: 'Focus, planning and habits that stick', accent: '#7CE577', motif: 'clock' },
  { id: 'philosophy', label: 'Philosophy', blurb: 'Big questions and how to think them through', accent: '#B8C0FF', motif: 'scale' },
  { id: 'language', label: 'Language & words', blurb: 'Where words come from and how language works', accent: '#F4A3C0', motif: 'quote' },
  { id: 'tech', label: 'Tech & AI', blurb: 'Bits, algorithms and how machines learn', accent: '#00E5FF', motif: 'chip' },
  { id: 'art', label: 'Art & music', blurb: 'Colour, perspective, rhythm and harmony', accent: '#FF9F43', motif: 'note' },
  { id: 'nature', label: 'Nature', blurb: 'Ecosystems, animals and the living planet', accent: '#3DDC97', motif: 'leaf' },
  { id: 'space', label: 'Space', blurb: 'Planets, stars and the scale of it all', accent: '#8EA8FF', motif: 'planet' },
  // IMPROVE (2026-10-06), owner decision 5: guests see the first PLAYBOOK_GUEST_CARDS Playbook cards, sign in for all
  { id: 'playbook', label: 'Training — The Playbook', blurb: "The Neuro-Mechanic Playbook's chapter takeaways", accent: '#00FF9D', motif: 'book', guestPreview: 5 },
];

const BY_ID = new Map(TOPICS.map((t) => [t.id, t]));

/** The picker's blurb for this viewer: a guest is told how much of a preview topic they get. */
export function topicBlurb(t: Topic, signedIn: boolean): string {
  return !signedIn && t.guestPreview !== undefined ? `First ${t.guestPreview} cards free — sign in for the whole book` : t.blurb;
}

export function topicById(id: TopicId): Topic {
  const t = BY_ID.get(id);
  if (!t) throw new Error(`unknown topic ${id}`);
  return t;
}

/** The topics a viewer may pick. Every topic today: the Playbook is open to guests as a 5-card preview (access.ts). */
export function availableTopics(signedIn: boolean): Topic[] {
  return TOPICS.filter((t) => signedIn || !t.signedInOnly);
}

export const NOT_ADVICE_LINE: Record<NonNullable<Topic['notAdvice']>, string> = {
  medical: 'Educational only — not medical advice.',
  financial: 'Educational only — not financial advice.',
};
