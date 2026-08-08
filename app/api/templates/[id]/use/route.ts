import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { getSubtaskDB, getTemplateDB, getTodoDB } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const template = await getTemplateDB().findById(id, session.userId);
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const dueDate =
    template.due_date_offset_minutes === null
      ? null
      : new Date(getSingaporeNow().getTime() + template.due_date_offset_minutes * 60_000).toISOString();

  const todo = await getTodoDB().create({
    user_id: session.userId,
    title: template.title_template,
    priority: template.priority,
    due_date: dueDate,
    notes: null,
    completed: false,
    is_recurring: template.is_recurring,
    recurrence_pattern: template.recurrence_pattern,
    reminder_minutes: template.reminder_minutes,
    last_notification_sent: null,
    completed_at: null
  });

  let subtasks: Array<{ title: string; position: number }> = [];
  if (template.subtasks_json) {
    try {
      const parsed = JSON.parse(template.subtasks_json) as unknown;
      if (Array.isArray(parsed)) {
        subtasks = parsed
          .filter(
            (item): item is { title: string; position?: number } =>
              typeof item === 'object' &&
              item !== null &&
              'title' in item &&
              typeof item.title === 'string'
          )
          .map((item, index) => ({ title: item.title, position: typeof item.position === 'number' ? item.position : index }));
      }
    } catch {}
  }

  const subtaskDB = getSubtaskDB();
  await Promise.all(subtasks.map((subtask, index) =>
    subtaskDB.create({
      todo_id: todo.id,
      title: subtask.title,
      completed: false,
      position: typeof subtask.position === 'number' ? subtask.position : index
    })
  ));

  return NextResponse.json(getTodoDB().findByIdForUser(todo.id, session.userId), { status: 201 });
}
