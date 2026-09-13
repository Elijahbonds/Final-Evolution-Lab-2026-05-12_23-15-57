// THE MIC IS SHUT UNLESS IT IS PROVABLY MEANT TO BE OPEN (2026-09-13).
//
// Two failures matter here and neither is a normal bug:
//   · a child's voice reaches a stranger
//   · a microphone is live while the player believes it is closed
//
// Both are silent when they happen and both are found by someone else. So the rules are tested as
// properties over the whole input space rather than by example, and the age rule is tested by trying every
// combination of every other flag against it.

import { describe, it, expect } from 'vitest';
import {
  eligibility, canUseVoice, freshVoiceState, isTransmitting, holdTalk, releaseTalk, setSelfMuted, setMode,
  indicator, roomIsFull, MAX_VOICE_PEERS, PTT_TAIL_MS, type VoiceSubject,
} from './voicePolicy';

const adult: VoiceSubject = { minor: false, consented: true, hasDevice: true };

describe('THE UNDER-18 RULE CANNOT BE TALKED AROUND', () => {
  it('a minor is refused whatever else is true', () => {
    // every combination of the other flags, against minor: true
    for (const consented of [true, false, undefined]) {
      for (const hasDevice of [true, false, undefined]) {
        const e = eligibility({ minor: true, consented, hasDevice });
        expect(e.allowed, JSON.stringify({ consented, hasDevice })).toBe(false);
        expect(e.reason).toBe('minor');
      }
    }
  });

  it('AN UNKNOWN AGE IS TREATED AS A MINOR — it fails closed', () => {
    // a system that cannot tell how old someone is does not get to guess toward opening a microphone
    const e = eligibility({ consented: true, hasDevice: true });
    expect(e.allowed).toBe(false);
    expect(e.reason).toBe('unknown-age');
  });

  it('and the age is checked BEFORE consent, so a minor is never told to turn their mic on', () => {
    const e = eligibility({ minor: true, consented: false, hasDevice: false });
    expect(e.reason).toBe('minor');
    expect(e.message).not.toMatch(/turn it on|microphone/i);
  });

  it('an adult still has to opt in, and still needs a device', () => {
    expect(eligibility({ minor: false, consented: false, hasDevice: true }).reason).toBe('no-consent');
    expect(eligibility({ minor: false, consented: true, hasDevice: false }).reason).toBe('no-device');
    expect(canUseVoice(adult)).toBe(true);
  });

  it('every denial explains itself without blaming the player', () => {
    for (const s of [{ minor: true }, {}, { minor: false }, { minor: false, consented: true }]) {
      const e = eligibility(s);
      expect(e.message.length).toBeGreaterThan(10);
      expect(e.message).not.toMatch(/error|invalid|failed/i);
    }
  });
});

describe('PUSH TO TALK — the mic closes when the player thinks it closed', () => {
  const t0 = 10_000;

  it('is shut by default', () => {
    expect(isTransmitting(freshVoiceState(), true, t0)).toBe(false);
  });

  it('opens on hold and closes after the tail', () => {
    let s = holdTalk(freshVoiceState());
    expect(isTransmitting(s, true, t0)).toBe(true);
    s = releaseTalk(s, t0);
    expect(isTransmitting(s, true, t0 + PTT_TAIL_MS - 20), 'the tail should still carry').toBe(true);
    expect(isTransmitting(s, true, t0 + PTT_TAIL_MS + 1), 'the tail must expire').toBe(false);
  });

  it('the tail is short enough that nobody says a second sentence into it', () => {
    expect(PTT_TAIL_MS).toBeLessThanOrEqual(400);
    expect(PTT_TAIL_MS).toBeGreaterThan(80);   // and long enough not to clip the last syllable
  });

  it('SELF-MUTE OUTRANKS EVERYTHING, including a held key and a running tail', () => {
    const held = holdTalk(freshVoiceState());
    expect(isTransmitting(setSelfMuted(held, true), true, t0)).toBe(false);
    const tailing = releaseTalk(held, t0);
    expect(isTransmitting(setSelfMuted(tailing, true), true, t0 + 10)).toBe(false);
  });

  it('unmuting does not silently reopen a mic that was held before the mute', () => {
    let s = holdTalk(freshVoiceState());
    s = setSelfMuted(s, true);
    s = setSelfMuted(s, false);
    expect(isTransmitting(s, true, t0)).toBe(false);
  });

  it('SWITCHING INTO PUSH-TO-TALK CLOSES THE MIC', () => {
    // otherwise an open-mic player who switches keeps transmitting until their next key press, which is the
    // exact "live mic the player thinks is shut" failure
    const open = setMode(freshVoiceState('open-mic'), 'open-mic');
    expect(isTransmitting(open, true, t0)).toBe(true);
    expect(isTransmitting(setMode(open, 'push-to-talk'), true, t0)).toBe(false);
  });

  it('an ineligible player never transmits, in any state', () => {
    for (const s of [freshVoiceState(), holdTalk(freshVoiceState()), setMode(freshVoiceState(), 'open-mic')]) {
      expect(isTransmitting(s, false, t0)).toBe(false);
    }
  });

  it('releasing a key that was never held changes nothing', () => {
    const s = freshVoiceState();
    expect(releaseTalk(s, t0)).toBe(s);
    expect(isTransmitting(releaseTalk(s, t0), true, t0)).toBe(false);
  });
});

describe('THE INDICATOR AND THE MIC CANNOT DISAGREE', () => {
  const t0 = 5_000;

  it('anything transmitting reads LIVE, and nothing else does', () => {
    const states = [
      freshVoiceState(), holdTalk(freshVoiceState()), releaseTalk(holdTalk(freshVoiceState()), t0),
      setSelfMuted(holdTalk(freshVoiceState()), true), setMode(freshVoiceState(), 'open-mic'),
    ];
    for (const eligible of [true, false]) {
      for (const s of states) {
        for (const now of [t0, t0 + 100, t0 + 1000]) {
          const live = isTransmitting(s, eligible, now);
          expect(indicator(s, eligible, now).live, JSON.stringify({ s, eligible, now })).toBe(live);
        }
      }
    }
  });

  it('a live mic is never rendered as nothing', () => {
    const s = holdTalk(freshVoiceState());
    expect(indicator(s, true, t0).label).toBe('LIVE');
    expect(indicator(s, true, t0).label.length).toBeGreaterThan(0);
  });

  it('and the off states say which off they are', () => {
    expect(indicator(freshVoiceState(), false, t0).label).toBe('VOICE OFF');
    expect(indicator(setSelfMuted(freshVoiceState(), true), true, t0).label).toBe('MUTED');
    expect(indicator(freshVoiceState(), true, t0).label).toBe('HOLD TO TALK');
    // open-mic while eligible and unmuted IS live — there is no quieter label for it, and pretending
    // otherwise would be the indicator disagreeing with the microphone
    expect(indicator(setMode(freshVoiceState(), 'open-mic'), true, t0).label).toBe('LIVE');
  });
});

describe('the mesh has a ceiling and it is enforced', () => {
  it('party-sized, because every client uploads to every other', () => {
    expect(MAX_VOICE_PEERS).toBeLessThanOrEqual(8);
    expect(roomIsFull(MAX_VOICE_PEERS - 1)).toBe(false);
    expect(roomIsFull(MAX_VOICE_PEERS)).toBe(true);
    expect(roomIsFull(MAX_VOICE_PEERS + 3)).toBe(true);
  });
});
