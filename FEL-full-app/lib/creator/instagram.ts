/**
 * Audience stats for the media kit — a stub. No Instagram API call.
 *
 * Returns fixture numbers flagged `isExample`. The media kit shows an "Example data" badge while the flag is
 * set. Real numbers need the Instagram Graph API (a Business/Creator account and an app review), which is
 * out of scope for Phase 1.
 */

export interface InstagramStats {
  isExample: boolean;
  source: 'fixture';
  asOf: string | null;
  stats: Array<{ label: string; value: string }>;
}

export async function getInstagramStats(): Promise<InstagramStats> {
  return {
    isExample: true,
    source: 'fixture',
    asOf: null,
    stats: [
      { label: 'Followers', value: '12,345' },
      { label: 'Avg. reel views', value: '6,789' },
      { label: 'Engagement rate', value: '4.2%' },
      { label: 'Top audience', value: 'US · 18–34' },
    ],
  };
}
