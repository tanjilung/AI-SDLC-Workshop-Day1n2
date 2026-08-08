import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { getTodoDB } from '@/lib/db';
import { calculateNextRecurringDueDate } from '@/lib/recurrence';
import { validateTagIds } from '@/lib/tag-core';
import { normalizeTemplateSubtasks } from '@/lib/template-core';
import { validateTodoDueDate, validateTodoTitle, validateUpdatePriority } from '@/lib/todo-core';
import { getSingaporeNow } from '@/lib/timezone';

async function getTodoForRequest(todoId: string, userId: string) {
  return await getTodoDB().findByIdForUser(todoId, userId);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const todo = await getTodoForRequest(id, session.userId);
  if (!todo) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  return NextResponse.json(todo);
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
   const existing = await getTodoForRequest(id, session.userId);
  if (!existing) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const completed =
      body.completed === undefined
        ? undefined
        : body.completed === true
          ? true
          : body.completed === false
            ? false
            : (() => {
                throw new Error('Completed must be a boolean');
              })();

    const dueDate = validateTodoDueDate(body.due_date, getSingaporeNow(), true);
    const nextIsRecurring = body.is_recurring === undefined ? existing.is_recurring : body.is_recurring === true;
    const nextRecurrencePattern =
      body.recurrence_pattern === undefined
        ? existing.recurrence_pattern
        : body.recurrence_pattern === null
          ? null
          : String(body.recurrence_pattern);
    const nextDueDate = dueDate === undefined ? existing.due_date : dueDate;
    if ((nextIsRecurring || nextRecurrencePattern) && !nextDueDate) {
      throw new Error('Recurring todos require a due date');
    }

    const updated = getTodoDB().update(id, session.userId, {
      title: validateTodoTitle(body.title, true),
      notes:
        body.notes === undefined
          ? undefined
          : body.notes === null
            ? null
            : String(body.notes),
      due_date: dueDate,
      completed,
      completed_at:
        completed === undefined
          ? undefined
          : completed
            ? getSingaporeNow().toISOString()
            : null,
      priority: validateUpdatePriority(body.priority),
      is_recurring: body.is_recurring === undefined ? undefined : body.is_recurring === true,
      recurrence_pattern:
        body.recurrence_pattern === undefined
          ? undefined
          : body.recurrence_pattern === null
            ? null
            : (String(body.recurrence_pattern) as 'daily' | 'weekly' | 'monthly' | 'yearly'),
      reminder_minutes:
        body.reminder_minutes === undefined || body.reminder_minutes === null
          ? body.reminder_minutes === undefined
            ? undefined
            : null
          : Number(body.reminder_minutes),
      last_notification_sent:
        body.last_notification_sent === undefined
          ? undefined
          : body.last_notification_sent === null
            ? null
            : String(body.last_notification_sent),
      subtasks:
        body.subtasks === undefined
          ? undefined
          : normalizeTemplateSubtasks(body.subtasks).map((subtask) => ({
              id: crypto.randomUUID(),
              todo_id: id,
              completed: false,
              title: subtask.title,
              position: subtask.position
            }))
    });

    if (!updated) {
      return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
    }

    if (completed === true && !existing.completed && existing.is_recurring && existing.recurrence_pattern && existing.due_date) {
      const newDueDate = calculateNextRecurringDueDate(existing.due_date, existing.recurrence_pattern);
      await getTodoDB().create({
        user_id: session.userId,
        title: existing.title,
        notes: existing.notes,
        due_date: newDueDate,
        completed: false,
        priority: existing.priority,
        is_recurring: existing.is_recurring,
        recurrence_pattern: existing.recurrence_pattern,
        reminder_minutes: existing.reminder_minutes,
        last_notification_sent: null,
        completed_at: null,
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update todo' },
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
  const deleted = await getTodoDB().delete(id, session.userId);
  if (!deleted) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
