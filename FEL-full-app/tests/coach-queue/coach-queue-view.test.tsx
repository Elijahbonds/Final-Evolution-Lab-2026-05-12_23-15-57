// PLATFORM PHASE 5: the queue screen's words — at most two buttons a card, "All clear" when there is nothing, and a source
// waiting on the owner's SQL said on ONE line ("turns on when the owner finishes setup"), never "not set up yet".
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CoachQueue } from '@/components/coach/coach-queue/coach-queue';
import { buildQueue } from '@/lib/coach/queue';

const NOW = Date.parse('2026-10-27T15:00:00Z');
const items = buildQueue({
  pain: [{ clientId: 'a', name: 'Ada Lovelace', view: { present: true, detailed: false, label: 'Client paused an exercise' } }],
  joins: [{ athleteId: 'j', name: 'Jay Kim', joinedAt: NOW, hasProgram: false }],
}, { now: NOW, programOf: (id) => (id === 'a' ? 'p-a' : null), adult: () => true });
const html = (props: Partial<Parameters<typeof CoachQueue>[0]>) => renderToStaticMarkup(createElement(CoachQueue, { items, dark: [], onOpen: () => {}, ...props }));

describe('the queue screen', () => {
  it('one card per item, the athlete and one line, at most two buttons each', () => {
    const out = html({});
    expect(out.match(/data-queue-card=/g)).toHaveLength(2);
    expect(out).toContain('Ada Lovelace');
    expect(out).toContain('Client paused an exercise');
    for (const card of out.split('data-queue-card=').slice(1)) expect((card.split('</li>')[0].match(/data-queue-action=/g) ?? []).length).toBeLessThanOrEqual(2);
  });

  it('nothing waiting: "All clear"', () => {
    expect(html({ items: [] })).toContain('All clear');
  });

  it('a dark source is one line, in the owner\'s words, never "not set up yet"', () => {
    const out = html({ dark: ['drafts', 'reviews', 'checkins'] });
    expect(out).toContain('Drafts, form review, check-ins: turns on when the owner finishes setup.');
    expect(out).not.toMatch(/not set up yet/i);
    expect(out.match(/data-queue-dark/g)).toHaveLength(1);
  });

  it('loading is a spinner, not an empty "All clear"', () => {
    const out = html({ items: null });
    expect(out).not.toContain('All clear');
    expect(out).toContain('Loading');
  });
});
