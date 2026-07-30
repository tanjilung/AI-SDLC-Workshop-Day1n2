'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMonthParam, generateCalendarGrid, parseMonthParam } from '@/lib/calendar';
import { formatSingaporeDate, getSingaporeNow } from '@/lib/timezone';
import type { Holiday, Priority, Todo } from '@/lib/todo-types';

const PRIORITY_PILL_STYLES: Record<Priority, string> = {
  high: 'bg-red-600 text-white',
  medium: 'bg-yellow-500 text-slate-950',
  low: 'bg-blue-600 text-white'
};

function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat('en-SG', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatDueTime(value: string): string {
  return new Intl.DateTimeFormat('en-SG', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Singapore'
  }).format(new Date(value));
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const baseDate = new Date(Date.UTC(year, month - 1 + delta, 1));
  return {
    year: baseDate.getUTCFullYear(),
    month: baseDate.getUTCMonth() + 1
  };
}

export default function CalendarPage() {
  const router = useRouter();
  const currentMonth = formatMonthParam(
    Number(formatSingaporeDate(getSingaporeNow()).slice(0, 4)),
    Number(formatSingaporeDate(getSingaporeNow()).slice(5, 7))
  );
  const [viewedMonth, setViewedMonth] = useState(() => {
    if (typeof window === 'undefined') {
      return parseMonthParam(null, currentMonth);
    }

    return parseMonthParam(new URL(window.location.href).searchParams.get('month'), currentMonth);
  });
  const { year, month } = viewedMonth;
  const [todos, setTodos] = useState<Todo[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [todoResponse, holidayResponse] = await Promise.all([
          fetch('/api/todos'),
          fetch(`/api/holidays?year=${year}&month=${month}`)
        ]);

        if (todoResponse.status === 401 || holidayResponse.status === 401) {
          router.replace('/login');
          return;
        }

        if (!todoResponse.ok || !holidayResponse.ok) {
          throw new Error('Unable to load calendar data');
        }

        const todoPayload = (await todoResponse.json()) as Todo[];
        const holidayPayload = (await holidayResponse.json()) as { holidays: Holiday[] };

        if (!cancelled) {
          setTodos(todoPayload);
          setHolidays(holidayPayload.holidays);
        }
      } catch {
        if (!cancelled) {
          setError('Unable to load the calendar right now.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [month, router, year]);

  const grid = useMemo(() => generateCalendarGrid(year, month), [month, year]);
  const todosByDate = useMemo(() => {
    const grouped = new Map<string, Todo[]>();
    todos.forEach((todo) => {
      if (!todo.due_date) {
        return;
      }

      const key = formatSingaporeDate(new Date(todo.due_date));
      grouped.set(key, [...(grouped.get(key) ?? []), todo]);
    });
    return grouped;
  }, [todos]);
  const holidaysByDate = useMemo(() => new Map(holidays.map((holiday) => [holiday.date, holiday])), [holidays]);
  const selectedTodos = selectedDate ? todosByDate.get(selectedDate) ?? [] : [];
  const selectedHoliday = selectedDate ? holidaysByDate.get(selectedDate) ?? null : null;

  function navigate(nextYear: number, nextMonth: number) {
    setViewedMonth({ year: nextYear, month: nextMonth });
    router.replace(`/calendar?month=${formatMonthParam(nextYear, nextMonth)}`);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <p>Loading calendar...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-violet-300">Calendar</p>
            <h1 className="text-3xl font-semibold">{monthLabel(year, month)}</h1>
            <p className="text-slate-300">Plan your month with due dates and Singapore public holidays.</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                const previous = shiftMonth(year, month, -1);
                navigate(previous.year, previous.month);
              }}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500"
            >
              ◀ Prev
            </button>
            <button
              type="button"
              onClick={() => {
                const today = parseMonthParam(currentMonth, currentMonth);
                navigate(today.year, today.month);
              }}
              className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-600"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                const next = shiftMonth(year, month, 1);
                navigate(next.year, next.month);
              }}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500"
            >
              Next ▶
            </button>
            <button
              type="button"
              onClick={() => router.push('/')}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500"
            >
              List
            </button>
          </div>
        </header>

        {error ? (
          <p role="alert" className="rounded-lg border border-rose-900 bg-rose-950/50 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        ) : null}

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 shadow-xl">
          <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-950/60">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="px-4 py-3 text-sm font-medium text-slate-300">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {grid.map((cell) => {
              const cellTodos = todosByDate.get(cell.date) ?? [];
              const holiday = holidaysByDate.get(cell.date) ?? null;
              const visibleTodos = cellTodos.slice(0, 3);

              return (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => setSelectedDate(cell.date)}
                  data-testid="calendar-day"
                  data-date={cell.date}
                  className={`min-h-40 border-b border-r border-slate-800 p-3 text-left transition hover:bg-slate-800/50 ${
                    cell.isCurrentMonth ? 'bg-slate-900/70' : 'bg-slate-950/70 text-slate-500'
                  } ${cell.isToday ? 'ring-1 ring-inset ring-violet-400' : ''}`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className={`text-sm font-medium ${cell.isPast && cell.isCurrentMonth ? 'text-slate-500' : 'text-slate-200'}`}>
                      {cell.date.slice(-2)}
                    </span>
                    {cell.isWeekend ? <span className="text-[10px] uppercase tracking-wide text-slate-500">Weekend</span> : null}
                  </div>

                  {holiday ? (
                    <div className="mb-2 rounded-md bg-emerald-950/70 px-2 py-1 text-xs font-medium text-emerald-200">
                      {holiday.name}
                    </div>
                  ) : null}

                  <div className="space-y-1">
                    {visibleTodos.map((todo) => (
                      <div key={todo.id} className={`rounded-md px-2 py-1 text-xs ${PRIORITY_PILL_STYLES[todo.priority]}`}>
                        <div className="truncate">{todo.title}</div>
                      </div>
                    ))}
                    {cellTodos.length > visibleTodos.length ? (
                      <div className="text-xs text-slate-400">+{cellTodos.length - visibleTodos.length} more</div>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {selectedDate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4" onClick={() => setSelectedDate(null)}>
          <div
            className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Calendar day details"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold">{selectedDate}</h2>
                {selectedHoliday ? <p className="text-sm text-emerald-300">{selectedHoliday.name}</p> : null}
              </div>
              <button type="button" onClick={() => setSelectedDate(null)} className="text-slate-400 transition hover:text-slate-200">
                Close
              </button>
            </div>

            {selectedTodos.length === 0 ? (
              <p className="text-sm text-slate-400">No todos due on this date.</p>
            ) : (
              <ul className="space-y-3">
                {selectedTodos.map((todo) => (
                  <li key={todo.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className={`font-medium ${todo.completed ? 'text-slate-400 line-through' : 'text-slate-100'}`}>{todo.title}</p>
                        <p className="mt-1 text-sm text-slate-400">{todo.due_date ? formatDueTime(todo.due_date) : 'No time'}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${PRIORITY_PILL_STYLES[todo.priority]}`}>
                        {todo.priority}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
