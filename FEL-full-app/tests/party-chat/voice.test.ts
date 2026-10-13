// PARTY-CHAT (2026-10-13): the pure parts of party voice. The live mesh runs in the two-browser probe.
import { describe, it, expect } from 'vitest';
import { offers, micLive, nextSpeaking, voiceProblem, VOICE_CONSTRAINTS, SPEAK_ON, SPEAK_OFF, SPEAK_HOLD_MS, NO_VOICE } from '@/lib/party/social/voice';

describe('party voice rules', () => {
  it('exactly one side of every link offers', () => {
    expect(offers('ma', 'mb')).toBe(true);
    expect(offers('mb', 'ma')).toBe(false);
  });
  it('asks for echo cancellation, noise suppression and auto gain; audio only', () => {
    expect(VOICE_CONSTRAINTS.video).toBe(false);
    expect(VOICE_CONSTRAINTS.audio).toMatchObject({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
  });
  it('the mic sends only when joined, unmuted, not deafened, and (push-to-talk) held', () => {
    const v = { ...NO_VOICE, joined: true };
    expect(micLive(v)).toBe(true);
    expect(micLive({ ...v, muted: true })).toBe(false);
    expect(micLive({ ...v, deafened: true })).toBe(false);
    expect(micLive({ ...v, ptt: true })).toBe(false);
    expect(micLive({ ...v, ptt: true, talking: true })).toBe(true);
    expect(micLive({ ...NO_VOICE, talking: true })).toBe(false);
  });
  it('speaking has hysteresis: no flicker between words', () => {
    let s = nextSpeaking(false, SPEAK_ON + 0.01, null, 0);
    expect(s.speaking).toBe(true);
    s = nextSpeaking(true, SPEAK_OFF / 2, s.quietSince, 100);
    expect(s.speaking).toBe(true);                    // a short pause
    s = nextSpeaking(true, SPEAK_OFF / 2, s.quietSince, 100 + SPEAK_HOLD_MS);
    expect(s.speaking).toBe(false);
    expect(nextSpeaking(false, (SPEAK_ON + SPEAK_OFF) / 2, null, 0).speaking).toBe(false);   // a murmur does not start it
  });
  it('one plain line when voice is not working', () => {
    expect(voiceProblem({ joined: false, mic: 'denied', peers: {} })).toMatch(/microphone is blocked/);
    expect(voiceProblem({ joined: true, mic: 'on', peers: { a: 'failed', b: 'failed' } })).toBe("Voice couldn't connect on this network. Text and quick chat still work.");
    expect(voiceProblem({ joined: true, mic: 'on', peers: { a: 'failed', b: 'connected' } })).toBeNull();
    expect(voiceProblem({ joined: true, mic: 'on', peers: {} })).toBeNull();
  });
});
