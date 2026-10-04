import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { ACCOUNT_SETTINGS_PATH } from '@/lib/account/paths';
import { AccountSettings } from '@/components/account/account-settings';
import { ScanSaveAccount } from '@/components/privacy/scan-save-account';
import { TabPage } from '@/components/shell/tab-page';

export const dynamic = 'force-dynamic';

/** Account settings. A signed-out visitor goes to login and comes back here via ?next. */
export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect(`/login?next=${encodeURIComponent(ACCOUNT_SETTINGS_PATH)}`);

  return (
    <TabPage
      eyebrow="Account"
      title="Account settings"
      lede="Download your data, choose whether jump numbers are saved, or erase the health data stored for this account."
      accent="#00E5FF"
    >
      <ScanSaveAccount />
      <AccountSettings email={session.user.email ?? ''} />
    </TabPage>
  );
}
