// Track 4: the script graph as data (scripts.ts) and its interpreter (interpreter.ts), headless.
import { describe, expect, it } from 'vitest';
import { NODE_KINDS, NODE_SPECS, SCRIPT_LIMITS, edgeAllowed, graphNotes, newEdge, newNode, pointWonGraph, sanitizeGraph, sanitizeParams, wouldCycle, type ScriptGraph } from './scripts';
import { ACTIONS_PER_SECOND, createInterpreter, type ScriptAction, type ScriptState } from './interpreter';
import { createStack, execute, undo } from './commands';
import { exportVenue, parseVenueExport } from './exportVenue';
import { everyKindProject } from '@/tests/helpers/nexusStudio';

const S = (o: Partial<ScriptState> = {}): ScriptState => ({ myScore: 0, theirScore: 0, momentum: 0, elapsed: 0, hero: null, ...o });
function run(g: ScriptGraph, rng?: () => number) {
  const got: ScriptAction[] = [];
  const it = createInterpreter([{ id: 's', graph: g }], (a) => got.push(a), rng ? { rng } : {});
  return { it, got, kinds: () => got.map((a) => a.kind) };
}

describe('the vocabulary', () => {
  it('every kind is an event, a condition or an action; actions are presentation only', () => {
    const groups = Object.fromEntries(NODE_KINDS.map((k) => [k, NODE_SPECS[k].group]));
    expect(Object.entries(groups).filter(([, g]) => g === 'action').map(([k]) => k).sort()).toEqual(['banner', 'burst', 'camera', 'crowd', 'lights', 'sound']);
    expect(Object.entries(groups).filter(([, g]) => g === 'condition').map(([k]) => k).sort()).toEqual(['chance', 'compare', 'cooldown']);
    expect(Object.entries(groups).filter(([, g]) => g === 'event').map(([k]) => k).sort()).toEqual(['onModeEnd', 'onModeStart', 'onMomentum', 'onScore', 'onTier', 'onTimer', 'onZone']);
  });
  it('edges run event/condition → condition/action, never into an event or out of an action', () => {
    expect(edgeAllowed('onScore', 'crowd')).toBe(true);
    expect(edgeAllowed('cooldown', 'chance')).toBe(true);
    expect(edgeAllowed('crowd', 'banner')).toBe(false);
    expect(edgeAllowed('compare', 'onScore')).toBe(false);
  });
  it('params are read from the spec: enums, clamped numbers, colours, text as text', () => {
    expect(sanitizeParams('banner', { text: '  <b>GO</b>\u0007  ', tone: 'nope', seconds: 99, extra: 'x' })).toEqual({ text: '<b>GO</b>', tone: 'score', seconds: 6 });
    expect(sanitizeParams('burst', { color: 'red', size: -1 })).toMatchObject({ color: '#00e5ff', size: 0.2 });
    expect(sanitizeParams('banner', { text: 'x'.repeat(100) }).text).toHaveLength(SCRIPT_LIMITS.text);
  });
});

describe('sanitizeGraph: untrusted → a graph that always finishes', () => {
  it('drops unknown kinds and code, dangling and disallowed edges, duplicates and loops; re-mints colliding ids', () => {
    const g = sanitizeGraph({
      enabled: true,
      nodes: [
        { id: 'a', kind: 'onScore', params: { side: 'me' } }, { id: 'b', kind: 'cooldown' }, { id: 'c', kind: 'chance' },
        { id: 'd', kind: 'banner' }, { id: 'a', kind: 'crowd' }, { id: 'x', kind: 'script', code: 'alert(1)' }, { kind: 'eval' },
      ],
      edges: [
        { from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'b' } /* loop */, { from: 'b', to: 'b' } /* self */,
        { from: 'd', to: 'b' } /* out of an action */, { from: 'b', to: 'a' } /* into an event */, { from: 'a', to: 'b' } /* dup */,
        { from: 'a', to: 'ghost' }, { from: 'c', to: 'd' },
      ],
    });
    expect(g.nodes.map((n) => n.kind)).toEqual(['onScore', 'cooldown', 'chance', 'banner', 'crowd']);
    expect(new Set(g.nodes.map((n) => n.id)).size).toBe(5);
    expect(g.edges.map((e) => `${e.from}>${e.to}`)).toEqual(['a>b', 'b>c', 'c>d']);
    expect(JSON.stringify(g)).not.toContain('alert');
  });
  it('caps nodes and edges; a missing `enabled` is on', () => {
    const g = sanitizeGraph({ nodes: Array.from({ length: 200 }, (_, i) => ({ id: `n${i}`, kind: 'crowd' })) });
    expect(g.nodes).toHaveLength(SCRIPT_LIMITS.nodes);
    expect(g.enabled).toBe(true);
    expect(sanitizeGraph({ enabled: false }).enabled).toBe(false);
  });
  it('wouldCycle', () => {
    const edges = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }];
    expect(wouldCycle(edges, 'c', 'a')).toBe(true);
    expect(wouldCycle(edges, 'a', 'c')).toBe(false);
  });
  it('the editor\'s notes: no event, no action, loose ends', () => {
    expect(graphNotes({ enabled: true, nodes: [], edges: [] })).toHaveLength(2);
    expect(graphNotes(pointWonGraph())).toEqual([]);
  });
});

