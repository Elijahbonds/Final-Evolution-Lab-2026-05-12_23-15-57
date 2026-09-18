'use client';
// Cooking mode (lane 4) — a recipe card: ingredients, steps, fuel tags, an optional photo link. Lists the Fuel floor can serve.
import { useState } from 'react';
export interface CookingPublishPayload { title: string; steps: string[]; ingredients: string[]; fuelTags: string[]; photoUrl?: string }
const TAGS = ['protein', 'carbs', 'pre-game', 'recovery', 'hydration', 'quick', 'budget', 'plant-based'];
const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

export default function CookingMode({ onPublish }: { onPublish: (p: CookingPublishPayload) => void }) {
  const [title, setTitle] = useState(''); const [ingredients, setIngredients] = useState(''); const [steps, setSteps] = useState(''); const [tags, setTags] = useState<string[]>([]); const [photoUrl, setPhotoUrl] = useState('');
  const ready = title.trim() && lines(ingredients).length > 0 && lines(steps).length > 0;
  return (
    <div className="min-h-screen bg-neutral-950 p-6 pt-16 text-neutral-100">
      <h2 className="text-2xl font-black">Recipe Card</h2>
      <p className="mt-1 text-sm text-neutral-400">One ingredient per line, one step per line. Tag it so the Fuel floor and your coach can find it.</p>
      <div className="mt-4 space-y-3">
        <input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="Recipe name" className="w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm" />
        <textarea value={ingredients} onChange={(e) => setIngredients(e.target.value)} rows={5} placeholder={"2 eggs\n1 cup oats\n…"} className="w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm" />
        <textarea value={steps} onChange={(e) => setSteps(e.target.value)} rows={6} placeholder={"Boil the eggs 7 min\nToast the oats\n…"} className="w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm" />
        <input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="Photo link (https://…, optional)" className="w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm" />
        <div className="flex flex-wrap gap-1.5">{TAGS.map((t) => <button key={t} onClick={() => setTags((a) => a.includes(t) ? a.filter((x) => x !== t) : [...a, t])} className={`rounded-full px-3 py-1 text-xs ${tags.includes(t) ? 'bg-rose-500 text-black' : 'bg-neutral-800'}`}>{t}</button>)}</div>
      </div>
      <button disabled={!ready} onClick={() => onPublish({ title, steps: lines(steps).slice(0, 30), ingredients: lines(ingredients).slice(0, 40), fuelTags: tags, photoUrl: photoUrl.trim() || undefined })} className="mt-6 rounded-xl bg-rose-500 px-6 py-3 font-bold text-black disabled:opacity-40">Publish recipe</button>
    </div>
  );
}
