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
  { id: 'dunk',        route: '/play/dunk',        label: 'Dunk Contest',   actions: ['move', 'sprint', 'dunk', 'shoot', 'idle'] },
  { id: 'onevone',     route: '/play/onevone',     label: '1v1 Hoops',      actions: ['move', 'sprint', 'shoot', 'steal', 'idle'] },
  { id: 'threevthree', route: '/play/threevthree', label: '3v3',            actions: ['move', 'sprint', 'shoot', 'pass', 'steal', 'idle'] },
  { id: 'karate',      route: '/play/karate',      label: 'Karate Endless', actions: ['move', 'guard', 'strike', 'idle'] },
  { id: 'carnival',    route: '/play/carnival',    label: 'Carnival',       actions: ['move', 'shoot', 'idle'] },
];
