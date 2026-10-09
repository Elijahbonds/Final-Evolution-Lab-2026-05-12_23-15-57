'use client';

import { useState } from 'react';
import { Download, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { healthEraseToast } from '@/lib/health/healthDataCopy';
import { forgetIntakeMemory } from '@/lib/health/intakeForget';

const ERASE_WARNING =
  'This permanently deletes your health intake, pain check-ins, daily check-ins, and Dial-Up Breath uses. '
  + 'Your consent records stay, as proof of what you agreed to and when you withdrew. '
  + 'It does not delete your Mirror assessments, movement history, or PRQ. '
  + 'Only this signed-in account is affected.';

export function AccountDataPanel({
  email, confirming, erasing, onAskErase, onCancel, onConfirmErase,
}: {
  email: string;
  confirming: boolean;
  erasing: boolean;
  onAskErase: () => void;
  onCancel: () => void;
  onConfirmErase: () => void;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <h2 className="fel-heading text-lg font-bold text-white">Your data</h2>
      <p className="mt-1 text-xs text-white/40">
        Signed in as {email || 'this account'}. Download a JSON file of your profile, Mirror sessions, assessments, and the health data stored here.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href="/api/account/export"
          className="inline-flex items-center gap-2 rounded-md border border-[#00E5FF]/30 bg-[#00E5FF]/10 px-4 py-2 text-xs font-bold text-[#00E5FF] transition-colors hover:bg-[#00E5FF]/20"
        >
          <Download className="h-3.5 w-3.5" /> Download my data
        </a>
        <button
          type="button"
          onClick={() => { forgetIntakeMemory(); toast.success('Saved answers on this device are gone.'); }}
          className="inline-flex min-h-12 items-center gap-2 rounded-md border border-white/20 px-4 py-2 text-[16px] font-bold text-white/80"
        >
          Forget my answers
        </button>
        {!confirming ? (
          <button
            type="button"
            onClick={onAskErase}
            className="inline-flex items-center gap-2 rounded-md border border-[#FF3366]/30 bg-[#FF3366]/10 px-4 py-2 text-xs font-bold text-[#FF3366] transition-colors hover:bg-[#FF3366]/20"
          >
            <Trash2 className="h-3.5 w-3.5" /> Erase my health data
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <p className="max-w-xl text-xs text-[#FF3366]">{ERASE_WARNING}</p>
            <button
              type="button"
              onClick={onConfirmErase}
              disabled={erasing}
              className="rounded-md bg-[#FF3366] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {erasing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Yes, erase my health data'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={erasing}
              className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-white/50 hover:text-white"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/** Account settings: download, then a confirm step before the health erase. */
export function AccountSettings({ email }: { email: string }) {
  const [confirming, setConfirming] = useState(false);
  const [erasing, setErasing] = useState(false);

  const confirmErase = async () => {
    if (erasing) return;
    forgetIntakeMemory();
    setErasing(true);
    try {
      const res = await fetch('/api/account/health-erase', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(res.status === 401 ? 'Sign in to erase your health data.' : 'Erase failed');
        return;
      }
      toast.success(healthEraseToast(body?.erased ?? {}));
      setConfirming(false);
    } catch {
      toast.error('Erase failed');
    } finally {
      setErasing(false);
    }
  };

  return (
    <AccountDataPanel
      email={email}
      confirming={confirming}
      erasing={erasing}
      onAskErase={() => setConfirming(true)}
      onCancel={() => setConfirming(false)}
      onConfirmErase={() => { void confirmErase(); }}
    />
  );
}
