'use client';

import { useEffect, useState } from 'react';
import { SCAN_SAVE_CONSENT_TEXT } from '@/lib/privacy/scanSaveConsent';

type Item = { id: string; kind: string; at: string; numbers: Record<string, string | number | null> };

/**
 * /account: the opt-in toggle for a verified adult, the saved numbers, and "Delete my saved history"
 * after a revoke (and whenever rows are still there). Kids and unknown age see neither the card nor the list.
 */
/** The verified-adult panel. The page fetches; this is what it shows. */
export function ScanSaveAccountPanel(props: {
  optedIn: boolean;
  busy: boolean;
  note: string | null;
  visible: boolean;
  hasSaved: boolean;
  items: Item[];
  onToggle: (next: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5" data-testid="scan-save-account">
      <h2 className="fel-heading text-lg font-bold text-white">Jump numbers</h2>
      <label className="mt-3 flex items-start gap-3 text-sm text-white/80">
        <input
          data-testid="scan-save-toggle"
          type="checkbox"
          checked={props.optedIn}
          disabled={props.busy}
          onChange={(e) => props.onToggle(e.target.checked)}
        />
        <span>{SCAN_SAVE_CONSENT_TEXT}</span>
      </label>
      {!props.optedIn && props.hasSaved ? (
        <button
          type="button"
          data-testid="scan-save-delete"
          disabled={props.busy}
          onClick={props.onDelete}
          className="mt-3 rounded-md border border-[#FF3366]/30 bg-[#FF3366]/10 px-3 py-1.5 text-xs font-bold text-[#FF3366]"
        >
          Delete my saved history
        </button>
      ) : null}
      {props.note ? <p className="mt-2 text-xs text-white/60">{props.note}</p> : null}
      {props.visible && props.items.length > 0 ? (
        <ul className="mt-4 space-y-2 text-xs text-white/70">
          {props.items.map((item) => (
            <li key={item.id} className="rounded-lg border border-white/10 px-3 py-2">
              <span className="font-bold text-white">{item.kind === 'prove_it' ? 'Prove It' : item.kind === 'rescreen' ? 'Re-screen' : 'Jump'}</span>
              {' · '}
              {new Date(item.at).toLocaleString()}
              {item.numbers.verticalCm != null ? ` · ${item.numbers.verticalCm} cm` : ''}
              {item.numbers.judgesScore != null ? ` · judges ${item.numbers.judgesScore}` : ''}
              {item.numbers.jumpBestIn != null ? ` · jump ${item.numbers.jumpBestIn} in` : ''}
              {typeof item.numbers.flags === 'string' && item.numbers.flags ? ` · ${item.numbers.flags}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function ScanSaveAccount() {
  const [verified, setVerified] = useState(false);
  const [optedIn, setOptedIn] = useState(false);
  const [visible, setVisible] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function reload() {
    try {
      const [statusRes, historyRes] = await Promise.all([
        fetch('/api/account/scan-save'),
        fetch('/api/account/scan-history'),
      ]);
      if (statusRes.ok) {
        const s = await statusRes.json();
        setVerified(s.verifiedAdult === true);
        setOptedIn(s.optedIn === true);
      }
      if (historyRes.ok) {
        const h = await historyRes.json();
        setVisible(h.visible === true);
        setHasSaved(h.hasSaved === true);
        setItems(Array.isArray(h.items) ? h.items : []);
      }
    } catch {
      setVerified(false);
      setOptedIn(false);
      setVisible(false);
    }
  }

  useEffect(() => { void reload(); }, []);

  async function toggle(next: boolean) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch('/api/account/scan-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ granted: next }),
      });
      if (!res.ok) {
        setNote('That could not be saved. Your numbers stay as they were.');
        return;
      }
      setOptedIn(next);
      if (!next) setNote('Saving is off. Future numbers stay on this device.');
      await reload();
    } catch {
      setNote('That could not be saved. Your numbers stay as they were.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteHistory() {
    setBusy(true);
    try {
      const res = await fetch('/api/account/scan-history/delete', { method: 'POST' });
      if (!res.ok) { setNote('The delete did not finish.'); return; }
      setNote('Saved jump numbers, Prove It results, and re-screen history were deleted.');
      await reload();
    } catch {
      setNote('The delete did not finish.');
    } finally {
      setBusy(false);
    }
  }

  if (!verified) return null;

  return (
    <ScanSaveAccountPanel
      optedIn={optedIn}
      busy={busy}
      note={note}
      visible={visible}
      hasSaved={hasSaved}
      items={items}
      onToggle={(next) => { void toggle(next); }}
      onDelete={() => { void deleteHistory(); }}
    />
  );
}
