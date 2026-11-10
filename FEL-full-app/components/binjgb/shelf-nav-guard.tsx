'use client';

// components/binjgb/shelf-nav-guard.tsx — BINJGB-SHELF-1 F2 (Cyber build review dcbbec16). Mounted on every shelf page.
// A capture-phase click handler on window runs before React's root listener (so before next/link's own onClick): any
// same-origin anchor that leaves /play/gb-shelf* — the shelf's own links and the app chrome (TabBar, StatusRail, …) alike —
// becomes location.assign(href), a full page load that drops the shelf's header policies. A back/forward move inside this
// document that lands outside the shelf reloads the page for the same reason. Renders nothing.
import { useEffect } from 'react';
import { firstLoadPath, fullLoadTarget, reloadAfterHistoryMove, reloadOnShelfMount } from '@/lib/binjgb/nav';

export function ShelfNavGuard() {
  useEffect(() => {
    // F2 defence in depth (Cyber F2F6 review): a soft navigation that slipped in (router.push, redirect(), a Link the
    // static ban missed) leaves this document under the app's rule-0 policy. Reload once so the shelf gets its own headers.
    if (reloadOnShelfMount(firstLoadPath())) { window.location.reload(); return; }
    function onClick(ev: MouseEvent) {
      const el = ev.target instanceof Element ? ev.target.closest('a[href]') : null;
      if (!(el instanceof HTMLAnchorElement)) return;
      const to = fullLoadTarget(ev, { href: el.href, target: el.target, download: el.hasAttribute('download') }, window.location);
      if (!to) return;
      ev.preventDefault();
      ev.stopPropagation();
      window.location.assign(to);
    }
    function onPop() {
      if (reloadAfterHistoryMove(window.location.pathname)) window.location.reload();
    }
    window.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPop);
    };
  }, []);
  return null;
}
