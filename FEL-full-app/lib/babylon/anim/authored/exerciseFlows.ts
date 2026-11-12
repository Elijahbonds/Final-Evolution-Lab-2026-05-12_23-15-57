// The mobility flows the library names (LIBRARY-ANATOMY-2, 2026-10-25): data only, so the pure demo table (lib/library/demo.ts)
// and the loop builder (exerciseFloor.ts) read the same list without the demo table importing Babylon. Each is the
// family mobility-flow variation without its 'flow-' / 'flow3-' prefix: the positions in order (exerciseFloor POSITIONS).
// The clip is `ex_flow_<a>_<b>[_<c>]`.
export const FLOW_SEQS: readonly string[] = [
  'squat-cossack', 'squat-fold', 'squat-spider', 'squat-frog', 'fold-inchworm', 'fold-dog', 'inchworm-dog', 'inchworm-spider',
  'dog-spider', 'dog-child', 'dog-pigeon', 'dog-halfsplit', 'spider-halfsplit', 'spider-lowlunge', 'halfsplit-kneel', 'halfsplit-lowlunge',
  'kneel-lowlunge', 'kneel-ninety', 'ninety-pigeon', 'ninety-shinbox', 'pigeon-child', 'child-catcamel', 'child-thread', 'child-frog',
  'catcamel-thread', 'catcamel-frog', 'thread-frog', 'bear-dog', 'bear-child', 'bear-inchworm', 'cobra-dog', 'cobra-child',
  'lizard-spider', 'lizard-halfsplit', 'lizard-dog', 'butterfly-ninety', 'butterfly-frog', 'couch-kneel', 'couch-halfsplit', 'couch-lowlunge',
  'pigeon-lizard', 'squat-butterfly', 'cossack-squat-fold', 'cossack-squat-spider', 'cossack-squat-frog', 'butterfly-squat-cossack', 'fold-squat-spider', 'fold-squat-frog',
  'butterfly-squat-fold', 'frog-squat-spider', 'butterfly-squat-spider', 'butterfly-squat-frog', 'inchworm-fold-squat', 'dog-fold-squat', 'dog-fold-inchworm', 'inchworm-spider-squat',
  'dog-spider-squat', 'halfsplit-spider-squat', 'lowlunge-spider-squat', 'lizard-spider-squat', 'dog-spider-inchworm', 'halfsplit-spider-inchworm', 'inchworm-spider-lowlunge', 'inchworm-spider-lizard',
  'dog-spider-halfsplit', 'dog-spider-lowlunge', 'dog-spider-lizard', 'halfsplit-spider-lowlunge', 'halfsplit-spider-lizard', 'lizard-spider-lowlunge', 'child-frog-squat', 'catcamel-frog-squat',
  'squat-frog-thread', 'catcamel-frog-child', 'child-frog-thread', 'butterfly-frog-child', 'catcamel-frog-thread', 'butterfly-frog-catcamel', 'butterfly-frog-thread', 'fold-inchworm-spider',
  'bear-inchworm-fold', 'bear-inchworm-dog', 'bear-inchworm-spider', 'fold-dog-spider', 'child-dog-fold', 'fold-dog-pigeon', 'fold-dog-halfsplit', 'bear-dog-fold',
  'cobra-dog-fold', 'fold-dog-lizard', 'child-dog-inchworm', 'inchworm-dog-pigeon', 'halfsplit-dog-inchworm', 'cobra-dog-inchworm', 'inchworm-dog-lizard', 'child-dog-spider',
  'pigeon-dog-spider', 'bear-dog-spider', 'cobra-dog-spider', 'child-dog-pigeon', 'child-dog-halfsplit', 'bear-dog-child', 'child-dog-cobra', 'child-dog-lizard',
  'halfsplit-dog-pigeon', 'bear-dog-pigeon', 'cobra-dog-pigeon', 'lizard-dog-pigeon', 'bear-dog-halfsplit', 'cobra-dog-halfsplit', 'halfsplit-dog-lizard', 'bear-dog-cobra',
  'bear-dog-lizard', 'cobra-dog-lizard', 'catcamel-child-dog', 'dog-child-thread', 'dog-child-frog', 'catcamel-child-pigeon', 'pigeon-child-thread', 'frog-child-pigeon',
  'bear-child-pigeon', 'cobra-child-pigeon', 'catcamel-child-thread', 'bear-child-catcamel', 'catcamel-child-cobra', 'bear-child-thread', 'cobra-child-thread', 'bear-child-frog',
  'cobra-child-frog', 'bear-child-cobra', 'dog-pigeon-ninety', 'child-pigeon-ninety', 'lizard-pigeon-ninety', 'child-pigeon-lizard', 'dog-halfsplit-kneel', 'dog-halfsplit-lowlunge',
  'couch-halfsplit-dog', 'kneel-halfsplit-spider', 'couch-halfsplit-spider', 'kneel-halfsplit-lowlunge', 'kneel-halfsplit-lizard', 'couch-halfsplit-kneel', 'lizard-halfsplit-lowlunge', 'couch-halfsplit-lowlunge',
  'couch-halfsplit-lizard', 'kneel-lowlunge-spider', 'couch-lowlunge-spider', 'couch-lowlunge-kneel', 'halfsplit-kneel-ninety', 'lowlunge-kneel-ninety', 'couch-kneel-ninety', 'kneel-ninety-pigeon',
  'kneel-ninety-shinbox', 'butterfly-ninety-kneel', 'pigeon-ninety-shinbox', 'butterfly-ninety-pigeon', 'butterfly-ninety-shinbox', 'child-bear-inchworm', 'pigeon-lizard-spider', 'halfsplit-lizard-pigeon',
  'frog-butterfly-ninety', 'ninety-butterfly-squat',
];
export const flowClip = (seq: string): string => `ex_flow_${seq.replace(/-/g, '_')}`;
export const FLOW_CLIPS: readonly string[] = FLOW_SEQS.map(flowClip);
