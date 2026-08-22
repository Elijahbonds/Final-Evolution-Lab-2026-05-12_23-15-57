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
    ? {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [contacts, total] = await Promise.all([
    prisma.crmContact.findMany({
      where,
      skip,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        company: { select: { id: true, name: true } },
        _count: { select: { deals: true, activities: true } },
      },
    }),
    prisma.crmContact.count({ where }),
  ]);

  return NextResponse.json({ contacts, total, page, limit });
}

export async function POST(req: NextRequest) {
  const auth = await requireCrmAccess();
  if (isErrorResponse(auth)) return auth;

  const body = await req.json();
  const { firstName, lastName, email, phone, title, companyId, tags, notes, source } = body;
  if (!firstName || !lastName) {
    return NextResponse.json({ error: 'firstName and lastName required' }, { status: 400 });
  }

  const contact = await prisma.crmContact.create({
    data: {
      firstName,
      lastName,
      email: email || undefined,
      phone: phone || undefined,
      title: title || undefined,
      companyId: companyId || undefined,
      tags: tags || undefined,
      notes: notes || undefined,
      source: source || 'manual',
      ownerId: auth.userId,
    },
    include: { company: { select: { id: true, name: true } } },
  });

  return NextResponse.json(contact, { status: 201 });
}
