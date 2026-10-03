// M69: static mode descriptors the Agent Control Bridge advertises through
// window.__NEXUS_AGENT__.describe(). Standalone (no imports) so ModeHarness can
// pull it without creating a cycle through the mode registry. Kept in step with
// public/agent-manifest.json — an agent fetches that JSON before boot, then the
// live describe() confirms it at runtime.

export interface AgentModeDescriptor {
  id: string;
  route: string;
  label: string;
  actions: string[];
}

export const AGENT_MODES: AgentModeDescriptor[] = [
  { id: 'aeroaces',          route: '/play/aero-aces',     label: 'Aero Aces',      actions: ['move', 'sprint', 'idle'] },
  { id: 'bigair',            route: '/play/big-air',       label: 'Stomp',          actions: ['move', 'sprint', 'idle'] },
  { id: 'brainbrawl',        route: '/play/brain-brawl',   label: 'Brain Brawl',    actions: ['move', 'shoot', 'idle'] },
  { id: 'carnival',          route: '/play/carnival',      label: 'Carnival',       actions: ['move', 'shoot', 'idle'] },
  { id: 'dance',             route: '/play/dance',         label: 'The Cypher',     actions: ['move', 'idle'] },
  { id: 'derby',             route: '/play/baseball',      label: 'Moonshot Derby', actions: ['move', 'shoot', 'idle'] },
  { id: 'duel',              route: '/play/duel',          label: 'Duel',           actions: ['move', 'guard', 'strike', 'idle'] },
  { id: 'dunk',              route: '/play/dunk',          label: 'Dunk Contest',   actions: ['move', 'sprint', 'dunk', 'shoot', 'idle'] },
  { id: 'dunkduel',          route: '/play/dunkduel',      label: 'Prove It',       actions: ['move', 'sprint', 'dunk', 'shoot', 'idle'] },
  { id: 'football',          route: '/play/football',      label: 'Breakaway',      actions: ['move', 'sprint', 'turbo', 'idle'] },
  { id: 'freerun',           route: '/play/freerun',       label: 'Free Run',       actions: ['move', 'sprint', 'idle'] },
  { id: 'golf',              route: '/play/golf',          label: 'The Loop',       actions: ['move', 'shoot', 'idle'] },
  { id: 'karate',            route: '/play/karate',        label: 'Karate Endless', actions: ['move', 'guard', 'strike', 'idle'] },
  { id: 'karate_vs',         route: '/play/karate-vs',     label: 'Storm Duel',     actions: ['move', 'guard', 'strike', 'idle'] },
  { id: 'mixedcombat',       route: '/play/mixedcombat',   label: "Ring's Edge",    actions: ['move', 'guard', 'strike', 'idle'] },
  { id: 'onevone',           route: '/play/onevone',       label: '1v1 Hoops',      actions: ['move', 'sprint', 'shoot', 'pass', 'steal', 'block', 'contest', 'turbo', 'intense', 'postup', 'screen', 'charge', 'idle'] },
  { id: 'penalty',           route: '/play/soccer',        label: 'Twelve Yards',   actions: ['move', 'shoot', 'idle'] },
  { id: 'showdown',          route: '/play/showdown',      label: 'Showdown',       actions: ['move', 'guard', 'strike', 'idle'] },
  { id: 'skateboard',        route: '/play/skateboard',    label: 'Venice Lines',   actions: ['move', 'sprint', 'idle'] },
  { id: 'snowboard_slalom',  route: '/play/snowboard',     label: 'Gate Crasher',   actions: ['move', 'sprint', 'idle'] },
  { id: 'sprint',            route: '/play/sprint',        label: 'Beach Sprint',   actions: ['move', 'sprint', 'idle'] },
  { id: 'surf',              route: '/play/surf',          label: 'The Break',      actions: ['move', 'sprint', 'idle'] },
  { id: 'tennis',            route: '/play/tennis',        label: 'Match Point',    actions: ['move', 'shoot', 'idle'] },
  { id: 'threepoint',        route: '/play/threepoint',    label: 'Downtown',       actions: ['move', 'shoot', 'idle'] },
  { id: 'threevthree',       route: '/play/threevthree',   label: '3v3',            actions: ['move', 'sprint', 'shoot', 'pass', 'steal', 'block', 'contest', 'turbo', 'intense', 'screen', 'idle'] },
  { id: 'tiebreak',          route: '/play/tiebreak',      label: 'Tiebreak Blitz', actions: ['move', 'shoot', 'idle'] },
  { id: 'velocitykart',      route: '/play/velocity-kart', label: 'Velocity Kart',  actions: ['move', 'sprint', 'turbo', 'idle'] },
  { id: 'volleyball',        route: '/play/volleyball',    label: 'Beach Rally',    actions: ['move', 'shoot', 'block', 'idle'] },
  { id: 'who_scene_it',      route: '/play/who-scene-it',  label: 'Who Scene It',   actions: ['move', 'shoot', 'idle'] },
];
