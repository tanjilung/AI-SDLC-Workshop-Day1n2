const SINGAPORE_TIME_ZONE = 'Asia/Singapore';

type DatePartMap = {
  year: string;
  month: string;
  day: string;
  hour?: string;
  minute?: string;
  second?: string;
};

function formatParts(date: Date, options: Intl.DateTimeFormatOptions): DatePartMap {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: SINGAPORE_TIME_ZONE,
    ...options
  });

  return formatter.formatToParts(date).reduce<DatePartMap>((acc, part) => {
    if (part.type !== 'literal') {
      acc[part.type as keyof DatePartMap] = part.value;
    }

    return acc;
  }, {} as DatePartMap);
}

export function getSingaporeNow(): Date {
  return new Date();
}

export function formatSingaporeDate(date: Date): string {
  const parts = formatParts(date, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatSingaporeDateTime(date: Date): string {
  const parts = formatParts(date, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function formatSingaporeDateTimeLocalValue(date: Date): string {
  const parts = formatParts(date, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function parseSingaporeDateTimeLocal(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error('Due date must be a valid date');
  }

  const [, year, month, day, hour, minute] = match;
  const utcTimestamp = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - 8,
    Number(minute)
  );

  return new Date(utcTimestamp);
}

export function getSingaporeTimeZone(): string {
  return SINGAPORE_TIME_ZONE;
}
