'use client';

// Turntable and pose views. The clips are the ones previewPose names; this file does not know a section.

import { POSE_VIEWS } from '@/lib/creator/editor/previewPose';

export function PreviewControls({
  spinning, onToggleSpin, onPose,
}: {
  spinning: boolean;
  onToggleSpin: () => void;
  onPose: (clip: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 p-2">
      <button type="button" onClick={onToggleSpin}
        className={`rounded-lg px-2 py-1 font-mono text-[10px] uppercase tracking-wide ${spinning ? 'bg-[var(--fel-cyan)] text-black' : 'fel-panel text-white/70'}`}
        aria-pressed={spinning}>
        Turntable
      </button>
      {POSE_VIEWS.filter((p) => p.clip).map((p) => (
        <button key={p.id} type="button" onClick={() => onPose(p.clip!)}
          className="fel-panel rounded-lg px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-white/70"
          aria-label={`Pose ${p.label}`}>
          {p.label}
        </button>
      ))}
    </div>
  );
}
