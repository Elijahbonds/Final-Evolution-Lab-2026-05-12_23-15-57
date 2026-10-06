'use client';

// MIRROR-COACH P5 (2026-09-29): the "Ask a parent or guardian" screen, in front of the Mirror and (as a standalone
// destination, app/consent/guardian/page.tsx) the way in from a locked pain check-in.
//
// Owner decision #6: guardian consent before the Mirror OR pain check-ins, for anyone under 18 or with no birth year
// on file (decision #20 — blank reads as the careful case). The RULE lives in lib/consent/guardianGate.ts; this
// component asks GET /api/health/guardian where the signed-in athlete stands and, when a request is needed, POSTS
// straight to the EXISTING camp flow (POST /api/v1/camp/consent) rather than a parallel one — PHASE-5 CONTRACT says
// to reuse it, and lib/pro-guard.ts's own NEVER_GATED list already keeps that route open to every account, paid or
// not, for exactly this reason (a guardian consent control must never be something billing can block).
//
// FEL SENDS NO EMAIL. The camp route asks for a guardian name + email because the GuardianConsent row is a record
// of WHOSE consent this is, not a mailing list — nothing here, or anywhere else in this phase, sends that address
// anything. The athlete gets the accept link back in this same screen and copies or shares it themselves (text, DM,
// however they'd share anything else from their own phone), which is why the form says so before it asks for either
// field: an athlete who is not told this will reasonably expect FEL to do the sending, wait for an email that is
// never coming, and conclude the feature is broken.
//
// REUSABLE ON PURPOSE, same as app/play/mirror/_components/health-intake-gate.tsx one door over: colocated under
// app/play/mirror because the Mirror is this phase's mount point, but `children` is generic and
// app/consent/guardian/page.tsx mounts the exact same component as its own standalone page for the pain check-in's
// locked prompt to link to.

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

interface StatusResponse {
  needsGuardian: boolean;
  status: 'none' | 'pending' | 'accepted' | 'revoked';
  birthYear: number | null;
  /** MIRROR-COACH P6 FIX (2026-09-29): `token` is null and `by` is 'coach' for a request a coach or camp made — its
   *  link stays with them (app/api/health/guardian/route.ts). Only the athlete's own request hands its link back. */
  pending: { token: string | null; guardianName: string; requestedAt: string; by?: 'you' | 'coach' } | null;
}

type Stage = 'loading' | 'error' | 'ready' | 'ask' | 'pending' | 'sent';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function fetchStatus(): Promise<StatusResponse> {
  const res = await fetch('/api/health/guardian');
  if (!res.ok) throw new Error('status_failed');
  return res.json();
}

