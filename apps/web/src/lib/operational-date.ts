export function formatOperationalDate(value: string | Date | null | undefined): string {
  if (value == null) return '';
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : raw;
}

export function todayOperational(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
