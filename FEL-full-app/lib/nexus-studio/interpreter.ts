// THE SCRIPT INTERPRETER (track 4): walks the project's event → condition → action graphs (scripts.ts) when the host says
// something happened, and hands each action that fires to a SINK as data. That is all it does.
//
// WHAT IT CANNOT DO, by construction (interpreter.wiring.test.ts reads this file and its imports): it imports nothing but
// the script vocabulary — no harness, no scoring, no session, no wallet, no momentum writer, no Babylon, no audio — and it has
// no way to run anything but its own switch over a closed set of node kinds: no eval, no Function, no dynamic import. The
// numbers it reads (the scores, the momentum, the clock) are handed IN by the host as a read-only snapshot; nothing it
// returns can reach a score, a timer, a payout or a tuned number. Every action it emits is presentation (scripts.ts).
//
// SAFETY VALVES: a graph is acyclic (sanitizeGraph) and the walk is depth-capped anyway; a burst of events cannot fire more
// than ACTIONS_PER_SECOND actions (a creator's timer at 0.5 s into ten banners is a wall of noise, not a show).

import { NODE_SPECS, SCRIPT_LIMITS, groupOf, type NodeKind, type ParamValue, type ScriptGraph, type ScriptNode } from './scripts';

export const ACTIONS_PER_SECOND = 8;

/** What the host knows when it asks (read-only numbers the mode already shows). */
export interface ScriptState {
  myScore: number;
  theirScore: number;
  /** the momentum meter, 0..100 */
  momentum: number;
  /** seconds of play */
  elapsed: number;
  /** the hero's ground position, or null */
  hero: readonly [number, number] | null;
  /** the rally's length as the mode posts it (0 where the mode does not rally) */
  rally?: number;
}

export type ScriptEvent =
  | { type: 'score'; side: 'me' | 'them' }
  | { type: 'momentum'; kind: string }
  | { type: 'tier'; tier: string; prev: string }
  | { type: 'modeStart' }
  | { type: 'modeEnd' }
  /** the rally count the mode posts went from `prev` to `length` */
  | { type: 'rally'; length: number; prev: number }
  /** the mode's own broadcast replay started or ended */
  | { type: 'replay'; phase: 'starts' | 'ends' };

export interface ScriptAction {
  kind: Extract<NodeKind, 'crowd' | 'burst' | 'banner' | 'camera' | 'lights' | 'sound'>;
  params: Readonly<Record<string, ParamValue>>;
  scriptId: string;
  nodeId: string;
  /** the zone's centre, when the event that fired it was a zone (a burst `at: 'zone'`) */
  zone?: readonly [number, number];
}

export interface RunnableScript { id: string; graph: ScriptGraph }

const TIER_ORDER = ['cold', 'warming', 'hot', 'on_fire'];

export interface Interpreter {
  emit(e: ScriptEvent, s: ScriptState): number;
  /** Advance the clock (play time only): timers and zones fire here. Returns the actions fired. */
  tick(dt: number, s: ScriptState): number;
  /** How many times each event node has fired (the `fires` compare value), for probes and tests. */
  fires(nodeId: string): number;
}

