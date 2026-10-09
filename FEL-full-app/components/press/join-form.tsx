'use client';

import { useState } from 'react';

/** Posts to the existing mailing-list route. That route is single opt-in. */
export function JoinForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'busy') return;
    setStatus('busy');
    setMessage(null);
    try {
      const res = await fetch('/api/marketing/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, source: 'press' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus('error');
        setMessage(typeof body?.error === 'string' ? body.error : 'Could not save that email.');
        return;
      }
      setStatus('done');
      setMessage('You’re on the list. Unsubscribe any time.');
    } catch {
      setStatus('error');
      setMessage('Could not save that email.');
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-3 sm:flex-row">
      <label className="sr-only" htmlFor="press-email">Email</label>
      <input
        id="press-email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#F5C518]/70"
      />
      <button
        type="submit"
        disabled={status === 'busy'}
        className="rounded-md bg-[#F5C518] px-5 py-2 text-sm font-semibold text-black hover:bg-[#ffd84a] disabled:opacity-60"
      >
        {status === 'busy' ? 'Sending…' : 'Send it'}
      </button>
      {message ? (
        <p className={`text-xs sm:self-center ${status === 'error' ? 'text-[#ff8b8b]' : 'text-white/60'}`}>{message}</p>
      ) : null}
    </form>
  );
}
