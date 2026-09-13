// THE WALL, as a player sees it (2026-09-13).
//
// Owner asked for an "In Development" wall: every non-shipping mode visible but locked, with an honest label.
//
// The one design rule here is that the label has to be TRUE and SPECIFIC. "Coming soon" is a non-answer that
// reads as a content gate — players assume it is finished and being drip-fed. Naming the actual gap ("the
// karts still need an art pass") is honest, it is a promise we can be held to, and it tells someone whether
// the thing they wanted is a week away or a quarter away.
//
// The mode is NOT deleted, unregistered, or removed from the build — it still runs under /dev/mode and still
// has its tests. This is a navigation gate and nothing more.

import Link from 'next/link';

export function InDevelopment({ title, reason }: { title: string; reason: string }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-[10px] font-black tracking-[0.4em] text-[#FFD700]">IN DEVELOPMENT</p>
      <h1 className="fel-heading text-3xl font-black text-white">{title}</h1>

      {/* the real gap, named */}
      <p className="max-w-sm text-sm leading-relaxed text-white/70">{reason}</p>

      <p className="max-w-sm text-[11px] leading-relaxed text-white/40">
        It&rsquo;s playable internally and it isn&rsquo;t going anywhere &mdash; we&rsquo;d just rather you
        met it finished.
      </p>

      <Link
        href="/modes"
        className="fel-cta mt-2 rounded-2xl bg-white px-8 py-3 font-black text-black transition-transform active:scale-95"
      >
        BACK TO THE LAB
      </Link>
    </div>
  );
}
