'use client';

import { useEffect, useState } from 'react';
import { BundleMissingParts } from './bundle-missing-parts';
import { parseAlreadyOwned, partCheckoutBody, type AlreadyOwnedBundleView, type BundlePartWithListing } from '@/lib/coach-store/bundleParts';
import { coachBookReturnPath, coachSignInHref, isSlotValue } from '@/lib/coach-store/signInReturn';
import { STORE_TERMS_VERSION } from '@/lib/store-terms';

// STORE-TERMS-3 (T6): the briefed notice shown when the buyer tries to continue without ticking the box.
export const TERMS_REQUIRED_NOTICE = 'Please read and agree to the store terms to continue.';

export function BookForm({
  slug,
  listingId,
  kind,
  durationMin = 30,
  audience,
  continueLabel = 'Continue',
  initialStartsAt = '',
}: {
  slug: string;
  listingId: string;
  kind: string;
  durationMin?: 30 | 60;
  audience?: 'adult' | 'teen';
  continueLabel?: string;
  /** STORE-SIGNIN-RETURN: the slot from the sign-in return URL, so the buyer's pick survives the login hop. */
  initialStartsAt?: string;
}) {
  const [slots, setSlots] = useState<{ startsAt: string; label: string; durationMin: number }[]>([]);
  const [who, setWho] = useState<'self' | 'teen'>(audience === 'teen' ? 'teen' : 'self');
  const [startsAt, setStartsAt] = useState(isSlotValue(initialStartsAt) ? initialStartsAt : '');
  const [goal, setGoal] = useState('Dunk');
  const [painYes, setPainYes] = useState<boolean | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [closedNotice, setClosedNotice] = useState('');
  // STORE-TERMS-2: the terms checkbox starts UNTICKED on every load (never pre-ticked, never remembered).
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [authError, setAuthError] = useState<'sign_in' | 'adults_only' | null>(null);
  const [bundleView, setBundleView] = useState<AlreadyOwnedBundleView | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [partErrors, setPartErrors] = useState<Record<string, string>>({});
  const [partAuth, setPartAuth] = useState<Record<string, 'sign_in' | 'adults_only'>>({});

  // STORE-SIGNIN-RETURN: 401 -> "Sign in to continue" (next= carries listing + slot); 403 adults_only -> plain copy.
  const authOrMessage = (res: Response, json: { error?: string; message?: string }): 'sign_in' | 'adults_only' | 'store_closed' | string => {
    if (res.status === 401 || json.error === 'unauthorized') return 'sign_in';
    if (res.status === 403 && json.error === 'adults_only') return 'adults_only';
    // STORE-READY B2: a closed store is a friendly "Checkout opens soon." notice, never the red error text.
    if (res.status === 409 && json.error === 'store_closed') return 'store_closed';
    // STORE-TERMS-2: the server rejected a missing/stale terms tick — re-prompt in place.
    if (res.status === 409 && json.error === 'terms_required') return 'terms_required';
    return json.message || json.error || 'Could not start checkout';
  };

  useEffect(() => {
    if (kind !== 'live_1on1') return;
    fetch(`/api/coach-store/${slug}/slots?duration=${durationMin}`)
      .then((r) => r.json())
      .then((j) => setSlots(j.slots ?? []))
      .catch(() => setSlots([]));
  }, [kind, slug, durationMin]);

  const currentBeneficiary = (): 'self' | 'teen' => (kind === 'membership' ? (audience === 'teen' ? 'teen' : 'self') : who);

  const submit = async () => {
    setError('');
    setClosedNotice('');
    setAuthError(null);
    setBundleView(null);
    // STORE-TERMS-2: required terms tick — a friendly client-side stop before the POST (the server is the real gate).
    if (!termsAgreed) { setError(TERMS_REQUIRED_NOTICE); return; }
    const beneficiary = currentBeneficiary();
    const res = await fetch('/api/coach-store/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listingId,
        beneficiary,
        startsAt: startsAt || undefined,
        goal: kind === 'video_review' ? goal : undefined,
        painYes: kind === 'video_review' ? painYes : undefined,
        note: kind === 'video_review' ? note : undefined,
        termsAccepted: true,
        termsVersion: STORE_TERMS_VERSION,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const parsed = json.error === 'already_owned' ? parseAlreadyOwned(json) : null;
      if (parsed) { setBundleView(parsed); return; }
      const outcome = authOrMessage(res, json);
      if (outcome === 'sign_in' || outcome === 'adults_only') setAuthError(outcome);
      else if (outcome === 'store_closed') setClosedNotice('Checkout opens soon.');
      else if (outcome === 'terms_required') setError(TERMS_REQUIRED_NOTICE);
      else setError(outcome);
      return;
    }
    if (json.unlockCode) sessionStorage.setItem(`fel-unlock-${json.rowId}`, json.unlockCode);
    if (json.url) window.location.href = json.url;
  };

  const buyPart = async (part: BundlePartWithListing) => {
    if (!part.listingId) return;
    setPartErrors((prev) => { const next = { ...prev }; delete next[part.key]; return next; });
    setPartAuth((prev) => { const next = { ...prev }; delete next[part.key]; return next; });
    // STORE-TERMS-2: a bundle-part buy is a checkout too — the same required tick applies (server is the gate).
    if (!termsAgreed) { setError(TERMS_REQUIRED_NOTICE); return; }
    setBusyKey(part.key);
    try {
      const res = await fetch('/api/coach-store/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...partCheckoutBody(part, currentBeneficiary()), termsAccepted: true, termsVersion: STORE_TERMS_VERSION }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const outcome = authOrMessage(res, json);
        if (outcome === 'sign_in' || outcome === 'adults_only') setPartAuth((prev) => ({ ...prev, [part.key]: outcome }));
        else if (outcome === 'terms_required') setError(TERMS_REQUIRED_NOTICE);
        else setPartErrors((prev) => ({ ...prev, [part.key]: outcome }));
        return;
      }
      if (json.unlockCode) sessionStorage.setItem(`fel-unlock-${json.rowId}`, json.unlockCode);
      if (json.url) window.location.href = json.url;
    } finally {
      setBusyKey(null);
    }
  };

  const labelFor = (slot: { startsAt: string; label: string }) => {
    const local = new Date(slot.startsAt).toLocaleString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
    return `${slot.label} · ${local} local`;
  };

  const signInHref = coachSignInHref(slug, listingId, startsAt);
  const returnPath = coachBookReturnPath(slug, listingId, startsAt);
  const ageHref = returnPath ? `/age?next=${encodeURIComponent(returnPath)}` : '/age';
  // The returned slot may be taken or stale by the time the buyer is back; keep it selectable anyway so the
  // form shows what they picked instead of snapping back to "Choose a time".
  const preselectMissing = startsAt !== '' && !slots.some((s) => s.startsAt === startsAt);

  const authBlock = (which: 'sign_in' | 'adults_only') => (
    <div className="space-y-2 rounded-xl border border-white/20 p-3 text-sm" role="alert">
      {which === 'sign_in' ? (
        <p>
          <a className="font-bold text-cyan-300 underline" href={signInHref}>Sign in to continue</a>
          {' '}— we&apos;ll bring you right back here{startsAt ? ' with your time kept' : ''}.
        </p>
      ) : (
        <p>
          Buying coaching is for verified adults (18+). If you&apos;re 18 or older,{' '}
          <a className="font-bold text-cyan-300 underline" href={ageHref}>confirm your birth year</a>, then come back.
          Under 18? A parent or guardian can buy this for you.
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-4 text-white">
      <p className="text-sm text-white/70">Free cancel or reschedule until 24 hours before the start. Inside that window: no refund, one free reschedule. All times Pacific, plus your local zone.</p>
      {kind === 'program' || kind === 'course' || kind === 'series' || kind === 'bundle' ? (
        <fieldset>
          <legend className="text-sm font-bold">Who is this for?</legend>
          <label className="mr-4 text-sm"><input type="radio" name="who" checked={who === 'self'} onChange={() => setWho('self')} /> Me</label>
          <label className="text-sm"><input type="radio" name="who" checked={who === 'teen'} onChange={() => setWho('teen')} /> My teen (13–17)</label>
        </fieldset>
      ) : null}
      {kind === 'membership' && audience === 'teen' ? <p className="text-sm">This membership is for your teen (13–17). Progress stays on their phone.</p> : null}
      {kind === 'live_1on1' ? (
        <label className="block text-sm">Time ({durationMin} min)
          <select className="mt-1 w-full rounded-lg bg-black p-2" value={startsAt} onChange={(e) => setStartsAt(e.target.value)}>
            <option value="">Choose a time</option>
            {preselectMissing ? <option value={startsAt}>{labelFor({ startsAt, label: 'Your earlier pick' })}</option> : null}
            {slots.map((s) => <option key={s.startsAt} value={s.startsAt}>{labelFor(s)}</option>)}
          </select>
        </label>
      ) : null}
      {kind === 'video_review' ? (
        <>
          <label className="block text-sm">Goal
            <select className="mt-1 w-full rounded-lg bg-black p-2" value={goal} onChange={(e) => setGoal(e.target.value)}>
              {['Dunk', 'Vertical', 'Posture', 'Coming back from injury'].map((g) => <option key={g}>{g}</option>)}
            </select>
          </label>
          <p className="text-sm">Does anything hurt?</p>
          <label className="mr-4 text-sm"><input type="radio" name="pain" onChange={() => setPainYes(true)} /> Yes</label>
          <label className="text-sm"><input type="radio" name="pain" onChange={() => setPainYes(false)} /> No</label>
          <label className="block text-sm">Note ({note.length}/300)
            <textarea maxLength={300} className="mt-1 w-full rounded-lg bg-black p-2" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <p className="text-sm text-white/60">Your original clip is deleted 30 days after your review.</p>
        </>
      ) : null}
      {bundleView ? (
        <BundleMissingParts
          owned={bundleView.ownedParts}
          missing={bundleView.missing}
          onBuy={buyPart}
          busyKey={busyKey}
          errors={partErrors}
          auth={partAuth}
          renderAuth={(_part, which) => authBlock(which)}
          buyDisabled={!termsAgreed}
        />
      ) : authError ? authBlock(authError) : closedNotice ? (
        <p className="rounded-xl border border-white/20 p-3 text-sm text-white/80" role="status">{closedNotice}</p>
      ) : error ? <p className="text-sm text-red-300">{error}</p> : null}
      <label className="flex items-start gap-2 text-sm text-white/80">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={termsAgreed}
          onChange={(e) => setTermsAgreed(e.target.checked)}
        />
        <span>
          I have read and agree to the{' '}
          <a className="font-bold text-cyan-300 underline" href="/store-terms" target="_blank" rel="noopener noreferrer">
            Store Terms &amp; Refund Policy
          </a>
          .
        </span>
      </label>
      <button
        type="button"
        className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-bold text-black disabled:opacity-60"
        onClick={submit}
        disabled={!termsAgreed}
      >
        {continueLabel}
      </button>
    </div>
  );
}
