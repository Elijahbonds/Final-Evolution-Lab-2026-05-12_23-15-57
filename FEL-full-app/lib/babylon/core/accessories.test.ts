// Who wears what, and does it stay that way (appearance pass, 2026-09-16).
//
// The wardrobe is two tops, one short and two shoes, so before this every character in the game was the same person in
// a different colour — a row of five NPCs in the dunk mode is five clones. Accessories are the cheapest real identity
// available without the Blender pipeline, and the thing that makes them work is that they are DEALT, not randomised:
// a rival keeps his signature every night, and an NPC re-spawned between rounds comes back wearing what it had on.
import { describe, expect, it } from 'vitest';
import { accessoriesFor, lookFor, seedOf, ACCESSORY_IDS, RIVAL_LOOKS } from './accessories';

describe('the deal is deterministic', () => {
  it('the same character is dressed the same way every time', () => {
    for (const key of ['RIVAL_1', 'npc_3', 42, 'SILK']) {
      const a = accessoriesFor(key), b = accessoriesFor(key);
      expect(a.items, String(key)).toEqual(b.items);
      expect(a.accent.toHexString(), String(key)).toBe(b.accent.toHexString());
      expect(a.side, String(key)).toBe(b.side);
    }
  });

  it('different characters are dressed differently — a row of five is five people', () => {
    const looks = [0, 1, 2, 3, 4].map((i) => {
      const a = accessoriesFor(`row_body_${i}`);
      return `${a.items.join('+')}|${a.accent.toHexString()}|${a.side}`;
    });
    expect(new Set(looks).size).toBeGreaterThanOrEqual(4);   // five clones would be 1
  });

  it('the hash is a hash: neighbouring keys do not collide into one look', () => {
    const seeds = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => seedOf(`body_${i}`));
    expect(new Set(seeds.map((s) => Math.floor(s * 9))).size).toBeGreaterThan(3);
    for (const s of seeds) { expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThan(1); }
  });
});

describe('what they are allowed to wear', () => {
  it('nobody is a Christmas tree', () => {
    for (let i = 0; i < 60; i++) expect(accessoriesFor(`body_${i}`).items.length).toBeLessThanOrEqual(3);
  });

  it('every item dealt is one that exists', () => {
    for (let i = 0; i < 60; i++) for (const id of accessoriesFor(`body_${i}`).items) expect(ACCESSORY_IDS).toContain(id);
    for (const [name, look] of Object.entries(RIVAL_LOOKS)) for (const id of look.items) expect(ACCESSORY_IDS, name).toContain(id);
  });

  it('a caller can cap it — a mode that wants its bodies plain still gets a look, just less of one', () => {
    for (let i = 0; i < 20; i++) expect(accessoriesFor(`body_${i}`, { maxItems: 1 }).items.length).toBeLessThanOrEqual(1);
  });

  it('an accent can be forced, for a team that has colours', () => {
    expect(accessoriesFor('x', { accent: '#ff0000' }).accent.toHexString()).toBe('#FF0000');
  });
});

describe('a rival is somebody', () => {
  it('every judge/rival name has a signature, and it is the one they get', () => {
    for (const [name, sig] of Object.entries(RIVAL_LOOKS)) {
      const look = lookFor(name);
      expect(look.items, name).toEqual(sig.items);
      expect(look.accent.toHexString().toLowerCase(), name).toBe(sig.accent.toUpperCase().toLowerCase());
      expect(look.side, name).toBe(sig.side);
    }
  });

  it('their name is not case-sensitive — the mode spells them how it likes', () => {
    expect(lookFor('silk').items).toEqual(RIVAL_LOOKS.SILK.items);
  });

  it('and the signatures differ from each other, which is the whole point of a signature', () => {
    const sigs = Object.values(RIVAL_LOOKS).map((s) => s.items.join('+'));
    expect(new Set(sigs).size).toBe(sigs.length);
  });

  it('anyone unnamed still gets a look they keep', () => {
    expect(lookFor('SOME NEW GUY').items).toEqual(lookFor('SOME NEW GUY').items);
  });
});
