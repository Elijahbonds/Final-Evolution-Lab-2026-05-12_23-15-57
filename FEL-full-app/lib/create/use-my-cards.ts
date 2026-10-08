'use client';
// lib/create/use-my-cards.ts — CREATE HUB: the caller's own cards, polled while the page is visible, with a toast when
// a card's review status changed since this device last looked (status.ts). One request a minute; none in a hidden tab.

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { CreativeCard } from '@/lib/creator/creative-card-types';
import { STATUS_POLL_MS, diffStatus, loadSnapshot, saveSnapshot, snapshotOf, toastFor } from './status';

const storage = (): Storage | null => { try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; } };

export function useMyCards(ctx: { publicCreator: boolean }, opts: { pollMs?: number } = {}) {
  const [cards, setCards] = useState<CreativeCard[]>([]);
  const [loading, setLoading] = useState(true);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/creative-card?mine=1', { cache: 'no-store' });
      if (!res.ok) return;
      const list = ((await res.json()).cards ?? []) as CreativeCard[];
      const prev = loadSnapshot(storage());
      for (const ch of diffStatus(prev, list)) {
        const t = toastFor(ch, ctxRef.current);
        if (t) toast[t.tone](t.text, { duration: 8000 });
      }
      saveSnapshot(storage(), snapshotOf(list));
      setCards(list);
    } catch { /* offline: keep what we have, the next poll tries again */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void refresh();
    const ms = opts.pollMs ?? STATUS_POLL_MS;
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, ms);
    const onVis = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [refresh, opts.pollMs]);

  return { cards, loading, refresh };
}

/** After this device submits a card, remember its state so the poll does not toast the creator's own submit. */
export function rememberCard(card: Pick<CreativeCard, 'id' | 'title' | 'primary' | 'reviewState' | 'isPublic' | 'stats'>): void {
  const s = storage();
  saveSnapshot(s, { ...(loadSnapshot(s) ?? {}), ...snapshotOf([card]) });
}
