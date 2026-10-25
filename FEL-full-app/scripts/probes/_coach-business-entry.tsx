// COACH-BUSINESS (2026-10-25): the coach-business screens with no server. Bundled by scripts/probes/_coach-business-shots.mts
// with esbuild and loaded into headless Chromium at phone and desktop widths. `window.__VIEW` picks the screen; every
// /api call is answered from the fixtures below. The fixtures are the awkward case: long names, every package kind, a
// capacity nearly full, an applicant with a long note.
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { CoachProfileView, type CoachProfileViewProps } from '@/components/coach-business/coach-profile-view';
import { MarketplaceView } from '@/components/coach-business/marketplace-view';
import { BusinessDashboard } from '@/components/coach-business/business-dashboard';
import type { Dashboard } from '@/lib/coach-business/dashboard';
import type { MarketCard } from '@/lib/coach-business/market';

const pkg = (o: Partial<CoachProfileViewProps['packages'][number]>): CoachProfileViewProps['packages'][number] => ({
  id: 'p', coachId: 'c', kind: 'monthly', title: 'Online coaching', summary: '', priceCents: 12_000, includes: ['x'], capacity: null, sessions: null, active: true, sortOrder: 0, spotsLeft: null, action: 'apply', ...o,
});
const PACKAGES = [
  pkg({ id: 'p1', kind: 'monthly', title: 'Monthly online coaching', summary: 'A program written for you each week, adjusted from your sessions and check-ins.', priceCents: 14_900, includes: ['A weekly program in the app', 'Form review on your key lifts', 'Message me any day', 'A monthly call'], capacity: 12, spotsLeft: 2 }),
  pkg({ id: 'p2', kind: 'session_pack', title: 'Four live sessions', summary: 'One-to-one, on video or at the gym.', priceCents: 24_000, includes: ['4 sessions, 60 minutes', 'A written plan after each'], sessions: 4, capacity: 6, spotsLeft: 6 }),
  pkg({ id: 'p3', kind: 'single_review', title: 'Jump technique review', summary: 'Send three clips; get a marked-up reply and two drills.', priceCents: 4_900, includes: ['A reply within 48 hours', 'Two drills for your weak point'] }),
  pkg({ id: 'p4', kind: 'program', title: 'Eight-week vertical program', priceCents: 7_900, includes: ['24 sessions in the app', 'Testing in weeks 1, 4 and 8'], capacity: 1, spotsLeft: 0, action: 'full' }),
];
const PROFILE: CoachProfileViewProps = {
  profile: {
    slug: 'jordan-montgomery-fitzgerald', displayName: 'Jordan Montgomery-Fitzgerald', headline: 'Vertical jump and speed coach for basketball and volleyball players',
    bio: 'I have coached jumpers for eleven years, from high-school varsity to pro. My programs start from a camera movement screen and change every week from what you actually did.\n\nI coach online and in person in Oakland.',
    specialties: ['Vertical jump', 'Speed', 'Return to play'], certifications: ['CSCS', 'USAW Level 1'],
  },
  sports: ['basketball', 'volleyball'], goals: ['vertical', 'speed', 'comeback'],
  highlights: [
    { id: 'h1', text: 'Added four inches to my vertical in ten weeks, and I finally dunked in a game.' },
    { id: 'h2', text: 'Back on court eight weeks after my ankle sprain, jumping higher than before it.' },
  ],
  packages: PACKAGES, store: null, paymentsLive: false, testMode: false, acceptingClients: true, marketOn: true,
};
const LIVE: CoachProfileViewProps = { ...PROFILE, paymentsLive: true, testMode: true, packages: PACKAGES.map((k) => (k.action === 'apply' ? { ...k, action: 'book' as const } : k)) };

const CARDS: MarketCard[] = [
  { slug: 'jordan', displayName: 'Jordan Montgomery-Fitzgerald', headline: 'Vertical jump and speed coach for basketball and volleyball players', specialties: [], sports: ['basketball', 'volleyball'], goals: ['vertical', 'speed'], fromPriceCents: 4_900, fromMonthly: false, acceptingClients: true },
  { slug: 'sam', displayName: 'Sam Rivera', headline: 'Strength for field athletes', specialties: [], sports: ['football', 'soccer'], goals: ['strength', 'conditioning'], fromPriceCents: 9_900, fromMonthly: true, acceptingClients: true },
  { slug: 'lee', displayName: 'Lee Okafor', headline: null, specialties: [], sports: ['track'], goals: ['speed'], fromPriceCents: null, fromMonthly: false, acceptingClients: false },
];

