'use client';

// THE RACING HUD'S SHARED PIECES (IMPROVE 2026-10-06). Aero Aces' course strip and missile warning were drawn in its own
// host; Velocity Kart needed the same two (velocitykart #6 the shell warning, #9 the minimap), so they live here and both
// hosts draw them. The mode sends the strings (aeroAcesRules.mapPath / mapDots / toMap); this only draws them.

import type { HudValue } from '@/lib/babylon';

type Hud = Record<string, HudValue>;

/** Where a warning sits — on the edge the projectile is coming from. */
export const THREAT_POS: Record<string, string> = {
  BEHIND: 'inset-x-0 bottom-40 justify-center', AHEAD: 'inset-x-0 top-24 justify-center',
  LEFT: 'left-3 top-[60%] justify-start', RIGHT: 'right-3 top-[60%] justify-end',
};
export const THREAT_ARROW: Record<string, string> = { BEHIND: '▼', AHEAD: '▲', LEFT: '◀', RIGHT: '▶' };

/** "x,y;x,y" → points (the mode sends the strip's dots as one string — aeroAcesRules.mapDots). */
export function mapDotsOf(v: HudValue | undefined): [number, number][] {
  if (typeof v !== 'string' || !v) return [];
  return v.split(';').map((p) => p.split(',').map(Number) as [number, number]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
}

/** THE COURSE MAP — the circuit's outline, any shortcut (dashed), the field, the next gate or ring, and you (pointing your
 *  way). Reads `mapPath` (sent once), `mapCut`, `mapField`, `mapRing`, `mapMe` ("x,y,deg"). Nothing until the outline
 *  arrives. */
export function RaceCourseMap({ hud, className = 'left-3 top-[5.5rem]' }: { hud: Hud; className?: string }) {
  if (typeof hud.mapPath !== 'string' || !hud.mapPath) return null;
  const me = typeof hud.mapMe === 'string' ? hud.mapMe.split(',').map(Number) : null;
  const ring = mapDotsOf(hud.mapRing)[0];
  return (
    <div className={`pointer-events-none absolute ${className} fel-panel rounded-lg p-1`} aria-hidden>
      <svg viewBox="0 0 100 100" className="h-20 w-20 sm:h-28 sm:w-28">
        <path d={hud.mapPath} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={3.2} strokeLinejoin="round" />
        {typeof hud.mapCut === 'string' && hud.mapCut
          ? <path d={hud.mapCut} fill="none" stroke="#fcd34d" strokeOpacity={0.75} strokeWidth={1.6} strokeDasharray="2.4 2" strokeLinecap="round" />
          : null}
        {mapDotsOf(hud.mapField).map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2.2} fill="#94a3b8" />)}
        {ring ? <circle cx={ring[0]} cy={ring[1]} r={3.2} fill="none" stroke="#7dd3fc" strokeWidth={1.4} /> : null}
        {me && me.length === 3 && me.every(Number.isFinite)
          ? <path d="M0,-5 L3.6,4 L0,2.2 L-3.6,4 Z" fill="#ffd166" stroke="#1f2937" strokeWidth={0.8} transform={`translate(${me[0]} ${me[1]}) rotate(${me[2]})`} />
          : null}
      </svg>
    </div>
  );
}

/** THE INCOMING WARNING — on the edge it comes from, pulsing green with the action word once it is time to act.
 *  `action` is the button the act is on ('B' to roll a plane, 'X' to hop a kart). */
export function ThreatWarning({ words, side, now, action }: { words: HudValue | undefined; side: HudValue | undefined; now: boolean; action: string }) {
  if (typeof words !== 'string' || !words) return null;
  return (
    <div className={`pointer-events-none absolute flex ${THREAT_POS[String(side)] ?? THREAT_POS.BEHIND}`}>
      <span className={`fel-panel px-3 py-1 font-mono text-sm font-bold ${now ? 'animate-pulse text-[#86efac]' : 'text-[#ff4b4b]'}`}>
        {THREAT_ARROW[String(side)] ?? '▼'} {words}{now ? ` — ${action}` : ''}
      </span>
    </div>
  );
}
