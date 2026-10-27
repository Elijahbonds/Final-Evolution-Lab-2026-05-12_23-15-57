'use client';

// Notifications, in account settings (offline-push, round 8, OFF-03 / OFF-04). Adults who opt in only; never marketing.
//
// Reads GET /api/push and shows, plainly, what is possible here:
//   · not a verified adult       → "Notifications are for adults (18+) for now." Nothing to tick.
//   · not switched on yet        → says so (push needs the owner's keys and the service worker; email needs EMAIL_ENABLED).
//   · otherwise                  → one box per kind (lib/push/policy.ts KIND_LABEL; the coach one only for coaches), email
//                                  reminders when email is on, "Turn on for this device" (asks the browser's permission
//                                  only on that tap) and "Turn everything off".
// Every change goes through /api/push, which checks the age again and refuses a teen whatever this page sends.
import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { KIND_LABEL, type PushKind } from '@/lib/push/policy';
import { applicationServerKey, pushSupport, type PushSupport } from '@/lib/push/clientKey';

interface Settings {
  available: boolean; publicKey: string | null; adult: boolean; coach: boolean;
  email: { available: boolean }; kinds: PushKind[]; prefs: { kinds: PushKind[]; email: boolean }; devices: number;
}

const SUPPORT_LINE: Record<Exclude<PushSupport, 'ok'>, string> = {
  no_worker: "This browser can't show FEL notifications.",
  no_push: "This browser can't show FEL notifications.",
  denied: 'Notifications are blocked for FEL in this browser. Allow them in the browser settings, then try again.',
  ios_needs_install: 'On iPhone and iPad, add FEL to your Home Screen first (Share, then Add to Home Screen), then turn notifications on there.',
};

async function currentSubscription(): Promise<PushSubscription | null> {
  try { return await (await navigator.serviceWorker.ready).pushManager.getSubscription(); } catch { return null; }
}

export function PushSettings() {
  const [s, setS] = useState<Settings | null>(null);
  const [kinds, setKinds] = useState<PushKind[]>([]);
  const [email, setEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState('');
  const [support, setSupport] = useState<PushSupport>('ok');
  const [onHere, setOnHere] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/push', { cache: 'no-store' });
      if (!r.ok) return;
      const j = (await r.json()) as Settings;
      setS(j); setKinds(j.prefs.kinds); setEmail(j.prefs.email);
    } catch { /* offline: the block stays hidden */ }
  }, []);

  useEffect(() => {
    void load();
    setSupport(pushSupport(window as never));
    void currentSubscription().then((sub) => setOnHere(Boolean(sub)));
  }, [load]);

  if (!s) return null;

  const save = async (withDevice: boolean) => {
    setBusy(true); setLine('');
    try {
      let subscription: PushSubscriptionJSON | undefined;
      if (withDevice) {
        if (!s.publicKey) { setLine('Notifications are not switched on yet.'); return; }
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') { setSupport(permission === 'denied' ? 'denied' : support); setLine('Notifications were not allowed.'); return; }
        const reg = await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription())
          ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(s.publicKey) });
        subscription = sub.toJSON();
      }
      const r = await fetch('/api/push', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kinds, email, ...(subscription ? { subscription } : {}) }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 403) setLine('Notifications are for adults (18+) for now.');
      else if (!r.ok) setLine(j?.error === 'not_ready' || j?.error === 'push_off' ? 'Notifications are not switched on yet.' : 'Could not save that just now.');
      else { setLine(withDevice ? 'Notifications are on for this device.' : 'Saved.'); if (withDevice) setOnHere(true); await load(); }
    } catch { setLine('Could not turn notifications on here.'); }
    finally { setBusy(false); }
  };

  const offEverywhere = async () => {
    setBusy(true); setLine('');
    try {
      const sub = await currentSubscription();
      await sub?.unsubscribe().catch(() => false);
      const r = await fetch('/api/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      setLine(r.ok ? 'Notifications and email reminders are off.' : 'Could not turn them off just now.');
      setOnHere(false); await load();
    } finally { setBusy(false); }
  };

  const shown = s.kinds.filter((k) => !KIND_LABEL[k].coachOnly || s.coach);
  const anything = s.available || s.email.available;

  return (
    <section className="mt-8 rounded-xl border border-white/10 bg-white/[0.02] p-5" data-testid="push-settings">
      <h2 className="fel-heading flex items-center gap-2 text-lg font-bold text-white"><Bell className="h-4 w-4" aria-hidden="true" /> Notifications</h2>
      {!s.adult ? (
        <p className="mt-2 text-sm text-white/70">Notifications are for adults (18+) for now.</p>
      ) : !anything ? (
        <p className="mt-2 text-sm text-white/70">Notifications aren&apos;t switched on yet.</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-white/70">Only what you tick, and never ads or offers. A notification says what happened, never what anyone wrote.</p>
          <fieldset className="mt-3 space-y-2" disabled={busy}>
            <legend className="sr-only">What to be told about</legend>
            {shown.map((k) => (
              <label key={k} className="flex items-start gap-3 text-sm text-white/85">
                <input
                  type="checkbox" className="mt-1 h-4 w-4 accent-[#00E5FF]"
                  checked={kinds.includes(k)}
                  onChange={(e) => setKinds((cur) => (e.target.checked ? [...cur, k] : cur.filter((x) => x !== k)))}
                />
                <span><span className="font-bold text-white">{KIND_LABEL[k].title}</span><br /><span className="text-white/60">{KIND_LABEL[k].line}</span></span>
              </label>
            ))}
            {s.email.available && (
              <label className="flex items-start gap-3 text-sm text-white/85">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[#00E5FF]" checked={email} onChange={(e) => setEmail(e.target.checked)} />
                <span><span className="font-bold text-white">Email reminders</span><br /><span className="text-white/60">Daily reminders by email when no device gets them.</span></span>
              </label>
            )}
          </fieldset>
          <div className="mt-4 flex flex-wrap gap-2">
            {s.available && support === 'ok' && !onHere && (
              <button type="button" disabled={busy || kinds.length === 0} onClick={() => void save(true)}
                className="rounded-md border border-[#00E5FF]/50 bg-[#00E5FF]/10 px-3 py-1.5 text-xs font-bold text-[#00E5FF] disabled:opacity-50">
                {busy ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null} Turn on for this device
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => void save(false)}
              className="rounded-md border border-white/20 px-3 py-1.5 text-xs font-bold text-white/80 disabled:opacity-50">Save choices</button>
            {(s.devices > 0 || s.prefs.kinds.length > 0 || s.prefs.email) && (
              <button type="button" disabled={busy} onClick={() => void offEverywhere()}
                className="inline-flex items-center gap-1 rounded-md border border-[#FF3366]/30 bg-[#FF3366]/10 px-3 py-1.5 text-xs font-bold text-[#FF3366] disabled:opacity-50">
                <BellOff className="h-3.5 w-3.5" aria-hidden="true" /> Turn everything off
              </button>
            )}
          </div>
          {s.available && support !== 'ok' && <p className="mt-2 text-xs text-white/60">{SUPPORT_LINE[support]}</p>}
          {s.devices > 0 && <p className="mt-2 text-xs text-white/50">{s.devices} device{s.devices === 1 ? '' : 's'} get notifications{onHere ? ', this one included' : ''}.</p>}
        </>
      )}
      <p className="mt-2 text-xs text-white/70" role="status" aria-live="polite">{line}</p>
    </section>
  );
}
