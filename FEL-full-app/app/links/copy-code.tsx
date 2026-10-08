'use client';

import { useState } from 'react';

export async function copyPlainText(
  text: string,
  doc: Document | undefined = typeof document !== 'undefined' ? document : undefined,
  nav: Navigator | undefined = typeof navigator !== 'undefined' ? navigator : undefined,
): Promise<boolean> {
  try {
    await nav?.clipboard?.writeText(text);
    if (nav?.clipboard) return true;
  } catch {
    // Some embedded browsers block async clipboard; try the selectable fallback.
  }

  if (!doc?.body) return false;
  const area = doc.createElement('textarea');
  try {
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    doc.body.appendChild(area);
    area.select();
    return doc.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

/** Copies a checkout code. No third-party script. */
export function CopyCode({ code }: { code: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'blocked'>('idle');

  async function copy() {
    const ok = await copyPlainText(code);
    setStatus(ok ? 'copied' : 'blocked');
    window.setTimeout(() => setStatus('idle'), 1800);
  }

  return (
    <button
      type="button"
      data-copy-code={code}
      onClick={copy}
      aria-live="polite"
      className="inline-flex min-h-[48px] min-w-[96px] items-center justify-center rounded-full bg-[#00E5FF] px-4 text-[15px] font-black text-black"
    >
      {status === 'copied' ? 'Copied' : status === 'blocked' ? 'Copy blocked' : 'Copy'}
    </button>
  );
}
