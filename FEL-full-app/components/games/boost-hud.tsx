'use client';

// BoostGauge — the one boost meter every speed mode shows (FINISH-RELEASE, 2026-09-14). Owner: "a meter that flashes
// when full". Reads the HUD fields BoostKit.hud() publishes — boost (0..100), boosting, boostFull — so a host needs one
// line to show it, and the kart, the plane and the boards all say BOOST the same way.

import type { HudValue } from '@/lib/babylon/core/ModeHarness';

export function BoostGauge({ hud, className = '' }: { hud: Record<string, HudValue>; className?: string }) {
  if (hud.boost == null) return null;
  const pct = Math.max(0, Math.min(100, Number(hud.boost)));
  const burning = hud.boosting === true;
  const full = hud.boostFull === true;
  const denied = hud.boostDenied === true && !burning;
  return (
    <div className={`pointer-events-none flex flex-col items-center gap-1 ${className}`} data-testid="boost-gauge">
      <style>{`@keyframes felBoostFlash { 0%,100% { box-shadow: 0 0 6px #22d3ee88 } 50% { box-shadow: 0 0 26px #22d3ee, 0 0 4px #fff inset } }`}</style>
      {/* GATE-CRASHER-POLISH-2 (GC-F2): the label on a dark chip — white at 50% was unreadable over snow.
          controls-screen-2 (2026-10-06). Owner: "the meter itself stays, as a clean bar or icon with no instruction text"
          — the chip says the meter's STATE only. Its caption (the keys, or a mode's `boostHint`: how a body fills it, the
          empty tank's "earn it") was instruction text across the play view; the keys are the panel's BOOST row and the
          body's words its BOOST line (lib/babylon/ui/panelLines.ts), on READY and on pause. */}
      <div className="flex items-baseline gap-2 rounded-full bg-black/60 px-3 py-0.5 shadow-[0_1px_6px_rgba(0,0,0,0.35)]">
        <span className={`font-mono text-[11px] font-black tracking-[0.3em] ${burning ? 'text-white' : denied ? 'text-[#ff8a5c]' : 'text-[#5eead4]'}`}>
          {burning ? 'BOOSTING' : full ? 'BOOST READY' : denied ? 'BOOST EMPTY' : 'BOOST'}
        </span>
      </div>
      <div className="h-2.5 w-44 overflow-hidden rounded-full border border-[#22d3ee]/60 bg-black/50"
        style={{ animation: full && !burning ? 'felBoostFlash 0.7s ease-in-out infinite' : undefined }}>
        <div className="h-full transition-[width] duration-100"
          style={{ width: `${pct}%`, background: burning ? 'linear-gradient(90deg,#22d3ee,#ffffff)' : full ? '#22d3ee' : 'linear-gradient(90deg,#0e7490,#22d3ee)' }} />
      </div>
    </div>
  );
}
