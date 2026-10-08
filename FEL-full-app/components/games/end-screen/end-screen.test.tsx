// END SCREEN — the card itself, rendered by React (to markup: this repo's vitest runs in node with no DOM, as
// endCardRefusal.test.tsx does). Reduced motion is the instant reveal, so the markup is the finished card: every beat the
// run earned, in order, and the honest states where nothing was earned. The live pieces (the timers, the pad) are pure
// and tested in reveal / nav; this file pins what the card SAYS.
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

import { EndScreen, scoreFigures, exitHrefFor } from './end-screen';
import { memoryStore, applyRun, EMPTY_RECORDS } from './records';
import { SILENT_FX } from './fx';
import type { EndScreenProps } from './types';
import { getNodeById } from '@/lib/story-data';

const T = new Date(2026, 9, 6, 20, 0).getTime();
const noop = () => {};

function props(o: Partial<EndScreenProps> = {}): EndScreenProps {
  return {
    mode: 'threePoint', title: 'Downtown',
    run: { score: 21, won: true, duration: 60, opponentScore: 0, stats: {} },
    headline: 'BUCKETS', won: true, proofLine: '21 PTS DOWNTOWN · WON',
    arenaRefused: false, arenaVerdict: null,
    recap: { xp: 120, shards: 2, credits: 20, prqDelta: 0.6, prqAfter: 62, grade: { label: 'Elite', color: '#0ff' }, streakDays: 3, streakBonus: 15,
      season: { name: 'Season 1', gained: 300, tier: 1, into: 150, need: 518, hasPro: false, tierUps: [{ tier: 1, rewards: { free: [], pro: [] } }] },
      mastery: { mode: 'threePoint', tier: 'Silver', tierIndex: 2, ups: [{ tier: 'Silver' }] } },
    coins: { coins: 40, capped: false },
    storyNodeId: null, storyReward: null, storyRefused: null, mpResult: null, challengeResult: null, arenaResult: null, carnivalRun: null,
    share: { state: 'idle', url: null, onChallenge: noop, onProof: noop },
    onReplay: noop, onNavigate: noop,
    now: () => T, reducedMotion: true, fx: SILENT_FX, store: memoryStore(),
    ...o,
  };
}
const html = (o: Partial<EndScreenProps> = {}) => renderToStaticMarkup(createElement(EndScreen, props(o)));
const order = (h: string, marks: string[]) => marks.map((m) => { const i = h.indexOf(m); expect(i, m).toBeGreaterThan(-1); return i; });

describe('a win, revealed (reduced motion: instant)', () => {
  const h = html();
  it('the headline is the shell\'s, the trophy gold, the score the run\'s', () => {
    expect(h).toContain('data-end-headline');
    expect(h).toContain('>BUCKETS</h2>');
    expect(h).toContain('data-end-trophy="gold"');
    expect(h).toContain('data-end-score="21"');
    expect(h).toContain('data-reveal="done"');
    expect(h).not.toContain('data-beat="waiting"');
  });
  it('every reward the run earned, in reveal order', () => {
    const at = order(h, ['data-recap="xp"', 'data-recap="coins"', 'data-recap="shards"', 'data-recap="credits"', 'data-recap="prq"', 'data-recap="season"', 'data-recap="mastery"', 'data-end-progress']);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(h).toContain('+120');
    expect(h).toContain('incl. +15 streak');
    expect(h).toContain('TIER UP! Tier 1');
    expect(h).toContain('MASTERY UP — Silver');
  });
  it('the callouts: a first run on this device, the server\'s streak', () => {
    expect(h).toContain('data-callout="first"');
    expect(h).toContain('DAY 3 STREAK');
    expect(h).toContain('368 season XP to Tier 2');
  });
  it('What\'s next: Play again focused, a teaser, All modes, the share buttons, the A / B hints', () => {
    expect(h).toMatch(/data-end-focus="primary" data-focused="true"[^>]*>.*Play again/);
    expect(h).toContain('data-end-focus="next"');
    expect(h).toContain('data-end-focus="modes"');
    expect(h).toContain('Challenge a friend');
    expect(h).toContain('Share proof · 21 PTS DOWNTOWN · WON');
    expect(h).toContain('Select');
  });
  it('no confetti under reduced motion', () => {
    expect(h).not.toContain('data-end-confetti');
  });
});

