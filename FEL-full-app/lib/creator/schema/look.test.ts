// THE FIVE COSMETIC SECTIONS, AND THE ONE RULE THEY ALL LIVE BY (2026-09-14).
//
//   NOTHING ON THESE SCREENS MAY BE OFFERED UNLESS SOMETHING IN THE ENGINE CAN RENDER IT.
//
// That is the whole point of these tests. A character creator's failure mode is not a crash, it is a
// hairstyle that renders bald, a shoe id nothing resolves and a height the rig never applies — and every
// one of those looks perfect in the editor. So each row's option list is checked against the module that
// actually consumes it: the closet catalog for faces and garments, `AvatarSpec` for the body scales,
// `sanitizeJersey` for the number.

import { describe, it, expect } from 'vitest';
import { VITALS, VITAL_RANGE, VITAL_DEFAULT } from './vitals';
import { APPEARANCE } from './appearance';
import { BODY, ARCHETYPES, STANCES } from './body';
import { GEAR, ACCESSORIES, KIT_COLOURS, wearableIdFor, optionsForSlot } from './gear';
import { SIDEBAR, builtSections } from './sections';
import { resolve, LOOK_SECTIONS } from './resolve';
import { tabsOf, type SlotRow, type RatedRow } from './types';
import { step, canStep, displayValue } from '../editor/rowState';
import {
  SKIN_TONES, HAIR_STYLES, FACE_SLIDER_KEYS, WEARABLES, getWearable, sanitizeJersey, defaultFace,
  defaultEquipped,
} from '../../closet/wearable-catalog';
import { HOT_ZONES, ZONE_STATES, ZONE_DEFAULT, zoneMultiplier } from './hotZones';
import { buildAvatarSpec } from '../../workout/avatar-builder';
import { DEFAULT_AVATAR, HEIGHT_RANGE } from '../../babylon/types/avatar';

const rowsOf = (t: { rows: readonly { id: string }[] }) => t.rows;

describe('every cosmetic row is renderable at all', () => {
  it('gives every row a glossary and a unique id within its section', () => {
    for (const t of [VITALS, APPEARANCE, BODY, GEAR, ACCESSORIES]) {
      const ids = rowsOf(t).map((r) => r.id);
      expect(new Set(ids).size, t.title).toBe(ids.length);
      for (const r of t.rows) expect(r.glossary.length, r.id).toBeGreaterThan(10);
    }
  });

  it('offers at least one choice on every slot row — an empty list is an unusable control', () => {
    for (const t of [APPEARANCE, BODY, GEAR, ACCESSORIES]) {
      for (const r of t.rows) if (r.kind === 'slot') expect((r as SlotRow).options.length, r.id).toBeGreaterThan(0);
    }
  });
});

describe('appearance points at the closet rather than restating it', () => {
  it('uses the catalog arrays themselves, so a new hairstyle needs no edit here', () => {
    const hair = APPEARANCE.rows.find((r) => r.id === 'hairStyle') as SlotRow;
    const skin = APPEARANCE.rows.find((r) => r.id === 'skinTone') as SlotRow;
    expect(hair.options).toBe(HAIR_STYLES);       // identity, not a copy
    expect(skin.options).toBe(SKIN_TONES);
  });

  it('keeps the inclusive ranges the catalog treats as a product requirement', () => {
    const skin = APPEARANCE.rows.find((r) => r.id === 'skinTone') as SlotRow;
    expect(skin.options.length).toBeGreaterThanOrEqual(12);
    const hair = APPEARANCE.rows.find((r) => r.id === 'hairStyle') as SlotRow;
    for (const style of ['Afro', 'Box Braids', 'Locs', 'Cornrows', 'Hijab']) expect(hair.options).toContain(style);
  });

  it('covers every field of the FaceConfig the renderer reads', () => {
    const ids = new Set(APPEARANCE.rows.map((r) => r.id));
    for (const key of Object.keys(defaultFace())) {
      if (key === 'sliders') continue;
      expect(ids.has(key), `no row for FaceConfig.${key}`).toBe(true);
    }
  });

  it('offers exactly the morphs the sanitiser will keep — no row for a weight that gets dropped', () => {
    const sliderIds = APPEARANCE.rows.filter((r) => r.tab === 'Fine Tune').map((r) => r.id);
    expect(new Set(sliderIds)).toEqual(new Set(FACE_SLIDER_KEYS));
  });

  it('splits into the two tabs the screen derives, without either being declared', () => {
    expect(tabsOf(APPEARANCE)).toEqual(['Face', 'Fine Tune']);
  });
});

