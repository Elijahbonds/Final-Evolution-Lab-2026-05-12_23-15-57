import type { CoachManifest } from './manifest';

/**
 * Pure helper: the store-price product keys a manifest's purchase grants. No I/O.
 *
 * `program` (dunking only — the only sellable lane) grants the dunking 8-week product. `course`/`series` grant
 * their own product. `bundle` grants every one of its members. `membership`/`live_1on1`/`video_review` grant
 * none of the three course/series/bundle products — whether a membership SHOULD also grant them is an open
 * question for Elijah (see the PR body), not decided here.
 */
export function productsGrantedBy(manifest: CoachManifest): readonly string[] {
  switch (manifest.kind) {
    case 'program':
      return manifest.lane === 'dunking' ? ['dunking-plyometrics-8wk'] : [];
    case 'course':
    case 'series':
      return [manifest.product];
    case 'bundle':
      return manifest.members;
    case 'membership':
    case 'live_1on1':
    case 'video_review':
      return [];
    default:
      return [];
  }
}
