// The page's audio session type (lib/audio/session.ts) — MUSIC-SUITE P2 FIX PASS (2026-09-25).
//
// Phase 2 set navigator.audioSession.type = 'playback' inside SoundKit.ensure(), the first time ANY mode built SoundKit's
// context — so (on iOS, assumed) every game mode played through the silent switch and stopped the player's own music —
// while the Academy and /play/calibrate, which build their own contexts, never got it. Now the music rooms CLAIM it and
// give it back; nothing else touches it. The API is Safari's only, so these run against a fake navigator.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PlaybackSessionClaims, PLAYBACK_SESSION_TYPE } from './session';
import { installFakeWebAudio, FakeAudioContext, FakeNode, type FakeWebAudio } from '@/lib/babylon/music/fakeWebAudio';

const nav = (type: string | undefined = 'auto') => ({ audioSession: { type } as { type?: string } });

describe('PlaybackSessionClaims', () => {
  it('a claim sets playback; its release puts back what was there', () => {
    const claims = new PlaybackSessionClaims();
    const n = nav('auto');
    const release = claims.claim(n);
    expect(n.audioSession.type).toBe(PLAYBACK_SESSION_TYPE);
    expect(claims.count).toBe(1);
    release();
    expect(n.audioSession.type).toBe('auto');
    expect(claims.count).toBe(0);
  });

  it('two rooms at once (the Cypher and a calibrate tab\'s engine): the type stays until the LAST release', () => {
    const claims = new PlaybackSessionClaims();
    const n = nav('ambient');
    const a = claims.claim(n), b = claims.claim(n);
    a();
    expect(n.audioSession.type).toBe('playback');
    a();                                                                   // a second release of the same claim does nothing
    expect(claims.count).toBe(1);
    b();
    expect(n.audioSession.type).toBe('ambient');
  });

  it('no API, or one that throws, costs nothing: the claim and its release are no-ops', () => {
    const claims = new PlaybackSessionClaims();
    expect(() => claims.claim(null)()).not.toThrow();
    expect(() => claims.claim({})()).not.toThrow();
    const hostile = { get audioSession(): { type?: string } { throw new Error('refused'); } };
    expect(() => claims.claim(hostile)()).not.toThrow();
    expect(claims.count).toBe(0);
  });

  it('a type someone else changed since is left alone on release', () => {
    const claims = new PlaybackSessionClaims();
    const n = nav('auto');
    const release = claims.claim(n);
    n.audioSession.type = 'play-and-record';                               // e.g. a mic capture took over
    release();
    expect(n.audioSession.type).toBe('play-and-record');
  });
});

describe('who claims it', () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

  it('the music rooms and the calibration screen claim it before they make a sound, and give it back', () => {
    expect(src('lib/babylon/music/AudioEngine.ts')).toMatch(/this\.releaseSession = claimPlaybackSession\(\);\s*\n\s*this\.ctx = new AudioContext\(\);/);
    expect(src('lib/babylon/music/AudioEngine.ts')).toContain('dispose(): void { this.stop(); void this.ctx.close(); this.releaseSession(); }');
    expect(src('lib/modes/music/audio-engine.ts')).toMatch(/this\.releaseSession = claimPlaybackSession\(\);\s*\n\s*this\.ctx = new AudioContext\(\);/);
    expect(src('lib/modes/music/audio-engine.ts')).toContain('dispose(): void { this.stop(); void this.ctx.close(); this.releaseSession(); }');
    expect(src('lib/babylon/modes/DanceMode.ts')).toContain('releaseSession = claimPlaybackSession();');
    expect(src('app/play/calibrate/_components/calibrate-client.tsx')).toContain('claimPlaybackSession()');
  });

  it('SoundKit — every other mode\'s audio — no longer changes it', () => {
    expect(src('lib/babylon/audio/SoundKit.ts')).not.toMatch(/audioSession\.type\s*=|playbackAudioSession\(\)\s*;/);
  });
});

describe('SoundKit on a fake Web Audio (a non-music mode\'s first sound; the music bus)', () => {
  let fake: FakeWebAudio;
  let savedNav: PropertyDescriptor | undefined;
  const session = { type: 'auto' as string | undefined };
  beforeEach(() => {
    fake = installFakeWebAudio();
    (globalThis as unknown as { window: Record<string, unknown> }).window.AudioContext = FakeAudioContext;
    savedNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: { audioSession: session }, configurable: true, writable: true });
  });
  afterEach(() => {
    fake.uninstall();
    if (savedNav) Object.defineProperty(globalThis, 'navigator', savedNav);
    else delete (globalThis as Record<string, unknown>).navigator;
  });

  it('a mode\'s first play/unlock builds the context and leaves the session type alone; the music bus is made once, into the master, undoing its 0.55', async () => {
    const edges: Array<[unknown, unknown]> = [];
    const connect = FakeNode.prototype.connect;
    FakeNode.prototype.connect = function <T>(this: unknown, dest: T): T { edges.push([this, dest]); return dest; };
    try {
      const { SoundKit } = await import('@/lib/babylon/audio/SoundKit');
      SoundKit.unlock();
      SoundKit.play('uiTick');
      expect(session.type).toBe('auto');                                   // P2 set 'playback' here, for every mode
      const g = SoundKit.graph()!;
      expect(g).not.toBeNull();
      expect(SoundKit.graph()!.music).toBe(g.music);                       // created once
      expect((g.music as unknown as { gain: { value: number } }).gain.value).toBeCloseTo(1 / 0.55, 9);
      const musicTo = edges.filter(([from]) => from === g.music).map(([, to]) => to);
      expect(musicTo).toHaveLength(1);
      const master = musicTo[0];
      expect(edges.some(([from]) => from === g.voice)).toBe(true);
      expect(edges.filter(([from]) => from === g.voice).map(([, to]) => to)).toEqual([master]);   // the same master the voice uses
    } finally {
      FakeNode.prototype.connect = connect;
    }
  });
});
