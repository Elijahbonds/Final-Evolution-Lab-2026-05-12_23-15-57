const CHALLENGE_ROUTE_BY_MODE: Record<string, string> = {
  acting: '/play/acting',
  aeroAces: '/play/aero-aces',
  baseball: '/play/baseball',
  bigAir: '/play/big-air',
  brainBrawl: '/play/brain-brawl',
  carnival: '/play/carnival',
  dance: '/play/dance',
  duel: '/play/duel',
  dunkContest: '/play/dunk',
  dunkduel: '/play/dunkduel',
  football: '/play/football',
  freerun: '/play/freerun',
  golf: '/play/golf',
  hoops1v1: '/play/onevone',
  hoops3v3: '/play/threevthree',
  irl: '/play/irl',
  karateEndless: '/play/karate',
  karateVersus: '/play/karate-vs',
  mixedcombat: '/play/mixedcombat',
  music: '/play/music',
  showDown: '/play/showdown',
  showdown: '/play/showdown',
  skateboarding: '/play/skateboard',
  snowboarding: '/play/snowboard',
  soccer: '/play/soccer',
  sprint: '/play/sprint',
  surfing: '/play/surf',
  tennis: '/play/tennis',
  threePoint: '/play/threepoint',
  tiebreak: '/play/tiebreak',
  training: '/play/training',
  velocityKart: '/play/velocity-kart',
  volleyball: '/play/volleyball',
  whoSceneIt: '/play/who-scene-it',
};

export function challengePlayHref(modeKey: string, code: string): string | null {
  const route = CHALLENGE_ROUTE_BY_MODE[modeKey];
  if (!route) return null;
  return `${route}?c=${encodeURIComponent(code)}`;
}

