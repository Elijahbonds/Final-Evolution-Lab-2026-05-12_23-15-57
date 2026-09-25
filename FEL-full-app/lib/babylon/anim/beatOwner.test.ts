// BeatOwner's HELD beat (HOTFIX 2026-09-24). Slam Rush looped the dunk gather — a one-way clip, standing into the loaded
// crouch — so the body snapped back up to standing twice a second for as long as the charge was held. A held beat plays once
// and parks on its last frame (the basketballTree's holdEnd), and stays the body's until the next beat or settle().
import { describe, expect, it } from 'vitest';
import { BeatOwner } from './beatOwner';
import type { CharacterAnimator } from './CharacterAnimator';

function fakeAnimator() {
  const plays: Array<{ clip: string; loop: boolean; onEnd?: () => void }> = [];
  const frozen: string[] = [];
  const animator = {
    play: (clip: string, o: { loop?: boolean; onEnd?: () => void } = {}) => { plays.push({ clip, loop: !!o.loop, onEnd: o.onEnd }); },
    freezeAtEnd: (clip: string) => { frozen.push(clip); },
  } as unknown as CharacterAnimator;
  /** The clip runs out on its own (the animator raises its end). */
  const end = (clip: string): void => { [...plays].reverse().find((p) => p.clip === clip && !p.loop)?.onEnd?.(); };
  return { animator, plays, frozen, end };
}

describe('a held beat', () => {
  it('parks on its last frame when it runs out — it does not settle into the loop', () => {
    const f = fakeAnimator();
    const body = new BeatOwner(f.animator);
    body.loop('idle');
    let settled = 0;
    body.beat('gather', { holdEnd: true, onSettle: () => { settled++; } });
    f.end('gather');
    expect(f.frozen).toEqual(['gather']);
    expect(f.plays.at(-1)?.clip).toBe('gather');   // idle was not played over it
    expect(body.busy).toBe(true);
    expect(body.current).toBe('gather');
    expect(settled).toBe(1);
  });

  it('a loop asked for during the hold does not cut it; it is where the next beat lands', () => {
    const f = fakeAnimator();
    const body = new BeatOwner(f.animator);
    body.loop('idle');
    body.beat('gather', { holdEnd: true });
    f.end('gather');
    const n = f.plays.length;
    body.loop('stance');
    expect(f.plays.length).toBe(n);
    body.beat('launch');
    f.end('launch');
    expect(f.plays.at(-1)).toMatchObject({ clip: 'stance', loop: true });
    expect(body.busy).toBe(false);
  });

  it('the next beat cuts the hold, and the cut hold never fires again', () => {
    const f = fakeAnimator();
    const body = new BeatOwner(f.animator);
    body.loop('idle');
    body.beat('gather', { holdEnd: true });
    body.beat('launch');                           // released before the gather ran out
    f.end('gather');                               // Babylon raises the cut group's end from stop()
    expect(f.frozen).toEqual([]);
    expect(body.current).toBe('launch');
  });

  it('settle() lifts the hold into the loop', () => {
    const f = fakeAnimator();
    const body = new BeatOwner(f.animator);
    body.loop('idle');
    body.beat('gather', { holdEnd: true });
    f.end('gather');
    body.settle();
    expect(f.plays.at(-1)).toMatchObject({ clip: 'idle', loop: true });
    expect(body.busy).toBe(false);
  });

  it('an ordinary beat still settles into the loop on its own end', () => {
    const f = fakeAnimator();
    const body = new BeatOwner(f.animator);
    body.loop('idle');
    body.beat('launch');
    f.end('launch');
    expect(f.frozen).toEqual([]);
    expect(f.plays.at(-1)).toMatchObject({ clip: 'idle', loop: true });
    expect(body.busy).toBe(false);
  });
});