const DASH: Dashboard = {
  ready: true,
  plan: { plan: 'free', gatesOn: true, clientLimit: 3, activeClients: 2 },
  proPriceCents: 2_900, paymentsLive: false, marketplaceOn: true,
  profile: { slug: 'jordan-montgomery-fitzgerald', displayName: 'Jordan Montgomery-Fitzgerald', headline: PROFILE.profile.headline, bio: PROFILE.profile.bio, specialties: PROFILE.profile.specialties, certifications: PROFILE.profile.certifications, published: true },
  market: { listed: true, acceptingClients: true, sports: ['basketball', 'volleyball'], goals: ['vertical', 'speed'] },
  packages: PACKAGES.map((k) => ({ ...k, spotsLeft: k.spotsLeft })),
  connect: null,
  // PAYMENTS-READY fixtures: the Connect tick box (test mode, coach terms not written yet), the fee line, no disputes
  needsStripeSetup: true,
  coachTerms: { version: 'coach-terms-unsigned-test-mode', href: null, signed: false },
  feeLabel: '5%',
  disputes: [],
  sales: [
    { id: 's1', packageId: 'p2', title: 'Four live sessions', kind: 'session_pack', status: 'PAID', amountCents: 24_000, feeCents: 1_200, refundedCents: 0, feeRefundedCents: 0, livemode: false, paidAt: '2026-10-20T10:00:00Z', createdAt: '2026-10-20T10:00:00Z' },
    { id: 's2', packageId: 'p1', title: 'Monthly online coaching', kind: 'monthly', status: 'ACTIVE', amountCents: 14_900, feeCents: 745, refundedCents: 0, feeRefundedCents: 0, livemode: false, paidAt: '2026-10-18T10:00:00Z', createdAt: '2026-10-18T10:00:00Z' },
  ],
  applications: [
    { id: 'a1', packageId: 'p1', goal: 'vertical', note: 'I play varsity basketball and want to dunk by the start of the season. I can train four days a week.', status: 'OPEN', createdAt: '2026-10-24T10:00:00Z', applicantName: 'Alexandria Montgomery', applicantEmail: 'alexandria.montgomery.longname@example.com' },
  ],
  highlights: [
    { id: 'h1', text: PROFILE.highlights[0].text, state: 'approved' },
    { id: 'h3', text: 'Ran a 4.6 forty after twelve weeks.', state: 'waiting' },
  ],
};
const LIVE_DASH: Dashboard = { ...DASH, plan: { ...DASH.plan, plan: 'pro' }, paymentsLive: true, needsStripeSetup: false, connect: { chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, livemode: false, requirementsDue: false } };
// PAYMENTS-READY: Stripe asks the coach for more (requirements due) and a client disputed a sale
const SETUP_DASH: Dashboard = {
  ...LIVE_DASH, needsStripeSetup: true, connect: { chargesEnabled: true, payoutsEnabled: false, detailsSubmitted: true, livemode: false, requirementsDue: true },
  disputes: [
    { id: 'dp_1', saleId: 's1', title: 'Four live sessions', amountCents: 24_773, reason: 'fraudulent', stripeStatus: 'needs_response', outcome: 'OPEN', livemode: false, createdAt: '2026-10-24T10:00:00Z', closedAt: null },
    { id: 'dp_2', saleId: 's2', title: 'Monthly online coaching', amountCents: 15_373, reason: 'product_not_received', stripeStatus: 'won', outcome: 'WON', livemode: false, createdAt: '2026-10-02T10:00:00Z', closedAt: '2026-10-20T10:00:00Z' },
  ],
};

const view = (window as unknown as { __VIEW?: string }).__VIEW ?? 'profile';
window.fetch = async (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  if (path === '/api/coach/business') return Response.json(view === 'dashboard-live' ? LIVE_DASH : view === 'dashboard-setup' ? SETUP_DASH : DASH);
  if (path === '/api/coach/roster') return Response.json({ roster: [{ clientId: 'c1', name: 'Alexandria Montgomery' }] });
  return Response.json({ error: 'not_found' }, { status: 404 });
};

const shell = (child: ReturnType<typeof createElement>) => createElement('div', { className: 'min-h-screen bg-[#050505] pb-20' }, child);
const root = createRoot(document.getElementById('root')!);
if (view === 'profile') root.render(shell(createElement(CoachProfileView, PROFILE)));
else if (view === 'profile-live') root.render(shell(createElement(CoachProfileView, LIVE)));
else if (view === 'market') root.render(shell(createElement(MarketplaceView, { q: { sport: 'basketball', goal: null }, cards: CARDS, ready: true })));
else root.render(shell(createElement(BusinessDashboard)));
