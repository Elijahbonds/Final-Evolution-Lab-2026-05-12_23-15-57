'use client';

// ACCOUNT-DELETE (owner decision 2, 2026-10-25): "Delete my account", with a confirm step, in account settings.
// The words are lib/data-rights/deleteCopy.ts (product copy that must match the policy). The server decides everything
// (app/api/account/delete/route.ts): this only shows what it says and sends what the person typed.

import { useState } from 'react';
import { Download, Loader2, Trash2 } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { DELETE_COPY as C, blockMessage } from '@/lib/data-rights/deleteCopy';
import type { DeleteBlock } from '@/lib/data-rights/deleteGate';

export type DeleteStage = 'closed' | 'loading' | 'blocked' | 'form' | 'done';

export interface DeletePanelProps {
  stage: DeleteStage;
  block: DeleteBlock | null;
  email: string;
  password: string;
  confirmed: boolean;
  busy: boolean;
  error: string | null;
  onOpen: () => void;
  onCancel: () => void;
  onEmail: (v: string) => void;
  onPassword: (v: string) => void;
  onConfirmed: (v: boolean) => void;
  onSubmit: () => void;
}

/** Ready to send: an email typed, a password typed, and the box ticked. The server checks all three again. */
export function canSubmit(p: Pick<DeletePanelProps, 'email' | 'password' | 'confirmed' | 'busy'>): boolean {
  return !p.busy && p.confirmed && p.email.trim().length > 0 && p.password.length > 0;
}

function List({ title, lines }: { title: string; lines: readonly string[] }) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-bold text-white">{title}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-white/60">
        {lines.map((l) => <li key={l}>{l}</li>)}
      </ul>
    </div>
  );
}

