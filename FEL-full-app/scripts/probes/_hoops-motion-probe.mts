// _hoops-motion-probe — every hoops action as MOTION (HOOPS MOTION pass, phase 1, 2026-09-24; owner: "upgrade the basketball
// suite with the same workflow we just used with the dunk mode for all other animations and actions").
//
// The dunk pass's instrument (_dunk-motion-probe) pointed at 1v1, 3v3, the 3PT shootout and the carnival: record the FINAL
// DRAWN POSE of every player body on every rendered frame of a real action, measure it with the dunk probe's own metric
// definitions (so the numbers compare), and replay it frozen for side and front-three-quarter sheets.
//
// WHAT IS NEW AGAINST THE DUNK PROBE
//   · A VIRTUAL CLOCK (scripts/probes/_hoops-motion-page.js): each rendered frame advances the game exactly VDT ms (default
//     1000/60) whatever the wall clock did — performance.now, requestAnimationFrame, setTimeout and setInterval are all on it,
//     and so are the drivers. CPU is shared with other workflows; with this clock machine load changes how long a run takes,
//     not what it measures. Math.random is reseeded per take (SEED + take index), so the AI rolls the same dice every run.
//   · IN-PAGE DRIVERS: 1v1 / 3v3 through the agent bridge (?agent=1 bypasses local input by design), the right stick through
//     InputBus.emit, 3PT and the carnival through the KEYBOARD handler (a KeyboardEvent on window: J = A, space = the analog
//     R trigger). Nothing is timed from node.
//   · EVERY BODY: the hero and the AI (1v1 foe; 3v3 mate0/1 + foe0/1/2; 3PT / carnival b0 …) are recorded together, and an
//     action's subject is whichever body played it — so the AI's jumper and the hero's are measured the same way.
//   · ANCHORS ARE CLIPS (or the ball changing hands), not log text: the hotfix in flight moves the modes' log lines again.
//   · HOOPS METRICS on top of the dunk set: foot slide while planted (the footplant probe's contact test), the ball against
//     the palm while held, which hand holds and releases — by rig bone AND by the side it is drawn on (the runtime rig is
//     mirrored: rig RightHand draws on the body's LEFT), the release against the jump's apex, and the clip names against
//     what the body visibly did (did the ball cross, go under the legs, behind the back; did the body turn; slide sideways).
//
//   BASE=http://127.0.0.1:3098 TAG=p1-baseline/base ACTIONS=all npx tsx scripts/probes/_hoops-motion-probe.mts
//   ACTIONS=hero_1v1_jumper_set,ai_1v1_closeout   (ids from LIST=1; a session id such as 1v1-off selects all its actions)
//   LIST=1 — print the catalogue and exit      SCRUB=0 — numbers only, no sheets      REPS=1 — instances kept per action
//   SEED=7  VDT=16.6667  COLS=12  FROM_REC=<dir> — re-measure recordings already on disk (sheets need SCRUB=1 and a server)
//   Output: ~/Claude/outbox/finish-release/hoopsmotion/<TAG>/ — metrics.json, status.txt, takes-<session>.json, rec-*.json, sheet-*.png
import { chromium, type Page, type Browser } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { chromiumExe } from './_chromium.mts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const TAG = process.env.TAG ?? 'run';
const OUT = TAG.startsWith('/') ? TAG : `${process.env.HOME}/Claude/outbox/finish-release/hoopsmotion/${TAG}`;
const SCRUB = process.env.SCRUB !== '0';
const REPS = Math.max(1, Number(process.env.REPS ?? 1));
const SEED = Number(process.env.SEED ?? 7);
const VDT = Number(process.env.VDT ?? 1000 / 60);
const COLS = Number(process.env.COLS ?? 12);
const FROM_REC = process.env.FROM_REC ?? '';
const TAKE_WALL_MS = Number(process.env.TAKE_WALL_MS ?? 240000);
/** HOG=<ms>: the load self-test — burn up to that much wall time inside every frame (see the page). Numbers must not move. */
const HOG = Number(process.env.HOG ?? 0);
const PAGE_JS = fs.readFileSync(path.join(HERE, '_hoops-motion-page.js'), 'utf8');

// ── the catalogue ───────────────────────────────────────────────────────────────────────────────────────────────────
type SessionId = '1v1-off' | '1v1-def' | '3v3-off' | '3v3-def' | '3pt' | 'carnival';
interface Take { name: string; play: string; prep?: 'offense' | 'defense'; postMs?: number; rec?: boolean; settle?: number; [k: string]: unknown }
interface Session { id: SessionId; mode: string; qs: string; takes: Take[] }
/** An offensive take. luck 0.99 by default: the AI's strip / block / hand-up rolls never land, so MY play reaches its end (the
 *  1v1 AI strips a dribbler inside 1.6 m within half a second of the check — measured, both first takes). luck 0 = every roll
 *  lands (the contested look); null = the real dice. */
const off = (name: string, play: string, extra: Record<string, unknown> = {}): Take => ({ name, play, prep: 'offense', luck: 0.99, ...extra });
const def = (name: string, style: string): Take => ({ name, play: 'defend', prep: 'defense', style, postMs: 1800 });
const SESSIONS: Session[] = [
  { id: '1v1-off', mode: 'onevone', qs: '&handle=100', takes: [
    off('o_set', 'jumper'), off('o_contest', 'jumperNow', { luck: 0 }), off('o_block', 'contested', { luckShot: 0 }), off('o_block2', 'contested', { luckShot: 0, creep: 0.5, hold: 500 }), off('o_strip', 'idle', { ms: 1800, luck: null }),
    off('o_pullup', 'pullup'), off('o_fade', 'fade'), off('o_stepback', 'stepback'),
    off('o_layup', 'layup', { wing: 3.2 }), off('o_layup2', 'layup', { wing: -3.2 }), off('o_layup3', 'layup', { wing: 4.5, mag: 0.84, stop: 2.9 }), off('o_layup4', 'layup', { baseline: true, stop: 2.2 }),
    off('o_floater', 'floater'), off('o_dunk', 'dunk', { postMs: 3000 }),
    off('o_cross', 'handle', { move: 'crossover', postMs: 800 }), off('o_between', 'handle', { move: 'between', postMs: 800 }),
    off('o_behind', 'handle', { move: 'behind', postMs: 800 }), off('o_spin', 'handle', { move: 'spin', postMs: 800 }),
    off('o_hesi', 'handle', { move: 'hesi', postMs: 800 }), off('o_inout', 'handle', { move: 'inout', postMs: 800 }),
    off('o_hook', 'posthook'), off('o_dropstep', 'postread', { read: 'dropstep' }), off('o_shimmy', 'postread', { read: 'fade' }),
    off('o_upunder', 'postread', { read: 'pump' }), off('o_rebound', 'rebound', { postMs: 1500 }), off('o_rebound2', 'rebound', { crash: false, postMs: 1500 }), off('o_rebound3', 'rebound', { charge: 0.4, postMs: 1500 }), off('o_rebound4', 'rebound', { charge: 0.4, crash: false, postMs: 1500 }), off('o_rebound5', 'rebound', { close: true, charge: 0.3, spot: [0, -0.1], postMs: 1500 }),
  ] },
  { id: '1v1-def', mode: 'onevone', qs: '', takes: [def('d_passive1', 'passive'), def('d_contest1', 'contest'), def('d_block1', 'block'), def('d_steal1', 'steal'), def('d_box1', 'box'), def('d_passive2', 'passive'), def('d_contest2', 'contest'), def('d_block2', 'block'), def('d_passive3', 'passive'), def('d_steal2', 'steal')] },
  { id: '3v3-off', mode: 'threevthree', qs: '&handle=100', takes: [
    off('t_set', 'jumper'), off('t_contest', 'jumperNow', { luck: 0 }), off('t_contest2', 'contested', { luckShot: 0, creep: -0.8, hold: 550 }), off('t_block', 'contested', { luckShot: 0 }), off('t_layup', 'layup', { wing: 3.2 }), off('t_layup2', 'layup', { wing: -3.2 }), off('t_dunk', 'dunk', { postMs: 3000 }), off('t_dunk2', 'dunk', { wing: 3.4, postMs: 3000 }), off('t_pass', 'pass', { postMs: 2500 }),
    off('t_screen', 'screen'), off('t_cross', 'handle', { move: 'crossover', postMs: 800 }), off('t_rebound', 'rebound', { postMs: 1500 }), off('t_rebound2', 'rebound', { charge: 0.4, postMs: 1500 }), off('t_pass2', 'pass', { afterScreen: true, postMs: 2500 }), off('t_pass3', 'pass', { wait: 250, postMs: 2500 }), off('t_oop', 'passToCutter', { postMs: 2500 }),
  ] },
  { id: '3v3-def', mode: 'threevthree', qs: '', takes: [def('e_passive1', 'passive'), def('e_contest1', 'contest'), def('e_block1', 'block'), def('e_steal1', 'steal'), def('e_passive2', 'passive'), def('e_box1', 'box'), def('e_passive3', 'passive'), def('e_steal2', 'steal'), def('e_passive4', 'passive'), def('e_contest2', 'contest'), def('e_passive5', 'passive')] },
  { id: '3pt', mode: 'threepoint', qs: '', takes: [
    { name: 'p_rack1', play: 'threept', ms: 13000, postMs: 200 }, { name: 'p_rack2', play: 'threept', ms: 12000, postMs: 200 },
    { name: 'p_rest', play: 'threeptUntilStandings', ms: 70000, postMs: 0, rec: false }, { name: 'p_standings', play: 'idle', ms: 6000, postMs: 0, playKind: 'wait' },
  ] },
  { id: 'carnival', mode: 'carnival', qs: '&events=slam_rush', takes: [
    { name: 'c_slam1', play: 'slam', holdMs: 950, after: 900, postMs: 300 }, { name: 'c_slam2', play: 'slam', holdMs: 700, after: 900, postMs: 300 }, { name: 'c_slam3', play: 'slam', holdMs: 1100, after: 900, postMs: 300 },
    { name: 'c_settle', play: 'carnivalSettle', ms: 30000, after: 3500, postMs: 0 },
  ] },
];
// 3PT's standings take uses P.idle with no agent: make it a plain wait
for (const t of SESSIONS.find((s) => s.id === '3pt')!.takes) if (t.playKind === 'wait') t.play = 'waitOnly';