describe('the interpreter', () => {
  it('on a point won → the crowd cheers, a banner, a burst (the brief\'s example); not on the rival\'s point', () => {
    const r = run(pointWonGraph());
    expect(r.it.emit({ type: 'score', side: 'them' }, S())).toBe(0);
    expect(r.it.emit({ type: 'score', side: 'me' }, S({ myScore: 1 }))).toBe(3);
    expect(r.kinds()).toEqual(['crowd', 'banner', 'burst']);
    expect(r.got[1].params).toMatchObject({ text: 'POINT!', tone: 'score' });
  });
  it('cooldown passes once per window on the play clock', () => {
    const r = run(pointWonGraph());
    r.it.emit({ type: 'score', side: 'me' }, S());
    r.it.emit({ type: 'score', side: 'me' }, S());   // inside the 1 s cooldown
    expect(r.got).toHaveLength(3);
    r.it.tick(1.1, S());
    r.it.emit({ type: 'score', side: 'me' }, S());
    expect(r.got).toHaveLength(6);
  });
  it('compare reads the snapshot; chance reads the injected rng', () => {
    const ev = newNode('onScore', 0, 0, { side: 'any' }), cmp = newNode('compare', 0, 0, { value: 'lead', op: '>=', to: 2 }), ch = newNode('chance', 0, 0, { p: 0.5 }), a = newNode('crowd', 0, 0);
    const r = run({ enabled: true, nodes: [ev, cmp, ch, a], edges: [newEdge(ev.id, cmp.id), newEdge(cmp.id, ch.id), newEdge(ch.id, a.id)] }, (() => { const seq = [0.4, 0.9]; let i = 0; return () => seq[i++ % 2]; })());
    r.it.emit({ type: 'score', side: 'me' }, S({ myScore: 3, theirScore: 2 }));   // lead 1: stops at compare
    r.it.emit({ type: 'score', side: 'me' }, S({ myScore: 4, theirScore: 2 }));   // lead 2, rng 0.4 < 0.5: fires
    r.it.emit({ type: 'score', side: 'me' }, S({ myScore: 5, theirScore: 2 }));   // rng 0.9: no
    expect(r.got).toHaveLength(1);
  });
  it('timers: every N seconds, or once', () => {
    const every = newNode('onTimer', 0, 0, { seconds: 2, repeat: 'every' }), once = newNode('onTimer', 0, 0, { seconds: 1, repeat: 'once' });
    const a = newNode('sound', 0, 0), b = newNode('lights', 0, 0);
    const r = run({ enabled: true, nodes: [every, once, a, b], edges: [newEdge(every.id, a.id), newEdge(once.id, b.id)] });
    for (let i = 0; i < 70; i++) r.it.tick(0.1, S());   // 7 s
    expect(r.kinds().filter((k) => k === 'sound')).toHaveLength(3);
    expect(r.kinds().filter((k) => k === 'lights')).toHaveLength(1);
  });
  it('zones fire on entering, not while inside; the action knows the zone', () => {
    const z = newNode('onZone', 0, 0, { x: 4, z: 4, r: 1 }), a = newNode('burst', 0, 0, { at: 'zone' });
    const r = run({ enabled: true, nodes: [z, a], edges: [newEdge(z.id, a.id)] });
    r.it.tick(0.1, S({ hero: [0, 0] }));
    r.it.tick(0.1, S({ hero: [4, 4.5] }));
    r.it.tick(0.1, S({ hero: [4.2, 4] }));
    r.it.tick(0.1, S({ hero: [9, 9] }));
    r.it.tick(0.1, S({ hero: [4, 4] }));
    expect(r.got).toHaveLength(2);
    expect(r.got[0].zone).toEqual([4, 4]);
  });
  it('momentum reports and tier changes (up / down) are heard; mode start and end', () => {
    const m = newNode('onMomentum', 0, 0, { kind: 'chain' }), t = newNode('onTier', 0, 0, { tier: 'on_fire', dir: 'up' }), st = newNode('onModeStart', 0, 0), en = newNode('onModeEnd', 0, 0);
    const acts = [newNode('crowd', 0, 0), newNode('banner', 0, 0), newNode('camera', 0, 0), newNode('sound', 0, 0)];
    const r = run({ enabled: true, nodes: [m, t, st, en, ...acts], edges: [newEdge(m.id, acts[0].id), newEdge(t.id, acts[1].id), newEdge(st.id, acts[2].id), newEdge(en.id, acts[3].id)] });
    r.it.emit({ type: 'momentum', kind: 'blunder' }, S());
    r.it.emit({ type: 'momentum', kind: 'chain' }, S());
    r.it.emit({ type: 'tier', tier: 'on_fire', prev: 'hot' }, S());
    r.it.emit({ type: 'tier', tier: 'hot', prev: 'on_fire' }, S());
    r.it.emit({ type: 'modeStart' }, S());
    r.it.emit({ type: 'modeEnd' }, S());
    expect(r.kinds()).toEqual(['crowd', 'banner', 'camera', 'sound']);
  });
  it('the valve: no more than ACTIONS_PER_SECOND actions in a second; a disabled script does nothing', () => {
    const ev = newNode('onScore', 0, 0, { side: 'any' });
    const acts = Array.from({ length: 6 }, () => newNode('sound', 0, 0));
    const g: ScriptGraph = { enabled: true, nodes: [ev, ...acts], edges: acts.map((a) => newEdge(ev.id, a.id)) };
    const r = run(g);
    r.it.emit({ type: 'score', side: 'me' }, S()); r.it.emit({ type: 'score', side: 'me' }, S());
    expect(r.got).toHaveLength(ACTIONS_PER_SECOND);
    r.it.tick(1, S());
    r.it.emit({ type: 'score', side: 'me' }, S());
    expect(r.got).toHaveLength(ACTIONS_PER_SECOND + 6);
    expect(run({ ...g, enabled: false }).it.emit({ type: 'score', side: 'me' }, S())).toBe(0);
  });
});

