// KIT-NO-HIGH-BOOTS (owner 2026-10-20: "rename the display label only"): the kit's shoe is a low-cut now, so the screens
// read "Evolution Low-Tops" while the stored name a saved build carries stays "Evolution Hi-Tops".
import { describe, expect, it } from 'vitest';
import { WEARABLES, getWearable, wearableLabel } from './wearable-catalog';
import { GEAR, optionsForSlot, wearableIdFor } from '../creator/schema/gear';
import { displayLabel, displayValue } from '../creator/editor/rowState';
import type { SlotRow } from '../creator/schema/types';

describe('the shoe\'s display label', () => {
  it('shows Low-Tops; the stored name, id and save mapping are unchanged', () => {
    const evo = getWearable('shoes_evo')!;
    expect(evo.name).toBe('Evolution Hi-Tops');
    expect(wearableLabel(evo)).toBe('Evolution Low-Tops');
    expect(wearableIdFor('Evolution Hi-Tops')).toBe('shoes_evo');
    expect(optionsForSlot('shoes')).toContain('Evolution Hi-Tops');
    // every other wearable shows its stored name
    for (const w of WEARABLES) if (w.itemId !== 'shoes_evo') expect(wearableLabel(w), w.itemId).toBe(w.name);
  });
  it('the Creator\'s shoe row stores the name and shows the label', () => {
    const row = GEAR.rows.find((r) => r.id === 'shoes') as SlotRow;
    expect(displayValue(row, 'Evolution Hi-Tops')).toBe('Evolution Hi-Tops');
    expect(displayLabel(row, 'Evolution Hi-Tops')).toBe('Evolution Low-Tops');
    expect(displayLabel(row, 'Flight Trainers')).toBe('Flight Trainers');
    expect(displayLabel(row, null)).toBe(displayValue(row, null));
  });
});