export function DeleteAccountPanel(p: DeletePanelProps) {
  if (p.stage === 'done') {
    return (
      <section className="mt-8 rounded-xl border border-white/10 bg-white/[0.02] p-5" aria-live="polite">
        <p className="text-sm text-white">{C.done}</p>
      </section>
    );
  }
  return (
    <section className="mt-8 rounded-xl border border-[#FF3366]/20 bg-white/[0.02] p-5" aria-labelledby="delete-account-heading">
      <h2 id="delete-account-heading" className="fel-heading text-lg font-bold text-white">{C.heading}</h2>
      <p className="mt-1 text-xs text-white/50">{C.lede}</p>
      {p.stage === 'closed' ? (
        <button
          type="button"
          onClick={p.onOpen}
          className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-md border border-[#FF3366]/30 bg-[#FF3366]/10 px-4 py-2 text-[16px] font-bold text-[#FF3366]"
        >
          <Trash2 className="h-4 w-4" /> {C.open}
        </button>
      ) : (
        <div>
          <a
            href="/api/account/export"
            className="mt-4 inline-flex items-center gap-2 rounded-md border border-[#00E5FF]/30 bg-[#00E5FF]/10 px-4 py-2 text-xs font-bold text-[#00E5FF]"
          >
            <Download className="h-3.5 w-3.5" /> {C.downloadFirst}
          </a>
          <List title={C.deleted.title} lines={C.deleted.lines} />
          <List title={C.kept.title} lines={C.kept.lines} />
          <p className="mt-4 text-xs text-white/60">{C.signOut}</p>

          {p.stage === 'loading' && <Loader2 className="mt-4 h-4 w-4 animate-spin text-white/50" aria-label="Loading" />}

          {p.stage === 'blocked' && p.block && (() => {
            const m = blockMessage(p.block);
            return (
              <div className="mt-4 rounded-md border border-[#FFB020]/30 bg-[#FFB020]/10 p-3" role="status">
                <h3 className="text-sm font-bold text-[#FFB020]">{m.title}</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-white/80">
                  {m.lines.map((l) => <li key={l}>{l}</li>)}
                </ul>
              </div>
            );
          })()}

          {p.stage === 'form' && (
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => { e.preventDefault(); if (canSubmit(p)) p.onSubmit(); }}
            >
              <label className="block text-xs text-white/70">
                {C.emailLabel}
                <input
                  type="email"
                  name="confirm-email"
                  autoComplete="off"
                  value={p.email}
                  onChange={(e) => p.onEmail(e.target.value)}
                  className="mt-1 block w-full max-w-sm rounded-md border border-white/20 bg-black/40 px-3 py-2 text-[16px] text-white"
                />
              </label>
              <label className="block text-xs text-white/70">
                {C.passwordLabel}
                <input
                  type="password"
                  name="current-password"
                  autoComplete="current-password"
                  value={p.password}
                  onChange={(e) => p.onPassword(e.target.value)}
                  className="mt-1 block w-full max-w-sm rounded-md border border-white/20 bg-black/40 px-3 py-2 text-[16px] text-white"
                />
              </label>
              <label className="flex max-w-xl items-start gap-2 text-xs text-white/80">
                <input
                  type="checkbox"
                  checked={p.confirmed}
                  onChange={(e) => p.onConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span>{C.confirmLabel}</span>
              </label>
              {p.error && <p className="text-xs text-[#FF3366]" role="alert">{p.error}</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={!canSubmit(p)}
                  className="inline-flex min-h-12 items-center gap-2 rounded-md bg-[#FF3366] px-4 py-2 text-[16px] font-bold text-white disabled:opacity-40"
                >
                  {p.busy ? <><Loader2 className="h-4 w-4 animate-spin" /> {C.working}</> : C.button}
                </button>
                <button
                  type="button"
                  onClick={p.onCancel}
                  disabled={p.busy}
                  className="min-h-12 rounded-md border border-white/20 px-4 py-2 text-[16px] text-white/60"
                >
                  {C.cancel}
                </button>
              </div>
            </form>
          )}

          {p.stage === 'blocked' && (
            <button type="button" onClick={p.onCancel} className="mt-3 min-h-12 rounded-md border border-white/20 px-4 py-2 text-[16px] text-white/60">
              {C.cancel}
            </button>
          )}
          {p.stage !== 'form' && p.error && <p className="mt-3 text-xs text-[#FF3366]" role="alert">{p.error}</p>}
        </div>
      )}
    </section>
  );
}

/** The message for a refused POST, from its status and error code. */
export function deleteErrorMessage(status: number, code: unknown): string {
  if (status === 401) return C.errors.signedOut;
  if (status === 429) return C.errors.rateLimited;
  if (status === 403) return C.errors.reauth;
  if (status === 400 && code === 'confirm_required') return C.errors.confirm;
  return C.errors.failed;
}

export function DeleteAccount() {
  const [stage, setStage] = useState<DeleteStage>('closed');
  const [block, setBlock] = useState<DeleteBlock | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // a POST whose answer never arrived: it may have gone through, which ends this session, so the retry's 401 means done
  const [unsure, setUnsure] = useState(false);

  const reset = () => {
    setStage('closed'); setBlock(null); setEmail(''); setPassword(''); setConfirmed(false); setError(null);
  };

  const open = async () => {
    setStage('loading');
    setError(null);
    try {
      const res = await fetch('/api/account/delete', { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(deleteErrorMessage(res.status, body?.error)); setStage('closed'); return; }
      if (body?.block) { setBlock(body.block as DeleteBlock); setStage('blocked'); return; }
      setStage('form');
    } catch {
      setError(C.errors.failed);
      setStage('closed');
    }
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, confirm: confirmed }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok || (res.status === 401 && unsure)) {
        setPassword('');
        setStage('done');
        // the server already cleared this browser's session cookie; this clears whatever else NextAuth keeps
        await signOut({ callbackUrl: '/' }).catch(() => { window.location.assign('/'); });
        return;
      }
      if (res.status === 409 && body?.block) { setBlock(body.block as DeleteBlock); setStage('blocked'); return; }
      setUnsure(false);
      setError(deleteErrorMessage(res.status, body?.error));
    } catch {
      setUnsure(true);
      setError(C.errors.unsure);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DeleteAccountPanel
      stage={stage}
      block={block}
      email={email}
      password={password}
      confirmed={confirmed}
      busy={busy}
      error={error}
      onOpen={() => { void open(); }}
      onCancel={reset}
      onEmail={setEmail}
      onPassword={setPassword}
      onConfirmed={setConfirmed}
      onSubmit={() => { void submit(); }}
    />
  );
}
