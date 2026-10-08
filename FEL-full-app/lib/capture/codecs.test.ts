import { describe, expect, it } from 'vitest';
import { CODEC_CHOICES, pickCodec } from './codecs';

describe('codec fallback', () => {
  it('uses vp9 when the browser has it, and says nothing', () => {
    const pick = pickCodec(() => true);
    expect(pick.mime).toBe(CODEC_CHOICES[0]);
    expect(pick.fallbackNote).toBeNull();
  });

  it('on iOS Safari, falls back and says so', () => {
    const pick = pickCodec(
      (mime) => mime.startsWith('video/mp4'),
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1',
    );
    expect(pick.mime).toMatch(/mp4/);
    expect(pick.fallbackNote).toMatch(/iOS Safari/);
    expect(pick.fallbackNote).toMatch(/cannot record/);
  });

  it('when nothing is named, the note points at the browser default', () => {
    const pick = pickCodec(() => false, 'Mozilla/5.0 (iPhone)');
    expect(pick.mime).toBeNull();
    expect(pick.fallbackNote).toMatch(/browser default/i);
    expect(pick.fallbackNote).toMatch(/iOS Safari/);
  });
});
