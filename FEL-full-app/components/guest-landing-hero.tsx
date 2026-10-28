'use client';

import { useEffect, useRef } from 'react';
import { Flame, Trophy, ArrowRight, ArrowUpFromLine } from 'lucide-react';
import { track, flush } from '@/lib/analytics';
import { EmailCapture } from '@/components/marketing/email-capture';
import { joinLabEnabled } from '@/lib/marketing/joinLab';
import { HeroHeader } from '@/components/ui/fel/hero-header';
import { PrimaryCta } from '@/components/ui/fel/primary-cta';
import { Chip } from '@/components/ui/fel/chip';
import { t } from '@/lib/i18n';
import { MEASURE_VERTICAL_HREF } from '@/lib/vertical/door';

/**
 * M13 Step 1 — the logged-out landing. One promise: "60 seconds to a dunk."
 * The primary CTA drops straight into a GUEST-playable dunk (no signup wall).
 */
export function GuestLandingHero() {
  const seen = useRef(false);
  useEffect(() => {
    if (seen.current) return;
    seen.current = true;
    track('guest_start', { source: 'landing' });
    void flush();
  }, []);

  // PREMIUM-UI P4 (owner 2026-10-27: "it still feels cheap"). The pitch as a Nike opening: the brand's own dunk photograph
  // full-bleed (public/brand, the owner's artwork for "any marketing surface"), the promise in five words, and ONE action,
  // PLAY NOW, docked where a thumb is. The two sentences that sat under it ("Already have an athlete? …", "Friend
  // hosting a game? …") are two labelled doors now. Words: public copy approved in ONB (Appendix B) is kept as the
  // headline and the PLAY NOW / Log in doors; the supporting line is cut to eight words.
  const play = () => { track('play_now_click', { target: 'landing_hero' }); void flush(); };
  return (
    <div className="relative">
      <HeroHeader
        as="section"
        height="full"
        image="/brand/bonds-dunk-arena.jpg"
        imagePosition="50% 22%"
        eyebrow={t('landing.eyebrow')}
        accent="var(--fel-gold)"
        dockSpace
        title={<>{t('landing.title.a')}<br />{t('landing.title.b')} <span className="text-fel-cyan [text-shadow:0_0_28px_rgba(0,229,255,0.55)]">{t('landing.title.c')}</span></>}
        line={t('landing.line')}
      >
        <PrimaryCta href="/try" docked above="edge" onClick={play} icon={<Flame aria-hidden className="h-6 w-6" />}>{t('landing.play')}</PrimaryCta>
        <Chip href="/login" icon={<Trophy aria-hidden className="h-4 w-4 text-fel-gold" />}>{t('landing.login')}</Chip>
        {/* MULTIPLAYER (2026-10-06): a friend's TV shows a code — the guest's one-step way into their game */}
        <Chip href="/join" testId="landing-join" icon={<ArrowRight aria-hidden className="h-4 w-4" />}>{t('landing.join')}</Chip>
        {/* VERTICAL-EASY (2026-10-27): measuring a vertical needs no account (the Quick Screen sends nothing) — one tap */}
        <Chip href={MEASURE_VERTICAL_HREF} testId="landing-vertical" icon={<ArrowUpFromLine aria-hidden className="h-4 w-4 text-fel-cyan" />}>{t('landing.vertical')}</Chip>
      </HeroHeader>

      {/* JOIN-LAB-HIDE: the Join the Lab email form stays hidden until the switch is on (lib/marketing/joinLab.ts). */}
      {joinLabEnabled() && (
        <div className="mx-auto mt-10 max-w-md">
          <EmailCapture source="landing_hero" />
        </div>
      )}
    </div>
  );
}
