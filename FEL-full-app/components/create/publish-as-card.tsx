'use client';
// components/create/publish-as-card.tsx — CREATE HUB: the "publish as card" button every tool shows. Each opens the
// same guided setup (/create/<discipline>?from=<tool>…, lib/create/flow.ts publishHref). Plain links and a full page
// load on purpose: the hosts (the Academy, the Kitchens) render outside any router context in their tests, and a file
// travels through the device hand-off (lib/create/handoff.ts), not memory.

import React, { useState } from 'react';
import type { Discipline } from '@/lib/creator/creative-card-types';
import { publishHref, type PublishEntry } from '@/lib/create/flow';
import { putHandoff, type HandoffMeta } from '@/lib/create/handoff';

export function PublishAsCardLink({ discipline, entry, style, className, qa = 'publish-as-card', children }: {
  discipline: Discipline; entry: PublishEntry; style?: React.CSSProperties; className?: string; qa?: string; children?: React.ReactNode;
}) {
  return (
    <a data-qa={qa} href={publishHref(discipline, entry)} style={{ textDecoration: 'none', ...style }} className={className}>
      {children ?? 'PUBLISH AS CARD'}
    </a>
  );
}

/** For a file the flow needs (a rendered song, an uploaded file): kept on this device first, then the flow opens. */
export function PublishFileAsCard({ discipline, entry, file, meta, style, className, qa = 'publish-file-as-card', children }: {
  discipline: Discipline; entry: PublishEntry; file: () => Blob | null; meta: Omit<HandoffMeta, 'at' | 'from'>;
  style?: React.CSSProperties; className?: string; qa?: string; children?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button data-qa={qa} style={style} className={className} disabled={busy} onClick={async () => {
      const blob = file();
      if (!blob || !entry.from) return;
      setBusy(true);
      await putHandoff(blob, { ...meta, from: entry.from });   // false (no file store): the flow asks for the file instead
      window.location.assign(publishHref(discipline, entry));
    }}>
      {busy ? 'OPENING CREATE…' : children ?? 'PUBLISH AS CARD'}
    </button>
  );
}
