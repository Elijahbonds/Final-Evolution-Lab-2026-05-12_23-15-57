// ATTRIBUTES ARE CAPABILITY; TENDENCIES ARE HOW OFTEN THE AI CHOOSES IT (2026-09-14). Spec §7.
//
// The distinction is the whole point of the section and it is easy to lose: a 90 Three-Point ATTRIBUTE
// means the shot goes in; a 90 spot-up-three TENDENCY means he takes it. A build can have either without
// the other, and one of those combinations makes a player who shoots his team out of games.
//
// So every row that has a capability behind it NAMES it, and `resolve()` warns when the two disagree —
// the spec's own requirement: "a tendency with no capability behind it should surface as a validation
// warning, not a silent bad build." The mapping lives in resolve.ts's TENDENCY_BACKED_BY as data.
//
// NO PRQ CEILING ON ANY OF THESE, and the reason is worth stating: a tendency is a CHOICE, not a physical
// capacity. Nothing measured about a body should limit how often its owner decides to shoot. Capping a
// tendency on a body scan would be the system telling a player what kind of basketball they are allowed to
// want to play.

import type { RatedRow, SectionTable } from './types';

const d = (id: string, label: string, tab: string, glossary: string): RatedRow => ({
  kind: 'rated', id, label, section: 'tendencies', tab, min: 0, max: 99, prqAxis: null, glossary,
});

