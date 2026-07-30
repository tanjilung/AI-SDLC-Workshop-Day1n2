import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { getTemplateDB } from '@/lib/db';
import { validateCreatePriority } from '@/lib/todo-core';
import {
  normalizeTemplateSubtasks,
  validateOptionalText,
  validateOffsetMinutes,
  validateTemplateName
} from '@/lib/template-core';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  return NextResponse.json(getTemplateDB().findAllByUser(session.userId));
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const template = getTemplateDB().create({
      user_id: session.userId,
      name: validateTemplateName(body.name) as string,
      description: validateOptionalText(body.description),
      category: validateOptionalText(body.category),
      title_template: validateTemplateName(body.title_template) as string,
      priority: validateCreatePriority(body.priority),
      is_recurring: body.is_recurring === true,
      recurrence_pattern:
        body.recurrence_pattern === undefined || body.recurrence_pattern === null
          ? null
          : String(body.recurrence_pattern) as never,
      reminder_minutes:
        body.reminder_minutes === undefined || body.reminder_minutes === null || body.reminder_minutes === ''
          ? null
          : Number(body.reminder_minutes),
      due_date_offset_minutes: validateOffsetMinutes(body.due_date_offset_minutes),
      subtasks_json: JSON.stringify(normalizeTemplateSubtasks(body.subtasks))
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create template' },
      { status: 400 }
    );
  }
}
