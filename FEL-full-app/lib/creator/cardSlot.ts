// CARD SLOT (FINISH-RELEASE, 2026-09-15). The owner, pointing at THPS2: every button press there fires a NAMED action,
// and your skater carried the set-up. "Add a mechanic on the start up page of all the modes like we did with the setting
// and the items but to have a creator card slot… as a cosmetic and animations/mocap."
//
// Owner decisions, one round:
//   · SOURCE  — your own creator card(s) plus creator cards you own; BASE (no card) is always there.
//   · CARRIES — the look, the mocap animation sets, a THPS2 button set-up, and the stat build that gates moves.
//   · EDIT    — set-ups are edited in the Creator; the start screen shows the equipped card's button map read-only.
//   · TIMING  — before the RC: the slot, the look, the default button maps. After: mocap packages and custom set-ups.
//
// This file is the pure half: the button map a start screen shows, and the card list's shape. THE MAP IS DERIVED, never
// written out a second time — the face verbs come from modeVerbs (what TouchOverlay draws and the modes read) and the
// direction + button tricks from BoardTricks, and only for the buttons a mode actually routes through that table. A map
// that listed a move the mode does not perform would be the hollow-picker failure in a new place.

import { MODE_VERBS, BOOST_MODES } from '../babylon/ui/modeVerbs';
import { TRICKS_BY_DISCIPLINE, type BoardTrick, type BoardDiscipline } from '../babylon/core/BoardTricks';

export interface ButtonRow {
  /** What you press: 'A', '← + B', 'HOLD RB', 'D-PAD ← →'. */
  input: string;
  /** What it does, as the game names it. */
  action: string;
  /** Grouping for the screen: the base verbs first, then the named moves. */
  group: 'verb' | 'move' | 'system';
}

/** Splash / route ids that differ from the registry key. */
const ALIAS: Record<string, string> = {
  snowboard: 'snowboard_slalom', 'karate-vs': 'karate_vs', baseball: 'derby', soccer: 'penalty',
  'big-air': 'bigair', 'aero-aces': 'aeroaces', 'velocity-kart': 'velocitykart', 'who-scene-it': 'who_scene_it', 'brain-brawl': 'brainbrawl',
};
export const slotModeKey = (modeId: string): string => ALIAS[modeId] ?? modeId;

/**
 * The buttons each board mode resolves through its BoardTricks table, and nothing else. SnowboardSlalomMode reads
 * B / X / Y there (A stays the pop); SurfBreakMode reads B for the wave list and Y for the airs (A pops, X holds the
 * grab). Skate is absent on purpose: its tricks are the R-stick flick, not the table — listing SKATE_TRICKS on the
 * skate splash would promise a kickflip on ← + A that the mode does not throw.
 */
const TABLE_ROUTED: Partial<Record<string, { disc: BoardDiscipline; btns: BoardTrick['btn'][] }>> = {
  snowboard_slalom: { disc: 'snow', btns: ['B', 'X', 'Y'] },
  surf: { disc: 'surf', btns: ['B', 'Y'] },
};

const ARROW: Record<NonNullable<BoardTrick['dir']>, string> = { up: '↑', down: '↓', left: '←', right: '→' };

/** Extra, non-face inputs a mode reads that the verb table cannot express. */
const SYSTEM_ROWS: Record<string, ButtonRow[]> = {
  bigair: [{ input: 'D-PAD ← →', action: 'ALTERNATE STRIDES', group: 'system' }],
  sprint: [{ input: 'D-PAD ← →', action: 'ALTERNATE STRIDES', group: 'system' }],
  skateboard: [{ input: 'R-STICK FLICK', action: 'FLIP TRICK', group: 'system' }],
};

/** The read-only button map for a mode — what the start screen shows under the card slot. */
export function buttonMap(modeId: string): ButtonRow[] {
  const key = slotModeKey(modeId);
  const cfg = MODE_VERBS[key] ?? MODE_VERBS.default;
  const letters = ['A', 'B', 'X', 'Y'] as const;
  const rows: ButtonRow[] = [];
  cfg.buttons.forEach((b, i) => {
    if (!b.emit || !b.label) return;
    rows.push({ input: b.hold ? `HOLD ${letters[i]}` : letters[i], action: b.label, group: 'verb' });
  });
  const routed = TABLE_ROUTED[key];
  if (routed) {
    for (const t of TRICKS_BY_DISCIPLINE[routed.disc]) {
      if (!routed.btns.includes(t.btn)) continue;
      rows.push({ input: t.dir ? `${ARROW[t.dir]} + ${t.btn}` : t.btn, action: t.label, group: 'move' });
    }
  }
  for (const r of SYSTEM_ROWS[key] ?? []) rows.push(r);
  if (BOOST_MODES.has(key)) rows.push({ input: 'HOLD RB · SHIFT', action: 'BOOST', group: 'system' });
  return rows;
}

// ── the slot's cards ─────────────────────────────────────────────────────────────────────────────────────

export interface SlotCard {
  id: string;
  /** 'mine' = a creator card you made; 'owned' = one you own from another creator. */
  source: 'mine' | 'owned';
  name: string;
  accent: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  signatureMove: string | null;
}

export interface SlotState {
  cards: SlotCard[];
  /** The equipped card id, or null for BASE. */
  equipped: string | null;
}

const RARITIES = new Set(['common', 'rare', 'epic', 'legendary']);

/** Server rows → the slot's cards. Anything malformed is dropped rather than drawn as a blank chip. */
export function toSlotCards(rows: unknown, source: SlotCard['source']): SlotCard[] {
  if (!Array.isArray(rows)) return [];
  const out: SlotCard[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    if (!r || typeof r.id !== 'string' || !r.id) continue;
    const accent = typeof r.accent === 'string' && /^#[0-9a-f]{6}$/i.test(r.accent) ? r.accent : '#00E5FF';
    out.push({
      id: r.id, source,
      name: (typeof r.displayName === 'string' && r.displayName.trim() ? r.displayName.trim() : 'MY CARD').slice(0, 24),
      accent,
      rarity: (RARITIES.has(String(r.rarity)) ? r.rarity : 'common') as SlotCard['rarity'],
      signatureMove: typeof r.signatureMove === 'string' && r.signatureMove ? r.signatureMove.slice(0, 32) : null,
    });
  }
  return out;
}

/** An equip request is valid only for a card in the list, or BASE. */
export function canEquip(state: SlotState, id: string | null): boolean {
  return id === null || state.cards.some((c) => c.id === id);
}
