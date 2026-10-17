// Style pass (owner 2026-10-16: "There needs to be a clothing/ style pass. More casual, like the meshy models"): what each forge
// rival wears (scripts/avatar/rivalWear.mts), held to the owner's decisions S1-S4.
import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { Color3 } from '@babylonjs/core';
import { RIVAL_WEAR, SNEAKERS, TOP_ID, BOTTOM_ID, garmentFor } from '../../../scripts/avatar/rivalWear.mts';
import { ACCESSORY_IDS, RETIRED_ACCESSORIES, bakedLook } from './accessories';

const keys = readdirSync('public/models/rivals').filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
const wear = Object.entries(RIVAL_WEAR);

describe('every forge rival has its own casual outfit', () => {
  it('one wardrobe per rival on disk, no more, no fewer', () => expect(Object.keys(RIVAL_WEAR).sort()).toEqual(keys));
  it('the mix: printed tees, numbered jerseys and polos up top; baggy shorts, cargos and jean shorts below', () => {
    const count = (k: string, v: string) => wear.filter(([, w]) => (w as unknown as Record<string, string>)[k] === v).length;
    expect([count('top', 'tee'), count('top', 'tank'), count('top', 'polo')]).toEqual([13, 9, 2]);
    expect([count('bottom', 'baggy'), count('bottom', 'cargo'), count('bottom', 'jeanShort')]).toEqual([17, 5, 2]);
    // nobody in the first build's short jean short and keyhole tank, and the kit ids are the casual ones
    expect(new Set(wear.map(([, w]) => TOP_ID[w.top]))).toEqual(new Set(['top_tee', 'top_jersey', 'top_polo']));
    expect(new Set(wear.map(([, w]) => BOTTOM_ID[w.bottom]))).toEqual(new Set(['shorts_baggy', 'pants_cargo', 'shorts_jean']));
    expect(garmentFor('tank', 'male', 'x')).not.toBe('toigo_keyhole_tank_top');   // the jersey is the tee, sleeves cut (the keyhole tank was a leopard map)
  });
  it('sneakers only: the brown leather shoes01 is gone', () => {
    for (const [, w] of wear) for (const s of w.shoes) expect(SNEAKERS as readonly string[]).toContain(s);
  });
  it('a numbered jersey says a number front and back; prints are our own words (no brands, no leagues)', () => {
    const BANNED = /NIKE|ADIDAS|JORDAN|PUMA|REEBOK|UNDER ARMOUR|NBA|WNBA|NCAA|AND1|SPALDING|WILSON|LAKERS|CELTICS|BULLS|KNICKS|WARRIORS/;
    for (const [k, w] of wear) {
      if (w.top === 'tank') { expect(w.front.kind, k).toBe('number'); expect(w.back.n, k).toBeTypeOf('number'); }
      const words = [JSON.stringify(w.front), w.back.name ?? ''].join(' ').toUpperCase();
      expect(BANNED.test(words), `${k}: ${words}`).toBe(false);
      for (const n of [w.back.n, w.front.kind === 'number' ? w.front.n : undefined]) if (n != null) { expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThan(100); }
    }
  });
  it('a top is light enough for its dark print to read (the print darkens the cloth: a near-black top hid it)', () => {
    for (const [k, w] of wear) {
      const c = Color3.FromHexString(w.jersey); const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      expect(lum, `${k} ${w.jersey}`).toBeGreaterThan(0.3);
    }
  });
  it('each signature is real accessories, never a retired one, and a third of the field goes plain or near it', () => {
    for (const [k, w] of wear) for (const i of w.look.items) { expect(ACCESSORY_IDS as readonly string[], k).toContain(i); expect(RETIRED_ACCESSORIES as readonly string[], k).not.toContain(i); }
    expect(wear.filter(([, w]) => w.look.items.length <= 1).length).toBeGreaterThanOrEqual(8);   // nobody is a Christmas tree
  });
});

describe('the baked signature (accessories.bakedLook)', () => {
  it('reads the armature extra into a set: unknown and retired pieces dropped, the side and accent kept', () => {
    const s = bakedLook({ items: ['headband', 'crewsocks', 'cape'], accent: '#e63946', side: 'Left' })!;
    expect(s.items).toEqual(['headband']);
    expect(s.side).toBe('Left');
    expect(s.accent.toHexString().toLowerCase()).toBe('#e63946');
  });
  it('a dealt fit\'s accent wins (the accessories answer the colours the body is wearing); a body with none deals as before', () => {
    expect(bakedLook({ items: ['chain'], accent: '#e63946', side: 'Right' }, new Color3(0, 1, 0))!.accent.g).toBe(1);
    expect(bakedLook(undefined)).toBeNull();
    expect(bakedLook({ items: 'headband' })).toBeNull();
    expect(bakedLook({ items: [] })!.items).toEqual([]);   // a deliberate plain look is a look
  });
});
