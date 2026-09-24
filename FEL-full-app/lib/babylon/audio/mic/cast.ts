// THE MIC's cast — the voices at the hoops events (2026-09-24).
//
// Owner decisions: one MC per court (Venice is the lead mic), a shared courtside sidekick, crowd chatter and player chatter;
// pre-rendered with Kokoro (Apache-2.0 weights, rendered offline by tools/voice/render-mic.py); clean streetball language.
//
// Every voice here is an ORIGINAL character. The owner means to put real people behind these mics ("Mouthpiece aka voice of
// venice beach would be perfect for this and i will get a creator card for all my guys"): a signed creator card fills `card`,
// and the person records the same line ids in their own voice and their own words (the recording scripts are generated from the
// script files). Until a card is signed nobody's real voice, name or catchphrase is imitated.
//
// `voice` is the Kokoro style mix ([voice, weight] pairs, blended) and the speaking rate. `pa` puts the voice through the court's
// PA system (the MCs and the sidekick are on the mic; the crowd and the players are not).

import type { CourtLocationId } from '@/lib/babylon/nexus/courtLocations';
import type { MicRole } from './MicDirector';

export interface CastMember {
  id: string;
  role: MicRole;
  /** The name on the lower third. */
  name: string;
  /** Who they are, how they talk: the brief the scripts are written to. */
  persona: string;
  voice: { mix: readonly (readonly [string, number])[]; speed: number };
  pa: boolean;
  /** The court an MC works. */
  court?: CourtLocationId;
  /** A signed creator card that puts a real person behind this voice (their recordings replace the rendered lines). */
  card?: { slug: string; status: 'pending' | 'signed' };
}