export function createInterpreter(scripts: readonly RunnableScript[], sink: (a: ScriptAction) => void, opts: { rng?: () => number } = {}): Interpreter {
  const rng = opts.rng ?? Math.random;
  const live = scripts.filter((s) => s.graph.enabled);
  const out = new Map<string, string[]>();
  const nodeById = new Map<string, { node: ScriptNode; scriptId: string }>();
  for (const s of live) {
    for (const n of s.graph.nodes) nodeById.set(n.id, { node: n, scriptId: s.id });
    for (const e of s.graph.edges) { const l = out.get(e.from) ?? []; l.push(e.to); out.set(e.from, l); }
  }
  let clock = 0;
  const lastPass = new Map<string, number>();   // cooldown nodes
  const fireCount = new Map<string, number>();  // event nodes
  const timerAcc = new Map<string, number>();
  const timerDone = new Set<string>();
  const inZone = new Map<string, boolean>();
  const budget: number[] = [];                  // the clock times of the last actions (the valve)

  const num = (v: ParamValue | undefined, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const value = (key: ParamValue | undefined, s: ScriptState, fires: number): number => {
    switch (key) {
      case 'myScore': return s.myScore;
      case 'theirScore': return s.theirScore;
      case 'lead': return s.myScore - s.theirScore;
      case 'momentum': return s.momentum;
      case 'elapsed': return s.elapsed;
      case 'fires': return fires;
      case 'rally': return s.rally ?? 0;
      default: return 0;
    }
  };
  const compare = (a: number, op: ParamValue | undefined, b: number): boolean => {
    switch (op) {
      case '>': return a > b;
      case '>=': return a >= b;
      case '==': return Math.abs(a - b) < 1e-9;
      case '<=': return a <= b;
      case '<': return a < b;
      default: return false;
    }
  };
  const passes = (n: ScriptNode, s: ScriptState, fires: number): boolean => {
    switch (n.kind) {
      case 'compare': return compare(value(n.params.value, s, fires), n.params.op, num(n.params.to));
      case 'cooldown': {
        const last = lastPass.get(n.id);
        if (last !== undefined && clock - last < num(n.params.seconds, 1)) return false;
        lastPass.set(n.id, clock);
        return true;
      }
      case 'chance': return rng() < num(n.params.p, 0);
      default: return false;
    }
  };

  /** Walk from an event node: conditions gate, actions go to the sink. Depth-capped; each node once per walk. */
  const run = (eventId: string, s: ScriptState, zone?: readonly [number, number]): number => {
    const ev = nodeById.get(eventId);
    if (!ev) return 0;
    const fires = (fireCount.get(eventId) ?? 0) + 1;
    fireCount.set(eventId, fires);
    let fired = 0;
    const seen = new Set<string>();
    const walk = (id: string, depth: number): void => {
      if (depth > SCRIPT_LIMITS.depth) return;
      for (const nextId of out.get(id) ?? []) {
        if (seen.has(nextId)) continue;
        seen.add(nextId);
        const next = nodeById.get(nextId);
        if (!next) continue;
        const grp = groupOf(next.node.kind);
        if (grp === 'condition') { if (passes(next.node, s, fires)) walk(nextId, depth + 1); continue; }
        if (grp !== 'action') continue;
        while (budget.length && clock - budget[0] >= 1) budget.shift();
        if (budget.length >= ACTIONS_PER_SECOND) continue;
        budget.push(clock);
        sink({ kind: next.node.kind as ScriptAction['kind'], params: { ...next.node.params }, scriptId: next.scriptId, nodeId: nextId, ...(zone ? { zone } : {}) });
        fired++;
      }
    };
    walk(eventId, 0);
    return fired;
  };

  const eventNodes = (kind: NodeKind): ScriptNode[] => {
    const list: ScriptNode[] = [];
    for (const { node } of nodeById.values()) if (node.kind === kind) list.push(node);
    return list;
  };

  return {
    emit(e, s) {
      let n = 0;
      switch (e.type) {
        case 'score':
          for (const node of eventNodes('onScore')) if (node.params.side === 'any' || node.params.side === e.side) n += run(node.id, s);
          break;
        case 'momentum':
          for (const node of eventNodes('onMomentum')) if (node.params.kind === 'any' || node.params.kind === e.kind) n += run(node.id, s);
          break;
        case 'tier': {
          const up = TIER_ORDER.indexOf(e.tier) > TIER_ORDER.indexOf(e.prev);
          for (const node of eventNodes('onTier')) {
            const tierOk = node.params.tier === 'any' || node.params.tier === e.tier;
            const dirOk = node.params.dir === 'any' || (node.params.dir === 'up') === up;
            if (tierOk && dirOk) n += run(node.id, s);
          }
          break;
        }
        case 'modeStart': for (const node of eventNodes('onModeStart')) n += run(node.id, s); break;
        case 'modeEnd': for (const node of eventNodes('onModeEnd')) n += run(node.id, s); break;
        case 'rally':
          // fires once as the count CROSSES the node's length (a rally that reaches 5 fires "5" once; the next rally may again)
          for (const node of eventNodes('onRally')) { const at = num(node.params.length, 5); if (e.prev < at && e.length >= at) n += run(node.id, s); }
          break;
        case 'replay': for (const node of eventNodes('onReplay')) if (node.params.when === e.phase) n += run(node.id, s); break;
      }
      return n;
    },
    tick(dt, s) {
      const step = Number.isFinite(dt) ? Math.min(1, Math.max(0, dt)) : 0;
      clock += step;
      let n = 0;
      for (const node of eventNodes('onTimer')) {
        if (timerDone.has(node.id)) continue;
        const every = num(node.params.seconds, 10);
        const acc = (timerAcc.get(node.id) ?? 0) + step;
        if (acc >= every) {
          timerAcc.set(node.id, node.params.repeat === 'once' ? acc : acc - every);
          if (node.params.repeat === 'once') timerDone.add(node.id);
          n += run(node.id, s);
        } else timerAcc.set(node.id, acc);
      }
      if (s.hero) {
        for (const node of eventNodes('onZone')) {
          const dx = s.hero[0] - num(node.params.x), dz = s.hero[1] - num(node.params.z);
          const inside = dx * dx + dz * dz <= num(node.params.r, 1) ** 2;
          if (inside && !inZone.get(node.id)) n += run(node.id, s, [num(node.params.x), num(node.params.z)]);
          inZone.set(node.id, inside);
        }
      }
      return n;
    },
    fires: (id) => fireCount.get(id) ?? 0,
  };
}

/** The label a node's kind shows (for the host's console line). */
export const nodeLabel = (k: NodeKind): string => NODE_SPECS[k].label;
