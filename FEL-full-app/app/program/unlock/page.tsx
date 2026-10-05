'use client';

import { useEffect, useState } from 'react';
import { DUNK_WEEKS } from '@/lib/coach-store/dunkProgram';
import { TEEN_OFFLINE_GRACE_DAYS } from '@/lib/coach-store/constants';
import { ParentSummary } from '@/components/coach-store/parent-summary';

const LAST_OK = 'fel-teen-last-ok';

function stillOpen(last: string | null, now: number): boolean {
  if (!last) return false;
  const at = Number(last);
  if (!Number.isFinite(at)) return false;
  return now - at <= TEEN_OFFLINE_GRACE_DAYS * 24 * 60 * 60 * 1000;
}

export default function UnlockPage() {
  const [code, setCode] = useState('');
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('Your progress stays on this phone.');
  const drills = DUNK_WEEKS.flatMap((week) => week.days.flatMap((day) => day.drills.filter((drill) => !drill.adultOnly).map((drill) => `Week ${week.week} day ${day.day}: ${drill.name}`)));

  useEffect(() => {
    if (!navigator.onLine && stillOpen(localStorage.getItem(LAST_OK), Date.now())) {
      setOpen(true);
      setMessage('Still open on this phone. It locks after 7 days offline.');
    }
  }, []);

  const redeem = async () => {
    let token = localStorage.getItem('fel-teen-device');
    if (!token) {
      token = crypto.randomUUID();
      localStorage.setItem('fel-teen-device', token);
    }
    const res = await fetch('/api/coach-store/unlock/redeem', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, deviceToken: token }),
    });
    const json = await res.json();
    if (!res.ok) {
      if (!navigator.onLine && stillOpen(localStorage.getItem(LAST_OK), Date.now())) {
        setOpen(true);
        setMessage('Offline. This phone stays open for the rest of the 7-day grace. Progress stays here.');
        return;
      }
      setMessage(json.message || 'That code did not work.');
      return;
    }
    localStorage.setItem(LAST_OK, String(Date.now()));
    setOpen(true);
    setMessage('This phone is unlocked. Nothing was uploaded.');
  };

  return (
    <main className="mx-auto max-w-md px-4 py-10 text-white">
      <h1 className="text-2xl font-black">Teen program</h1>
      <p className="mt-2 text-sm">{message}</p>
      {open ? (
        <>
          <ul className="mt-4 space-y-2 text-sm">
            {drills.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <ParentSummary lines={['Weeks done stay on this phone.', ...drills.slice(0, 12), 'Re-screen days: 14, 28, 42, 56.']} />
        </>
      ) : (
        <>
          <input className="mt-4 w-full rounded-lg bg-black p-2" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Unlock code" />
          <button type="button" className="mt-3 rounded-xl bg-cyan-300 px-3 py-2 font-bold text-black" onClick={() => { void redeem(); }}>Unlock</button>
        </>
      )}
    </main>
  );
}
