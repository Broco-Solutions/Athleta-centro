import { HEALTH_DOCUMENT } from './health-document-content';
/** Client DOCX only: never replace missing legal content with generated wording. */
export const HEALTH_CONSENT_KEYS = [
  'physicalActivity', 'truthfulness', 'emergenciesAndPrivacy', 'healthDataProcessing',
  'kinesiology', 'manualEvaluation', 'therapeuticExercise', 'manualTherapy', 'physicalAgents', 'dryNeedling', 'taping', 'shareWithDoctors', 'shareWithClubs', 'clinicalImage', 'institutionalImage',
] as const;
export type HealthConsentKey = typeof HEALTH_CONSENT_KEYS[number];
export type HealthDocument = {
  version: string;
  sourceSha256?: string;
  sourceFilename?: string;
  title?: string;
  introduction?: string;
  healthInstructions?: string;
  notices?: { attendance: string; validity: string };
  questions: Array<{ id: string; category: string; text: string; responseType?: 'TEXT' | 'CHOICE' }>;
  consents: Array<{ key: HealthConsentKey; text: string; responseType?: 'TEXT' | 'CHOICE' }>;
  guardianConfirmation: string;
  finalConfirmation: string;
};
export const HEALTH_DATA_CONTROLLER = {
  name: 'Athleta Centro', responsiblePerson: 'Federico Graziottin',
  phone: '+54 9 3464 56-6340', locality: 'Casilda, Santa Fe', address: null,
};
/** The version is a technical fingerprint of the supplied DOCX, which has no printed version. */
export function currentHealthDocument(): HealthDocument | null { return HEALTH_DOCUMENT; }

export function declarationValidUntil(submittedAt: Date): Date {
  const result = new Date(submittedAt);
  const month = result.getUTCMonth();
  result.setUTCFullYear(result.getUTCFullYear() + 1);
  if (result.getUTCMonth() !== month) result.setUTCDate(0);
  return result;
}
export function ageOnDate(birthDate: string, today: string): number {
  const years = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4));
  return years - (today.slice(5) < birthDate.slice(5) ? 1 : 0);
}
