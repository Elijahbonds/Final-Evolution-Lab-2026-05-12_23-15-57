// TRACK 4, VISUAL SCRIPTING (docs/NEXUS-STUDIO.md §3): event → condition → action graphs, as DATA in the project document.
// A graph is nodes (each one of a closed set of kinds, with typed parameters) and edges (event → condition | action,
// condition → condition | action). The interpreter (interpreter.ts) walks it; the host (scriptHost.ts) feeds it the mode's
// events and turns its actions into presentation calls.
//
// WHAT A SCRIPT CAN NEVER DO, by construction: run code (there is no code node, no expression, no string that is ever
// evaluated — a banner's text is shown as text), or touch scoring, timing, pay or a tuned number (every action is
// presentation: a crowd reaction, a particle burst, a HUD banner, a camera shot, a light pulse, a sound). Its EVENTS only
// listen (the momentum meter's read-only listeners, the HUD the mode already posts, the phase, a clock, the hero's spot).
//
// Pure: no Babylon, no DOM. Untrusted JSON goes through `sanitizeScript` (the import path and the mode's side both call it).

import { clampNum, newId } from './doc';

export const SCRIPT_LIMITS = { nodes: 64, edges: 128, text: 40, depth: 12 } as const;

export type ParamValue = string | number | boolean;
export type ParamSpec =
  | { key: string; label: string; type: 'enum'; options: readonly string[]; dflt: string }
  | { key: string; label: string; type: 'number'; min: number; max: number; step: number; dflt: number }
  | { key: string; label: string; type: 'text'; max: number; dflt: string }
  | { key: string; label: string; type: 'color'; dflt: string };

export type NodeGroup = 'event' | 'condition' | 'action';

/** momentum kinds a mode can report (core/MomentumBus MomentumEvent['kind']); 'any' listens to all. */
const MOMENTUM_KINDS = ['any', 'clean_hit', 'chain', 'near_miss', 'overtake', 'clean_run', 'blunder', 'big_make', 'block', 'steal', 'miss', 'turnover', 'posterize', 'ankle_break', 'highlight_dunk'] as const;
const TIERS = ['any', 'cold', 'warming', 'hot', 'on_fire'] as const;
/** visual/crowd ReactionKind */
export const CROWD_REACTIONS = ['cheer', 'groan', 'stand', 'finish'] as const;
/** visual/EffectsKit BurstKind */
export const BURST_KINDS = ['confetti', 'sparks', 'dust', 'net', 'glitch'] as const;
/** components/games/tv-hud HudTone */
export const BANNER_TONES = ['score', 'you', 'good', 'danger', 'heat', 'power', 'info'] as const;
/** scene/broadcastShots IntroKind, plus the mode's replay (ctx.highlight) */
export const CAMERA_SHOTS = ['establish', 'walkIn', 'replay'] as const;
/** audio/SoundKit SfxName — the cues a creator may fire (no engine or UI loops) */
export const SOUND_CUES = ['crowdCheer', 'crowdGroan', 'whistle', 'score', 'powerUp', 'swish', 'uiTick'] as const;
const AT = ['hero', 'subject', 'zone'] as const;

