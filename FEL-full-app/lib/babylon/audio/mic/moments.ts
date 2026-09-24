// The MIC's moments — every beat a hoops event can hand the booth, the crowd or a player, and how much each voice has to say
// about it (THE MIC, 2026-09-24).
//
// This table is the contract between three things: the modes (which `hear()` these ids at the code sites mapped in
// ~/Claude/outbox/finish-release/mic/MAP.md), the scripts (lib/babylon/audio/mic/script/*.json, one per cast member, written to
// these counts and word limits), and the tests (every moment a mode can fire has lines for every court's MC).
//
// `maxWords` is the speech window: a line has to be over before the game's next beat (a 3PT make has ~0.8 s before the next
// ball, a dunk's run ~1.2 s before take-off). Tiered moments get `mc` lines PER TIER (0 ordinary, 1 good, 2 huge).
// `tags` are variants the writer covers one line each (a line tagged 'rival:cass' only plays when Cass is the one dunking).

export type MicGroup = 'shared' | 'dunk' | 'three' | 'game' | 'carnival';
export interface MomentSpec {
  id: string;
  group: MicGroup;
  /** What just happened, for the writer. */
  say: string;
  maxWords: number;
  /** Lines per court MC (per tier when `tiered`). */
  mc: number;
  /** Lines for the courtside sidekick (who answers the MC on some moments, and fills). */
  side?: number;
  tiered?: boolean;
  /** One line per tag, per MC, on top of `mc` untagged lines. */
  tags?: readonly string[];
}

export const RIVAL_TAGS = ['rival:cass', 'rival:ty', 'rival:pilot', 'rival:zo', 'rival:stack'] as const;
export const CELEB_TAGS = ['celeb:spiderman', 'celeb:itsover', 'celeb:roar', 'celeb:toosmall', 'celeb:armsup'] as const;
export const CARNIVAL_TAGS = ['ev:slam_rush', 'ev:strike_storm', 'ev:trick_gauntlet', 'ev:hot_shot', 'ev:coin_storm', 'ev:counter_strike'] as const;

