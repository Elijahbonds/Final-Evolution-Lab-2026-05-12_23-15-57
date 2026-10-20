'use client';
// THE FEEL PANEL (feel-panel lane, owner 2026-10-20; docs/FEEL-PANEL.md). Mounted once for every /play route by app/play/layout.tsx.
//
// For everyone but an admin on a deploy with FEEL_PANEL_ENABLED on, this renders NOTHING and changes nothing: it asks
// GET /api/feel-panel once (the layout stays mounted across client navigations, so once per visit to /play), the server says no
// (404 flag off / 403 not an admin), and lib/feel-panel/feel.ts never even reads localStorage. When the server says yes, the panel tells
// the store where we are on every route or query change (sessionGate.feelSessionBlock) — overrides apply only in a playtest run
// with no staked, ranked, head-to-head, online or party session — and draws the sheet (feel-sheet.tsx).
import { useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { FEEL_KNOBS } from '@/lib/feel-panel/knobs';
import {
  feelValuesJson, getFeelState, getServerFeelState, resetAllFeelOverrides, resetFeelOverride, setFeelOverride, setFeelSession,
  setFeelUser, subscribeFeel,
} from '@/lib/feel-panel/feel';
import { feelSessionBlock, playtestHref } from '@/lib/feel-panel/sessionGate';
import { FeelSheet } from './feel-sheet';

// layout effect in the browser: the gate moves before the next animation frame can read a knob (no SSR warning on the server)
const useBeforeFrame = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function FeelPanel() {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? '';
  const [allowed, setAllowed] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const state = useSyncExternalStore(subscribeFeel, getFeelState, getServerFeelState);

  // the server's answer, once; closed again on unmount
  useEffect(() => {
    let dead = false;
    fetch('/api/feel-panel', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!dead && j?.enabled === true) { setFeelUser(true); setAllowed(true); } })
      .catch(() => { /* closed */ });
    return () => { dead = true; setFeelUser(false); };
  }, []);

  // where we are: every route and query change, before anything else can read a knob on the new page's next frame
  useBeforeFrame(() => { setFeelSession(feelSessionBlock(pathname, search)); }, [pathname, search]);
  useBeforeFrame(() => () => setFeelSession('UNKNOWN'), []);

  const onCopy = useCallback(() => {
    const text = feelValuesJson();
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1500); };
    try {
      if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(text).then(done, () => window.prompt('Copy these values', text)); return; }
    } catch { /* fall through */ }
    window.prompt('Copy these values', text);
  }, []);

  if (!allowed) return null;
  return (
    <FeelSheet
      knobs={FEEL_KNOBS}
      state={state}
      open={open}
      playtestHref={state.block === 'NOT_PLAYTEST' ? playtestHref(pathname, search) : null}
      copied={copied}
      onOpen={setOpen}
      onSet={(id, v) => { setFeelOverride(id, v); }}
      onReset={resetFeelOverride}
      onResetAll={resetAllFeelOverrides}
      onCopy={onCopy}
    />
  );
}
