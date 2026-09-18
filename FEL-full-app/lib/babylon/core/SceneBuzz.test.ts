import { describe, it, expect } from 'vitest';
import { SCENE_CATEGORIES, categoryOf, buildRounds, BuzzMatch } from './SceneBuzz';
import { WHO_SCENE_IT, type QuizPack } from './QuizCore';
import { WHO_SCENE_IT_PACK } from '../content/quizPacks';

describe('scene categories and rounds', () => {
  it('four categories cover every venue the pack asks about, with no venue in two', () => {
    expect(SCENE_CATEGORIES).toHaveLength(4);
    const all = SCENE_CATEGORIES.flatMap((c) => c.venueIds);
    expect(new Set(all).size).toBe(all.length);
    for (const q of WHO_SCENE_IT_PACK.questions) expect(categoryOf(q.sceneVenueId)).not.toBeNull();
    expect(categoryOf(undefined)).toBeNull();
    expect(categoryOf('nope')).toBeNull();
  });

  it('builds one round per category with questions, repeatable by seed, options shuffled', () => {
    const a = buildRounds(WHO_SCENE_IT_PACK, 7, 2);
    const b = buildRounds(WHO_SCENE_IT_PACK, 7, 2);
    expect(a.map((r) => r.category.id)).toEqual(b.map((r) => r.category.id));
    expect(a.length).toBe(4);
    for (const r of a) {
      expect(r.questions.length).toBeGreaterThan(0);
      expect(r.questions.length).toBeLessThanOrEqual(2);
      for (const q of r.questions) {
        expect(categoryOf(q.sceneVenueId)?.id).toBe(r.category.id);
        expect(q.options.map((o) => o.id).sort()).toEqual(
          WHO_SCENE_IT_PACK.questions.find((x) => x.id === q.id)!.options.map((o) => o.id).sort());
      }
    }
    expect(buildRounds(WHO_SCENE_IT_PACK, 8, 2).map((r) => r.category.id)).not.toEqual(a.map((r) => r.category.id));
  });

  it('skips categories the pack has nothing for', () => {
    const pack: QuizPack = { id: 'p', title: 'p', questions: WHO_SCENE_IT_PACK.questions.filter((q) => q.sceneVenueId?.startsWith('karate')) };
    const rounds = buildRounds(pack, 1, 3);
    expect(rounds.map((r) => r.category.id)).toEqual(['combat']);
  });
});

function match(players: number, seed = 3) {
  return new BuzzMatch(buildRounds(WHO_SCENE_IT_PACK, seed, 2), WHO_SCENE_IT, players);
}
const rightChoice = (m: BuzzMatch) => m.question!.options.findIndex((o) => o.id === m.question!.answer);
const wrongChoice = (m: BuzzMatch) => m.question!.options.findIndex((o) => o.id !== m.question!.answer);

describe('buzz-in match', () => {
  it('solo: a correct answer scores with speed, a wrong one ends the question', () => {
    const m = match(1);
    const r = m.answer(0, rightChoice(m), WHO_SCENE_IT.timeLimit);
    expect(r).toMatchObject({ kind: 'correct', player: 0 });
    expect(m.players[0].score).toBeGreaterThan(0);
    expect(m.answer(0, rightChoice(m), 5)).toBeNull();          // resolved: input does nothing
    expect(m.advance()).toBe('question');
    expect(m.answer(0, wrongChoice(m), 5)).toEqual({ kind: 'nobody', timeout: false });
    expect(m.players[0].streak).toBe(0);
  });

  it('two players: first correct buzz locks; a wrong buzz hands the steal to the other', () => {
    const m = match(2);
    expect(m.answer(1, wrongChoice(m), 10)).toBe('wrong');
    expect(m.isLockedOut(1)).toBe(true);
    expect(m.answer(1, rightChoice(m), 9)).toBeNull();          // out for this question
    const r = m.answer(0, rightChoice(m), 8);
    expect(r).toMatchObject({ kind: 'correct', player: 0 });
    expect(m.players[0].score).toBeGreaterThan(0);
    expect(m.players[1].score).toBe(0);
    expect(m.answer(1, rightChoice(m), 7)).toBeNull();          // locked by the resolution
  });

  it('both wrong resolves as nobody; a timeout resets the streaks of those who never buzzed', () => {
    const m = match(2);
    m.answer(0, rightChoice(m), 10); m.advance();
    expect(m.players[0].streak).toBe(1);
    expect(m.answer(0, wrongChoice(m), 9)).toBe('wrong');
    expect(m.answer(1, wrongChoice(m), 8)).toEqual({ kind: 'nobody', timeout: false });
    m.advance();
    m.answer(1, rightChoice(m), 10);                            // P2 builds a streak
    m.advance();
    expect(m.players[1].streak).toBe(1);
    expect(m.timeout()).toEqual({ kind: 'nobody', timeout: true });
    expect(m.players[1].streak).toBe(0);
    expect(m.timeout()).toBeNull();
  });

  it('the round goes to its top scorer, a scoreboard names the categories, and the match ends after the last round', () => {
    const m = match(2);
    const total = m.totalQuestions;
    let steps = 0, roundsSeen = 0;
    while (!m.finished && steps < 50) {
      // P1 answers every question fast; P2 never buzzes
      m.answer(0, rightChoice(m), WHO_SCENE_IT.timeLimit);
      const a = m.advance();
      if (a === 'round') roundsSeen++;
      steps++;
    }
    expect(steps).toBe(total);
    expect(roundsSeen).toBe(m.rounds.length - 1);
    expect(m.players[0].won).toHaveLength(m.rounds.length);
    expect(m.leader).toBe(0);
    const board = m.scoreboard();
    expect(board[0].name).toBe('P1');
    expect(board[0].line).toContain('COURTS');
    expect(board[1].line).toBe('—');
    expect(m.advance()).toBe('match');
  });

  it('question numbering runs across rounds; ties leave the category unclaimed', () => {
    const m = match(2);
    expect(m.questionNumber).toBe(1);
    m.timeout(); m.advance();
    expect(m.questionNumber).toBe(2);
    m.timeout(); expect(m.advance()).toBe('round');
    expect(m.players.every((p) => p.won.length === 0)).toBe(true);
    expect(m.leader).toBe(-1);
  });
});
