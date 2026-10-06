import { describe, it, expect } from 'vitest';
import {
  DUNK_UNLOCKS, emptyUnlocks, parseUnlocks, isOpen, openUnlocks, refOpen, needLine, nextUnlockLine, recordNightWon, recordChallenge,
  loadUnlocks, saveUnlocks, devUnlockOverride, allOpen, UNLOCKS_KEY, type KeyStore,
} from './DunkUnlocks';
import { SPECIAL_PROPS } from './SeasonSpecials';

const memStore = (): KeyStore & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } };
};

describe('the ladder', () => {
  it('opens one step per won night, and the splits with two beaten challenges', () => {
    let s = emptyUnlocks();
    expect(openUnlocks(s)).toEqual([]);
    const opened: string[][] = [];
    for (let n = 0; n < 5; n++) { const r = recordNightWon(s); s = r.state; opened.push(r.opened.map((u) => u.id)); }
    expect(opened).toEqual([['prop:oopbounce'], ['celeb:itsover'], ['prop:row5'], ['prop:dubble6'], ['prop:oopcorner']]);
    expect(isOpen(DUNK_UNLOCKS.find((u) => u.id === 'celeb:splits')!, s)).toBe(false);
    s = recordChallenge(s, 'stripe', 41, true).state;
    const r = recordChallenge(s, 'overthree', 43, true);
    expect(r.opened.map((u) => u.id)).toEqual(['celeb:splits']);
  });
  it('the everyday vocabulary is never on it, and neither are the season-pass specials (the economy\'s)', () => {
    const gated = DUNK_UNLOCKS.flatMap((u) => u.refs);
    for (const p of ['none', 'alleyoop', 'selflob', 'offglass', 'bounce', 'car', 'row3', 'dubble1', 'dubble5', 'roar', 'toosmall']) expect(gated).not.toContain(p);
    for (const p of SPECIAL_PROPS) expect(gated).not.toContain(p);
    // every challenge's set-up prop is open from the first night
    expect(gated).not.toContain('row3'); expect(gated).not.toContain('bounce'); expect(gated).not.toContain('selflob');
  });
  it('refOpen: on the ladder → its state; off it → always open', () => {
    const s = emptyUnlocks();
    expect(refOpen('prop', 'oopbounce', s)).toBe(false);
    expect(refOpen('prop', 'dubble8', s)).toBe(false);
    expect(refOpen('prop', 'car', s)).toBe(true);
    expect(refOpen('celebration', 'roar', s)).toBe(true);
    expect(refOpen('celebration', 'spiderman', s)).toBe(false);
    expect(refOpen('prop', 'oopbounce', recordNightWon(s).state)).toBe(true);
  });
  it('a lock says what opens it; the night card says what is next', () => {
    const s = emptyUnlocks();
    expect(needLine('prop', 'row5', s)).toBe('LOCKED — OVER FIVE IN A ROW · WIN 3 MORE NIGHTS');
    expect(needLine('prop', 'oopbounce', s)).toBe('LOCKED — THE BOUNCE OOP · WIN 1 MORE NIGHT');
    expect(needLine('celebration', 'spiderman', s)).toMatch(/BEAT 2 MORE CHALLENGES ON THE PRACTICE RUNWAY/);
    expect(needLine('prop', 'car', s)).toBe('');
    expect(nextUnlockLine(s)).toBe('NEXT: THE BOUNCE OOP — WIN 1 MORE NIGHT');
    expect(nextUnlockLine(allOpen())).toBe('EVERYTHING IS OPEN');
  });
  it('recording never mutates the state it was given; a best is kept, a re-clear is not counted twice', () => {
    const s = emptyUnlocks();
    recordNightWon(s);
    expect(s.nightsWon).toBe(0);
    let t = recordChallenge(s, 'stripe', 38, false).state;
    expect(t.best.stripe).toBe(38); expect(t.beaten).toEqual([]);
    t = recordChallenge(t, 'stripe', 36, false).state;
    expect(t.best.stripe).toBe(38);
    t = recordChallenge(t, 'stripe', 42, true).state;
    t = recordChallenge(t, 'stripe', 44, true).state;
    expect(t.beaten).toEqual(['stripe']); expect(t.best.stripe).toBe(44);
  });
});

describe('the device', () => {
  it('round trip through storage', () => {
    const st = memStore();
    const s = recordChallenge(recordNightWon(emptyUnlocks()).state, 'stripe', 41, true).state;
    expect(saveUnlocks(st, s)).toBe(true);
    expect(st.m.has(UNLOCKS_KEY)).toBe(true);
    expect(loadUnlocks(st)).toEqual(s);
  });
  it('no storage, a throwing storage, or a corrupt value reads as a fresh device — never a throw', () => {
    expect(loadUnlocks(null)).toEqual(emptyUnlocks());
    const boom: KeyStore = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadUnlocks(boom)).toEqual(emptyUnlocks());
    expect(saveUnlocks(boom, emptyUnlocks())).toBe(false);
    for (const raw of ['{', 'null', '[]', '{"v":2,"nightsWon":9}', JSON.stringify({ v: 1, nightsWon: 'lots', best: { stripe: 'x' }, beaten: [1, 'a'] })]) {
      const st = memStore(); st.m.set(UNLOCKS_KEY, raw);
      const s = loadUnlocks(st);
      expect(s.v).toBe(1);
      expect(Number.isFinite(s.nightsWon)).toBe(true);
    }
    expect(parseUnlocks({ v: 1, nightsWon: 3.7, best: { stripe: 999 }, beaten: ['a', 'a', 'b'] })).toEqual({ v: 1, nightsWon: 3, best: { stripe: 100 }, beaten: ['a', 'b'] });
    expect(parseUnlocks({ v: 1, nightsWon: -5 }).nightsWon).toBe(0);
  });
});

describe('the dev override', () => {
  it('?unlocks=all opens, ?unlocks=0 reads the device, an agent run is open unless told otherwise', () => {
    expect(devUnlockOverride('?unlocks=all')).toBe('all');
    expect(devUnlockOverride('?unlocks=0')).toBe('device');
    expect(devUnlockOverride('?agent=1')).toBe('all');
    expect(devUnlockOverride('?agent=1&unlocks=0')).toBe('device');
    expect(devUnlockOverride('')).toBeNull();
    for (const u of DUNK_UNLOCKS) expect(isOpen(u, allOpen())).toBe(true);
  });
});
