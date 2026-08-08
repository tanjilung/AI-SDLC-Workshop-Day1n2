import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { getTagDB, getTodoDB } from '@/lib/db';

function validateTagId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Tag ID is required');
  }

  return value.trim();
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const todo = await getTodoDB().findByIdForUser(id, session.userId);
  if (!todo) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const tagId = validateTagId(body.tag_id);
    const attached = await getTagDB().attachToTodo(id, tagId, session.userId);
    if (!attached) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    return NextResponse.json(getTodoDB().findByIdForUser(id, session.userId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to attach tag' },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const todo = await getTodoDB().findByIdForUser(id, session.userId);
  if (!todo) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const tagId = validateTagId(body.tag_id);
    const detached = await getTagDB().detachFromTodo(id, tagId, session.userId);
    if (!detached) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    return NextResponse.json(getTodoDB().findByIdForUser(id, session.userId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to detach tag' },
      { status: 400 }
    );
  }
}
