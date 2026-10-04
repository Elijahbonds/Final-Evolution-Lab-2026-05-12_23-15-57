'use client';

import { useEffect, useState } from 'react';
import { BundleMissingParts } from './bundle-missing-parts';
import { parseAlreadyOwned, partCheckoutBody, type AlreadyOwnedBundleView, type BundlePartWithListing } from '@/lib/coach-store/bundleParts';

export function BookForm({
  slug,
  listingId,
  kind,
  durationMin = 30,
  audience,
}: {
  slug: string;
  listingId: string;
  kind: string;
  durationMin?: 30 | 60;
  audience?: 'adult' | 'teen';
}) {
  const [slots, setSlots] = useState<{ startsAt: string; label: string; durationMin: number }[]>([]);
  const [who, setWho] = useState<'self' | 'teen'>(audience === 'teen' ? 'teen' : 'self');
  const [startsAt, setStartsAt] = useState('');
  const [goal, setGoal] = useState('Dunk');
  const [painYes, setPainYes] = useState<boolean | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [bundleView, setBundleView] = useState<AlreadyOwnedBundleView | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [partErrors, setPartErrors] = useState<Record<string, string>>({});

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
    setBundleView(null);
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
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const parsed = json.error === 'already_owned' ? parseAlreadyOwned(json) : null;
      if (parsed) { setBundleView(parsed); return; }
      setError(json.message || json.error || 'Could not start checkout');
      return;
    }
    if (json.unlockCode) sessionStorage.setItem(`fel-unlock-${json.rowId}`, json.unlockCode);
    if (json.url) window.location.href = json.url;
  };

  const buyPart = async (part: BundlePartWithListing) => {
    if (!part.listingId) return;
    setPartErrors((prev) => { const next = { ...prev }; delete next[part.key]; return next; });
    setBusyKey(part.key);
    try {
      const res = await fetch('/api/coach-store/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partCheckoutBody(part, currentBeneficiary())),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPartErrors((prev) => ({ ...prev, [part.key]: json.message || json.error || 'Could not start checkout' }));
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
        />
      ) : error ? <p className="text-sm text-red-300">{error}</p> : null}
      <button type="button" className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-bold text-black" onClick={submit}>Continue</button>
    </div>
  );
}
