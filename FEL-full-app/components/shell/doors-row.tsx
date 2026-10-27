import Link from 'next/link';
import { doorsFor, type Door } from '@/lib/nav/doors';
import { t } from '@/lib/i18n';

/**
 * The quiet row at the bottom of a tab. Small, one weight, one colour — these are rooms you visit occasionally,
 * and giving each one a coloured card would put them in competition with the things you do every day.
 * `hide` drops a door whose page is switched off (the Profile tab hides /account/bookings while COACH_STORE_ENABLED is off,
 * so it never links to a 404).
 */
export function DoorsRow({ tab, hide = [] }: { tab: Door['tab']; hide?: readonly string[] }) {
  return (
    <nav aria-label={t('shell.nav.more')} className="mt-10 border-t border-white/[0.06] pt-5">
      <ul className="flex flex-wrap gap-x-5 gap-y-2.5">
        {doorsFor(tab).filter((d) => !hide.includes(d.href)).map((d) => (
          <li key={d.href}>
            <Link
              href={d.href}
              className="font-mono text-[11px] uppercase tracking-[0.12em] text-fel-quiet transition-colors hover:text-white/70"
            >
              {d.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
