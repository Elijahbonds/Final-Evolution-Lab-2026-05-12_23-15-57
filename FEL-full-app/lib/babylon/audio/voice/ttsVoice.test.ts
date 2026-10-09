// VOICEOVER (2026-10-06): the browser voice, when one has to speak, is the least robotic one the device has.
import { describe, expect, it } from 'vitest';
import { TTS_PITCH, pickTtsVoice, scoreTtsVoice } from './ttsVoice';

const V = (name: string, lang = 'en-US', extra: Partial<{ localService: boolean; default: boolean }> = {}) => ({ name, lang, ...extra });

describe('pickTtsVoice', () => {
  it('prefers a neural/natural voice over the default one', () => {
    const list = [V('eSpeak English', 'en-US', { default: true, localService: true }), V('Microsoft Aria Online (Natural) - English (United States)'), V('Fred')];
    expect(pickTtsVoice(list)?.name).toMatch(/Aria/);
  });
  it('a good stock voice beats an unknown one; novelty voices are never chosen while anything else exists', () => {
    expect(pickTtsVoice([V('Zarvox'), V('Samantha'), V('Bad News')])?.name).toBe('Samantha');
    expect(pickTtsVoice([V('Zarvox'), V('Some Voice')])?.name).toBe('Some Voice');
    expect(pickTtsVoice([V('Samantha (Enhanced)'), V('Samantha')])?.name).toBe('Samantha (Enhanced)');
  });
  it('matches the page language first, and never picks a non-English voice for an English line', () => {
    expect(pickTtsVoice([V('Daniel', 'en-GB'), V('Alex', 'en-US')], 'en-GB')?.name).toBe('Daniel');
    expect(pickTtsVoice([V('Thomas', 'fr-FR'), V('Anna', 'de-DE')])).toBeNull();
    expect(scoreTtsVoice(V('Google español', 'es-ES'))).toBe(-Infinity);
    expect(pickTtsVoice([V('Karen', 'en_AU')])?.name).toBe('Karen');
  });
  it('an empty list (Chrome before voiceschanged) is null: the engine default then', () => {
    expect(pickTtsVoice([])).toBeNull();
  });
  it('speaks at the natural pitch', () => { expect(TTS_PITCH).toBe(1); });
});
