// lib/csv/download.ts — hand a CSV the page made to the person as a file (JUMP-TESTS, 2026-10-25). Client only.
//
// The text never leaves the phone: a Blob in this page, an object URL, a click on a link with `download`, and the URL
// revoked. No request is made. Returns false where a browser cannot do it (a server render, a test).
export function downloadCsv(name: string, text: string): boolean {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') return false;
  try {
    const url = URL.createObjectURL(new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}
