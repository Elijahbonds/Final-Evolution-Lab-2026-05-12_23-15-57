// BOARD SKINS — your deck, chosen where you choose your venue (2026-09-12).
//
// Owner: "different board etc". Same approach as the ball skins that shipped earlier today and for the same reasons:
// the deck mesh already exists, so a skin RE-TINTS it rather than fetching another one. Every skin is free at runtime —
// no extra download, no extra draw call, nothing that can 404 — which matters because the venue picker beside it is
// free too, and a cosmetic that can fail would be the only thing on that screen that can.
//
// Three disciplines ride three different boards, so a deck belongs to one of them: a skate graphic on a surfboard is
// not a feature.

import type { BoardDiscipline } from './boardVenues';

export interface BoardSkin {
  id: string;
  label: string;
  discipline: BoardDiscipline;
  /** The deck's main colour. */
  tint: string;
  /** Second colour for the two-tone decks — the swatch and the stripe. */
  tint2?: string;
  /** How much it glows under the venue lights, 0..1. A loud deck should read at night. */
  glow: number;
  /** One line on the picker, so a deck is a thing rather than a colour. */
  sub: string;
  ready: boolean;
}

export const BOARD_SKINS: readonly BoardSkin[] = [
  // skate
  { id: 'blank', label: 'BLANK', discipline: 'skate', tint: '#c8a56f', glow: 0.05, ready: true, sub: 'Raw maple. Nothing to prove.' },
  { id: 'venice', label: 'VENICE', discipline: 'skate', tint: '#ff8a3d', tint2: '#ffd75e', glow: 0.3, ready: true, sub: 'Boardwalk orange, faded by the sun.' },
  { id: 'patrol', label: 'PATROL', discipline: 'skate', tint: '#1d4d8f', tint2: '#f4f1de', glow: 0.2, ready: true, sub: 'Blue and white. Named after the rail.' },
  { id: 'neon', label: 'NEON', discipline: 'skate', tint: '#ff4d6d', tint2: '#4dd4ff', glow: 0.6, ready: true, sub: 'Built for the warehouse lights.' },
  // snow
  { id: 'powder', label: 'POWDER', discipline: 'snow', tint: '#eef4fb', tint2: '#9fc0e8', glow: 0.1, ready: true, sub: 'White on white. Disappears in a spray.' },
  { id: 'alpine', label: 'ALPINE', discipline: 'snow', tint: '#2ec4b6', tint2: '#134f4c', glow: 0.25, ready: true, sub: 'Teal and pine. Reads against the snow.' },
  { id: 'floodlit', label: 'FLOODLIT', discipline: 'snow', tint: '#ffd75e', tint2: '#ff4d6d', glow: 0.55, ready: true, sub: 'For a night park and nothing else.' },
  // surf
  { id: 'glass', label: 'GLASS', discipline: 'surf', tint: '#bfeee9', tint2: '#2f8f8a', glow: 0.15, ready: true, sub: 'Clear resin over a green stringer.' },
  { id: 'sunset', label: 'SUNSET', discipline: 'surf', tint: '#ff8a3d', tint2: '#ff3d81', glow: 0.35, ready: true, sub: 'Gold to pink, the way the point goes.' },
  { id: 'reefbreak', label: 'REEF', discipline: 'surf', tint: '#b07cf5', tint2: '#1f5d70', glow: 0.3, ready: true, sub: 'Dark board for dark water.' },
];

export function skinsFor(d: BoardDiscipline): BoardSkin[] {
  return BOARD_SKINS.filter((s) => s.discipline === d && s.ready);
}

export function boardSkinById(id: string): BoardSkin | null {
  return BOARD_SKINS.find((s) => s.id === id) ?? null;
}

export const BOARD_SKIN_KEY_PREFIX = 'fel-board-skin-';

/** The player's pick: `?deck=` wins, then the remembered pick, then the discipline's first. */
export function readBoardSkin(d: BoardDiscipline): BoardSkin {
  const list = skinsFor(d);
  const first = list[0];
  try {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('deck');
      const byQuery = list.find((s) => s.id === q);
      if (byQuery) return byQuery;
      const stored = window.localStorage.getItem(BOARD_SKIN_KEY_PREFIX + d);
      const byStore = list.find((s) => s.id === stored);
      if (byStore) return byStore;
    }
  } catch { /* private mode: the default deck */ }
  return first;
}

export function writeBoardSkin(d: BoardDiscipline, id: string): void {
  try { window.localStorage.setItem(BOARD_SKIN_KEY_PREFIX + d, id); } catch { /* convenience only */ }
}

/** Hex -> 0..1 rgb. Bad input returns white rather than throwing: a cosmetic must never break a mode. */
export function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 1, g: 1, b: 1 };
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}
