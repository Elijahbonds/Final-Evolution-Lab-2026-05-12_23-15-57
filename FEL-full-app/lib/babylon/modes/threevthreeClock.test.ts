// hoops-flow (owner 2026-11-12): "3v3 is first to 21 on a 4-minute clock" (was 90 s). The clock, its knob, what the horn decides on it,
// the chip's words, the booth's welcome, and that the mode plays this clock.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { gameClockText, hornCall, introNamesClock, THREE_GAME_SEC, THREES_INTRO_CLOCK_SEC, threeGameSec, type HornFrame } from './threevthreeOvertime';
import { FEEL_KNOB_BY_ID, clampKnob } from '@/lib/feel-panel/knobs';
import { FEEL_STORAGE_KEY, resetFeelForTests, setFeelSession, setFeelUser } from '@/lib/feel-panel/feel';
import { feelSessionBlock } from '@/lib/feel-panel/sessionGate';
import { SHOT_CLOCK_3V3_SEC, playerShotClockSec } from '../core/ShotClock';

const SRC = readFileSync(join(__dirname, 'ThreeVThreeMode.ts'), 'utf8');
const frame = (o: Partial<HornFrame>): HornFrame => ({ buzzer: false, overtime: false, live: false, my: 0, foe: 0, ...o });

describe('the 3v3 game clock', () => {
  it('ships at 4 minutes; the knob ships at it, and 90 (the old clock) is on its grid', () => {
    expect(THREE_GAME_SEC).toBe(240);
    const k = FEEL_KNOB_BY_ID.get('hoops.threeGameSec')!;
    expect(k.def).toBe(THREE_GAME_SEC);
    expect(clampKnob(k, 90)).toBe(90);
    expect(k.group).toBe('Hoops · flow and pace');
  });
  it('the mode plays it: no 90 s constant left, read at the run\'s start and at READY, and the dusk runs over it', () => {
    expect(SRC).not.toMatch(/POSSESSION_SEC/);
    expect(SRC).toMatch(/let gameSec = THREE_GAME_SEC;/);
    expect(SRC).toMatch(/gameSec = threeGameSec\(\); myScore = 0; foeScore = 0; assists = 0; timeLeft = gameSec;/);
    expect(SRC).toMatch(/onPlay\(\) \{\n\s*if \(myScore !== 0 \|\| foeScore !== 0\) return;[^\n]*\n\s*gameSec = threeGameSec\(\); timeLeft = gameSec;/);
    expect(SRC).toMatch(/1 - timeLeft \/ gameSec\)/);
  });
  it('the clock running out with neither side at 21: the leader wins, a tie is overtime (the rule is unchanged)', () => {
    expect(hornCall(frame({ buzzer: true, my: 17, foe: 15 }))).toBe('WIN');
    expect(hornCall(frame({ buzzer: true, my: 14, foe: 19 }))).toBe('LOSS');
    expect(hornCall(frame({ buzzer: true, my: 16, foe: 16 }))).toBe('overtime');
    expect(hornCall(frame({ my: 20, foe: 2 }))).toBe('play');   // the clock still running: nothing decided short of 21
  });
  it('ELITE\'s 14 s shot clock is its own (per possession), whatever the game clock', () => {
    expect(SHOT_CLOCK_3V3_SEC).toBe(14);
    expect(playerShotClockSec('3v3', 'elite')).toBe(14);
    expect(playerShotClockSec('3v3', 'pro')).toBe(0);
  });
});

describe('the clock chip reads right on a 4-minute clock', () => {
  it('a minute or more is m:ss, under a minute whole seconds, overtime names the period', () => {
    expect(gameClockText(240)).toBe('4:00');
    expect(gameClockText(239.2)).toBe('4:00');
    expect(gameClockText(65)).toBe('1:05');
    expect(gameClockText(60)).toBe('1:00');
    expect(gameClockText(59.01)).toBe('1:00');   // (ceil: the chip never shows 0 while a fraction is left)
    expect(gameClockText(59)).toBe('59s');
    expect(gameClockText(0)).toBe('0s');
    expect(gameClockText(-3)).toBe('0s');
    expect(gameClockText(30, 'OT')).toBe('OT 30s');
    expect(gameClockText(30, 'OT2')).toBe('OT2 30s');
    expect(gameClockText(Number.NaN)).toBe('0s');
  });
});

describe('the booth never names a clock the game is not playing', () => {
  it('the recorded 3v3 welcome ("ninety seconds on the clock") is said on a 90 s game only', () => {
    expect(THREES_INTRO_CLOCK_SEC).toBe(90);
    expect(introNamesClock(90)).toBe(true);
    expect(introNamesClock(THREE_GAME_SEC)).toBe(false);
    for (const bank of ['boardwalk', 'moss', 'nova', 'unclejune', 'velvet']) {
      const lines = (JSON.parse(readFileSync(join(__dirname, `../audio/mic/script/${bank}.json`), 'utf8')) as { lines?: Array<{ moment: string; text: string }> } | Array<{ moment: string; text: string }>);
      const list = Array.isArray(lines) ? lines : lines.lines ?? [];
      const welcome = list.filter((l) => l.moment === 'game.intro.threes');
      expect(welcome.length, bank).toBeGreaterThan(0);
      for (const l of welcome) expect(l.text, bank).toMatch(/ninety/i);   // why it is held back: re-record it and this test says so
    }
    expect(SRC).toMatch(/if \(introNamesClock\(gameSec\)\) mic\.then\(\{ moment: 'game\.intro\.threes'/);
  });
});

describe('the knob: only a playtest run moves it', () => {
  const g = globalThis as { window?: unknown };
  const open = (o: Record<string, number>, search: string) => {
    resetFeelForTests();
    const m = new Map<string, string>([[FEEL_STORAGE_KEY, JSON.stringify(o)]]);
    g.window = { localStorage: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } } };
    setFeelUser(true); setFeelSession(feelSessionBlock('/play/threevthree', search));
  };
  afterEach(() => { resetFeelForTests(); delete g.window; });
  it('closed: 240 s; a playtest run reads 90 (the old clock); a staked run ignores it', () => {
    expect(threeGameSec()).toBe(240);
    open({ 'hoops.threeGameSec': 90 }, '?playtest=1');
    expect(threeGameSec()).toBe(90);
    open({ 'hoops.threeGameSec': 90 }, '?playtest=1&arena=m1');
    expect(threeGameSec()).toBe(240);
  });
});
