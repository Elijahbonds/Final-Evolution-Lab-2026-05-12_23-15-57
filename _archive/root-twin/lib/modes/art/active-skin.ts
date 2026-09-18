// Active art-skin store — the bridge that makes an art card's canvas actually
// reskin a venue in-game. A published art card carries its canvasDataUrl inline
// (ArtPayload.kind==='art'), so "apply" simply fetches the card, stashes the
// dataUrl (per surface) in localStorage, and the next Babylon host that boots
// reads it and paints the matching mesh. This is the round-trip proof:
// create → save → reload → apply in-game.

export type ArtSurface = 'court' | 'board' | 'kit';

const KEY = (surface: ArtSurface) => `fel:artSkin:${surface}`;

export function setActiveSkin(surface: ArtSurface, dataUrl: string): void {
  try { localStorage.setItem(KEY(surface), dataUrl); } catch { /* storage disabled */ }
}

export function getActiveSkin(surface: ArtSurface): string | null {
  try { return localStorage.getItem(KEY(surface)); } catch { return null; }
}

export function clearActiveSkin(surface: ArtSurface): void {
  try { localStorage.removeItem(KEY(surface)); } catch { /* noop */ }
}

/** Fetch a saved art card by id and make it the active skin for its surface. */
export async function applyCardAsSkin(cardId: string): Promise<ArtSurface | null> {
  const res = await fetch(`/api/v1/creative-card/${cardId}`);
  if (!res.ok) return null;
  const { card } = await res.json();
  if (!card || card.art?.kind !== 'art') return null;
  const surface = card.art.appliedSurface as ArtSurface;
  setActiveSkin(surface, card.art.canvasDataUrl as string);
  return surface;
}