describe('scripts in the project and the export', () => {
  it('add / edit / remove a script are commands with exact undo; the export carries enabled scripts, re-sanitised', () => {
    const p = everyKindProject();
    const g = pointWonGraph();
    let s = execute(createStack(p), { label: 'New script', ops: [{ op: 'addScript', script: { id: 'sc1', name: 'Point won', ...g } }] });
    s = execute(s, { label: 'Move', ops: [{ op: 'patchScript', id: 'sc1', patch: { nodes: g.nodes.map((n) => ({ ...n, x: n.x + 10 })) } }] });
    expect(s.doc.scripts[0].nodes[0].x).toBe(g.nodes[0].x + 10);
    s = undo(s);
    expect(s.doc.scripts[0].nodes).toEqual(g.nodes);
    s = undo(s);
    expect(s.doc.scripts).toEqual([]);
    const exp = exportVenue(p.venues[0], null, [{ id: 'sc1', name: 'Point won', ...g }, { id: 'off', name: 'Off', ...g, enabled: false }]);
    expect(exp.scripts?.map((x) => x.id)).toEqual(['sc1']);
    const back = parseVenueExport(JSON.stringify({ ...exp, scripts: [...exp.scripts!, { id: 'evil', nodes: [{ id: 'n', kind: 'exec', params: { code: 'x' } }], edges: [] }] }));
    expect(back?.scripts?.map((x) => x.id)).toEqual(['sc1']);
    expect(back?.scripts?.[0].edges).toHaveLength(4);
  });
});