export const NODE_SPECS = {
  // events
  onScore: { group: 'event', label: 'Point scored', hint: 'A side\'s score goes up (read off the HUD the mode posts).', params: [{ key: 'side', label: 'Side', type: 'enum', options: ['me', 'them', 'any'], dflt: 'me' }] },
  onMomentum: { group: 'event', label: 'Momentum report', hint: 'The mode reports a play to the momentum meter (listen only).', params: [{ key: 'kind', label: 'Play', type: 'enum', options: MOMENTUM_KINDS, dflt: 'any' }] },
  onTier: { group: 'event', label: 'Momentum tier', hint: 'The meter crosses into a tier.', params: [{ key: 'tier', label: 'Tier', type: 'enum', options: TIERS, dflt: 'on_fire' }, { key: 'dir', label: 'Direction', type: 'enum', options: ['up', 'down', 'any'], dflt: 'up' }] },
  onModeStart: { group: 'event', label: 'Play starts', hint: 'READY becomes playing.', params: [] },
  onModeEnd: { group: 'event', label: 'Play ends', hint: 'The mode ends its session.', params: [] },
  onTimer: { group: 'event', label: 'Timer', hint: 'Every N seconds of play (or once, after N).', params: [{ key: 'seconds', label: 'Seconds', type: 'number', min: 0.5, max: 600, step: 0.5, dflt: 10 }, { key: 'repeat', label: 'Repeat', type: 'enum', options: ['every', 'once'], dflt: 'every' }] },
  // studio-4b: two more events, each read off data a mode ALREADY puts out (nothing new is asked of a mode): the rally count a
  // rallying mode posts on its HUD (TiebreakMode hud() `rally`), and the mode's own broadcast replay (ctx.highlight, which a
  // replaying mode calls — Football Rush after a touchdown). The host hears both without changing either (scriptHost.ts).
  onRally: { group: 'event', label: 'Rally length', hint: 'The rally reaches this many returns (read off the HUD a rallying mode posts: Tiebreak).', params: [{ key: 'length', label: 'Returns', type: 'number', min: 1, max: 99, step: 1, dflt: 5 }] },
  onReplay: { group: 'event', label: 'Replay', hint: 'The mode\'s own broadcast replay starts or ends (a mode that replays: Football Rush\'s touchdown).', params: [{ key: 'when', label: 'When', type: 'enum', options: ['ends', 'starts'], dflt: 'ends' }] },
  onZone: { group: 'event', label: 'Zone enter', hint: 'The hero steps into a circle on the ground.', params: [{ key: 'x', label: 'Centre x', type: 'number', min: -80, max: 80, step: 0.5, dflt: 0 }, { key: 'z', label: 'Centre z', type: 'number', min: -80, max: 80, step: 0.5, dflt: 0 }, { key: 'r', label: 'Radius', type: 'number', min: 0.5, max: 30, step: 0.5, dflt: 2 }] },
  // conditions
  compare: { group: 'condition', label: 'Compare', hint: 'Pass when a value compares true.', params: [{ key: 'value', label: 'Value', type: 'enum', options: ['myScore', 'theirScore', 'lead', 'momentum', 'elapsed', 'fires', 'rally'], dflt: 'lead' }, { key: 'op', label: 'Is', type: 'enum', options: ['>', '>=', '==', '<=', '<'], dflt: '>=' }, { key: 'to', label: 'Than', type: 'number', min: -999, max: 999, step: 1, dflt: 1 }] },
  cooldown: { group: 'condition', label: 'Cooldown', hint: 'Pass at most once every N seconds.', params: [{ key: 'seconds', label: 'Seconds', type: 'number', min: 0.1, max: 600, step: 0.5, dflt: 3 }] },
  chance: { group: 'condition', label: 'Chance', hint: 'Pass this often (0–1).', params: [{ key: 'p', label: 'Chance', type: 'number', min: 0, max: 1, step: 0.05, dflt: 0.5 }] },
  // actions (presentation only)
  crowd: { group: 'action', label: 'Crowd reaction', hint: 'The crowd cheers, groans, stands or applauds.', params: [{ key: 'reaction', label: 'Reaction', type: 'enum', options: CROWD_REACTIONS, dflt: 'cheer' }, { key: 'strength', label: 'Strength', type: 'number', min: 0.1, max: 1, step: 0.1, dflt: 1 }] },
  burst: { group: 'action', label: 'Effects burst', hint: 'EffectsKit particles (skipped under reduced motion).', params: [{ key: 'kind', label: 'Burst', type: 'enum', options: BURST_KINDS, dflt: 'confetti' }, { key: 'at', label: 'At', type: 'enum', options: AT, dflt: 'hero' }, { key: 'color', label: 'Tint', type: 'color', dflt: '#00e5ff' }, { key: 'size', label: 'Size', type: 'number', min: 0.2, max: 3, step: 0.1, dflt: 1 }] },
  banner: { group: 'action', label: 'HUD banner', hint: 'A TV-HUD banner call (HudBanner) for a moment.', params: [{ key: 'text', label: 'Text', type: 'text', max: SCRIPT_LIMITS.text, dflt: 'WHAT A POINT!' }, { key: 'tone', label: 'Tone', type: 'enum', options: BANNER_TONES, dflt: 'score' }, { key: 'seconds', label: 'Seconds', type: 'number', min: 0.5, max: 6, step: 0.5, dflt: 1.8 }] },
  camera: { group: 'action', label: 'Camera shot', hint: 'The broadcast director\'s crane / walk-in, or the mode\'s replay (where it replays). Never under reduced motion.', params: [{ key: 'shot', label: 'Shot', type: 'enum', options: CAMERA_SHOTS, dflt: 'establish' }] },
  lights: { group: 'action', label: 'Light pulse', hint: 'The venue\'s Studio fixtures flare (skipped under reduced motion).', params: [{ key: 'color', label: 'Colour', type: 'color', dflt: '#ffffff' }, { key: 'seconds', label: 'Seconds', type: 'number', min: 0.2, max: 3, step: 0.1, dflt: 0.6 }] },
  sound: { group: 'action', label: 'Sound cue', hint: 'A SoundKit cue (on the SFX bus, so the player\'s volume rules it).', params: [{ key: 'cue', label: 'Cue', type: 'enum', options: SOUND_CUES, dflt: 'crowdCheer' }, { key: 'volume', label: 'Volume', type: 'number', min: 0.05, max: 1, step: 0.05, dflt: 0.6 }] },
} as const satisfies Record<string, { group: NodeGroup; label: string; hint: string; params: readonly ParamSpec[] }>;