interface Anchor {
  /** 'me' | 'foe' | 'mate*' | 'foe*' | 'b*' | 'ai' (any body but me) */
  body: string;
  clip?: RegExp; ballTo?: boolean; ballFrom?: boolean; start?: boolean;
  /** ballTo: the last body to hold it before (a pattern like body), how many frames it was loose first, and whether it
   *  ARRIVED (in the hand's reach the frame before — a reset puts the ball in the palm from wherever it was: not a catch) */
  from?: string; minFree?: number; arrives?: boolean;
  /** ballTo: the receiver did not TELEPORT that frame (< 0.3 m of root) — a board is a palm warp here (the ball jumps to the
   *  hand), which is the rebound as the game draws it; a possession reset moves the body too, and is not one */
  still?: boolean;
  state?: (s: Record<string, unknown>, prev: Record<string, unknown> | null, bodyId: string) => boolean;
  where?: (s: Record<string, unknown>, bodyId: string) => boolean;
}
interface ActionDef { id: string; label: string; who: 'hero' | 'ai'; family: string; kind: string; session: SessionId; also?: SessionId[]; takes: string[] | '*'; anchor: Anchor; pre: number; post: number }
const sessionsOf = (a: ActionDef): SessionId[] => [a.session, ...(a.also ?? [])];
const A = (id: string, label: string, family: string, kind: string, session: SessionId, takes: string[] | '*', anchor: Anchor, pre = 500, post = 1500): ActionDef =>
  ({ id, label, who: anchor.body === 'me' ? 'hero' : 'ai', family, kind, session, takes, anchor, pre, post });
