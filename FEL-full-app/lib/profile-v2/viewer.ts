// PROFILE V2 — what another person sees of a profile (/u/[slug]). The allow/deny is visibility.ts; this decides what
// is left IN once allowed, before anything is rendered (so nothing withheld can reach the page, not even as a prop).
//
//   · never: the owner's Mirror numbers (jump, form — a coach gets those through the per-booking share, AB-04), the
//     week's tiles, opponents' names, the privacy controls;
//   · a PUBLIC viewer also gets only the blocks the owner shows on their public card (CreatorCard.showStats, the same
//     mask /card/[slug] applies: prq, mastery, records, highlights);
//   · a coach gets the rest.
// Pure.
import { normalizeVisibility } from '@/lib/creator/card-stats';
import type { ProfileV2Data } from './assemble';
import type { ProfileAudience } from './visibility';

export function redactForViewer(d: ProfileV2Data, as: Exclude<ProfileAudience, 'self'>, showStats: unknown): ProfileV2Data {
  const mask = as === 'public' ? normalizeVisibility(showStats) : { prq: true, mastery: true, records: true, highlights: true };
  const hiddenPrq = { score: null, label: 'PRQ —', status: 'HIDDEN', coverage: `0/${d.prq.total}`, color: '#9CA3AF', measured: 0, total: d.prq.total };
  return {
    identity: { ...d.identity, memberSince: null },
    prq: mask.prq ? d.prq : hiddenPrq,
    gates: { adult: d.gates.adult, canSaveScan: false },
    tiles: [],
    stats: {
      jumpWeeks: null, jumpBestIn: null, formWeeks: null,
      bestsScope: d.stats.bestsScope,
      modes: mask.records ? d.stats.modes : [],
      // the skills behind the PRQ, minus camera estimates (a body-camera jump is a Mirror number)
      skills: mask.prq ? d.stats.skills.filter((s) => !s.estimate) : [],
    },
    badges: { ...d.badges, mastery: mask.mastery ? d.badges.mastery : [], hasCoach: false },
    squad: { opponents: [], rival: null, matchesPlayed: 0, links: { count: 0, opened: 0, attempted: 0, beaten: 0 } },
    highlights: { pinned: mask.highlights ? d.highlights.pinned : [] },
    privacy: { minorOrUnknown: d.privacy.minorOrUnknown, visibility: d.privacy.visibility, cardSlug: null, coaches: [] },
  };
}
