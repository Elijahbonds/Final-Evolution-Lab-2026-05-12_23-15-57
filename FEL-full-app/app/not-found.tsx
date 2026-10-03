import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#050505] px-6 text-center text-white">
      <p className="font-mono text-[10px] font-black uppercase tracking-[0.4em] text-[#00E5FF]">Final Evolution</p>
      <h1 className="fel-heading text-3xl font-black">We lost that route</h1>
      <p className="max-w-sm text-sm leading-relaxed text-white/60">
        That page is not in the Lab anymore. Head back to the hub and pick your next lane.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-2xl border border-white/15 bg-white px-8 py-3 font-black text-black transition-transform active:scale-95"
      >
        BACK TO HUB
      </Link>
    </main>
  );
}
