import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getTodoDB } from '@/lib/db';
import { filterDueNotificationTodos } from '@/lib/notifications';
import { getSingaporeNow } from '@/lib/timezone';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const now = getSingaporeNow();
  const todoDB = getTodoDB();
  const dueTodos = filterDueNotificationTodos(await todoDB.findAllByUser(session.userId), now);
  const sentAt = now.toISOString();

  dueTodos.forEach((todo) => {
    todoDB.update(todo.id, session.userId, {
      last_notification_sent: sentAt
    });
  });

  return NextResponse.json({
    notifications: dueTodos.map((todo) => ({
      id: todo.id,
      title: todo.title,
      due_date: todo.due_date,
      reminder_minutes: todo.reminder_minutes
    }))
  });
}
