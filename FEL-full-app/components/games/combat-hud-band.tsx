// CombatHudBand — the fight HUD and its banner line, in one band (QA P1-09, 2026-09-27).
//
// Storm Duel, Ring's Edge and Showdown each drew their HUD (HP / GUARD / CHI / FOCUS stacked in both top corners, the
// round in the middle) as one absolutely placed row, then drew the mode's banner at top-1/3 and Ring's Edge's red edge
// warning at top-22% — fixed fractions of a 16:10 stage. On a short stage (a phone, a small window) the four stacked chips
// reach past both lines, so the banners landed on the health and guard readouts; and the JuiceKit overlay (z-index 30,
// the beat banners and the hit flash) painted over the whole HUD, which had no z-index at all.
//
// Here the banner line is a flow sibling BELOW the HUD row, so it cannot intersect it at any stage size, and the band
// stacks above the juice overlay, so no pop, flash or beat banner covers a score, a health bar or a timer.
import type { ReactNode } from 'react';

/** Above JuiceKit's overlay (z-index 30), below the READY / PAUSED splash (z-40). */
export const COMBAT_HUD_Z = 35;

export function CombatHudBand({ children, banner, alert }: {
  /** The HUD row: laid out in flow (no absolute positioning of its own). */
  children: ReactNode;
  /** The mode's banner line (hud.banner); nothing when empty. */
  banner?: string;
  /** A warning line above the banner (Ring's Edge's edge danger). */
  alert?: ReactNode;
}) {
  return (
    <div data-hud-band className="pointer-events-none absolute inset-x-0 top-0 flex flex-col" style={{ zIndex: COMBAT_HUD_Z }}>
      {children}
      <div data-banner-band className="flex flex-col items-center gap-1 px-4 text-center">
        {alert}
        {banner ? <span className="fel-heading text-2xl font-bold text-[var(--fel-cyan)] drop-shadow sm:text-3xl">{banner}</span> : null}
      </div>
    </div>
  );
}