describe('a beaten personal best', () => {
  it('gold, with the old best — computed from this device\'s records before the run', () => {
    const store = memoryStore(applyRun(EMPTY_RECORDS, { mode: 'threePoint', score: 18, won: false, accepted: true, nowMs: T - 86_400_000 }).next);
    const h = html({ store });
    expect(h).toContain('data-callout="best"');
    expect(h).toContain('NEW PERSONAL BEST');
    expect(h).toContain('was 18');
  });
  it('a refused score never claims one (unpaid / NO PLAY / Arena refusal)', () => {
    const prev = applyRun(EMPTY_RECORDS, { mode: 'threePoint', score: 18, won: false, accepted: true, nowMs: T - 86_400_000 }).next;
    for (const o of [
      { recap: { xp: 0, shards: 0, credits: 0, prqDelta: 0, prqAfter: 0, unpaid: 'SCORE_INVALID' } },
      { recap: { xp: 0, shards: 0, credits: 0, prqDelta: 0, prqAfter: 0, noPlay: true } },
      { arenaRefused: true, staked: true, arenaResult: { settled: false, status: 'REFUSED', refused: { error: 'SCORE_ABOVE_CEILING', line: 'Too high.' } } },
    ] as Partial<EndScreenProps>[]) {
      expect(html({ ...o, store: memoryStore(prev) })).not.toContain('NEW PERSONAL BEST');
    }
  });
  it('a staked run waits for the Arena before it is judged a record', () => {
    const prev = applyRun(EMPTY_RECORDS, { mode: 'threePoint', score: 18, won: false, accepted: true, nowMs: T - 86_400_000 }).next;
    expect(html({ staked: true, arenaResult: null, store: memoryStore(prev) })).not.toContain('data-callout="best"');
  });
});

describe('honest states', () => {
  it('waiting on the server: the moment is up, the rewards say they are being tallied', () => {
    const h = html({ recap: null, coins: null });
    expect(h).toContain('data-recap="pending"');
    expect(h).toContain('Tallying rewards');
    expect(h).toContain('data-end-focus="primary"');   // Play again never waits on the server
  });
  it('NO PLAY: said, and no reward tile', () => {
    const h = html({ recap: { xp: 0, shards: 0, credits: 0, prqDelta: 0, prqAfter: 0, noPlay: true } });
    expect(h).toContain('NO PLAY RECORDED');
    expect(h).not.toMatch(/data-recap="(xp|coins|shards|credits|prq)"/);
  });
  it('unpaid: the server\'s reason in plain words, and no tile even if numbers came back', () => {
    const h = html({ recap: { xp: 99, shards: 9, credits: 9, prqDelta: 1, prqAfter: 0, unpaid: 'AGENT' }, coins: { coins: 40, capped: false } });
    expect(h).toContain('data-recap="unpaid"');
    expect(h).not.toMatch(/data-recap="(xp|coins|shards|credits|prq)"/);
  });
  it('capped: the cap message, and the wallet coins marked as at the limit', () => {
    const h = html({ recap: { xp: 10, shards: 0, credits: 0, prqDelta: 0, prqAfter: 0, capMessage: 'Daily reward cap reached for this mode.' }, coins: { coins: 12, capped: true } });
    expect(h).toContain('data-recap="cap"');
    expect(h).toContain('Daily reward cap reached for this mode.');
    expect(h).toMatch(/data-recap="coins" data-capped="1"/);
    expect(h).toContain('limit reached');
    expect(h).not.toContain('data-recap="coins-limit"');   // coins were paid: the coins tile says the limit, no second tile
  });
  // test changed (IMPROVE 2026-10-06): the owner chose to show the limit — a cap that cut the coins to nothing was no tile
  // at all (ECONOMY-CAPS F-P1); it is now a "Coin limit reached today" tile. Still never a "+0".
  it('coins capped to nothing: a "Coin limit reached today" tile, never a "+0" (owner decision 2026-10-06)', () => {
    const h = html({ recap: { xp: 10, shards: 0, credits: 0, prqDelta: 0, prqAfter: 0 }, coins: { coins: 0, capped: true } });
    expect(h).not.toContain('data-recap="coins"');
    expect(h).toMatch(/data-recap="coins-limit" data-capped="1"/);
    expect(h).toContain('Coin limit reached today');
    expect(h).not.toContain('+0');
  });
  it('no coins and no cap: no coin tile of either kind', () => {
    const h = html({ recap: { xp: 10, shards: 0, credits: 0, prqDelta: 0, prqAfter: 0 }, coins: { coins: 0, capped: false } });
    expect(h).not.toMatch(/data-recap="coins(-limit)?"/);
  });
  it('an unpaid run shows no coin limit either (the cap is not why it paid nothing)', () => {
    const h = html({ recap: { xp: 0, shards: 0, credits: 0, prqDelta: 0, prqAfter: 0, unpaid: 'PLAYTEST' }, coins: { coins: 0, capped: true } });
    expect(h).not.toContain('Coin limit reached today');
  });
  it('a refused Arena score claims nothing: dim trophy, no challenge mint, no proof share, the refusal in the server\'s words', () => {
    const h = html({
      headline: 'SCORE NOT ACCEPTED', won: false, proofLine: null, arenaRefused: true, staked: true,
      arenaResult: { settled: false, status: 'REFUSED', myScore: 21, refused: { error: 'SCORE_ABOVE_CEILING', line: 'Too high.' } },
    });
    expect(h).toContain('data-end-trophy="dim"');
    expect(h).toContain('SCORE NOT ACCEPTED');
    expect(h).not.toContain('Challenge a friend');
    expect(h).not.toContain('Share proof');
    expect(h).toContain('data-arena="refused"');
    expect(h).toContain('Score not accepted — Too high.');
  });
  it('a refused story node says why where STORY NODE COMPLETE would be', () => {
    const h = html({ storyNodeId: 'golfGreen.r1', storyRefused: { error: 'Score below target', line: 'Score below target: you needed 4, you got 2.' } });
    expect(h).toContain('data-story="refused"');
    expect(h).toContain('STORY NODE NOT COMPLETE');
    expect(h).not.toContain('STORY NODE COMPLETE<');
  });
  it('a completed story node: its LC and badge, and Next is the next node on the rail', () => {
    const node = getNodeById('golfGreen.r1')!;
    const h = html({ storyNodeId: node.id, storyReward: { rewardLC: 75, badge: { name: 'Green Keeper' } } });
    expect(h).toContain('STORY NODE COMPLETE');
    expect(h).toContain('+75 LC');
    expect(h).toContain('Green Keeper');
    expect(h).toContain('data-next-kind="story-node"');
    expect(h).toContain('Story map');
  });
});

