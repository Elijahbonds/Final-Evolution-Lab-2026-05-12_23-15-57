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
  return (
    <div className={`pointer-events-none flex flex-col items-center gap-1 ${className}`} data-testid="boost-gauge">
      <style>{`@keyframes felBoostFlash { 0%,100% { box-shadow: 0 0 6px #22d3ee88 } 50% { box-shadow: 0 0 26px #22d3ee, 0 0 4px #fff inset } }`}</style>
      <div className="flex items-baseline gap-2">
        <span className={`font-mono text-[11px] font-black tracking-[0.3em] ${burning ? 'text-white' : 'text-[#22d3ee]'}`}>
          {burning ? 'BOOSTING' : full ? 'BOOST READY' : 'BOOST'}
        </span>
        <span className="font-mono text-[10px] text-white/50">HOLD RB · SHIFT</span>
      </div>
      <div className="h-2.5 w-44 overflow-hidden rounded-full border border-[#22d3ee]/60 bg-black/50"
        style={{ animation: full && !burning ? 'felBoostFlash 0.7s ease-in-out infinite' : undefined }}>
        <div className="h-full transition-[width] duration-100"
          style={{ width: `${pct}%`, background: burning ? 'linear-gradient(90deg,#22d3ee,#ffffff)' : full ? '#22d3ee' : 'linear-gradient(90deg,#0e7490,#22d3ee)' }} />
      </div>
    </div>
  );
}
