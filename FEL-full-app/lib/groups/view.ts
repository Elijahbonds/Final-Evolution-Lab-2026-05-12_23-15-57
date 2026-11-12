// TEAMS-SQUADS: what a page is handed. Client-safe types only: the server builds these (server.ts) with every gate
// applied, so nothing withheld is ever a prop.
import type { Boards, Buddy, DuoGoal, Rollup, Standing, Trophy } from './activity';
import type { FeedItem } from './feed';
import type { GroupColor, GroupKind, GroupRole, NudgeKey } from './types';

export interface GroupSummary {
  id: string;
  kind: GroupKind;
  name: string;
  color: GroupColor;
  role: GroupRole;
  members: number;
}

export interface GroupMemberView { userId: string; name: string; role: GroupRole; you: boolean }

export interface GroupView {
  id: string;
  kind: GroupKind;
  name: string;
  color: GroupColor;
  homeCourt: { ref: string; name: string } | null;
  me: { userId: string; role: GroupRole; shareMeasured: boolean; canShareMeasured: boolean };
  can: { edit: boolean; invite: boolean; remove: boolean; assign: boolean; setRole: boolean; leave: boolean; delete: boolean };
  /** The invite, for the owner and coaches only. `path` is the link's path; the page makes it absolute. */
  invite: { code: string; path: string; open: boolean } | null;
  members: GroupMemberView[];
  dailyDrillAssigned: boolean;
  buddies: Buddy[];
  streak: { days: number; todayAll: boolean };
  duos: DuoGoal[];
  boards: Boards;
  league: { weekKey: string; standings: Standing[] };
  trophies: Trophy[];
  feed: FeedItem[];
  /** A team's weekly roll-up, for the owner/coach only. */
  rollup: Rollup | null;
  /** The viewer's own open challenges (challenges v2), to post here. */
  myChallenges: { code: string; modeName: string; score: number; posted: boolean }[];
  /** Today's nudges to the viewer. */
  nudges: { fromName: string; key: NudgeKey }[];
}
