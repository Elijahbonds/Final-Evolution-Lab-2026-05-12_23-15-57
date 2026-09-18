'use client';
// Scene mode (lane 4 / lane 3 W2) — author a Who Scene It pack: pick one of FEL's OWN venues, a camera sweep, and 1–8
// four-option questions about FEL's world. Original content only (the server keeps scene packs in review before listing).
import { useState } from 'react';
import type { SceneQuestion } from '@/lib/creator/creative-card-types';

export interface ScenePublishPayload { venueId: string; cameraPath: string; questions: SceneQuestion[]; title: string }
const VENUES = [
  ['basketball_h2h', 'Venice — ones court'], ['basketball_3v3', 'Venice — threes court'], ['basketball_dunk', 'Venice — dunk court'],
  ['karate_h2h', 'Shrine courtyard — versus'], ['karate_endless', 'Shrine courtyard — endless'], ['skateboarding', 'Venice skatepark'],
  ['tennis', 'Tennis court'], ['penalty', 'Coastal stadium'], ['golf_loop', 'The Loop'], ['surfing', 'Surf break'], ['snowboarding', 'Mountain slope'],
] as const;
const SWEEPS = [['sweep', 'Slow sweep'], ['rim', 'From the rim'], ['high', 'High and wide'], ['low', 'Low along the floor']] as const;
const blank = (): SceneQuestion => ({ prompt: '', options: ['', '', '', ''], answer: 0 });

export default function SceneMode({ onPublish }: { onPublish: (p: ScenePublishPayload) => void }) {
  const [venueId, setVenueId] = useState<string>(VENUES[0][0]);
  const [cameraPath, setCameraPath] = useState<string>(SWEEPS[0][0]);
  const [title, setTitle] = useState('');
  const [qs, setQs] = useState<SceneQuestion[]>([blank()]);
  const setQ = (i: number, patch: Partial<SceneQuestion>) => setQs((a) => a.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const ready = title.trim().length > 0 && qs.length > 0 && qs.every((q) => q.prompt.trim().length >= 4 && q.options.every((o) => o.trim()) && new Set(q.options.map((o) => o.trim().toLowerCase())).size === 4);
  return (
    <div className="min-h-screen bg-neutral-950 p-6 pt-16 text-neutral-100">
      <h2 className="text-2xl font-black">Scene Pack</h2>
      <p className="mt-1 text-sm text-neutral-400">Pick a FEL venue and write what a player should recognise in it. Your world only — no shows, films or games.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="Pack title" className="rounded-lg bg-neutral-900 px-3 py-2 text-sm" />
        <select value={venueId} onChange={(e) => setVenueId(e.target.value)} className="rounded-lg bg-neutral-900 px-3 py-2 text-sm">{VENUES.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
        <select value={cameraPath} onChange={(e) => setCameraPath(e.target.value)} className="rounded-lg bg-neutral-900 px-3 py-2 text-sm">{SWEEPS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
      </div>
      <div className="mt-4 space-y-3">
        {qs.map((q, i) => (
          <div key={i} className="rounded-xl bg-neutral-900 p-3 space-y-2">
            <input value={q.prompt} maxLength={200} onChange={(e) => setQ(i, { prompt: e.target.value })} placeholder={`Question ${i + 1}`} className="w-full rounded-lg bg-neutral-800 px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              {q.options.map((o, k) => (
                <label key={k} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${q.answer === k ? 'bg-violet-500/20 ring-1 ring-violet-400' : 'bg-neutral-800'}`}>
                  <input type="radio" checked={q.answer === k} onChange={() => setQ(i, { answer: k as 0 | 1 | 2 | 3 })} />
                  <input value={o} maxLength={80} onChange={(e) => { const opts = [...q.options] as SceneQuestion['options']; opts[k] = e.target.value; setQ(i, { options: opts }); }} placeholder={`Option ${k + 1}`} className="flex-1 bg-transparent outline-none" />
                </label>
              ))}
            </div>
            {qs.length > 1 && <button onClick={() => setQs((a) => a.filter((_, j) => j !== i))} className="text-xs text-neutral-500">remove</button>}
          </div>
        ))}
        {qs.length < 8 && <button onClick={() => setQs((a) => [...a, blank()])} className="rounded-lg bg-neutral-800 px-3 py-2 text-sm">+ question</button>}
      </div>
      <button disabled={!ready} onClick={() => onPublish({ venueId, cameraPath, questions: qs, title })} className="mt-6 rounded-xl bg-violet-500 px-6 py-3 font-bold text-black disabled:opacity-40">Submit pack for review</button>
    </div>
  );
}
