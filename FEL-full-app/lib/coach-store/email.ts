/** Pluggable sender. No-op until Elijah's Google Workspace mailbox is wired. No new email vendor. */
export interface CoachMail {
  to: string;
  subject: string;
  text: string;
}

export async function sendCoachMail(_mail: CoachMail): Promise<'noop'> {
  return 'noop';
}
