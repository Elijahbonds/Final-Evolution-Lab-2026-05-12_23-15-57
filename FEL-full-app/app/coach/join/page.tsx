import Link from 'next/link';
import { normalizeCode, formatCode } from '@/lib/coach/inviteCode';
import { CodeForm } from './code-form';

export const dynamic = 'force-dynamic';

/**
 * /coach/join — type the code your coach gave you (coach-loop P1, 2026-10-20). The link and the QR open
 * /coach/join/[token] directly; this is the third way in, for a code on a whiteboard, a printed sheet or a voice
 * across the court. `?code=` pre-fills it. Signed-out visitors are welcome: the landing page it leads to handles sign-up.
 */
export default function JoinByCodePage({ searchParams }: { searchParams?: { code?: string | string[] } }) {
  const raw = Array.isArray(searchParams?.code) ? searchParams?.code[0] : searchParams?.code;
  const code = normalizeCode(raw);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-fel-bg px-4 text-center sm:px-6">
      <Link href="/" className="fel-heading mb-10 text-lg font-bold text-white">
        FINAL <span className="text-fel-cyan">EVOLUTION</span> LAB
      </Link>
      <p className="font-mono text-[11px] uppercase tracking-widest text-fel-dim">Coach invite</p>
      <h1 className="fel-heading mt-3 text-2xl font-bold text-white sm:text-3xl">Got a code from your coach?</h1>
      <p className="mt-3 max-w-sm text-sm text-white/55">Type it in. You will see whose roster it is before you join.</p>
      <CodeForm initial={code ? formatCode(code) : ''} />
    </div>
  );
}
