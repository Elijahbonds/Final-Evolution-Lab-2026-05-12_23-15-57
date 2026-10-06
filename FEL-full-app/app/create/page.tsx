// /create — CREATE HUB (owner, 2026-10-06): the one place to make anything in FEL. Nine tiles, each saying where the
// work shows up in the game, then My Creations with review status (components/creator/creative-hub.tsx). A tile opens
// the guided three-step flow at /create/<discipline>. Login-gated by app/create/layout.tsx.
//
// This page used to be the whole studio (pick disciplines, tick a licence, open an editor, publish). The editors are
// step 1 of the flow now, and the licence is the flow's rights statement (the owner's words, versioned).

import { redirect } from 'next/navigation';
import { loginPath } from '@/lib/auth/safeNext';
import { creatorContext } from '@/lib/create/creator-context';
import CreativeHub from '@/components/creator/creative-hub';

export const dynamic = 'force-dynamic';

export default async function CreatePage() {
  const ctx = await creatorContext();
  if (!ctx) redirect(loginPath('/create'));
  return <CreativeHub publicCreator={ctx.publicCreator} />;
}
