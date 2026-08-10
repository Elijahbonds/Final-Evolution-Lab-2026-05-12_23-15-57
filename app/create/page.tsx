'use client';

// M28 Creative Studio shell — orchestrates the five disciplines. Hub picks a
// primary discipline + up to two secondary + the SERVER-enforced license gate,
// then routes into the matching authoring mode. On publish we upload any binary
// payloads (music stems, acting audio) to cloud storage via presigned URLs, then
// POST the assembled card to /api/v1/creative-card.
//
// The 3D/audio authoring surfaces are client-only, so this whole page opts out
// of SSR to avoid touching window/AudioContext on the server.

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import CreativeHub from '@/components/creator/creative-hub';
import MyCreations from '@/components/creator/my-creations';
import {
  defaultStats, defaultRarity,
  type Discipline, type SportDesignation, type ArtPayload,
} from '@/lib/creator/creative-card-types';
import type { ArtPublishPayload } from '@/components/creator/modes/art-mode';
import type { MusicPublishPayload } from '@/components/creator/modes/music-mode';
import type { DancePublishPayload } from '@/components/creator/modes/dance-mode';
import type { ActingPublishPayload } from '@/components/creator/modes/acting-mode';

const ArtMode = dynamic(() => import('@/components/creator/modes/art-mode'), { ssr: false });
const MusicMode = dynamic(() => import('@/components/creator/modes/music-mode'), { ssr: false });
const DanceMode = dynamic(() => import('@/components/creator/modes/dance-mode'), { ssr: false });
const ActingMode = dynamic(() => import('@/components/creator/modes/acting-mode'), { ssr: false });

type Stage = 'hub' | 'mode';

interface Selection {
  primary: Discipline;
  secondary: Discipline[];
  licensed: boolean;
  sport?: SportDesignation;
}

async function uploadBlob(blob: Blob, fileName: string, contentType: string): Promise<string> {
  const res = await fetch('/api/v1/creative-card/upload-url', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fileName, contentType }),
  });
  if (!res.ok) throw new Error(`upload-url failed (${res.status})`);
  const { uploadUrl, publicUrl } = await res.json();
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': contentType }, body: blob });
  if (!put.ok) throw new Error(`upload failed (${put.status})`);
  return publicUrl as string;
}

export default function CreatePage() {
  const [stage, setStage] = useState<Stage>('hub');
  const [sel, setSel] = useState<Selection | null>(null);
  const [busy, setBusy] = useState(false);
  const [galleryKey, setGalleryKey] = useState(0);

  const enter = (primary: Discipline, secondary: Discipline[], licensed: boolean, sport?: SportDesignation) => {
    setSel({ primary, secondary, licensed, sport });
    setStage('mode');
  };

  async function submit(art: ArtPayload, title: string) {
    if (!sel) return;
    setBusy(true);
    try {
      const body = {
        title,
        primary: sel.primary,
        secondary: sel.secondary,
        sportDesignation: sel.sport,
        art,
        stats: defaultStats(),
        rarity: defaultRarity(),
        isPublic: true,
        licenseAccepted: sel.licensed as true,
      };
      const res = await fetch('/api/v1/creative-card', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data?.error ?? 'Publish failed'); return; }
      const pending = data?.card?.reviewState === 'pending_review';
      toast.success(pending ? 'Submitted for review — it goes public once approved.' : 'Card published! +50 coins');
      setGalleryKey((k) => k + 1);
      setStage('hub');
      setSel(null);
    } catch (e: any) {
      toast.error(e?.message ?? 'Network error');
    } finally {
      setBusy(false);
    }
  }

  const onArt = (p: ArtPublishPayload) => submit(
    { kind: 'art', canvasDataUrl: p.canvasDataUrl, palette: p.palette, brushSetId: p.brushSetId, appliedSurface: p.appliedSurface },
    `${p.appliedSurface} skin`,
  );

  const onMusic = async (p: MusicPublishPayload) => {
    setBusy(true);
    try {
      const stemUrls: string[] = [];
      for (let i = 0; i < p.stemBlobs.length; i++) {
        stemUrls.push(await uploadBlob(p.stemBlobs[i], `stem_${i}.wav`, 'audio/wav'));
      }
      await submit(
        { kind: 'music', trackId: `trk_${Date.now()}`, stemUrls, coverArtUrl: '', bpm: p.bpm, keySignature: 'Am' },
        `${p.bpm} BPM beat`,
      );
    } catch (e: any) {
      toast.error(e?.message ?? 'Upload failed'); setBusy(false);
    }
  };

  const onDance = (p: DancePublishPayload) => submit(
    { kind: 'dance', choreographyId: p.choreographyId, sequence: p.sequence },
    `${p.sequence.length}-step routine`,
  );

  const onActing = async (p: ActingPublishPayload) => {
    setBusy(true);
    try {
      const performanceUrl = await uploadBlob(p.audioBlob, `line_${p.sceneId}.webm`, 'audio/webm');
      await submit(
        { kind: 'acting', sceneId: p.sceneId, performanceUrl, voiceLineIds: [p.slot] },
        `Voice: ${p.slot}`,
      );
    } catch (e: any) {
      toast.error(e?.message ?? 'Upload failed'); setBusy(false);
    }
  };

  if (stage === 'hub' || !sel) return (
    <div className="min-h-screen bg-neutral-950">
      <CreativeHub onEnter={enter} />
      <MyCreations refreshKey={galleryKey} />
    </div>
  );

  return (
    <div className="relative">
      {busy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="rounded-xl bg-neutral-900 px-6 py-4 font-bold text-cyan-300">Publishing…</div>
        </div>
      )}
      <button onClick={() => setStage('hub')}
        className="fixed left-4 top-4 z-40 rounded-lg bg-neutral-800/80 px-3 py-1.5 text-sm font-bold text-neutral-200 backdrop-blur">
        ← Back
      </button>
      {sel.primary === 'art' && <ArtMode onPublish={onArt} />}
      {sel.primary === 'music' && <MusicMode onPublish={onMusic} />}
      {sel.primary === 'dance' && <DanceMode onPublish={onDance} />}
      {sel.primary === 'acting' && <ActingMode onPublish={onActing} />}
      {sel.primary === 'sport' && (
        <div className="min-h-screen bg-neutral-950 p-6 text-neutral-100">
          <h2 className="mb-2 text-2xl font-black">Sport Cards</h2>
          <p className="text-sm text-neutral-400">Sport routines are authored from your game sessions — play a mode, then save a highlight as a card. Pick Art, Music, Dance, or Acting here to author from scratch.</p>
        </div>
      )}
    </div>
  );
}
