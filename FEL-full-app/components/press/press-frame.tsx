import Link from 'next/link';
import { PublicTopBar } from '@/components/public-chrome';
import { EXAMPLE_PRICE_NOTE } from '@/lib/books/bookCatalog';

export function PressFrame({
  signedIn,
  children,
}: {
  signedIn: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#070707] pb-24 text-white">
      {signedIn ? null : <PublicTopBar />}
      <p className="bg-[#3a1214] px-4 py-2 text-center text-[11px] leading-relaxed text-[#ffb4b4]">
        {EXAMPLE_PRICE_NOTE} Checkout is Stripe test mode. Buy buttons do not charge a live card.
      </p>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
              <Link href="/" className="hover:text-white/70">Final Evolution Lab</Link>
            </p>
            <h1 className="fel-heading text-4xl text-white sm:text-5xl">
              Final Evolution <span className="text-[#F5C518]">Press</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm text-white/60">
              Books and audiobooks by Elijah Bonds, bought straight from FEL. Your purchases live in your FEL library.
            </p>
          </div>
          <Link
            href="/press/library"
            className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/80 hover:border-[#F5C518]/70"
          >
            My Library
          </Link>
        </header>
        {children}
        <footer className="mt-12 flex flex-wrap gap-4 border-t border-white/10 pt-4 text-[11px] text-white/35">
          <Link href="/terms" className="hover:text-white/70">Terms</Link>
          <Link href="/privacy" className="hover:text-white/70">Privacy</Link>
          <Link href="/support" className="hover:text-white/70">Support</Link>
          <span>Digital goods. A refund revokes library access.</span>
        </footer>
      </main>
    </div>
  );
}
