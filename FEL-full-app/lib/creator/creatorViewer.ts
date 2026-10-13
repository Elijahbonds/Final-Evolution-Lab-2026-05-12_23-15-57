import 'server-only';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export interface Viewer {
  signedIn: boolean;
  email: string | null;
  role: string | null;
}

/** The current viewer, or a signed-out viewer if the session cannot be read (database offline, say). */
export async function currentViewer(): Promise<Viewer> {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { email?: string | null; role?: string } | undefined;
    return { signedIn: Boolean(user), email: user?.email?.trim().toLowerCase() ?? null, role: user?.role ?? null };
  } catch {
    return { signedIn: false, email: null, role: null };
  }
}
