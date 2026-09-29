import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * /screen — the Quick Screen's one stable QR address (SCREEN-SHIP (d)). It sends the phone to /play/mirror/assess and
 * keeps a harmless query string (e.g. ?src=qr). No sign-in and no middleware on the way.
 *
 * A TEMPORARY (307) redirect, on purpose: a QR code printed on paper should survive a later move of the flow. A 308 is
 * permanent and browsers cache it, so a phone that scanned once would keep going to the old address after the flow
 * moved; a 307 asks this server every time, and /screen follows the flow wherever it goes.
 */
export default function ScreenEntry({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams ?? {})) {
    for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) q.append(k, x);
  }
  const qs = q.toString();
  redirect(`/play/mirror/assess${qs ? `?${qs}` : ''}`);
}
