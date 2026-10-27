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

export const dynamic = 'force-dynamic';

/** Account settings. A signed-out visitor goes to login and comes back here via ?next. */
export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect(loginPath(ACCOUNT_SETTINGS_PATH));

  return (
    <TabPage
      eyebrow="Account"
      title="Account settings"
      lede="Download your data, choose whether jump numbers are saved, or erase the health data stored for this account."
      accent="#00E5FF"
    >
      <ScanSaveAccount />
      <AccountSettings email={session.user.email ?? ''} />
      {/* PROFILE V2 (2026-10-24): the settings that lived on the profile — motion, PRQ data rights, health data */}
      <PrqDataRights />
      <HealthDataSection />
      {/* HOTFIX (2026-09-24): reduced motion — the device decides by default; this is the override, both ways.
          A11-03 / A11-05 (2026-10-25): with it, colour vision for the game HUD and the big-screen menus. */}
      <div className="mt-8"><AccessibilitySettings /></div>
      <p className="mt-4 text-sm"><Link href="/account/coaching">Coaching</Link></p>
    </TabPage>
  );
}
