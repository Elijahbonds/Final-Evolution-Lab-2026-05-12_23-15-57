import { redirect } from 'next/navigation';
import { ACCOUNT_SETTINGS_PATH } from '@/lib/account/paths';

/** The other URL for account settings. The page itself is /account. */
export default function SettingsPage() {
  redirect(ACCOUNT_SETTINGS_PATH);
}
