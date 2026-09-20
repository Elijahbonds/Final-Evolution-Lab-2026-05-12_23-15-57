// TabPage — one frame for all three tabs, so they cannot drift apart.
//
// The premium of a premium interface is mostly restraint: one column width, one heading size, one rhythm of
// spacing, one place the eye starts. Three pages that each invent their own is how an app starts to feel cheap
// even when every screen is individually fine.

import type { ReactNode } from 'react';

export function TabPage({
  eyebrow, title, lede, accent, children, aside,
}: {
  eyebrow: string; title: string; lede?: string; accent: string; children: ReactNode; aside?: ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-[#050505] pb-28 md:pb-12">
      {/* a single wash of the tab's colour at the top — the only chrome the page gets */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64"
        style={{ background: `radial-gradient(120% 100% at 50% 0%, ${accent}14 0%, transparent 70%)` }}
      />
      <main className="relative mx-auto max-w-[1080px] px-5 pt-8 md:pt-6">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>
              {eyebrow}
            </p>
            <h1 className="fel-heading mt-2 text-[30px] font-black leading-none tracking-tight text-white md:text-[38px]">
              {title}
            </h1>
            {lede && <p className="mt-2.5 max-w-lg text-[13.5px] leading-relaxed text-white/45">{lede}</p>}
          </div>
          {aside}
        </header>
        {children}
      </main>
    </div>
  );
}
