'use client';

/**
 * components/marketing/email-capture.tsx — landing-page email capture form.
 * Feeds the marketing funnel via POST /api/marketing/subscribe. Reads an
 * optional ?ref=<code> referral param from the URL and forwards it.
 */

import { useState } from 'react';
import { Loader2, Send, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface EmailCaptureProps {
  source?: string;
  heading?: string;
  sub?: string;
  className?: string;
}

export function EmailCapture({ source = 'landing', heading = 'Join the Lab', sub = 'Get early access, drops, and rewards straight to your inbox.', className }: EmailCaptureProps) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      let ref: string | null = null;
      if (typeof window !== 'undefined') {
        ref = new URLSearchParams(window.location.search).get('ref');
        // Persist so the referral survives the hop to /signup (see auth-form).
        try {
          if (ref) localStorage.setItem('fel:ref', ref.toUpperCase());
          else ref = localStorage.getItem('fel:ref');
        } catch { /* ignore */ }
      }
      const res = await fetch('/api/marketing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source, ref }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d?.error ?? 'Could not subscribe. Try again.');
        return;
      }
      setDone(true);
      toast.success(d.alreadyMember ? "You're already a member — welcome back!" : "You're on the list! Check your inbox.");
    } catch {
      toast.error('Could not subscribe. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <h3 className="text-xl font-bold text-white">{heading}</h3>
      <p className="mt-1 text-sm text-white/55">{sub}</p>
      {done ? (
        <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#00FF9D]/40 bg-[#00FF9D]/10 px-4 py-3 text-sm font-semibold text-[#00FF9D]">
          <CheckCircle2 className="h-5 w-5" /> You're on the list!
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="flex-1 rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/35 outline-none focus:border-[#00E5FF]/60"
          />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#00E5FF] px-5 py-3 text-sm font-bold text-[#001014] transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4" /> Join</>}
          </button>
        </form>
      )}
    </div>
  );
}

export default EmailCapture;
