// A TRAIT IS A MULTIPLIER ON A HOOK THAT ALREADY EXISTS (2026-09-14). Spec §4.
//
// Forty-five traits is forty-five new code paths if each one is a feature. It is a data table if each one
// names a gameplay hook the game ALREADY has and scales it — and the audit found that most of them do:
//
//   Deep Handle      → `movesFor(handle)`        (HandleSystem: the move library is already handle-gated)
//   Breakdown Artist → `ankleBreakOdds`          (already rolls a defender stumble)
//   Contest King     → `groundContest`           (already scores a closeout)
//   Airspace Denial  → `aiBlockChance`           (already rolls a block)
//   Vice Grip        → `aiBumpStrips`            (already rolls a strip on contact)
//   Spring Load      → `jumpSwats`               (already counts consecutive contests)
//   Boxout Boss      → `BOX_OUT_RANGE`/`boardWinner` (already resolves a board)
//   Afterburner      → `TurboMeter`              (already a spend-and-refill sprint)
//   Immovable        → `ContactSystem`           (already resolves body collisions)
//
// Every one of those was verified present before this table was written, because the whole design rests on
// it: a trait whose hook does not exist is a promise the game cannot keep, and this session has already
// caught seven "X is missing" claims that were wrong in the other direction.
//
// THE LADDER IS THE MECHANIC. Unequipped → tier 1 → tier 2 → tier 3, each costing more trait points than
// the last, each gated behind an attribute the player had to actually build. A trait you can equip on a
// 40-rated attribute is a trait everybody equips.
//
// NAMES ARE ORIGINAL TO FEL, per the spec's own first line. No real athlete, no licensed badge.

import type { TraitRow, SectionTable } from './types';

const TIERS = ['BRONZE', 'SILVER', 'GOLD'] as const;
const COST = [1, 3, 6] as const;

const t = (
  id: string, label: string, tab: string, hook: string,
  requires: TraitRow['requires'], glossary: string, tierText: readonly string[],
): TraitRow => ({
  kind: 'trait', id, label, section: 'traits', tab, hook, requires, glossary,
  tiers: TIERS, cost: COST, tierText,
});

/** Three rungs of the same sentence — the glossary modal shows all three so a player can see the climb. */
const steps = (what: string, a: string, b: string, c: string): string[] =>
  [`${what} ${a}`, `${what} ${b}`, `${what} ${c}`];