export type NodeKind = keyof typeof NODE_SPECS;
export const NODE_KINDS = Object.keys(NODE_SPECS) as NodeKind[];
export const groupOf = (k: NodeKind): NodeGroup => NODE_SPECS[k].group;

export interface ScriptNode { id: string; kind: NodeKind; x: number; y: number; params: Record<string, ParamValue> }
export interface ScriptEdge { id: string; from: string; to: string }
export interface ScriptGraph { enabled: boolean; nodes: ScriptNode[]; edges: ScriptEdge[] }

/** Which way an edge may run: from an event or a condition, into a condition or an action. */
export function edgeAllowed(from: NodeKind, to: NodeKind): boolean {
  return groupOf(from) !== 'action' && groupOf(to) !== 'event';
}

// ── constructors ────────────────────────────────────────────────────────────────────────────────────────────────────

export function defaultParams(kind: NodeKind): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const p of NODE_SPECS[kind].params as readonly ParamSpec[]) out[p.key] = p.dflt;
  return out;
}

export function newNode(kind: NodeKind, x: number, y: number, params: Record<string, ParamValue> = {}): ScriptNode {
  return { id: newId('node'), kind, x, y, params: sanitizeParams(kind, { ...defaultParams(kind), ...params }) };
}

export function newEdge(from: string, to: string): ScriptEdge { return { id: newId('edge'), from, to }; }

// ── sanitize ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[A-Za-z0-9_:-]{1,64}$/;
type Json = Record<string, unknown>;
const isObj = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x);
const own = (o: Json, k: string): unknown => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);

/** A node's parameters, read field by field from its kind's spec: anything else is dropped; text is text. */
export function sanitizeParams(kind: NodeKind, raw: unknown): Record<string, ParamValue> {
  const src = isObj(raw) ? raw : {};
  const out: Record<string, ParamValue> = {};
  for (const p of NODE_SPECS[kind].params as readonly ParamSpec[]) {
    const v = own(src, p.key);
    switch (p.type) {
      case 'enum': out[p.key] = typeof v === 'string' && p.options.includes(v) ? v : p.dflt; break;
      case 'number': out[p.key] = clampNum(v, p.min, p.max, p.dflt); break;
      case 'color': out[p.key] = typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : p.dflt; break;
      case 'text': {
        const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, p.max) : '';
        out[p.key] = s || p.dflt;
        break;
      }
    }
  }
  return out;
}

/** True if adding from → to would close a loop (the graph must stay acyclic: a script always finishes). */
export function wouldCycle(edges: readonly Pick<ScriptEdge, 'from' | 'to'>[], from: string, to: string): boolean {
  if (from === to) return true;
  const next = new Map<string, string[]>();
  for (const e of edges) { const l = next.get(e.from) ?? []; l.push(e.to); next.set(e.from, l); }
  const stack = [to]; const seen = new Set<string>();
  while (stack.length) {
    const n = stack.pop()!;
    if (n === from) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const m of next.get(n) ?? []) stack.push(m);
  }
  return false;
}

/** Untrusted → a graph: known kinds only, params per spec, ids re-minted on collision, edges that are allowed, unique,
 *  between nodes that exist, and never closing a loop. */
