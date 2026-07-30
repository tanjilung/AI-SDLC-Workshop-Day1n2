import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { getTemplateDB } from '@/lib/db';
import { validateUpdatePriority } from '@/lib/todo-core';
import {
  normalizeTemplateSubtasks,
  validateOptionalText,
  validateOffsetMinutes,
  validateTemplateName
} from '@/lib/template-core';

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
    const updated = getTemplateDB().update(id, session.userId, {
      name: validateTemplateName(body.name, true),
      description: validateOptionalText(body.description, true),
      category: validateOptionalText(body.category, true),
      title_template: validateTemplateName(body.title_template, true),
      priority: validateUpdatePriority(body.priority),
      is_recurring: body.is_recurring === undefined ? undefined : body.is_recurring === true,
      recurrence_pattern:
        body.recurrence_pattern === undefined
          ? undefined
          : body.recurrence_pattern === null
            ? null
            : String(body.recurrence_pattern) as never,
      reminder_minutes:
        body.reminder_minutes === undefined
          ? undefined
          : body.reminder_minutes === null || body.reminder_minutes === ''
            ? null
            : Number(body.reminder_minutes),
      due_date_offset_minutes: validateOffsetMinutes(body.due_date_offset_minutes, true),
      subtasks_json: body.subtasks === undefined ? undefined : JSON.stringify(normalizeTemplateSubtasks(body.subtasks))
    });

    if (!updated) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update template' },
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
  const deleted = getTemplateDB().delete(id, session.userId);
  if (!deleted) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
