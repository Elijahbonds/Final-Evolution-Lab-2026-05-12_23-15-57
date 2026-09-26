// End-card refusals (2026-09-26): a refused Arena score or Story node is said on the results card, in the server's own
// terms. The bodies here are built the way the routes build them — the Arena's `{ error: code, detail }` from the real
// stake check (app/api/arena/submit-score: ArenaError → `{ error: err.code, detail: err.message }`), the Story route's
// verdict from the real judge minus its flag (app/api/story/complete: `const { ok: _ok, ...refusal } = verdict`) — so a
// change of shape on either side fails here, not on a player's card. The components are rendered by React itself.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { arenaRefusal, storyRefusal, ArenaRefusedLine, StoryRefusedPanel } from './end-card-refusal';
import { checkStakeScore } from '@/lib/arena-score-integrity';
import { judgeStorySession } from '@/lib/progression';
import { getNodeById } from '@/lib/story-data';

/** The Arena route's refusal body for a stake check that failed. */
function arenaBody(input: Parameters<typeof checkStakeScore>[0]) {
  const c = checkStakeScore(input);
  if (c.ok) throw new Error('expected a refusal');
  return { error: c.code, detail: c.detail };
}
/** The Story route's 422 body: the verdict minus its `ok`. */
function storyBody(id: string, session: { mode: string; score: number; won: boolean } | null) {
  const node = getNodeById(id);
  if (!node) throw new Error(`no node ${id}`);
  const v = judgeStorySession(node, session);
  if (v.ok) throw new Error('expected a refusal');
  const { ok: _ok, ...refusal } = v;
  return refusal;
}

describe('the Arena said no', () => {
  it('422, a score above the mode\'s limit: the server\'s own words, the code kept', () => {
    const body = arenaBody({ mode: 'music', score: 99_999_999 });
    const r = arenaRefusal(422, body)!;
    expect(r).toEqual({ error: 'SCORE_ABOVE_CEILING', line: body.detail });
    expect(r.line).toMatch(/nothing was settled/);
  });

  it('422, a dunk card that does not add up', () => {
    const body = arenaBody({ mode: 'dunkContest', score: 100, card: { v: 1, total: 25, attempts: [{ round: 1, total: 25, judges: [9, 8, 8], made: true }] } });
    expect(body.error).toBe('SCORE_CARD_MISMATCH');
    expect(arenaRefusal(422, body)).toEqual({ error: 'SCORE_CARD_MISMATCH', line: body.detail });
    expect(body.detail).toMatch(/is not the dunk card's total \(25\)/);
  });

  it('409, a duel closed or with no opponent yet (the route\'s ArenaErrors)', () => {
    expect(arenaRefusal(409, { error: 'NOT_SUBMITTABLE', detail: 'This duel is no longer accepting scores.' }))
      .toEqual({ error: 'NOT_SUBMITTABLE', line: 'This duel is no longer accepting scores.' });
    expect(arenaRefusal(409, { error: 'WAITING_OPPONENT', detail: 'Waiting for an opponent to join.' })!.line).toBe('Waiting for an opponent to join.');
  });

  it('a body with no words still says it was refused; anything but 422 / 409 stays silent (offline, signed out, 500)', () => {
    expect(arenaRefusal(422, null)).toEqual({ error: 'REFUSED', line: 'The Arena did not accept this score.' });
    expect(arenaRefusal(409, { error: 'X' })).toEqual({ error: 'X', line: 'The Arena did not accept this score.' });
    for (const status of [200, 400, 401, 403, 404, 500]) expect(arenaRefusal(status, { error: 'E', detail: 'D' }), String(status)).toBeNull();
  });

  it('the card\'s line: "Score not accepted — …", the code on the element for a probe', () => {
    const html = renderToStaticMarkup(createElement(ArenaRefusedLine, { refusal: { error: 'SCORE_ABOVE_CEILING', line: 'Too high.' } }));
    expect(html).toContain('data-arena="refused"');
    expect(html).toContain('data-arena-error="SCORE_ABOVE_CEILING"');
    expect(html).toContain('Score not accepted — Too high.');
  });
});

describe('the Story node did not complete', () => {
  it('422 score below target: the error, what it needed and what you got', () => {
    const node = getNodeById('golfGreen.r1')!;
    const body = storyBody('golfGreen.r1', { mode: 'golf', score: node.targetScore - 1, won: false });
    expect(body).toEqual({ error: 'Score below target', required: node.targetScore, achieved: node.targetScore - 1 });
    expect(storyRefusal(422, body)).toEqual({
      error: 'Score below target', line: `Score below target: you needed ${node.targetScore}, you got ${node.targetScore - 1}.`,
    });
  });

  it('422 a win boss with an orScore: the way through (win it, or the score), and what you scored', () => {
    const body = storyBody('pitch.boss', { mode: 'soccer', score: 40, won: false });
    expect(body).toMatchObject({ error: 'Not a win', required: 'win', achieved: 'loss', orScore: 60, score: 40 });
    expect(storyRefusal(422, body)!.line).toBe('Not a win: win it, or score 60 (you got 40).');
  });

  it('422 a boss that has to be won', () => {
    const body = storyBody('tennis.boss', { mode: 'tennis', score: 3, won: false });
    expect(body).toEqual({ error: 'Not a win', required: 'win', achieved: 'loss' });
    expect(storyRefusal(422, body)!.line).toBe('Not a win: this node has to be won.');
  });

  it('422 the wrong mode: named as the player knows them, not by their keys', () => {
    const body = storyBody('golfGreen.r1', { mode: 'karateEndless', score: 99_999, won: true });
    const line = storyRefusal(422, body)!.line;
    expect(line).toMatch(/^Wrong mode: this node needs .+, not The Hundred\.$/);
    expect(line).not.toContain('karateEndless');
    expect(storyRefusal(422, { error: 'Session mode does not match node', required: 'golf', achieved: null })!.line).not.toContain(', not');
  });

  it('409 the run already completed another node; other 422s say the server\'s words; other statuses stay silent', () => {
    expect(storyRefusal(409, { error: 'Session already used', nodeId: 'blacktop.r1' })).toEqual({ error: 'Session already used', line: 'This run already completed another node.' });
    expect(storyRefusal(422, { error: 'Node not playable: locked' })!.line).toBe('Node not playable: locked.');
    for (const status of [200, 400, 401, 404, 500]) expect(storyRefusal(status, { error: 'Session not found' }), String(status)).toBeNull();
  });

  it('the panel sits where STORY NODE COMPLETE would, with the error on the element', () => {
    const html = renderToStaticMarkup(createElement(StoryRefusedPanel, { refusal: { error: 'Score below target', line: 'Score below target: you needed 4, you got 2.' } }));
    expect(html).toContain('data-story="refused"');
    expect(html).toContain('data-story-error="Score below target"');
    expect(html).toContain('STORY NODE NOT COMPLETE');
    expect(html).toContain('Score below target: you needed 4, you got 2.');
  });
});
