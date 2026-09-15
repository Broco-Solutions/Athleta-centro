export const CLINIC_TIME_ZONE = 'America/Argentina/Buenos_Aires';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CLINIC_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const localDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CLINIC_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function parts(value: Date): DateTimeParts {
  const parsed = Object.fromEntries(
    localDateTimeFormatter.formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  ) as Partial<DateTimeParts>;
  if (parsed.year === undefined || parsed.month === undefined || parsed.day === undefined
    || parsed.hour === undefined || parsed.minute === undefined || parsed.second === undefined) {
    throw new Error('Could not resolve local date-time parts');
  }
  return parsed as DateTimeParts;
}

function zonedDateTimeToDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) throw new Error('Invalid local date-time');
  const [, year, month, day, hour, minute, second = '00'] = match;
  const desired = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  let result = new Date(desired);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const displayed = parts(result);
    const represented = Date.UTC(displayed.year, displayed.month - 1, displayed.day, displayed.hour, displayed.minute, displayed.second);
    result = new Date(result.getTime() + desired - represented);
  }
  return result;
}

export function operationalDate(now = new Date()): string {
  return dateFormatter.format(now);
}

export function addCalendarDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function startOfOperationalWeek(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  const weekday = value.getUTCDay();
  return addCalendarDays(date, weekday === 0 ? -6 : 1 - weekday);
}

export function clinicAgendaRange(date: string, view: 'DAY' | 'WEEK'): { from: string; to: string } {
  const firstDate = view === 'WEEK' ? startOfOperationalWeek(date) : date;
  const lastDate = addCalendarDays(firstDate, view === 'WEEK' ? 7 : 1);
  return {
    from: zonedDateTimeToDate(`${firstDate}T00:00:00`).toISOString(),
    to: zonedDateTimeToDate(`${lastDate}T00:00:00`).toISOString(),
  };
}

export function clinicLocalDateTimeToIso(value: string): string {
  return zonedDateTimeToDate(value).toISOString();
}

export function toClinicDateTimeLocal(value: string): string {
  const displayed = parts(new Date(value));
  return `${displayed.year}-${String(displayed.month).padStart(2, '0')}-${String(displayed.day).padStart(2, '0')}T${String(displayed.hour).padStart(2, '0')}:${String(displayed.minute).padStart(2, '0')}`;
}

export function formatClinicDate(value: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: CLINIC_TIME_ZONE,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(value));
}

export function formatClinicTime(value: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: CLINIC_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}

export function clinicDateKey(value: string): string {
  return dateFormatter.format(new Date(value));
}
