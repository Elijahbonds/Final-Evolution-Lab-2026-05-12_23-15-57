export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCrmAccess, isErrorResponse } from '@/lib/crm/helpers';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCrmAccess();
  if (isErrorResponse(auth)) return auth;

  const company = await prisma.crmCompany.findUnique({
    where: { id: params.id },
    include: {
      contacts: { orderBy: { updatedAt: 'desc' }, take: 50 },
      deals: { orderBy: { updatedAt: 'desc' }, take: 50 },
    },
  });
  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(company);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCrmAccess();
  if (isErrorResponse(auth)) return auth;

  const body = await req.json();
  const { name, domain, industry, size, phone, address, notes } = body;
  const company = await prisma.crmCompany.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(domain !== undefined && { domain: domain || null }),
      ...(industry !== undefined && { industry: industry || null }),
      ...(size !== undefined && { size: size || null }),
      ...(phone !== undefined && { phone: phone || null }),
      ...(address !== undefined && { address: address || null }),
      ...(notes !== undefined && { notes: notes || null }),
    },
  });
  return NextResponse.json(company);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCrmAccess();
  if (isErrorResponse(auth)) return auth;

  await prisma.crmCompany.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
