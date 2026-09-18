// playerIcon — which glyph rides over the player's head (owner, 2026-09-17: "an icon of their choice … relevant to
// their creator card — a basketball, musical note, camera, controller for gamer, dance").
//
// The CHOICE first (`?icon=` on the URL, then the saved preference), then the creator record's most-played discipline,
// then the controller — a gamer with no card yet is still somebody. Pure apart from the reads; safe on the server.
import { readRecord } from '../../creator/CreatorRecord';
import { cachedIdentity, type EquippedCard } from '../core/playerIdentity';
import type { RingIcon } from './PlayerRing';

export const PLAYER_ICON_KEY = 'fel-player-icon';
const ICONS: RingIcon[] = ['basketball', 'music', 'camera', 'controller', 'dance', 'art', 'pen', 'chef', 'fashion'];

/** A discipline id (a mode id or a lane) → the glyph that stands for it. */
export function iconForDiscipline(id: string): RingIcon {
  const d = id.toLowerCase();
  if (/dunk|onevone|threevthree|threepoint|hoop|basket|ball|sport|football|soccer|tennis|golf|volley|skate|snow|surf|karate|fight/.test(d)) return 'basketball';
  if (/music|studio|beat|song|dj/.test(d)) return 'music';
  if (/dance/.test(d)) return 'dance';
  if (/scene|act|camera|film|photo|video/.test(d)) return 'camera';
  if (/kart|racing|aero|pilot|drive/.test(d)) return 'controller';   // the vehicles are the gamer's (and "kart" contains "art")
  if (/\bart\b|art_|paint|draw|canvas/.test(d)) return 'art';
  if (/writ|story/.test(d)) return 'pen';
  if (/cook|kitchen|fuel/.test(d)) return 'chef';
  if (/fashion|closet|wear/.test(d)) return 'fashion';
  return 'controller';
}
/** The saved choice, or null. */
export function readPlayerIconChoice(): RingIcon | null {
  try {
    if (typeof window === 'undefined') return null;
    const q = new URLSearchParams(window.location.search).get('icon');
    if (q && (ICONS as string[]).includes(q)) return q as RingIcon;
    const v = window.localStorage.getItem(PLAYER_ICON_KEY);
    return v && (ICONS as string[]).includes(v) ? (v as RingIcon) : null;
  } catch { return null; }
}
export function writePlayerIconChoice(icon: RingIcon): void { try { window.localStorage.setItem(PLAYER_ICON_KEY, icon); } catch { /* private mode */ } }
/** The icon for this player: the choice, else the EQUIPPED CREATOR CARD's signature mode (owner, 2026-09-17: "the icon
 *  correlates to the user's creator card"), else the record's most-played discipline, else the controller. */
export function readPlayerIcon(card: EquippedCard | null | undefined = cachedIdentity()?.card): RingIcon {
  const chosen = readPlayerIconChoice(); if (chosen) return chosen;
  if (card?.mode) return iconForDiscipline(card.mode);
  const rec = readRecord();
  if (rec) {
    let best: string | null = null, bestSec = -1;
    for (const [id, d] of Object.entries(rec.disciplines)) if (d.seconds > bestSec) { best = id; bestSec = d.seconds; }
    if (best && bestSec > 0) return iconForDiscipline(best);
  }
  return 'controller';
}