/** The same accept link a guardian taps — built here, once, so the ask form and the pending screen agree on it. */
function acceptUrl(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/consent/guardian/${token}`;
}

const REQUEST_ERROR_COPY: Record<string, string> = {
  guardian_required: "That name or email doesn't look right — check both and try again.",
  birth_year_invalid: "That birth year doesn't look right.",
  unauthorized: 'Sign in again and try once more.',
};

function GateShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.04] p-5">{children}</div>
    </div>
  );
}

const primaryBtn = 'w-full rounded-xl bg-[#00E5FF] py-3 text-[15px] font-bold text-black disabled:opacity-50';
const quietBtn = 'w-full rounded-xl border border-white/15 bg-transparent py-3 text-[14px] font-semibold text-white/70 disabled:opacity-50';
const fieldCls = 'w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-[15px] text-white outline-none';

/** The copy/share link row, shared between the fresh-request screen and the still-pending screen. */
function LinkToShare({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const url = acceptUrl(token);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard can refuse (no permission, non-https preview) — the link is still selectable text below
    }
  };
  // MIRROR-COACH P6 (2026-09-29): the link this screen hands out is a PLAYER request (the POST below omits menteeId,
  // so app/api/v1/camp/consent stores it selfRequested), and it now confirms only from a signed-in adult account that
  // is not this one — so the copy says so up front, or the athlete tells a parent "just tap it" and the parent meets
  // a sign-in wall they were not warned about.
  return (
    <div className="mt-3 space-y-2">
      <p className="text-[12px] leading-snug text-white/55">
        FEL doesn&apos;t send this anywhere — copy the link and send it yourself, the same way you&apos;d share anything
        else from your phone (a text, a DM, however&apos;s easiest). They confirm it from their own FEL account (free
        to make) — opening it yourself won&apos;t confirm it.
      </p>
      <div className="break-all rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-[12px] text-white/70">{url}</div>
      <button type="button" onClick={copy} className={quietBtn}>
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </div>
  );
}

export function GuardianConsentGate({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<Stage>('loading');
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [guardianName, setGuardianName] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [sentToken, setSentToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStatus()
      .then((data) => {
        if (cancelled) return;
        setStatus(data);
        if (data.birthYear) setBirthYear(String(data.birthYear));
        setStage(!data.needsGuardian || data.status === 'accepted' ? 'ready' : data.status === 'pending' ? 'pending' : 'ask');
      })
      .catch(() => {
        if (!cancelled) setStage('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const canSubmit = guardianName.trim().length > 0 && EMAIL.test(guardianEmail.trim()) && /^\d{4}$/.test(birthYear.trim());

  async function submitRequest() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/camp/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guardianName: guardianName.trim(),
          guardianEmail: guardianEmail.trim(),
          menteeBirthYear: Number(birthYear.trim()),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(REQUEST_ERROR_COPY[data?.error] ?? "That didn't save — check your connection and try again.");
        return;
      }
      setSentToken(data.token);
      setStage('sent');
    } catch {
      setError("That didn't save — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (stage === 'ready') return <>{children}</>;

  if (stage === 'loading') {
    return (
      <GateShell>
        <p className="text-[14px] text-white/60">Checking…</p>
      </GateShell>
    );
  }

  if (stage === 'error') {
    return (
      <GateShell>
        <p className="text-[14px] text-white/60">Couldn&apos;t load this. Refresh to try again.</p>
      </GateShell>
    );
  }

  // MIRROR-COACH P6 FIX (2026-09-29): a coach's or camp's pending request. Its accept link is theirs, not this
  // screen's to hand out (the status route no longer returns it), so this says who has it and offers the athlete's own
  // request, whose link they share themselves.
  if (stage === 'pending' && status?.pending && !status.pending.token) {
    return (
      <GateShell>
        <h2 className="text-[20px] font-black leading-tight text-white" data-pending-by="coach">Waiting on {status.pending.guardianName}</h2>
        <p className="mt-2 text-[13.5px] leading-snug text-white/70">
          Your coach or camp asked {status.pending.guardianName} on {new Date(status.pending.requestedAt).toLocaleDateString()},
          and they have the link. Once {status.pending.guardianName} confirms it, this unlocks.
        </p>
        <button type="button" onClick={() => setStage('ask')} className={`${quietBtn} mt-3`}>
          Ask a parent or guardian myself
        </button>
      </GateShell>
    );
  }

  if (stage === 'pending' && status?.pending?.token) {
    return (
      <GateShell>
        <h2 className="text-[20px] font-black leading-tight text-white">Waiting on {status.pending.guardianName}</h2>
        <p className="mt-2 text-[13.5px] leading-snug text-white/70">
          You asked on {new Date(status.pending.requestedAt).toLocaleDateString()}. Once they use the link below,
          this unlocks — no need to ask again.
        </p>
        <LinkToShare token={status.pending.token} />
        <button type="button" onClick={() => setStage('ask')} className={`${quietBtn} mt-3`}>
          Ask someone else instead
        </button>
      </GateShell>
    );
  }

  if (stage === 'sent' && sentToken) {
    return (
      <GateShell>
        <h2 className="text-[20px] font-black leading-tight text-white">Almost there</h2>
        <p className="mt-2 text-[13.5px] leading-snug text-white/70">
          Send this link to {guardianName || 'your parent or guardian'}. Once they confirm it, you&apos;re in.
        </p>
        <LinkToShare token={sentToken} />
      </GateShell>
    );
  }

  // stage === 'ask'
  return (
    <GateShell>
      <h2 className="text-[20px] font-black leading-tight text-white">Ask a parent or guardian</h2>
      <p className="mt-2 text-[13.5px] leading-snug text-white/70">
        {status?.status === 'revoked'
          ? 'A guardian consent on your account was withdrawn. Ask again so a camp plan your coach builds with you can go live.'
          : "Because you're under 18 (or haven't told us your birth year yet), a parent or guardian needs to say it's OK before a camp plan your coach builds with you can go live. This is safety, not a paywall — it's free either way."}
      </p>
      <div className="mt-4 space-y-2.5">
        <input
          value={guardianName}
          onChange={(e) => setGuardianName(e.target.value)}
          placeholder="Parent or guardian's name"
          className={fieldCls}
        />
        <input
          value={guardianEmail}
          onChange={(e) => setGuardianEmail(e.target.value)}
          placeholder="Their email (for our records — we won't send them anything)"
          inputMode="email"
          className={fieldCls}
        />
        <input
          value={birthYear}
          onChange={(e) => setBirthYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
          placeholder="Your birth year, e.g. 2012"
          inputMode="numeric"
          className={fieldCls}
        />
        <button type="button" disabled={!canSubmit || busy} onClick={submitRequest} className={primaryBtn}>
          {busy ? 'Sending…' : 'Get a link to share'}
        </button>
      </div>
      {error && <p className="mt-2 text-[12px] text-red-400">{error}</p>}
    </GateShell>
  );
}
