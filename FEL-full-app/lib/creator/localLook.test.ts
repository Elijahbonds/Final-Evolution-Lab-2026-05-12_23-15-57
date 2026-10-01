// The device copy refills the editor for the fields the server was not allowed to keep.

import { describe, expect, it } from 'vitest';
import { defaultFace } from '../closet/wearable-catalog';
import { appearanceFromFace, mergeLocalLook } from './localLook';

describe('a device-only look refills the editor', () => {
  it('turns morph weights back into the percent rows the appearance table uses', () => {
    const face = { ...defaultFace(), hairStyle: 'Locs', sliders: { faceLong: 0.42, jawOpen: 1 } };
    const rows = appearanceFromFace(face);
    expect(rows.hairStyle).toBe('Locs');
    expect(rows.faceLong).toBe(42);
    expect(rows.jawOpen).toBe(100);
    expect(rows.faceRound).toBeUndefined();
  });

  it('lets the local face win when the server was not allowed to keep one', () => {
    const server = defaultFace();
    const local = { ...defaultFace(), hairStyle: 'Bun', sliders: { browRaise: 0.5 } };
    const merged = mergeLocalLook(server, { heightScale: 100, buildScale: 100 }, { face: local, heightScale: 103, buildScale: 97 }, {
      uploadFace: false, uploadNumbers: false,
    });
    expect(merged.face.hairStyle).toBe('Bun');
    expect(merged.face.sliders?.browRaise).toBe(0.5);
    expect(merged.heightScale).toBe(103);
    expect(merged.buildScale).toBe(97);
  });

  it('keeps the server presets and overlays only the numbers when that is all that stayed local', () => {
    const server = { ...defaultFace(), hairStyle: 'Fade' };
    const local = { ...defaultFace(), hairStyle: 'Bun', sliders: { faceSquare: 0.2 } };
    const merged = mergeLocalLook(server, { heightScale: 100 }, { face: local, heightScale: 102 }, {
      uploadFace: true, uploadNumbers: false,
    });
    expect(merged.face.hairStyle).toBe('Fade');
    expect(merged.face.sliders?.faceSquare).toBe(0.2);
    expect(merged.heightScale).toBe(102);
  });
});
