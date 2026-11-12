import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { VeniceHubLoader } from './loader';

export const dynamic = 'force-dynamic';

/**
 * lane/venice-hub (2026-11-12): the Venice hub layout prototype — walk the layout (docs/VENICE-HUB-PLAN.md) with the shipped
 * Venice court kit on the four courts and flat placeholder blocks everywhere else. Hard 404 outside `next dev` (the shared
 * app/dev rule); never linked, never indexed. It launches nothing by itself: a spot's link opens the mode's own route.
 */
export const metadata: Metadata = {
  title: 'Venice hub prototype',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function VeniceHubPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <VeniceHubLoader />;
}
