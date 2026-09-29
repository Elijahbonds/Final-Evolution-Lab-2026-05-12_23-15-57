import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// MIRROR-COACH P1 (2026-09-25): the copy around /workout and the Mirror that promised what is not there.
//   - /train's Mirror card said "Scored, with the corrective work written for you." No app code grades a screen station
//     (ScreenRunner.record has no production caller), so every screen came back unscored.
//   - The LIVE tab's house ad sold "a plan animated with YOUR avatar" at /workout: the plans are off sale (owner
//     decision #3), nothing ever animated one, and the avatar was drawn from sample numbers.
// app/ is outside the vitest include, so /train is rendered from here, with a stand-in session and database.

vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { id: 'u1' } }) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`redirect ${to}`); } }));
vi.mock('@/lib/db', () => ({
  prisma: {
    coachClient: { findFirst: async () => null },
    coachingProgram: { count: async () => 0 },
  },
}));

import TrainPage from '@/app/train/page';
import { AD_SLOTS } from '@/lib/stream/program-guide';
import { screenText } from '@/lib/share/screen';

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

describe('/train, the Mirror card', () => {
  it('does not say the screen is scored or graded, and says its numbers are estimates', async () => {
    const html = renderToStaticMarkup(await TrainPage());
    const card = /The Mirror\s*<\/span>\s*<span[^>]*>([^<]*)<\/span>/.exec(html)?.[1] ?? '';
    expect(card).not.toBe('');
    expect(card).not.toMatch(/\bscor(ed|es|ing)?\b/i);
    expect(card).not.toMatch(/\bgrad(ed|es|ing)\b/i);
    expect(card).not.toMatch(/written for you/i);
    expect(card).toMatch(/estimate/);
    expect(text(html)).not.toMatch(/Scored, with the corrective work/);
    expect(screenText(card)).toEqual([]);
  });
});

// MIRROR-COACH P1 review (2026-09-25): the Fuel card said "Your meal prescription from your own movement screen". The
// Kitchens input is sliders set by hand (sample numbers until a Mirror scan is wired: components/kitchens/
// your-build-panel.tsx), and "prescription" is a treatment word.
describe('/train, the Fuel card', () => {
  it('says what the meals are keyed to — the numbers you enter — with no "prescription" and no claim of your screen', async () => {
    const html = renderToStaticMarkup(await TrainPage());
    const card = /Fuel\s*<\/span>\s*<span[^>]*>([^<]*)<\/span>/.exec(html)?.[1] ?? '';
    expect(card).not.toBe('');
    expect(card).not.toMatch(/prescri/i);
    expect(card).not.toMatch(/from your own movement screen/i);
    expect(card).toMatch(/numbers you enter/);
    expect(screenText(card)).toEqual([]);
  });

  it('no card line on /train names a condition, a treatment or a guarantee', async () => {
    const html = renderToStaticMarkup(await TrainPage());
    expect(text(html)).not.toMatch(/meal prescription/i);
    for (const m of html.matchAll(/<span[^>]*>([^<]{12,})<\/span>/g)) expect(screenText(m[1]), m[1]).toEqual([]);
  });
});

describe('the LIVE tab house ads', () => {
  it('no longer sell /workout plans, or anything animated with your avatar', () => {
    for (const ad of AD_SLOTS) {
      expect(ad.href, ad.id).not.toBe('/workout');
      expect(ad.headline, ad.id).not.toMatch(/animated|YOUR avatar|plan/i);
    }
    expect(AD_SLOTS.length).toBeGreaterThan(0);                              // unsold inventory still has a house ad
  });
});
