'use client';

import { useState } from 'react';
import type { WeeklyWindow } from '@/lib/coach-store/slots';

const DOW_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function minutesToLabel(min: number): string {
  const hour = Math.floor(min / 60);
  const minute = min % 60;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ap = hour < 12 ? 'AM' : 'PM';
  return `${h12}:${String(minute).padStart(2, '0')} ${ap}`;
}

/** Every :00/:30 from midnight to midnight, the same 30-minute step openSlots() uses. */
const STEP_OPTIONS = Array.from({ length: 49 }, (_, i) => i * 30);

export function HoursEditor({
  initialWeeklyHours,
  initialBlackoutDates,
}: {
  initialWeeklyHours: WeeklyWindow[];
  initialBlackoutDates: string[];
}) {
  const [weeklyHours, setWeeklyHours] = useState<WeeklyWindow[]>(initialWeeklyHours);
  const [blackoutDates, setBlackoutDates] = useState<string[]>(initialBlackoutDates);
  const [newBlackout, setNewBlackout] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const addWindow = (dow: number) => {
    setSaved(false);
    setWeeklyHours((prev) => [...prev, { dow, startMin: 540, endMin: 570 }]);
  };

  const removeWindow = (index: number) => {
    setSaved(false);
    setWeeklyHours((prev) => prev.filter((_, i) => i !== index));
  };

  const updateWindow = (index: number, patch: Partial<WeeklyWindow>) => {
    setSaved(false);
    setWeeklyHours((prev) => prev.map((w, i) => (i === index ? { ...w, ...patch } : w)));
  };

  const addBlackout = () => {
    if (!newBlackout) return;
    setSaved(false);
    setBlackoutDates((prev) => (prev.includes(newBlackout) ? prev : [...prev, newBlackout].sort()));
    setNewBlackout('');
  };

  const removeBlackout = (date: string) => {
    setSaved(false);
    setBlackoutDates((prev) => prev.filter((d) => d !== date));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch('/api/coach-store/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeklyHours, blackoutDates }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.detail || json.error || 'Could not save');
        return;
      }
      setSaved(true);
    } catch {
      setError('Could not reach the server');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-6 space-y-8">
      <section>
        <h2 className="text-lg font-bold">Weekly hours</h2>
        <div className="mt-3 space-y-4">
          {DOW_LABELS.map((label, dow) => {
            const windows = weeklyHours
              .map((w, i) => ({ w, i }))
              .filter(({ w }) => w.dow === dow);
            return (
              <div key={dow} className="rounded-xl border border-white/10 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm">{label}</span>
                  <button
                    type="button"
                    className="rounded-lg bg-cyan-300 px-3 py-1 text-xs font-bold text-black"
                    onClick={() => addWindow(dow)}
                  >
                    Add window
                  </button>
                </div>
                {windows.length === 0 ? <p className="mt-2 text-xs text-white/60">No hours set</p> : null}
                {windows.map(({ w, i }) => (
                  <div key={i} className="mt-2 flex items-center gap-2 text-sm">
                    <select
                      className="rounded-lg bg-black p-1"
                      value={w.startMin}
                      onChange={(e) => updateWindow(i, { startMin: Number(e.target.value) })}
                    >
                      {STEP_OPTIONS.filter((m) => m < 1440).map((m) => (
                        <option key={m} value={m}>{minutesToLabel(m)}</option>
                      ))}
                    </select>
                    <span>to</span>
                    <select
                      className="rounded-lg bg-black p-1"
                      value={w.endMin}
                      onChange={(e) => updateWindow(i, { endMin: Number(e.target.value) })}
                    >
                      {STEP_OPTIONS.filter((m) => m > 0).map((m) => (
                        <option key={m} value={m}>{m === 1440 ? '12:00 AM (midnight)' : minutesToLabel(m)}</option>
                      ))}
                    </select>
                    <button type="button" className="text-xs text-red-300 underline" onClick={() => removeWindow(i)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold">Days off</h2>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="date"
            className="rounded-lg bg-black p-2 text-sm"
            value={newBlackout}
            onChange={(e) => setNewBlackout(e.target.value)}
          />
          <button type="button" className="rounded-lg bg-cyan-300 px-3 py-1 text-xs font-bold text-black" onClick={addBlackout}>
            Add day off
          </button>
        </div>
        <ul className="mt-3 space-y-1 text-sm">
          {blackoutDates.map((date) => (
            <li key={date} className="flex items-center gap-2">
              {date}
              <button type="button" className="text-xs text-red-300 underline" onClick={() => removeBlackout(date)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {saved ? <p className="text-sm text-green-300">Saved.</p> : null}
      <button
        type="button"
        className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
        onClick={save}
        disabled={saving}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
