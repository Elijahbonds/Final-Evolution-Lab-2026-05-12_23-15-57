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
//
// TV HUD (A9.13, lane/tv-hud): the band's banner is the shared HudBanner (in flow), and the fight readouts every combat
// host stacks in its corners are CombatStat / CombatRound / CombatEdgeCall below — one look across Storm Duel, Ring's
// Edge, Showdown and the duel, on the shared palette and 10-foot scale.
import type { ReactNode } from 'react';
import { HudBanner, HudChip, HudText, ScoreValue, useHudReducedMotion, type HudTone } from './tv-hud';

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
        {banner ? <HudBanner flow text={banner} tone="you" plate={false} /> : null}
      </div>
    </div>
  );
}

/** One fight readout: HP 100, FOE GUARD 40, CHI 75 — label and number on a plate, in the side's tone. */
export function CombatStat({ label, value, tone, glow = false, title }: { label: string; value: ReactNode; tone: HudTone; glow?: boolean; title?: string }) {
  return (
    <HudChip label={label} labelTone={tone} tone={tone} size="value" glow={glow} title={title} className="px-[0.6em] py-[0.15em]">
      <ScoreValue value={value} size="value" tone={tone} pop={false} />
    </HudChip>
  );
}

/** The middle of a fight HUD: ROUND n, the round score under it, then whatever the mode adds (a clock, a loadout). */
export function CombatRound({ round, wins, foeWins, children }: { round: ReactNode; wins: ReactNode; foeWins: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center">
      <HudText size="stat">ROUND {round}</HudText>
      <span className="mt-1 inline-flex items-baseline gap-[0.35em]">
        <ScoreValue value={wins} size="value" tone="you" />
        <HudText size="label" alpha={0.6}>–</HudText>
        <ScoreValue value={foeWins} size="value" tone="danger" />
      </span>
      {children}
    </div>
  );
}

/** A round clock, m:ss, red in its last seconds. */
export function CombatClock({ seconds, redAt }: { seconds: number; redAt: number }) {
  return (
    <HudText size="label" tone={seconds <= redAt ? 'danger' : 'text'} alpha={seconds <= redAt ? 1 : 0.7} className="mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }} title="Round clock">
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
    </HudText>
  );
}

/** A call that pulses while it holds (the ring-out edge, a takedown ready) — steady under reduced motion. */
export function CombatEdgeCall({ children, tone, size = 'stat' }: { children: ReactNode; tone: HudTone; size?: 'stat' | 'label' }) {
  const reduced = useHudReducedMotion();
  return <HudText size={size} tone={tone} className={reduced ? '' : 'animate-pulse'} style={{ fontWeight: 800 }}>{children}</HudText>;
}
