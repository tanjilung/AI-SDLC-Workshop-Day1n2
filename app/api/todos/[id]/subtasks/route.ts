import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { getSubtaskDB, getTodoDB } from '@/lib/db';

function validateSubtaskTitle(value: unknown): string {
  const title = String(value ?? '').trim();
  if (!title) {
    throw new Error('Subtask title is required');
  }

  return title;
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
    const subtask = getSubtaskDB().create({
      todo_id: id,
      title: validateSubtaskTitle(body.title),
      completed: body.completed === true,
      position: typeof body.position === 'number' ? body.position : (todo.subtasks?.length ?? 0)
    });

    return NextResponse.json(subtask, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create subtask' },
      { status: 400 }
    );
  }
}
