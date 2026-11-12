import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { ACCOUNT_SETTINGS_PATH } from '@/lib/account/paths';
import { AccountSettings } from '@/components/account/account-settings';
import Link from 'next/link';
import { ScanSaveAccount } from '@/components/privacy/scan-save-account';
import { TabPage } from '@/components/shell/tab-page';
import { AccessibilitySettings } from '@/components/settings/accessibility-settings';
import { PrqDataRights, HealthDataSection } from '@/components/profile-view';
import { prisma } from '@/lib/db';
import { readScanSaveAccountState } from '@/lib/privacy/scanSaveAccountState';

export const dynamic = 'force-dynamic';

/** Account settings. A signed-out visitor goes to login and comes back here via ?next. */
export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect(loginPath(ACCOUNT_SETTINGS_PATH));
  // ACCOUNT-SHIFT (2026-11-12): the "Jump numbers" panel's state is read here, so a verified adult gets the panel in the
  // first paint instead of after two requests (it used to appear on top and push every section down: CLS 0.112). The
  // same reads the panel's routes answer with; on no id or a failed read the panel fetches on its own, as before.
  const userId = (session.user as { id?: string }).id;
  const scanSave = typeof userId === 'string' && userId ? await readScanSaveAccountState(prisma, userId).catch(() => null) : null;

  return (
    <TabPage
      eyebrow="Account"
      title="Account settings"
      lede="Download your data, choose whether jump numbers are saved, or erase the health data stored for this account."
      accent="#00E5FF"
    >
      <ScanSaveAccount initial={scanSave} />
      <AccountSettings email={session.user.email ?? ''} />
      {/* PROFILE V2 (2026-10-24): the settings that lived on the profile — motion, PRQ data rights, health data */}
      <PrqDataRights />
      <HealthDataSection />
      {/* HOTFIX (2026-09-24): reduced motion — the device decides by default; this is the override, both ways.
          A11-03 / A11-05 (2026-10-25): with it, colour vision for the game HUD and the big-screen menus. */}
      <div className="mt-8"><AccessibilitySettings /></div>
      <p className="mt-4 text-sm"><Link href="/account/coaching" className="inline-flex min-h-11 items-center">Coaching</Link></p>
    </TabPage>
  );
}
