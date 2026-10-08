'use client';

// FORM CHECK (MIRROR-FIRST P1, 2026-10-07; plan Phase 1). This tab was a stub: "Upload your training video to compare
// your form side-by-side… Coming in the next update", and an "AI Form Analysis — Future release" card. Nothing behind
// either was built, and the owner's choice is no video upload. The Mirror is the form check that exists: pose read live on
// the athlete's own camera, in the browser, the feed never uploaded. So Form Check now opens it, one link per live
// movement (lib/mirror/liveMovements.ts), plus the no-sign-in Quick Screen at its front door. The Mirror itself keeps
// every gate it has (the health intake, the youth rules, who may save).
import Link from 'next/link';
import { ArrowRight, ScanLine, Timer } from 'lucide-react';
import { MIRROR_LIVE_MOVEMENTS, mirrorMovementHref } from '@/lib/mirror/liveMovements';

export function FormFeedback() {
  return (
    <div className="px-4 py-10">
      <div className="mx-auto mb-6 max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#00E5FF]/20 bg-gradient-to-br from-[#00E5FF]/15 to-[#00FF9D]/10">
          <ScanLine className="h-8 w-8 text-[#00E5FF]" />
        </div>
        <h3 className="fel-heading mb-2 text-xl text-white">Form Check</h3>
        <p className="text-sm text-white/50">
          Check your form live, on your own camera. The Mirror reads each rep as you move — every number it shows is an
          estimate, and the camera feed is never uploaded.
        </p>
      </div>

      <ul className="mx-auto w-full max-w-md space-y-3" data-form-check-movements>
        {MIRROR_LIVE_MOVEMENTS.map((m) => (
          <li key={m.id}>
            <Link
              href={mirrorMovementHref(m.id)}
              data-movement={m.id}
              className="fel-card group block rounded-xl p-4 transition-colors hover:border-white/20"
            >
              <span className="block text-sm font-medium text-white">{m.title}</span>
              <span className="mt-1 block text-xs leading-relaxed text-white/45">{m.reads}</span>
              <span className="mt-2 flex items-center gap-2 text-xs text-[#00E5FF]/80 group-hover:text-[#00E5FF]">
                The Mirror · {m.tab} tab
                <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mx-auto mt-6 w-full max-w-md">
        <Link href="/screen" data-quick-screen className="fel-card group flex items-start gap-3 rounded-xl p-4 transition-colors hover:border-white/20">
          <Timer className="mt-0.5 h-5 w-5 shrink-0 text-[#00FF9D]" />
          <span>
            <span className="block text-sm font-medium text-white">Quick Screen</span>
            <span className="mt-1 block text-xs leading-relaxed text-white/45">
              No account needed: your jump in about a minute, or the full screen in about five. Nothing is sent.
            </span>
          </span>
        </Link>
      </div>
    </div>
  );
}
