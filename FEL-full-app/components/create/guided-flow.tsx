'use client';
// components/create/guided-flow.tsx — CREATE HUB (owner, 2026-10-06): the three-step flow at /create/<discipline>.
//   1. Make or import: the discipline's existing editor (components/creator/modes/*, unchanged but for the button's
//      label), or a source picker for music (Academy library / upload / beat maker) and sport (a run you played).
//   2. Details and rights.   3. Preview where it appears, then submit for review.
// Every publish-as-card button in the game lands here with `?from=` (lib/create/flow.ts publishHref). The step logic is
// lib/create/flow.ts; this file holds the state and the requests.

import React, { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { ArtPayloadBody, CreativeCard, Discipline } from '@/lib/creator/creative-card-types';
import {
  STEPS, STEP_LABEL, SOURCE_LABEL, blockers, buildCreateBody, canLeave, clampStep, newDraft, nextStep, pendingFields, pendingUrl, prevStep,
  resolvePending, type FlowDraft, type PublishEntry, type StepId,
} from '@/lib/create/flow';
import { guideFor } from '@/lib/create/disciplines';
import { statusOf } from '@/lib/create/status';
import { uploadMedia, UploadError } from '@/lib/create/upload';
import { uploadMime } from '@/lib/create/media';
import { rememberCard } from '@/lib/create/use-my-cards';
import DetailsStep from './details-step';
import Preview from './previews';
import type { FlowProps, MadeThing, PendingMedia } from './types';
import type { ArtPublishPayload } from '@/components/creator/modes/art-mode';
import type { DancePublishPayload } from '@/components/creator/modes/dance-mode';
import type { ActingPublishPayload } from '@/components/creator/modes/acting-mode';
import type { ScenePublishPayload } from '@/components/creator/modes/scene-mode';
import type { CookingPublishPayload } from '@/components/creator/modes/cooking-mode';
import type { WritingPublishPayload } from '@/components/creator/modes/writing-mode';
import type { FashionPublishPayload } from '@/components/creator/modes/fashion-mode';

const loading = () => <p className="p-4 text-sm text-neutral-500">Loading the editor…</p>;
const ArtMode = dynamic(() => import('@/components/creator/modes/art-mode'), { ssr: false, loading });
const DanceMode = dynamic(() => import('@/components/creator/modes/dance-mode'), { ssr: false, loading });
const ActingMode = dynamic(() => import('@/components/creator/modes/acting-mode'), { ssr: false, loading });
const SceneMode = dynamic(() => import('@/components/creator/modes/scene-mode'), { ssr: false, loading });
const CookingMode = dynamic(() => import('@/components/creator/modes/cooking-mode'), { ssr: false, loading });
const WritingMode = dynamic(() => import('@/components/creator/modes/writing-mode'), { ssr: false, loading });
const FashionMode = dynamic(() => import('@/components/creator/modes/fashion-mode'), { ssr: false, loading });
const MusicSource = dynamic(() => import('./music-source'), { ssr: false, loading });
const SportSource = dynamic(() => import('./sport-source'), { ssr: false, loading });

const NEXT = 'Next: details →';

function MakeStep({ discipline, entry, props, onMade }: { discipline: Discipline; entry: PublishEntry; props: FlowProps; onMade: (m: MadeThing) => void }) {
  const [busy, setBusy] = useState(false);
  const acting = async (p: ActingPublishPayload) => {
    setBusy(true);
    try {
      const { audioSeconds } = await import('@/lib/create/media-browser');
      const media: PendingMedia = { blob: p.audioBlob, fileName: `line_${p.sceneId}.webm`, contentType: uploadMime(p.audioBlob.type) ?? 'audio/webm', durationSec: await audioSeconds(p.audioBlob) };
      onMade({ art: { kind: 'acting', sceneId: p.sceneId, performanceUrl: pendingUrl('performanceUrl'), voiceLineIds: [p.slot] }, title: `Voice: ${p.slot.replace(/_/g, ' ')}`, media: { performanceUrl: media }, previewUrl: URL.createObjectURL(p.audioBlob) });
    } finally { setBusy(false); }
  };
  switch (discipline) {
    case 'music': return <MusicSource entry={entry} userId={props.userId} publicCreator={props.publicCreator} onMade={onMade} />;
    case 'sport': return <SportSource onMade={onMade} />;
    case 'art': return <ArtMode submitLabel={NEXT} onPublish={(p: ArtPublishPayload) => onMade({ art: { kind: 'art', canvasDataUrl: p.canvasDataUrl, palette: p.palette, brushSetId: p.brushSetId, appliedSurface: p.appliedSurface }, title: `${p.appliedSurface} skin` })} />;
    case 'dance': return <DanceMode submitLabel={NEXT} onPublish={(p: DancePublishPayload) => onMade({ art: { kind: 'dance', choreographyId: p.choreographyId, sequence: p.sequence, bpm: p.bpm }, title: `${p.sequence.length}-step routine` })} />;
    case 'acting':
      if (!props.publicCreator) return <p className="rounded-2xl bg-neutral-900 p-5 text-sm text-neutral-300" data-qa="teen-audio-note">Voice lines upload to FEL only for creators confirmed 18+. Nothing you record leaves this device until then.</p>;
      return busy ? loading() : <ActingMode submitLabel={NEXT} onPublish={(p) => void acting(p)} />;
    case 'scene': return <SceneMode submitLabel={NEXT} onPublish={(p: ScenePublishPayload) => onMade({ art: { kind: 'scene', venueId: p.venueId, cameraPath: p.cameraPath, questions: p.questions }, title: p.title })} />;
    case 'cooking': return <CookingMode submitLabel={NEXT} onPublish={(p: CookingPublishPayload) => onMade({ art: { kind: 'cooking', steps: p.steps, ingredients: p.ingredients, fuelTags: p.fuelTags, ...(p.photoUrl ? { photoUrl: p.photoUrl } : {}) }, title: p.title })} />;
    case 'writing': return <WritingMode submitLabel={NEXT} onPublish={(p: WritingPublishPayload) => onMade({ art: { kind: 'writing', text: p.text, ...(p.coverUrl ? { coverUrl: p.coverUrl } : {}) }, title: p.title })} />;
    case 'fashion': return <FashionMode submitLabel={NEXT} onPublish={(p: FashionPublishPayload) => onMade({ art: { kind: 'fashion', lookId: p.lookId, wearableIds: p.wearableIds, palette: p.palette, ...(p.photoUrl ? { photoUrl: p.photoUrl } : {}) }, title: p.title })} />;
  }
}

export default function GuidedFlow({ discipline, entry, ...props }: FlowProps & { discipline: Discipline; entry: PublishEntry }) {
  const ctx = useMemo(() => ({ publicCreator: props.publicCreator }), [props.publicCreator]);
  const guide = guideFor(discipline);
  const [step, setStep] = useState<StepId>('make');
  const [draft, setDraft] = useState<FlowDraft>(() => newDraft(discipline, { title: entry.title ?? '', wantsPublic: props.publicCreator, ...(entry.remix ? { remixOf: entry.remix } : {}) }));
  const [media, setMedia] = useState<Record<string, PendingMedia>>({});
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'saving'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [slotsFull, setSlotsFull] = useState(false);
  const [done, setDone] = useState<CreativeCard | null>(null);

  const patch = useCallback((p: Partial<FlowDraft>) => setDraft((d) => ({ ...d, ...p })), []);
  const go = (want: StepId) => { setError(null); setStep(clampStep(want, draft, ctx)); window.scrollTo?.({ top: 0 }); };
  const onMade = (m: MadeThing) => {
    const d = { ...draft, art: m.art, title: draft.title || m.title || '' };
    setDraft(d); setMedia(m.media ?? {}); setPreviewUrl(m.previewUrl);
    setStep(clampStep('details', d, ctx));
  };

  async function submit() {
    setError(null); setSlotsFull(false);
    if (!draft.art) return;
    try {
      setPhase('uploading');
      const uploaded: Record<string, string> = {};
      for (const field of pendingFields(draft.art)) {
        const m = media[field];
        if (!m) throw new Error('Something you made is no longer on this page. Go back to step 1 and make it again.');
        uploaded[field] = await uploadMedia({ body: m.blob, fileName: m.fileName, contentType: m.contentType, durationSec: m.durationSec });
      }
      const art = resolvePending(draft.art, uploaded) as ArtPayloadBody | null;
      const body = art && buildCreateBody({ ...draft, art }, ctx);
      if (!body) throw new Error(blockers('preview', draft, ctx)[0] ?? 'Something is missing.');
      setDraft((d) => ({ ...d, art }));   // uploaded once: a retry after a card error does not upload again
      setMedia({});
      setPhase('saving');
      const res = await fetch('/api/v1/creative-card', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) { setSlotsFull(true); throw new Error(data?.error ?? 'Your card slots are full.'); }
      if (!res.ok) throw new Error(data?.error ?? `Could not submit (${res.status}).`);
      rememberCard(data.card);
      setDone(data.card as CreativeCard);
    } catch (e) {
      setError(e instanceof UploadError || e instanceof Error ? e.message : 'Could not submit.');
    } finally { setPhase('idle'); }
  }

  async function buySlot() {
    const res = await fetch('/api/v1/creative-card/slots/buy', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data?.error ?? 'Could not buy a slot.'); return; }
    setSlotsFull(false); setError(null);
    void submit();
  }

  if (done) {
    const v = statusOf(done, ctx);
    return (
      <div className="mx-auto max-w-2xl p-5 text-neutral-100" data-qa="submitted">
        <h1 className="text-3xl font-black">{v.status === 'pending' ? 'Submitted for review' : 'Saved'}</h1>
        <p className="mt-2 text-sm text-neutral-300">“{done.title}” · <span className="font-bold">{v.label}</span></p>
        {v.detail && <p className="mt-1 text-sm text-neutral-400">{v.detail}</p>}
        {v.status === 'pending' && <p className="mt-3 text-sm text-neutral-400">You will see a note here on Create when it is approved, or why it was not.</p>}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/create" className="rounded-xl bg-amber-400 px-5 py-3 font-bold text-black">Back to Create</Link>
          <button onClick={() => { setDone(null); setDraft(newDraft(discipline, { wantsPublic: props.publicCreator })); setStep('make'); setPreviewUrl(undefined); }}
            className="rounded-xl bg-neutral-800 px-5 py-3 font-bold">Make another</button>
        </div>
      </div>
    );
  }

  const blocked = step === 'make' ? [] : blockers(step === 'details' ? 'details' : 'preview', draft, ctx);
  return (
    <div className="min-h-screen bg-neutral-950 pb-24 text-neutral-100">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-neutral-950/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link href="/create" className="rounded-lg bg-neutral-800 px-3 py-1.5 text-sm font-bold">← Create</Link>
          <div className="min-w-0">
            <div className="truncate text-lg font-black">{guide.label}</div>
            {entry.from && entry.from !== 'hub' && <div className="truncate text-[11px] text-neutral-400">from {SOURCE_LABEL[entry.from]}</div>}
            {draft.remixOf && <div className="truncate text-[11px] text-violet-300">a remix: the original&apos;s creator is credited</div>}
          </div>
        </div>
        <ol className="mt-3 grid grid-cols-3 gap-2" aria-label="Steps">
          {STEPS.map((s, i) => {
            const reachable = clampStep(s, draft, ctx) === s;
            return (
              <li key={s}>
                <button data-qa={`step-${s}`} disabled={!reachable} onClick={() => go(s)} aria-current={step === s ? 'step' : undefined}
                  className={`w-full rounded-lg px-2 py-1.5 text-left text-[11px] font-bold leading-tight ${step === s ? 'bg-amber-400 text-black' : reachable ? 'bg-neutral-800 text-neutral-200' : 'bg-neutral-900 text-neutral-600'}`}>
                  {i + 1}. {STEP_LABEL[s]}
                </button>
              </li>
            );
          })}
        </ol>
      </header>

      <main className="mx-auto max-w-4xl p-4">
        {step === 'make' && (
          <>
            <p className="mb-3 text-sm text-neutral-400">{guide.make}.{draft.art ? ' You already made one: making another replaces it.' : ''}</p>
            <MakeStep discipline={discipline} entry={entry} props={props} onMade={onMade} />
            {draft.art && <button onClick={() => go('details')} className="mt-4 rounded-xl bg-neutral-800 px-5 py-2 text-sm font-bold">Keep what I made →</button>}
          </>
        )}
        {step === 'details' && <DetailsStep draft={draft} ctx={ctx} onDraft={patch} />}
        {step === 'preview' && draft.art && (
          <div className="space-y-5">
            <Preview art={draft.art} title={draft.title} creator={props.creatorName} previewUrl={previewUrl} />
            <div className="rounded-xl bg-neutral-900 p-4 text-sm">
              <div className="mb-1 text-xs uppercase tracking-wide text-neutral-400">Where it shows up</div>
              <ul className="space-y-1">
                {guide.showsUp.map((s) => <li key={s.where} className={s.live ? 'text-neutral-100' : 'text-neutral-500'}>{s.live ? '●' : '○'} {s.where}{s.live ? '' : ' (soon)'}</li>)}
              </ul>
            </div>
          </div>
        )}

        {step !== 'make' && (
          <div className="mt-6 space-y-3">
            {blocked.length > 0 && <ul className="text-sm text-amber-300" data-qa="blockers">{blocked.map((b) => <li key={b}>· {b}</li>)}</ul>}
            {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
            {slotsFull && <button onClick={() => void buySlot()} className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-bold text-black">Buy another card slot (200 shards)</button>}
            <div className="flex flex-wrap gap-3">
              <button onClick={() => go(prevStep(step) ?? 'make')} className="rounded-xl bg-neutral-800 px-5 py-3 font-bold">← Back</button>
              {step === 'details' && (
                <button data-qa="to-preview" disabled={!canLeave('details', draft, ctx)} onClick={() => go(nextStep('details')!)}
                  className="rounded-xl bg-amber-400 px-6 py-3 font-black text-black disabled:opacity-30">Next: preview →</button>
              )}
              {step === 'preview' && (
                <button data-qa="submit" disabled={phase !== 'idle' || !canLeave('details', draft, ctx)} onClick={() => void submit()}
                  className="rounded-xl bg-amber-400 px-6 py-3 font-black text-black disabled:opacity-30">
                  {phase === 'uploading' ? 'Uploading…' : phase === 'saving' ? 'Submitting…' : ctx.publicCreator && draft.wantsPublic ? 'Submit for review' : 'Save it (private)'}
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
