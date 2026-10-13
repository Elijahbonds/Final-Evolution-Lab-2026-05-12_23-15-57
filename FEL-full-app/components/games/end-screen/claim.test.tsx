// THE CLAIM (owner, 2026-10-13, #19 follow-up): reveal-only. These pin the three things that matter — it is offered only for
// a run that actually earned something, pressing it makes no request and moves no balance, and it says what was earned in
// words a screen reader can read.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { button, drive } from '@/tests/helpers/driveRender';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

import { claimLines, claimText } from './claim';
import { ClaimBar } from './claim-bar';
import { EndScreen } from './end-screen';
import { memoryStore } from './records';
import { SILENT_FX } from './fx';
import type { EndScreenProps } from './types';

afterEach(() => { vi.unstubAllGlobals(); });

const paid = { xp: 120, shards: 2, credits: 20, prqDelta: 0.6, prqAfter: 62 };

describe('claimLines / claimText: what was earned, as the card shows it', () => {
  it('XP, wallet coins, shards, Lab Credits and a PRQ gain, in the tiles\' order', () => {
    const lines = claimLines(paid, { coins: 40, capped: false });
    expect(lines.map((l) => l.id)).toEqual(['xp', 'coins', 'shards', 'credits', 'prq']);
    expect(claimText(lines)).toBe('Claimed: +120 XP, +40 wallet coins, +2 shards, +20 Lab Credits, +0.6 PRQ.');
  });
  it('nothing earned, nothing to claim: zeroes, a PRQ loss and a capped-to-nothing coin tile are not rewards', () => {
    expect(claimLines({ xp: 0, shards: 0, credits: 0, prqDelta: -1.2, prqAfter: 50 }, { coins: 0, capped: true })).toEqual([]);
    expect(claimLines(null, null)).toEqual([]);
  });
  it('NO PLAY and an unpaid run claim nothing, even if numbers came back', () => {
    expect(claimLines({ ...paid, noPlay: true }, { coins: 40, capped: false })).toEqual([]);
    expect(claimLines({ ...paid, unpaid: 'AGENT' }, { coins: 40, capped: false })).toEqual([]);
  });
  it('thousands are grouped like the tiles', () => {
    expect(claimText(claimLines({ ...paid, xp: 1234, shards: 0, credits: 0, prqDelta: 0 }, null))).toBe('Claimed: +1,234 XP.');
  });
});

describe('ClaimBar: a pure client-side reveal', () => {
  const lines = claimLines(paid, { coins: 40, capped: false });
  const bar = () => ClaimBar({ lines, ready: true, focused: false, instant: true, canPress: () => true }) as ReactElement;

  it('starts unclaimed: a CLAIM button in the focus grid, its label says what it will confirm, nothing said yet', () => {
    const { html } = drive(bar);
    expect(html).toContain('data-end-claim="open"');
    expect(html).toContain('data-end-focus="claim"');
    expect(html).toContain('aria-label="Claim your rewards: +120 XP, +40 wallet coins, +2 shards, +20 Lab Credits, +0.6 PRQ"');
    expect(html).not.toContain('CLAIMED');
    expect(html).toMatch(/<p role="status" aria-live="polite" data-end-claim-text="true" class="sr-only"><\/p>/);
  });
  it('pressing it makes zero requests of any kind, reads CLAIMED, and says the sentence in the live region', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const onClaim = vi.fn();
    const { html } = drive(
      () => ClaimBar({ lines, ready: true, focused: false, instant: true, canPress: () => true, onClaim }) as ReactElement,
      [(tree) => button(tree, /CLAIM/).props.onClick({ stopPropagation: () => {} })],
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onClaim).toHaveBeenCalledTimes(1);
    expect(html).toContain('data-end-claim="claimed"');
    expect(html).toContain('CLAIMED');
    expect(html).toContain('data-end-claim-text="true" class="sr-only">Claimed: +120 XP, +40 wallet coins, +2 shards, +20 Lab Credits, +0.6 PRQ.</p>');
    expect(html).not.toContain('data-end-focus="claim"');   // done: out of the focus grid
  });
  it('a press before the card is armed claims nothing', () => {
    const onClaim = vi.fn();
    const { html, tree } = drive(() => ClaimBar({ lines, ready: true, focused: false, instant: true, canPress: () => false, onClaim }) as ReactElement);
    button(tree, /CLAIM/).props.onClick({ stopPropagation: () => {} });
    expect(onClaim).not.toHaveBeenCalled();
    expect(html).not.toContain('CLAIMED');
  });
  it('until the reveal has played out the button is disabled (out of the focus grid)', () => {
    const html = renderToStaticMarkup(createElement(() => ClaimBar({ lines, ready: false, focused: false, instant: false, canPress: () => true }) as ReactElement));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-end-focus="claim"|<button[^>]*data-end-focus="claim"[^>]*disabled=""/);
  });
  it('nothing earned renders nothing', () => {
    const { html } = drive(() => ClaimBar({ lines: [], ready: true, focused: false, instant: true, canPress: () => true }) as ReactElement);
    expect(html).toBe('');
  });
});

const T = new Date(2026, 9, 6, 20, 0).getTime();
function card(o: Partial<EndScreenProps> = {}): string {
  const p: EndScreenProps = {
    mode: 'threePoint', title: 'Downtown',
    run: { score: 21, won: true, duration: 60, opponentScore: 0, stats: {} },
    headline: 'BUCKETS', won: true, proofLine: null, arenaRefused: false, arenaVerdict: null,
    recap: { ...paid },
    coins: { coins: 40, capped: false },
    storyNodeId: null, storyReward: null, storyRefused: null, mpResult: null, challengeResult: null, arenaResult: null, carnivalRun: null,
    share: { state: 'idle', url: null, onChallenge: () => {}, onProof: () => {} },
    onReplay: () => {}, onNavigate: () => {},
    now: () => T, reducedMotion: true, fx: SILENT_FX, store: memoryStore(),
    ...o,
  };
  return renderToStaticMarkup(createElement(EndScreen, p));
}

describe('the end card offers CLAIM only over rewards that were paid', () => {
  it('a paid run: CLAIM sits in the rewards column, after the tiles, and Play again is still the focused primary', () => {
    const h = card();
    expect(h).toContain('data-end-claim="open"');
    expect(h.indexOf('data-recap="prq"')).toBeLessThan(h.indexOf('data-end-claim='));
    expect(h).toMatch(/data-end-focus="primary" data-focused="true"/);
  });
  it('NO PLAY, unpaid, an empty paid run, and the waiting-on-the-server state: no CLAIM', () => {
    const none = { xp: 0, shards: 0, credits: 0, prqDelta: 0, prqAfter: 0 };
    expect(card({ recap: { ...none, noPlay: true } })).not.toContain('data-end-claim');
    expect(card({ recap: { ...paid, unpaid: 'PLAYTEST' } })).not.toContain('data-end-claim');
    expect(card({ recap: none, coins: { coins: 0, capped: false } })).not.toContain('data-end-claim');
    expect(card({ recap: null, coins: null })).not.toContain('data-end-claim');
  });
});
