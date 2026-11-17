'use client';
// hoops-p08 (2026-11-12): THE MATCHUP CARD while a hoops court loads — in place of the knowledge feed's card ("LEARN WHILE YOU WAIT ·
// TECH & AI · Computers count in binary", docs/HOOPS-AAA-GAP-SHOW.md 3.8 and sinker 9: a trivia card about computers while a
// basketball game loads). It builds the game the player is walking into from what the start card already knows — no new data and no
// numbers that are not the mode's own:
//   * the court (the LOCATION pick: courtLocations' name),
//   * who you face (the mode's format; for 1v1 and 3v3 the OPPONENT pick's name and its own one-line description, Difficulty.ts),
//   * how it is won (the mode's own rule: hoopsMatchup.test.ts holds each number to the mode file that plays it).
// The 1v1 / 3v3 rivals have no names a player has ever seen (the forge cast's file keys), so the card does not name one.
// Other modes keep the knowledge card (the owner's KNOWLEDGE-FEED v1 decision stands everywhere else).
import type { CourtLocationId } from '@/lib/babylon/nexus/courtLocations';
import { COURT_LOCATIONS } from '@/lib/babylon/nexus/courtLocations';
import { TIER_PROFILES, type Tier } from '@/lib/babylon/core/Difficulty';

interface Matchup { kicker: string; you: string; them: string; rule: string }

/** Each hoops mode's matchup, in its own words (the HUD's chips and banners). The numbers are pinned to the modes by the test. */
export const HOOPS_MATCHUP: Readonly<Record<string, Matchup>> = {
  onevone: { kicker: '1 ON 1', you: 'YOU', them: 'THE RIVAL', rule: 'FIRST TO 11 · MAKE IT, TAKE IT' },
  threevthree: { kicker: '3 ON 3', you: 'YOUR THREE', them: 'THEIR THREE', rule: '4 MINUTES · FIRST TO 21 WINS IT EARLY' },   // hoops-flow (owner 2026-11-12): the 4-minute clock
  threepoint: { kicker: 'THE SHOOTOUT', you: 'YOU', them: 'THE FIELD', rule: 'QUALIFYING ON THE CLOCK · THE TOP 3 GO TO THE FINAL' },
  dunk: { kicker: 'FLIGHT NIGHT', you: 'YOU', them: 'THE RIVAL', rule: 'THE JUDGES SCORE EVERY DUNK' },
  dunkduel: { kicker: 'PROVE IT', you: 'PLAYER 1', them: 'PLAYER 2', rule: 'DUNK FOR DUNK · THE JUDGES DECIDE' },
};
export const isHoopsMatchupMode = (modeId: string): boolean => modeId in HOOPS_MATCHUP;

export function HoopsMatchupCard({ modeId, location, tier, tint }: { modeId: string; location: CourtLocationId; tier: Tier | null; tint: string }) {
  const m = HOOPS_MATCHUP[modeId];
  if (!m) return null;
  const court = COURT_LOCATIONS[location]?.name ?? COURT_LOCATIONS.venice.name;
  const t = tier ? TIER_PROFILES[tier] : null;
  return (
    <div data-hoops-matchup className="mt-1 flex w-full max-w-sm shrink-0 flex-col items-center gap-1.5 rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-center">
      <p className="text-[12px] font-black tracking-[0.3em] text-white/55">{m.kicker} · {court.toUpperCase()}</p>
      <div className="flex w-full items-center justify-center gap-3">
        <span className="min-w-0 flex-1 truncate text-right text-lg font-black tracking-wider" style={{ color: tint }}>{m.you}</span>
        <span className="shrink-0 text-[12px] font-black tracking-[0.25em] text-white/50">VS</span>
        <span className="min-w-0 flex-1 truncate text-left text-lg font-black tracking-wider text-white">{m.them}</span>
      </div>
      <p className="text-[12px] font-bold tracking-widest text-white/70">{m.rule}</p>
      {t && <p className="text-[13px] leading-snug text-white/60"><span className="font-black tracking-wider text-white/80">{t.name}</span> — {t.sub}</p>}
    </div>
  );
}
