// Scene Packs (lane 3 W2) — the bridge from approved `scene` Creator Cards to the quiz core's QuizPack. Pure.
import type { QuizPack, QuizQuestion } from '../core/QuizCore';
import type { SceneQuestion } from '@/lib/creator/creative-card-types';

export interface SceneCardLike { id: string; title: string; ownerId: string; art: { kind: 'scene'; venueId: string; cameraPath: string; questions: SceneQuestion[]; freeUse?: boolean } }

/** One approved scene card → one QuizPack; option ids are positional so the core's shuffle still works. */
export function packFromSceneCard(card: SceneCardLike): QuizPack {
  const questions: QuizQuestion[] = card.art.questions.map((q, i) => ({
    id: `${card.id}_q${i}`, prompt: q.prompt, difficulty: (i % 3 + 1) as 1 | 2 | 3, sceneVenueId: card.art.venueId,
    options: q.options.map((label, k) => ({ id: `o${k}`, label })), answer: `o${q.answer}`,
    explain: undefined,
  }));
  return { id: `card_${card.id}`, title: card.title, questions };
}

/** Several cards folded into one round's pack (a friends' night), keeping every question's own venue. */
export function packFromSceneCards(cards: SceneCardLike[], title = 'Community Scenes'): QuizPack {
  return { id: `cards_${cards.map((c) => c.id).join('+').slice(0, 60)}`, title, questions: cards.flatMap((c) => packFromSceneCard(c).questions) };
}
