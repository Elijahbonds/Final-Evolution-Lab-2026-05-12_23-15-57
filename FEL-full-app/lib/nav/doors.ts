// doors — the secondary rooms of each tab.
//
// Cutting the old five-tab bar removed the only link to nine routes. /camp, /education, /live and /workout were
// its secondary row; /cards and /market were chips in the header. All of them still work; nothing pointed at them
// any more, which is the exact failure the tabs were built to end -- a product reachable only by typing its URL.
//
// A door is not a headline. The tab's own cards carry the things you do every day; these are the rooms behind
// them, listed small, in one row, in the tab they belong to. lib/nav/reachability.test.ts walks the app directory
// and fails if a route exists with nothing pointing at it, so the next thing that gets built cannot go quiet.

export interface Door { href: string; label: string; tab: 'play' | 'train' | 'profile' }

export const DOORS: Door[] = [
  // PLAY — the rooms around the games rather than the games themselves.
  { href: '/arena', label: 'Arena', tab: 'play' },
  { href: '/ladder', label: 'Ladder', tab: 'play' },
  { href: '/story', label: 'Story', tab: 'play' },
  { href: '/host', label: 'Big screen', tab: 'play' },
  { href: '/modes', label: 'All modes', tab: 'play' },

  // TRAIN — the coaching business, the credentials, the classes, the gym.
  { href: '/workout', label: 'Workouts', tab: 'train' },
  { href: '/camp', label: 'Camp', tab: 'train' },
  { href: '/education', label: 'Education', tab: 'train' },
  { href: '/live', label: 'Live classes', tab: 'train' },
  { href: '/coach', label: 'Coaching', tab: 'train' },

  // PROFILE — what you own, what you have done, what you make.
  { href: '/cards', label: 'Card collection', tab: 'profile' },
  { href: '/market', label: 'Marketplace', tab: 'profile' },
  { href: '/create', label: 'Studio', tab: 'profile' },
  { href: '/guidance', label: 'Pathways', tab: 'profile' },
  { href: '/signature', label: 'Signature', tab: 'profile' },
  { href: '/support', label: 'Support', tab: 'profile' },
];

export function doorsFor(tab: Door['tab']): Door[] {
  return DOORS.filter((d) => d.tab === tab);
}
