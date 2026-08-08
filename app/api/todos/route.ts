import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb, createTodo, getTodosByUserId, type Priority } from '@/lib/db';
import { validateTagIds } from '@/lib/tag-core';
import { normalizeTemplateSubtasks } from '@/lib/template-core';
import { validateCreatePriority, validateTodoDueDate, validateTodoTitle } from '@/lib/todo-core';
import { getSingaporeNow, parseSingaporeDateTimeLocal } from '@/lib/timezone';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const db = getDb();
  const todos = await getTodosByUserId(db, session.userId);

  const priorityFilter = request.nextUrl.searchParams.get('priority');
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

    let dueDate: string | null = null;
    if (body.due_date !== undefined) {
      if (body.due_date === null || body.due_date === '') {
        dueDate = null;
      } else if (typeof body.due_date === 'string') {
        // Handle ISO string from frontend or YYYY-MM-DDTHH:mm from form
        if (body.due_date.includes('T') && /\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(body.due_date)) {
          // Already an ISO timestamp — parse directly as UTC
          dueDate = new Date(body.due_date).toISOString();
        } else {
          const parsed = parseSingaporeDateTimeLocal(body.due_date);
          dueDate = parsed.toISOString();
        }
      } else {
        dueDate = validateTodoDueDate(body.due_date, getSingaporeNow());
      }
    }
    const isRecurring = body.is_recurring === true;
    if (isRecurring && !dueDate) {
      throw new Error('Recurring todos require a due date');
    }

    const db = getDb();
    const todo = await createTodo(db, {
      user_id: session.userId,
      title: validateTodoTitle(body.title),
      notes: body.notes === undefined ? null : body.notes === null ? null : String(body.notes),
      due_date: dueDate,
      completed: false,
      priority: validateCreatePriority(body.priority),
      is_recurring: isRecurring,
      recurrence_pattern:
        body.recurrence_pattern === undefined || body.recurrence_pattern === null
          ? null
          : String(body.recurrence_pattern) as 'daily' | 'weekly' | 'monthly' | 'yearly' | null,
      reminder_minutes:
        body.reminder_minutes === undefined || body.reminder_minutes === null
          ? null
          : Number(body.reminder_minutes),
      last_notification_sent: null,
      completed_at: null,
    });

    return NextResponse.json(todo, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create todo' },
      { status: 400 }
    );
  }
}
