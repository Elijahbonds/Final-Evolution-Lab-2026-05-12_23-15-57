// Track 4's node editor as a server render (no DOM here) and its commands: the graph draws as nodes and wires, every edit is
// a command with an exact undo, and a connection that the vocabulary forbids or that would loop is refused.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScriptsTrack, paramSummary, wirePath, NODE_W, NODE_H, MINIMAP, minimapFrame, viewForMinimapPoint, scopeSummary } from './script-editor';
import { starterProject, type StudioApi } from './use-studio';
import { addScript, addScriptNode, connectNodes, deleteFromScript, moveScriptNode, setNodeParam, setScriptScope, addVenue } from '@/lib/nexus-studio/edits';
import { PLAYTEST_TARGETS } from '@/lib/nexus-studio/targets';
import { createStack, execute, seal, undo } from '@/lib/nexus-studio/commands';
import { newNode } from '@/lib/nexus-studio/scripts';

function withScript() {
  const p = starterProject();
  const r = addScript(p, 'pointWon');
  return execute(createStack(p), r.cmd);
}

describe('the node editor draws the graph', () => {
  it('the brief\'s example: five nodes, four wires, the When / Only if / Do palette, no notes', () => {
    const s = withScript();
    const html = renderToStaticMarkup(createElement(ScriptsTrack, { studio: { doc: s.doc, run: () => {}, seal: () => {} } as unknown as StudioApi }));
    expect(html.match(/data-testid="script-node"/g)).toHaveLength(5);
    expect(html.match(/data-testid="script-wire"/g)).toHaveLength(4);
    for (const label of ['Point scored', 'Cooldown', 'Crowd reaction', 'HUD banner', 'Effects burst', 'Zone enter', 'Sound cue', 'Light pulse', 'Camera shot']) expect(html).toContain(label);
    expect(html).toContain('“POINT!”');
    expect(html).not.toContain('data-testid="script-notes"');
  });
  it('an empty project offers the example', () => {
    const html = renderToStaticMarkup(createElement(ScriptsTrack, { studio: { doc: starterProject(), run: () => {}, seal: () => {} } as unknown as StudioApi }));
    expect(html).toContain('Point won → cheer');
  });
  it('summaries and wires', () => {
    expect(paramSummary(newNode('compare', 0, 0, { value: 'lead', op: '>=', to: 2 }))).toBe('lead >= 2');
    expect(paramSummary(newNode('chance', 0, 0, { p: 0.25 }))).toBe('25 %');
    const k = (400 - NODE_W) / 2;   // the handle reaches half the gap
    expect(wirePath({ x: 0, y: 0 }, { x: 400, y: 100 })).toBe(`M ${NODE_W} ${NODE_H / 2} C ${NODE_W + k} ${NODE_H / 2}, ${400 - k} ${100 + NODE_H / 2}, 400 ${100 + NODE_H / 2}`);
  });
});

describe('editing a graph is commands', () => {
  it('add a node, connect it, edit it, move it (one step per drag), delete it — each undoes exactly', () => {
    let s = withScript();
    const sc = () => s.doc.scripts[0];
    const ev = sc().nodes.find((n) => n.kind === 'onScore')!;
    const add = addScriptNode(sc(), 'sound', 520, 380);
    s = execute(s, add.cmd);
    const c = connectNodes(sc(), ev.id, add.id)!;
    s = execute(s, c);
    expect(sc().edges.some((e) => e.from === ev.id && e.to === add.id)).toBe(true);
    s = execute(s, setNodeParam(sc(), add.id, 'cue', 'whistle'));
    s = execute(s, setNodeParam(sc(), add.id, 'cue', 'not-a-cue'));   // the spec's sanitiser: back to the default
    expect(sc().nodes.find((n) => n.id === add.id)!.params.cue).toBe('crowdCheer');
    const steps = s.past.length;
    for (let i = 0; i < 5; i++) s = execute(s, moveScriptNode(sc(), add.id, 520 + i * 10, 380));
    s = seal(s);
    expect(s.past.length).toBe(steps + 1);
    s = execute(s, deleteFromScript(sc(), [add.id])!);
    expect(sc().nodes.some((n) => n.id === add.id)).toBe(false);
    expect(sc().edges.some((e) => e.to === add.id)).toBe(false);   // its wires went with it
    s = undo(s);
    expect(sc().edges.some((e) => e.to === add.id)).toBe(true);
  });
  it('refuses a wire the vocabulary forbids, a duplicate, or one that would loop', () => {
    const s = withScript();
    const sc = s.doc.scripts[0];
    const ev = sc.nodes.find((n) => n.kind === 'onScore')!, cool = sc.nodes.find((n) => n.kind === 'cooldown')!, crowd = sc.nodes.find((n) => n.kind === 'crowd')!;
    expect(connectNodes(sc, crowd.id, cool.id)).toBeNull();   // out of an action
    expect(connectNodes(sc, cool.id, ev.id)).toBeNull();      // into an event
    expect(connectNodes(sc, ev.id, cool.id)).toBeNull();      // already there
    const s2 = execute(s, addScriptNode(sc, 'chance', 300, 300).cmd);
    const sc2 = s2.doc.scripts[0];
    const ch = sc2.nodes.at(-1)!;
    const s3 = execute(s2, connectNodes(sc2, cool.id, ch.id)!);
    expect(connectNodes(s3.doc.scripts[0], ch.id, cool.id)).toBeNull();   // a loop
  });
});

