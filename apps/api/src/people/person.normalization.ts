export function normalizeDni(value: string): string {
  return value.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

export function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}
