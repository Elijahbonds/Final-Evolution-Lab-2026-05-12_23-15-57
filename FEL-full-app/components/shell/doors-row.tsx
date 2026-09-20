import Link from 'next/link';
import { doorsFor, type Door } from '@/lib/nav/doors';

/**
 * The quiet row at the bottom of a tab. Small, one weight, one colour — these are rooms you visit occasionally,
 * and giving each one a coloured card would put them in competition with the things you do every day.
 */
export function DoorsRow({ tab }: { tab: Door['tab'] }) {
  return (
    <nav aria-label="More" className="mt-10 border-t border-white/[0.06] pt-5">
      <ul className="flex flex-wrap gap-x-5 gap-y-2.5">
        {doorsFor(tab).map((d) => (
          <li key={d.href}>
            <Link
              href={d.href}
              className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/30 transition-colors hover:text-white/70"
            >
              {d.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
