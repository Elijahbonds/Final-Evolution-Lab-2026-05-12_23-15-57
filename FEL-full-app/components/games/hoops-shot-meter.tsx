'use client';

// THE SHOT METER BAR (1v1 and 3v3, lane/hud-hoops). THE SHOT METER (owner, 2026-09-18): the bar carries the GREEN release
// window the mode publishes (`shotMeterGreen` = "center,half" in 0..1) and a marker on the fill — the 3D bar beside the shooter's
// head (visual/ShotMeter3D) shows the same numbers in the world. This is that bar on the shared meter: the same window and the same
// marker, now one piece for both hosts.
//
// THE FILL (owner, 2026-10-14: "turn both on"). The hosts authored one (`bg-[var(--fel-cyan)]/90`), but Tailwind emitted no rule
// for a var() colour with an opacity modifier, so it never drew in production. It draws now, in the player's cyan. The authored
// bar drew the green window ABOVE the fill; the shared meter draws the fill over its segments, so the fill is held at
// SHOT_FILL_ALPHA and the green window still reads through it. The release window and the marker are exactly as before.
//
// PRESENTATION ONLY: `t` and `green` are the mode's own HUD values; the bar only clamps them to its box.
import { HudMeter } from './tv-hud';

/** The fill's opacity: low enough that the green release window reads through it (the window was drawn on top in the authored bar). */
export const SHOT_FILL_ALPHA = 0.45;

/** "center,half" → the window's [from, to] on 0..1, or null for anything that is not two numbers. */
export function shotMeterWindow(green: unknown): { from: number; to: number } | null {
  const g = typeof green === 'string' ? green.split(',').map(Number) : null;
  return g && g.length === 2 && g.every((v) => Number.isFinite(v)) ? { from: g[0] - g[1], to: g[0] + g[1] } : null;
}

export function HoopsShotMeter({ t, green }: { t: number; green: unknown }) {
  const win = shotMeterWindow(green);
  return (
    <HudMeter
      height="thick" width="16rem" framed
      value={t} max={1} tone="you" fillAlpha={SHOT_FILL_ALPHA}
      segments={win ? [{ from: win.from, to: win.to, tone: 'good', alpha: 0.7 }] : undefined}
      markers={[{ at: t, tone: 'text', width: 3, glow: true }]}
    />
  );
}
