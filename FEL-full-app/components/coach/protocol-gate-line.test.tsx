// The protocol gate's lines, rendered (MIRROR-COACH P8, 2026-09-29). The rule and its words are lib/coach/protocolGate.ts
// (tested there); this pins the drawing: Today's swap line with its link, the held list, and the program builder's line
// under a gated item for this client — and that the builder asks for the lines again when a slot's exercise changes.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CoachGateLine, GateHeldList, GateSwapLine } from './protocol-gate-line';
import { ProgramBuilder, gateSignature } from './program-builder';
import { COACH_OPEN_YOUTH_LINE, LANDING_CHECK_HREF, PROTOCOL_WHY, heldLine, swappedLine, type CoachGateView } from '@/lib/coach/protocolGate';
import type { ProgramTree, TreeExercise } from '@/lib/coach/loop';

const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');

describe("Today's lines", () => {
  it('a swapped item: the one line, and a link when the why has somewhere to go', () => {
    const line = swappedLine('Depth Drop to Vertical', PROTOCOL_WHY.landing_never);
    const html = renderToStaticMarkup(createElement(GateSwapLine, { note: { from: { id: 'pe-drop', name: 'Depth Drop to Vertical' }, line, href: LANDING_CHECK_HREF, reason: 'landing_never' } }));
    expect(html).toContain('data-protocol-gate="landing_never"');
    expect(text(html)).toContain(line);
    expect(html).toContain(`href="${LANDING_CHECK_HREF}"`);
    expect(text(html)).toContain('Take the jump test');
  });
  it('…and no link when there is nowhere to go (the youth rule waits on the coach)', () => {
    const html = renderToStaticMarkup(createElement(GateSwapLine, { note: { from: { id: 'x', name: 'Pogo hops' }, line: swappedLine('Pogo hops', PROTOCOL_WHY.minor), href: null, reason: 'minor' } }));
    expect(html).not.toContain('href=');
  });
  it('held items, one line each; none, nothing at all', () => {
    const items = [{ id: 'se-1', name: 'Pogo hops', line: heldLine('Pogo hops', PROTOCOL_WHY.pain_today), href: null, reason: 'pain_today' }];
    const html = renderToStaticMarkup(createElement(GateHeldList, { items }));
    expect(html).toContain('data-held="se-1"');
    expect(text(html)).toContain(items[0].line);
    expect(renderToStaticMarkup(createElement(GateHeldList, { items: [] }))).toBe('');
  });
});

describe("the program builder's line under a gated item", () => {
  const ex = (id: string, exerciseId: string, name: string): TreeExercise => ({
    id, order: 1, exerciseId, name, sets: 3, reps: '5', load: 'body', tempo: '3-1-1-0', restSeconds: 90, coachNote: null,
    section: 'key', isKeySet: false, supersetGroup: null, workSeconds: null, holdSeconds: null, setupCues: [], effortBand: null,
  });
  const tree = (items: TreeExercise[]): ProgramTree => ({
    id: 'p1', name: 'Power', coachId: 'coach-1', clientId: 'c1',
    blocks: [{ id: 'b1', order: 1, label: 'Week 1', targetDate: null, sessions: [{ id: 's1', order: 1, label: 'Day 1', exercises: items }] }],
  });
  const t = tree([ex('se-drop', 'pe-drop', 'Depth Drop to Vertical'), ex('se-sq', 'pe-sq', 'Goblet Squat')]);
  const swap: CoachGateView = { state: 'swap', line: 'For this client today, Today shows Box Squat instead: no landing check in the last 4 weeks.', to: { id: 'pe-box', name: 'Box Squat' } };

  it('draws the server\'s line under that item only', () => {
    const html = renderToStaticMarkup(createElement(ProgramBuilder, {
      tree: t, completedSessionIds: [], catalogue: [], onTree: () => {}, gatesEndpoint: null, initialGates: { 'se-drop': swap },
    }));
    expect(html.match(/data-coach-gate=/g)).toHaveLength(1);
    expect(html).toContain('data-coach-gate="swap"');
    expect(text(html)).toContain(swap.line);
  });
  it('an open youth line reads as open', () => {
    const html = renderToStaticMarkup(createElement(CoachGateLine, { gate: { state: 'open_youth', line: COACH_OPEN_YOUTH_LINE, to: null } }));
    expect(html).toContain('data-coach-gate="open_youth"');
    expect(text(html)).toContain('because you assigned it');
  });
  it('asks the server again when a slot changes exercise, and not otherwise', () => {
    const same = tree([ex('se-drop', 'pe-drop', 'Depth Drop to Vertical'), ex('se-sq', 'pe-sq', 'Goblet Squat')]);
    const changed = tree([ex('se-drop', 'pe-box', 'Box Squat'), ex('se-sq', 'pe-sq', 'Goblet Squat')]);
    expect(gateSignature(same)).toBe(gateSignature(t));
    expect(gateSignature(changed)).not.toBe(gateSignature(t));
  });
});