export function sanitizeGraph(raw: unknown): ScriptGraph {
  const src = isObj(raw) ? raw : {};
  const seen = new Set<string>();
  const remap = new Map<string, string>();
  const nodes: ScriptNode[] = [];
  for (const n of Array.isArray(own(src, 'nodes')) ? (own(src, 'nodes') as unknown[]) : []) {
    if (nodes.length >= SCRIPT_LIMITS.nodes) break;
    if (!isObj(n)) continue;
    const kind = own(n, 'kind');
    if (typeof kind !== 'string' || !(NODE_KINDS as string[]).includes(kind)) continue;
    const rawId = own(n, 'id');
    let id = typeof rawId === 'string' && ID.test(rawId) && !seen.has(rawId) ? rawId : newId('node');
    while (seen.has(id)) id = newId('node');
    seen.add(id);
    if (typeof rawId === 'string' && !remap.has(rawId)) remap.set(rawId, id);
    nodes.push({ id, kind: kind as NodeKind, x: clampNum(own(n, 'x'), -5000, 5000, 0), y: clampNum(own(n, 'y'), -5000, 5000, 0), params: sanitizeParams(kind as NodeKind, own(n, 'params')) });
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: ScriptEdge[] = [];
  const edgeIds = new Set<string>();
  for (const e of Array.isArray(own(src, 'edges')) ? (own(src, 'edges') as unknown[]) : []) {
    if (edges.length >= SCRIPT_LIMITS.edges) break;
    if (!isObj(e)) continue;
    const from = remap.get(String(own(e, 'from'))), to = remap.get(String(own(e, 'to')));
    const a = from ? byId.get(from) : undefined, b = to ? byId.get(to) : undefined;
    if (!a || !b || !edgeAllowed(a.kind, b.kind)) continue;
    if (edges.some((x) => x.from === a.id && x.to === b.id) || wouldCycle(edges, a.id, b.id)) continue;
    const rawId = own(e, 'id');
    let id = typeof rawId === 'string' && ID.test(rawId) && !edgeIds.has(rawId) && !seen.has(rawId) ? rawId : newId('edge');
    while (edgeIds.has(id)) id = newId('edge');
    edgeIds.add(id);
    edges.push({ id, from: a.id, to: b.id });
  }
  return { enabled: own(src, 'enabled') !== false, nodes, edges };
}

/** What the editor flags about a graph (nothing here blocks a save: an incomplete graph simply does nothing). */
export function graphNotes(g: ScriptGraph): string[] {
  const notes: string[] = [];
  const into = new Set(g.edges.map((e) => e.to)), out = new Set(g.edges.map((e) => e.from));
  if (!g.nodes.some((n) => groupOf(n.kind) === 'event')) notes.push('No event: add one (Point scored, Timer, …) so the script can start.');
  if (!g.nodes.some((n) => groupOf(n.kind) === 'action')) notes.push('No action: add one (Crowd reaction, HUD banner, …) so the script does something.');
  for (const n of g.nodes) {
    const grp = groupOf(n.kind);
    if (grp !== 'event' && !into.has(n.id)) notes.push(`${NODE_SPECS[n.kind].label} is not connected to anything before it.`);
    if (grp !== 'action' && !out.has(n.id)) notes.push(`${NODE_SPECS[n.kind].label} leads nowhere.`);
  }
  return notes;
}

// ── per-venue scope (studio-4b) ─────────────────────────────────────────────────────────────────────────────────────

/** Does a script run in this venue? No `venues` list: every venue. A list: only those (an empty list: none). */
export function scriptRunsIn(s: { venues?: readonly string[] }, venueId: string): boolean {
  return !s.venues || s.venues.includes(venueId);
}

/** The scripts a venue's play-test carries: the ones whose scope includes it (exportVenue then keeps the enabled ones). */
export function scriptsForVenue<T extends { venues?: readonly string[] }>(scripts: readonly T[], venueId: string): T[] {
  return scripts.filter((s) => scriptRunsIn(s, venueId));
}

/** The example the brief names, built the editor's way: on a point won → the crowd cheers + a banner (+ a burst, cooled). */
export function pointWonGraph(): ScriptGraph {
  const ev = newNode('onScore', 40, 120, { side: 'me' });
  const cool = newNode('cooldown', 280, 120, { seconds: 1 });
  const crowd = newNode('crowd', 520, 40, { reaction: 'cheer', strength: 1 });
  const banner = newNode('banner', 520, 150, { text: 'POINT!', tone: 'score', seconds: 1.8 });
  const burst = newNode('burst', 520, 260, { kind: 'confetti', at: 'hero', color: '#00e5ff', size: 1 });
  return { enabled: true, nodes: [ev, cool, crowd, banner, burst], edges: [newEdge(ev.id, cool.id), newEdge(cool.id, crowd.id), newEdge(cool.id, banner.id), newEdge(cool.id, burst.id)] };
}