export const CAST: readonly CastMember[] = [
  // ── the MCs, one per court ────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'boardwalk', role: 'mc', name: 'BOARDWALK', court: 'venice', pa: true,
    persona: 'The lead mic at Venice Beach Court, and the loudest voice on the boardwalk. A streetball hype MC who has worked this court for years: rapid-fire, rhythmic, half-rhyming, gives everybody a nickname on the spot ("the kid", "sneakers", "Mister Smooth"), pulls the crowd in with call-and-response, never lets a big play go by without a bit. His world: the sand, the pier, the sunset, the drum circle, the skaters from Dogtown, the smell of the taco stand, tourists with phones up. Signature bits are his own: "Boardwalk approved!", "Tide is coming in!", "Sand in your shoes!". Big energy, warm heart: roasts the play, never the person.',
    voice: { mix: [['am_fenrir', 0.7], ['am_onyx', 0.3]], speed: 1.1 },
    // the owner's pick for this mic arrives with a creator card: until it is signed this is the original character above
    card: { slug: 'venice-lead-mic', status: 'pending' },
  },
  {
    id: 'unclejune', role: 'mc', name: 'UNCLE JUNE', court: 'blossom', pa: true,
    persona: 'The MC of Blossom Park and its Spring Invitational: a park elder who has called games under these cherry trees since before the players were born. Slow burn, dry wit, proverbs and "back in my day" stories that land in one sentence, a grandparent\'s warmth. Understated on ordinary plays, then genuinely loses it on a great one ("Oh, now hold on. HOLD ON."). His world: petals on the court, the spring air, the bench regulars, the ice cream cart, the old-timers who still play Sundays.',
    voice: { mix: [['am_onyx', 0.6], ['am_eric', 0.4]], speed: 0.96 },
  },
  {
    id: 'nova', role: 'mc', name: 'NOVA', court: 'orbit', pa: true,
    persona: 'The arena announcer of Orbit and its Zero-G Classic: a court floating under the stars with a planet rising behind the hoop. Big, crisp, dramatic arena voice with a space-mission vocabulary: liftoff, launch window, orbit, re-entry, gravity, countdown, mission control, touchdown, "we have altitude". Clean and confident, a sci-fi showrunner who treats every dunk like a rocket launch and every miss like a scrubbed mission.',
    voice: { mix: [['af_nova', 0.5], ['af_heart', 0.5]], speed: 1.06 },
  },
  {
    id: 'moss', role: 'mc', name: 'MOSS', court: 'canopy', pa: true,
    persona: 'The MC of Canopy Court and its Treetop Jam: a court in the forest with light coming down through the leaves. Laid-back, easygoing, a little surfer-calm, full of nature metaphors (roots, branches, the canopy, birds scattering, "the whole forest woke up"). Chuckles a lot, hype that builds slowly like wind in the trees, then a big joyful shout on the best plays. Never mean; teases with a grin.',
    voice: { mix: [['am_puck', 0.7], ['am_liam', 0.3]], speed: 1.04 },
  },
  {
    id: 'velvet', role: 'mc', name: 'VELVET', court: 'rooftop', pa: true,
    persona: 'The host of Night Rooftop and its After Hours run: a court on a roof at night, string lights, the city skyline all around. A smooth late-night radio voice: calm, cool, jazz-club timing, savage one-liners delivered almost in a whisper, the city as her audience ("the whole skyline saw that"). Rarely raises her voice, so when she does it means something.',
    voice: { mix: [['af_bella', 0.6], ['af_kore', 0.4]], speed: 0.98 },
  },
  // ── the courtside sidekick, every court ─────────────────────────────────────────────────────────────────────────
  {
    id: 'scoop', role: 'side', name: 'SCOOP', pa: true,
    persona: 'The courtside sidekick who travels with every event: the stats-and-gossip guy with a second mic. Quick, excitable, a little nerdy, answers the MC ("Told you!", "Put that on a shirt!", "Somebody check the tape!"), knows every regular, keeps a notebook of who owes who a rematch. Never talks over the MC: he answers, he adds, he laughs.',
    voice: { mix: [['am_michael', 0.7], ['am_echo', 0.3]], speed: 1.14 },
  },
  // ── the crowd (short shouts from the stands) ────────────────────────────────────────────────────────────────────
  { id: 'crowd_a', role: 'crowd', name: 'THE CROWD', pa: false, persona: 'A loud fan in the front row, a regular who has seen everything.', voice: { mix: [['af_sarah', 1]], speed: 1.12 } },
  { id: 'crowd_b', role: 'crowd', name: 'THE CROWD', pa: false, persona: 'A big-voiced guy with his friends, easily impressed.', voice: { mix: [['am_eric', 0.6], ['am_adam', 0.4]], speed: 1.1 } },
  { id: 'crowd_c', role: 'crowd', name: 'THE CROWD', pa: false, persona: 'A teenager filming everything on a phone.', voice: { mix: [['af_jessica', 1]], speed: 1.18 } },
  { id: 'crowd_d', role: 'crowd', name: 'THE CROWD', pa: false, persona: 'A jolly older guy who heckles with love.', voice: { mix: [['am_santa', 0.5], ['am_echo', 0.5]], speed: 1.05 } },
  { id: 'crowd_e', role: 'crowd', name: 'THE CROWD', pa: false, persona: 'A hooper waiting for next, judging every play.', voice: { mix: [['af_sky', 0.5], ['af_river', 0.5]], speed: 1.15 } },
  { id: 'crowd_f', role: 'crowd', name: 'THE CROWD', pa: false, persona: 'A tourist who just found the court and cannot believe it.', voice: { mix: [['bm_lewis', 0.5], ['am_adam', 0.5]], speed: 1.08 } },
  // ── the players ─────────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'cass', role: 'player', name: 'CASS', pa: false, persona: 'Dunk rival. Never misses, never amazes: steady, dry, a little smug about consistency. Signature: the tomahawk.', voice: { mix: [['am_eric', 0.7], ['am_liam', 0.3]], speed: 1.0 } },
  { id: 'ty', role: 'player', name: 'TY', pa: false, persona: 'Dunk rival. Power, all night, every night: few words, heavy ones. Signature: the windmill.', voice: { mix: [['am_onyx', 0.7], ['am_fenrir', 0.3]], speed: 0.95 } },
  { id: 'pilot', role: 'player', name: 'PILOT', pa: false, persona: 'Dunk rival. Reads the room, then takes it: calm, calculating, cool confidence. Signature: the 360.', voice: { mix: [['am_michael', 0.6], ['am_eric', 0.4]], speed: 1.02 } },
  { id: 'zo', role: 'player', name: 'ZO', pa: false, persona: 'Dunk rival. Here for the highlight, not the win: a showman who plays to the phones. Signature: the eastbay.', voice: { mix: [['am_puck', 0.6], ['am_echo', 0.4]], speed: 1.12 } },
  { id: 'stack', role: 'player', name: 'STACK', pa: false, persona: 'Dunk rival. Goes for the impossible one first: wild, fearless, laughs at danger. Signature: between the legs.', voice: { mix: [['am_fenrir', 0.5], ['am_puck', 0.5]], speed: 1.15 } },
  { id: 'hooper_a', role: 'player', name: 'HOOPER', pa: false, persona: 'A court regular in the runs: confident, chirpy, loves to talk after a bucket.', voice: { mix: [['am_adam', 0.5], ['am_liam', 0.5]], speed: 1.08 } },
  { id: 'hooper_b', role: 'player', name: 'HOOPER', pa: false, persona: 'A court regular in the runs: quiet, gritty, a defender first.', voice: { mix: [['am_echo', 0.6], ['am_michael', 0.4]], speed: 1.0 } },
  { id: 'hooper_c', role: 'player', name: 'HOOPER', pa: false, persona: 'A court regular in the runs: a sharp-shooting woman with a quick tongue.', voice: { mix: [['af_kore', 0.5], ['af_jessica', 0.5]], speed: 1.1 } },
];

export const castById = (id: string): CastMember | undefined => CAST.find((c) => c.id === id);
export const MC_BY_COURT: Record<CourtLocationId, string> = { venice: 'boardwalk', blossom: 'unclejune', orbit: 'nova', canopy: 'moss', rooftop: 'velvet' };
export const SIDEKICK = 'scoop';
export const CROWD = CAST.filter((c) => c.role === 'crowd').map((c) => c.id);
export const DUNK_RIVAL_VOICES: Record<string, string> = { cass: 'cass', ty: 'ty', pilot: 'pilot', zo: 'zo', stack: 'stack' };
export const HOOPERS = ['hooper_a', 'hooper_b', 'hooper_c'] as const;
/** The MC for a court (Venice when the court is unknown: the carnival and anything off the court picker). */
export const mcFor = (court: string | null | undefined): string => MC_BY_COURT[(court ?? 'venice') as CourtLocationId] ?? 'boardwalk';
