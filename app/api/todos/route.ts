import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { getTodoDB, type Priority } from '@/lib/db';
import { validateTagIds } from '@/lib/tag-core';
import { normalizeTemplateSubtasks } from '@/lib/template-core';
import { validateCreatePriority, validateTodoDueDate, validateTodoTitle } from '@/lib/todo-core';
import { getSingaporeNow } from '@/lib/timezone';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const priorityFilter = request.nextUrl.searchParams.get('priority');
  const todoDB = getTodoDB();
  const todos = todoDB.findAllByUser(session.userId);

  if (!priorityFilter) {
    return NextResponse.json(todos);
  }

  if (priorityFilter !== 'high' && priorityFilter !== 'medium' && priorityFilter !== 'low') {
    return NextResponse.json({ error: 'Invalid priority filter' }, { status: 400 });
  }

  return NextResponse.json(todos.filter((todo) => todo.priority === (priorityFilter as Priority)));
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const dueDate = validateTodoDueDate(body.due_date ?? null, getSingaporeNow());
    const isRecurring = body.is_recurring === true;
    if (isRecurring && !dueDate) {
      throw new Error('Recurring todos require a due date');
    }

    const todoDB = getTodoDB();
    const todo = todoDB.create({
      user_id: session.userId,
      title: validateTodoTitle(body.title),
      notes: body.notes === undefined ? null : body.notes === null ? null : String(body.notes),
      due_date: dueDate,
      priority: validateCreatePriority(body.priority),
      is_recurring: isRecurring,
      recurrence_pattern:
        body.recurrence_pattern === undefined || body.recurrence_pattern === null
          ? null
          : String(body.recurrence_pattern) as never,
      reminder_minutes:
        body.reminder_minutes === undefined || body.reminder_minutes === null
          ? null
          : Number(body.reminder_minutes),
      tag_ids: validateTagIds(body.tag_ids),
      subtasks: normalizeTemplateSubtasks(body.subtasks).map((subtask) => ({
        ...subtask,
        completed: false
      }))
    });

    return NextResponse.json(todo, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create todo' },
      { status: 400 }
    );
  }
}
