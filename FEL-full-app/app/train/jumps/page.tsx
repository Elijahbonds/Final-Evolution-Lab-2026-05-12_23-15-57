import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { readDobYear, verifiedAdult } from '@/lib/privacy/scanSaveGate';
import { TabPage } from '@/components/shell/tab-page';
import { JumpTestsDoor } from '@/components/tools-easy/jump-tests-door';
import { JUMP_TESTS, JUMP_TESTS_ADULTS_ONLY, JUMP_TESTS_LEDE } from '@/lib/tools-easy/door';

export const dynamic = 'force-dynamic';

/**
 * THE JUMP TESTS' OWN DOOR (TOOLS-EASY, 2026-10-28; owner: "All tools need to be accessible, easy to use"). The standard
 * jump tests (JUMP-TESTS, #455) were reachable only under an adult's vertical result, inside "More detail". They are
 * adults only (the owner, 2026-10-24: never for a kid or a teen), so this page mounts them for a verified adult and
 * shows anyone else one plain line and no camera — the sprint page's rule. Videos are read on the phone; nothing is sent.
 */
export default async function JumpTestsPage() {
  const session = await getServerSession(authOptions);
  const me = (session?.user as { id?: string } | undefined)?.id;
  if (!me) redirect(loginPath('/train/jumps'));
  const adult = verifiedAdult(await readDobYear(prisma, me, 'jump_tests_page'));
  return (
    <TabPage eyebrow="Train" title={JUMP_TESTS} lede={JUMP_TESTS_LEDE} accent="#00E5FF"
      aside={<Link href="/train" className="rounded-xl border border-white/10 px-3 py-2 text-[12px] font-bold text-white/75 hover:bg-white/[0.05] hover:text-white">← Train</Link>}>
      <div className="mx-auto max-w-md">
        {adult ? <JumpTestsDoor /> : (
          <div className="fel-card rounded-xl p-5 text-sm text-white/75" data-jump-tests-adults-only>{JUMP_TESTS_ADULTS_ONLY}</div>
        )}
      </div>
    </TabPage>
  );
}
