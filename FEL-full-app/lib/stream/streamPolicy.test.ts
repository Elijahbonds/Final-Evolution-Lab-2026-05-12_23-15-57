// NOBODY GOES LIVE BY ACCIDENT (2026-09-13).
//
// A stream carries a face and a room. The failures worth testing are the ones that are silent when they
// happen: a minor broadcasting, a camera on when the player thought only the game was going out, a button
// that says Go Live for a thing that cannot go live, and a stream that is public when the player meant to
// show one friend.

import { describe, it, expect } from 'vitest';
import {
  eligibility, canStream, availableKinds, defaultComposition, compositionSummary, sharingPersonal,
  spectatorsFull, MAX_SPECTATORS, DEFAULT_VISIBILITY, visibilityLabel, viewerControls, BROADCAST_READY,
  type StreamKind,
} from './streamPolicy';

const KINDS: StreamKind[] = ['spectate', 'record', 'broadcast'];

describe('THE UNDER-18 RULE HOLDS FOR EVERY KIND OF STREAM', () => {
  it('a minor is refused all three, whatever else is true', () => {
    for (const kind of KINDS) {
      for (const consented of [true, false, undefined]) {
        for (const hasCapture of [true, false, undefined]) {
          const e = eligibility(kind, { minor: true, consented, hasCapture });
          expect(e.allowed, `${kind} ${consented} ${hasCapture}`).toBe(false);
          expect(e.reason).toBe('minor');
        }
      }
    }
  });

  it('UNKNOWN AGE FAILS CLOSED, same as voice', () => {
    for (const kind of KINDS) {
      expect(eligibility(kind, { consented: true, hasCapture: true }).reason).toBe('unknown-age');
    }
  });

  it('and a minor is never walked through consent first', () => {
    const e = eligibility('spectate', { minor: true, consented: false });
    expect(e.reason).toBe('minor');
    expect(e.message).not.toMatch(/turn it on/i);
  });
});

describe('THE UI IS NEVER OFFERED A BUTTON THAT WILL REFUSE', () => {
  it('broadcast is unavailable until a relay exists, and says why', () => {
    const e = eligibility('broadcast', { minor: false, consented: true, hasCapture: true });
    expect(BROADCAST_READY).toBe(false);
    expect(e.allowed).toBe(false);
    expect(e.reason).toBe('unavailable');
    // it names what the player CAN do instead, rather than being a dead end
    expect(e.message).toMatch(/in-app|record/i);
  });

  it('availableKinds offers exactly what will work', () => {
    const adult = availableKinds({ minor: false });
    expect(adult).toContain('spectate');
    expect(adult).toContain('record');
    expect(adult).not.toContain('broadcast');
    expect(availableKinds({ minor: true })).toEqual([]);
    expect(availableKinds({})).toEqual([]);
  });

  it('an adult can spectate and record once they opt in and capture starts', () => {
    expect(canStream('spectate', { minor: false, consented: true, hasCapture: true })).toBe(true);
    expect(canStream('record', { minor: false, consented: true, hasCapture: true })).toBe(true);
    expect(eligibility('spectate', { minor: false, consented: false }).reason).toBe('no-consent');
    expect(eligibility('spectate', { minor: false, consented: true }).reason).toBe('no-capture');
  });
});

describe('EVERY PERSONAL CHANNEL STARTS OFF', () => {
  it('the default shares the game and nothing about the person', () => {
    const c = defaultComposition();
    expect(c.game).toBe(true);
    expect(c.gameAudio).toBe(true);
    expect(c.camera).toBe(false);
    expect(c.microphone).toBe(false);
    expect(sharingPersonal(c)).toBe(false);
  });

  it('THE SUMMARY NAMES EVERY PERSONAL CHANNEL THAT IS ON', () => {
    // a player must never have to remember what they enabled ten minutes ago to know if their face is out
    expect(compositionSummary(defaultComposition())).toBe('GAME · GAME AUDIO');
    expect(compositionSummary({ game: true, gameAudio: true, camera: true, microphone: false }))
      .toBe('GAME · GAME AUDIO · CAMERA');
    expect(compositionSummary({ game: true, gameAudio: false, camera: true, microphone: true }))
      .toBe('GAME · CAMERA · MIC');
  });

  it('sharingPersonal is true whenever a camera OR a mic is out', () => {
    for (const camera of [true, false]) {
      for (const microphone of [true, false]) {
        expect(sharingPersonal({ game: true, gameAudio: true, camera, microphone }))
          .toBe(camera || microphone);
      }
    }
  });
});

describe('visibility and viewers', () => {
  it('INVITE-ONLY IS THE DEFAULT', () => {
    // "public by default" is how someone gets broadcast to strangers by a button they read as "show my friend"
    expect(DEFAULT_VISIBILITY).toBe('invite-only');
  });

  it('every visibility says plainly who can watch', () => {
    expect(visibilityLabel('invite-only')).toMatch(/only people you invite/i);
    expect(visibilityLabel('lobby')).toMatch(/lobby/i);
    expect(visibilityLabel('public')).toMatch(/anyone/i);
  });

  it('the mesh ceiling applies to spectators too', () => {
    expect(MAX_SPECTATORS).toBeLessThanOrEqual(8);
    expect(spectatorsFull(MAX_SPECTATORS - 1)).toBe(false);
    expect(spectatorsFull(MAX_SPECTATORS)).toBe(true);
  });

  it('A VIEWER CAN ALWAYS LEAVE, MUTE AND REPORT — never gated', () => {
    const c = viewerControls();
    expect(c.canLeave).toBe(true);
    expect(c.canMute).toBe(true);
    expect(c.canReport).toBe(true);
  });
});
