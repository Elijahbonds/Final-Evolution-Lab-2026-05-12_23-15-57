// PIPELINES (owner, 2026-10-06): approved adult acting lines as an occasional crowd mic at their own moment, credited.
import { describe, expect, it } from 'vitest';
import { CHANCE, COOLDOWN_SEC, CrowdMicPicker, SLOT_MOMENTS } from './crowdMic';
import { MOMENTS } from '@/lib/babylon/audio/mic/moments';

const line = (id: string, slots: string[]) => ({ cardId: id, title: `Line ${id}`, creator: { name: 'ADA', href: null }, url: `https://x/${id}.webm`, slots });

describe('CrowdMicPicker', () => {
  it('every mapped moment is a real mic moment', () => {
    const ids = new Set(MOMENTS.map((m) => m.id));
    for (const ms of Object.values(SLOT_MOMENTS)) for (const m of ms) expect(ids.has(m), m).toBe(true);
  });
  it('plays a line only at its own slot\'s moments, credited', () => {
    const p = new CrowdMicPicker(() => 0);
    p.setLines([line('a', ['commentary_dunk']), line('b', ['celebration'])]);
    expect(p.hear('three.make', 0)).toBe(null);
    expect(p.hear('dunk.make', 0)).toMatchObject({ line: { cardId: 'a' }, who: 'CROWD MIC · ADA', caption: '“Line a”' });
  });
  it('occasional: the chance gate and the cooldown, and never the same line twice running', () => {
    const miss = new CrowdMicPicker(() => CHANCE);
    miss.setLines([line('a', ['commentary_dunk'])]);
    expect(miss.hear('dunk.make', 0)).toBe(null);
    const p = new CrowdMicPicker(() => 0);
    p.setLines([line('a', ['commentary_dunk']), line('c', ['commentary_dunk'])]);
    expect(p.hear('dunk.make', 0)?.line.cardId).toBe('a');
    expect(p.hear('dunk.make', COOLDOWN_SEC - 1)).toBe(null);
    expect(p.hear('dunk.make', COOLDOWN_SEC + 1)?.line.cardId).toBe('c');
  });
  it('a line for a slot with no mic moment (the boot splash intro) is never picked here', () => {
    const p = new CrowdMicPicker(() => 0);
    p.setLines([line('i', ['player_intro'])]);
    expect(p.size).toBe(0);
  });
});

describe('VoiceKit.playUrl (the PA hand-off)', () => {
  it('refuses anything but https, and is silent (false) with no audio graph', async () => {
    const { VoiceKit } = await import('@/lib/babylon/audio/mic/VoiceKit');
    expect(await VoiceKit.playUrl('http://x/a.webm', 'venice')).toBe(false);
    expect(await VoiceKit.playUrl('https://x/a.webm', 'venice')).toBe(false);
  });
});
