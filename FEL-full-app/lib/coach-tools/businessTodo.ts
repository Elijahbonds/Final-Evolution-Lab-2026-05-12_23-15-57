// businessTodo — "Still to do" at the top of the coach's business page (COACH-TOOLS-EASY, 2026-11-02; owner decision 8).
// The page is one long screen (plan, payments, page, packages, sales, applications, results: 197 words, 25 controls, 7
// inputs on the rig) and nothing said what was left. This reads the dashboard the page already has and lists only the
// unfinished steps, each a jump to its own card. It changes no price, fee or payment line: those cards are unchanged,
// and payments appear here only once the owner has turned them on.
//
// Pure.
import type { Dashboard } from '@/lib/coach-business/dashboard';

export interface TodoItem { id: string; text: string; href: string }

export function businessTodo(d: Pick<Dashboard, 'ready' | 'paymentsLive' | 'needsStripeSetup' | 'marketplaceOn' | 'profile' | 'market' | 'packages' | 'applications' | 'highlights'>): TodoItem[] {
  const out: TodoItem[] = [];
  if (!d.profile?.published) out.push({ id: 'publish', text: 'Publish your page', href: '#profile-h' });
  if (d.ready && d.marketplaceOn && d.profile?.published && !d.market.listed) out.push({ id: 'list', text: 'List your page in Find a coach', href: '#profile-h' });
  if (d.ready && !d.packages.some((p) => p.active)) out.push({ id: 'package', text: 'Add a package', href: '#pkg-h' });
  if (d.ready && d.paymentsLive && d.needsStripeSetup) out.push({ id: 'payments', text: 'Finish setting up payments', href: '#pay-h' });
  const open = d.ready ? d.applications.filter((a) => a.status === 'OPEN').length : 0;
  if (open) out.push({ id: 'applications', text: open === 1 ? 'Answer 1 application' : `Answer ${open} applications`, href: '#apps-h' });
  const waiting = d.ready ? d.highlights.filter((h) => h.state === 'waiting').length : 0;
  if (waiting) out.push({ id: 'results', text: waiting === 1 ? 'Check 1 result for your page' : `Check ${waiting} results for your page`, href: '#hl-h' });
  return out;
}

export const TODO_COPY = { title: 'Still to do', done: 'All set. Your page and packages are ready.' } as const;
