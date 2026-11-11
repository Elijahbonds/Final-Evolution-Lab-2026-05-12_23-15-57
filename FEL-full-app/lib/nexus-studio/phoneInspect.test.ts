// studio-22 (2026-11-11): on a phone, opening Inspect brings the selected object's own fields into the short sheet.
// The measurement (scripts/probes/studio-22/inspect-phone.mts, 390 × 844): before, the sheet was 108 px tall and a light's colour
// sat 192 px below the screen inside it; these pin the scroll that fixes it, with a fake element shape (no DOM in this runner).
import { describe, expect, it } from 'vitest';
import { OWN_FIELDS_ATTR, PHONE_QUERY, isPhoneWidth, revealOwnFields, scrollerOf, type ScrollEl } from './phoneInspect';

/** A sheet as measured on the phone: a 108 px scroller holding 396 px of fields, the own-fields divider 254 px down its content. */
function sheet(o: { clientHeight?: number; scrollHeight?: number; dividerAt?: number; scrollTop?: number; marker?: boolean } = {}) {
  const sheetTop = 736;
  const scroller = {
    scrollTop: o.scrollTop ?? 0, scrollHeight: o.scrollHeight ?? 396, clientHeight: o.clientHeight ?? 108, parentElement: null as ScrollEl | null,
    getBoundingClientRect: () => ({ top: sheetTop }),
    querySelector: () => null,
  } as ScrollEl;
  const divider: ScrollEl = {
    scrollTop: 0, scrollHeight: 1, clientHeight: 1, parentElement: scroller,
    getBoundingClientRect: () => ({ top: sheetTop + (o.dividerAt ?? 254) - scroller.scrollTop }),
    querySelector: () => null,
  };
  const aside: ScrollEl = {
    scrollTop: 0, scrollHeight: 108, clientHeight: 108, parentElement: null,
    getBoundingClientRect: () => ({ top: sheetTop }),
    querySelector: (sel) => (o.marker === false || sel !== `[${OWN_FIELDS_ATTR}]` ? null : divider),
  };
  (scroller as { parentElement: ScrollEl | null }).parentElement = aside;
  return { aside, scroller, divider };
}

describe('the phone Inspect sheet opens on the object’s own fields', () => {
  it('scrolls the sheet so the own-fields divider is at its top (a light: role, colour, height)', () => {
    const s = sheet();
    expect(revealOwnFields(s.aside)).toBe(254);
    expect(s.scroller.scrollTop).toBe(254);
    expect(s.divider.getBoundingClientRect().top).toBe(s.scroller.getBoundingClientRect().top);
  });

  it('from any earlier scroll position lands in the same place', () => {
    const s = sheet({ scrollTop: 90 });
    expect(revealOwnFields(s.aside)).toBe(254);
  });

  it('never scrolls past the end of the sheet', () => {
    const s = sheet({ dividerAt: 380 });
    expect(revealOwnFields(s.aside)).toBe(396 - 108);
  });

  it('does nothing for the venue’s fields or a group (no own-fields marker), or with no sheet', () => {
    expect(revealOwnFields(sheet({ marker: false }).aside)).toBeNull();
    expect(revealOwnFields(null)).toBeNull();
  });

  it('does nothing when the fields already fit (nothing scrolls)', () => {
    const s = sheet({ clientHeight: 500, scrollHeight: 396 });
    expect(revealOwnFields(s.aside)).toBeNull();
    expect(s.scroller.scrollTop).toBe(0);
  });

  it('the scroller is the nearest ancestor whose content overflows, stopping at the sheet', () => {
    const s = sheet();
    expect(scrollerOf(s.divider, s.aside)).toBe(s.scroller);
  });

  it('only a phone-width window (below md) jumps; a window that cannot answer is left alone', () => {
    expect(PHONE_QUERY).toBe('(max-width: 767.98px)');
    expect(isPhoneWidth({ matchMedia: (q) => ({ matches: q === PHONE_QUERY }) })).toBe(true);
    expect(isPhoneWidth({ matchMedia: () => ({ matches: false }) })).toBe(false);
    expect(isPhoneWidth({ matchMedia: () => { throw new Error('no'); } })).toBe(false);
    expect(isPhoneWidth(undefined)).toBe(false);
  });
});
