'use client';

import { useState } from 'react';

export function ReissueCode({ accessId }: { accessId: string }) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const send = async () => {
    const res = await fetch(`/api/coach-store/access/${accessId}/reissue`, { method: 'POST' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setMessage(json.message || json.error || 'Could not re-issue'); return; }
    setCode(json.unlockCode ?? '');
    setMessage(json.message || 'Progress does not transfer.');
  };
  return (
    <div className="mt-2">
      <button type="button" className="underline" onClick={() => { void send(); }}>Re-issue teen code</button>
      {code ? <p className="mt-1">New code: {code}</p> : null}
      {message ? <p className="mt-1 text-white/70">{message}</p> : null}
    </div>
  );
}
