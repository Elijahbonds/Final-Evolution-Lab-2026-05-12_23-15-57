// One block of the profile: a heading that says what the block is for, then its body. Every block is the same frame,
// so the page reads top to bottom with one rhythm (PROFILE V2 design: one hierarchy, every block has an obvious purpose).
import type { ReactNode } from 'react';

export function Section({ id, title, purpose, accent, children, aside }: { id: string; title: string; purpose: string; accent: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="mt-9 scroll-mt-20">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-h`} className="fel-heading text-[18px] font-bold leading-tight text-white">
            <span aria-hidden className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: accent }} />
            {title}
          </h2>
          <p className="mt-1 text-[12px] leading-snug text-fel-dim">{purpose}</p>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-white/[0.07] bg-[#0c0c11] p-4 ${className}`}>{children}</div>;
}

/** A labelled "coming" block: what is planned, said plainly, never dressed up with sample numbers. */
export function Coming({ title, text, href, cta }: { title: string; text: string; href?: string; cta?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.12] p-4">
      <p className="flex items-center gap-2 text-[13px] font-bold text-white/75">
        {title}
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 font-sans text-[12px] font-semibold uppercase tracking-[0.14em] text-fel-dim">Coming</span>
      </p>
      <p className="mt-1 text-[12px] leading-snug text-fel-dim">{text}</p>
      {href && cta && <a href={href} className="mt-2 inline-block text-[12px] font-bold text-fel-cyan underline-offset-2 hover:underline">{cta} →</a>}
    </div>
  );
}
