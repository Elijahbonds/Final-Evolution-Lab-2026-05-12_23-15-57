import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { isBinjgbLocalFileEnabled, isBinjgbShelfEnabled } from '@/lib/flags';
import { readDobYear } from '@/lib/privacy/scanSaveGate';
import { shelfAccess } from '@/lib/binjgb/gate';
import { SHELF_TITLES } from '@/lib/binjgb/manifest';
import { SHELF_COPY } from '@/lib/binjgb/copy';
import { HomebrewShelf } from '@/components/binjgb/homebrew-shelf';

export const dynamic = 'force-dynamic';
export const metadata = { title: SHELF_COPY.metaTitle };

/**
 * BINJGB-SHELF-1 — the Homebrew Shelf. 404 while BINJGB_SHELF_ENABLED is off (before anything is read); a session is
 * required; the age band is read from the DATABASE (G6): under 13 → 404, unknown → the age prompt, teen → the shelf only,
 * verified adult → the shelf plus the load-your-own picker when BINJGB_LOCAL_FILE_ENABLED is on too (L1).
 * Headers: middleware.ts (per-route CSP, Permissions-Policy) + next.config.js's appended shelf rule (N-2 / F-A).
 */
export default async function HomebrewShelfPage() {
  if (!isBinjgbShelfEnabled()) notFound();
  const session = await getServerSession(authOptions);
  const me = (session?.user as { id?: string } | undefined)?.id;
  if (!me) redirect(loginPath('/play/gb-shelf'));
  const access = shelfAccess({
    shelfOn: true,
    localOn: isBinjgbLocalFileEnabled(),
    dobYear: await readDobYear(prisma, me, 'gb_shelf_page'),
  });
  if (access.kind === 'not-found') notFound();
  return (
    <HomebrewShelf
      titles={SHELF_TITLES}
      agePrompt={access.kind === 'age-prompt'}
      picker={access.kind === 'shelf' && access.picker}
    />
  );
}
