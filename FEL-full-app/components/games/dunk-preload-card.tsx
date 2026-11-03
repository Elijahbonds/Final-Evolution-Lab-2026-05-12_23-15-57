// RUNUP-STALL-3 (2026-10-30): the card on screen while the contest preloads behind the intro (feel knob dunk.preloadSet).
// The first run is held until the rival, the onlookers, the finalists and the shaders are in; this says so, and how far along.
import { HudMeter, HudPlate, HudText, hudColor } from './tv-hud';

/** `value`: the preload's progress, 0..1 (DunkMode's hud.preloadReady). */
export function DunkPreloadCard({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[38%] flex justify-center" data-fel-preload={pct} role="status" aria-live="polite">
      <HudPlate className="flex flex-col items-center gap-2 px-5 py-3">
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full motion-reduce:animate-none" style={{ background: hudColor('you') }} />
          <HudText size="body" className="uppercase tracking-[0.16em]">Getting the contest ready</HudText>
        </span>
        <HudMeter value={pct} max={100} tone="you" height="bar" width="12rem" status={`${pct}%`} layout="inline" />
      </HudPlate>
    </div>
  );
}