describe('the playlist and the slots', () => {
  it('a carnival stop: the primary is the next stop (no replay of a relay stop)', () => {
    const h = html({ carnivalRun: { lineup: ['carnival', 'soccer'], index: 1, results: [] } as never });
    expect(h).toMatch(/data-end-focus="primary"[^>]*>.*Next: /);
    expect(h).not.toContain('Play again');
    expect(h).toContain('CARNIVAL NIGHT — STOP 1 OF 2');
  });
  it('extraActions join the action row as focusable buttons; sideCards render under the rewards', () => {
    const h = html({
      extraActions: [{ id: 'rematch', label: 'Rematch a friend', onSelect: noop }],
      sideCards: createElement('div', { 'data-end-focus': 'learn' }, 'Learn while you wait'),
    });
    expect(h).toContain('data-end-focus="x-rematch"');
    expect(h).toContain('Rematch a friend');
    expect(h).toContain('data-end-slot="side-cards"');
    expect(h).toContain('Learn while you wait');
  });
});

describe('the helpers the card reads', () => {
  it('score figures: the Arena\'s settled pair when staked, the mode\'s own otherwise, no "vs 0"', () => {
    expect(scoreFigures({ run: { score: 21, won: true, duration: 1, opponentScore: 18 }, arenaVerdict: null, arenaResult: null })).toEqual({ mine: 21, vs: 18, vsLabel: null });
    expect(scoreFigures({ run: { score: 21, won: true, duration: 1, opponentScore: 0 }, arenaVerdict: null, arenaResult: null }).vs).toBeNull();
    expect(scoreFigures({ run: { score: 21.4, won: true, duration: 1 }, arenaVerdict: 'WON', arenaResult: { settled: true, status: 'SETTLED', myScore: 21, oppScore: 19 } })).toEqual({ mine: 21, vs: 19, vsLabel: 'house rival' });
  });
  it('B goes to the shelf, or the story map from a story run', () => {
    expect(exitHrefFor(null)).toBe('/play');
    expect(exitHrefFor('golfGreen.r1')).toBe('/story');
  });
});

