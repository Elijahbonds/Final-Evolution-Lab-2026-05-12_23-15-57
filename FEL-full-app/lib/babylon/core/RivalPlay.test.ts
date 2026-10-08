// DUNK MOTION phase 11 — the rival plays like a person (owner: "it needs to look like one of the users attempts or like another
// person was playing"). His pad's two decisions: what he goes for, and where his SLAM lands.
import { describe, it, expect } from 'vitest';
import { rivalTricksFor, rivalSlamOffset, RIVAL_REACH } from './RivalPlay';
import { DUNK_TRICKS, SIGNATURE_DUNKS, SLAM_EDGE_EXEC, slamExecution } from './DunkSystem';
import { DUNK_RIVALS } from './DunkRivals';
import { rivalPressAt, rivalHitsBeats, RIVAL_BEAT_LEAD } from './RivalPlay';
import { gradeTrickPress, BEAT_TOL_SEC, trickBeats } from './DunkBeats';
import { CUE_BEAT_T, cueVerdict } from './DunkSystem';

const fixed = (v: number) => () => v;

describe('what the rival goes for', () => {
  it('a plain one when he is not reaching, his OWN dunk in the middle', () => {
    expect(rivalTricksFor(RIVAL_REACH.plain - 0.1, 'TOMAHAWK')).toEqual([]);
    expect(rivalTricksFor(RIVAL_REACH.plain + 0.5, 'TOMAHAWK').map((t) => t.id)).toEqual(['tomahawk']);
    expect(rivalTricksFor(RIVAL_REACH.plain + 0.5, 'BETWEEN THE LEGS').map((t) => t.id)).toEqual(['betweenlegs']);
  });
  it('every rival on the roster has a signature the vocabulary can throw', () => {
    for (const r of DUNK_RIVALS) expect(DUNK_TRICKS.some((t) => t.label === r.signature), `${r.name}: ${r.signature}`).toBe(true);
  });
  it('reaching harder: his own dunk or one a notch harder than it', () => {
    const sig = DUNK_TRICKS.find((t) => t.id === 'tomahawk')!;
    for (const r of [0, 0.3, 0.6, 0.9]) {
      const [t] = rivalTricksFor(RIVAL_REACH.signature + 0.5, 'TOMAHAWK', fixed(r));
      expect(t.id === 'tomahawk' || (t.difficulty > sig.difficulty && t.difficulty <= sig.difficulty + 1.2), t.id).toBe(true);
    }
  });
  it('going for it: a NAMED chain that opens with his dunk when there is one', () => {
    const chain = rivalTricksFor(RIVAL_REACH.harder + 1, '360', fixed(0));
    expect(chain.length).toBe(2);
    expect(chain[0].id).toBe('spin360');
    expect(SIGNATURE_DUNKS.some((d) => !d.runway && d.air.join() === chain.map((t) => t.id).join())).toBe(true);
    // a signature no chain opens with still gets a real, named chain
    const other = rivalTricksFor(RIVAL_REACH.harder + 1, 'TOMAHAWK', fixed(0));
    expect(SIGNATURE_DUNKS.some((d) => !d.runway && d.air.join() === other.map((t) => t.id).join())).toBe(true);
  });
});

describe('where his SLAM lands', () => {
  const half = 0.14, reach = 0.3;   // (the buffer's reach only shapes presses EARLIER than the window — his never are)
  it('the execution the card reads IS the one he rolled — late or early', () => {
    for (const acc of [1, 0.9, 0.75, 0.5, 0.2]) {
      expect(slamExecution(1.25 + rivalSlamOffset(acc, false, half), 1.25, half, reach)).toBeCloseTo(Math.min(1, acc + 0.02 * (1 - acc)), 2);
      if (acc >= SLAM_EDGE_EXEC) expect(slamExecution(1.25 + rivalSlamOffset(acc, true, half), 1.25, half, reach)).toBeCloseTo(acc, 5);
    }
  });
  it('a clean one can be early; a leaky one is late (never refused as too early)', () => {
    expect(rivalSlamOffset(0.95, true, half)).toBeLessThan(0);
    expect(rivalSlamOffset(0.5, true, half)).toBeGreaterThan(0);
    expect(rivalSlamOffset(0.5, false, half)).toBeLessThan(half);   // still inside the window
  });
});

// dunk-next phase 1 — the rival's pad hits the beats when his attempt is clean, and is the old pad when it is not.

describe('the rival and the beats', () => {
  const T = (id: string) => DUNK_TRICKS.find((t) => t.id === id)!;
  it('a clean attempt hits beats; a leaky or a blown one does not', () => {
    expect(rivalHitsBeats(SLAM_EDGE_EXEC, false)).toBe(true);
    expect(rivalHitsBeats(SLAM_EDGE_EXEC - 0.01, false)).toBe(false);
    expect(rivalHitsBeats(1, true)).toBe(false);
    expect(rivalHitsBeats(NaN, false)).toBe(false);
  });
  it('off the beat he presses the moment he can — the old pad, unchanged', () => {
    for (const t of DUNK_TRICKS) expect(rivalPressAt(t, 0.06, false)).toBe(0.06);
  });
  it('on the beat every press of his grades ON THE BEAT, and inside the trick\'s window', () => {
    expect(RIVAL_BEAT_LEAD).toBeLessThan(BEAT_TOL_SEC);
    for (const t of DUNK_TRICKS) for (const after of [0.06, CUE_BEAT_T.rise + 0.12, CUE_BEAT_T.hang + 0.05]) {
      const at = rivalPressAt(t, after, true);
      expect(at).toBeGreaterThanOrEqual(after);
      const lastBeat = CUE_BEAT_T[trickBeats(t)[trickBeats(t).length - 1]];
      if (after <= lastBeat - RIVAL_BEAT_LEAD) {
        expect(gradeTrickPress(t, at).grade, `${t.id} after ${after}`).toBe('onbeat');
        expect(cueVerdict(t, at + RIVAL_BEAT_LEAD)).toBe('fire');
      } else expect(at).toBe(after);   // nothing left to hit: he presses when he can (refused late, as before)
    }
  });
  it('a chain goes beat by beat: the 360 on the rise, the eastbay on the hang', () => {
    const first = rivalPressAt(T('spin360'), 0.06, true);
    expect(gradeTrickPress(T('spin360'), first)).toMatchObject({ grade: 'onbeat', beat: 'rise' });
    const second = rivalPressAt(T('eastbay'), CUE_BEAT_T.rise + 0.12, true);
    expect(gradeTrickPress(T('eastbay'), second)).toMatchObject({ grade: 'onbeat', beat: 'hang' });
  });
});
