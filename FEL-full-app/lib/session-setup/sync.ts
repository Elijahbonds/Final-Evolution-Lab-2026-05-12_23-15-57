// Adult number sync stays off until AB-04 (the opt-in) is in.
// Flipping the flag without that gate throws, so a green build cannot start uploading numbers.

export const ADULT_NUMBER_SYNC_ENABLED = false;

export function queueAdultNumbers(): { sent: false; reason: 'ab-04-opt-in-missing' } {
  if (ADULT_NUMBER_SYNC_ENABLED) {
    throw new Error('adult number sync is on without the AB-04 opt-in');
  }
  return { sent: false, reason: 'ab-04-opt-in-missing' };
}
