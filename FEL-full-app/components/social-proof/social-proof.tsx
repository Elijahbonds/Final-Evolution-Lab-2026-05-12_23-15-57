// SocialProof — ONB-06: what coaches and parents say, on the landing page, with consent (./quotes.ts). Renders nothing
// until the owner adds a quote that passes every rule there. A server component: no script, no request, no widget.
import { usableQuotes, type SocialQuote } from './quotes';

export function SocialProof({ quotes }: { quotes?: readonly SocialQuote[] }) {
  const shown = usableQuotes(quotes);
  if (shown.length === 0) return null;
  return (
    <section aria-labelledby="social-proof-title" className="mx-auto max-w-5xl px-4 py-10" data-social-proof>
      <h2 id="social-proof-title" className="fel-heading text-2xl font-bold text-white">What coaches and parents say</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-3">
        {shown.map((q) => (
          <li key={q.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <blockquote className="text-[14px] leading-relaxed text-white/85">&ldquo;{q.text}&rdquo;</blockquote>
            <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-white/55">
              {q.credit} · {q.role === 'coach' ? 'Coach' : 'Parent'}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