export const MOMENTS: readonly MomentSpec[] = [
  // ── shared: every event ──────────────────────────────────────────────────────────────────────────────────────────
  { id: 'intro.court', group: 'shared', say: 'The MC welcomes everyone to THIS court (its own look and flavour) before the event starts. Who the MC is, where we are.', maxWords: 24, mc: 4, side: 2 },
  { id: 'filler.crowd', group: 'shared', say: 'Crowd work between plays: get the stands loud, call out a section, shout-outs to made-up regulars.', maxWords: 14, mc: 6, side: 2 },
  { id: 'filler.banter', group: 'shared', say: 'Colour between plays: the court\'s life, a short story, a joke, the weather, the food stand. No game facts (the score is unknown).', maxWords: 18, mc: 8, side: 6 },
  { id: 'momentum.warming', group: 'shared', say: 'The player is heating up (a couple of good plays in a row).', maxWords: 8, mc: 3, side: 1 },
  { id: 'momentum.hot', group: 'shared', say: 'The player is hot now: the crowd is into it.', maxWords: 8, mc: 3 },
  { id: 'momentum.fire', group: 'shared', say: 'The player is on fire: can\'t miss, the whole court is up.', maxWords: 8, mc: 4, side: 2 },
  { id: 'momentum.cold', group: 'shared', say: 'The player has gone cold after a bad stretch. Encouraging or teasing, never cruel.', maxWords: 8, mc: 3, side: 1 },
  { id: 'outro.win', group: 'shared', say: 'The player just won the event. The send-off.', maxWords: 16, mc: 4, side: 2 },
  { id: 'outro.loss', group: 'shared', say: 'The player lost the event. A respectful send-off that invites a rematch.', maxWords: 16, mc: 4, side: 2 },

  // ── the dunk contest (Flight Night) and Dunk Duel ───────────────────────────────────────────────────────────────
  { id: 'dunk.intro', group: 'dunk', say: 'Flight Night opens: the dunk contest, two rounds, two dunks each, the five judges, tonight\'s rival waiting.', maxWords: 26, mc: 3 },
  { id: 'dunk.night', group: 'dunk', say: 'Another night of Flight Night starts (the player came back for more).', maxWords: 14, mc: 3 },
  { id: 'dunk.rival.intro', group: 'dunk', say: 'Introduce tonight\'s rival. Cass: never misses, never amazes (tomahawk). Ty: power all night (windmill). Pilot: reads the room then takes it (360). Zo: here for the highlight not the win (eastbay). Stack: goes for the impossible one first (between the legs).', maxWords: 16, mc: 2, tags: RIVAL_TAGS },
  { id: 'dunk.up', group: 'dunk', say: 'The player\'s dunk is up (first attempt). Set the stage before the run.', maxWords: 8, mc: 5, side: 1 },
  { id: 'dunk.retry', group: 'dunk', say: 'The player missed and gets another attempt at the same dunk.', maxWords: 8, mc: 4 },
  { id: 'dunk.lastchance', group: 'dunk', say: 'Third and final attempt at this dunk. Pressure.', maxWords: 8, mc: 3 },
  { id: 'dunk.run', group: 'dunk', say: 'The run-up starts. Said in the second before take-off, so VERY short (then silence while they fly).', maxWords: 3, mc: 5 },
  { id: 'dunk.make', group: 'dunk', say: 'A made dunk, called as the replay rolls. The dunk\'s NAME is said right after this line by the same voice, so it must lead into a name ("Oh, come on! … The windmill!"). Tier 0: an ordinary make. Tier 1: a good one the judges like. Tier 2: the building erupts.', maxWords: 8, mc: 0, side: 0, tiered: true },
  { id: 'dunk.fifty', group: 'dunk', say: 'A perfect fifty from all five judges.', maxWords: 10, mc: 4, side: 2 },
  { id: 'dunk.repeat', group: 'dunk', say: 'The judges have seen that exact dunk before tonight (it scores less).', maxWords: 10, mc: 4 },
  { id: 'dunk.miss', group: 'dunk', say: 'A missed dunk (any reason).', maxWords: 8, mc: 6, side: 2 },
  { id: 'dunk.miss.iron', group: 'dunk', say: 'The dunk rattled in and out / came off the iron.', maxWords: 8, mc: 3 },
  { id: 'dunk.miss.lob', group: 'dunk', say: 'The lob or the self-lob got away: never caught.', maxWords: 8, mc: 3 },
  { id: 'dunk.miss.prop', group: 'dunk', say: 'Clipped the prop they were jumping over (the car, the people, the bike).', maxWords: 8, mc: 3 },
  { id: 'dunk.miss.last', group: 'dunk', say: 'Out of attempts: the dunk is scored as a miss.', maxWords: 10, mc: 3 },
  { id: 'dunk.judges', group: 'dunk', say: 'The five judges confer (said in under a second, before the cards show).', maxWords: 4, mc: 4 },
  { id: 'dunk.rival.up', group: 'dunk', say: 'The rival\'s turn to dunk.', maxWords: 8, mc: 2, tags: RIVAL_TAGS },
  { id: 'dunk.rival.make', group: 'dunk', say: 'The rival makes his dunk (the dunk\'s name follows, as with the player).', maxWords: 8, mc: 4, tags: RIVAL_TAGS },
  { id: 'dunk.rival.miss', group: 'dunk', say: 'The rival misses.', maxWords: 8, mc: 5 },
  { id: 'dunk.round', group: 'dunk', say: 'Round two starts: the final round.', maxWords: 12, mc: 3 },
  { id: 'dunk.need', group: 'dunk', say: 'Final round and the player is BEHIND: they need big numbers.', maxWords: 12, mc: 3 },
  { id: 'dunk.need.ahead', group: 'dunk', say: 'Final round and the player is AHEAD: close it out.', maxWords: 12, mc: 2 },
  { id: 'dunk.win', group: 'dunk', say: 'The player wins Flight Night.', maxWords: 16, mc: 4, side: 2 },
  { id: 'dunk.lose', group: 'dunk', say: 'The rival wins Flight Night.', maxWords: 16, mc: 4, side: 1 },
  { id: 'dunk.celeb', group: 'dunk', say: 'Reacting to the dunker\'s celebration: the Spider-Man splits, "it\'s over", the roar, too small, arms up.', maxWords: 8, mc: 0, tags: CELEB_TAGS },
  { id: 'duel.pass', group: 'dunk', say: 'Dunk Duel (two players on one screen): hand the controller over, the next player is up.', maxWords: 8, mc: 2, tags: ['p:1', 'p:2'] },
  { id: 'duel.win', group: 'dunk', say: 'Dunk Duel: one player wins it.', maxWords: 10, mc: 1, tags: ['p:1', 'p:2'] },
  { id: 'duel.tie', group: 'dunk', say: 'Dunk Duel ends in a dead heat.', maxWords: 10, mc: 2 },

  // ── the 3PT contest (Downtown) ───────────────────────────────────────────────────────────────────────────────────
  { id: 'three.intro', group: 'three', say: 'The three-point shootout opens: five racks, sixty seconds, the money balls, six shooters, top three advance.', maxWords: 22, mc: 3 },
  { id: 'three.go', group: 'three', say: 'The clock starts.', maxWords: 4, mc: 3 },
  { id: 'three.rack', group: 'three', say: 'On to the next rack.', maxWords: 5, mc: 4 },
  { id: 'three.lastrack', group: 'three', say: 'The last rack.', maxWords: 6, mc: 3 },
  { id: 'three.money', group: 'three', say: 'The money ball is up (worth two).', maxWords: 5, mc: 4 },
  { id: 'three.make', group: 'three', say: 'A three goes in. Under a second before the next ball, so tiny.', maxWords: 3, mc: 6 },
  { id: 'three.make.money', group: 'three', say: 'The money ball goes in.', maxWords: 5, mc: 4 },
  { id: 'three.miss', group: 'three', say: 'A miss. Tiny.', maxWords: 3, mc: 5 },
  { id: 'three.streak', group: 'three', say: 'Three or four in a row.', maxWords: 5, mc: 4 },
  { id: 'three.fire', group: 'three', say: 'Five or more in a row: a clean rack, can\'t miss.', maxWords: 6, mc: 4, side: 2 },
  { id: 'three.cold', group: 'three', say: 'Three misses in a row.', maxWords: 6, mc: 3 },
  { id: 'three.clock', group: 'three', say: 'Ten seconds left on the clock.', maxWords: 5, mc: 3 },
  { id: 'three.buzzer', group: 'three', say: 'A shot released before the horn goes in after it: it counts.', maxWords: 6, mc: 3 },
  { id: 'three.results', group: 'three', say: 'The qualifying results come in, shooter by shooter.', maxWords: 10, mc: 2 },
  { id: 'three.advance', group: 'three', say: 'The player advances to the final.', maxWords: 12, mc: 3 },
  { id: 'three.out', group: 'three', say: 'The player is out in qualifying.', maxWords: 12, mc: 3 },
  { id: 'three.final', group: 'three', say: 'The final: the player shoots last and knows the number to beat.', maxWords: 14, mc: 3 },
  { id: 'three.clinch', group: 'three', say: 'The player just passed the number: it is won.', maxWords: 6, mc: 3 },
  { id: 'three.champion', group: 'three', say: 'The player is the three-point champion.', maxWords: 14, mc: 3 },

  // ── the runs: 1v1 (Ones, to 11, make it take it) and 3v3 (Threes, to 21, a 90 s clock) ──────────────────────────
  { id: 'game.intro.ones', group: 'game', say: 'A one-on-one run opens: first to eleven, make it take it.', maxWords: 20, mc: 2 },
  { id: 'game.intro.threes', group: 'game', say: 'A three-on-three run opens: first to twenty-one, a ninety-second clock.', maxWords: 20, mc: 2 },
  { id: 'game.check', group: 'game', say: 'Check ball: the other side has it, the player is on defense.', maxWords: 6, mc: 4 },
  { id: 'game.make', group: 'game', say: 'The player hits a two (a jumper).', maxWords: 5, mc: 6, side: 1 },
  { id: 'game.three', group: 'game', say: 'The player hits a three.', maxWords: 5, mc: 5 },
  { id: 'game.layup', group: 'game', say: 'The player finishes at the rim: a layup, floater, finger roll, reverse.', maxWords: 5, mc: 4 },
  { id: 'game.dunk', group: 'game', say: 'The player dunks it in a game (the dunk\'s name may follow).', maxWords: 5, mc: 5 },
  { id: 'game.poster', group: 'game', say: 'The player dunks ON a defender: a poster. The biggest call in the run.', maxWords: 6, mc: 6, side: 3 },
  { id: 'game.andone', group: 'game', say: 'Scores through the foul: and one.', maxWords: 5, mc: 4 },
  { id: 'game.miss', group: 'game', say: 'The player misses a shot.', maxWords: 4, mc: 4 },
  { id: 'game.airball', group: 'game', say: 'An airball. The crowd will let them know (clean).', maxWords: 5, mc: 4 },
  { id: 'game.block', group: 'game', say: 'The player blocks a shot.', maxWords: 5, mc: 6, side: 2 },
  { id: 'game.blocked', group: 'game', say: 'The player got their shot blocked.', maxWords: 5, mc: 4 },
  { id: 'game.steal', group: 'game', say: 'The player steals the ball.', maxWords: 5, mc: 5 },
  { id: 'game.stolen', group: 'game', say: 'The player lost the ball (stripped, picked off).', maxWords: 5, mc: 4 },
  { id: 'game.ankles', group: 'game', say: 'The player\'s crossover dropped the defender: broken ankles.', maxWords: 5, mc: 6, side: 3 },
  { id: 'game.bite', group: 'game', say: 'The defender bit on the pump fake / hesitation.', maxWords: 5, mc: 4 },
  { id: 'game.foul', group: 'game', say: 'A whistle: charge, blocking foul, goaltending, three seconds, out of bounds.', maxWords: 5, mc: 4 },
  { id: 'game.rival.make', group: 'game', say: 'The other side scores.', maxWords: 6, mc: 5 },
  { id: 'game.rival.dunk', group: 'game', say: 'The other side dunks (maybe on the player).', maxWords: 6, mc: 4 },
  { id: 'game.run', group: 'game', say: 'The player is on a run: three or more buckets unanswered.', maxWords: 8, mc: 4 },
  { id: 'game.point', group: 'game', say: 'Game point: one bucket from winning. Tag side:us = the player is one away; side:them = the other side is.', maxWords: 8, mc: 0, tags: ['side:us', 'side:them'] },
  { id: 'game.win', group: 'game', say: 'The game-winning bucket: the player wins the run.', maxWords: 10, mc: 4, side: 1 },
  { id: 'game.loss', group: 'game', say: 'The other side wins the run.', maxWords: 10, mc: 3 },
  { id: 'game.draw', group: 'game', say: '3v3 ends tied at the buzzer.', maxWords: 10, mc: 2 },
  { id: 'game.assist', group: 'game', say: '3v3: the player\'s pass sets up a teammate\'s bucket.', maxWords: 5, mc: 4 },
  { id: 'game.alleyoop', group: 'game', say: '3v3: an alley-oop.', maxWords: 5, mc: 3 },
  { id: 'game.clock', group: 'game', say: '3v3: ten seconds left on the game clock.', maxWords: 6, mc: 3 },
  { id: 'game.overdrive', group: 'game', say: '3v3: the team\'s synergy meter maxes out: overdrive.', maxWords: 6, mc: 3 },

  // ── the court carnival (Game Night) ─────────────────────────────────────────────────────────────────────────────
  { id: 'carnival.intro', group: 'carnival', say: 'Game Night opens: four mini-events tonight, points for each, one champion.', maxWords: 20, mc: 3 },
  { id: 'carnival.event', group: 'carnival', say: 'Introduce the next event. Slam Rush: dunk as many as you can in twenty seconds. Strike Storm: land hits on the pads. Trick Gauntlet: a skate trick run. Hot Shot: shots on goal. Coin Storm: grab the coins. Counter Strike: counter the jab in the window.', maxWords: 12, mc: 0, tags: CARNIVAL_TAGS },
  { id: 'carnival.go', group: 'carnival', say: 'The event starts.', maxWords: 3, mc: 3 },
  { id: 'carnival.clock', group: 'carnival', say: 'Five seconds left in the event.', maxWords: 5, mc: 3 },
  { id: 'carnival.eventwin', group: 'carnival', say: 'The player wins the event.', maxWords: 10, mc: 4 },
  { id: 'carnival.eventloss', group: 'carnival', say: 'The rival wins the event.', maxWords: 10, mc: 3 },
  { id: 'carnival.tie', group: 'carnival', say: 'The event is a tie.', maxWords: 8, mc: 2 },
  { id: 'carnival.handoff', group: 'carnival', say: 'Two players on one screen: pass the controller, player two is up.', maxWords: 8, mc: 2 },
  { id: 'carnival.champion', group: 'carnival', say: 'The player is the carnival champion.', maxWords: 14, mc: 3 },
  { id: 'carnival.runnerup', group: 'carnival', say: 'The rival takes the carnival.', maxWords: 14, mc: 2 },
];

