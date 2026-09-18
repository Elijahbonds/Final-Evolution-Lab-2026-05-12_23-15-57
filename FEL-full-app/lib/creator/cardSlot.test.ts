import { describe, it, expect } from 'vitest';
import { buttonMap, toSlotCards, canEquip, slotModeKey } from './cardSlot';
import { ENABLED_BABYLON_MODES } from '../babylon/modes/registry';
import { MODE_VERBS } from '../babylon/ui/modeVerbs';
import { trickFor } from '../babylon/core/BoardTricks';

describe('CardSlot — the start screen button map tells the truth', () => {
  it('every enabled mode shows at least one control', () => {
    for (const m of ENABLED_BABYLON_MODES) expect(buttonMap(m).length, m).toBeGreaterThan(0);
  });

  it('every face-verb row is a verb the touch rig actually emits', () => {
    for (const m of ENABLED_BABYLON_MODES) {
      const cfg = MODE_VERBS[slotModeKey(m)] ?? MODE_VERBS.default;
      const live = new Set(cfg.buttons.filter((b) => b.emit && b.label).map((b) => b.label));
      for (const r of buttonMap(m).filter((x) => x.group === 'verb')) expect(live.has(r.action), `${m}: ${r.action}`).toBe(true);
    }
  });

  it('every named move resolves through the same trickFor the mode calls', () => {
    const arrows: Record<string, 'up' | 'down' | 'left' | 'right'> = { '↑': 'up', '↓': 'down', '←': 'left', '→': 'right' };
    for (const [mode, disc] of [['snowboard_slalom', 'snow'], ['surf', 'surf']] as const) {
      const moves = buttonMap(mode).filter((r) => r.group === 'move');
      expect(moves.length).toBeGreaterThan(0);
      for (const r of moves) {
        const m = /^(?:([↑↓←→]) \+ )?([ABXY])$/.exec(r.input);
        expect(m, r.input).not.toBeNull();
        const t = trickFor(disc, m![1] ? arrows[m![1]] : null, m![2] as 'A' | 'B' | 'X' | 'Y');
        expect(t?.label, `${mode} ${r.input}`).toBe(r.action);
      }
    }
  });

  it('skate does not promise the table (its tricks are the flick), and the six speed modes list BOOST', () => {
    expect(buttonMap('skateboard').some((r) => r.group === 'move')).toBe(false);
    expect(buttonMap('skateboard').some((r) => /FLICK/.test(r.input))).toBe(true);
    for (const m of ['velocitykart', 'aeroaces', 'skateboard', 'snowboard', 'surf', 'bigair']) expect(buttonMap(m).some((r) => r.action === 'BOOST'), m).toBe(true);
    expect(buttonMap('dunk').some((r) => r.action === 'BOOST')).toBe(false);
  });

  it('server rows become cards; malformed rows are dropped; only a listed card (or BASE) equips', () => {
    const cards = toSlotCards([{ id: 'c1', displayName: 'Eli', accent: '#ff0000', rarity: 'epic', signatureMove: 'Windmill' }, { id: '' }, null, { id: 'c2', accent: 'red' }], 'mine');
    expect(cards.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(cards[1]).toMatchObject({ name: 'MY CARD', accent: '#00E5FF', rarity: 'common', signatureMove: null });
    const state = { cards, equipped: null };
    expect(canEquip(state, 'c1')).toBe(true); expect(canEquip(state, null)).toBe(true); expect(canEquip(state, 'someone-else')).toBe(false);
  });
});
