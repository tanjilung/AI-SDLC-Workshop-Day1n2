import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { getSubtaskDB } from '@/lib/db';

function validateSubtaskTitle(value: unknown): string {
  const title = String(value ?? '').trim();
  if (!title) {
    throw new Error('Subtask title is required');
  }

  return title;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const updated = getSubtaskDB().update(id, session.userId, {
      title: body.title === undefined ? undefined : validateSubtaskTitle(body.title),
      completed: body.completed === undefined ? undefined : body.completed === true,
      position: typeof body.position === 'number' ? body.position : undefined
    });

    if (!updated) {
      return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update subtask' },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const deleted = getSubtaskDB().delete(id, session.userId);
  if (!deleted) {
    return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
