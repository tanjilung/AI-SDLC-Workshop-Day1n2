import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { getTagDB } from '@/lib/db';
import { validateTagColor, validateTagName } from '@/lib/tag-core';

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes('unique');
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  return NextResponse.json(getTagDB().findAllByUser(session.userId));
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const tag = getTagDB().create(session.userId, {
      name: validateTagName(body.name) as string,
      color: validateTagColor(body.color)
    });

    return NextResponse.json(tag, { status: 201 });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json({ error: 'A tag with this name already exists' }, { status: 409 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create tag' },
      { status: 400 }
    );
  }
}
