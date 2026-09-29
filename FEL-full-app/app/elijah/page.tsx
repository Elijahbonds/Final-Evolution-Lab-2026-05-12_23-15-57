import Link from 'next/link';
import type { Metadata } from 'next';
import { ELIJAH_LINKS, LINKS_TAGLINE, LINKS_TITLE, PAID_LINK_NOTE, type LinkButton } from './links';

/**
 * /elijah — Elijah's links, one mobile page (LINKS-PAGE, 2026-09-29). Open to anyone signed out: no session read, no
 * redirect, no database, no request of its own, no script, no tracking, no cookie or storage write, no package, no
 * external font or image. A server component; the buttons are plain links (the two internal ones relative, with
 * prefetch off, so the page makes no background request; the external ones open a new tab). lib/links/elijah.test.tsx
 * pins it.
 *
 * TWO HOSTS (owner, 2026-09-29): the page is served from more than one host, so it names none. Its metadata replaces
 * the root layout's openGraph and twitter blocks with ones that carry no URL, because the root's share image resolves
 * against the layout's base URL (the production host) and would put that one host into this page's head.
 */
export const metadata: Metadata = {
  title: 'Elijah Bonds · Links',
  description: LINKS_TAGLINE,
  openGraph: { type: 'website', title: 'Elijah Bonds · Links', description: LINKS_TAGLINE },
  twitter: { card: 'summary', title: 'Elijah Bonds · Links', description: LINKS_TAGLINE },
};

/** The system font (as lib/screen/ui.ts SYSTEM_FONT_STACK): the root body class is IBM Plex, this page is not. */
const SYSTEM_FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// The Quick Screen's button classes (app/play/mirror/assess/_components/screen-ui.tsx), copied, not imported.
const primaryBtn = 'inline-flex w-full min-h-[52px] items-center justify-center rounded-full bg-[#00E5FF] px-6 py-3.5 text-center text-[16px] font-black text-black';
const outlineBtn = 'inline-flex w-full min-h-[52px] items-center justify-center rounded-full border-2 border-[#00E5FF] px-6 py-3 text-center text-[15px] font-bold text-[#00E5FF]';
const quietBtn = 'inline-flex w-full min-h-[52px] items-center justify-center rounded-full border border-white/20 px-6 py-3 text-center text-[15px] font-bold text-white';

function Button({ b, className }: { b: LinkButton; className: string }) {
  const inner = (
    <>
      <span data-label>{b.label}</span>
      {b.code ? <span data-code className="ml-2 font-normal text-white/80">code {b.code}</span> : null}
    </>
  );
  return b.external ? (
    <a href={b.href} target="_blank" rel="noopener noreferrer" data-link={b.label} className={className}>{inner}</a>
  ) : (
    <Link href={b.href} prefetch={false} data-link={b.label} className={className}>{inner}</Link>
  );
}

export default function ElijahLinksPage() {
  let internal = 0;
  return (
    <main data-links-page className="min-h-screen bg-[#050505] text-white" style={{ fontFamily: SYSTEM_FONT_STACK }}>
      <div className="mx-auto max-w-[480px] px-4 pb-12 pt-10">
        <header className="mb-6 text-center">
          <h1 className="text-[28px] font-black leading-tight tracking-tight">{LINKS_TITLE}</h1>
          <p className="mt-1 text-[13px] font-bold uppercase tracking-[0.18em] text-[#00E5FF]">{LINKS_TAGLINE}</p>
        </header>
        <ul className="flex flex-col gap-3">
          {ELIJAH_LINKS.map((b, i) => {
            const style = b.external ? quietBtn : internal++ === 0 ? primaryBtn : outlineBtn;
            const firstOfGroup = b.group && ELIJAH_LINKS[i - 1]?.group !== b.group;
            return (
              <li key={b.href} data-slot={b.slot}>
                {firstOfGroup ? <p data-group={b.group} className="mb-2 mt-2 px-1 text-[12px] font-bold uppercase tracking-[0.16em] text-white/60">{b.group}</p> : null}
                <Button b={b} className={style} />
                {b.paid ? <p data-paid-link-note={b.slot} className="mt-1.5 px-2 text-center text-[13px] leading-snug text-white/75">{PAID_LINK_NOTE}</p> : null}
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
