// THE PREVIEW IS A CONSUMER (2026-09-14). Spec §10 step 6.
//
// The failure these tests exist to catch is not a crash — it is a preview that disagrees with the game. A
// colour that looks one way in the creator and another in a mode, a shoe the preview shows and the spawn
// does not, a height the player dragged that the rig never applied. So the assertions are all of the form
// "the binding produces the shape the identity pipe consumes, with the values the rows actually hold".

import { describe, it, expect } from 'vitest';
import { bindPreview, bindFace, bindPalette, bindWardrobe, bindProportions } from './previewBinding';
import { defaultFace, defaultEquipped, getWearable, sanitizeJersey, HAIR_STYLES } from '../../closet/wearable-catalog';
import { GEAR } from '../schema/gear';
import { VITALS } from '../schema/vitals';
import { displayValue } from './rowState';

describe('an untouched creator previews exactly what the screen is showing', () => {
  it('gives the Closet\'s own default face rather than an empty one', () => {
    const face = bindFace(undefined);
    const d = defaultFace();
    expect(face.skinTone).toBe(d.skinTone);
    expect(face.hairStyle).toBe(d.hairStyle);
    expect(face.faceShape).toBe(d.faceShape);
    expect(face.sliders).toBeUndefined();          // no morph weight until somebody moves one
  });

  it('dresses the player in the Closet\'s own default kit, by item id', () => {
    const w = bindWardrobe(undefined, undefined);
    const eq = defaultEquipped();
    expect(w.tops).toBe(eq.tops);
    expect(w.shorts).toBe(eq.shorts);
    expect(w.shoes).toBe(eq.shoes);
    expect(w.headwear).toBeNull();                 // optional, and the closet equips nothing
  });

  it('paints the palette the identity pipe reads, defaulted to each garment\'s own accent', () => {
    const p = bindPalette(undefined);
    expect(p.jersey).toBe(getWearable(defaultEquipped().tops!)!.accent.toUpperCase());
    expect(p.shoes).toBe(getWearable(defaultEquipped().shoes!)!.accent.toUpperCase());
    for (const hex of Object.values(p)) expect(hex).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('stands at the standard frame, not at the bottom of the range', () => {
    const b = bindPreview({});
    expect(b.proportions.heightScale).toBe(1);
    expect(b.proportions.buildScale).toBe(1);
    expect(b.proportions.reachScale).toBe(1);
    expect(b.proportions.stance).toBe('athletic');
  });

  // The binding must agree with the ROW, not with its own idea of a default — the drift this whole folder
  // exists to prevent.
  it('matches, field for field, what the editor prints on an untouched row', () => {
    const b = bindPreview({});
    const h = VITALS.rows.find((r) => r.id === 'heightScale')!;
    expect(`${Math.round(b.proportions.heightScale * 100)}%`).toBe(displayValue(h, null));
    for (const id of ['paletteJersey', 'paletteShorts', 'paletteShoes', 'paletteAccent'] as const) {
      const row = GEAR.rows.find((r) => r.id === id)!;
      const key = id.replace('palette', '').toLowerCase() as keyof typeof b.palette;
      expect(b.palette[key === 'footwear' ? 'shoes' : key], id).toBe(displayValue(row, null));
    }
    for (const row of GEAR.rows.filter((r) => r.tab === 'Kit')) {
      const shown = displayValue(row, null);
      expect(b.wardrobe[row.id], row.id).toBe(shown === 'NONE' ? null : getWearable(b.wardrobe[row.id] ?? '')?.itemId ?? null);
      if (shown !== 'NONE') expect(getWearable(b.wardrobe[row.id]!)!.name).toBe(shown);
    }
  });
});

describe('what the player changes is what the preview shows', () => {
  it('carries a chosen hairstyle, colour and shoe straight through', () => {
    const b = bindPreview({
      appearance: { hairStyle: HAIR_STYLES[2] },
      gear: { shoes: 'Evolution Hi-Tops', paletteJersey: '#FF3366' },
    });
    expect(b.face.hairStyle).toBe(HAIR_STYLES[2]);
    expect(b.wardrobe.shoes).toBe('shoes_evo');
    expect(b.palette.jersey).toBe('#FF3366');
  });

  it('turns percent rows into the scan\'s own fractions, which is what the rig multiplies by', () => {
    const b = bindPreview({ vitals: { heightScale: 110, buildScale: 94, reachScale: 105 } });
    expect(b.proportions.heightScale).toBeCloseTo(1.1, 5);
    expect(b.proportions.buildScale).toBeCloseTo(0.94, 5);
    expect(b.proportions.reachScale).toBeCloseTo(1.05, 5);
  });

  it('turns percent morphs into the 0–1 weights the sanitiser keeps, and drops the zeroes', () => {
    const face = bindFace({ jawOpen: 40, browRaise: 0 });
    expect(face.sliders?.jawOpen).toBeCloseTo(0.4, 3);
    expect(face.sliders?.browRaise).toBeUndefined();
  });

  it('never previews a jersey number the server would refuse', () => {
    expect(bindPreview({ vitals: { jerseyNumber: 500 } }).jersey.number).toBe(sanitizeJersey({ number: 500 }).number);
    expect(bindPreview({ vitals: { jerseyNumber: 23 } }, 'bonds!!').jersey.name).toBe(sanitizeJersey({ name: 'bonds!!' }).name);
  });

  it('empties a slot the player emptied rather than falling back to a default', () => {
    expect(bindWardrobe({ headwear: null }, undefined).headwear).toBeNull();
    // ...and an id nothing resolves becomes empty rather than a guess
    expect(bindWardrobe({ tops: 'A Jersey That Does Not Exist' }, undefined).tops).toBeNull();
  });

  it('hands the identity pipe the exact shape it takes', () => {
    const b = bindPreview({ body: { stance: 'tall' } });
    expect(Object.keys(b).sort()).toEqual(['face', 'jersey', 'palette', 'proportions', 'wardrobe']);
    expect(b.proportions.stance).toBe('tall');
    expect(b.proportions.palette.skin).toBe(b.face.skinTone);
    expect(bindProportions(undefined, { stance: 'compact' }, b.face, b.palette).stance).toBe('compact');
  });
});
