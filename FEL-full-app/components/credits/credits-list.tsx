import {
  CREDITS, LICENCE_PENDING, SECTION_ORDER, SECTION_TITLES, creditsInSection, type Credit,
} from '@/lib/credits/credits';

// HOTFIX (2026-09-24): the credits the app never had. Rendered straight from lib/credits/credits.ts, so the page and
// the test that checks the manifests read the same list. A licence the owner is still confirming is shown as exactly
// that, never filled in.

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#00E5FF] hover:underline">
      {children}
    </a>
  );
}

function Licence({ c }: { c: Credit }) {
  if (c.status === 'pending') {
    return <span className="font-mono text-[#FFB020]">{LICENCE_PENDING}</span>;
  }
  return c.licenceUrl
    ? <ExternalLink href={c.licenceUrl}>{c.licence}</ExternalLink>
    : <span className="text-white/80">{c.licence}</span>;
}

function Entry({ c }: { c: Credit }) {
  return (
    <li className="border-t border-white/10 py-4 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold text-white">
        {c.link ? <ExternalLink href={c.link}>{c.title}</ExternalLink> : c.title}
      </h3>
      <p className="mt-0.5 text-xs text-white/50">{c.by}</p>
      <p className="mt-2 text-sm text-white/70">{c.used}</p>
      <p className="mt-2 text-xs text-white/50">
        Licence: <Licence c={c} />
        {c.notice ? <> · acknowledgement above</> : null}
      </p>
    </li>
  );
}

export function CreditsList({ credits = CREDITS }: { credits?: Credit[] }) {
  const notices = credits.filter((c) => c.notice);
  return (
    <div>
      <h1 className="fel-heading text-3xl font-bold text-white">CREDITS &amp; LICENCES</h1>
      <p className="mt-2 text-sm text-white/50">
        Final Evolution Lab is built on other people’s work as well as our own. These are the outside assets, models,
        motion, voices, typefaces and engines the app ships, what each is used for, and the licence it comes under.
        {/* HOTFIX (2026-09-24): not "every outside source", which would overclaim: the npm libraries the app is built
            with (React, Next.js and the rest) are not listed here. */}
      </p>

      {notices.length > 0 ? (
        <section aria-labelledby="credits-required" className="mt-6 fel-panel rounded-xl p-6">
          <h2 id="credits-required" className="fel-heading text-lg font-bold text-white">Required acknowledgements</h2>
          <ul className="mt-3 space-y-3">
            {notices.map((c) => (
              <li key={c.id}>
                <p className="text-xs text-white/50">{c.title}</p>
                <blockquote className="mt-1 border-l-2 border-[#A855F7]/40 pl-3 text-sm text-white/80">{c.notice}</blockquote>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {SECTION_ORDER.map((s) => {
        const list = creditsInSection(s, credits);
        if (list.length === 0) return null;
        return (
          <section key={s} aria-labelledby={`credits-${s}`} className="mt-6 fel-panel rounded-xl p-6">
            <h2 id={`credits-${s}`} className="fel-heading text-lg font-bold text-white">{SECTION_TITLES[s]}</h2>
            <ul className="mt-3">
              {list.map((c) => <Entry key={c.id} c={c} />)}
            </ul>
          </section>
        );
      })}

      <p className="mt-6 text-center text-xs text-white/40">
        Something missing or wrong? Write to{' '}
        <a href="mailto:support@finalevolutionlab.com" className="text-[#00E5FF] hover:underline">support@finalevolutionlab.com</a>.
      </p>
    </div>
  );
}
