'use client';

// BoostGauge — the one boost meter every speed mode shows (FINISH-RELEASE, 2026-09-14). Owner: "a meter that flashes
// when full". Reads the HUD fields BoostKit.hud() publishes — boost (0..100), boosting, boostFull — so a host needs one
// line to show it, and the kart, the plane and the boards all say BOOST the same way.
//
// TV HUD (A9.13, lane/vis-race phase 2): drawn on the shared system — the label is a HudText at the 10-foot scale, the
// bar is a HudMeter, every colour a palette tone. The same fields, the same four states (BOOST, BOOST READY, BOOSTING,
// BOOST EMPTY), the same width-at-the-tank's-level and the same "flashes when full" (not under reduced motion);
// presentation only.

import type { HudValue } from '@/lib/babylon/core/ModeHarness';
import { HudMeter, HudPlate, HudText, hudColor, useHudReducedMotion } from './tv-hud';

export function BoostGauge({ hud, className = '' }: { hud: Record<string, HudValue>; className?: string }) {
  const reduced = useHudReducedMotion();
  if (hud.boost == null) return null;
  const pct = Math.max(0, Math.min(100, Number(hud.boost)));
  const burning = hud.boosting === true;
  const full = hud.boostFull === true;
  const denied = hud.boostDenied === true && !burning;
  const flashing = full && !burning && !reduced;
  return (
    <div className={`pointer-events-none flex flex-col items-center gap-1 ${className}`} data-testid="boost-gauge">
      <style>{`@keyframes felBoostFlash { 0%,100% { box-shadow: 0 0 6px ${hudColor('you', 0.53)} } 50% { box-shadow: 0 0 26px ${hudColor('you')}, 0 0 4px ${hudColor('text')} inset } }`}</style>
      {/* GATE-CRASHER-POLISH-2 (GC-F2): the label on a dark chip — white at 50% was unreadable over snow.
          controls-screen-2 (2026-10-06). Owner: "the meter itself stays, as a clean bar or icon with no instruction text"
          — the chip says the meter's STATE only. Its caption (the keys, or a mode's `boostHint`: how a body fills it, the
          empty tank's "earn it") was instruction text across the play view; the keys are the panel's BOOST row and the
          body's words its BOOST line (lib/babylon/ui/panelLines.ts), on READY and on pause. */}
      <HudPlate className="flex items-baseline gap-2 px-3 py-0.5" style={{ borderRadius: 999 }}>
        <HudText size="label" tone={burning ? 'text' : denied ? 'heat' : 'good'} style={{ fontWeight: 900, letterSpacing: '0.3em' }}>
          {burning ? 'BOOSTING' : full ? 'BOOST READY' : denied ? 'BOOST EMPTY' : 'BOOST'}
        </HudText>
      </HudPlate>
      <div style={{ borderRadius: 999, animation: flashing ? 'felBoostFlash 0.7s ease-in-out infinite' : undefined }}>
        <HudMeter
          value={pct} max={100} width="11rem" height="thick" framed tone="you"
          fillStyle={{ background: burning ? `linear-gradient(90deg, ${hudColor('you')}, ${hudColor('text')})` : full ? hudColor('you') : `linear-gradient(90deg, ${hudColor('you', 0.55)}, ${hudColor('you')})` }}
        />
      </div>
    </div>
  );
}
