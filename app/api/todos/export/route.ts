import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { getTodoDB } from '@/lib/db';
import { toCsv, toExportItem } from '@/lib/export-core';
import { formatSingaporeDate, getSingaporeNow } from '@/lib/timezone';
import type { TodoExport } from '@/lib/todo-types';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const format = request.nextUrl.searchParams.get('format') ?? 'json';
  const todos = getTodoDB().findAllWithRelations(session.userId);
  const exportItems = todos.map((todo) => toExportItem(todo));
  const dateString = formatSingaporeDate(getSingaporeNow());

  if (format === 'csv') {
    return new NextResponse(toCsv(exportItems), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="todos-${dateString}.csv"`,
        'Cache-Control': 'private, no-store',
        Pragma: 'no-cache'
      }
    });
  }

  if (format !== 'json') {
    return NextResponse.json({ error: 'Invalid export format' }, { status: 400 });
  }

  const payload: TodoExport = {
    version: 1,
    exported_at: getSingaporeNow().toISOString(),
    todos: exportItems
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="todos-${dateString}.json"`,
      'Cache-Control': 'private, no-store',
      Pragma: 'no-cache'
    }
  });
}
