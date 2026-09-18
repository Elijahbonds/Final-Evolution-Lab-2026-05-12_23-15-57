import { describe, expect, it } from 'vitest';
import { packFromSceneCard, packFromSceneCards } from './scenePacks';
import { drawRound, WHO_SCENE_IT, scoreAnswer } from '../core/QuizCore';

const card = { id: 'c1', title: 'Venice night', ownerId: 'u1', art: { kind: 'scene' as const, venueId: 'basketball_dunk', cameraPath: 'sweep', questions: [
  { prompt: 'Which court?', options: ['Venice', 'Blossom', 'Orbit', 'Rooftop'] as [string, string, string, string], answer: 0 as const },
  { prompt: 'What stands behind the hoop?', options: ['Boardwalk', 'Stand', 'Wall', 'Forest'] as [string, string, string, string], answer: 0 as const },
] } };

describe('scene packs from cards', () => {
  it('maps a card to a pack the quiz core can draw from, keeping the venue on every question', () => {
    const p = packFromSceneCard(card);
    expect(p.id).toBe('card_c1'); expect(p.questions.length).toBe(2);
    expect(p.questions[0]).toMatchObject({ sceneVenueId: 'basketball_dunk', answer: 'o0' });
    expect(p.questions[0].options.map((o) => o.label)).toEqual(['Venice', 'Blossom', 'Orbit', 'Rooftop']);
    const round = drawRound(p, { ...WHO_SCENE_IT, questionsPerRound: 2 }, 7);
    expect(round.length).toBe(2);
    for (const q of round) expect(q.options.find((o) => o.id === q.answer)?.label).toBeDefined();   // the answer survives the shuffle
  });
  it('folds several cards into one round pack', () => {
    const p = packFromSceneCards([card, { ...card, id: 'c2', title: 'Karate' }]);
    expect(p.questions.length).toBe(4); expect(new Set(p.questions.map((q) => q.id)).size).toBe(4);
  });
  it('speed still pays through the shared scorer', () => {
    expect(scoreAnswer(WHO_SCENE_IT, true, WHO_SCENE_IT.timeLimit, 0).points).toBe(240);
    expect(scoreAnswer(WHO_SCENE_IT, true, 0, 0).points).toBe(120);
    expect(scoreAnswer(WHO_SCENE_IT, false, 5, 3)).toEqual({ points: 0, streak: 0, multiplier: 1 });
  });
});
