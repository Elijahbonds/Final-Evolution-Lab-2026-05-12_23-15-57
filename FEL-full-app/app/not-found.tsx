import Link from 'next/link';

const RECOVERY_LINKS = [
  {
    href: '/try',
    label: 'Play now',
    detail: 'Drop into the guest dunk session.',
    tone: 'border-[#00E5FF]/60 bg-[#00E5FF]/15 text-[#00E5FF]',
  },
  {
    href: '/play',
    label: 'Game shelf',
    detail: 'Pick up from the main mode list.',
    tone: 'border-[#FFD700]/50 bg-[#FFD700]/10 text-[#FFD700]',
  },
  {
    href: '/support',
    label: 'Support',
    detail: 'Report a broken or stale link.',
    tone: 'border-white/15 bg-white/[0.06] text-white',
  },
];

export default function NotFound() {
  return (
    <main
      data-testid="fel-not-found"
      className="flex min-h-[calc(100vh-5rem)] items-center justify-center bg-[#050505] px-4 py-16 text-white"
    >
      <section className="w-full max-w-3xl rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 text-center shadow-2xl shadow-[#00E5FF]/10 sm:p-10">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.35em] text-[#00E5FF]">
          Route lost
        </p>
        <h1 className="mt-4 fel-heading text-4xl font-black leading-none sm:text-6xl">
          THIS LANE IS CLOSED
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-white/60 sm:text-base">
          That link does not resolve anymore. Your session is safe - choose a live entry point and keep moving.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {RECOVERY_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-2xl border p-4 text-left transition-transform hover:-translate-y-0.5 ${link.tone}`}
            >
              <span className="fel-heading text-lg font-black uppercase">{link.label}</span>
              <span className="mt-2 block text-xs leading-5 text-white/55">{link.detail}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
