// THE SAVE SPLITS A BUILD IN TWO, SO IT HAS TO PUT IT BACK EXACTLY (2026-09-14).
//
// The look goes to AvatarLook — the row the Closet already owns — and the rest to AthleteBuild. That is
// the right shape and it has one failure mode worth more than all the others: a field that survives the
// split and not the merge is a field that silently resets the next time the player saves. So the central
// test here is a ROUND TRIP over a build that touches every section.

import { describe, it, expect } from 'vitest';
import { toLook, toBuild, fromStorage, validateForSave, equippedIds, availableNamesFor, type Values } from './saveBuild';
import { filterEquipped, canEquip, refusedItems, FREE_ITEMS } from '../../closet/ownership';
import { defaultFace, defaultEquipped, getWearable, sanitizeJersey } from '../../closet/wearable-catalog';
import { displayValue } from '../editor/rowState';
import { GEAR, ACCESSORIES } from './gear';
import { VITALS } from './vitals';
import { BODY } from './body';
import { APPEARANCE } from './appearance';

/** A build that touches every section, so the round trip has something to lose. */
const FULL: Values = {
  attributes: { threePoint: 80, drivingDunk: 72 },
  tendencies: { spotUpThree: 65 },
  traits: {},
  hotZones: { cornerThreeR: 'BURNING', paint: 'COLD' },
  mechanics: { jsBase: 'Loaded Hinge' },
  vitals: { heightScale: 106, buildScale: 97, reachScale: 103, jerseyNumber: 23 },
  body: { archetype: 'powerful', stance: 'tall' },
  appearance: { hairStyle: 'Locs', skinTone: '#6F4321', jawOpen: 40 },
  gear: { tops: 'Bonds Signature Jersey', shoes: 'Evolution Hi-Tops', headwear: null, paletteJersey: '#FFD700' },
  accessories: { accessory: 'Shard Chain' },
};

describe('the split sends each part where it already belongs', () => {
  it('gives AvatarLook exactly the three fields the Closet owns, and no build data', () => {
    const look = toLook(FULL, 'BONDS');
    expect(Object.keys(look).sort()).toEqual(['equipped', 'face', 'jersey']);
    expect(look.face.hairStyle).toBe('Locs');
    expect(look.equipped.tops).toBe('top_bonds');
    expect(look.equipped.accessory).toBe('acc_chain');
    expect(look.jersey).toEqual(sanitizeJersey({ number: 23, name: 'BONDS' }));
    expect(JSON.stringify(look)).not.toContain('threePoint');
  });

  it('keeps the build out of AvatarLook and the look out of the build', () => {
    const build = toBuild(FULL);
    expect(build.attributes.threePoint).toBe(80);
    expect(build.frame.heightScale).toBe(106);
    expect(build.frame.archetype).toBe('powerful');
    expect(build.palette.paletteJersey).toBe('#FFD700');
    // the face, the garments and the plate are NOT duplicated here
    const json = JSON.stringify(build);
    expect(json).not.toContain('Locs');
    expect(json).not.toContain('top_bonds');
    expect(json).not.toContain('BONDS');
  });

  it('stores the jersey NUMBER once — in the row the Closet already has', () => {
    const build = toBuild(FULL);
    expect(build.frame.jerseyNumber).toBeUndefined();
    expect(toLook(FULL).jersey.number).toBe(23);
  });
});