const SHOT_START = /pullup_gather|stepback_gather|set_gather|jumpshot|shoot_jumper/;
/** A dunk's first clip — not the celebration, whose clips are dunk_* too (measured: a 3v3 "dunk" anchored on dunk_mc_celebrate_big). */
const DUNK = /^dunk_(?!.*celeb)/;
const CATALOGUE: ActionDef[] = [
  // ── 1v1, my possession: the hero ──
  A('hero_1v1_idle', 'dribble idle at the check', 'idles/reactions', 'idle', '1v1-off', ['o_set'], { body: 'me', start: true }, 0, 450),
  A('hero_1v1_jumper_set', 'set jumper (standing)', 'jumpers', 'shot', '1v1-off', ['o_set'], { body: 'me', clip: SHOT_START }, 450, 1700),
  A('hero_1v1_pullup', 'pull-up jumper off the dribble', 'jumpers', 'shot', '1v1-off', ['o_pullup'], { body: 'me', clip: SHOT_START }, 450, 1700),
  A('hero_1v1_fade', 'fadeaway (giving ground)', 'jumpers', 'shot', '1v1-off', ['o_fade'], { body: 'me', clip: /fade|pullup_gather|jumpshot/ }, 450, 1700),
  A('hero_1v1_stepback', 'step-back jumper', 'jumpers', 'shot', '1v1-off', ['o_stepback'], { body: 'me', clip: /stepback/ }, 450, 1800),
  A('hero_1v1_layup', 'driving layup (in from the wing)', 'layups/floaters/hooks', 'finish', '1v1-off', ['o_layup', 'o_layup2', 'o_layup3', 'o_layup4'], { body: 'me', clip: /layup|finger_roll|scoop|mikan|reverse/ }, 600, 1600),
  A('hero_1v1_floater', 'floater (2.2–3.4 m, not at speed)', 'layups/floaters/hooks', 'finish', '1v1-off', ['o_floater'], { body: 'me', clip: /floater|layup|finger_roll|mikan|jumpshot|pullup_gather/ }, 600, 1600),
  A('hero_1v1_dunk', 'game dunk off the drive', 'game dunks', 'dunk', '1v1-off', ['o_dunk'], { body: 'me', clip: DUNK }, 700, 2000),
  A('hero_1v1_cross', 'crossover (R stick)', 'handles', 'handle', '1v1-off', ['o_cross'], { body: 'me', clip: /crossover/ }, 400, 1000),
  A('hero_1v1_between', 'between the legs (R stick)', 'handles', 'handle', '1v1-off', ['o_between'], { body: 'me', clip: /between/ }, 400, 1000),
  A('hero_1v1_behind', 'behind the back (R stick)', 'handles', 'handle', '1v1-off', ['o_behind'], { body: 'me', clip: /behind/ }, 400, 1000),
  A('hero_1v1_spin', 'spin move (R stick sweep)', 'handles', 'handle', '1v1-off', ['o_spin'], { body: 'me', clip: /spin(?!_layup)/ }, 400, 1100),
  A('hero_1v1_hesi', 'hesitation (R stick toward the ball)', 'handles', 'handle', '1v1-off', ['o_hesi'], { body: 'me', clip: /hesi|jab/ }, 400, 1000),
  A('hero_1v1_inout', 'in-and-out (R stick up)', 'handles', 'handle', '1v1-off', ['o_inout'], { body: 'me', clip: /feint|in_and_out|inout/ }, 400, 1000),
  A('hero_1v1_post_hook', 'post hook', 'post moves', 'finish', '1v1-off', ['o_hook'], { body: 'me', clip: /hook/ }, 600, 1500),
  A('hero_1v1_dropstep', 'drop step', 'post moves', 'post', '1v1-off', ['o_dropstep'], { body: 'me', clip: /drop_step/ }, 500, 1500),
  A('hero_1v1_shimmy_fade', 'shimmy fade', 'post moves', 'shot', '1v1-off', ['o_shimmy'], { body: 'me', clip: /shimmy|fade/ }, 500, 1700),
  A('hero_1v1_up_and_under', 'pump fake → up and under', 'post moves', 'post', '1v1-off', ['o_upunder'], { body: 'me', clip: /pump_fake|step_through|up_and_under/ }, 500, 1700),
  A('hero_1v1_post_up', 'post-up (backing down)', 'post moves', 'post', '1v1-off', ['o_hook', 'o_dropstep', 'o_shimmy', 'o_upunder'], { body: 'me', clip: /post_up/ }, 300, 1000),
  A('hero_1v1_rebound', 'rebound (ball recovered after a miss)', 'rebounds/box-out', 'rebound', '1v1-off', ['o_rebound', 'o_rebound3', 'o_rebound5'], { body: 'me', ballTo: true, minFree: 20, still: true }, 900, 700),
  A('hero_1v1_celebrate', 'celebration after a make', 'idles/reactions', 'react', '1v1-off', '*', { body: 'me', clip: /celebrate/ }, 200, 1100),
  A('hero_1v1_drive', 'dribble drive (run with the ball)', 'handles', 'move', '1v1-off', ['o_layup', 'o_dunk'], { body: 'me', clip: /dribble_run|dribble_jog|drive/ }, 200, 900),
  // ── 1v1, my possession: the AI defender ──
  A('ai_1v1_def_slide', 'defensive slide', 'defense', 'defense', '1v1-off', '*', { body: 'foe', clip: /defend_slide|slide_hard/ }, 300, 900),
  A('ai_1v1_def_backpedal', 'backpedal', 'defense', 'defense', '1v1-off', '*', { body: 'foe', clip: /backpedal/ }, 300, 900),
  A('ai_1v1_closeout', 'closeout', 'defense', 'defense', '1v1-off', '*', { body: 'foe', clip: /closeout/ }, 300, 900),
  A('ai_1v1_contest', 'contest (hand up)', 'defense', 'defense', '1v1-off', '*', { body: 'foe', clip: /hand_up/ }, 300, 1000),
  A('ai_1v1_block', 'block attempt', 'defense', 'defense', '1v1-off', '*', { body: 'foe', clip: /block_reach/ }, 300, 1000),
  A('ai_1v1_steal', 'steal poke', 'defense', 'defense', '1v1-off', '*', { body: 'foe', clip: /steal_reach/ }, 300, 800),
  A('ai_1v1_react', 'reaction (bump / ankle break / poster)', 'idles/reactions', 'react', '1v1-off', '*', { body: 'foe', clip: /contact_react|ankle|stumble|slip|knockdown/ }, 200, 1100),
  A('ai_1v1_boxout', 'box-out (defender seals on the miss)', 'rebounds/box-out', 'defense', '1v1-off', ['o_rebound'], { body: 'foe', state: (s, p) => s.fj === 'boxout' && (!p || p.fj !== 'boxout') }, 300, 1000),
  A('ai_1v1_rebound', 'rebound (the defender comes down with it)', 'rebounds/box-out', 'rebound', '1v1-off', ['o_rebound', 'o_rebound2', 'o_rebound3', 'o_rebound4', 'o_rebound5'], { body: 'foe', ballTo: true, minFree: 20, still: true }, 900, 700),
  // ── 1v1, his possession: the hero defends ──
  A('hero_1v1_def_stance', 'defensive stance', 'defense', 'defense', '1v1-def', '*', { body: 'me', clip: /defend_stance/ }, 200, 800),
  A('hero_1v1_def_slide', 'defensive slide', 'defense', 'defense', '1v1-def', '*', { body: 'me', clip: /defend_slide|slide_hard/ }, 300, 900),
  A('hero_1v1_def_backpedal', 'backpedal', 'defense', 'defense', '1v1-def', '*', { body: 'me', clip: /backpedal/ }, 300, 900),
  A('hero_1v1_def_closeout', 'closeout', 'defense', 'defense', '1v1-def', '*', { body: 'me', clip: /closeout/ }, 300, 900),
  A('hero_1v1_def_contest', 'contest (hand up)', 'defense', 'defense', '1v1-def', ['d_contest1', 'd_contest2'], { body: 'me', clip: /hand_up/ }, 300, 1000),
  A('hero_1v1_def_block', 'block (on the gather)', 'defense', 'defense', '1v1-def', ['d_block1', 'd_block2'], { body: 'me', clip: /block_reach/ }, 300, 1100),
  A('hero_1v1_def_steal', 'steal poke', 'defense', 'defense', '1v1-def', ['d_steal1', 'd_steal2'], { body: 'me', clip: /steal_reach/ }, 300, 900),
  A('hero_1v1_react', 'reaction (bumped / posterized / charge)', 'idles/reactions', 'react', '1v1-def', '*', { body: 'me', clip: /contact_react|knockdown|get_up/ }, 200, 1100),
  A('hero_1v1_boxout', 'box-out (L2 held on his miss)', 'rebounds/box-out', 'defense', '1v1-def', ['d_box1'], { body: 'me', clip: /box|post_up|defend_stance/ }, 300, 1000),
  // ── 1v1, his possession: the AI attacks ──
  A('ai_1v1_drive', 'drive (dribble run)', 'handles', 'move', '1v1-def', '*', { body: 'foe', clip: /dribble_run|dribble_jog|drive/ }, 200, 900),
  A('ai_1v1_cross', 'crossover', 'handles', 'handle', '1v1-def', '*', { body: 'foe', clip: /crossover/ }, 400, 1000),
  A('ai_1v1_hesi', 'hesitation / step-back', 'handles', 'handle', '1v1-def', '*', { body: 'foe', clip: /hesi/ }, 400, 1000),
  A('ai_1v1_jumper', 'pull-up jumper', 'jumpers', 'shot', '1v1-def', '*', { body: 'foe', clip: /jumpshot/ }, 500, 1600),
  A('ai_1v1_layup', 'layup', 'layups/floaters/hooks', 'finish', '1v1-def', '*', { body: 'foe', clip: /layup/ }, 500, 1500),
  A('ai_1v1_dunk', 'dunk', 'game dunks', 'dunk', '1v1-def', '*', { body: 'foe', clip: DUNK }, 600, 1900),
  A('ai_1v1_idle', 'check / idle with the ball', 'idles/reactions', 'idle', '1v1-def', '*', { body: 'foe', clip: /dribble_idle|idle_stand/ }, 0, 600),
  A('ai_1v1_celebrate', 'celebration after his make', 'idles/reactions', 'react', '1v1-def', '*', { body: 'foe', clip: /celebrate/ }, 200, 1100),
  // ── 3v3, my possession ──
  A('hero_3v3_jumper_set', 'set jumper', 'jumpers', 'shot', '3v3-off', ['t_set'], { body: 'me', clip: SHOT_START }, 450, 1700),
  A('hero_3v3_layup', 'driving layup (in from the wing)', 'layups/floaters/hooks', 'finish', '3v3-off', '*', { body: 'me', clip: /layup|finger_roll|scoop|mikan|reverse/ }, 600, 1600),
  A('hero_3v3_dunk', 'game dunk', 'game dunks', 'dunk', '3v3-off', '*', { body: 'me', clip: DUNK }, 700, 2000),
  A('hero_3v3_cross', 'crossover (R stick)', 'handles', 'handle', '3v3-off', ['t_cross'], { body: 'me', clip: /crossover/ }, 400, 1000),
  A('hero_3v3_pass', 'pass (the ball leaves my hands)', 'passes/catches', 'pass', '3v3-off', ['t_pass', 't_pass2', 't_pass3', 't_oop'], { body: 'me', ballFrom: true }, 600, 900),
  A('hero_3v3_catch', 'catch (a pass from a teammate comes to me)', 'passes/catches', 'catch', '3v3-off', '*', { body: 'me', ballTo: true, from: 'mate*', minFree: 3, arrives: true }, 600, 800),
  A('hero_3v3_rebound', 'rebound', 'rebounds/box-out', 'rebound', '3v3-off', ['t_rebound', 't_rebound2'], { body: 'me', ballTo: true, minFree: 20, still: true }, 900, 700),
  A('ai_3v3_catch', 'teammate catches my pass', 'passes/catches', 'catch', '3v3-off', ['t_pass', 't_pass2', 't_pass3', 't_oop'], { body: 'mate*', ballTo: true, from: 'me', minFree: 3, arrives: true }, 600, 900),
  A('ai_3v3_mate_shot', 'teammate shoots (the alley-oop off my lob)', 'jumpers', 'shot', '3v3-off', ['t_pass', 't_pass2', 't_pass3', 't_oop'], { body: 'mate*', clip: /jumpshot|layup|oop|^dunk_(?!.*celeb)/ }, 500, 1600),
  A('ai_3v3_closeout', 'defender closeout', 'defense', 'defense', '3v3-off', '*', { body: 'foe*', clip: /closeout/ }, 300, 900),
  A('ai_3v3_contest', 'defender contest (hand up)', 'defense', 'defense', '3v3-off', '*', { body: 'foe*', clip: /hand_up/ }, 300, 1000),
  A('ai_3v3_block', 'defender block', 'defense', 'defense', '3v3-off', '*', { body: 'foe*', clip: /block_reach/ }, 300, 1000),
  A('ai_3v3_slide', 'defender slide', 'defense', 'defense', '3v3-off', '*', { body: 'foe*', clip: /defend_slide|slide_hard/ }, 300, 900),
  A('ai_3v3_rebound', 'AI rebound', 'rebounds/box-out', 'rebound', '3v3-off', ['t_rebound', 't_rebound2'], { body: 'ai', ballTo: true, minFree: 20, still: true }, 900, 700),
  A('ai_3v3_boxout', 'AI box-out', 'rebounds/box-out', 'defense', '3v3-off', ['t_rebound', 't_set'], { body: 'ai', state: (s, p, id) => boxing(s, id) && !(p && boxing(p, id)) }, 300, 1000),
  A('ai_3v3_offball', 'teammate off-ball run (no ball)', 'idles/reactions', 'move', '3v3-off', '*', { body: 'mate*', clip: /drive|run|jog|sprint|cut/, where: (s, id) => s.cr !== id }, 200, 900),
  // ── 3v3, their possession ──
  A('hero_3v3_def_slide', 'defensive slide', 'defense', 'defense', '3v3-def', '*', { body: 'me', clip: /defend_slide|slide_hard/ }, 300, 900),
  A('hero_3v3_def_contest', 'contest (hand up)', 'defense', 'defense', '3v3-def', ['e_contest1', 'e_contest2'], { body: 'me', clip: /hand_up/ }, 300, 1000),
  A('hero_3v3_def_block', 'block', 'defense', 'defense', '3v3-def', ['e_block1'], { body: 'me', clip: /block_reach/ }, 300, 1100),
  A('hero_3v3_def_steal', 'steal poke', 'defense', 'defense', '3v3-def', ['e_steal1', 'e_steal2'], { body: 'me', clip: /steal_reach/ }, 300, 900),
  A('ai_3v3_drive', 'AI drive', 'handles', 'move', '3v3-def', '*', { body: 'foe*', clip: /dribble_run|dribble_jog|drive/ }, 200, 900),
  { ...A('ai_3v3_jumper', 'AI jumper', 'jumpers', 'shot', '3v3-def', '*', { body: 'foe*', clip: /jumpshot/ }, 500, 1600), also: ['3v3-off'] },
  A('ai_3v3_layup', 'AI layup', 'layups/floaters/hooks', 'finish', '3v3-def', '*', { body: 'foe*', clip: /layup/ }, 500, 1500),
  A('ai_3v3_dunk', 'AI dunk', 'game dunks', 'dunk', '3v3-def', '*', { body: 'foe*', clip: DUNK }, 600, 1900),
  { ...A('ai_3v3_pass', 'AI pass (caught by another foe)', 'passes/catches', 'catch', '3v3-def', '*', { body: 'foe*', ballTo: true, from: 'foe*', minFree: 3, arrives: true }, 600, 900), also: ['3v3-off'] },
  A('ai_3v3_help', 'teammate help defense', 'defense', 'defense', '3v3-def', '*', { body: 'mate*', clip: /closeout|defend_slide|hand_up|block_reach/ }, 300, 900),
  // ── 3PT shootout ──
  A('hero_3pt_rack_shot', 'rack shot (regular ball)', '3PT', 'shot', '3pt', ['p_rack1', 'p_rack2'], { body: 'me', clip: /jumpshot|pullup_gather/, where: (s) => s.mo === 0 }, 500, 1700),
  A('hero_3pt_money_ball', 'money ball (last of the rack)', '3PT', 'shot', '3pt', ['p_rack1', 'p_rack2'], { body: 'me', clip: /jumpshot|pullup_gather/, where: (s) => s.mo === 1 }, 500, 1700),
  A('hero_3pt_rack_jog', 'jog to the next rack', '3PT', 'move', '3pt', ['p_rack1', 'p_rack2'], { body: 'me', clip: /^run$|_run$|jog/ }, 200, 1000),
  A('ai_3pt_react', 'sideline rival reacts to his number', '3PT', 'react', '3pt', ['p_standings'], { body: 'ai', clip: /celebrate|contact_react/ }, 200, 1100),
  // ── carnival ──
  A('hero_carn_slam_charge', 'Slam Rush charge (space held)', 'carnival', 'dunk', 'carnival', ['c_slam1', 'c_slam2', 'c_slam3'], { body: 'me', clip: /charge_gather/ }, 200, 1000),
  A('hero_carn_slam_launch', 'Slam Rush launch (space let go)', 'carnival', 'dunk', 'carnival', ['c_slam1', 'c_slam2', 'c_slam3'], { body: 'me', clip: /dunk_launch/ }, 300, 1000),
  A('ai_carn_react', 'hub party-goer reacts to the result', 'carnival', 'react', 'carnival', ['c_settle'], { body: 'ai', clip: /celebrate|hit_react|contact_react/ }, 200, 1100),
];
function nameSeed(n: string): number { let h = 2166136261; for (let i = 0; i < n.length; i++) { h ^= n.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 997; }
function boxing(s: Record<string, unknown>, id: string): boolean { return typeof s.jb === 'string' && new RegExp(`(^| )${id}:[^ ]*!`).test(s.jb) ; }
const byId = new Map(CATALOGUE.map((a) => [a.id, a]));

if (process.env.LIST === '1') {
  const fams = [...new Set(CATALOGUE.map((a) => a.family))];
  for (const fam of fams) {
    console.log(`\n${fam}`);
    for (const a of CATALOGUE.filter((x) => x.family === fam)) console.log(`  ${a.id.padEnd(26)} ${a.who.padEnd(5)} ${sessionsOf(a).join('+').padEnd(9)} ${a.label}  [${a.anchor.clip ? a.anchor.clip.source : a.anchor.ballTo ? 'ball → body' : a.anchor.ballFrom ? 'ball leaves body' : a.anchor.state ? 'state' : 'take start'} on ${a.anchor.body}]`);
  }
  console.log(`\n${CATALOGUE.length} actions · sessions ${SESSIONS.map((s) => s.id).join(', ')}`);
  process.exit(0);
}
const want = (process.env.ACTIONS ?? 'all').split(',').map((s) => s.trim()).filter(Boolean);
const ACTS = want.includes('all') ? CATALOGUE : CATALOGUE.filter((a) => want.includes(a.id) || sessionsOf(a).some((x) => want.includes(x)));
for (const w of want) if (w !== 'all' && !byId.has(w) && !SESSIONS.some((s) => s.id === w)) throw new Error(`unknown action ${w} (LIST=1 prints the catalogue)`);
fs.mkdirSync(OUT, { recursive: true });

// ── recordings ──────────────────────────────────────────────────────────────────────────────────────────────────────
type V3 = [number, number, number];
interface BodyFrame { rp: number[]; rq: number[] | null; rr: number[]; rs: number[]; q: number[]; hp: number[] | null; j: (number[] | null)[]; jt: Record<string, [number, number, number]>; c: [string, number][] }
interface Frame { t: number; B: Record<string, BodyFrame>; ball?: number[]; bp?: string; bb?: string; bh?: string; br?: boolean; be?: number; s: Record<string, unknown> }
interface Mark { t: number; msg: string }
interface TakeData { session: SessionId; take: string; bodies: Record<string, string[]>; frames: Frame[]; marks: Mark[]; meta: Record<string, unknown> }
interface Rec { action: string; label: string; who: string; kind: string; family: string; session: SessionId; take: string; subject: string; anchorT: number; anchorClip: string; pre: number; post: number; bodies: Record<string, string[]>; frames: Frame[]; marks: Mark[]; meta: Record<string, unknown> }

const JN = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'];
const J = Object.fromEntries(JN.map((n, i) => [n, i])) as Record<string, number>;
const clipName = (n: string) => n.replace(/(_c\d+)+$/, '').replace(/\s*\(.*\)$/, '');
const bodyMatches = (pat: string, id: string) => pat === id || (pat === 'ai' && id !== 'me') || (pat.endsWith('*') && id.startsWith(pat.slice(0, -1)));

function clipMatch(bf: BodyFrame | undefined, re: RegExp): string | null {
  if (!bf) return null;
  let best: string | null = null, bw = 0;
  for (const [n, w] of bf.c) { const c = clipName(n); if (w >= 0.1 && re.test(c) && w > bw) { bw = w; best = c; } }
  return best;
}
/** Every onset of an action in a take (a clip starting, the ball arriving / leaving, a state edge), per matching body. */
function anchorsIn(td: TakeData, act: ActionDef): { i: number; body: string; clip: string }[] {
  const out: { i: number; body: string; clip: string }[] = [];
  const fr = td.frames; if (!fr.length) return out;
  const ids = Object.keys(td.bodies).filter((id) => bodyMatches(act.anchor.body, id));
  const an = act.anchor;
  // AUDIT 2026-09-25: recordings start at the prep's reset (the page's recPrep). A play anchor (the take's start, the ball changing
  // hands, a state edge) is searched from the play's first frame (tPlay) — the prep hands the ball over by a warp; a CLIP onset may
  // fall in the settle but must be a real 0.5 crossing seen in the recording (i > 0): a clip already on at the first recorded frame
  // began before it, and anchoring there put the window on the wrong frame (74 of 382 baseline recordings).
  const tPlay = typeof td.meta.tPlay === 'number' ? (td.meta.tPlay as number) : -Infinity;
  const i0 = Math.max(0, fr.findIndex((f) => f.t > tPlay));
  for (const id of ids) {
    if (an.start) { const i = fr.findIndex((f, k) => k >= i0 && f.B[id]); if (i >= 0) out.push({ i, body: id, clip: topClip(fr[i].B[id]) }); continue; }
    /** CLIP ONSET = the frame the matching clip's weight crosses 0.5 upward (it becomes the body's pose), or the take's first
     *  frame if it already is. A "no match in the last 4 frames" test missed every clip that starts at the take or never
     *  fades fully behind the next (measured: the hero's hand_up in both contest takes). */
    const wOf = (i: number): number => { const b = fr[i]?.B[id]; if (!b || !an.clip) return 0; let w = 0; for (const [n, x] of b.c) if (an.clip.test(clipName(n))) w = Math.max(w, x); return w; };
    const lastHolder = (i: number): { id: string; free: number } => { let free = 0; for (let k = i - 1; k >= 0 && k >= i - 240; k--) { const h = holderOf(fr[k]); if (h) return { id: h, free }; free++; } return { id: '', free }; };
    const hit = (i: number): string | null => {
      const f = fr[i]; if (!f || !f.B[id]) return null;
      if (an.where && !an.where(f.s, id)) return null;
      if (an.clip) { if (i === 0) return null; const w = wOf(i); if (w < 0.5) return null; if (wOf(i - 1) >= 0.5) return null; return clipMatch(f.B[id], an.clip); }
      if (i < i0) return null;
      if (an.ballTo) {
        if (holderOf(f) !== id || (i > 0 && holderOf(fr[i - 1]) === id)) return null;
        const lh = lastHolder(i);
        if (an.from && !(lh.id && bodyMatches(an.from, lh.id) && lh.id !== id)) return null;
        if (an.minFree && lh.free < an.minFree) return null;
        if (an.still && i > 0) { const a = fr[i].B[id], b = fr[i - 1].B[id]; if (!a || !b || len(sub(a.rp, b.rp)) > 0.3) return null; }
        if (an.arrives && i > 0) { const pb = fr[i - 1].ball, b = fr[i - 1].B[id]; const hands = b ? [b.j[J.LeftHand], b.j[J.RightHand]].filter((h): h is number[] => !!h) : []; if (!pb || !hands.length || Math.min(...hands.map((h) => len(sub(pb, h)))) > 0.9) return null; }
        const pb = i > 0 ? fr[i - 1].ball : null, bb2 = fr[i].B[id]; const hands = bb2 ? [bb2.j[J.LeftHand], bb2.j[J.RightHand]].filter((h): h is number[] => !!h) : [];
        const warp = pb && hands.length ? Math.min(...hands.map((h) => len(sub(pb, h)))) : NaN;
        return `ball→${id} from ${lh.id || 'loose'} after ${lh.free} loose frames, ${isFinite(warp) ? warp.toFixed(2) : '?'} m from the hand the frame before (${f.bp || 'the dribble'})`;
      }
      if (an.ballFrom) return i > 0 && holderOf(f) !== id && holderOf(fr[i - 1]) === id ? `ball left ${id} (${fr[i - 1].bp || 'the dribble'})${f.bb ? ' to ' + f.bb : f.br ? ' released' : ''}` : null;
      if (an.state) return an.state(f.s, i > 0 ? fr[i - 1].s : null, id) ? 'state' : null;
      return null;
    };
    let lastAt = -1e9;
    const tEnd = fr[fr.length - 1].t;
    for (let i = 0; i < fr.length; i++) {
      // AUDIT 2026-09-25: an onset the take ends right after is not a measurement (baseline: ai_1v1_idle a4 had ONE frame, def_stance
      // a4 twelve — SPARC shrinks with the window, so a truncated one reads smoother). At least min(post, 600) ms must follow.
      if (tEnd - fr[i].t < Math.min(act.post, 600)) break;
      const h = hit(i); if (!h) continue;
      if (fr[i].t - lastAt < act.post) continue;
      lastAt = fr[i].t;
      out.push({ i, body: id, clip: h });
    }
  }
  return out.sort((a, b) => a.i - b.i);
}
function topClip(bf: BodyFrame | undefined): string { if (!bf || !bf.c.length) return ''; return clipName(bf.c.slice().sort((a, b) => b[1] - a[1])[0][0]); }
/** Run-length timeline of each body's top clip over a take: what played, for the status report. */
function timeline(td: TakeData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const id of Object.keys(td.bodies)) {
    const runs: [string, number, number][] = [];
    for (const f of td.frames) { const c = topClip(f.B[id]) || '-'; const r = runs[runs.length - 1]; if (r && r[0] === c) r[2] = f.t; else runs.push([c, f.t, f.t]); }
    o[id] = runs.filter((r) => r[2] - r[1] >= 50 || runs.length < 30).map((r) => `${r[0].replace(/^bball_/, '')}(${((r[2] - r[1]) / 1000).toFixed(2)})`).join(' → ').slice(0, 1600);
  }
  return o;
}

