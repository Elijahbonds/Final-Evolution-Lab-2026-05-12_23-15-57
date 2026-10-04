import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { ACCOUNT_SETTINGS_PATH } from '@/lib/account/paths';
import { AccountSettings } from '@/components/account/account-settings';
import { TabPage } from '@/components/shell/tab-page';

export const dynamic = 'force-dynamic';

/** Account settings. A signed-out visitor goes to login and comes back here via ?next. */
export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect(loginPath(ACCOUNT_SETTINGS_PATH));

  return (
    <TabPage
      eyebrow="Account"
      title="Account settings"
      lede="Download your data, or erase the health data stored for this account."
      accent="#00E5FF"
    >
      <AccountSettings email={session.user.email ?? ''} />
    </TabPage>
  );
}