export const TENDENCIES: SectionTable<RatedRow> = {
  section: 'tendencies',
  title: 'Tendencies',
  rows: [
    // ── Shot Selection ──────────────────────────────────────────────────────────────────────────────
    d('shoot', 'Shoot', 'Shot Selection', 'How often he looks for his own shot at all.'),
    d('touches', 'Touches', 'Shot Selection', 'How often he asks for the ball.'),
    d('drive', 'Drive', 'Shot Selection', 'How often he attacks off the bounce instead of settling.'),
    d('pullUp', 'Pull Up', 'Shot Selection', 'How often he rises out of a live dribble.'),
    d('pumpFake', 'Pump Fake', 'Shot Selection', 'How often he sells the shot before taking it.'),
    d('tripleThreat', 'Triple Threat', 'Shot Selection', 'How often he holds the triple-threat stance on the catch.'),
    d('noTripleThreat', 'No Triple Threat', 'Shot Selection', 'How often he goes straight into a move off the catch.'),
    d('sizeup', 'Sizeup', 'Shot Selection', 'How often he sizes a defender up before committing.'),
    d('hesitation', 'Hesitation', 'Shot Selection', 'How often he uses a hesitation to freeze his man.'),
    d('driveRight', 'Drive Right', 'Shot Selection', 'Which hand he prefers going to. 50 is genuinely two-footed.'),

    // ── Inside ──────────────────────────────────────────────────────────────────────────────────────
    d('standingDunk', 'Standing Dunk', 'Inside', 'How often he goes up from a standstill under the rim.'),
    d('drivingDunk', 'Driving Dunk', 'Inside', 'How often he takes it up off a run rather than laying it in.'),
    d('flashyDunk', 'Flashy Dunk', 'Inside', 'How often the dunk is for the crowd as well as the two points.'),
    d('alleyOop', 'Alley-Oop', 'Inside', 'How often he goes up for a lob.'),
    d('putback', 'Putback', 'Inside', 'How often he goes straight back up with an offensive board.'),
    d('crashGlass', 'Crash Glass', 'Inside', 'How often he crashes rather than getting back.'),
    d('drivingLayup', 'Driving Layup', 'Inside', 'How often he finishes soft instead of going up hard.'),
    d('spinLayup', 'Spin Layup', 'Inside', 'How often the finish is a spin.'),
    d('hopStep', 'Hop Step', 'Inside', 'How often he gathers into a two-foot hop.'),
    d('euroStep', 'Euro Step', 'Inside', 'How often he steps around a body instead of through it.'),
    d('floater', 'Floater', 'Inside', 'How often he lifts it over a big rather than challenging him.'),
    d('stepThrough', 'Step Through', 'Inside', 'How often he steps through contact on the finish.'),

    // ── Mid / Three ─────────────────────────────────────────────────────────────────────────────────
    d('spotUpMid', 'Spot Up Mid', 'Mid/Three', 'How often he takes the set two.'),
    d('offScreenMid', 'Off Screen Mid', 'Mid/Three', 'How often he shoots the two coming off a screen.'),
    d('spotUpThree', 'Spot Up Three', 'Mid/Three', 'How often he takes the set three.'),
    d('offScreenThree', 'Off Screen Three', 'Mid/Three', 'How often he shoots the three coming off a screen.'),
    d('contestedJumper', 'Contested Jumper', 'Mid/Three', 'How willing he is to shoot with a hand up.'),
    d('stepback', 'Stepback', 'Mid/Three', 'How often he creates his own space backwards.'),
    d('spinJumper', 'Spin Jumper', 'Mid/Three', 'How often he spins into a jumper.'),
    d('transitionPullUp', 'Transition Pull Up', 'Mid/Three', 'How often he stops and rises in the open floor.'),
    d('deepRange', 'Deep Range Attempt', 'Mid/Three', 'How often he takes one from well behind the line.'),

    // ── Post ────────────────────────────────────────────────────────────────────────────────────────
    d('postUp', 'Post Up', 'Post', 'How often he asks for it with his back to the rim.'),
    d('postShimmy', 'Post Shimmy', 'Post', 'How often he shoulder-fakes before turning.'),
    d('postFaceUp', 'Post Face Up', 'Post', 'How often he turns and faces instead of backing in.'),
    d('postBackDown', 'Post Back Down', 'Post', 'How often he works his man toward the rim.'),
    d('postAggressiveBackdown', 'Post Aggressive Backdown', 'Post', 'How hard he works him when he does.'),
    d('postSpin', 'Post Spin', 'Post', 'How often the counter is a spin.'),
    d('postDrive', 'Post Drive', 'Post', 'How often he puts it on the floor out of the post.'),
    d('postHopShot', 'Post Hop Shot', 'Post', 'How often he hops into the shot.'),
    d('postStepBack', 'Post Step Back', 'Post', 'How often he creates space backwards in the post.'),
    d('postHookL', 'Post Hook Left', 'Post', 'How often the hook goes over the left shoulder.'),
    d('postHookR', 'Post Hook Right', 'Post', 'How often the hook goes over the right shoulder.'),
    d('postFadeL', 'Post Fade Left', 'Post', 'How often he fades to his left.'),
    d('postFadeR', 'Post Fade Right', 'Post', 'How often he fades to his right.'),

    // ── Passing ─────────────────────────────────────────────────────────────────────────────────────
    d('pass', 'Pass', 'Passing', 'How often he moves it rather than holding it.'),
    d('dishToOpenMan', 'Dish to Open Man', 'Passing', 'How reliably he finds the open man instead of forcing.'),
    d('flashyPass', 'Flashy Pass', 'Passing', 'How often the pass is the harder, better-looking one.'),
    d('alleyOopPass', 'Alley-Oop Pass', 'Passing', 'How often he throws the lob.'),
    d('throwAhead', 'Throw Ahead', 'Passing', 'How often he hits the runner in transition.'),
    d('rollVsPop', 'Roll vs Pop', 'Passing', 'After setting a screen: 0 always rolls, 99 always pops.'),
    d('useScreen', 'Use Screen', 'Passing', 'How often he actually uses the screen set for him.'),
    d('handOff', 'Hand Off', 'Passing', 'How often he gives it up on a hand-off.'),

    // ── Defense ─────────────────────────────────────────────────────────────────────────────────────
    d('takeCharge', 'Take Charge', 'Defense', 'How often he steps in front of a driver.'),
    d('onBallSteal', 'On-Ball Steal', 'Defense', 'How often he reaches on the handler.'),
    d('contestShot', 'Contest Shot', 'Defense', 'How often he closes out hard.'),
    d('blockShot', 'Block Shot', 'Defense', 'How often he goes for the block instead of staying down.'),
    d('foul', 'Foul', 'Defense', 'How often he takes the foul rather than giving up the finish.'),
    d('hardFoul', 'Hard Foul', 'Defense', 'How hard it is when he does.'),
    d('playPassingLanes', 'Play Passing Lanes', 'Defense', 'How often he gambles on the interception.'),
    d('helpDefenseCommit', 'Help Defense Commit', 'Defense', 'How far he commits when he rotates.'),
  ],
};