describe('the round trip loses nothing', () => {
  it('comes back with every value that went in', () => {
    const back = fromStorage(toBuild(FULL), toLook(FULL, 'BONDS'));
    expect(back.attributes).toEqual(FULL.attributes);
    expect(back.tendencies).toEqual(FULL.tendencies);
    expect(back.hotZones).toEqual(FULL.hotZones);
    expect(back.mechanics).toEqual(FULL.mechanics);
    expect(back.vitals).toMatchObject({ heightScale: 106, buildScale: 97, reachScale: 103, jerseyNumber: 23 });
    expect(back.body).toEqual({ archetype: 'powerful', stance: 'tall' });
    expect(back.appearance!.hairStyle).toBe('Locs');
    expect(back.appearance!.skinTone).toBe('#6F4321');
    expect(back.gear!.tops).toBe('Bonds Signature Jersey');
    expect(back.gear!.shoes).toBe('Evolution Hi-Tops');
    expect(back.gear!.paletteJersey).toBe('#FFD700');
    expect(back.accessories!.accessory).toBe('Shard Chain');
  });

  it('survives a second trip unchanged — the test that a slow drift would fail', () => {
    const once = fromStorage(toBuild(FULL), toLook(FULL, 'BONDS'));
    const twice = fromStorage(toBuild(once), toLook(once, 'BONDS'));
    expect(twice).toEqual(once);
  });

  it('brings a morph back as the percent the row shows, not the fraction the face stores', () => {
    const look = toLook(FULL);
    expect(look.face.sliders?.jawOpen).toBeCloseTo(0.4, 3);
    expect(fromStorage(toBuild(FULL), look).appearance!.jawOpen).toBe(40);
  });

  it('comes back to the same DISPLAY names the rows offer, never raw item ids', () => {
    const back = fromStorage(toBuild(FULL), toLook(FULL));
    for (const row of [...GEAR.rows.filter((r) => r.tab === 'Kit'), ...ACCESSORIES.rows]) {
      const target = row.section === 'accessories' ? back.accessories! : back.gear!;
      const v = target[row.id];
      if (v === null || v === undefined) continue;
      expect(row.options, `${row.id} came back as "${v}"`).toContain(v);
    }
  });

  it('loads an EMPTY account onto the defaults the screen already shows', () => {
    const back = fromStorage(null, { face: defaultFace(), equipped: defaultEquipped(), jersey: { number: 0, name: '' } });
    for (const row of APPEARANCE.rows) {
      if (row.kind !== 'slot') continue;
      expect(displayValue(row, back.appearance![row.id] ?? null), row.id).toBe(displayValue(row, null));
    }
    // and nothing was invented for a section the account has never opened
    for (const row of [...VITALS.rows, ...BODY.rows]) {
      const v = (row.section === 'vitals' ? back.vitals : back.body)![row.id];
      if (v !== undefined) expect(displayValue(row, v)).toBe(displayValue(row, null));
    }
  });

  it('drops a garment whose id no longer ships rather than guessing a replacement', () => {
    const back = fromStorage(toBuild(FULL), { ...toLook(FULL), equipped: { tops: 'top_retired_2019' } });
    expect(back.gear!.tops).toBeNull();
  });
});

describe('the server has its own verdict', () => {
  it('refuses a build that breaks a rule, and says which row', () => {
    const over: Values = { ...FULL, hotZones: Object.fromEntries(['cornerThreeL', 'cornerThreeR', 'wingThreeL', 'wingThreeR', 'paint'].map((z) => [z, 'BURNING'])) };
    const v = validateForSave(over, null);
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.section === 'hotZones')).toBe(true);
  });

  it('passes a legal build, PRQ or no PRQ — a guest is never refused for not having a scan', () => {
    expect(validateForSave(FULL, null).ok).toBe(true);
    expect(validateForSave(FULL, { speed: 40 }).ok).toBe(true);
  });

  it('catches a ceiling a hand-rolled POST tried to walk past', () => {
    const cheat: Values = { ...FULL, attributes: { ...FULL.attributes, speed: 99 } };
    expect(validateForSave(cheat, { speed: 20 }).ok).toBe(false);
    expect(validateForSave(cheat, null).ok).toBe(true);        // no scan, no ceiling — the standing rule
  });
});

describe('ownership is decided once, by the server', () => {
  it('lets the free starters through on an account that owns nothing', () => {
    const none = new Set<string>();
    for (const id of FREE_ITEMS) expect(canEquip(id, none), id).toBe(true);
    expect(canEquip('top_bonds', none)).toBe(false);
    expect(canEquip(null, none)).toBe(true);                   // wearing nothing needs no entitlement
  });

  it('empties an unowned slot rather than substituting something else', () => {
    const owned = new Set(['shoes_evo']);
    const out = filterEquipped(equippedIds(FULL), owned);
    expect(out.tops).toBeNull();                               // Bonds jersey is not owned
    expect(out.shoes).toBe('shoes_evo');                       // this one is
    expect(refusedItems(equippedIds(FULL), owned)).toContain('top_bonds');
  });

  it('keeps every slot it was given, so "cleared" and "never mentioned" stay different', () => {
    const out = filterEquipped({ tops: 'top_bonds', headwear: null }, new Set());
    expect(Object.keys(out).sort()).toEqual(['headwear', 'tops']);
    expect(out.headwear).toBeNull();
  });

  it('can name what a slot does offer when it refuses one', () => {
    expect(availableNamesFor('shoes')).toContain(getWearable('shoes_flight')!.name);
    expect(availableNamesFor('nonsense')).toEqual([]);
  });
});
