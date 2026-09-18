export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCrmAccess, isErrorResponse } from '@/lib/crm/helpers';

export async function GET(req: NextRequest) {
  const auth = await requireCrmAccess();
  if (isErrorResponse(auth)) return auth;

  const url = new URL(req.url);
  const search = url.searchParams.get('search') || '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '25')));
  const skip = (page - 1) * limit;

  const where = search
    ? { name: { contains: search, mode: 'insensitive' as const } }
    : {};

  const [companies, total] = await Promise.all([
    prisma.crmCompany.findMany({
      where,
      skip,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { contacts: true, deals: true } } },
    }),
    prisma.crmCompany.count({ where }),
  ]);

  return NextResponse.json({ companies, total, page, limit });
}

export async function POST(req: NextRequest) {
  const auth = await requireCrmAccess();
  if (isErrorResponse(auth)) return auth;

  const body = await req.json();
  const { name, domain, industry, size, phone, address, notes } = body;
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const company = await prisma.crmCompany.create({
    data: { name, domain, industry, size, phone, address, notes },
  });
  return NextResponse.json(company, { status: 201 });
}
