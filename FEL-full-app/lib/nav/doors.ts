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
  { href: '/venues', label: 'Venues', tab: 'play' },
  { href: '/arena', label: 'Arena', tab: 'play' },
  { href: '/ladder', label: 'Ladder', tab: 'play' },
  { href: '/story', label: 'Story', tab: 'play' },
  { href: '/host', label: 'Big screen', tab: 'play' },
  { href: '/join', label: 'Join a game', tab: 'play' },   // MULTIPLAYER (2026-10-06): type the code on a friend's TV
  { href: '/party', label: 'Party chat', tab: 'play' },   // PARTY-CHAT (2026-10-13): the PSN-style party — chat, voice, play together
  { href: '/modes', label: 'All modes', tab: 'play' },

  // TRAIN — the coaching business, the credentials, the classes, the gym.
  // OWNER (2026-10-27): /workout and /live ("Program guide") are off the menus; the routes still work by link
  // (lib/nav/reachability.test.ts NOT_NAVIGABLE says so).
  { href: '/camp', label: 'Camp', tab: 'train' },
  { href: '/education', label: 'Education', tab: 'train' },
  { href: '/learn', label: 'Learn feed', tab: 'train' },
  { href: '/coach', label: 'Coaching', tab: 'train' },

  // PROFILE — what you own, what you have done, what you make.
  { href: '/press', label: 'Books', tab: 'profile' },
  { href: '/account/bookings', label: 'Bookings', tab: 'profile' },   // OWNER-FOLLOWUPS (2026-10-13): paid reviews and calls, after the thanks page
  { href: '/team', label: 'Team', tab: 'profile' },
  { href: '/cards', label: 'Card collection', tab: 'profile' },
  { href: '/account', label: 'Account', tab: 'profile' },
  { href: '/market', label: 'Marketplace', tab: 'profile' },
  { href: '/create', label: 'Create', tab: 'profile' },
  { href: '/guidance', label: 'Pathways', tab: 'profile' },
  // OWNER (2026-10-27): the hoops weekly challenge hub is "Weekly challenges" in the menus, so it is never confused with
  // Signature programs (/train/programs). The route keeps its address.
  { href: '/signature', label: 'Weekly challenges', tab: 'profile' },
  { href: '/support', label: 'Support', tab: 'profile' },
];

export function doorsFor(tab: Door['tab']): Door[] {
  return DOORS.filter((d) => d.tab === tab);
}
