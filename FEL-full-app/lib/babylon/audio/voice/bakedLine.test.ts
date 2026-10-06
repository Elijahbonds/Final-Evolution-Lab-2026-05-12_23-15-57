// bakedLine (IMPROVE 2026-10-06): a page's line is said with takes when the whole line, or every sentence of it, has one.
import { describe, it, expect } from 'vitest';
import { bakedClipsFor, splitSentences } from './bakedLine';
import { captionWithoutAudio, textKey } from '../mic/VoiceKit';

const bank = new Map<string, string>([
  ["I couldn't read that one — once more.", 'coach/page.mirror.screen.30'],
  ['Move to the middle of the shot.', 'coach/page.mirror.framing.07'],
  ['Face the camera.', 'coach/page.mirror.screen.09'],
  ['Next up!', 'coach/page.proveit.02'],
].map(([t, id]) => [textKey(t), id]));
const find = (t: string): string | undefined => bank.get(textKey(t));

describe('bakedClipsFor', () => {
  it('splits a line into its sentences, punctuation kept', () => {
    expect(splitSentences('Good. Next one.')).toEqual(['Good.', 'Next one.']);
    expect(splitSentences("I couldn't read that one — once more. Move to the middle of the shot.")).toEqual(["I couldn't read that one — once more.", 'Move to the middle of the shot.']);
    expect(splitSentences('Next up!')).toEqual(['Next up!']);
    expect(splitSentences('  ')).toEqual([]);
  });
  it('the whole line\'s take first, then one take per sentence when every sentence has one', () => {
    expect(bakedClipsFor('next up', find)).toEqual(['coach/page.proveit.02']);
    expect(bakedClipsFor("I couldn't read that one — once more. Move to the middle of the shot.", find))
      .toEqual(['coach/page.mirror.screen.30', 'coach/page.mirror.framing.07']);
    expect(bakedClipsFor('Face the camera. Move to the middle of the shot.', find)).toEqual(['coach/page.mirror.screen.09', 'coach/page.mirror.framing.07']);
  });
  it('a line with any sentence not recorded is said whole by the browser (never half and half)', () => {
    expect(bakedClipsFor('34 inches, judges 8.5. Next up!', find)).toBeNull();
    expect(bakedClipsFor('Something new.', find)).toBeNull();
    expect(bakedClipsFor('', find)).toBeNull();
  });
});

describe('a host line\'s caption', () => {
  it('shows without audio (voice off, no bank), never for a dropped line; a played line showed it on start', () => {
    expect(captionWithoutAudio('off')).toBe(true);
    expect(captionWithoutAudio('missing')).toBe(true);
    expect(captionWithoutAudio('dropped')).toBe(false);
    expect(captionWithoutAudio('played')).toBe(false);
  });
});
