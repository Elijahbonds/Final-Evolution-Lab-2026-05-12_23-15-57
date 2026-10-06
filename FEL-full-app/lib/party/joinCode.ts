// lib/party/joinCode.ts — what a friend types (or pastes) to get into a room (MULTIPLAYER lane, 2026-10-06).
//
// The room code itself is made in lib/controller-link/codes.ts: six characters from an alphabet with no 0/O/1/I/L,
// ~887 million codes, alive only while the TV holds its room (signalStore sweeps rooms after two hours). This file is
// the other side: turning whatever a person typed on a phone into that code, or saying plainly why it is not one.
//
// Forgiving where it is free (spaces, dashes, lower case, a pasted join link), strict where it matters (exactly six
// characters, all from the alphabet) so a typo is caught on the phone instead of becoming a "room not found" after a
// network round trip. Pure: no DOM, no fetch.

import { CODE_ALPHABET, ROOM_CODE_LEN } from '@/lib/controller-link/codes';

export type JoinCodeProblem = 'empty' | 'too-short' | 'too-long' | 'bad-char';

export type JoinCodeResult = { ok: true; code: string } | { ok: false; problem: JoinCodeProblem; bad?: string };

const VALID = new Set(CODE_ALPHABET.split(''));

/** Pull a code out of a pasted join link (…/controller/ABC234, …/join?code=ABC234); otherwise the text itself. */
function codeText(raw: string): string {
  const s = raw.trim();
  const path = /\/controller\/([A-Za-z0-9]+)/.exec(s);
  if (path) return path[1];
  const query = /[?&]code=([A-Za-z0-9 -]+)/.exec(s);
  if (query) return query[1];
  return s;
}

/** A typed or pasted code, normalised (upper case, no spaces or dashes) and checked against the room alphabet. */
export function parseJoinCode(raw: unknown): JoinCodeResult {
  if (typeof raw !== 'string') return { ok: false, problem: 'empty' };
  const code = codeText(raw).toUpperCase().replace(/[\s-]+/g, '');
  if (!code) return { ok: false, problem: 'empty' };
  const bad = [...code].find((c) => !VALID.has(c));
  if (bad) return { ok: false, problem: 'bad-char', bad };
  if (code.length < ROOM_CODE_LEN) return { ok: false, problem: 'too-short' };
  if (code.length > ROOM_CODE_LEN) return { ok: false, problem: 'too-long' };
  return { ok: true, code };
}

/** Plain words for each problem, for under the code box. */
export function joinCodeHint(r: JoinCodeResult): string {
  if (r.ok) return '';
  switch (r.problem) {
    case 'empty': return `Type the ${ROOM_CODE_LEN}-character code on the TV.`;
    case 'too-short': return `Codes are ${ROOM_CODE_LEN} characters.`;
    case 'too-long': return `Codes are only ${ROOM_CODE_LEN} characters.`;
    case 'bad-char':
      // the alphabet leaves out every look-alike, so a 0/O/1/I/L is always a misread of the TV
      return r.bad && /[0O1IL]/.test(r.bad)
        ? `Codes never use ${r.bad === '0' || r.bad === 'O' ? '0 or O' : '1, I or L'} — check the TV again.`
        : `“${r.bad ?? ''}” is not in a room code.`;
  }
}

/** The page a friend types a code into. Short enough to read off a TV. */
export const JOIN_PATH = '/join';
