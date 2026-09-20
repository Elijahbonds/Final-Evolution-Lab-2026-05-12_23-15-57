import { redirect } from 'next/navigation';

/**
 * /modes was a flat two-column grid of all 37 MODE_INFO entries — the clutter the reorganisation was asked to fix.
 * The shelf is /play now, grouped into families. The route stays because links, bookmarks and the mode cards in
 * game-data all point at it, and a dead link is a worse outcome than a redirect.
 */
export default function ModesPage() {
  redirect('/play');
}
