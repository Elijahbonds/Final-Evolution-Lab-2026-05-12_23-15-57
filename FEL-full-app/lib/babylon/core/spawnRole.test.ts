// EVERYONE-BODY-MOCAP-OPPONENTS (2026-09-14): the owner saw two of himself in a dunk duel because P2 spawned untinted on
// the hero URL. The library decides who is the player now, per scene — these are the cases the modes actually produce.
import { describe, it, expect } from 'vitest';
import { NullEngine, Scene, TransformNode } from '@babylonjs/core';
import { decideRole, trackPlayerBody } from './CharacterLibrary';

describe('decideRole — an opponent is never the player\'s body', () => {
  it('the first untinted hero spawn is the player; the next (dunk duel P2) is an opponent', () => {
    const scene = new Scene(new NullEngine());
    expect(decideRole(scene, true, {})).toBe('player');
    trackPlayerBody(scene, new TransformNode('p1', scene));
    expect(decideRole(scene, true, {})).toBe('opponent');
  });

  it('a tint always means an opponent; an explicit role always wins', () => {
    const scene = new Scene(new NullEngine());
    expect(decideRole(scene, true, { tint: '#ff2d78' })).toBe('opponent');
    trackPlayerBody(scene, new TransformNode('p1', scene));
    expect(decideRole(scene, true, { role: 'player' })).toBe('player');   // a preview swapping bodies
  });

  it('a HIDDEN player (the carnival hub host during an event) or a disposed one does not count', () => {
    const scene = new Scene(new NullEngine());
    const host = new TransformNode('host', scene);
    trackPlayerBody(scene, host);
    host.setEnabled(false);
    expect(decideRole(scene, true, {})).toBe('player');                   // the event's own player
    host.setEnabled(true);
    expect(decideRole(scene, true, {})).toBe('opponent');
    host.dispose();
    expect(decideRole(scene, true, {})).toBe('player');                   // the next round's respawn
  });

  it('a body asked for by its own file (not the hero slot) is never re-cast as an opponent by count', () => {
    const scene = new Scene(new NullEngine());
    trackPlayerBody(scene, new TransformNode('p1', scene));
    expect(decideRole(scene, false, {})).toBe('player');
  });

  it('scenes do not share players', () => {
    const a = new Scene(new NullEngine()), b = new Scene(new NullEngine());
    trackPlayerBody(a, new TransformNode('p', a));
    expect(decideRole(b, true, {})).toBe('player');
  });
});
