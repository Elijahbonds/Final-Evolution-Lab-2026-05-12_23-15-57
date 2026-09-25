// The shipping routes the scorecard measures (capture + scorer share one list).
//
// MUSIC-SUITE P1 (2026-09-25): the Groove Academy's scored half is on the card. It is a DOM room (a React page, no
// Babylon canvas, no #fel-ready, no __FEL_QA__), so the capture and the mechanics probe drive it through
// _dom-room.mts instead of the ModeHarness path. The route carries `?stage=perform` because the stage pick is read
// from the URL first (lib/babylon/music/musicStage.ts readMusicStage) and STUDIO, the tool, has nothing to score.
export const SCORE_ROUTES: [string, string][] = [
  ['dunk', '/play/dunk'], ['try', '/try'], ['karate', '/play/karate'], ['football', '/play/football'], ['skateboard', '/play/skateboard'],
  ['snowboard_slalom', '/play/snowboard'], ['surf', '/play/surf'], ['tennis', '/play/tennis'], ['derby', '/play/baseball'],
  ['penalty', '/play/soccer'], ['golf', '/play/golf'], ['onevone', '/play/onevone'], ['threevthree', '/play/threevthree'],
  ['carnival', '/play/carnival'], ['karate_vs', '/play/karate-vs'], ['dunkduel', '/play/dunkduel'], ['mixedcombat', '/play/mixedcombat'], ['sprint', '/play/sprint'],
  ['showdown', '/play/showdown'], ['duel', '/play/duel'], ['volleyball', '/play/volleyball'], ['dance', '/play/dance'],
  ['who_scene_it', '/play/who-scene-it'], ['freerun', '/play/freerun'], ['threepoint', '/play/threepoint'], ['bigair', '/play/big-air'],
  ['aeroaces', '/play/aero-aces'], ['velocitykart', '/play/velocity-kart'], ['brainbrawl', '/play/brain-brawl'],
  ['music', '/play/music?stage=perform'],
];

/**
 * DEV=1 runs (a lane's `next dev` with its database offline, so every /play route bounces to /login): the auth-free twin
 * of each route. A Babylon mode's twin is the generic /dev/mode/<registry key> runner. The Academy is not a
 * ModeDefinition, so it has its own dev host (app/dev/music, MUSIC-SUITE P1): the real StudioMode plus the
 * window.__FEL_STUDIO__ readout.
 */
export const DEV_PATHS: Record<string, string> = {
  music: '/dev/music?stage=perform',
};
export const devPath = (slug: string): string => DEV_PATHS[slug] ?? `/dev/mode/${slug}`;

/**
 * Append a query parameter to a route that may already carry one. Every probe here built `${path}?agent=1`, which is
 * right until a route has its own query: '/play/music?stage=perform?agent=1' reads the stage as 'perform?agent=1' (not a
 * stage, so the room opens on STUDIO) and never switches the agent bridge on.
 */
export const withQuery = (path: string, q: string): string => `${path}${path.includes('?') ? '&' : '?'}${q}`;