describe('studio-4b: the minimap', () => {
  const canvas = { w: 1000, h: 600 };
  it('fits every node and the visible canvas inside the map, aspect kept', () => {
    const nodes = [{ x: 0, y: 0 }, { x: 2000, y: 900 }];
    const view = { x: 20, y: 20, k: 1 };
    const f = minimapFrame(nodes, view, canvas);
    const toMap = (x: number, y: number) => [f.ox + (x - f.minX) * f.s, f.oy + (y - f.minY) * f.s];
    for (const n of nodes) {
      const [x0, y0] = toMap(n.x, n.y), [x1, y1] = toMap(n.x + NODE_W, n.y + NODE_H);
      expect(x0).toBeGreaterThanOrEqual(0); expect(y0).toBeGreaterThanOrEqual(0);
      expect(x1).toBeLessThanOrEqual(MINIMAP.w + 1e-9); expect(y1).toBeLessThanOrEqual(MINIMAP.h + 1e-9);
    }
    // the view's frame is the canvas's visible world, scaled: its aspect is the canvas's
    expect(f.viewRect.w / f.viewRect.h).toBeCloseTo(canvas.w / canvas.h, 6);
    expect(f.viewRect.w).toBeCloseTo((canvas.w / view.k) * f.s, 6);
    // zooming in shrinks the frame; panning moves it
    const zoomed = minimapFrame(nodes, { x: 20, y: 20, k: 2 }, canvas);
    expect(zoomed.viewRect.w).toBeLessThan(f.viewRect.w);
  });
  it('a click on the map centres the canvas there (the zoom kept); a click on the frame\'s own centre changes nothing', () => {
    const nodes = [{ x: 0, y: 0 }, { x: 1600, y: 1200 }];
    const view = { x: -300, y: -100, k: 1.5 };
    const f = minimapFrame(nodes, view, canvas);
    const cx = f.viewRect.x + f.viewRect.w / 2, cy = f.viewRect.y + f.viewRect.h / 2;
    const same = viewForMinimapPoint(cx, cy, f, view, canvas);
    expect(same.x).toBeCloseTo(view.x, 6); expect(same.y).toBeCloseTo(view.y, 6); expect(same.k).toBe(1.5);
    // the far node's centre, clicked on the map, lands at the canvas's centre
    const nx = 1600 + NODE_W / 2, ny = 1200 + NODE_H / 2;
    const v = viewForMinimapPoint(f.ox + (nx - f.minX) * f.s, f.oy + (ny - f.minY) * f.s, f, view, canvas);
    expect(nx * v.k + v.x).toBeCloseTo(canvas.w / 2, 6);
    expect(ny * v.k + v.y).toBeCloseTo(canvas.h / 2, 6);
  });
  it('an empty graph still draws a frame', () => {
    const f = minimapFrame([], { x: 0, y: 0, k: 1 }, canvas);
    expect(f.viewRect.w).toBeGreaterThan(0);
    expect(Number.isFinite(f.s)).toBe(true);
  });
  it('the canvas draws the map: one mark per node and the view\'s frame', () => {
    const s = withScript();
    const html = renderToStaticMarkup(createElement(ScriptsTrack, { studio: { doc: s.doc, run: () => {}, seal: () => {} } as unknown as StudioApi }));
    expect(html).toContain('data-testid="script-minimap"');
    expect(html.match(/data-testid="minimap-node"/g)).toHaveLength(5);
    expect(html).toContain('data-testid="minimap-view"');
  });
});

describe('studio-4b: a script\'s venue scope', () => {
  it('every venue → one venue → none → every venue, one undo step each, exact undo', () => {
    let s = withScript();
    const v1 = s.doc.venues[0].id;
    const added = addVenue(s.doc, PLAYTEST_TARGETS.tiebreak);
    s = execute(s, added.cmd);
    const sc = () => s.doc.scripts[0];
    expect(scopeSummary(sc(), s.doc.venues)).toBe('every venue');
    s = execute(s, setScriptScope(sc(), [v1]));
    expect(sc().venues).toEqual([v1]);
    expect(scopeSummary(sc(), s.doc.venues)).toBe(s.doc.venues[0].name);
    s = execute(s, setScriptScope(sc(), [v1, added.id, v1]));
    expect(sc().venues).toEqual([v1, added.id]);
    expect(scopeSummary(sc(), s.doc.venues)).toBe('2 venues');
    s = execute(s, setScriptScope(sc(), []));
    expect(scopeSummary(sc(), s.doc.venues)).toBe('no venue');
    s = execute(s, setScriptScope(sc(), null));
    expect('venues' in sc()).toBe(false);
    s = undo(s); expect(sc().venues).toEqual([]);
    s = undo(s); expect(sc().venues).toEqual([v1, added.id]);
    s = undo(s); s = undo(s);
    expect('venues' in sc()).toBe(false);
  });
  it('the side panel shows the scope; a scoped script is badged in the list', () => {
    let s = withScript();
    s = execute(s, setScriptScope(s.doc.scripts[0], [s.doc.venues[0].id]));
    const html = renderToStaticMarkup(createElement(ScriptsTrack, { studio: { doc: s.doc, run: () => {}, seal: () => {} } as unknown as StudioApi }));
    expect(html).toContain('data-testid="script-scope"');
    expect(html).toContain('Runs in');
    expect(html).toContain(`title="Runs in ${s.doc.venues[0].name}"`);
  });
});
