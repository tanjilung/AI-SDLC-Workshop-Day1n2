import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { getHolidayDB } from '@/lib/db';
import { getMonthBounds } from '@/lib/calendar';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const yearParam = request.nextUrl.searchParams.get('year');
  const monthParam = request.nextUrl.searchParams.get('month');

  if (!yearParam || !monthParam) {
    return NextResponse.json({ holidays: getHolidayDB().findAll() });
  }

  const year = Number(yearParam);
  const month = Number(monthParam);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'Invalid year or month' }, { status: 400 });
  }

  const bounds = getMonthBounds(year, month);
  return NextResponse.json({ holidays: getHolidayDB().findByRange(bounds.startDate, bounds.endDate) });
}
