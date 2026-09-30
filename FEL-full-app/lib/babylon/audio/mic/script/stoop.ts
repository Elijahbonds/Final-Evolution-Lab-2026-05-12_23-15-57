// STOOP — the Cypher's block-party MC (MUSIC-SUITE P8, 2026-09-25). Owner decisions #27/#33/#34 (draft signed off in
// musicsuite/p8/HOST-DRAFT.md before any line was rendered): an original character — no real person's name, voice or
// catchphrase — who runs the dance room from the front stoop with a mic and a folding chair. Warm, loud, knows
// everyone, leans on call-and-response.
//
// This is DanceMode.ts's OWN cast, not THE MIC's hoops cast (lib/babylon/audio/mic/cast.ts, court-scoped, MC/side/
// crowd/player roles, MicDirector's booth-fight logic) — the same separation BRAINBRAWL-RESIDUAL drew for DOC VOLT
// (lib/babylon/party/brainBrawlLines.ts): one voice, one line at a time, no booth to share. What IS shared with THE
// MIC: the moments contract (DANCE_MOMENTS in moments.ts carries these ids' word limits, so scriptRules.lintLine
// grades these lines by the exact same rules a hoops MC's lines are held to), the rendered-bank format (VoiceKit
// already plays '<cast>/<line id>' clips), and the voice bus (SoundKit's voiceBus — VoiceKit routes into it).
//
// Lines: 3-5 variants per moment (DANCE_MOMENTS' `n`, moments.ts), FEL's own words extended from HOST-DRAFT.md's
// approved samples. Word counts checked by hand against DANCE_MOMENTS' maxWords when these were written; hostVoice
// .test.ts / stoop.test.ts hold them to it going forward. `dance.freestyle` and `dance.callbar` were written here in P8
// ahead of their mechanic; MUSIC-SUITE P9 (2026-09-29) WIRED them — DanceMode.ts queues one a bar ahead of each switch
// between a freestyle bar and a called bar (dance/freestyle.ts barCue), through the same SpeechQueue judge-window guard
// as every other in-chart line. (MUSIC-SUITE P10, 2026-09-29: this note said "unwired" until now — P9's open item.)

import type { HostCast, HostLine } from '../hostVoice';

export const STOOP: HostCast = {
  id: 'stoop',
  name: 'STOOP',
  group: 'dance',
  // am_puck (warm, a little gravelly) + am_michael (excitable) at 1.05x — distinct from every hoops MC (cast.ts) and
  // from DOC VOLT (bm_george/bm_fable): the only block-party voice on the roster.
  voice: { mix: [['am_puck', 0.6], ['am_michael', 0.4]], speed: 1.05 },
};

/** A line id is `<moment>.NN` (brainBrawlLines.ts's own `L` convention) — VoiceKit keys clips by id, so the numbering
 *  only has to stay unique per moment, never meaningful. */
const L = (moment: string, ...texts: string[]): HostLine[] =>
  texts.map((text, i) => ({ id: `${moment}.${String(i + 1).padStart(2, '0')}`, moment, text }));

export const STOOP_LINES: readonly HostLine[] = [
  ...L('dance.open',
    "Block's open, speakers up, and the circle's waiting on you. Step in when the beat drops.",
    'The circle is live and the sound is loud. Come on in whenever the beat calls you.',
    'Speakers are humming and the block is ready. Step into the circle when you feel it.',
    'The Cypher is open tonight. Find the pocket and step on in.'),
  ...L('dance.walkout',
    'Here they come, walking out to their own sound.',
    'Here we go, walking out to the sound that gets you moving.',
    "Straight off the sideline and onto the floor. Let's go.",
    'Here comes the walk-out. Give the floor some room.'),
  ...L('dance.countin',
    "Here it comes, ride the one.",
    'Find the one and ride it.',
    'Count is rolling now, lock onto the kick.',
    'Here we go. Feel the one first.'),
  ...L('dance.streak',
    "Now that's a pocket! Circle, make some noise!",
    'Right on the one, again and again!',
    "That's the pocket, and you're living in it!",
    "Locked on the beat, the circle feels it!"),
  ...L('dance.instrument',
    'Hear that horn? You earned it.',
    'Listen, a new voice just joined the mix.',
    'You unlocked that sound yourself. Keep going.',
    'Another piece just fell into place.'),
  ...L('dance.missstreak',
    'Shake it off. Find the kick and walk back in.',
    'Reset your feet. The pocket is still there.',
    'Breathe, find the one, and step back in.',
    'Every dancer loses the pocket sometimes. Find it again.'),
  // P9: queued a bar ahead of a freestyle bar (DanceMode.ts via dance/freestyle.ts barCue — see the file header)
  ...L('dance.freestyle',
    "Freestyle bar, it's all yours. Show the block something new.",
    'No steps written down here, make one up.',
    'This bar is yours. Show the circle something they have not seen.',
    "Open floor, open bar, whatever you've got, bring it."),
  // P9: queued a bar ahead of a called bar after freestyle (DanceMode.ts via barCue — see the file header)
  ...L('dance.callbar',
    'Call bar coming. Match the move right on the beat.',
    "Here's the call, answer it on the beat.",
    'Watch the call bar. Give it right back.',
    'The call is coming. Match it clean.'),
  ...L('dance.newdancer',
    'New dancer in the circle! Make some room.',
    'First time in the circle, welcome to the block.',
    'A new face on the floor tonight! Give some room.',
    "Fresh dancer stepping in. Let's see what you've got."),
  ...L('dance.topgrade',
    "Clean from the first step to the last hit. The block's talking about that one.",
    'Every single step landed. That is how it is done.',
    'Top to bottom, clean the whole way through. Remember that one.',
    'That was as clean as the circle has seen all night.'),
  ...L('dance.lowgrade',
    "Rough set, and that's fine. Every legend fell out of time once.",
    'That one got away, but the pocket is still open. Come back in.',
    'Off the beat tonight, and that happens. Shake it off and try again.',
    'Not the run you wanted, but the circle still loves this. Come back.'),
  ...L('dance.ownsong',
    'Hold up, this is your beat? The whole block is dancing to your record now.',
    'This track is yours, the circle is moving to your own sound tonight.',
    'You made this one. Now watch the whole block dance to it.',
    'Your own record, on your own floor. Let us hear what you built.'),
  ...L('dance.callresponse',
    'When I say circle, you say up! Circle!',
    'When I say block, you say party! Block!',
    "Give me a shout when the beat drops, let's hear it!",
    "Everybody on the one, say it with me!"),
];

/** Every line at `moment`, in the order they were written (the room picks with hostVoice.pickHostLine). */
export const stoopLines = (moment: string): HostLine[] => STOOP_LINES.filter((l) => l.moment === moment);
