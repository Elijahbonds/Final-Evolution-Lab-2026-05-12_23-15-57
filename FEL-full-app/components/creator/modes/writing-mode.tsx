'use client';
// Writing mode (lane 4) — a story beat, a caption, a verse. Text goes through review before it is listed.
import { useState } from 'react';
export interface WritingPublishPayload { title: string; text: string; coverUrl?: string }
export default function WritingMode({ onPublish }: { onPublish: (p: WritingPublishPayload) => void }) {
  const [title, setTitle] = useState(''); const [text, setText] = useState(''); const [coverUrl, setCoverUrl] = useState('');
  const ready = title.trim() && text.trim().length >= 20 && text.length <= 4000;
  return (
    <div className="min-h-screen bg-neutral-950 p-6 pt-16 text-neutral-100">
      <h2 className="text-2xl font-black">Writing</h2>
      <p className="mt-1 text-sm text-neutral-400">20 to 4000 characters. Your own words. It is reviewed before it goes public.</p>
      <div className="mt-4 space-y-3">
        <input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm" />
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} maxLength={4000} placeholder="Write." className="w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm" />
        <div className="text-right text-xs text-neutral-500">{text.length} / 4000</div>
        <input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="Cover image link (https://…, optional)" className="w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm" />
      </div>
      <button disabled={!ready} onClick={() => onPublish({ title, text, coverUrl: coverUrl.trim() || undefined })} className="mt-6 rounded-xl bg-lime-500 px-6 py-3 font-bold text-black disabled:opacity-40">Submit for review</button>
    </div>
  );
}
