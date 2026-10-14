'use client';

// THE SHOT METER BAR (1v1 and 3v3, lane/hud-hoops). THE SHOT METER (owner, 2026-09-18): the bar carries the GREEN release
// window the mode publishes (`shotMeterGreen` = "center,half" in 0..1) and a marker on the fill — the 3D bar beside the shooter's
// head (visual/ShotMeter3D) shows the same numbers in the world. This is that bar on the shared meter: the same window and the same
// marker, now one piece for both hosts.
//
// NO FILL, on purpose. The hosts authored one (`bg-[var(--fel-cyan)]/90`), but Tailwind emits no rule for a var() colour with an
// opacity modifier (measured: 0 matches in the compiled CSS), so the bar the owner has felt was the green window and the marker
// alone — and that is what is drawn here, the same as the 3-point release bar. Passing `value={t}` to the meter would turn a fill on.
//
// PRESENTATION ONLY: `t` and `green` are the mode's own HUD values; the bar only clamps them to its box.
import { HudMeter } from './tv-hud';

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
      segments={win ? [{ from: win.from, to: win.to, tone: 'good', alpha: 0.7 }] : undefined}
      markers={[{ at: t, tone: 'text', width: 3, glow: true }]}
    />
  );
}