// ── measurement: the dunk probe's definitions, per subject body, over the action window ─────────────────────────────
const sub = (a: number[], b: number[]): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: number[]) => Math.hypot(a[0], a[1], a[2]);
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const angleAt = (a: number[], m: number[], b: number[]) => { const u = sub(a, m), v = sub(b, m); return (Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (len(u) * len(v) || 1)))) * 180) / Math.PI; };
function fft(re: number[], im: number[]): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let size = 2; size <= n; size <<= 1) {
    const ang = (-2 * Math.PI) / size;
    for (let i = 0; i < n; i += size) for (let k = 0; k < size / 2; k++) {
      const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
      const xr = re[i + k + size / 2] * wr - im[i + k + size / 2] * wi, xi = re[i + k + size / 2] * wi + im[i + k + size / 2] * wr;
      re[i + k + size / 2] = re[i + k] - xr; im[i + k + size / 2] = im[i + k] - xi; re[i + k] += xr; im[i + k] += xi;
    }
  }
}
/** SPARC (Balasubramanian 2015), exactly as the dunk probe: ~−1.5 is one smooth reach; more negative is jerkier. */
function sparc(speed: number[], fs: number, fc = 10, amp = 0.05, pad = 4): number {
  if (speed.length < 8) return NaN;
  const nfft = 1 << (Math.ceil(Math.log2(speed.length)) + pad);
  const re = new Array(nfft).fill(0), im = new Array(nfft).fill(0);
  speed.forEach((v, i) => { re[i] = v; });
  fft(re, im);
  const mag = re.map((r, i) => Math.hypot(r, im[i]));
  const mx = Math.max(...mag.slice(0, nfft / 2)) || 1;
  const df = fs / nfft; const sel: number[] = [];
  for (let i = 0; i * df <= fc && i < nfft / 2; i++) sel.push(mag[i] / mx);
  let last = 0; sel.forEach((m, i) => { if (m >= amp) last = i; });
  const cut = sel.slice(0, last + 1);
  let s = 0; for (let i = 1; i < cut.length; i++) s += Math.hypot(df / fc, cut[i] - cut[i - 1]);
  return -s;
}
function yawOf(b: BodyFrame): number { if (b.rq) { const [x, y, z, w] = b.rq; return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + x * x)); } return b.rr[1]; }
function local(b: BodyFrame, p: number[]): V3 { const d = sub(p, b.rp); const a = -yawOf(b); const c = Math.cos(a), s = Math.sin(a); return [d[0] * c + d[2] * s, d[1], -d[0] * s + d[2] * c]; }
/** AUDIT 2026-09-25: NORMALISED. The recorder rounds every component to 5 decimals, so an unchanged rotation's self-dot is |q|² ≠ 1 and
 *  acos read it as motion: a bone that never moved read 5.9°/s (rig LeftHand) or 19.6°/s (rig RightHand) on every frame — which is
 *  why "held <8°/s" said LeftHand 1.00 / RightHand 0.00 on all 382 baseline recordings. Both hands' local rotations are in fact
 *  CONSTANT in every one of them. The dunk probe has the same (un-normalised) formula; pops (≥600°/s) and whips are unaffected. */
