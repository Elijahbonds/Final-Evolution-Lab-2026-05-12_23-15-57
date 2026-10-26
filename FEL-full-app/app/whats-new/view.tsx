// The What's new list (QG-05): the public notes of each release, newest first. app/whats-new/page.tsx wraps it in the
// public chrome; the visual gate photographs it on its own.
import type { publicReleases } from '@/lib/release/notes';

const DATE = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function WhatsNewView({ releases }: { releases: ReturnType<typeof publicReleases> }) {
  return (
    <main className="mx-auto max-w-[700px] px-4 py-8" data-whats-new>
      <h1 className="fel-heading text-3xl font-bold text-white">What&apos;s new</h1>
      <p className="mt-2 text-sm text-white/55">What changed in Final Evolution Lab, newest first.</p>
      {releases.length === 0 && <p className="mt-8 text-sm text-white/45">Nothing yet. The first notes arrive with the next update.</p>}
      {releases.map((r) => (
        <section key={r.sha} className="fel-panel mt-6 rounded-xl p-5" data-release={r.sha.slice(0, 8)}>
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="fel-heading text-xl font-bold text-white">{r.version}</h2>
            <p className="text-xs text-white/45">
              {r.deployedAt ? `Live since ${DATE.format(new Date(`${r.deployedAt}T12:00:00Z`))}` : `Rolling out · notes from ${DATE.format(new Date(`${r.date}T12:00:00Z`))}`}
            </p>
          </header>
          {r.areas.map((a) => (
            <div key={a.area} className="mt-4">
              <h3 className="font-mono text-[11px] uppercase tracking-widest text-[#00E5FF]">{a.area}</h3>
              <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-white/80">
                {a.notes.map((n) => <li key={n} className="flex gap-2"><span aria-hidden className="text-white/30">·</span><span>{n}</span></li>)}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
