// COACH-AI Phase 8 (2026-10-07): the thread and the athlete's availability line, rendered (no DOM: static markup).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ThreadMessages, UnreadPill } from './thread-messages';
import { AvailabilityLineView } from './my-availability';

const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);

describe('ThreadMessages', () => {
  it('without the read markers: the old bubbles, no "new" edge, no "Seen"', () => {
    const out = html(createElement(ThreadMessages, { thread: [{ id: 'a', body: 'Hi coach', mine: true, fromCoach: false }, { id: 'b', body: 'Hi', mine: false, fromCoach: true }] }));
    expect(out).toContain('Hi coach');
    expect(out).not.toContain('data-unread');
    expect(out).not.toContain('data-seen');
  });

  it('with them: unread messages are marked and "Seen" sits under my newest read message', () => {
    const out = html(createElement(ThreadMessages, { thread: [
      { id: 'a', body: 'Rest today', mine: false, fromCoach: true, readAt: null, unread: true },
      { id: 'b', body: 'Got it', mine: true, fromCoach: false, readAt: '2026-10-07T12:00:00.000Z', unread: false },
    ] }));
    expect(out.match(/data-unread=""/g)?.length).toBe(1);
    expect(out).toContain('data-seen');
  });

  it('UnreadPill: "N new" for a positive count, nothing for null or 0', () => {
    expect(html(createElement(UnreadPill, { n: 2 }))).toContain('2 new');
    expect(html(createElement(UnreadPill, { n: null }))).toBe('');
    expect(html(createElement(UnreadPill, { n: 0 }))).toBe('');
  });
});

describe('AvailabilityLineView (the athlete side)', () => {
  it('Limited / Out show one line; Full and unknown show nothing', () => {
    expect(html(createElement(AvailabilityLineView, { view: { status: 'out', returnBy: '2026-10-20' } }))).toContain('Out — your coach has you off training for now · back Oct 20');
    expect(html(createElement(AvailabilityLineView, { view: { status: 'limited', returnBy: null } }))).toContain('data-my-availability="limited"');
    expect(html(createElement(AvailabilityLineView, { view: { status: 'full', returnBy: null } }))).toBe('');
    expect(html(createElement(AvailabilityLineView, { view: null }))).toBe('');
  });
});
