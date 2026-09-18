'use client';
// The check-in button (Courts v1, 2026-09-13).
//
// This component is the ONLY place the game asks for a location, and it asks from inside an onClick — the
// mission's "foreground and explicit only... Never request location on page load or in the background" is a
// structural property here, not a promise: there is no effect in this file, nothing runs on mount, and the
// permission prompt cannot appear unless a finger landed on this button.
//
// What it gives you is a sentence and a number. That is the whole reward, on purpose: anything scarce would
// turn "go outside" into an advantage for whoever has a car and a safe neighbourhood.

import React, { useState } from 'react';
import { checkInHere, CHECK_IN_MESSAGES, COURTS, type CheckInResult } from '@/lib/courts/CheckIn';
import { emit, readRecord, places } from '@/lib/creator/CreatorRecord';

export function CheckInButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [result, setResult] = useState<CheckInResult | null>(null);

  // read once, on render, from the canonical record — Courts keeps no store of its own
  const visited = typeof window === 'undefined' ? [] : places(readRecord() ?? { v: 1, disciplines: {}, places: {}, minor: false });

  return (
    <div className={className}>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          // the location request lives HERE, in a gesture handler, and nowhere else
          setBusy(true); setSaid(null);
          const out = await checkInHere(emit);
          setBusy(false);
          if (out.ok) { setResult(out.result); setSaid(out.result.greeting); }
          else setSaid(CHECK_IN_MESSAGES[out.why]);
        }}
        style={{
          padding: '10px 16px', borderRadius: 10, border: '1px solid #00E5FF',
          background: busy ? '#0b2b33' : 'transparent', color: '#00E5FF', cursor: busy ? 'default' : 'pointer',
          font: '600 13px/1.2 system-ui, sans-serif', letterSpacing: 0.4,
        }}
      >{busy ? 'CHECKING…' : "I'M AT THE COURT"}</button>

      {said && <p style={{ margin: '10px 0 0', color: '#cfd6e4', font: '400 13px/1.4 system-ui, sans-serif' }}>{said}</p>}
      {result && <p style={{ margin: '4px 0 0', color: '#8A94A6', font: '400 12px/1.4 system-ui, sans-serif' }}>
        {result.name} · {result.visits} {result.visits === 1 ? 'visit' : 'visits'}
      </p>}

      {visited.length > 0 && (
        <ul style={{ margin: '14px 0 0', padding: 0, listStyle: 'none', color: '#8A94A6', font: '400 12px/1.6 system-ui, sans-serif' }}>
          {visited.map((p) => {
            const court = COURTS.find((c) => c.id === p.placeId);
            return <li key={p.placeId}>{court?.name ?? p.placeId} — {p.visits} {p.visits === 1 ? 'visit' : 'visits'}</li>;
          })}
        </ul>
      )}

      <p style={{ margin: '12px 0 0', color: '#6b7280', font: '400 11px/1.5 system-ui, sans-serif', maxWidth: 380 }}>
        Your location is checked against the court list on this device and then discarded. Only the court name
        and how many times you have been are kept, and nothing here changes how the game plays.
      </p>
    </div>
  );
}
