import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { getTodoDB } from '@/lib/db';
import { validateImportPayload, validateImportSize } from '@/lib/import-core';

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const contentLengthHeader = request.headers.get('content-length');
    validateImportSize(contentLengthHeader ? Number(contentLengthHeader) : null);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Import file is too large' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON format' }, { status: 400 });
  }

  try {
    validateImportPayload(body);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import todos. Please check the file format.' },
      { status: 400 }
    );
  }

  const result = getTodoDB().importAll(session.userId, body.todos);
  return NextResponse.json({ success: true, ...result });
}
