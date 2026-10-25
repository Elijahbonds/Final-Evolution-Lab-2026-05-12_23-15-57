// CombineEntry — the coach's door to combine day (COMBINE-DAY, 2026-10-25), on /coach under Teams. Reads nothing.
import Link from 'next/link';
import { Timer } from 'lucide-react';

export function CombineEntry() {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5" data-combine-entry>
      <header className="flex items-center gap-2">
        <Timer className="h-4 w-4 text-[#00E5FF]" />
        <h2 className="fel-heading text-sm font-bold uppercase tracking-wide text-white">Combine day</h2>
      </header>
      <p className="mt-2 text-xs leading-relaxed text-white/50">Run a tryout or testing day: jump, agility, sprint and a skill drill, station by station, then a ranked report with CSV.</p>
      <Link href="/coach/combine" className="mt-3 inline-flex min-h-[44px] items-center text-xs font-bold text-[#00E5FF]">Start a combine →</Link>
    </section>
  );
}
