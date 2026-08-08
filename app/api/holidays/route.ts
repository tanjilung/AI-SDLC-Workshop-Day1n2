import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { getDb, getHolidayDB } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const year = Number(request.nextUrl.searchParams.get('year'));
  const month = Number(request.nextUrl.searchParams.get('month'));

  if (!year || !month) {
    return NextResponse.json(
      { error: 'Missing year or month parameter' },
      { status: 400 }
    );
  }

  try {
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0)); // last day of the month

    const holidayDB = getHolidayDB();
    const holidays = await holidayDB.findByRange(startDate, endDate);

    return NextResponse.json({ holidays });
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch holidays' },
      { status: 500 }
    );
  }
}
