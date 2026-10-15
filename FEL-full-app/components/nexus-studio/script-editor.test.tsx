// Track 4's node editor as a server render (no DOM here) and its commands: the graph draws as nodes and wires, every edit is
// a command with an exact undo, and a connection that the vocabulary forbids or that would loop is refused.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScriptsTrack, paramSummary, wirePath, NODE_W, NODE_H } from './script-editor';
import { starterProject, type StudioApi } from './use-studio';
import { addScript, addScriptNode, connectNodes, deleteFromScript, moveScriptNode, setNodeParam } from '@/lib/nexus-studio/edits';
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
