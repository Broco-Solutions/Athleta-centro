/** Format PostgreSQL TIME as a clock value, without timezone conversion. */
export function formatOperationalTime(value: string | Date | null | undefined): string {
  if (value == null) return '';
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const match = raw.match(/(?:^|T)(\d{2}:\d{2})/);
  return match?.[1] ?? raw.slice(0, 5);
}
