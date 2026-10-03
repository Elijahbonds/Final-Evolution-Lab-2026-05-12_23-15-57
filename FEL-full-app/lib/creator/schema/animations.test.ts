// ANIMATION PACKAGES (2026-10-01). Every stepper option is a clip that already ships, dunks ask for
// Vertical, dribbles ask for the same Ball Handle MOVE_HANDLE already uses, and nothing on the screen
// has a price. Spin and off-the-head have no clip, so they are absent and named in MISSING_VS_2K.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANIMATIONS, MISSING_VS_2K, clipForChoice, gateForChoice } from './animations';
import { resolve as resolveBuild } from './resolve';
import { MOVE_HANDLE, moveClip, type HandleMove } from '../../babylon/core/HandleSystem';
import type { SlotRow } from './types';

const corpus = [
  readFileSync(resolve(__dirname, '../../babylon/anim/authored/index.ts'), 'utf8'),
  readFileSync(resolve(__dirname, '../../babylon/anim/authored/baseClips.ts'), 'utf8'),
].join('\n');

const slots = ANIMATIONS.rows.filter((r): r is SlotRow => r.kind === 'slot');

describe('animation packages play clips that already ship', () => {
  it('maps every option to a clip id that authored/index.ts or baseClips.ts names', () => {
    const seen = new Map<string, string>();
    for (const row of slots) {
      expect(row.options.length, row.id).toBeGreaterThan(0);
      for (const label of row.options) {
        const clip = clipForChoice(label);
        expect(clip, label).toBeTruthy();
        expect(corpus, `${label} → ${clip}`).toContain(`'${clip}'`);
        if (seen.has(label)) expect(seen.get(label), label).toBe(clip);
        else seen.set(label, clip!);
      }
    }
  });

  it('gates every dunk choice on Vertical, and the first package cannot be empty', () => {
    expect(gateForChoice('Power')).toEqual({ attribute: 'vertical', min: 55 });
    expect(gateForChoice('720')).toEqual({ attribute: 'vertical', min: 92 });
    const first = slots.find((r) => r.id === 'animDunk1');
    expect(first?.allowNone).toBe(false);
    expect(first?.requires).toEqual({ attribute: 'vertical', min: 55 });
    for (const id of ['animDunk2', 'animDunk3', 'animDunk4', 'animDunk5']) {
      const row = slots.find((r) => r.id === id);
      expect(row?.allowNone, id).toBe(true);
    }
  });

  it('copies MOVE_HANDLE onto the dribble rows, and leaves moves with no clip out', () => {
    for (const move of Object.keys(MOVE_HANDLE) as HandleMove[]) {
      const row = slots.find((r) => r.id === `anim_${move}`);
      const right = moveClip(move, 'right');
      const left = moveClip(move, 'left');
      if (!right && !left) {
        expect(row, move).toBeUndefined();
        continue;
      }
      expect(row, move).toBeTruthy();
      const min = MOVE_HANDLE[move];
      expect(row?.requires, move).toEqual(min > 0 ? { attribute: 'ballHandle', min } : null);
      for (const label of row!.options) {
        const gate = gateForChoice(label);
        expect(gate, label).toEqual(min > 0 ? { attribute: 'ballHandle', min } : null);
        expect([right, left]).toContain(clipForChoice(label));
      }
    }
    expect(slots.some((r) => r.id === 'anim_spin' || r.id === 'anim_off_the_head')).toBe(false);
    const missing = MISSING_VS_2K.join('\n');
    expect(missing).toMatch(/spin/);
    expect(missing).toMatch(/off-the-head/);
  });

  it('has no price — packages are earned by the attribute, never bought', () => {
    const src = readFileSync(resolve(__dirname, 'animations.ts'), 'utf8');
    expect(src).not.toMatch(/coinPrice|['"]price['"]\s*:|purchase\(/);
  });
});

describe('the resolver reports a dunk the body has not earned', () => {
  it('violates when Vertical is under the package, and accepts it when the attribute is there', () => {
    const low = resolveBuild({
      attributes: { vertical: 40 }, traits: {},
      animations: { animDunk1: 'Power' },
    });
    const hit = low.issues.find((i) => i.rowId === 'animDunk1' && i.kind === 'violation');
    expect(hit?.message).toContain('Vertical 55');
    expect(hit?.message).toContain('you have 40');

    const ok = resolveBuild({
      attributes: { vertical: 70 }, traits: {},
      animations: { animDunk1: 'Power' },
    });
    expect(ok.issues.filter((i) => i.rowId === 'animDunk1' && i.kind === 'violation')).toEqual([]);
  });

  it('refuses a package name that is not in the table', () => {
    const r = resolveBuild({
      attributes: {}, traits: {},
      animations: { animJsBase: 'Signature Kobe' },
    });
    expect(r.issues.some((i) => i.kind === 'violation' && i.section === 'animations')).toBe(true);
  });
});
