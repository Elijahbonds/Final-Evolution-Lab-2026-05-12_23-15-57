// HOOPS MOTION phase 3 (S1) — a held beat parks the clip that PLAYED. BeatOwner's holdEnd freezes by the name it asked for; with the
// captures installed that name must reach freezeAtEnd as the capture's, or the body snaps from the capture's last pose to the authored
// clip's in one frame (measured: the 3v3 spin, bball_mc_spin → bball_spin, the held ball 0.70–0.74 m in a frame).
import { describe, expect, it, vi } from 'vitest';

vi.mock('./authored/mocapOpponents', () => ({
  MOCAP_OPPONENT_CLIPS: [{ name: 'bball_mc_spin', replaces: 'bball_spin' }],
  buildMocapOpponentClip: (_s: unknown, _k: unknown, c: { name: string }) => ({ name: c.name }),
}));
vi.mock('./clipScope', () => ({ scopeAllows: () => true, scopeForScene: () => null }));

import { installOpponentMotion } from './opponentMotion';

describe('installOpponentMotion routes a held beat\'s freeze through the capture', () => {
  it('freezeAtEnd(authored name) parks the capture that played; a clip with no capture is parked as asked', () => {
    const frozen: string[] = [], played: string[] = [];
    const clipNames = new Set(['bball_spin', 'bball_hook']);
    const animator = {
      clipNames,
      register: (g: { name: string }) => { clipNames.add(g.name); },
      play: (n: string) => { played.push(n); return true; },
      setPlaybackScale: () => undefined,
      durationOf: () => 1,
      freezeAtEnd: (n: string) => { frozen.push(n); },
    };
    const installed = installOpponentMotion(animator as never, {} as never, {} as never, null);
    expect(installed).toEqual(['bball_mc_spin']);
    animator.play('bball_spin');
    animator.freezeAtEnd('bball_spin');
    animator.freezeAtEnd('bball_hook');
    expect(played).toEqual(['bball_mc_spin']);
    expect(frozen).toEqual(['bball_mc_spin', 'bball_hook']);
  });
});
