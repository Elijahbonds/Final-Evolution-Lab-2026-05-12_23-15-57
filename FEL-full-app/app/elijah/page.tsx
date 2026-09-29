import Link from 'next/link';
import type { Metadata } from 'next';
import { AFFILIATE_NOTE, ELIJAH_LINKS, LINKS_TAGLINE, LINKS_TITLE, type LinkButton } from './links';

/**
 * /elijah — Elijah's links, one mobile page (LINKS-PAGE, 2026-09-29). Open to anyone signed out: no session read, no
 * redirect, no database, no request of its own, no script, no tracking, no cookie or storage write, no package, no
 * external font or image. A server component; the buttons are plain links (the two internal ones with prefetch off,
 * so the page makes no background request; the external ones open a new tab). lib/links/elijah.test.tsx pins it.
 */
export const metadata: Metadata = { title: 'Elijah Bonds · Links', description: 'Final Evolution Lab' };

/** The system font (as lib/screen/ui.ts SYSTEM_FONT_STACK): the root body class is IBM Plex, this page is not. */
const SYSTEM_FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// The Quick Screen's button classes (app/play/mirror/assess/_components/screen-ui.tsx), copied, not imported.
const primaryBtn = 'inline-flex w-full min-h-[52px] items-center justify-center rounded-full bg-[#00E5FF] px-6 py-3.5 text-center text-[16px] font-black text-black';
const outlineBtn = 'inline-flex w-full min-h-[52px] items-center justify-center rounded-full border-2 border-[#00E5FF] px-6 py-3 text-center text-[15px] font-bold text-[#00E5FF]';
const quietBtn = 'inline-flex w-full min-h-[52px] items-center justify-center rounded-full border border-white/20 px-6 py-3 text-center text-[15px] font-bold text-white';

function Button({ b, className }: { b: LinkButton; className: string }) {
  const inner = (
    <>
      <span>{b.label}</span>
      {b.affiliate ? <span data-affiliate className="ml-2 rounded-full border border-white/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/60">affiliate</span> : null}
    </>
  );
  return b.external ? (
    <a href={b.href} target="_blank" rel="noopener noreferrer" data-link={b.label} className={className}>{inner}</a>
  ) : (
    <Link href={b.href} prefetch={false} data-link={b.label} className={className}>{inner}</Link>
  );
}

export default function ElijahLinksPage() {
  const internal = ELIJAH_LINKS.filter((b) => !b.external);
  const external = ELIJAH_LINKS.filter((b) => b.external);
  return (
    <main data-links-page className="min-h-screen bg-[#050505] text-white" style={{ fontFamily: SYSTEM_FONT_STACK }}>
      <div className="mx-auto flex max-w-[480px] flex-col gap-3 px-4 pb-12 pt-10">
        <header className="mb-3 text-center">
          <h1 className="text-[28px] font-black leading-tight tracking-tight">{LINKS_TITLE}</h1>
          <p className="mt-1 text-[13px] font-bold uppercase tracking-[0.18em] text-[#00E5FF]">{LINKS_TAGLINE}</p>
        </header>
        {internal.map((b, i) => <Button key={b.href} b={b} className={i === 0 ? primaryBtn : outlineBtn} />)}
        {external.map((b, i) => {
          const firstOfGroup = b.group && external[i - 1]?.group !== b.group;
          return (
            <div key={b.href} className="contents">
              {firstOfGroup ? <p data-group={b.group} className="mt-2 px-1 text-[12px] font-bold uppercase tracking-[0.16em] text-white/55">{b.group}</p> : null}
              <Button b={b} className={quietBtn} />
            </div>
          );
        })}
        <p className="mt-4 text-center text-[12px] text-white/50">{AFFILIATE_NOTE}</p>
      </div>
    </main>
  );
}
