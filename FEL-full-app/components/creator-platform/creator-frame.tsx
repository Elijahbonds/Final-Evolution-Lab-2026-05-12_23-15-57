import Link from 'next/link';
import { PublicTopBar } from '@/components/public-chrome';
import { EXAMPLE_RATE_NOTE } from '@/lib/creator/creatorCatalog';

/** Shared chrome for /team, /media-kit, /work-with-us and /bookings. Same look as the Press frame. */
export function CreatorFrame({
  signedIn,
  title,
  lede,
  children,
}: {
  signedIn: boolean;
  title: React.ReactNode;
  lede: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#070707] pb-24 text-white">
      {signedIn ? null : <PublicTopBar />}
      <p className="bg-[#3a1214] px-4 py-2 text-center text-[11px] leading-relaxed text-[#ffb4b4]">
        {EXAMPLE_RATE_NOTE} Booking checkout is Stripe test mode and does not charge a live card.
      </p>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
              <Link href="/" className="hover:text-white/70">Final Evolution Lab</Link>
            </p>
            <h1 className="fel-heading text-4xl text-white sm:text-5xl">{title}</h1>
            <p className="mt-2 max-w-xl text-sm text-white/60">{lede}</p>
          </div>
          <nav className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wider">
            <Link href="/team" className="rounded-md border border-white/15 px-3 py-1.5 text-white/80 hover:border-[#F5C518]/70">Team</Link>
            <Link href="/media-kit" className="rounded-md border border-white/15 px-3 py-1.5 text-white/80 hover:border-[#F5C518]/70">Media kit</Link>
            <Link href="/work-with-us" className="rounded-md bg-[#F5C518] px-3 py-1.5 text-black hover:bg-[#ffd84a]">Work with us</Link>
          </nav>
        </header>
        {children}
        <footer className="mt-12 flex flex-wrap gap-4 border-t border-white/10 pt-4 text-[11px] text-white/35">
          <Link href="/terms" className="hover:text-white/70">Terms</Link>
          <Link href="/privacy" className="hover:text-white/70">Privacy</Link>
          <Link href="/support" className="hover:text-white/70">Support</Link>
          <span>Profiles, rates and stats marked EXAMPLE are placeholders.</span>
        </footer>
      </main>
    </div>
  );
}

export function ExampleBadge({ label = 'EXAMPLE' }: { label?: string }) {
  return (
    <span className="ml-2 inline-block rounded border border-[#ff8b8b]/50 bg-[#3a1214] px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wider text-[#ffb4b4]">
      {label}
    </span>
  );
}

export function ProfilePhoto({ name, photoUrl, size = 'md' }: { name: string; photoUrl: string | null; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-40 w-40 text-5xl' : 'h-20 w-20 text-2xl';
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt={name} className={`${box} rounded-2xl object-cover`} />;
  }
  const initials = name.split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
  return (
    <div aria-label={`${name} (photo placeholder)`} className={`${box} fel-heading flex items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-[#1b1b1b] to-[#0c0c0c] text-[#F5C518]`}>
      {initials}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#F5C518]">{children}</h2>;
}
