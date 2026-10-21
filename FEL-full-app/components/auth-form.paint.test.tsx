// LOGIN-NO-PAINT (2026-10-20) regression test: /login was blank for a logged-out visitor on a phone. The cause was
// in the server HTML itself: AuthForm's card was a motion.div with initial={{ opacity: 0 }}, which framer-motion
// writes into the SSR markup as style="opacity:0", so the credentials form only became visible once the client bundle
// hydrated and ran the fade. Until then (and forever, if the JS never ran) the page painted as an empty dark screen.
//
// This renders the REAL /login page (app/login/page.tsx) with no session, the way the server does for a logged-out
// phone, and checks that what the browser receives paints the form before any script runs: the form, both fields
// and the submit button are in the markup, and nothing that encloses them is transparent or hidden at a phone
// width (no inline opacity:0 / visibility:hidden / display:none, and no unprefixed `hidden` / `invisible` / `opacity-0`
// class; an `sm:` or wider prefix does not apply at 390 px).
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

const getServerSession = vi.fn(async () => null);
vi.mock('next-auth', () => ({ getServerSession: () => getServerSession() }));
vi.mock('next-auth/react', () => ({ signIn: vi.fn(), signOut: vi.fn() }));
// authOptions pulls in the Prisma client; the page only hands it to getServerSession, which is mocked above.
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
const redirect = vi.fn((to: string) => { throw new Error(`redirected to ${to}`); });
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) }));

import LoginPage from '@/app/login/page';

type Node = { tag: string; attrs: string };

/** The open-tag ancestor chain (outermost first) of the first element whose open tag matches `target`. */
function ancestorsOf(html: string, target: RegExp): Node[] | null {
  const VOID = new Set(['img', 'input', 'br', 'hr', 'meta', 'link', 'source', 'area', 'col', 'embed', 'wbr']);
  const stack: Node[] = [];
  const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const [whole, close, tagRaw, attrs] = m;
    const tag = tagRaw.toLowerCase();
    if (close) {
      const i = stack.map((n) => n.tag).lastIndexOf(tag);
      if (i >= 0) stack.length = i;
      continue;
    }
    if (target.test(whole)) return [...stack, { tag, attrs }];
    if (!VOID.has(tag) && !attrs.trimEnd().endsWith('/')) stack.push({ tag, attrs });
  }
  return null;
}

function hidesAtPhoneWidth(n: Node): string | null {
  const style = /style="([^"]*)"/.exec(n.attrs)?.[1]?.replace(/\s+/g, '') ?? '';
  if (/(^|;)opacity:0(\.0+)?(;|$)/.test(style)) return `inline opacity:0 on <${n.tag}>`;
  if (/(^|;)visibility:hidden/.test(style)) return `inline visibility:hidden on <${n.tag}>`;
  if (/(^|;)display:none/.test(style)) return `inline display:none on <${n.tag}>`;
  const classes = (/class="([^"]*)"/.exec(n.attrs)?.[1] ?? '').split(/\s+/);
  const bad = classes.find((c) => c === 'hidden' || c === 'invisible' || c === 'opacity-0');
  return bad ? `class "${bad}" on <${n.tag}>` : null;
}

async function loggedOutLoginHtml(): Promise<string> {
  const el = await LoginPage({ searchParams: {} });
  return renderToString(el);
}

describe('/login paints its form for a logged-out visitor on a phone, before any script runs', () => {
  it('renders the credentials form (no redirect) when there is no session', async () => {
    const html = await loggedOutLoginHtml();
    expect(redirect).not.toHaveBeenCalled();
    expect(html).toMatch(/<form[\s>]/);
    expect(html).toMatch(/<input[^>]*type="email"/);
    expect(html).toMatch(/<input[^>]*type="password"/);
    expect(html).toContain('ENTER THE LAB');
  });

  for (const [what, target] of [
    ['the form', /^<form[\s>]/],
    ['the email field', /^<input[^>]*type="email"/],
    ['the password field', /^<input[^>]*type="password"/],
    ['the submit button', /^<button[^>]*type="submit"/],
    ['the title', /^<h1[\s>]/],
  ] as const) {
    it(`${what}: no ancestor is transparent or hidden in the server HTML`, async () => {
      const html = await loggedOutLoginHtml();
      const chain = ancestorsOf(html, target);
      expect(chain, `${what} is in the server HTML`).not.toBeNull();
      const hiders = chain!.map(hidesAtPhoneWidth).filter(Boolean);
      expect(hiders, `${what} is painted without waiting for hydration`).toEqual([]);
    });
  }

  it('the whole page carries no inline opacity:0 at all', async () => {
    const html = await loggedOutLoginHtml();
    expect(html.replace(/\s+/g, '')).not.toMatch(/opacity:0(\.0+)?(;|")/);
  });
});