export const TRAITS: SectionTable<TraitRow> = {
  section: 'traits',
  title: 'Traits',
  rows: [
    // ── Finishing ───────────────────────────────────────────────────────────────────────────────────
    t('mixmaster', 'Mixmaster', 'Finishing', 'layupVariety', { attribute: 'drivingLayup', min: 65 },
      'Expands the layup animation variety at the rim.',
      steps('Layup variety', 'widens a little.', 'widens noticeably.', 'opens the full package.')),
    t('paintProdigy', 'Paint Prodigy', 'Finishing', 'contestedPct', { attribute: 'closeShot', min: 70 },
      'Boosts close-range finishing in traffic.',
      steps('Close finishing in a crowd', '+4%.', '+8%.', '+13%.')),
    t('contactFinisher', 'Contact Finisher', 'Finishing', 'contestedPct', { attribute: 'contactDraw', min: 70 },
      'Holds finish quality through body contact.',
      steps('Contact costs you', '15% less.', '30% less.', '50% less.')),
    t('postAnchor', 'Post Anchor', 'Finishing', 'SHOT_QUALITY_PCT', { attribute: 'postControl', min: 65 },
      'Boosts back-to-basket scoring.',
      steps('Back-to-basket scoring', '+4%.', '+8%.', '+13%.')),
    t('phantomStep', 'Phantom Step', 'Finishing', 'gatherEvasion', { attribute: 'drivingLayup', min: 75 },
      'Improves gather and eurostep evasion of shot blockers.',
      steps('Evading a blocker on the gather', 'is a little easier.', 'is markedly easier.', 'beats all but a perfect read.')),
    t('pivotCatalyst', 'Pivot Catalyst', 'Finishing', 'spinCounter', { attribute: 'postControl', min: 70 },
      'Speed and effectiveness of post spin counters.',
      steps('Post spins', 'come a beat quicker.', 'come quicker and land more.', 'are near-unreadable.')),

    // ── Shooting ────────────────────────────────────────────────────────────────────────────────────
    t('ghostCutter', 'Ghost Cutter', 'Shooting', 'offBallSeparation', { attribute: 'midRange', min: 65 },
      'Easier separation coming off off-ball screens.',
      steps('Separation off a screen', '+10%.', '+20%.', '+32%.')),
    t('shortRangeSniper', 'Short-Range Sniper', 'Shooting', 'SHOT_QUALITY_PCT', { attribute: 'midRange', min: 70 },
      'Boost inside the arc and from the short corner.',
      steps('Short-range shooting', '+4%.', '+8%.', '+13%.')),
    t('catchAndRip', 'Catch and Rip', 'Shooting', 'SHOT_QUALITY_PCT', { attribute: 'threePoint', min: 70 },
      'Boost on catch-and-shoot attempts.',
      steps('Catch-and-shoot', '+4%.', '+8%.', '+13%.')),
    t('arcControl', 'Arc Control', 'Shooting', 'ShotMeter', { attribute: 'shotIq', min: 65 },
      'Widens the forgiveness on your release window.',
      steps('The release window', 'widens 10%.', 'widens 20%.', 'widens 32%.')),
    t('stationaryMid', 'Stationary Mid', 'Shooting', 'SHOT_QUALITY_PCT', { attribute: 'midRange', min: 68 },
      'Boost on set mid-range attempts.',
      steps('Set mid-range', '+4%.', '+8%.', '+13%.')),
    t('fluidOperator', 'Fluid Operator', 'Shooting', 'SHOT_QUALITY_PCT', { attribute: 'ballHandle', min: 72 },
      'Boost on movement and dribble-into-jumper shots.',
      steps('Shooting off the dribble', '+4%.', '+8%.', '+13%.')),
    t('fastTrigger', 'Fast Trigger', 'Shooting', 'ShotMeter', { attribute: 'threePoint', min: 70 },
      'Shortens the release windup.',
      steps('The windup', 'is 8% shorter.', 'is 16% shorter.', 'is 26% shorter.')),

    // ── Playmaking ──────────────────────────────────────────────────────────────────────────────────
    t('escapePass', 'Escape Pass', 'Playmaking', 'passAccuracy', { attribute: 'passIq', min: 65 },
      'Improves passing out of trouble under pressure.',
      steps('Passing out of a trap', '+10%.', '+20%.', '+32%.')),
    t('outletThreat', 'Outlet Threat', 'Playmaking', 'passAccuracy', { attribute: 'passAccuracy', min: 70 },
      'Boosts leading passes in transition.',
      steps('Transition outlets', '+10%.', '+20%.', '+32%.')),
    t('feeder', 'Feeder', 'Playmaking', 'SHOT_QUALITY_PCT', { attribute: 'passIq', min: 72 },
      'The shooter gets a temporary boost off your pass.',
      steps('Your passes leave a shooter', '+3% for a beat.', '+6% for a beat.', '+10% for a beat.')),
    t('deepHandle', 'Deep Handle', 'Playmaking', 'movesFor', { attribute: 'ballHandle', min: 70 },
      'Expands the dribble move library.',
      steps('The handle library', 'opens one more move.', 'opens two more.', 'opens the full set.')),
    t('ballSecurity', 'Ball Security', 'Playmaking', 'STEAL_EXPOSURE_MIN', { attribute: 'ballHandle', min: 65 },
      'Resists strips while dribbling.',
      steps('Strip attempts on you', 'land 12% less.', 'land 25% less.', 'land 40% less.')),
    t('readRange', 'Read Range', 'Playmaking', 'passAccuracy', { attribute: 'courtVision', min: 70 },
      'Improves passing out of awkward stances and angles.',
      steps('Off-balance passes', '+10%.', '+20%.', '+32%.')),
    t('breakdownArtist', 'Breakdown Artist', 'Playmaking', 'ankleBreakOdds', { attribute: 'ballHandle', min: 75 },
      'Increases the odds of a defender stumbling on a hard move.',
      steps('Ankle-break odds', '+15%.', '+30%.', '+50%.')),
    t('firstStepBurst', 'First-Step Burst', 'Playmaking', 'TurboMeter', { attribute: 'speedWithBall', min: 70 },
      'Acceleration boost out of a live-dribble launch.',
      steps('The first step', 'is 6% quicker.', 'is 12% quicker.', 'is 20% quicker.')),
    t('anchorHandle', 'Anchor Handle', 'Playmaking', 'ContactSystem', { attribute: 'strength', min: 65 },
      'Resists bumps and contact while dribbling.',
      steps('Bumps move you', '12% less.', '25% less.', '40% less.')),

    // ── Defense ─────────────────────────────────────────────────────────────────────────────────────
    t('postWall', 'Post Wall', 'Defense', 'interiorD', { attribute: 'interiorD', min: 70 },
      'Strengthens back-to-basket defense.',
      steps('Post defense', '+10%.', '+20%.', '+32%.')),
    t('contestKing', 'Contest King', 'Defense', 'groundContest', { attribute: 'perimeterD', min: 70 },
      'Boosts closeout contest effectiveness.',
      steps('Your closeouts', '+12%.', '+25%.', '+40%.')),
    t('offBallLeech', 'Off-Ball Leech', 'Defense', 'handUpContest', { attribute: 'perimeterD', min: 68 },
      'Improves off-ball denial and disruption.',
      steps('Off-ball denial', '+12%.', '+25%.', '+40%.')),
    t('screenSlipper', 'Screen Slipper', 'Defense', 'screenNav', { attribute: 'agility', min: 68 },
      'Navigates screens without getting stuck.',
      steps('Screens hold you', '15% less.', '30% less.', '50% less.')),
    t('viceGrip', 'Vice Grip', 'Defense', 'aiBumpStrips', { attribute: 'steal', min: 70 },
      'Boosts on-ball steal attempt success.',
      steps('On-ball strips', '+12%.', '+25%.', '+40%.')),
    t('passingLane', 'Passing Lane', 'Defense', 'passPerception', { attribute: 'passPerception', min: 70 },
      'Boosts interception of passes.',
      steps('Interceptions', '+12%.', '+25%.', '+40%.')),
    t('springLoad', 'Spring Load', 'Defense', 'jumpSwats', { attribute: 'vertical', min: 72 },
      'Faster consecutive jumps for contests and blocks.',
      steps('The second jump', 'comes 10% sooner.', 'comes 20% sooner.', 'comes 32% sooner.')),
    t('airspaceDenial', 'Airspace Denial', 'Defense', 'aiBlockChance', { attribute: 'block', min: 75 },
      'Boosts blocks on dunk and alley attempts.',
      steps('Blocks at the rim', '+12%.', '+25%.', '+40%.')),
    t('paintWarden', 'Paint Warden', 'Defense', 'helpIq', { attribute: 'helpIq', min: 70 },
      'Boosts help defense inside the arc.',
      steps('Help defense', '+12%.', '+25%.', '+40%.')),
    t('verticalWall', 'Vertical Wall', 'Defense', 'groundContest', { attribute: 'interiorD', min: 72 },
      'Boosts contest quality when holding verticality.',
      steps('Holding verticality', '+12%.', '+25%.', '+40%.')),

    // ── Rebounding ──────────────────────────────────────────────────────────────────────────────────
    t('glassCrasher', 'Glass Crasher', 'Rebounding', 'boardWinner', { attribute: 'offRebound', min: 70 },
      'Improves offensive rebound pursuit.',
      steps('Offensive board pursuit', '+12%.', '+25%.', '+40%.')),
    t('possessionCloser', 'Possession Closer', 'Rebounding', 'boardWinner', { attribute: 'defRebound', min: 70 },
      'Improves securing contested defensive boards.',
      steps('Contested defensive boards', '+12%.', '+25%.', '+40%.')),
    t('timingSnatch', 'Timing Snatch', 'Rebounding', 'boardWinner', { attribute: 'hands', min: 68 },
      'Improves tipping and snatching from traffic.',
      steps('Snatching from traffic', '+12%.', '+25%.', '+40%.')),
    t('boxoutBoss', 'Boxout Boss', 'Rebounding', 'BOX_OUT_RANGE', { attribute: 'strength', min: 68 },
      'Strengthens your boxout hold.',
      steps('Your boxout holds', '12% longer.', '25% longer.', '40% longer.')),
    t('chainBreaker', 'Chain Breaker', 'Rebounding', 'BOX_OUT_RANGE', { attribute: 'strength', min: 70 },
      'Improves escaping an opponent’s boxout.',
      steps('Escaping a boxout', 'is 12% easier.', 'is 25% easier.', 'is 40% easier.')),

    // ── Physicals ───────────────────────────────────────────────────────────────────────────────────
    t('brickWall', 'Brick Wall', 'Physicals', 'ContactSystem', { attribute: 'strength', min: 70 },
      'Your screens hit harder and are harder to fight through.',
      steps('Your screens', 'hit 12% harder.', 'hit 25% harder.', 'hit 40% harder.')),
    t('immovable', 'Immovable', 'Physicals', 'ContactSystem', { attribute: 'strength', min: 72 },
      'Resists being displaced by contact.',
      steps('Contact displaces you', '12% less.', '25% less.', '40% less.')),
    t('afterburner', 'Afterburner', 'Physicals', 'TurboMeter', { attribute: 'speed', min: 72 },
      'A temporary speed surge in the open floor.',
      steps('Open-floor surge', '+5% for a beat.', '+10% for a beat.', '+16% for a beat.')),
    t('workHorse', 'Work Horse', 'Physicals', 'stamina', { attribute: 'stamina', min: 70 },
      'Slows stamina drain on repeated effort.',
      steps('Stamina drains', '10% slower.', '20% slower.', '32% slower.')),
    t('bruiser', 'Bruiser', 'Physicals', 'ContactSystem', { attribute: 'strength', min: 68 },
      'Boosts the effect of physical off-ball contact.',
      steps('Off-ball contact', '+12%.', '+25%.', '+40%.')),
  ],
};

/** The spec's §4 "Tab 1 [MISSING — likely All]" — derived, never authored, so it cannot go stale. */
export const TRAIT_TABS_WITH_ALL = ['All', 'Finishing', 'Shooting', 'Playmaking', 'Defense', 'Rebounding', 'Physicals'];
