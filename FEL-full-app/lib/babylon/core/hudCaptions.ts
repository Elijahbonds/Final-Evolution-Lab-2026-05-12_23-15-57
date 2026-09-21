// The HUD's own news, as captions.
//
// WHY THIS EXISTS, and it is a correction (2026-09-21). Captions were first fed from JuiceKit.banner() and
// JuiceKit.callout(), on the reasoning that the shared juice channel sees every mode. Then the deployed dunk was
// actually played: the canvas showed a FLIGHT NIGHT banner and both live regions stayed empty. Counted after:
// THIRTY-ONE modes push their headline through `ctx.setHud({ banner })` and NOT ONE calls juice.banner(). The
// callout half was real — thirteen modes use it — but the banner half was wired to a channel nobody calls.
//
// A unit test could not have caught that, and neither could reading the code: both ends existed and agreed with
// each other. Only playing it showed that nothing travelled between them.
//
// ONLY ON CHANGE. setHud runs every frame with the same object, so cueing on every call would repeat one banner
// sixty times a second and a screen reader would say nothing else ever again.

/** The HUD keys that carry news a player is told, rather than numbers they can read at leisure. */
export const CAPTION_HUD_KEYS = ['banner'] as const;

export interface HudCaption { text: string; key: string }

/**
 * What to announce from this HUD update, given what was last announced for each key.
 *
 * Only NEW, non-empty text. An empty banner is one being cleared — that is not news, and announcing "" would
 * interrupt a screen reader to say nothing.
 */
export function captionsFromHud(
  update: Readonly<Record<string, unknown>>,
  last: Readonly<Record<string, string>>,
): HudCaption[] {
  const out: HudCaption[] = [];
  for (const key of CAPTION_HUD_KEYS) {
    if (!(key in update)) continue;
    const raw = update[key];
    const text = typeof raw === 'string' ? raw.trim() : '';
    if (text && last[key] !== text) out.push({ text, key });
  }
  return out;
}

/**
 * Update the memory of what each key last held — including a banner being CLEARED, so the same text announces
 * again the next time it appears. A mode that banners "NICE!" twice in a row means it twice.
 */
export function rememberHud(update: Readonly<Record<string, unknown>>, last: Record<string, string>): void {
  for (const key of CAPTION_HUD_KEYS) {
    if (!(key in update)) continue;
    const raw = update[key];
    last[key] = typeof raw === 'string' ? raw.trim() : '';
  }
}
