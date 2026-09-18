'use client';
// Fashion mode (lane 4) — a look built from wearables you OWN (the closet's owned list; the server re-checks ownership),
// up to six palette colours, an optional photo link. Publishes as a fashion card.
import { useEffect, useState } from 'react';
export interface FashionPublishPayload { title: string; lookId: string; wearableIds: string[]; palette: string[]; photoUrl?: string }
const SWATCHES = ['#00E5FF', '#FF2D95', '#FFD700', '#A855F7', '#22C55E', '#F97316', '#0EA5E9', '#F43F5E', '#FFFFFF', '#111111'];

export default function FashionMode({ onPublish }: { onPublish: (p: FashionPublishPayload) => void }) {
  const [owned, setOwned] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]); const [palette, setPalette] = useState<string[]>([]); const [title, setTitle] = useState(''); const [photoUrl, setPhotoUrl] = useState('');
  useEffect(() => { fetch('/api/v1/closet').then((r) => (r.ok ? r.json() : null)).then((j) => setOwned(j?.owned ?? [])).catch(() => setOwned([])); }, []);
  const ready = title.trim() && picked.length > 0;
  return (
    <div className="min-h-screen bg-neutral-950 p-6 pt-16 text-neutral-100">
      <h2 className="text-2xl font-black">Look</h2>
      <p className="mt-1 text-sm text-neutral-400">Pick up to 12 pieces you own, name the look, choose its colours.</p>
      <input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="Look name" className="mt-4 w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm" />
      <div className="mt-3 text-xs uppercase tracking-wider text-neutral-500">Your closet</div>
      {owned === null ? <p className="text-sm text-neutral-500">Loading…</p> : owned.length === 0 ? <p className="text-sm text-neutral-500">Nothing owned yet — earn or buy wearables in the Closet first.</p> : (
        <div className="mt-2 flex flex-wrap gap-1.5">{owned.map((id) => <button key={id} onClick={() => setPicked((a) => a.includes(id) ? a.filter((x) => x !== id) : a.length >= 12 ? a : [...a, id])} className={`rounded-lg px-3 py-1.5 text-xs ${picked.includes(id) ? 'bg-pink-500 text-black' : 'bg-neutral-800'}`}>{id.replace(/_/g, ' ')}</button>)}</div>
      )}
      <div className="mt-3 text-xs uppercase tracking-wider text-neutral-500">Palette</div>
      <div className="mt-2 flex flex-wrap gap-2">{SWATCHES.map((c) => <button key={c} onClick={() => setPalette((a) => a.includes(c) ? a.filter((x) => x !== c) : a.length >= 6 ? a : [...a, c])} className={`h-8 w-8 rounded-full ring-2 ${palette.includes(c) ? 'ring-white' : 'ring-transparent'}`} style={{ background: c }} aria-label={c} />)}</div>
      <input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="Photo link (https://…, optional)" className="mt-3 w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm" />
      <button disabled={!ready} onClick={() => onPublish({ title, lookId: `look_${Date.now()}`, wearableIds: picked, palette, photoUrl: photoUrl.trim() || undefined })} className="mt-6 rounded-xl bg-pink-500 px-6 py-3 font-bold text-black disabled:opacity-40">Publish look</button>
    </div>
  );
}
