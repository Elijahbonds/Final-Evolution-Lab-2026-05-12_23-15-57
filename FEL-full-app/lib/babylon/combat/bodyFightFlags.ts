// bodyFightFlags — which combat modes the body plays (movement play P7, 2026-09-25): the cut line's switch.
//
// A mode definition spreads `...(BODY_FIGHT.<key> ? { body: { claims, lines }, onBody } : {})`: on, the mode claims the
// fight read's events (lib/pose/fightReader), `drives` turns true through its onBody (bodySeam.bodyDrives), READY offers
// body play and the lost pause arms; off, nothing about the mode changes (its P3 row, or session-only).
//
// PLAN-P7 §5's cut line, from the live probe (scripts/probes/_combat-body-live.mts, 2026-09-26, 80 and 200 ms) and the
// offline gates (lib/pose/fightGate.test.ts, lib/babylon/combat/bodyFight.gate.test.ts, FIGHT.md):
//   • LIVE, all five modes: 0 taken on the negatives (the owner's stand, a fight stance, a jog, two waves, two stretches),
//     nothing taken while the START latch held, nothing in Mixed's loadout or Duel's intro / weapon pick; the lost pause
//     and the hands-up resume; the seam's cost p90 0.1 ms a frame. VS / Mixed / Showdown name a scripted jab-cross-hook
//     link by link and call it (Mixed and Showdown 12 / 12 at 200 ms; VS loses the links told while the rival's hit had
//     it staggered — refused as a press would be).
//   • OFFLINE the plan's targets are NOT all met: strikes recall 82 % / precision 92 % at 30 fps (target 90 / 95), onset
//     p90 64 ms (target 45); G3 is 0 at the camera's default noise without blur, not under blur or 1.5× noise (wave,
//     stretch). By §5's letter that sends VS / Mixed / Showdown back to their P3 rows; they stay on here on the live
//     probe's 0 misfires — the owner's call, one line each below.
//   • THE REVIEW (2026-09-26) found that evidence in sample (the scripted paths were the same on every seed; the negatives
//     were the clips the thresholds cite) and re-measured it OUT of sample: the scripted takes' paths re-drawn per seed —
//     at 30 fps strikes 77 % / 96 % held out (the captures, in sample, 81 / 94); G3 0 at the default noise without blur at
//     15–30 fps for every negative on the test AND train seeds, the review's claps, wave in front of the face, arm swings
//     and low guard raised one hand after the other included (FIGHT.md §1, §5); LIVE, all five modes, 0 misfires on 11
//     negatives at 80 ms (those four added) and 4 at 200 ms (FIGHT.md §9). The flags stand on that.
//   • Duel stays off: its blade / staff plane rule gets 260 of the 321 labelled straights / hooks / uppercuts on the right
//     plane at 30 fps (81 %; 98 % of the 265 read — FIGHT.md §4's confusion; the cut line asks 90 %), and a clean blow on an unguarded fighter resolves as a whiff in Duel and Showdown alike
//     (DefenseSystem.applyDefenseOutcome maps 'none' to 'whiff' — pre-existing, the pad's too). The Hundred stays off: its
//     shop (the plan's L6 for it) was not reached by the probe. Both keep READY's "coming".
export const BODY_FIGHT = {
  karate_vs: true,
  mixedcombat: true,
  showdown: true,
  duel: false,
  karate: false,
} as const;
export type BodyFightKey = keyof typeof BODY_FIGHT;

/**
 * Whether `key` plays by the body: its flag, or — in development only — the live probe's switch for a mode still behind
 * its cut line (`/dev/mode/duel?bodyfight=duel`), so the probe can measure the misfires that decide the flag. Read when
 * the harness mounts the mode (the modes behind a false flag declare `body` / `onBody` as getters), never in production.
 */
export function bodyFightOn(key: BodyFightKey): boolean {
  if (BODY_FIGHT[key]) return true;
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return false;
  try { return (new URLSearchParams(window.location.search).get('bodyfight') ?? '').split(',').includes(key); } catch { return false; }
}
