import React from 'react';
import type { HealthDeclarationDetailDto } from '@athleta/api-client';
import { parseHealthDocument } from './health-form';

const labels: Record<string, string> = { confirmed: 'Confirmación final', firstName: 'Nombre', lastName: 'Apellido', dni: 'DNI', birthDate: 'Nacimiento', phone: 'Teléfono', declarant: 'Declarante', name: 'Nombre', emergencyContactName: 'Contacto de emergencia', emergencyContactPhone: 'Teléfono de emergencia', address: 'Domicilio', locality: 'Localidad', occupation: 'Ocupación', socialWork: 'Obra social', affiliateNumber: 'Afiliación', primaryDoctor: 'Médico de cabecera', guardianName: 'Responsable del menor', guardianDni: 'DNI del responsable', guardianConfirmed: 'Confirmación del responsable', practice: 'Práctica deportiva', sport: 'Deporte', frequency: 'Frecuencia', club: 'Club', level: 'Nivel', reason: 'Motivo', affectedArea: 'Zona afectada', pain: 'Dolor', diagnosis: 'Diagnóstico informado', referral: 'Derivación', studies: 'Estudios', answer: 'Respuesta', details: 'Detalle', physicalActivity: 'Actividad física', truthfulness: 'Veracidad', emergenciesAndPrivacy: 'Emergencias y privacidad', healthDataProcessing: 'Tratamiento de datos médicos', kinesiology: 'Kinesiología', manualEvaluation: 'Evaluación física y contacto manual', therapeuticExercise: 'Ejercicio terapéutico', manualTherapy: 'Terapia manual', physicalAgents: 'Agentes físicos', dryNeedling: 'Punción seca', taping: 'Vendaje', shareWithDoctors: 'Comunicación a médicos', shareWithClubs: 'Comunicación a clubes', clinicalImage: 'Imagen clínica', institutionalImage: 'Imagen institucional', version: 'Versión', questions: 'Preguntas', category: 'Categoría', text: 'Texto', key: 'Consentimiento', consents: 'Consentimientos', guardianConfirmation: 'Confirmación del responsable', finalConfirmation: 'Confirmación final', dataController: 'Responsable de los datos', responsiblePerson: 'A cargo de' };
export function ReadOnlyHealthData({ value }: { value: unknown }): React.JSX.Element {
  if (value == null || value === '') return <span>Sin informar</span>;
  if (typeof value === 'boolean') return <span>{value ? 'Sí' : 'No'}</span>;
  if (typeof value === 'string' || typeof value === 'number') return <span className="whitespace-pre-wrap break-words">{value === 'YES' ? 'Sí' : value === 'NO' ? 'No' : value === 'NOT_DISCLOSED' ? 'Sin informar' : String(value)}</span>;
  if (Array.isArray(value)) return <ul className="space-y-3 text-sm">{value.map((item: unknown, index: number) => <li key={index}><ReadOnlyHealthData value={item} /></li>)}</ul>;
  if (Object.keys(value).length === 0) return <span>Sin informar</span>;
  return <dl className="space-y-2 text-sm">{Object.entries(value).filter(([key]) => key !== 'id').map(([key, item]) => <div key={key} className="pl-3"><dt className="text-muted-foreground">{labels[key] ?? key}</dt><dd><ReadOnlyHealthData value={item} /></dd></div>)}</dl>;
}

export function ConfirmedHealthDeclaration({ declaration }: { declaration: HealthDeclarationDetailDto }): React.JSX.Element {
  const document = parseHealthDocument(declaration.document);
  return <article className="space-y-4 text-sm">
    <p>Presentación: {new Date(declaration.submittedAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })} · Vigencia hasta: {new Date(declaration.validUntil).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}</p>
    <p>Versión: {declaration.documentVersion}</p>
    <h4 className="font-semibold">Identidad y confirmación</h4><ReadOnlyHealthData value={declaration.identity} />
    <h4 className="font-semibold">Datos personales</h4><ReadOnlyHealthData value={declaration.personal} />
    <h4 className="font-semibold">Actividad física</h4><ReadOnlyHealthData value={declaration.activity} />
    <h4 className="font-semibold">Consulta kinésica</h4><ReadOnlyHealthData value={declaration.kinesiology} />
    <h4 className="font-semibold">Antecedentes</h4>
    {document ? <dl className="space-y-3">{document.questions.map(question => <div key={question.id}><dt className="text-muted-foreground">{question.text}</dt><dd><ReadOnlyHealthData value={declaration.answers[question.id] ?? 'NOT_DISCLOSED'} /></dd></div>)}</dl> : <ReadOnlyHealthData value={declaration.answers} />}
    <h4 className="font-semibold">Consentimientos individuales</h4>
    {document ? <dl className="space-y-4">{document.consents.map(consent => <div key={consent.key}><dt className="whitespace-pre-wrap leading-relaxed">{consent.text}</dt><dd className="mt-2 font-semibold"><ReadOnlyHealthData value={declaration.consents[consent.key] ?? false} /></dd></div>)}</dl> : <ReadOnlyHealthData value={declaration.consents} />}
    {document?.notices ? <><h4 className="font-semibold">Normas de puntualidad y asistencia</h4><p className="whitespace-pre-wrap leading-relaxed">{document.notices.attendance}</p><h4 className="font-semibold">Vigencia y actualización</h4><p>{document.notices.validity}</p></> : null}
    {document ? <><h4 className="font-semibold">Confirmación final</h4><p>{document.finalConfirmation}</p></> : null}
  </article>;
}
