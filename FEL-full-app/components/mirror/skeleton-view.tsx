'use client';

// The Mirror's camera layer and its skeleton-only switch (MIRROR-COACH P9, 2026-09-30). Why the view exists, why the
// <video> stays mounted and why it is hidden with opacity rather than removed: lib/mirror/skeletonView.ts.
//
// Two small pieces so mirror-harness.tsx's edit stays a swap of one element and one button (open PR #51 edits the same
// file), and so a test can render them: app/ is outside vitest's include list, components/ is inside it.

import { forwardRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { skeletonToggleLabel, stageLayers } from '@/lib/mirror/skeletonView';

/**
 * The live camera element. It is the pose model's frame source in both views; in the skeleton-only view no picture is
 * painted (opacity 0), and it leaves the accessibility tree (there is nothing to see).
 */
export const CameraImage = forwardRef<HTMLVideoElement, { skeletonOnly: boolean }>(function CameraImage({ skeletonOnly }, ref) {
  const { cameraImage } = stageLayers(skeletonOnly);
  return (
    <video
      ref={ref}
      playsInline
      muted
      aria-hidden={cameraImage ? undefined : true}
      data-camera-image={cameraImage ? 'on' : 'off'}
      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${cameraImage ? 'opacity-100' : 'opacity-0'}`}
    />
  );
});

/** The switch. Pressed = skeleton only (no camera picture). */
export function SkeletonToggle({ skeletonOnly, onToggle }: { skeletonOnly: boolean; onToggle: () => void }) {
  const label = skeletonToggleLabel(skeletonOnly);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={skeletonOnly}
      aria-label={label}
      title={label}
      data-skeleton-toggle
      className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/20 bg-black/50 backdrop-blur-md transition-colors hover:border-white/40"
      style={{ color: skeletonOnly ? '#00E5FF' : 'rgba(255,255,255,0.55)' }}
    >
      {skeletonOnly ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
    </button>
  );
}
