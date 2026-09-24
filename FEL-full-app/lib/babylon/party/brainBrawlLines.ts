// Brain Brawl's voices (BRAINBRAWL-RESIDUAL, 2026-09-24) — the eye's HARD 3: "the podiums don't talk … no MC/host voice".
//
// Two kinds of talk:
//   · THE HOST, DOC VOLT: an original quiz-show host (British, quick, fond of a pun, never cruel). Voiced: pre-rendered with
//     Kokoro (Apache-2.0 weights, offline, scripts/mic/build-brainbrawl-voice.mts → public/audio/voice/v1/bb_host/quiz.*), played
//     on the studio PA through VoiceKit, and captioned on screen whether or not the audio plays. He stands centre stage and
//     talks with his body too (party_talk / party_present).
//   · THE CONTESTANTS: speech bubbles over their podiums with the gesture that goes with the line (the buzz, the fist pump,
//     the facepalm, party_talk). Not voiced: the podium bodies are the PLAYERS' avatars, and nobody's avatar gets a voice
//     picked for them.
// Rules the host's lines follow (the mic's script rules): clean, gender-neutral about the players, numbers as words, short
// enough to be over before the next beat (a landing line has ~0.7 s before the card, so those are the shortest).
//
// A line id is `<moment>.<nn>`; the renderer keys each clip by it, the mode picks by moment.

import type { Category } from '../core/BrainBrawlCore';

export const BB_HOST = {
  cast: 'bb_host',
  group: 'quiz',
  name: 'DOC VOLT',
  persona: 'The host of Brain Brawl: a British quiz-show host with a spark of the mad professor. Quick, bright, warm, fond of a pun, never cruel to a wrong answer. Big on the reveal, brisk between beats.',
  voice: { mix: [['bm_george', 0.6], ['bm_fable', 0.4]] as [string, number][], speed: 1.08 },
} as const;

export type HostMoment =
  | 'intro.solo' | 'intro.duel' | 'again' | 'spin' | 'spin.last'
  | `land.${Category}` | 'memorise' | 'hurry'
  | 'right' | 'right.fast' | 'right.both' | 'wrong' | 'wrong.both' | 'timeout'
  | 'claim' | 'steal' | 'hold' | 'stays'
  | 'best' | 'solo.done' | 'duel.p1' | 'duel.p2' | 'draw';

export interface HostLine { id: string; moment: HostMoment; text: string }

const L = (moment: HostMoment, ...texts: string[]): HostLine[] => texts.map((text, i) => ({ id: `${moment}.${String(i + 1).padStart(2, '0')}`, moment, text }));

export const HOST_LINES: readonly HostLine[] = [
  // the intros ride the first spin (2.2 s to the landing call), so they are over before it
  ...L('intro.solo', 'Welcome to Brain Brawl!', 'Brains at the ready!', 'Good evening, brawlers!'),
  ...L('intro.duel', 'Two brains, one wheel!', 'Let the brawl begin!', 'Welcome to Brain Brawl!'),
  ...L('again', 'Back for more? Splendid. Spin it!', 'Round two of the brains. Here we go!', 'Once more, with feeling!'),
  ...L('spin', 'Round and round she goes…', 'Spin that wheel!', 'Where will it stop?', 'Let us see where it lands.', 'The wheel decides!', 'Big wheel, keep on turning.'),
  ...L('spin.last', 'The last category. Make it count!', 'Final spin of the night!'),
  ...L('land.LOGIC', 'Logic! Find the rule.', 'It is Logic!'),
  ...L('land.MEMORY', 'Memory! Eyes on the grid.', 'Memory! Look closely.'),
  ...L('land.COMPUTE', 'Compute! Quick maths.', 'Compute! Crunch it.'),
  ...L('land.ANALYZE', 'Analyze! Study the shapes.', 'Analyze! Turn it over.'),
  ...L('land.IDENTIFY', 'Identify! Sharp eyes.', 'Identify! Spot it.'),
  ...L('memorise', 'Take it in. It will not stay!', 'Memorise it… quickly now.'),
  ...L('hurry', 'Three seconds!', 'Clock is running out!', 'Hurry up!'),
  ...L('right', 'Correct!', 'That is right!', 'Spot on!', 'Brilliant!', 'Yes, well done!'),
  ...L('right.fast', 'Lightning fast!', 'What a brain!', 'Faster than the clock!'),
  ...L('right.both', 'Both of you, correct!', 'Two right answers! Speed decides it.'),
  ...L('wrong', 'Oh, not quite.', 'Ooh, so close.', 'That is a no, I am afraid.', 'Unlucky!'),
  ...L('wrong.both', 'Neither of you! Oh dear.', 'Two wrong answers. Nobody scores.'),
  ...L('timeout', 'Time is up!', 'Out of time!', 'The clock wins that one.'),
  ...L('claim', 'The category is claimed!', 'Claimed! One more on the board.'),
  ...L('steal', 'A steal! It changes hands!', 'Snatched right away!', 'Taken! What a swing.'),
  ...L('hold', 'Held on to it!', 'Defended! It stays put.'),
  ...L('stays', 'It stays where it was.', 'No change on the board.'),
  ...L('best', 'A new personal best!', 'Record smashed!'),
  ...L('solo.done', 'That is the brawl! Nicely played.', 'And that is all five. What a run!'),
  ...L('duel.p1', 'Player one takes the brawl!', 'The brawl goes to player one!'),
  ...L('duel.p2', 'Player two takes the brawl!', 'The brawl goes to player two!'),
  ...L('draw', 'Dead level! What a brawl.', 'A draw! Nothing between them.'),
];

/** A contestant's bubble lines, by the beat they go with. Short: a bubble is read in a glance. */
export const SEAT_LINES = {
  spin: ['Come on, big wheel!', 'Land on a good one…', 'Give me LOGIC!', 'Not MEMORY, not MEMORY…', 'Big brain time.', 'Spin it!'],
  think: ['Hmm…', 'Let me think…', 'Ooh, tricky.', 'Wait for it…', 'I know this!'],
  lock: ['Final answer!', 'Locked in!', 'Got it!', 'Easy.', 'That one.'],
  right: ['Yes!', 'Too easy!', 'Knew it!', 'Big brain!', 'Get in!'],
  rightFast: ['Instant!', 'Didn’t even blink!', 'Speed AND brains!'],
  wrong: ['No way…', 'Argh!', 'I knew that!', 'Seriously?', 'Nooo…'],
  timeout: ['Wait — what?', 'Too slow!', 'Blanked!', 'Brain freeze!'],
  claim: ['Mine!', 'On the board!', 'Claimed it!'],
  steal: ['Mine now!', 'Thanks for that!', 'I’ll take that!'],
  win: ['Big brain energy!', 'Champion!', 'Who’s next?', 'Unstoppable!'],
  lose: ['Rematch. Now.', 'Next time…', 'GG.', 'I was warming up!'],
} as const;
export type SeatBeat = keyof typeof SEAT_LINES;

/** One of `pool`, never the one said last time (a rotation that does not repeat back to back). */
export function pickFrom<T>(pool: readonly T[], rnd: () => number, last?: T): T {
  if (pool.length <= 1) return pool[0];
  let x = pool[Math.floor(rnd() * pool.length)];
  if (x === last) x = pool[(pool.indexOf(x) + 1) % pool.length];
  return x;
}

export const hostLines = (moment: HostMoment): HostLine[] => HOST_LINES.filter((l) => l.moment === moment);
