// PROGRESS CARD: what the share image draws, read from its element tree (the same tree next/og renders).
import { describe, expect, it } from 'vitest';
import { isValidElement, type ReactNode } from 'react';
import { buildProgressCard } from './card';
import { ProgressCardImage, nameOnImage, emptyWord, imageHeadline, imageVsLine } from './image';
import { READ_CAP } from '@/lib/profile-v2/load';
import type { ProfileRows } from '@/lib/profile-v2/assemble';
import { NOW, adultTwoWeeks, newUser, teenActive, adultFirstWeek, adultQuietWeek } from '@/tests/helpers/progressCardRows';

const card = (rows: ProfileRows) => buildProgressCard('me', rows, NOW, READ_CAP.played);

/** Every string the tree draws, calling function components the way the renderer does. */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (isValidElement(node)) {
    const { type, props } = node as { type: unknown; props: { children?: ReactNode } };
    if (typeof type === 'function') return textOf((type as (p: unknown) => ReactNode)(props));
    return textOf(props.children);
  }
  return '';
}
const drawn = (rows: ProfileRows, showName: boolean) => textOf(<ProgressCardImage card={card(rows)} opts={{ showName }} />);

describe('the share image', () => {
  it('an adult who ticked their name: the name, the week, the numbers with arrows', () => {
    const t = drawn(adultTwoWeeks(), true);
    expect(t).toContain('JORDAN RIG · MY WEEK');
    expect(t).toContain('OCT 18 – OCT 24');
    expect(t).toContain('Better on 3 of 5 against last week.');
    expect(t).toContain('↑ +1.6 in vs last week');
    expect(t).toContain('↓ −23 pts vs last week');
    expect(t).toContain('↑ 5 days played, was 4');
    expect(t).toContain('9,100');
  });

  it('an adult who did not tick it: no name', () => {
    const t = drawn(adultTwoWeeks(), false);
    expect(t).not.toContain('JORDAN');
    expect(t).toContain('MY WEEK');
  });

  it('a teen who asks for their name: no name, no score, no phone-only number', () => {
    const t = drawn(teenActive(), true);
    expect(t).not.toMatch(/SAM|Sam|JORDAN/);
    expect(t).not.toContain('9,100');
    expect(t).toContain('Not on this card');
    expect(nameOnImage({ name: 'Sam Teen', minorOrUnknown: true }, { showName: true })).toBeNull();
  });

  it('a new user: dashes and words, never a number on a tile', () => {
    const c = card(newUser());
    expect(imageHeadline(c)).toBe('Day one. Nothing measured yet.');
    expect(c.metrics.map(emptyWord)).toEqual(['Not on this card', 'Not on this card', 'Not tracked yet', 'No days played yet']);
    expect(c.metrics.every((m) => imageVsLine(m) === null)).toBe(true);
  });

  it('first-person lines for the other states', () => {
    expect(imageHeadline(card(adultFirstWeek()))).toBe('My first week on record.');
    expect(imageHeadline(card(adultQuietWeek()))).toBe('Nothing logged this week yet.');
  });
});
