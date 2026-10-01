// LOOK PRIVACY (owner, 2026-09-29). Under 18 the written face is the catalog default and the frame is
// standard, even if the client asks to upload. Adults keep categorical face without an opt-in, and
// sliders only after they opt in. Training stays off unless both of those are true. A picture refuses
// the save. The routes call this module; they do not decide the policy themselves.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultFace, type FaceConfig } from '../closet/wearable-catalog';
import { VITAL_DEFAULT } from './schema/vitals';
import { decideLookHold, holdFace, holdFrame, payloadHasImage, privacyRecord } from './lookPrivacy';

const built = (): FaceConfig => ({
  ...defaultFace(),
  hairStyle: 'Afro',
  faceShape: 'Heart',
  sliders: { faceLong: 0.8, faceRound: 0.4, notAMorph: 1 },
});

describe('under 18 the look does not upload', () => {
  it('writes the catalog default face and the standard frame even when both flags are checked', () => {
    const hold = decideLookHold(false, true, true);
    expect(hold).toEqual({ adult: false, uploadFace: false, uploadNumbers: false, modelTraining: false });
    const face = holdFace(built(), hold);
    expect(face).toEqual(defaultFace());
    expect(face.sliders).toBeUndefined();
    expect(holdFrame({ heightScale: 104, buildScale: 108, archetype: 'Guard' }, hold)).toEqual({
      heightScale: VITAL_DEFAULT, buildScale: VITAL_DEFAULT, archetype: 'Guard',
    });
    expect(privacyRecord(hold).modelTraining).toBe(false);
  });
});

describe('an adult chooses what numbers leave the device', () => {
  it('keeps hair and shape and drops sliders and frame numbers when the opt-in is off', () => {
    const hold = decideLookHold(true, false, true);
    expect(hold.uploadFace).toBe(true);
    expect(hold.uploadNumbers).toBe(false);
    expect(hold.modelTraining).toBe(false);
    const face = holdFace(built(), hold);
    expect(face.hairStyle).toBe('Afro');
    expect(face.faceShape).toBe('Heart');
    expect(face.sliders).toBeUndefined();
    expect(holdFrame({ heightScale: 104, buildScale: 96 }, hold).heightScale).toBe(VITAL_DEFAULT);
  });

  it('keeps sanitized sliders only after the numbers opt-in, and training only when that is on too', () => {
    const numbers = decideLookHold(true, true, false);
    expect(numbers.modelTraining).toBe(false);
    const face = holdFace(built(), numbers);
    expect(face.sliders).toEqual({ faceLong: 0.8, faceRound: 0.4 });
    expect(holdFrame({ heightScale: 104, buildScale: 96 }, numbers)).toEqual({ heightScale: 104, buildScale: 96 });

    const both = decideLookHold(true, true, true);
    expect(both.modelTraining).toBe(true);
    expect(privacyRecord(both)).toEqual({ saveLookNumbers: true, modelTraining: true });
  });
});

describe('pictures are refused before any write', () => {
  it('sees a data URL and an https link, and ignores a catalog swatch', () => {
    expect(payloadHasImage({ face: { hairStyle: 'data:image/png;base64,aaaa' } })).toBe(true);
    expect(payloadHasImage({ photo: 'https://example.com/me.png' })).toBe(true);
    expect(payloadHasImage({ face: { skinTone: '#C68642', hairStyle: 'Fade' } })).toBe(false);
  });
});

describe('the save routes use the hold, they do not invent a second one', () => {
  it('closet and athlete both refuse images and write through holdFace', () => {
    const root = resolve(__dirname, '../..');
    for (const rel of ['app/api/v1/closet/route.ts', 'app/api/v1/creator/athlete/route.ts']) {
      const src = readFileSync(resolve(root, rel), 'utf8');
      expect(src, rel).toContain('decideLookHold');
      expect(src, rel).toContain('payloadHasImage');
      expect(src, rel).toContain('holdFace');
      expect(src, rel).toContain('images_not_stored');
    }
  });

  it('nothing outside the consent path reads modelTraining to train', () => {
    const readers = [
      'lib/creator/lookPrivacy.ts',
      'lib/creator/localLook.ts',
      'components/creator/look-consent.tsx',
      'app/api/v1/closet/route.ts',
      'app/api/v1/creator/athlete/route.ts',
      'app/creator/athlete/_components/athlete-creator.tsx',
      'components/closet-view.tsx',
    ];
    const root = resolve(__dirname, '../..');
    for (const rel of readers) expect(readFileSync(resolve(root, rel), 'utf8')).toContain('modelTraining');
    // The flag is stored on the build and in local consent. None of these files hand it to a trainer.
    for (const rel of readers) {
      const src = readFileSync(resolve(root, rel), 'utf8');
      expect(src, rel).not.toMatch(/openai|fineTune\(|trainModel\(/);
    }
  });
});
