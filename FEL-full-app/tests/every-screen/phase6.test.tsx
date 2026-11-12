// EVERY-SCREEN P6 (2026-11-11): "The first five minutes" — what phase 6 changed, as tests. Layout, size and order only on
// sign-up, consent and age: no wording, no age rule, no consent logic changed. The walks (home → a game or a first workout
// in ≤ 4 taps and under 60 s on the throttled phone; sign-up, then what is asked again) are scripts/every-screen/jobs-list.mts.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CONSENT_DONE_LINE, CONSENT_UNDER_18_LINE } from '@/lib/consent/guardian-copy';
import { DEVICE_ONLY_LINE } from '@/lib/screen/copy';

const src = (p: string) => readFileSync(p, 'utf8');

describe('sign-in and sign-up: sizes on the scale, every target 44 px, no word changed', () => {
  const a = src('components/auth-form.tsx');
  it('the title, the lede and the button are on the type scale (they were 26, 13 and 18 px)', () => {
    expect(a).toContain('<h1 className="fel-heading text-[30px] font-bold');
    expect(a).not.toMatch(/text-\[(13|12\.5|26)px\]/);
    expect(a).toContain('py-3 text-[20px] font-bold text-black');
  });
  it('"Create account", "Sign in" and the legal links are 44 px targets; their words are as they were', () => {
    expect(a).toContain('inline-flex min-h-11 items-center font-semibold text-[#00E5FF] hover:underline">\n                Create account');
    for (const l of ['Terms', 'Privacy', 'Support', 'Credits &amp; licences']) expect(a).toContain(`inline-flex min-h-11 min-w-11 items-center justify-center hover:text-[#00E5FF] hover:underline">${l}</a>`);
    expect(a).toContain('I agree to the{\' \'}');
  });
  it("the guest game's QUIT is 44 px tall", () => {
    expect(src('components/games/guest-dunk-shell.tsx')).toContain('inline-flex min-h-[44px] min-w-[44px]');
  });
  it('the welcome steps follow the 12-word rule (they were 13.5 px)', () => {
    expect(src('components/onboarding/first-win.tsx')).toContain('${lineSize(s.text)} leading-snug');
  });
});

describe('consent: the same words, now marked as approved notices', () => {
  it('the guardian page renders its two lines from copy, word for word as before', () => {
    expect(CONSENT_DONE_LINE).toBe("Nothing more is needed here: you're 18 or over, or a parent or guardian has said it's OK. Their OK lets a camp plan your coach builds with you go live.");
    expect(CONSENT_UNDER_18_LINE).toBe("Pain check-ins and the daily check-in save only for players who are 18 or over, so under 18 they stay off, with or without a guardian's OK. The Mirror runs on your device either way; under 18 it keeps nothing.");
    const g = src('app/consent/guardian/page.tsx');
    expect(g).toContain("<p {...notice('consent')} className=\"mt-2 text-[16px] leading-snug text-white/70\">{CONSENT_DONE_LINE}</p>");
    expect(g).toContain("<p {...notice('privacy')} className=\"mt-2 text-[16px] leading-snug text-white/55\">{CONSENT_UNDER_18_LINE}</p>");
  });
  it("the Quick Screen's privacy line is unchanged", () => {
    expect(DEVICE_ONLY_LINE).toBe('Everything runs on this device. The picture never leaves it, and nothing is sent anywhere.');
  });
});

describe('the walks', () => {
  it('a new person: a game, a first workout and sign-up are walked on the throttled phone', () => {
    const j = src('scripts/every-screen/jobs-list.mts');
    for (const id of ['new-first-game', 'new-first-workout', 'new-signup']) expect(j).toMatch(new RegExp(`id: '${id}', who: 'anon', throttle: true`));
    expect(src('scripts/every-screen/jobs.mts')).toContain("cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })");
  });
});
