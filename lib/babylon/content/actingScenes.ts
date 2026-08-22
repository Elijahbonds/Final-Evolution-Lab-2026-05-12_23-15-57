// actingScenes — original scripts for Acting mode.
//
// Entirely original writing. No film, show, game or franchise is referenced,
// quoted, or evoked; no character is a stand-in for a real person. These are
// sports-adjacent dramatic beats that fit this product's own world — a locker
// room, a last possession, a comeback — which is the same discipline the
// karate "Agent Waves" content follows.
import type { Scene } from '../core/ActingCore';

export const ACTING_SCENES: Scene[] = [
  {
    id: 'last_possession',
    title: 'Last Possession',
    lines: [
      { id: 'lp1', text: 'Twelve seconds. That is a lifetime.', cueAt: 2.0, duration: 2.4, intensity: 'calm' },
      { id: 'lp2', text: 'Give me the ball.', cueAt: 5.5, duration: 1.6, intensity: 'raised' },
      { id: 'lp3', text: 'I said GIVE ME THE BALL!', cueAt: 8.0, duration: 2.0, intensity: 'shout' },
      { id: 'lp4', text: 'Now watch.', cueAt: 11.5, duration: 1.4, intensity: 'whisper' },
    ],
  },
  {
    id: 'the_cut',
    title: 'The Cut',
    lines: [
      { id: 'tc1', text: 'You are telling me I did not make it.', cueAt: 2.0, duration: 2.6, intensity: 'calm' },
      { id: 'tc2', text: 'Three years. Every morning.', cueAt: 6.0, duration: 2.2, intensity: 'raised' },
      { id: 'tc3', text: 'Fine. Keep the jersey.', cueAt: 10.0, duration: 2.0, intensity: 'whisper' },
      { id: 'tc4', text: 'I will be back for it.', cueAt: 13.0, duration: 1.8, intensity: 'raised' },
    ],
  },
  {
    id: 'the_comeback',
    title: 'The Comeback',
    lines: [
      { id: 'cb1', text: 'They think this is over.', cueAt: 2.0, duration: 2.0, intensity: 'whisper' },
      { id: 'cb2', text: 'Look at the clock. Look at it.', cueAt: 5.0, duration: 2.4, intensity: 'calm' },
      { id: 'cb3', text: 'We are not done!', cueAt: 8.5, duration: 1.8, intensity: 'shout' },
    ],
  },
];
