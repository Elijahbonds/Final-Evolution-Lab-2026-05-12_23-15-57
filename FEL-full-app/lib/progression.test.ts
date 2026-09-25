// A STORY NODE IS COMPLETED BY PLAYING IT, ON ITS MODE'S OWN TERMS.
//
// HOTFIX (2026-09-24): POST /api/story/complete checked the session's score and nothing else, so any run that cleared
// the number completed any node — karate counts in the thousands and would clear a golf node it never touched. And
// the targets were on no mode's scale, so a Ones game won 11–7 could never clear the first node. The route asks
// judgeStorySession now (mode, then the win where a boss asks for one, then the score); these hold the rule, and
// lib/story-complete-route.test.ts holds the route to it.

import { describe, expect, it } from 'vitest';
import { getNodeById } from './story-data';
import { evaluateCampaign, judgeStorySession, storySessionMode } from './progression';

const node = (id: string) => {
  const n = getNodeById(id);
  if (!n) throw new Error(`no node ${id}`);
  return n;
};
const play = (mode: string, score: number, won = false) => ({ mode, score, won });

describe('judgeStorySession', () => {
  it('a high score in another mode does not complete the node', () => {
    expect(judgeStorySession(node('golfGreen.r1'), play('karateEndless', 99_999, true))).toEqual({
      ok: false, error: 'Session mode does not match node', required: 'golf', achieved: 'karateEndless',
    });
  });

  it('the right mode at or above target completes a rail', () => {
    const golf = node('golfGreen.r1');
    expect(judgeStorySession(golf, play('golf', golf.targetScore))).toEqual({ ok: true });
    expect(judgeStorySession(golf, play('golf', golf.targetScore + 1))).toEqual({ ok: true });
  });

  it('the right mode below target is refused on the score, with the numbers', () => {
    const golf = node('golfGreen.r1');
    expect(judgeStorySession(golf, play('golf', golf.targetScore - 1))).toEqual({
      ok: false, error: 'Score below target', required: golf.targetScore, achieved: golf.targetScore - 1,
    });
  });

  it('the first node of the campaign clears on a real Ones game — the dead end that was left behind', () => {
    // a 1v1 posts your points in a game to 11: 11–7 is 11, and even a 6–11 loss clears the first rung
    const r1 = node('blacktop.r1');
    expect(judgeStorySession(r1, play('hoops1v1', 11, true)).ok).toBe(true);
    expect(judgeStorySession(r1, play('hoops1v1', 6, false)).ok).toBe(true);
    expect(judgeStorySession(r1, play('hoops1v1', 2, false))).toMatchObject({ ok: false, error: 'Score below target' });
  });

  it('a boss that asks for the win takes the mode\'s own verdict, not a score', () => {
    const boss = node('tennis.boss');
    expect(boss).toMatchObject({ mustWin: true, targetScore: 0 });
    expect(boss.orScore).toBeUndefined();
    // a tennis match won by breaking the rival's racket posts fewer than 4 games — still a win, still the boss
    expect(judgeStorySession(boss, play('tennis', 2, true))).toEqual({ ok: true });
    // and a 3–4 loss is not, however close
    expect(judgeStorySession(boss, play('tennis', 3, false))).toEqual({
      ok: false, error: 'Not a win', required: 'win', achieved: 'loss',
    });
    // a win in the wrong mode is still the wrong mode
    expect(judgeStorySession(node('blacktop.boss'), play('hoops3v3', 21, true))).toMatchObject({ error: 'Session mode does not match node' });
  });

  it('a win boss against an AI nobody has beaten on record also takes a score on the mode\'s line', () => {
    // HOTFIX (2026-09-24): the review's point — the dead end had moved to AI balance. Win it, or post the orScore.
    const boss = node('blacktop.boss');
    expect(boss).toMatchObject({ mustWin: true, targetScore: 0, orScore: 10 });
    expect(judgeStorySession(boss, play('hoops1v1', 11, true))).toEqual({ ok: true });
    expect(judgeStorySession(boss, play('hoops1v1', 10, false))).toEqual({ ok: true });   // lost 10–11: a full game at the standard
    expect(judgeStorySession(boss, play('hoops1v1', 9, false))).toEqual({
      ok: false, error: 'Not a win', required: 'win', achieved: 'loss', orScore: 10, score: 9,
    });
    // the Sand Pit and the Pitch the same way
    expect(judgeStorySession(node('sandPit.boss'), play('volleyball', 22, false))).toEqual({ ok: true });
    expect(judgeStorySession(node('sandPit.boss'), play('volleyball', 21, false))).toMatchObject({ error: 'Not a win', orScore: 22 });
    expect(judgeStorySession(node('pitch.boss'), play('soccer', 60, false))).toEqual({ ok: true });
    expect(judgeStorySession(node('pitch.boss'), play('soccer', 40, false))).toMatchObject({ error: 'Not a win', orScore: 60, score: 40 });
    // a real win with a small score is still the win
    expect(judgeStorySession(node('pitch.boss'), play('soccer', 40, true))).toEqual({ ok: true });
  });

  it('a score boss is still a score: the Dojo never posts a win, so its boss cannot ask for one', () => {
    const boss = node('dojo.boss');
    expect(boss.mustWin).toBeUndefined();
    expect(judgeStorySession(boss, play('karateEndless', boss.targetScore, false))).toEqual({ ok: true });
  });

  it('compares against the SESSION mode, not the route segment — onevone posts hoops1v1', () => {
    const blacktop = node('blacktop.r1');
    expect(blacktop.mode).toBe('onevone');
    expect(storySessionMode(blacktop)).toBe('hoops1v1');
    expect(judgeStorySession(blacktop, play('onevone', blacktop.targetScore)).ok).toBe(false);
    expect(storySessionMode(node('dojo.r1'))).toBe('karateEndless');
    expect(storySessionMode(node('skateBowl.r1'))).toBe('skateboarding');
    expect(storySessionMode(node('gymDome.r1'))).toBe('training');
    expect(storySessionMode(node('labHub.boss'))).toBe('freerun');
  });

  it('no session at all completes nothing', () => {
    expect(judgeStorySession(node('blacktop.r1'), null)).toEqual({
      ok: false, error: 'Session mode does not match node', required: 'hoops1v1', achieved: null,
    });
  });
});

describe('the map payload says what each node asks, in words', () => {
  const status = evaluateCampaign({ completedNodeIds: new Set(), prqOverall: 0, lessonsCompleted: 0 });
  const zone = (id: string) => status.zones.find((z) => z.id === id)!;

  it('zones carry the mode\'s player-facing name, not the route id', () => {
    expect(zone('blacktop')).toMatchObject({ mode: 'onevone', modeLabel: 'Ones' });
    expect(zone('gymDome').modeLabel).toBe('Iron Paradise');
    expect(zone('labHub').modeLabel).toBe('Free Run');
    for (const z of status.zones) expect(z.modeLabel, z.id).not.toBe(z.mode);
  });

  it('nodes carry their goal and whether it is a win', () => {
    const [r1, , , boss] = zone('blacktop').nodes;
    expect(r1).toMatchObject({ goal: 'Score 4 points', mustWin: false });
    expect(boss).toMatchObject({ goal: 'Win the game — first to 11 (or score 10 points)', mustWin: true });
    expect(zone('tennis').nodes[3]).toMatchObject({ goal: 'Win the match — first to 4 games', mustWin: true });
    expect(zone('tennis').nodes[1].goal).toBe('Take 2 games');
  });
});