function qAngleDeg(a: number[], b: number[]): number { const na = Math.hypot(a[0], a[1], a[2], a[3]) || 1, nb = Math.hypot(b[0], b[1], b[2], b[3]) || 1; const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]) / (na * nb); return (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI; }
/** Where the body FACES as drawn: the feet's heel→toe line (the runtime rig is mirrored, so the root's yaw is not trusted). */
function facing(b: BodyFrame): V3 {
  const v: number[] = [0, 0, 0]; let n = 0;
  for (const sd of ['Left', 'Right']) { const f = b.j[J[sd + 'Foot']], t = b.j[J[sd + 'ToeBase']]; if (f && t) { v[0] += t[0] - f[0]; v[2] += t[2] - f[2]; n++; } }
  if (!n) { const y = yawOf(b); return [Math.sin(y), 0, Math.cos(y)]; }
  const l = Math.hypot(v[0], v[2]) || 1; return [v[0] / l, 0, v[2] / l];
}
/** The body's own right, as drawn: up × forward in Babylon's left-handed world (+x for a body facing +z). */
const rightOf = (fwd: V3): V3 => [fwd[2], 0, -fwd[0]];
/** Which side of the body a point is DRAWN on — 'R' is the athlete's own right hand side. */
function visSide(b: BodyFrame, p: number[]): 'R' | 'L' | '' { const h = b.j[J.Hips]; if (!h) return ''; const d = dot(sub(p, h), rightOf(facing(b))); return Math.abs(d) < 0.03 ? '' : d > 0 ? 'R' : 'L'; }
const pctl = (a: number[], p: number) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const r2 = (x: number) => (isFinite(x) ? Math.round(x * 100) / 100 : x);

