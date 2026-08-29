import Link from 'next/link';

/**
 * Minimal server-rendered chrome for PUBLIC (logged-out) pages such as the
 * legal/support routes. The authed AppHeader/BottomNav assume a session and a
 * populated profile; these lightweight equivalents let /terms, /privacy and
 * /support render for logged-out visitors (M12.8) without a broken "sign out".
 */
export function PublicTopBar() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#050505]/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-3">
        <Link href="/" className="fel-heading text-2xl font-bold text-white">
          <span className="text-[#00E5FF] fel-glow-cyan">FINAL EVOLUTION</span> LAB
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-white/10 px-3 py-1.5 font-mono text-xs text-white/70 transition-colors hover:border-[#00E5FF]/50 hover:text-[#00E5FF]"
        >
          LOG IN
        </Link>
      </div>
    </header>
  );
}

export function PublicLegalFooter() {
  return (
    <footer className="mt-10 border-t border-white/10 py-6">
      <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-white/40">
        <Link href="/terms" className="hover:text-white/70">Terms</Link>
        <Link href="/privacy" className="hover:text-white/70">Privacy</Link>
        <Link href="/support" className="hover:text-white/70">Support</Link>
        <Link href="/login" className="hover:text-white/70">Log in</Link>
      </div>
    </footer>
  );
}
