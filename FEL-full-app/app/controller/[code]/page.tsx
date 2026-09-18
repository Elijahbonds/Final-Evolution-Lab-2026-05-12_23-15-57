import { notFound } from 'next/navigation';
import { ControllerLoader } from './loader';

export const dynamic = 'force-dynamic';

/**
 * Phone controller entry point.
 *
 * Deliberately NOT auth-gated: the whole premise is that a guest scans a QR on
 * a TV and is playing seconds later with no account and no install. The room
 * code is the capability, and it only exists while the host holds the session
 * open. Nothing here reads or writes user data.
 */
export default function ControllerRoute({ params }: { params: { code: string } }) {
  const code = params.code?.toUpperCase();
  if (!code || !/^[A-Z0-9]{4,8}$/.test(code)) notFound();
  return <ControllerLoader code={code} />;
}
