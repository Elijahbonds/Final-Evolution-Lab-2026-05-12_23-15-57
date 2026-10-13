// QA P1-21 (2026-09-27): "the round chip says COMBAT on a Free Run question with no correct answer". The live pack
// (WHO_SCENE_IT_PACK) has no Free Run question, and the chip and the question are read from the same round (BuzzMatch.round
// / .question), so the deal itself is pinned here: every question has exactly one right option among its choices, its
// venue has a spec to render, and across many seeds every question is dealt under its own category's chip. What the
// COMBAT round's scene looks like on screen (karate_endless, "Shadow Gauntlet") is left for the live check.
import { describe, expect, it } from 'vitest';
import { WHO_SCENE_IT_PACK } from '../content/quizPacks';
import { VENUE_SPECS } from '../nexus/venueSpecs';
import { BuzzMatch, buildRounds, categoryOf, splitSceneVenue } from './SceneBuzz';
import { COMBAT_MODE_IDS, arenasFor } from '../combat/arenas';

describe('Who Scene It: the deal', () => {
  it('every question has exactly one correct option, among distinct choices', () => {
    for (const q of WHO_SCENE_IT_PACK.questions) {
      expect(q.options.filter((o) => o.id === q.answer), q.id).toHaveLength(1);
      expect(new Set(q.options.map((o) => o.id)).size, q.id).toBe(q.options.length);
    }
  });

  it('every question\'s scene exists and names the right answer', () => {
    // the release's arena questions (IMPROVE 2026-10-06, #11): `karate_h2h@cage` is a venue spec dressed as a combat arena,
    // and its right answer is the arena's name
    const arenas = COMBAT_MODE_IDS.flatMap((m) => arenasFor(m));
    for (const q of WHO_SCENE_IT_PACK.questions) {
      const { venueId, arenaId } = splitSceneVenue(q.sceneVenueId ?? '');
      const spec = (VENUE_SPECS as Record<string, { venue?: string }>)[venueId];
      expect(spec, q.id).toBeDefined();
      const shown = arenaId ? arenas.find((a) => a.id === arenaId)?.name : spec!.venue;
      expect(shown, q.id).toBeDefined();
      expect(q.options.find((o) => o.id === q.answer)?.label, q.id).toBe(shown);
      expect(categoryOf(q.sceneVenueId), q.id).not.toBeNull();
    }
  });

  it('across 50 seeds, each question is dealt under its own category\'s chip, and the match reads chip and question from one round', () => {
    for (let seed = 1; seed <= 50; seed++) {
      for (const r of buildRounds(WHO_SCENE_IT_PACK, seed)) {
        for (const q of r.questions) {
          expect(categoryOf(q.sceneVenueId)?.id).toBe(r.category.id);
          expect(q.options.filter((o) => o.id === q.answer)).toHaveLength(1);   // the option shuffle keeps the answer
        }
      }
    }
    const m = new BuzzMatch(buildRounds(WHO_SCENE_IT_PACK, 7), 1);
    for (let i = 0; i < 40 && m.question; i++) {
      expect(m.round!.questions).toContain(m.question);
      if (m.advance() === 'match') break;
    }
  });
});
