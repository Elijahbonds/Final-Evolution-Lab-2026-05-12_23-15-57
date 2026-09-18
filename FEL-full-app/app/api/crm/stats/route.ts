export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCrmAccess, isErrorResponse } from '@/lib/crm/helpers';

export async function GET() {
  const auth = await requireCrmAccess();
  if (isErrorResponse(auth)) return auth;

  const [totalContacts, totalCompanies, totalDeals, openDeals, wonDeals, lostDeals, pendingActivities, totalUsers, totalLeads] = await Promise.all([
    prisma.crmContact.count(),
    prisma.crmCompany.count(),
    prisma.crmDeal.count(),
    prisma.crmDeal.count({ where: { stage: { notIn: ['closed_won', 'closed_lost'] } } }),
    prisma.crmDeal.count({ where: { stage: 'closed_won' } }),
    prisma.crmDeal.count({ where: { stage: 'closed_lost' } }),
    prisma.crmActivity.count({ where: { status: 'pending' } }),
    prisma.user.count(),
    prisma.marketingLead.count(),
  ]);

  const pipelineValue = await prisma.crmDeal.aggregate({
    where: { stage: { notIn: ['closed_won', 'closed_lost'] } },
    _sum: { value: true },
  });

  const wonValue = await prisma.crmDeal.aggregate({
    where: { stage: 'closed_won' },
    _sum: { value: true },
  });

  // Deals by stage
  const dealsByStage = await prisma.crmDeal.groupBy({
    by: ['stage'],
    _count: true,
    _sum: { value: true },
  });

  // Recent activities
  const recentActivities = await prisma.crmActivity.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: { contact: { select: { firstName: true, lastName: true } }, deal: { select: { title: true } } },
  });

  return NextResponse.json({
    totalContacts,
    totalCompanies,
    totalDeals,
    openDeals,
    wonDeals,
    lostDeals,
    pendingActivities,
    totalUsers,
    totalLeads,
    pipelineValue: pipelineValue._sum.value ?? 0,
    wonValue: wonValue._sum.value ?? 0,
    dealsByStage: dealsByStage.map(d => ({ stage: d.stage, count: d._count, value: d._sum.value ?? 0 })),
    recentActivities,
  });
}
