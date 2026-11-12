// hoops-p08 (2026-11-12): clear the screen — the MC's subtitle while his voice plays, the hint for the first plays, and no pad or key
// words on a touch screen. Each rule's off value restores the old behaviour exactly.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HINT_PLAYS, HintBudget, MC_SUBS_WITH_VOICE, hintForDevice, passKey, resetHintPlays, showMicCaption, touchHint } from './hudHints';
import { setFeelOverride, setFeelSession, setFeelUser } from '@/lib/feel-panel/feel';
import { hintFor as hint1, type HintState as H1 } from '../modes/onevoneRules';
import { RUNWAY_TIPS } from '../core/DunkAssist';

const PAD_OR_KEY = /\b(SQUARE|TRIANGLE|CIRCLE|CROSS|BOTTOM BUTTON|L1|L2|R1|R2|SHIFT|D-PAD)\b|\([A-Z]\)|(^|[\s+])[XYABJ](?=\s[—·]|\sTO\b)/;
const knob = (id: string, v: number) => { setFeelUser(true); setFeelSession(null); setFeelOverride(id, v); };

beforeEach(() => resetHintPlays());
afterEach(() => { setFeelUser(false); });

describe('the MC subtitle while his voice plays', () => {
  it('a voiced line has no subtitle; an unvoiced line always shows; CC turns subtitles back on', () => {
    expect(MC_SUBS_WITH_VOICE).toBe(0);
    expect(showMicCaption(true, false)).toBe(false);
    expect(showMicCaption(false, false)).toBe(true);   // voice off / no bank: the words are the line
    expect(showMicCaption(true, true)).toBe(true);
  });
  it('hud.mcSubsWithVoice 1 restores the subtitle on every line, as before', () => {
    knob('hud.mcSubsWithVoice', 1);
    expect(showMicCaption(true, false)).toBe(true);
  });
});

describe('the control hint for the first plays only', () => {
  it('shows for HINT_PLAYS plays of a mode, counting scores and shots, then stops', () => {
    expect(HINT_PLAYS).toBe(3);
    const b = new HintBudget('onevone');
    b.observe({ score: 0, foeScore: 0 });   // the starting score is not a play
    expect(b.gate('TAP THE STICK TO JAB')).toBe('TAP THE STICK TO JAB');
    b.observe({ shotMeterT: 0.4 });           // 1: a shot started
    b.observe({ shotMeterT: 0.7 });           // (the same shot)
    b.observe({ shotMeterT: 0, score: 2 });   // 2: it went in
    expect(b.gate('TAP THE STICK TO JAB')).toBe('TAP THE STICK TO JAB');
    b.observe({ foeScore: 2 });               // 3: theirs
    expect(b.gate('TAP THE STICK TO JAB')).toBe('');
    expect(b.gate('GET OUT OF THE PAINT')).toBe('GET OUT OF THE PAINT');   // a rule warning is not a control hint
  });
  it('the count is per mode and lasts the session (a second mount of the same mode does not start over)', () => {
    const a = new HintBudget('threevthree');
    a.observe({ score: 0 }); a.observe({ score: 2 }); a.observe({ score: 4 }); a.observe({ score: 6 });
    expect(new HintBudget('threevthree').gate('x')).toBe('');
    expect(new HintBudget('onevone').gate('x')).toBe('x');
  });
  it('hud.hintPlays 0 shows the hint always, as before', () => {
    knob('hud.hintPlays', 0);
    const b = new HintBudget('onevone');
    for (let s = 0; s < 40; s += 2) b.observe({ score: s });
    expect(b.gate('x')).toBe('x');
  });
});

