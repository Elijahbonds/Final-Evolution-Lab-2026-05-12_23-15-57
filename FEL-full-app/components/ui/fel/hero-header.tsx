// HERO HEADER (lane/premium-ui P1). Full-bleed: a real image (a venue, a 3D scene capture) or a figure (the player's
// avatar), a scrim that fades it into the ink, and the headline sitting on the dark part of it — the Nike / Fitness+
// opening. The image is decoration (alt=""); the words carry the meaning. Six words of headline, twelve of line.
import Image from 'next/image';
import type { ReactNode } from 'react';
import { TYPE } from '@/lib/design/type';

const HEIGHT = {
  /** the landing: the whole first screen */
  full: 'min-h-[100svh]',
  /** a tab: most of a phone's first screen, the image still reads */
  tall: 'min-h-[400px] md:min-h-[440px]',
  /** a sub-page */
  short: 'min-h-[240px] md:min-h-[280px]',
} as const;

export function HeroHeader({
  image, imagePosition = 'center', media, eyebrow, title, line, children, height = 'tall', accent = 'var(--fel-accent)',
  priority = true, as: Tag = 'header', testId,
}: {
  /** a public/ image path (credited in lib/credits/credits.ts) */
  image?: string;
  imagePosition?: string;
  /** a figure instead of (or over) the image: the player's avatar */
  media?: ReactNode;
  eyebrow?: string;
  title: ReactNode;
  line?: ReactNode;
  /** the actions: ONE primary (PrimaryCta) and at most a couple of chips */
  children?: ReactNode;
  height?: keyof typeof HEIGHT;
  accent?: string;
  priority?: boolean;
  as?: 'header' | 'section' | 'div';
  testId?: string;
}) {
  return (
    <Tag data-fel-hero data-testid={testId} className={`relative isolate flex w-full flex-col overflow-hidden ${HEIGHT[height]}`}>
      {image && (
        <Image src={image} alt="" fill priority={priority} sizes="100vw" className="-z-20 object-cover" style={{ objectPosition: imagePosition }} />
      )}
      {media && <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center">{media}</div>}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10" style={{ background: 'var(--fel-scrim)' }} />
      <div className="relative mx-auto mt-auto flex w-full max-w-[1080px] flex-col gap-3 px-5 pb-7 pt-28 md:pb-9">
        {eyebrow && <p className={TYPE.label} style={{ color: accent }}>{eyebrow}</p>}
        <h1 className={`${TYPE.display} max-w-[14ch] text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.55)]`}>{title}</h1>
        {line && <p className={`${TYPE.small} max-w-md text-fel-soft`}>{line}</p>}
        {children && <div className="mt-3 flex flex-wrap items-center gap-3">{children}</div>}
      </div>
    </Tag>
  );
}
