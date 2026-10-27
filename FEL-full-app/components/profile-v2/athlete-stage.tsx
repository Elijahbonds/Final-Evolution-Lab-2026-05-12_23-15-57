'use client';

// The athlete at the top of the profile. A static poster first (components/avatar-figure: SVG, no script to run, no
// download) and the 3D athlete only when asked for, as its own lazily loaded chunk (athlete-3d.tsx).
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Box } from 'lucide-react';
import { AvatarFigure } from '@/components/avatar-figure';
import { ROSTER } from '@/lib/game-data';
import { Skeleton, SkeletonGroup } from '@/components/ui/fel/skeleton';

// premium-ui P10: while the 3D chunk loads, the athlete's shape (a ring and a body line), never a line of grey text
const Athlete3D = dynamic(() => import('./athlete-3d'), { ssr: false, loading: () => (
  <SkeletonGroup className="flex h-full flex-col items-center justify-center gap-3"><Skeleton shape="ring" /><Skeleton className="!h-24 !w-10" /></SkeletonGroup>
) });

export function AthleteStage({ avatarKey, cosmeticAssetId, name, accent, allow3d = true }: { avatarKey: string | null; cosmeticAssetId: string | null; name: string; accent: string; allow3d?: boolean }) {
  const [three, setThree] = useState(false);
  const avatar = ROSTER.find((r) => r.key === avatarKey) ?? ROSTER[0];
  if (three) {
    return (
      <div className="fel-surface h-[300px] w-full overflow-hidden lg:h-[300px]">
        <Athlete3D onClose={() => setThree(false)} />
      </div>
    );
  }
  return (
    <div className="fel-surface relative flex h-[172px] w-full items-center justify-center overflow-hidden lg:h-[300px]">
      <div aria-hidden className="absolute inset-x-6 bottom-3 h-6 rounded-[50%]" style={{ background: `radial-gradient(closest-side, ${accent}33, transparent)` }} />
      <div className="relative lg:scale-[1.8]" role="img" aria-label={`${name}'s athlete`}>
        <AvatarFigure avatar={avatar} size={104} cosmeticAssetId={cosmeticAssetId} />
      </div>
      {allow3d && <button
        type="button"
        onClick={() => setThree(true)}
        className="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/50 px-3 py-1.5 text-[12px] font-bold text-white/85 hover:bg-black/70"
      >
        <Box className="h-3.5 w-3.5" aria-hidden /> See in 3D
      </button>}
    </div>
  );
}
