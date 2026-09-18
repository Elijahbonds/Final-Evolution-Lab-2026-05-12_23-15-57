export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCrmAccess, isErrorResponse } from '@/lib/crm/helpers';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCrmAccess();
  if (isErrorResponse(auth)) return auth;

  const contact = await prisma.crmContact.findUnique({
    where: { id: params.id },
    include: {
      company: true,
      deals: { orderBy: { updatedAt: 'desc' }, take: 20 },
      activities: { orderBy: { createdAt: 'desc' }, take: 20 },
      crmNotes: { orderBy: { createdAt: 'desc' }, take: 50, include: { author: { select: { name: true, email: true } } } },
      linkedUser: { select: { id: true, name: true, email: true, createdAt: true } },
    },
  });
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(contact);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCrmAccess();
  if (isErrorResponse(auth)) return auth;

  const body = await req.json();
  const { firstName, lastName, email, phone, title, companyId, tags, notes } = body;
  const contact = await prisma.crmContact.update({
    where: { id: params.id },
    data: {
      ...(firstName !== undefined && { firstName }),
      ...(lastName !== undefined && { lastName }),
      ...(email !== undefined && { email: email || null }),
      ...(phone !== undefined && { phone: phone || null }),
      ...(title !== undefined && { title: title || null }),
      ...(companyId !== undefined && { companyId: companyId || null }),
      ...(tags !== undefined && { tags }),
      ...(notes !== undefined && { notes }),
    },
  });
  return NextResponse.json(contact);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCrmAccess();
  if (isErrorResponse(auth)) return auth;

  await prisma.crmContact.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
