// hoops-gap: the contact voice (`hoops.contactVoiceOn`, audio/hoopsSfx contactVoice) on SoundKit's fake Web Audio graph (the pattern of
// SoundKit.samples.test.ts). Off: an `impact` is the impact synth, exactly as before. On, with the court's bank: a hand on the ball is the
// recorded slap over a knock, a body the thud synth; a pile-up inside CONTACT_MIN_GAP_SEC is one sound; the mute silences it; off the
// court (no hoops bank) the impact stays the impact.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, FakeAudioBuffer, installFakeWebAudio, type FakeWebAudio } from '../music/fakeWebAudio';
import { contactVoice, CONTACT_HAND_PITCH, CONTACT_VOICE_ON } from './hoopsSfx';

let fake: FakeWebAudio;
const decoded = new WeakSet<object>();
beforeEach(() => {
  vi.resetModules();
  fake = installFakeWebAudio();
  (globalThis as unknown as { window: { AudioContext?: unknown } }).window.AudioContext = FakeAudioContext;
  vi.stubGlobal('fetch', async (url: string) => ({ ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(url).buffer }));
  vi.spyOn(FakeAudioContext.prototype, 'decodeAudioData').mockImplementation(async function (this: FakeAudioContext) {
    const b = new FakeAudioBuffer(1, Math.round(this.sampleRate * 0.3), this.sampleRate); decoded.add(b); return b;
  });
});
afterEach(() => { fake.uninstall(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function kit(on: number) {
  const { SoundKit } = await import('./SoundKit');
  const feel = await import('../../feel-panel/feel');
  feel.setFeelUser(true); feel.setFeelSession(null); feel.setFeelOverride('hoops.contactVoiceOn', on);
  SoundKit.unlock();
  const g = SoundKit.graph()!;
  const ctx = g.ctx as unknown as FakeAudioContext & { currentTime: number; starts: { buffer?: unknown }[]; oscillators?: unknown[] };
  const one = (fn: () => void) => {
    const n0 = ctx.starts.length; fn();
    const s = ctx.starts.slice(n0);
    return { all: s, samples: s.filter((x) => x.buffer && decoded.has(x.buffer as object)) };
  };
  return { SoundKit, ctx, one };
}
const advance = (ctx: { currentTime: number }, sec: number) => { (ctx as { currentTime: number }).currentTime += sec; };

describe('the contact voice', () => {
  it('ships off', () => { expect(CONTACT_VOICE_ON).toBe(0); });

  it('the pure map: a hand on the ball is the slap over a knock, a body the thud; the call\'s volume rides through', () => {
    const hand = contactVoice(1.5, 0.5);
    expect(hand.map((c) => c.name)).toEqual(['catch', 'thud']);
    expect(hand[0].opts.volume).toBeCloseTo(0.5, 5);
    const body = contactVoice(0.82, 0.7);
    expect(body.map((c) => c.name)).toEqual(['thud']);
    expect(contactVoice(CONTACT_HAND_PITCH, 1)[0].name).toBe('catch');
    expect(contactVoice(CONTACT_HAND_PITCH - 0.01, 1)[0].name).toBe('thud');
  });

  it('off: an impact on the court is the impact synth, exactly as before', async () => {
    const off = await kit(0);
    await off.SoundKit.useSampleBank('hoops');
    const a = off.one(() => off.SoundKit.play('impact', { pitch: 1.5, volume: 0.5 }));
    expect(a.samples.length).toBe(0);
    expect(a.all.length).toBe(2);   // the square boop and its noise crack
  });

  it('on, on the court: a strip plays the recorded slap; a bump plays no recording; two in one instant are one', async () => {
    const on = await kit(1);
    await on.SoundKit.useSampleBank('hoops');
    const strip = on.one(() => on.SoundKit.play('impact', { pitch: 1.3, volume: 0.45 }));
    expect(strip.samples.length).toBe(1);
    advance(on.ctx, 0.5);
    const bump = on.one(() => on.SoundKit.play('impact', { pitch: 0.95, volume: 0.55 }));
    expect(bump.samples.length).toBe(0);
    expect(bump.all.length).toBeGreaterThan(0);
    // a pile-up: the same instant again is dropped
    const again = on.one(() => on.SoundKit.play('impact', { pitch: 0.95, volume: 0.55 }));
    expect(again.all.length).toBe(0);
    advance(on.ctx, 0.1);
    expect(on.one(() => on.SoundKit.play('impact', { pitch: 0.95, volume: 0.55 })).all.length).toBeGreaterThan(0);
  });

  it('on: the mute silences it', async () => {
    const on = await kit(1);
    await on.SoundKit.useSampleBank('hoops');
    on.SoundKit.setEnabled(false, true);
    expect(on.one(() => on.SoundKit.play('impact', { pitch: 1.3, volume: 0.45 })).all.length).toBe(0);
    expect(on.one(() => on.SoundKit.play('impact', { pitch: 0.9, volume: 0.55 })).all.length).toBe(0);
  });

  it('on, off the court (no hoops bank): the impact stays the impact', async () => {
    const on = await kit(1);
    await on.SoundKit.useSampleBank(null);
    const a = on.one(() => on.SoundKit.play('impact', { pitch: 1.3, volume: 0.45 }));
    expect(a.samples.length).toBe(0); expect(a.all.length).toBe(2);
  });

  it('on: the pile-up gap is on this context\'s clock — a new context (its clock back at 0) is not muted by the old one', async () => {
    const on = await kit(1);
    await on.SoundKit.useSampleBank('hoops');
    advance(on.ctx, 300);
    expect(on.one(() => on.SoundKit.play('impact', { pitch: 0.95, volume: 0.55 })).all.length).toBeGreaterThan(0);
    (on.SoundKit as unknown as { ctx: unknown }).ctx = null;   // the context is rebuilt (the loudness probe does this per render)
    const g2 = on.SoundKit.graph()!; const ctx2 = g2.ctx as unknown as { starts: unknown[] };
    const n0 = ctx2.starts.length; on.SoundKit.play('impact', { pitch: 0.95, volume: 0.55 });
    expect(ctx2.starts.length).toBeGreaterThan(n0);
  });
});