describe('vitals map onto the scales the rig actually applies', () => {
  it('can express every body a movement scan can produce', () => {
    // Sweep the scan wide — well past anything a real athlete produces — and the editor must still be
    // able to represent the result. A creator that cannot show you the body your scan gave you is worse
    // than one with no scan at all.
    for (let jump = 10; jump <= 110; jump += 5) {
      for (let depth = 40; depth <= 140; depth += 10) {
        for (let cad = 120; cad <= 220; cad += 10) {
          const spec = buildAvatarSpec({ jumpHeightCm: jump, depthDeg: depth, asymmetryPct: 0, valgusL: 0, valgusR: 0, cadenceSpm: cad, trunkLeanDeg: 0 });
          for (const [id, v] of [['heightScale', spec.heightScale], ['buildScale', spec.buildScale], ['reachScale', spec.reachScale]] as const) {
            const row = VITALS.rows.find((r) => r.id === id) as RatedRow;
            const pct = Math.round(v * 100);
            expect(pct, `${id} ${v}`).toBeGreaterThanOrEqual(row.min);
            expect(pct, `${id} ${v}`).toBeLessThanOrEqual(row.max);
          }
        }
      }
    }
  });

  it('contains the avatar height range the builder clamps to', () => {
    const h = VITALS.rows.find((r) => r.id === 'heightScale') as RatedRow;
    expect(h.min).toBeLessThanOrEqual(Math.round(HEIGHT_RANGE[0] * 100));
    expect(h.max).toBeGreaterThanOrEqual(Math.round(HEIGHT_RANGE[1] * 100));
  });

  it('is never capped by a measured axis — dimensions are not capacities', () => {
    for (const r of VITALS.rows) expect((r as RatedRow).prqAxis, r.id).toBeNull();
  });

  it('agrees with the jersey sanitiser about 0–99 rather than guessing', () => {
    const n = VITALS.rows.find((r) => r.id === 'jerseyNumber') as RatedRow;
    expect(sanitizeJersey({ number: 500 }).number).toBe(n.max);
    expect(sanitizeJersey({ number: -5 }).number).toBe(n.min);
  });

  it('prints its unit so 104 is not mistaken for a rating', () => {
    const h = VITALS.rows.find((r) => r.id === 'heightScale') as RatedRow;
    expect(displayValue(h, 104)).toBe('104%');
    expect(displayValue(VITALS.rows.find((r) => r.id === 'jerseyNumber') as RatedRow, 23)).toBe('23');
    expect(VITAL_DEFAULT).toBeGreaterThanOrEqual(VITAL_RANGE.height[0]);
    expect(VITAL_DEFAULT).toBeLessThanOrEqual(VITAL_RANGE.height[1]);
  });
});

describe('body offers only bodies that ship', () => {
  it('names the three archetypes the avatar types declare', () => {
    const r = BODY.rows.find((x) => x.id === 'archetype') as SlotRow;
    expect([...r.options]).toEqual([...ARCHETYPES]);
    expect(r.options).toContain(DEFAULT_AVATAR.archetype);
  });

  it('names the three stances the movement scan can produce', () => {
    const r = BODY.rows.find((x) => x.id === 'stance') as SlotRow;
    const seen = new Set<string>();
    for (let jump = 10; jump <= 110; jump += 5) {
      for (let depth = 40; depth <= 140; depth += 10) {
        seen.add(buildAvatarSpec({ jumpHeightCm: jump, depthDeg: depth, asymmetryPct: 0, valgusL: 0, valgusR: 0, cadenceSpm: 170, trunkLeanDeg: 0 }).stance);
      }
    }
    for (const s of seen) expect(r.options, `scan produced stance "${s}"`).toContain(s);
    expect([...r.options]).toEqual([...STANCES]);
  });

  it('never lets a body be empty — everyone has one', () => {
    for (const r of BODY.rows) expect((r as SlotRow).allowNone).toBe(false);
  });
});

