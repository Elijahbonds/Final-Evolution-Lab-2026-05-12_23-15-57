// PROFESSOR OKTA — the Groove Academy's mentor (MUSIC-SUITE P8, 2026-09-25). Owner decisions #27/#33/#34 (draft signed
// off in musicsuite/p8/HOST-DRAFT.md before any line was rendered): an original character — calm, precise, a little
// playful, talks about music like a conversation, never lectures. Okta's TEXT tips already exist and stay exactly as
// they were (StudioMode.tsx's OKTA_TIPS, a random rotation every 14s, captions only, no voice) — this file is the
// separate, voiced set: five specific moments, each said once (firstvisit/firstbeat/firstperform/fliplesson) or every
// time it happens (published), never the rotating tips.
//
// Same "own contract" shape as Stoop (script/stoop.ts) and BRAINBRAWL-RESIDUAL's bb_host: one voice, no booth, not
// THE MIC's hoops cast (cast.ts) or MicDirector. ACADEMY_MOMENTS in moments.ts carries these ids' word limits, so
// scriptRules.lintLine holds these lines to the same bar a hoops MC's are held to. `PERFORM` and "CHOP THE FEL THEME"
// are UI labels shown in all caps on screen — spoken lines below say them in lower case on purpose (the ALLCAPS rule
// bans an all-caps word other than "MC": a Kokoro voice would not read PERFORM specially anyway, so the spoken line
// says "your set" / "live" instead of naming the tab).

import type { HostCast, HostLine } from '../hostVoice';

export const OKTA: HostCast = {
  id: 'okta',
  name: 'PROFESSOR OKTA',
  group: 'academy',
  // bm_fable (warm, unhurried) + bm_george (a little playful) at 0.95x — distinct from every hoops MC (cast.ts), from
  // DOC VOLT (bm_george/bm_fable at 1.08x, faster and George-forward) and from movement play's COACH (af_heart/bf_emma).
  voice: { mix: [['bm_fable', 0.7], ['bm_george', 0.3]], speed: 0.95 },
};

const L = (moment: string, ...texts: string[]): HostLine[] =>
  texts.map((text, i) => ({ id: `${moment}.${String(i + 1).padStart(2, '0')}`, moment, text }));

export const OKTA_LINES: readonly HostLine[] = [
  ...L('academy.firstvisit',
    'Welcome to the Academy. Everything here starts with one beat, find it, then build from there.',
    'Welcome in. Take your time, the grid will wait for you.',
    'This is the Academy, your studio, your rules. Start with one sound.',
    'Good to have you here. Every song starts as one small idea.'),
  ...L('academy.firstbeat',
    'There it is, your first beat. Everything else builds from here.',
    "That's a beat on the grid. Now give it a friend.",
    "One sound, placed on purpose. That's how every song starts.",
    'You just started a song. Keep going from that first hit.'),
  ...L('academy.firstperform',
    'This is your set. Play what you built, live, from the top.',
    'Time to play it live. Everything you practiced is about to count.',
    'Your first live set starts now. Trust what you built.',
    'No more grid, no more undo, just play it. Here we go.'),
  ...L('academy.fliplesson',
    "Let's chop a theme. Play the pads in order first, then flip them into a beat.",
    "Every producer starts by chopping a theme. Here's yours.",
    "Play it in order, then play it as a flip. That's the whole trick.",
    'This is how a theme becomes a beat. Chop it, then flip it.'),
  ...L('academy.published',
    'Published. That song is on the shelf for everyone to hear now.',
    "That's a real song now, out where the whole Academy can hear it.",
    'Nicely done. Another one goes on the shelf.',
    'Your song is live in the library. Somebody is listening right now.'),
];

export const oktaLines = (moment: string): HostLine[] => OKTA_LINES.filter((l) => l.moment === moment);