export interface Metrics {
  id: string; label: string; who: string; kind: string; family: string; session: string; take: string; subject: string; anchorClip: string;
  frames: number; fps: number; windowMs: [number, number]; clips: string[]; shotTypes: string[];
  sparc: Record<string, number>; sparcMean: number;
  pops: { bone: string; atMs: number; degPerSec: number; clip: string }[]; popsN: number; severe: number; whips: number;
  heldFrac: Record<string, number>; wristStill: number; thoracicStill: number;
  lockedElbow: number; lockedKnee: number;
  joints: Record<string, { bent: number; off: number; inverted: number; errP90: number; rollMax: number; rollFast: number }>;
  elbowBad: Record<string, { high: number; low: number }>;
  foot: { planted: number; p90Cm: number; maxCm: number; totalCm: number; skates: number };
  ball: { heldFrames: number; gapP90: number | null; gapMax: number | null; far: number; heldRig: Record<string, number>; heldVis: Record<string, number>; carryFrames: number; carryVisRight: number | null };
  /** jumpM / apexMs / relToApexMs: the HIPS rise from the lowest pre-anchor hips (a crouch counts as "jump") — kept for the baseline's
   *  numbers. feet*: the real flight — the lower foot's clearance over this body's floor, its apex, and the release against it. */
  release: { atMs: number; rig: string; vis: string; apexMs: number | null; jumpM: number; relToApexMs: number | null; feetUpM?: number; feetApexMs?: number | null; relToFeetApexMs?: number | null; airborne?: boolean } | null;
  visual: { sideStart: string; sideEnd: string; crossed: boolean; underLegs: boolean; behindBack: boolean; spinDeg: number; lateralFrac: number | null; handOverHead: number; verdict: string };
  marks: string[];
  /** AUDIT 2026-09-25 — the window's honesty: resets (root > 1 m in a frame: a possession reset / replay warp) cut the window;
   *  anchorAtReset = one fell within 50 ms of the anchor (the "onset" is the reset); snaps = root jumps of 0.25–1 m in a frame
   *  (a real glitch, kept in the window); preMs = the pre-roll the recording actually had; frozen = bones whose local rotation
   *  never changed in the window; flight = the lower foot's clearance and the root's rise. */
  audit?: { windowMs: [number, number]; frames: number; resetsMs: number[]; anchorAtReset: boolean; snaps: number; preMs: number; frozen: string[]; flight: { feetUpM: number; feetApexMs: number | null; rootUpM: number } };
}
export function measure(rec: Rec): Metrics {
  const A0 = rec.anchorT; const S = rec.subject;
  // AUDIT 2026-09-25: THE WINDOW STOPS AT A RESET. 65 of 382 baseline windows held a root warp of 1–11 m in one frame (a make's
  // possession reset, a rebound's re-check): every derivative metric (pops, whips, SPARC, rolls) straddled it, and 24 anchors sat
  // within 100 ms of one. The dunk probe stopped its window at contact + 250 ms for the same reason (the replay's teleport).
  const RESET_M = 1.0;
  const withS = rec.frames.filter((f) => f.B[S]);
  const resetsT: number[] = []; let snaps = 0;
  for (let i = 1; i < withS.length; i++) { const a = withS[i - 1].B[S].rp, b = withS[i].B[S].rp; const d = Math.hypot(a[0] - b[0], a[2] - b[2]); if (d > RESET_M) resetsT.push(withS[i].t); else if (d > 0.25 && withS[i].t >= A0 - rec.pre && withS[i].t <= A0 + rec.post) snaps++; }
  let wS = A0 - rec.pre, wE = A0 + rec.post; const anchorAtReset = resetsT.some((t) => Math.abs(t - A0) <= 50);
  // a reset before the anchor frame starts the window at it; one at or after the anchor ends the window before it (a steal that
  // flips possession warps the stealer to the check on the frame his reach clip crosses 0.5: the reach is the frames BEFORE it)
  for (const t of resetsT) { if (t < A0 - 1e-6) wS = Math.max(wS, t); else wE = Math.min(wE, t - VDT / 2); }
  const win = rec.frames.filter((f) => f.t >= wS - 1e-6 && f.t <= wE + 1e-6 && f.B[S]);
  const preMs = Math.round(A0 - (withS[0]?.t ?? A0));
  const bw = win.map((f) => f.B[S]);
  const dtAvg = win.length > 1 ? (win[win.length - 1].t - win[0].t) / (win.length - 1) : VDT;
  const fs = 1000 / dtAvg;
  // SPARC of the 9 effectors on the body-local speed (dunk definition)
  const eff: Record<string, number> = { RightHand: J.RightHand, LeftHand: J.LeftHand, RightFoot: J.RightFoot, LeftFoot: J.LeftFoot, Head: J.Head, RightForeArm: J.RightForeArm, LeftForeArm: J.LeftForeArm, LeftLeg: J.LeftLeg, RightLeg: J.RightLeg };
  const sp: Record<string, number> = {};
  for (const [name, ji] of Object.entries(eff)) {
    const pts = bw.map((b) => (b.j[ji] ? local(b, b.j[ji]!) : null));
    const speed: number[] = [];
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; if (!a || !b) continue; const dt = (win[i].t - win[i - 1].t) / 1000 || VDT / 1000; speed.push(len(sub(b, a)) / dt); }
    sp[name] = +sparc(speed, fs).toFixed(2);
  }
  const vals = Object.values(sp).filter((v) => isFinite(v));
  // pops (≥600°/s, ≥3.5× the ±6-frame median floored at 60, ≥3× the speed 3 frames either side), severe ≥3000°/s, whips >1500°/s on a limb
  const names = rec.bodies[S] ?? [];
  const idxOf = (n: string) => names.findIndex((x) => x.replace(/^mixamorig:?/, '').replace(/(_c\d+)+$/, '').replace(/_p\d+$/, '') === n);
  const frozen: string[] = [];
  const watch = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot'];
  const pops: Metrics['pops'] = []; let whips = 0; const held: Record<string, number> = {};
  for (const bn of watch) {
    const bi = idxOf(bn); if (bi < 0) continue;
    const w: number[] = [];
    for (let i = 1; i < bw.length; i++) { const dt = (win[i].t - win[i - 1].t) / 1000 || VDT / 1000; w.push(qAngleDeg(bw[i - 1].q.slice(bi * 4, bi * 4 + 4), bw[i].q.slice(bi * 4, bi * 4 + 4)) / dt); }
    for (let i = 0; i < w.length; i++) {
      const nbh = w.slice(Math.max(0, i - 6), i).concat(w.slice(i + 1, i + 7)).sort((a, b) => a - b);
      const med = nbh[Math.floor(nbh.length / 2)] ?? 0;
      const side = Math.max(w[i - 3] ?? 0, w[i + 3] ?? 0);
      if (/Arm|Leg|Hand|Foot/.test(bn) && w[i] > 1500) whips++;
      if (w[i] >= 600 && w[i] >= 3.5 * Math.max(med, 60) && w[i] >= 3 * side) pops.push({ bone: bn, atMs: Math.round(win[i + 1].t - A0), degPerSec: Math.round(w[i]), clip: bw[i + 1].c.map((c) => `${clipName(c[0])}:${c[1]}`).join('+') });
    }
    held[bn] = w.length ? +(w.filter((x) => x < 8).length / w.length).toFixed(2) : 0;
    if (w.length && w.every((x) => x < 0.01)) frozen.push(bn);
  }
  let lockedElbow = 0, lockedKnee = 0;
  for (const b of bw) {
    const e = (a: string, m: string, c: string) => (b.j[J[a]] && b.j[J[m]] && b.j[J[c]] ? angleAt(b.j[J[a]]!, b.j[J[m]]!, b.j[J[c]]!) : 0);
    if (e('RightArm', 'RightForeArm', 'RightHand') > 172 || e('LeftArm', 'LeftForeArm', 'LeftHand') > 172) lockedElbow++;
    if (e('RightUpLeg', 'RightLeg', 'RightFoot') > 176 || e('LeftUpLeg', 'LeftLeg', 'LeftFoot') > 176) lockedKnee++;
  }
  // the joint audit (phase 9 of the dunk pass): off the hinge >35°, inverted >120°, hinge error p90, upper-bone roll
  const joints: Metrics['joints'] = {};
  for (const k of ['LArm', 'RArm', 'LLeg', 'RLeg']) {
    const fr = win.filter((f) => f.B[S].jt && f.B[S].jt[k]);
    const bent = fr.filter((f) => f.B[S].jt[k][1] >= 0), errs = bent.map((f) => f.B[S].jt[k][1]).sort((a, b) => a - b);
    const rolls = fr.map((f, i) => (i ? Math.abs(f.B[S].jt[k][2]) / Math.max(1e-3, (f.t - fr[i - 1].t) / 1000) : 0));
    joints[k] = { bent: bent.length, off: errs.filter((e) => e > 35 && e <= 120).length, inverted: errs.filter((e) => e > 120).length, errP90: errs.length ? errs[Math.floor(errs.length * 0.9)] : 0, rollMax: Math.round(Math.max(0, ...rolls)), rollFast: rolls.filter((r) => r > 1500).length };
  }
  const elbowBad: Metrics['elbowBad'] = {};
  for (const sd of ['Left', 'Right']) {
    let high = 0, low = 0;
    for (const b of bw) {
      const Sh = b.j[J[sd + 'Arm']], E = b.j[J[sd + 'ForeArm']], H = b.j[J[sd + 'Hand']]; if (!Sh || !E || !H) continue;
      const ax = sub(H, Sh), al = len(ax); if (al < 1e-3) continue;
      if (angleAt(Sh, E, H) > 160) continue;
      const axn = ax.map((v) => v / al) as V3, e = sub(E, Sh), pe = sub(e, axn.map((v) => v * dot(e, axn)) as V3), pl = len(pe); if (pl < 1e-3) continue;
      // AUDIT 2026-09-25: the dunk probe's forward, exactly — the hip line's normal oriented by the LEFT foot (was: the mean of both
      // feet's heel→toe, which a turned-out foot drags)
      const p = pe.map((v) => v / pl); const lu = b.j[J.LeftUpLeg], ru = b.j[J.RightUpLeg], lf = b.j[J.LeftFoot], lt = b.j[J.LeftToeBase]; if (!lu || !ru || !lf || !lt) continue;
      const across = sub(ru, lu); across[1] = 0; const acl = len(across) || 1; const ac = across.map((v) => v / acl);
      let fwd: V3 = [ac[2], 0, -ac[0]]; if (dot(fwd, sub(lt, lf)) < 0) fwd = [-fwd[0], 0, -fwd[2]];
      const pf = dot(p, fwd), pu = p[1], handUp = H[1] - Sh[1];
      if (handUp > 0.15 && pf < -0.5 && pu < 0.3) high++;
      if (handUp < -0.1 && pf > 0.6) low++;
    }
    elbowBad[sd] = { high, low };
  }
  // FOOT SLIDE WHILE PLANTED — the footplant probe's contact test (low AND the lower foot AND not rising), with "low" read
  // against this body's own floor (its 5th-percentile foot height over the whole take) so a kit hero and a Meshy rival are
  // judged alike; teleports (> 0.5 m of root in a frame) skipped
  const allFoot = rec.frames.flatMap((f) => { const b = f.B[S]; return b ? [b.j[J.LeftFoot]?.[1], b.j[J.RightFoot]?.[1]].filter((y): y is number => typeof y === 'number') : []; });
  const floorY = allFoot.length > 20 ? pctl(allFoot, 0.05) : 0.06;
  const slides: number[] = [];
  for (let i = 1; i < bw.length; i++) {
    if (len(sub(bw[i].rp, bw[i - 1].rp)) > 0.5) continue;
    for (const [fi, oi] of [[J.LeftFoot, J.RightFoot], [J.RightFoot, J.LeftFoot]]) {
      const w = bw[i].j[fi], was = bw[i - 1].j[fi], other = bw[i].j[oi]; if (!w || !was) continue;
      const low = w[1] < floorY + 0.05, stance = !other || w[1] <= other[1], rising = w[1] - was[1] > 0.002;
      if (low && stance && !rising) slides.push(Math.hypot(w[0] - was[0], w[2] - was[2]));
    }
  }
  const foot = { planted: slides.length, p90Cm: r2(pctl(slides, 0.9) * 100), maxCm: r2(Math.max(0, ...slides) * 100), totalCm: r2(slides.reduce((a, b) => a + b, 0) * 100), skates: slides.filter((s) => s > 0.05).length };
  // THE BALL: against the palm while held (parented to one of this body's hands), which hand by rig name and as drawn, the carry
  const heldF = win.filter((f) => f.bb === S && f.ball);
  const gaps = heldF.map((f) => { const b = f.B[S]; const hand = f.bh === 'L' ? b.j[J.LeftHand] : b.j[J.RightHand]; return hand ? len(sub(f.ball!, hand)) : 0; }).sort((a, b) => a - b);
  const heldRig: Record<string, number> = { L: 0, R: 0 }, heldVis: Record<string, number> = { L: 0, R: 0 };
  for (const f of heldF) { const b = f.B[S]; if (f.bh) heldRig[f.bh]++; const hand = f.bh === 'L' ? b.j[J.LeftHand] : b.j[J.RightHand]; const v = hand ? visSide(b, hand) : ''; if (v) heldVis[v]++; }
  const carryF = win.filter((f) => f.ball && !f.bb && !f.br && f.B[S] && carrierIs(f, S));
  const carrySided = carryF.map((f) => visSide(f.B[S], f.ball!)).filter(Boolean);
  const ball = { heldFrames: heldF.length, gapP90: gaps.length ? r2(pctl(gaps, 0.9)) : null, gapMax: gaps.length ? r2(gaps[gaps.length - 1]) : null, far: gaps.filter((g) => g > 0.2).length, heldRig, heldVis, carryFrames: carryF.length, carryVisRight: carrySided.length ? r2(carrySided.filter((s) => s === 'R').length / carrySided.length) : null };
  // THE RELEASE against the jump's apex (shots / finishes / dunks): the frame the ball leaves this body's hand, released
  let release: Metrics['release'] = null;
  if (/shot|finish|dunk|post|pass/.test(rec.kind)) {
    const ri = win.findIndex((f, i) => i > 0 && f.t >= A0 - 100 && win[i - 1].bb === S && f.bb !== S && f.br);
    const hipsY = bw.map((b) => b.j[J.Hips]?.[1] ?? 0);
    const baseY = Math.min(...hipsY.slice(0, Math.max(1, win.findIndex((f) => f.t >= A0) + 1)));
    let ai = -1, top = -1e9; win.forEach((f, i) => { if (f.t >= A0 - 100 && hipsY[i] > top) { top = hipsY[i]; ai = i; } });
    const jumpM = r2(top - baseY);
    const clear = bw.map((b) => Math.min(b.j[J.LeftFoot]?.[1] ?? 9, b.j[J.RightFoot]?.[1] ?? 9) - floorY);
    // the flight that carries the release: searched from the anchor to 400 ms after the ball leaves (a celebration hop a second
    // later is not the shot's apex — the 3PT rack shot read "apex 1250 ms" off the dunk celebration)
    const tRel = ri > 0 ? win[ri].t : Infinity;
    let fai = -1, ftop = -1e9; win.forEach((f, i) => { if (f.t >= A0 - 100 && f.t <= tRel + 400 && clear[i] > ftop) { ftop = clear[i]; fai = i; } });
    const feetUpM = r2(ftop);
    if (ri > 0) {
      const pf = win[ri - 1]; const b = pf.B[S]; const hand = pf.bh === 'L' ? b.j[J.LeftHand] : b.j[J.RightHand];
      release = { atMs: Math.round(win[ri].t - A0), rig: pf.bh ?? '', vis: hand ? visSide(b, hand) : '', apexMs: ai >= 0 ? Math.round(win[ai].t - A0) : null, jumpM, relToApexMs: ai >= 0 && jumpM >= 0.06 ? Math.round(win[ri].t - win[ai].t) : null,
        feetUpM, feetApexMs: fai >= 0 ? Math.round(win[fai].t - A0) : null, relToFeetApexMs: fai >= 0 && feetUpM >= 0.06 ? Math.round(win[ri].t - win[fai].t) : null, airborne: clear[ri - 1] > 0.05 };
    } else release = { atMs: -1, rig: '', vis: '', apexMs: ai >= 0 ? Math.round(win[ai].t - A0) : null, jumpM, relToApexMs: null, feetUpM, feetApexMs: fai >= 0 ? Math.round(win[fai].t - A0) : null, relToFeetApexMs: null };
  }
  // WHAT THE BODY VISIBLY DID (against the clip's name)
  // the ball's side only while THIS body has it (in its hand, or on its dribble) — a ball in flight is on nobody's side
  const mine = (f: Frame) => !!f.ball && (f.bb === S || (!f.bb && !f.br && carrierIs(f, S)));
  const ballSideAt = (t: number) => { const c = win.filter((x) => mine(x) && Math.abs(x.t - t) <= 300); if (!c.length) return ''; const f = c.reduce((a, x) => (Math.abs(x.t - t) < Math.abs(a.t - t) ? x : a), c[0]); return visSide(f.B[S], f.ball!); };
  const sideStart = win.length ? ballSideAt(A0 - 80) : '', sideEnd = win.length ? ballSideAt(A0 + Math.min(rec.post, 900) - 100) : '';
  let underLegs = false, behindBack = false;
  for (const f of win) {
    if (f.t < A0 - 50 || f.t > A0 + 900 || !f.ball) continue;
    const b = f.B[S]; const kneeY = ((b.j[J.LeftLeg]?.[1] ?? 0.5) + (b.j[J.RightLeg]?.[1] ?? 0.5)) / 2; const h = b.j[J.Hips]; if (!h) continue;
    const fwd = facing(b), rt = rightOf(fwd), d = sub(f.ball, h); const lx = dot(d, rt), lz = dot(d, fwd);
    if (f.ball[1] < kneeY + 0.05 && Math.abs(lx) < 0.22 && Math.abs(lz) < 0.3) underLegs = true;
    if (lz < -0.15 && f.ball[1] > 0.45 && f.ball[1] < 1.4 && (f.bb === S || (!f.bb && !f.br))) behindBack = true;
  }
  let spin = 0; { let prev: number | null = null; for (const f of win) { if (f.t < A0 - 50 || f.t > A0 + 1000) continue; const fw = facing(f.B[S]); const y = Math.atan2(fw[0], fw[2]); if (prev !== null) { let d = y - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; spin += d; } prev = y; } }
  let latSum = 0, latN = 0;
  for (let i = 1; i < bw.length; i++) { const v = sub(bw[i].rp, bw[i - 1].rp); const s = Math.hypot(v[0], v[2]); if (s < 0.004 || s > 0.5) continue; latSum += Math.abs(dot(v, rightOf(facing(bw[i])))) / s; latN++; }
  const handOverHead = r2(Math.max(-9, ...bw.map((b) => (b.j[J.Head] ? Math.max(b.j[J.LeftHand]?.[1] ?? -9, b.j[J.RightHand]?.[1] ?? -9) - b.j[J.Head]![1] : -9))));
  const spinDeg = Math.round((spin * 180) / Math.PI);
  const verdict = [sideStart && sideEnd ? (sideStart !== sideEnd ? `ball crossed ${sideStart}→${sideEnd}` : `ball stayed ${sideStart}`) : '', underLegs ? 'under the legs' : '', behindBack ? 'behind the back' : '', Math.abs(spinDeg) >= 200 ? `turned ${spinDeg}°` : '', latN ? `sideways ${Math.round((latSum / latN) * 100)}%` : '', handOverHead > 0.1 ? `hand ${handOverHead} m over the head` : ''].filter(Boolean).join(' · ');
  const visual = { sideStart, sideEnd, crossed: !!sideStart && !!sideEnd && sideStart !== sideEnd, underLegs, behindBack, spinDeg, lateralFrac: latN ? r2(latSum / latN) : null, handOverHead, verdict };
  const clips: string[] = []; for (const b of bw) { const c = topClip(b); if (c && clips[clips.length - 1] !== c) clips.push(c); }
  const shotTypes = [...new Set(win.map((f) => String(f.s?.st ?? '')).filter(Boolean))];
  const marks = rec.marks.filter((m) => m.t >= A0 - rec.pre && m.t <= A0 + rec.post && !/-PP(-FOE)?\]/.test(m.msg)).map((m) => `${Math.round(m.t - A0)} ${m.msg.slice(0, 110)}`).slice(0, 24);
  return {
    id: rec.action, label: rec.label, who: rec.who, kind: rec.kind, family: rec.family, session: rec.session, take: rec.take, subject: S, anchorClip: rec.anchorClip,
    frames: win.length, fps: +fs.toFixed(1), windowMs: [rec.pre, rec.post], clips, shotTypes,
    sparc: sp, sparcMean: vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : NaN,
    pops, popsN: pops.length, severe: pops.filter((p) => p.degPerSec >= 3000).length, whips,
    heldFrac: held, wristStill: r2(((held.LeftHand ?? 0) + (held.RightHand ?? 0)) / 2), thoracicStill: held.Spine2 ?? 0,
    lockedElbow, lockedKnee, joints, elbowBad, foot, ball, release, visual, marks,
    audit: (() => { const cl = bw.map((b) => Math.min(b.j[J.LeftFoot]?.[1] ?? 9, b.j[J.RightFoot]?.[1] ?? 9) - floorY); let fi = -1, ft = -1e9; win.forEach((f, i) => { if (f.t >= A0 - 100 && cl[i] > ft) { ft = cl[i]; fi = i; } });
      return { windowMs: [Math.round(Math.max(wS, win[0]?.t ?? wS) - A0), Math.round(Math.min(wE, win[win.length - 1]?.t ?? wE) - A0)] as [number, number], frames: win.length, resetsMs: resetsT.map((t) => Math.round(t - A0)), anchorAtReset, snaps, preMs, frozen, flight: { feetUpM: r2(ft), feetApexMs: fi >= 0 ? Math.round(win[fi].t - A0) : null, rootUpM: r2(Math.max(0, ...bw.map((b) => b.rp[1]))) } }; })(),
  };
}
/** Who has the ball this frame: the body whose hand it is parented to, or — on a dribble, where the carry places the ball in
 *  world space and it has no parent — the carrier the mode reports (1v1 possession / 3v3 carrier). '' = loose or in flight. */
