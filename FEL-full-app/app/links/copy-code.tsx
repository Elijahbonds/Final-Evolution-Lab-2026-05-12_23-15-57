'use client';

import { useState } from 'react';

/** Copies a checkout code. No third-party script. */
export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const area = document.createElement('textarea');
      area.value = code;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
  }

  return (
    <button
      type="button"
      data-copy-code={code}
      onClick={copy}
      className="inline-flex min-h-[48px] min-w-[96px] items-center justify-center rounded-full bg-[#00E5FF] px-4 text-[15px] font-black text-black"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