describe('no pad or keyboard words on a touch screen', () => {
  const base: H1 = { possession: 'mine', loose: false, shooting: false, dunking: false, showtime: false, posting: false, carrying: true, set: false, nearRim: false, paintWarn: false, defPhase: 'over', gathering: false };
  const ones = [
    hint1(base), hint1({ ...base, set: true }), hint1({ ...base, nearRim: true }), hint1({ ...base, posting: true }), hint1({ ...base, shooting: true }),
    hint1({ ...base, carrying: false }), hint1({ ...base, possession: 'defense', defPhase: 'drive' }), hint1({ ...base, possession: 'defense', defPhase: 'shot' }),
    hint1({ ...base, possession: 'defense', defPhase: 'drive', gathering: true }), hint1({ ...base, possession: 'defense', loose: true }),
  ];
  const threes = ['LEAN THE STICK AT A MATE + J TO PASS · CIRCLE (K) SCREEN · SQUARE (L) SHOOT', 'TAP THE STICK TO JAB · BOTTOM BUTTON (J) PASS · CIRCLE (K) SCREEN', 'SHOT UP — HOLD L1 (Q) TO BOX OUT YOUR MAN'];
  it('every 1v1, 3v3 and dunk line, on touch, has no pad or key word left', () => {
    for (const l of ones) expect(touchHint(l, 'onevone'), l).not.toMatch(PAD_OR_KEY);
    for (const l of threes) expect(touchHint(l, 'threevthree'), l).not.toMatch(PAD_OR_KEY);
    for (const l of RUNWAY_TIPS) expect(touchHint(l, 'dunk'), l).not.toMatch(PAD_OR_KEY);
  });
  it('the deck\'s own words where the deck has the button, and the rest dropped', () => {
    expect(touchHint('TAP THE STICK TO JAB · SQUARE (L) SHOOT · L2 (F) POST UP', 'onevone')).toBe('TAP THE STICK TO JAB · SHOOT');
    expect(touchHint('R2 + SQUARE (SHIFT + L) = DUNK · SQUARE (L) ALONE = LAY IT IN', 'onevone')).toBe('TURBO + SHOOT = DUNK · SHOOT ALONE = LAY IT IN');
    expect(touchHint('HE IS GATHERING — TRIANGLE (I) TO BLOCK', 'onevone')).toBe('HE IS GATHERING — TAP BLOCK');
    expect(touchHint('LEAN THE STICK AT A MATE + J TO PASS · CIRCLE (K) SCREEN · SQUARE (L) SHOOT', 'threevthree')).toBe('LEAN THE STICK AT A MATE + TAP PASS · SCREEN · SHOOT');
    expect(touchHint('X — NEXT PROP FAMILY · D-PAD picks inside: RIGHT oops, LEFT lobs, DOWN the rest, UP none', 'dunk')).toBe('');
    // the dunk's Y is RUN (a held trigger) on the deck, not the Y button: it is never renamed, so the line goes
    expect(touchHint('Y — SELF-LOB standing: toss it up, then run and catch it in the air', 'dunk')).toBe('');
    expect(touchHint('GO GET THE BOARD · L1 BOXES OUT', 'onevone')).toBe('GO GET THE BOARD');
    expect(touchHint('Y GO UP · B KICK-UP · X HAND', 'dunk')).toBe('');
    expect(touchHint('HOLD RT to load the jump · A at the rim to SLAM', 'dunkduel')).toBe('');
    expect(touchHint('HOLD to run — then tap jump', 'dunk')).toBe('HOLD to run — then tap jump');
  });
  it('a pad and the keys read the line as the mode wrote it', () => {
    const l = 'TAP THE STICK TO JAB · SQUARE (L) SHOOT · L2 (F) POST UP';
    expect(hintForDevice(l, 'onevone', 'pad')).toBe(l);
    expect(hintForDevice(l, 'onevone', 'keys')).toBe(l);
  });
  it('the 3v3 pass chip: J on the keys (as before), the pad\'s own word, nothing on the touch deck', () => {
    expect(passKey('keys', null)).toBe('J');
    expect(passKey('pad', 'xbox')).toBe('A');
    expect(passKey('pad', 'playstation')).toBe('CROSS');
    expect(passKey('touch', null)).toBe('');
  });
});
