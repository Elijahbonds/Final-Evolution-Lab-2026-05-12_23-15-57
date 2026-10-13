// QA P1-24 (2026-09-27): Sessions' Book buttons were live at 0 shards and the refusal came only after the press (a 409
// toast). A slot the wallet cannot pay for says so on its button; the server's check is unchanged.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { BookButton, bookState } from './sessions-view';

const render = (price: number, balance: number | null, isBooked = false) =>
  renderToStaticMarkup(createElement(BookButton, { price, balance, isBooked, busy: false, color: '#00E5FF', textColor: '#050505', onBook: () => {} }));

describe('the Book button reads the wallet', () => {
  it('balance 0: disabled, "Need 40 more shards", and the way to earn them', () => {
    const m = render(40, 0);
    expect(m).toMatch(/<button[^>]*disabled=""[^>]*>Need 40 more shards<\/button>/);
    expect(m).toMatch(/<a href="\/wallet"[^>]*>How to earn shards<\/a>/);
  });

  it('balance ≥ price: enabled, "Book · 40 shards"', () => {
    const m = render(40, 40);
    expect(m).not.toMatch(/disabled=""/);
    expect(m).toMatch(/Book · 40 shards/);
    expect(m).not.toMatch(/How to earn/);
  });

  it('one short says shard, not shards', () => {
    expect(render(40, 39)).toMatch(/>Need 1 more shard<\/button>/);
  });

  it('an unknown balance stays pressable (the server still refuses a short wallet)', () => {
    expect(bookState(40, null)).toEqual({ short: 0, disabled: false });
    expect(render(40, null)).not.toMatch(/disabled=""/);
  });

  it('a booked slot says Booked whatever the balance', () => {
    expect(render(40, 0, true)).toMatch(/Booked<\/button>/);
    expect(render(40, 0, true)).not.toMatch(/Need/);
  });
});
