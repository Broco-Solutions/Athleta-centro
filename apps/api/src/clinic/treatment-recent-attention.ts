const DAY_MS = 24 * 60 * 60 * 1000;
const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires';

export type TreatmentActivityReference = {
  startDate: Date;
  attentions: { occurredAt: Date }[];
};

function argentinaMidnight(year: number, month: number, day: number): Date {
  const utcGuess = Date.UTC(year, month - 1, day);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ARGENTINA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(utcGuess));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const displayedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return new Date(utcGuess - (displayedAsUtc - utcGuess));
}

export function treatmentStartReference(startDate: Date): Date {
  const [year, month, day] = startDate.toISOString().slice(0, 10).split('-').map(Number);
  return argentinaMidnight(year!, month!, day!);
}

export function treatmentActivityReference(treatment: TreatmentActivityReference): Date {
  return treatment.attentions[0]?.occurredAt ?? treatmentStartReference(treatment.startDate);
}

export function hasAtLeastCompleteDaysSince(reference: Date, days: number, now: Date): boolean {
  return now.getTime() - reference.getTime() >= days * DAY_MS;
}

export function hasTreatmentWithoutRecentAttention(treatment: TreatmentActivityReference, days: number, now: Date): boolean {
  return hasAtLeastCompleteDaysSince(treatmentActivityReference(treatment), days, now);
}
