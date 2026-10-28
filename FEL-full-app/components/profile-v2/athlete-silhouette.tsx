// The athlete's SHAPE (lane/profile-character): what the profile's stage shows while the real 3D athlete loads (a shimmer
// running through it — the kit's skeleton look, components/ui/fel/skeleton), and what another person's profile shows,
// still, because no public picture of someone else's body exists (an owner call: docs/PROFILE-V2.md). A solid, standing
// body in the stage's light, never the old SVG stick figure. Server-safe: no script, no download.
import { SkeletonGroup } from '@/components/ui/fel/skeleton';

// one standing athlete, 100 × 220: head, neck, torso, arms down at the sides, legs; the right side is the left mirrored
const HALF = 'M50 39C41 39 33 40 27 42C22 44 20 48 20 54L16 92C15 101 15 111 16 118C17 122 21 122 22 118L24 94L27 66L29 92C30 102 31 112 31 120L31 160L30 202C30 206 28 208 25 209C21 210 21 215 25 215L37 215C39 215 40 213 40 210L43 166L46 128L50 126Z';
const BODY = `<ellipse cx="50" cy="18" rx="11" ry="13.5"/><path d="M45 28h10l1 12H44z"/><path d="${HALF}"/><path transform="matrix(-1 0 0 1 100 0)" d="${HALF}"/>`;
const MASK = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 220"><g fill="#000">${BODY}</g></svg>`)}") center / contain no-repeat`;

export function AthleteSilhouette({ loading = false, accent }: { loading?: boolean; accent: string }) {
  const body = (
    <div className="relative flex h-full w-full items-end justify-center pb-[6%]">
      <div aria-hidden className="absolute inset-x-[18%] bottom-[3%] h-[9%] rounded-[50%]" style={{ background: `radial-gradient(closest-side, ${accent}40, transparent)` }} />
      <div aria-hidden data-athlete-silhouette className={`relative h-[86%] ${loading ? 'fel-skeleton' : ''}`}
        style={{
          aspectRatio: '100 / 220', WebkitMask: MASK, mask: MASK,
          ...(loading ? {} : { background: `linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.07) 55%, ${accent}26 100%)` }),
        }} />
    </div>
  );
  return loading ? <SkeletonGroup className="h-full w-full">{body}</SkeletonGroup> : body;
}
