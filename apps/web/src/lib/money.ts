const ars = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats API decimal strings without losing precision in integer ARS amounts. */
export function formatArs(value: string | number | bigint): string {
  const amount = typeof value === 'string' && /^-?\d+$/.test(value) ? BigInt(value) : value;
  return ars.format(amount as number | bigint).replace(/\u00a0/g, ' ');
}