function holderOf(f: Frame): string {
  if (f.bb) return f.bb;
  if (!f.ball || f.br) return '';
  const s = f.s || {};
  if (typeof s.cr === 'string') return s.cr === 'foeTeam' ? '' : s.cr;
  if (typeof s.po === 'string' && s.ca) return s.po === 'mine' ? 'me' : s.po === 'defense' ? 'foe' : '';
  return '';
}
function carrierIs(f: Frame, id: string): boolean {
  const s = f.s || {};
  if (typeof s.po === 'string') return id === 'me' ? s.po === 'mine' : id === 'foe' ? s.po === 'defense' : false;
  if (typeof s.cr === 'string') return id === 'me' ? s.cr === 'me' : id.startsWith('mate') ? s.cr === id : false;
  return id === 'me';
}

// ── the browser side ────────────────────────────────────────────────────────────────────────────────────────────────
interface Seg { p: Page; session: Session; errors: string[]; recs: Rec[]; boot: Record<string, unknown> }
async function boot(b: Browser, s: Session): Promise<Seg> {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript({ content: "try { window.sessionStorage.setItem('NEXUS_AGENT', '1'); } catch (e) {}" });
  // Math.random seeded from the first line of the page (mulberry32): the load's own rolls (a rival's body, a crowd) repeat too
  await ctx.addInitScript({ content: `(() => { let a = ${SEED >>> 0 || 1}; Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })()` });
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/status of 401|favicon|gamepad|Unauthorized/.test(t)) errors.push(t.slice(0, 200)); });
  p.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)));
  const url = `${BASE}/dev/mode/${s.mode}?agent=1${s.qs}`;
  const w0 = Date.now();
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
  let st = '';
  while (Date.now() - w0 < 300000) { st = (await p.evaluate(() => document.getElementById('fel-ready')?.dataset.state ?? '').catch(() => '')) as string; if (st === 'loaded' || st === 'playing' || st === 'failed') break; await p.waitForTimeout(400); }
  if (st !== 'loaded' && st !== 'playing') throw new Error(`${url}: the mode never became ready (state "${st}")`);
  // AUDIT 2026-09-25: the clock went in the moment the mode said 'loaded' — mid-fade on some boots. A second of real time first.
  await p.waitForTimeout(Number(process.env.BOOT_SETTLE_MS ?? 1500));
  await p.evaluate(`window.__HM_CFG = ${JSON.stringify({ dt: VDT, seed: SEED, maxFrames: 1500, hogMs: HOG, recPrep: process.env.REC_PREP !== '0', maxBodies: 16 })}`);
  const inst = await p.evaluate(PAGE_JS) as Record<string, unknown>;
  // the mode is woken IN THE PAGE (the carnival's first press too — the pick screen takes any face button) and paused again
  const started = await p.evaluate(`window.__hm.startMode({ settle: 1200 })`) as Record<string, unknown>;
  console.log(`[boot] ${s.id} ${url} ready in ${((Date.now() - w0) / 1000).toFixed(1)} s · page ${JSON.stringify(inst)} · start ${JSON.stringify(started)}`);
  return { p, session: s, errors, recs: [], boot: { url, started, inst } };
}
async function pull(p: Page): Promise<{ bodies: Record<string, string[]>; frames: Frame[]; marks: Mark[]; errors: string[] }> {
  const first = await p.evaluate('window.__hm.pull(0, 150)') as { bodies: Record<string, string[]>; frames: Frame[]; total: number; marks: Mark[]; errors: string[] };
  const frames = first.frames.slice();
  for (let at = frames.length; at < first.total; at += 150) { const c = await p.evaluate(`window.__hm.pull(${at}, 150)`) as { frames: Frame[] }; frames.push(...c.frames); }
  return { bodies: first.bodies, frames, marks: first.marks, errors: first.errors };
}
const CELL_W = 250, CELL_H = 440;
async function sheet(p: Page, rec: Rec, m: Metrics, file: string): Promise<number[]> {
  const t0 = rec.anchorT - rec.pre, t1 = rec.anchorT + rec.post;
  const picks: Frame[] = [];
  for (let k = 0; k < COLS; k++) { const t = t0 + ((t1 - t0) * k) / (COLS - 1); picks.push(rec.frames.reduce((a, f) => (Math.abs(f.t - t) < Math.abs(a.t - t) ? f : a), rec.frames[0])); }
  const af = rec.frames.reduce((a, f) => (Math.abs(f.t - rec.anchorT) < Math.abs(a.t - rec.anchorT) ? f : a), rec.frames[0]);
  const fwd = af.B[rec.subject] ? facing(af.B[rec.subject]) : [0, 0, 1];
  const cells: { input: Buffer; left: number; top: number }[] = []; const errs: number[] = [];
  for (const [row, view] of (['side', 'front'] as const).entries()) {
    for (const [col, f] of picks.entries()) {
      const r = await p.evaluate(`window.__hm.pose(${JSON.stringify(rec.bodies)}, ${JSON.stringify(f)}, ${JSON.stringify(rec.subject)}, ${JSON.stringify(view)}, ${JSON.stringify(fwd)})`) as { poseErr?: number };
      if (typeof r.poseErr === 'number') { errs.push(r.poseErr); if (r.poseErr > 0.05) console.log(`  sheet ${rec.action}: ${view} ${Math.round(f.t - rec.anchorT)} ms posed ${r.poseErr} m off its recording`); }
      const png = await p.screenshot({ clip: { x: 640 - CELL_W / 2, y: 400 - CELL_H / 2, width: CELL_W, height: CELL_H } });
      const b = f.B[rec.subject]; const top = b ? b.c.slice().sort((x, y) => y[1] - x[1]).slice(0, 2).map((c) => `${clipName(c[0]).replace(/^bball_|^dunk_/, '')}${c[1] < 0.98 ? ' ' + c[1] : ''}`).join(' / ') : '';
      const hand = f.bb === rec.subject ? ` ball:${f.bh}${b ? '/' + visSide(b, f.bh === 'L' ? b.j[J.LeftHand]! : b.j[J.RightHand]!) : ''}` : '';
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const label = `<svg width="${CELL_W}" height="${CELL_H}"><rect x="0" y="0" width="${CELL_W}" height="34" fill="rgba(0,0,0,0.72)"/><text x="4" y="14" font-family="monospace" font-size="12" fill="#ffd54a">${view} ${Math.round(f.t - rec.anchorT)} ms${esc(hand)}</text><text x="4" y="29" font-family="monospace" font-size="10" fill="#e0e0e0">${esc(top).slice(0, 40)}</text></svg>`;
      cells.push({ input: await sharp(png).composite([{ input: Buffer.from(label), top: 0, left: 0 }]).png().toBuffer(), left: col * CELL_W, top: 40 + row * CELL_H });
    }
  }
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const rel = m.release && m.release.atMs >= 0 ? ` · release ${m.release.rig}/${m.release.vis} ${m.release.relToApexMs ?? '-'} ms vs apex` : '';
  const title = `<svg width="${COLS * CELL_W}" height="40"><rect width="100%" height="40" fill="#101010"/><text x="8" y="26" font-family="monospace" font-size="18" fill="#fff">${esc(rec.action)} (${esc(rec.subject)}) · ${esc(m.clips.map((c) => c.replace(/^bball_/, '')).join(' → ')).slice(0, 150)} · SPARC ${m.sparcMean} · pops ${m.popsN}/${m.severe} · slide p90 ${m.foot.p90Cm} cm${esc(rel)} · ${esc(m.visual.verdict).slice(0, 80)}</text></svg>`;
  await sharp({ create: { width: COLS * CELL_W, height: 40 + 2 * CELL_H, channels: 3, background: '#000' } }).composite([{ input: Buffer.from(title), top: 0, left: 0 }, ...cells]).png().toFile(file);
  return errs;
}
async function finishSegment(seg: Seg): Promise<void> {
  if (SCRUB && seg.recs.length) {
    const info = await seg.p.evaluate('window.__hm.freeze()');
    console.log(`[scrub] ${seg.session.id}: ${JSON.stringify(info)}`);
    for (const rec of seg.recs) {
      const m = measure(rec);
      const file = `${OUT}/sheet-${rec.action}.png`;
      const errs = await sheet(seg.p, rec, m, file).catch((e) => { console.log(`  sheet ${rec.action}: ${String(e).slice(0, 200)}`); return [] as number[]; });
      if (errs.length) console.log(`  sheet ${rec.action}: pose fidelity (mean joint error after the render) median ${pctl(errs, 0.5).toFixed(4)} m, max ${Math.max(...errs).toFixed(4)} m`);
    }
  }
  if (seg.errors.length) console.log(`[page errors ${seg.session.id}]`, [...new Set(seg.errors)].slice(0, 6));
  await seg.p.context().close();
}