/** dunk.make is tiered: MC lines per tier (0 ordinary, 1 good, 2 huge), and the sidekick's answers per tier. */
export const TIER_COUNTS: Record<string, { mc: [number, number, number]; side: [number, number, number] }> = {
  'dunk.make': { mc: [6, 8, 10], side: [1, 2, 3] },
};

// ── the crowd and the players ────────────────────────────────────────────────────────────────────────────────────
/** What each crowd voice shouts (per voice). Crowd lines are chatter from the stands: short, overlapping, never the MC. */
export const CROWD_MOMENTS: readonly { id: string; say: string; maxWords: number; n: number }[] = [
  { id: 'crowd.hype', say: 'Before a big moment: get up for it.', maxWords: 4, n: 4 },
  { id: 'crowd.ooh', say: 'A gasp at something slick (a trick, a crossover, a near miss).', maxWords: 3, n: 3 },
  { id: 'crowd.cheer', say: 'A make.', maxWords: 4, n: 4 },
  { id: 'crowd.erupt', say: 'Something unbelievable just happened.', maxWords: 5, n: 4 },
  { id: 'crowd.groan', say: 'A miss that hurt.', maxWords: 4, n: 3 },
  { id: 'crowd.heckle', say: 'A brick, an airball, a blocked shot: a clean heckle.', maxWords: 5, n: 3 },
  { id: 'crowd.idle', say: 'Stands chatter between plays (to a friend, to the court).', maxWords: 8, n: 5 },
  { id: 'crowd.defense', say: 'Chanting for defense.', maxWords: 3, n: 1 },
];
/** What the players say. The dunk rivals only speak in the contest; the hoopers only in the runs. */
export const PLAYER_MOMENTS: readonly { id: string; who: 'rival' | 'hooper'; say: string; maxWords: number; n: number }[] = [
  { id: 'player.dunk.brag', who: 'rival', say: 'After his own made dunk, in his own temperament.', maxWords: 6, n: 3 },
  { id: 'player.dunk.jab', who: 'rival', say: 'After the player misses a dunk: a clean jab.', maxWords: 6, n: 2 },
  { id: 'player.dunk.respect', who: 'rival', say: 'After the player throws down a big one: grudging respect.', maxWords: 6, n: 2 },
  { id: 'player.trash.score', who: 'hooper', say: 'After he scores on the player.', maxWords: 6, n: 3 },
  { id: 'player.trash.stop', who: 'hooper', say: 'After he blocks or strips the player.', maxWords: 6, n: 2 },
  { id: 'player.beaten', who: 'hooper', say: 'After the player scores on him, posters him or breaks his ankles.', maxWords: 5, n: 3 },
  { id: 'player.callball', who: 'hooper', say: '3v3 teammate calling for the ball: open.', maxWords: 4, n: 3 },
  { id: 'player.defense', who: 'hooper', say: '3v3 teammate on defense: switch, help, I got him.', maxWords: 4, n: 2 },
  { id: 'player.check', who: 'hooper', say: 'Checking the ball before a possession.', maxWords: 4, n: 2 },
];

/** Every moment id any cast member can be asked for. */
export const ALL_MOMENT_IDS: readonly string[] = [...MOMENTS.map((m) => m.id), ...CROWD_MOMENTS.map((m) => m.id), ...PLAYER_MOMENTS.map((m) => m.id), 'name'];
export const momentSpec = (id: string): MomentSpec | undefined => MOMENTS.find((m) => m.id === id);
