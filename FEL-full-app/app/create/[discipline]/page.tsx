// /create/<discipline> — CREATE HUB: the guided flow (make or import → details and rights → preview and submit).
// Every publish-as-card button in the game links here (lib/create/flow.ts publishHref), e.g. the Academy's
// /create/music?from=academy&song=<id>. Unknown disciplines are a 404; unknown query params are dropped (readEntry).

import { notFound, redirect } from 'next/navigation';
import { loginPath } from '@/lib/auth/safeNext';
import { isDiscipline } from '@/lib/creator/creative-card-types';
import { creatorContext } from '@/lib/create/creator-context';
import { readEntry } from '@/lib/create/flow';
import GuidedFlow from '@/components/create/guided-flow';

export const dynamic = 'force-dynamic';

export default async function CreateDisciplinePage({ params, searchParams }: {
  params: { discipline: string }; searchParams: Record<string, string | string[] | undefined>;
}) {
  const d = params.discipline;
  if (!isDiscipline(d)) notFound();
  const ctx = await creatorContext();
  if (!ctx) redirect(loginPath(`/create/${d}`));
  return <GuidedFlow discipline={d} entry={readEntry(searchParams)} {...ctx} />;
}
