import Link from 'next/link';
import { ACCOUNT_SETTINGS_PHRASE } from '@/lib/account/paths';

/** One consent bullet. "account settings" links to /account; every other word is unchanged.
 *  The href is a literal so the orphan walk (lib/nav/reachability.test.ts) can see the page. */
export function ConsentBulletText({ text }: { text: string }) {
  const at = text.indexOf(ACCOUNT_SETTINGS_PHRASE);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <Link href="/account" className="font-semibold text-[#00E5FF] underline underline-offset-2">
        {ACCOUNT_SETTINGS_PHRASE}
      </Link>
      {text.slice(at + ACCOUNT_SETTINGS_PHRASE.length)}
    </>
  );
}