// ── IMPROVE (2026-10-06, owner decisions): the player level, today's goals, the account's best ──

const goalsFixture = {
  day: '2026-10-06', resetsAt: '2026-10-07T00:00:00.000Z', completedNow: ['runs-3'],
  items: [
    { id: 'winRow-2', kind: 'winRow' as const, target: 2, text: 'Win 2 in a row', progress: 1, done: false },
    { id: 'wins-2', kind: 'wins' as const, target: 2, text: 'Win 2 games', progress: 0, done: false },
    { id: 'runs-3', kind: 'runs' as const, target: 3, text: 'Finish 3 runs', progress: 3, done: true },
  ],
};
const paidRecap = props().recap!;

describe('the player level bar', () => {
  it('a run that crosses a level: LEVEL UP with the new level, after the XP tile and before the season', () => {
    // level 10 starts at 13,500 XP: 13,460 + 120 crosses it
    const h = html({ recap: { ...paidRecap, profileXp: 13_580 } });
    expect(h).toContain('data-recap="level" data-level="10" data-level-ups="1"');
    expect(h).toContain('LEVEL UP! Level 10');
    const at = order(h, ['data-recap="xp"', 'data-recap="level"', 'data-recap="season"']);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
  it('a run inside a level: the bar and the XP to the next level, no LEVEL UP', () => {
    const h = html({ recap: { ...paidRecap, profileXp: 13_700 } });
    expect(h).toContain('data-recap="level" data-level="10" data-level-ups="0"');
    expect(h).not.toContain('LEVEL UP');
    expect(h).toContain('XP to level 11');
  });
  it('no account XP in the answer, or an unpaid run: no level bar', () => {
    expect(html()).not.toContain('data-recap="level"');
    expect(html({ recap: { xp: 0, shards: 0, credits: 0, prqDelta: 0, prqAfter: 0, unpaid: 'AGENT', profileXp: 900 } })).not.toContain('data-recap="level"');
  });
  it('the season keeps its TIER UP beside the LEVEL UP', () => {
    const h = html({ recap: { ...paidRecap, profileXp: 13_580 } });
    expect(h).toContain('TIER UP! Tier 1');
    expect(h).toContain('LEVEL UP! Level 10');
  });
});

describe('today\'s goals', () => {
  it('the three goals with their progress; the one this run completed is called out with its season XP', () => {
    const h = html({ recap: { ...paidRecap, goals: goalsFixture } });
    expect(h).toContain('data-end-goals');
    expect(h).toContain('1/3 done');
    expect(h).toContain('data-goal="runs-3" data-goal-state="just-done"');
    expect(h).toContain('GOAL COMPLETE · +100 season XP');
    expect(h).toContain('data-goal="wins-2" data-goal-state="open"');
    expect(h).toContain('2 more wins to go');
    expect(h).toContain('1 more win in a row to go');
    const at = order(h, ['data-recap="season"', 'data-end-goals', 'data-end-progress']);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
  it('no goals in the answer (no active season, an unpaid run): no goals card', () => {
    expect(html()).not.toContain('data-end-goals');
    expect(html({ recap: { xp: 0, shards: 0, credits: 0, prqDelta: 0, prqAfter: 0, unpaid: 'AGENT', goals: goalsFixture } })).not.toContain('data-end-goals');
  });
});

describe('the account\'s best (verified adults)', () => {
  it('a paid run with a session id waits for the account\'s best before it judges a record (no callouts on a guess)', () => {
    const fetchAccountBest = vi.fn(() => new Promise<never>(() => {}));
    const h = html({ recap: { ...paidRecap, sessionId: 'sess1' }, fetchAccountBest });
    expect(h).toContain('data-recap="pending"');
    expect(h).not.toContain('data-callout="first"');
  });
  it('no session id (a refused, unpaid or old answer): the device records at once, as before', () => {
    const fetchAccountBest = vi.fn(() => new Promise<never>(() => {}));
    const h = html({ fetchAccountBest });
    expect(h).toContain('data-callout="first"');
    expect(fetchAccountBest).not.toHaveBeenCalled();
  });
});