// ── run ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const allRecs: Rec[] = []; const status: Record<string, { found: number; where: string[]; searched: string[] }> = {};
for (const a of ACTS) status[a.id] = { found: 0, where: [], searched: [] };
let tip = '';
try { tip = (await import('node:child_process')).execSync('git rev-parse --short HEAD', { cwd: HERE }).toString().trim(); } catch { tip = '?'; }

if (FROM_REC) {
  for (const f of fs.readdirSync(FROM_REC).filter((f) => /^rec-.*\.json$/.test(f)).sort()) { const r = JSON.parse(fs.readFileSync(`${FROM_REC}/${f}`, 'utf8')) as Rec; if (!process.env.ACTIONS || want.includes('all') || want.includes(r.action) || want.includes(r.session)) allRecs.push(r); }
  // sheets again from the recordings: a fresh page of each session (the same bodies, bound by the same ids), frozen at once
  if (SCRUB && allRecs.length) {
    const browser = await chromium.launch({ executablePath: chromiumExe(), headless: process.env.HEADLESS === '1', args: ['--window-size=1280,860', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
    for (const s of SESSIONS) {
      const recs = allRecs.filter((r) => r.session === s.id); if (!recs.length) continue;
      const seg = await boot(browser, s); seg.recs.push(...recs);
      await seg.p.evaluate('window.__hm.bind()');
      await finishSegment(seg);
    }
    await browser.close();
  }
} else {
  const browser = await chromium.launch({ executablePath: chromiumExe(), headless: process.env.HEADLESS === '1', args: ['--window-size=1280,860', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  for (const s of SESSIONS) {
    const acts = ACTS.filter((a) => sessionsOf(a).includes(s.id)); if (!acts.length) continue;
    const need = new Set(acts.flatMap((a) => (a.takes === '*' ? s.takes.map((t) => t.name) : a.takes.filter((n) => s.takes.some((t) => t.name === n)))));
    // takes a later take depends on (3PT: the run must reach the standings; the carnival: the night must be running)
    if (s.id === '3pt' && need.has('p_standings')) { need.add('p_rest'); }
    const takes = s.takes.filter((t) => need.has(t.name));
    const timelines: Record<string, unknown> = {};
    let seg = await boot(browser, s);
    for (const t of takes) {
      if (await seg.p.evaluate('window.__hm.ended()')) { console.log(`[seg] ${s.id}: the game ended — sheets for this page, then a fresh one`); await finishSegment(seg); seg = await boot(browser, s); }
      // the take's dice are seeded by its NAME, not its index: adding a take to the catalogue must not reseed every take after it
      // (measured: inserting two takes turned the 3v3 dunk take's dunk into a turnover)
      const opts = { ...t, seed: SEED * 1000 + nameSeed(t.name) };
      const res = await Promise.race([
        seg.p.evaluate(`window.__hm.take(${JSON.stringify(t.name)}, ${JSON.stringify(opts)})`) as Promise<Record<string, unknown>>,
        new Promise<Record<string, unknown>>((r) => setTimeout(() => r({ name: t.name, err: `no answer in ${TAKE_WALL_MS} wall ms` }), TAKE_WALL_MS)),
      ]);
      if (t.rec === false) { console.log(`[take] ${s.id}/${t.name} (not recorded) ${JSON.stringify(res)}`); continue; }
      const data = await pull(seg.p);
      const td: TakeData = { session: s.id, take: t.name, bodies: data.bodies, frames: data.frames, marks: data.marks, meta: { ...res, seed: opts.seed, vdt: VDT, tip, url: seg.boot.url } };
      const tl = timeline(td);
      timelines[t.name] = { res, timeline: tl, marks: data.marks.filter((m) => !/-PP(-FOE)?\]/.test(m.msg)).slice(0, 80).map((m) => `${Math.round(m.t - (res.t0 as number ?? 0))} ${m.msg}`), pageErrors: data.errors };
      const hits: string[] = [];
      for (const a of acts) {
        if (a.takes !== '*' && !a.takes.includes(t.name)) continue;
        if (a.takes === '*' && a.session !== s.id && !(a.also ?? []).includes(s.id)) continue;
        status[a.id].searched.push(t.name);
        if (status[a.id].found >= REPS) continue;
        for (const an of anchorsIn(td, a)) {
          if (status[a.id].found >= REPS) break;
          const T = td.frames[an.i].t;
          const rec: Rec = { action: a.id, label: a.label, who: a.who, kind: a.kind, family: a.family, session: s.id, take: t.name, subject: an.body, anchorT: T, anchorClip: an.clip, pre: a.pre, post: a.post, bodies: td.bodies,
            frames: td.frames.filter((f) => f.t >= T - a.pre - 400 && f.t <= T + a.post + 400), marks: td.marks.filter((m) => m.t >= T - a.pre - 400 && m.t <= T + a.post + 400), meta: td.meta };
          fs.writeFileSync(`${OUT}/rec-${a.id}.json`, JSON.stringify(rec));
          allRecs.push(rec); seg.recs.push(rec); status[a.id].found++; status[a.id].where.push(`${t.name}@${Math.round(T - (res.t0 as number ?? 0))}ms ${an.body} ${an.clip}`);
          hits.push(a.id);
        }
      }
      console.log(`[take] ${s.id}/${t.name} ${res.virtualMs ?? '?'} virtual ms in ${res.wallMs ?? '?'} wall ms · ${data.frames.length} frames · bodies ${Object.keys(data.bodies).join(',')}${res.err ? ' · ERR ' + res.err : ''}${res.prepOk === false ? ' · PREP FAILED' : ''} → ${hits.join(', ') || '(no catalogue action in this take)'}`);
      console.log(`       me: ${String(tl.me ?? '').slice(0, 300)}`);
    }
    fs.writeFileSync(`${OUT}/takes-${s.id}.json`, JSON.stringify(timelines, null, 1));
    await finishSegment(seg);
  }
  await browser.close();
}

const ms = allRecs.map((r) => Object.assign(measure(r), (r as unknown as { attempt?: number }).attempt != null ? { attempt: (r as unknown as { attempt?: number }).attempt } : {}));
// MERGE (default): a partial run (one session, a few actions) keeps the tag's other actions — metrics.json and status stay whole
const ranIds = new Set(ACTS.map((a) => a.id));
const merged = (() => { if (process.env.MERGE === '0' || FROM_REC) return ms; try { const old = JSON.parse(fs.readFileSync(`${OUT}/metrics.json`, 'utf8')) as Metrics[]; return [...old.filter((m) => !ranIds.has(m.id) && !ms.some((x) => x.id === m.id)), ...ms]; } catch { return ms; } })();
fs.writeFileSync(`${OUT}/metrics.json`, JSON.stringify(merged, null, 1));
const pad = (s: string | number | null, n: number) => String(s ?? '-').padEnd(n);
console.log(`\n${pad('action', 26)}${pad('body', 6)}${pad('SPARC', 7)}${pad('pops', 7)}${pad('whip', 5)}${pad('elb', 5)}${pad('knee', 5)}${pad('wrist', 6)}${pad('thor', 6)}${pad('slide90', 8)}${pad('ballP90', 8)}${pad('held rig/vis', 14)}${pad('rel hips/feet', 11)}clips`);
for (const m of ms) {
  const hr = `${m.ball.heldRig.R ? 'R' + m.ball.heldRig.R : ''}${m.ball.heldRig.L ? 'L' + m.ball.heldRig.L : ''}/${m.ball.heldVis.R ? 'R' + m.ball.heldVis.R : ''}${m.ball.heldVis.L ? 'L' + m.ball.heldVis.L : ''}`;
  console.log(`${pad(m.id, 26)}${pad(m.subject, 6)}${pad(m.sparcMean, 7)}${pad(`${m.popsN}/${m.severe}`, 7)}${pad(m.whips, 5)}${pad(m.lockedElbow, 5)}${pad(m.lockedKnee, 5)}${pad(m.wristStill, 6)}${pad(m.thoracicStill, 6)}${pad(m.foot.p90Cm, 8)}${pad(m.ball.gapP90, 8)}${pad(hr, 14)}${pad(`${m.release?.relToApexMs ?? '-'}/${m.release?.relToFeetApexMs ?? '-'}`, 11)}${m.clips.map((c) => c.replace(/^bball_/, '')).join(' → ').slice(0, 90)}`);
}
console.log('\nVISUAL vs CLIP');
for (const m of ms) console.log(`${pad(m.id, 26)}anchor ${pad(m.anchorClip, 28)} ${m.visual.verdict}${m.release && m.release.atMs >= 0 ? ` · released from rig ${m.release.rig} (drawn ${m.release.vis}) at ${m.release.atMs} ms, hips apex ${m.release.apexMs} ms (rise ${m.release.jumpM} m), feet apex ${m.release.feetApexMs ?? '-'} ms (clear ${m.release.feetUpM ?? '-'} m${m.release.airborne === false ? ', FEET DOWN at release' : ''})` : ''}${m.audit?.anchorAtReset ? ' · ANCHOR AT A RESET' : ''}${m.audit?.resetsMs.length ? ` · window cut at reset ${m.audit.resetsMs.join('/')} ms` : ''}${m.shotTypes.length ? ' · HUD ' + m.shotTypes.join('/') : ''}`);
if (!FROM_REC) {
  let all: Record<string, { found: number; where: string[]; searched: string[] }> = {};
  if (process.env.MERGE !== '0') { try { all = JSON.parse(fs.readFileSync(`${OUT}/status.json`, 'utf8')); } catch { all = {}; } }
  for (const a of ACTS) all[a.id] = status[a.id];
  fs.writeFileSync(`${OUT}/status.json`, JSON.stringify(all, null, 1));
  const line = (a: ActionDef) => { const s = all[a.id]; if (!s) return `NOT RUN ${a.id.padEnd(26)} ${a.who.padEnd(5)} ${a.label}`; return `${s.found ? 'FOUND ' : 'MISSING'} ${a.id.padEnd(26)} ${a.who.padEnd(5)} ${a.label}${s.found ? ` — ${s.where.join('; ')}` : ` — searched ${[...new Set(s.searched)].join(', ') || '(no take ran)'}`}`; };
  const lines = CATALOGUE.filter((a) => all[a.id]).map(line);
  fs.writeFileSync(`${OUT}/status.txt`, `hoops motion probe · tip ${tip} · ${BASE} · virtual clock ${VDT.toFixed(4)} ms/frame · seed ${SEED} · ${lines.filter((l) => l.startsWith('FOUND')).length}/${lines.length} found\n\n${lines.join('\n')}\n`);
  console.log(`\n${ACTS.map(line).join('\n')}`);
}
console.log(`\n${allRecs.length} recordings → ${OUT} (virtual clock: every rendered frame = ${VDT.toFixed(3)} ms of game time; seed ${SEED})`);