describe('gear is the shipped closet and nothing else', () => {
  it('resolves every option back to a real item, unambiguously', () => {
    for (const r of [...GEAR.rows, ...ACCESSORIES.rows]) {
      if (r.tab === 'Colours') continue;
      for (const name of (r as SlotRow).options) {
        const id = wearableIdFor(name);
        expect(id, `${r.id} → "${name}"`).toBeTruthy();
        expect(getWearable(id!)?.name).toBe(name);
      }
    }
  });

  it('has no two items sharing a display name, which would make the mapping a coin flip', () => {
    const names = WEARABLES.map((w) => w.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('covers every wearable slot the closet defines except the one Accessories owns', () => {
    const kitRows = GEAR.rows.filter((r) => r.tab === 'Kit');
    expect(kitRows.map((r) => r.id)).toEqual(['headwear', 'tops', 'shorts', 'shoes']);
    expect((ACCESSORIES.rows[0] as SlotRow).options).toEqual(optionsForSlot('accessory'));
  });

  it('lets you wear nothing on your head, and not nothing on your feet', () => {
    const by = (id: string) => GEAR.rows.find((r) => r.id === id) as SlotRow;
    expect(by('headwear').allowNone).toBe(true);
    expect(by('shoes').allowNone).toBe(false);
    expect(by('tops').allowNone).toBe(false);
  });

  it('prices every gear row in its glossary, because the server is what refuses an unowned item', () => {
    for (const r of GEAR.rows.filter((x) => x.tab === 'Kit')) expect(r.glossary).toMatch(/Coins: \d/);
  });

  it('paints only in colours the game already uses', () => {
    const known = new Set([
      ...WEARABLES.map((w) => w.accent.toUpperCase()),
      DEFAULT_AVATAR.colors.primary.toUpperCase(), DEFAULT_AVATAR.colors.secondary.toUpperCase(), DEFAULT_AVATAR.colors.accent.toUpperCase(),
    ]);
    expect(KIT_COLOURS.length).toBe(known.size);
    for (const hex of KIT_COLOURS) {
      expect(hex, hex).toMatch(/^#[0-9A-F]{6}$/);
      expect(known.has(hex), hex).toBe(true);
    }
  });

  it('gives the rig exactly one accessory slot, because that is what it has', () => {
    expect(ACCESSORIES.rows.length).toBe(1);
    expect((ACCESSORIES.rows[0] as SlotRow).allowNone).toBe(true);
  });
});

// FOUND ON THE RUNNING PAGE, not in a unit test: every untouched required slot read NONE. The fix made
// "the first option" the default, which is right for a jump-shot base and would have opened every hot zone
// on FRIGID. The default belongs to whichever module owns the concept, and these hold that.
describe('an untouched row shows what the rest of the system already thinks it is', () => {
  it('never shows a value that is not one of its own options', () => {
    for (const t of [APPEARANCE, BODY, GEAR, ACCESSORIES]) {
      for (const r of t.rows) {
        if (r.kind !== 'slot') continue;
        const shown = displayValue(r, null);
        expect(shown === 'NONE' ? (r as SlotRow).allowNone : (r as SlotRow).options.includes(shown), `${r.id} → ${shown}`).toBe(true);
      }
    }
  });

  it('opens on the Closet\'s face, not on the head of each list', () => {
    const d = defaultFace() as unknown as Record<string, string>;
    for (const [id, want] of Object.entries(d)) {
      if (id === 'sliders') continue;
      const row = APPEARANCE.rows.find((r) => r.id === id)!;
      expect(displayValue(row, null), id).toBe(want);
    }
    // and that genuinely differs from array order, or this test proves nothing
    expect(d.skinTone).not.toBe(SKIN_TONES[0]);
  });

  it('opens on the Closet\'s kit, including the shoe the catalog does not list first', () => {
    const eq = defaultEquipped();
    for (const [slot, id] of Object.entries(eq)) {
      const row = [...GEAR.rows, ...ACCESSORIES.rows].find((r) => r.id === slot);
      if (!row) continue;
      expect(displayValue(row, null), slot).toBe(id ? getWearable(id)!.name : 'NONE');
    }
    expect(getWearable(eq.shoes!)!.name).not.toBe(optionsForSlot('shoes')[0]);
  });

  it('opens a hot zone on NEUTRAL rather than on the coldest rung of the ladder', () => {
    expect(ZONE_STATES[0]).toBe('FRIGID');                   // the head of the list is not the default
    for (const r of HOT_ZONES.rows) expect(displayValue(r, null)).toBe(ZONE_DEFAULT);
    expect(zoneMultiplier(displayValue(HOT_ZONES.rows[0], null))).toBe(1);   // agrees with the scorer
  });

  it('opens on the shipped avatar\'s own body', () => {
    expect(displayValue(BODY.rows.find((r) => r.id === 'archetype')!, null)).toBe(DEFAULT_AVATAR.archetype);
  });

  // The obvious assertion — "▶ always moves an untouched row" — is WRONG, and the suite said so before a
  // player could: Footwear's default is the Flight Trainers, which the catalog lists LAST, so ▶ correctly
  // holds there and ◀ is the live one. What must be true is that the row is steppable at all, and that
  // whichever arrow is dead is dead because the default sits at that end of the list.
  it('leaves an untouched row steppable, and greys an arrow only at an end of its own list', () => {
    for (const t of [APPEARANCE, BODY, GEAR, ACCESSORIES, HOT_ZONES]) {
      for (const r of t.rows) {
        if (r.kind !== 'slot') continue;
        const slot = r as SlotRow;
        const opts: (string | null)[] = slot.allowNone ? [null, ...slot.options] : [...slot.options];
        const shown = displayValue(slot, null);
        const now = shown === 'NONE' ? null : shown;
        const up = canStep(slot, null, 1, null), down = canStep(slot, null, -1, null);
        expect(up || down, `${r.id} cannot be changed at all`).toBe(true);
        if (!up) expect(opts[opts.length - 1], `${r.id} ▶ dead off an end`).toBe(now);
        if (!down) expect(opts[0], `${r.id} ◀ dead off an end`).toBe(now);
        if (up) expect(step(slot, null, 1, null), `${r.id} ▶ stepped onto itself`).not.toBe(now);
      }
    }
  });
});

describe('the cosmetic sections go through the same machinery as everything else', () => {
  it('steps through the generic stepper with no section knowledge', () => {
    const hair = APPEARANCE.rows.find((r) => r.id === 'hairStyle') as SlotRow;
    expect(step(hair, HAIR_STYLES[0], 1, null)).toBe(HAIR_STYLES[1]);
    expect(step(hair, HAIR_STYLES[HAIR_STYLES.length - 1], 1, null)).toBe(HAIR_STYLES[HAIR_STYLES.length - 1]);  // holds
    const h = VITALS.rows.find((r) => r.id === 'heightScale') as RatedRow;
    expect(step(h, h.max, 1, null)).toBe(h.max);
    expect(step(h, h.min, -1, null)).toBe(h.min);
  });

  it('costs nothing — a look never eats attribute, trait or zone points', () => {
    const r = resolve({
      attributes: {}, traits: {},
      look: { vitals: { heightScale: 112 }, appearance: { hairStyle: 'Locs' }, gear: { shoes: 'Flight Trainers' } },
    });
    expect(r.budgets.attributePointsSpent).toBe(0);
    expect(r.budgets.traitPointsSpent).toBe(0);
    expect(r.valid).toBe(true);
  });

  // §9: an imported profile is REPORTED on, never refused.
  it('reports a look that no longer ships instead of dropping it', () => {
    const r = resolve({ attributes: {}, traits: {}, look: { appearance: { hairStyle: 'Pompadour' }, vitals: { heightScale: 400 } } });
    expect(r.issues.find((i) => i.rowId === 'hairStyle')?.kind).toBe('violation');
    expect(r.issues.find((i) => i.rowId === 'heightScale')?.kind).toBe('violation');
    expect(r.issues.find((i) => i.rowId === 'hairStyle')?.message).toContain('Pick another');
  });

  it('keeps an unknown cosmetic key rather than deleting someone\'s newer profile', () => {
    const r = resolve({ attributes: {}, traits: {}, look: { appearance: { eyebrowPiercing: 'Left' } } });
    expect(r.issues.find((i) => i.rowId === 'eyebrowPiercing')?.kind).toBe('warning');
    expect(r.valid).toBe(true);
  });

  it('accepts an empty optional slot and refuses an empty required one', () => {
    expect(resolve({ attributes: {}, traits: {}, look: { gear: { headwear: null } } }).valid).toBe(true);
    const r = resolve({ attributes: {}, traits: {}, look: { gear: { shoes: null } } });
    expect(r.issues.find((i) => i.rowId === 'shoes')?.kind).toBe('violation');
  });

  it('walks all five through ONE loop — a sixth is a line in LOOK_SECTIONS and nothing else', () => {
    expect(Object.keys(LOOK_SECTIONS).sort()).toEqual(['accessories', 'appearance', 'body', 'gear', 'vitals']);
  });
});

describe('the sidebar tells the truth about what is open', () => {
  it('has opened every section that has substrate under it', () => {
    const open = new Set(builtSections().map((s) => s.key));
    for (const k of ['vitals', 'appearance', 'body', 'gear', 'accessories', 'attributes', 'tendencies', 'hotZones', 'mechanics', 'traits']) {
      expect(open.has(k as never), k).toBe(true);
    }
  });

  // "Not built yet" is honest and useless; the screen prints the actual reason.
  it('says WHY the one closed section is closed', () => {
    const ink = SIDEBAR.find((s) => s.key === 'ink')!;
    expect(ink.table).toBeNull();
    expect(ink.reason ?? '').toMatch(/no ink artwork|does not exist|ships no/i);
    expect((ink.reason ?? '').length).toBeGreaterThan(60);
  });
});
