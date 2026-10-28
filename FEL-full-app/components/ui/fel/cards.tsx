// CARDS (lane/premium-ui P1): three, and only three, so a page cannot invent a fourth.
//   MediaCard  a picture door: a venue, a mode, a program — the image is the reason to tap it
//   StatCard   a ring and a number with its label: progress at a glance
//   ListRow    a row in a list: icon or thumb, a title, at most one short line, and where it goes
// Every one is lifted off the ink (fel-surface: light, not an outline) and gives under the finger (fel-press).
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { TYPE } from '@/lib/design/type';
import { StatRing } from './stat-ring';

const ASPECT = { wide: 'aspect-[16/9]', tall: 'aspect-[3/4]', square: 'aspect-square', banner: 'aspect-[21/9]' } as const;

export function MediaCard({
  href, image, imagePosition = 'center', title, line, badge, aspect = 'wide', priority = false, testId, sizes = '(min-width: 768px) 360px, 90vw',
}: {
  href: string; image: string; imagePosition?: string; title: string; line?: string; badge?: ReactNode;
  aspect?: keyof typeof ASPECT; priority?: boolean; testId?: string; sizes?: string;
}) {
  return (
    <Link href={href} data-testid={testId} data-fel-card="media"
      className={`fel-press fel-lift group relative isolate block overflow-hidden rounded-[20px] border border-[color:var(--fel-hairline)] ${ASPECT[aspect]}`}>
      <Image src={image} alt="" fill priority={priority} sizes={sizes}
        className="-z-20 object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]" style={{ objectPosition: imagePosition }} />
      <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-[#050505] via-[#050505]/45 to-transparent" />
      {badge && <span className="absolute left-3 top-3">{badge}</span>}
      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-4">
        <span className={`${TYPE.heading} text-white`}>{title}</span>
        {line && <span className={`${TYPE.small} line-clamp-1 text-fel-soft`}>{line}</span>}
      </span>
    </Link>
  );
}

export function StatCard({
  label, value, max = 100, display, sub, color, href, children, testId,
}: {
  label: string; value: number | null; max?: number; display?: string; sub?: string; color?: string; href?: string; children?: ReactNode; testId?: string;
}) {
  const body = (
    <>
      <StatRing value={value} max={max} label={label} display={display} size={88} stroke={8} color={color} />
      <span className="flex min-w-0 flex-col gap-1">
        <span className={`${TYPE.label} text-fel-dim`}>{label}</span>
        {sub && <span className={`${TYPE.body} font-semibold text-white`}>{sub}</span>}
        {children}
      </span>
    </>
  );
  const cls = 'fel-surface flex items-center gap-4 p-4';
  return href
    ? <Link href={href} data-testid={testId} data-fel-card="stat" className={`${cls} fel-press fel-lift`}>{body}</Link>
    : <div data-testid={testId} data-fel-card="stat" className={cls}>{body}</div>;
}

export function ListRow({
  href, icon: Icon, thumb, accent = 'var(--fel-accent)', title, line, trailing, testId,
}: {
  href: string; icon?: LucideIcon; thumb?: string; accent?: string; title: string; line?: string; trailing?: ReactNode; testId?: string;
}) {
  return (
    <Link href={href} data-testid={testId} data-fel-card="row"
      className="fel-press group flex min-h-[72px] items-center gap-4 rounded-[16px] px-3 py-3 hover:bg-white/[0.04]">
      {thumb ? (
        <span aria-hidden className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[12px]">
          <Image src={thumb} alt="" fill sizes="48px" className="object-cover" />
        </span>
      ) : Icon ? (
        <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-[12px]"
          style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 28%, transparent)` }}>
          <Icon className="h-5 w-5" style={{ color: accent }} strokeWidth={2.1} />
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`${TYPE.body} truncate font-semibold text-white`}>{title}</span>
        {line && <span className={`${TYPE.small} truncate text-fel-dim`}>{line}</span>}
      </span>
      {trailing ?? <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-fel-quiet transition-transform group-hover:translate-x-0.5" />}
    </Link>
  );
}
