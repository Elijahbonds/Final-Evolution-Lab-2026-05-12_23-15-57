// LOOK PRIVACY (owner, 2026-09-29). Under 18 the written face is the catalog default and the frame is
// standard, even if the client asks to upload. Adults keep categorical face without an opt-in, and
// sliders only after they opt in. Training stays off unless both of those are true. A picture refuses
// the save. The routes call this module; they do not decide the policy themselves.

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultFace, type FaceConfig } from '../closet/wearable-catalog';
import { VITAL_DEFAULT } from './schema/vitals';
import { athleteSaveRequest, closetSaveRequest, decideLookHold, holdFace, holdFrame, payloadHasImage, privacyRecord } from './lookPrivacy';

const built = (): FaceConfig => ({
  ...defaultFace(),
  hairStyle: 'Afro',
  faceShape: 'Heart',
  sliders: { faceLong: 0.8, faceRound: 0.4, 'not-a-morph': 1 },
});

describe('under 18 the look does not upload', () => {
  it('writes the catalog default face and the standard frame even when both flags are checked', () => {
    const hold = decideLookHold(false, true, true);
    expect(hold).toEqual({ adult: false, uploadFace: false, uploadLook: false, uploadNumbers: false, modelTraining: false });
    const face = holdFace(built(), hold);
    expect(face).toEqual(defaultFace());
    expect(face.sliders).toBeUndefined();
    expect(holdFrame({ heightScale: 104, buildScale: 108, archetype: 'Guard' }, hold)).toEqual({
      heightScale: VITAL_DEFAULT, buildScale: VITAL_DEFAULT, archetype: 'Guard',
    });
    expect(privacyRecord(hold).modelTraining).toBe(false);
  });

  it('a minor save request carries no look or equipped data at all', () => {
    const body = athleteSaveRequest({
      adult: false,
      plate: 'ACE',
      saveLookNumbers: true,
      modelTraining: true,
      values: {
        appearance: { hairStyle: 'Locs', faceLong: 80 },
        vitals: { jerseyNumber: 23, heightScale: 104, buildScale: 108 },
        gear: { shoes: 'Evolution Hi-Tops', paletteJersey: '#FF00AA' },
        accessories: { accessory: 'Shard Chain' },
        animations: { animJsBase: 'Set Shot' },
        attributes: { midRange: 70 },
        body: { stance: 'compact' },
      },
    });
    const json = JSON.stringify(body);
    expect(json).not.toMatch(/Locs|ACE|Evolution|Set Shot|faceLong|Shard Chain|FF00AA|jerseyNumber|heightScale|buildScale/);
    expect(body.plate).toBe('');
    expect(body.values.appearance).toBeUndefined();
    expect(body.values.animations).toBeUndefined();
    expect(body.values.accessories).toBeUndefined();
    expect(body.values.gear).toBeUndefined();
    expect(body.values.vitals).toBeUndefined();
    expect(body.values.attributes).toEqual({ midRange: 70 });
    expect(body.values.body).toEqual({ stance: 'compact' });
    expect(body.saveLookNumbers).toBe(false);
    expect(body.modelTraining).toBe(false);

    const closet = closetSaveRequest({
      adult: false,
      face: built(),
      equipped: { shoes: 'shoes_evo', tops: 'top_bonds' },
      jersey: { number: 23, name: 'ACE' },
      skinCardId: 'card-1',
      saveLookNumbers: true,
      modelTraining: true,
    });
    const closetJson = JSON.stringify(closet);
    expect(closetJson).not.toMatch(/Locs|ACE|shoes_evo|top_bonds|card-1|face|equipped|jersey/);
    expect(closet).toEqual({ saveLookNumbers: false, modelTraining: false });
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

// CLOSET-GET-REQ (2026-10-06): an optional first parameter on a route handler (e.g. `req?: NextRequest`)
// builds locally but `next build`'s type check rejects it, because the framework's generated types
// require the handler's declared signature to accept the request it is always called with. #179 shipped
// one of these (app/api/v1/closet/route.ts GET); this walks every route.ts under app/ so it cannot recur
// silently in a route the author didn't think to grep.
describe('no app route handler takes an optional request parameter', () => {
  const findRouteFiles = (dir: string): string[] => {
    const root = resolve(__dirname, '../..', dir);
    const out: string[] = [];
    const walk = (d: string) => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.isFile() && entry.name === 'route.ts') out.push(p);
      }
    };
    walk(root);
    return out;
  };

  it('every exported GET/POST/PUT/PATCH/DELETE requires its request argument', () => {
    const optionalParam = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(\s*[A-Za-z0-9_]+\?\s*:/g;
    for (const file of findRouteFiles('app')) {
      const src = readFileSync(file, 'utf8');
      const hit = src.match(optionalParam);
      expect(hit, file).toBeNull();
    }
  });
});
