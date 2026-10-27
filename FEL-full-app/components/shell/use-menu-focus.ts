'use client';
// The menus' pad / remote focus (lib/nav/focus.ts) and the couch view (lib/design/couch.ts), mounted once for the whole
// app by the StatusRail (app/layout.tsx renders it on every page; it stands aside by itself on a running mode).
import { useEffect } from 'react';
import { startMenuFocus } from '@/lib/nav/focus';
import { apply as applyCouch, noteRemoteDriven } from '@/lib/design/couch';

export function useMenuFocus(): void {
  useEffect(() => {
    applyCouch();
    const stop = startMenuFocus({ onPad: noteRemoteDriven, onRemote: noteRemoteDriven });
    const onResize = () => applyCouch();
    window.addEventListener('resize', onResize);
    return () => { stop(); window.removeEventListener('resize', onResize); };
  }, []);
}
