'use client';

// AttributionCapture — ONB-04: on the first page view that carries utm_* or ?ref, keep the tags on this browser
// (lib/marketing/utm.ts captureFirstTouch). First-party localStorage only: no cookie, no request, no third-party script,
// no id. Renders nothing. The sign-up form reads what is kept and posts it with the account.
import { useEffect } from 'react';
import { captureFirstTouch } from '@/lib/marketing/utm';

export function AttributionCapture() {
  useEffect(() => {
    try {
      if (!window.location.search) return;
      captureFirstTouch(window.location.search, window.localStorage);
    } catch { /* a blocked store keeps nothing; the visit goes on */ }
  }, []);
  return null;
}
