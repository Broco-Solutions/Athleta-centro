'use client';
import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@athleta/ui';
import type { SubmitHealthDeclarationDto } from '@athleta/api-client';

const consentLabels = {
  physicalActivity: 'Actividad física y entrenamiento', truthfulness: 'Declaración de veracidad',
  emergenciesAndPrivacy: 'Emergencias y protección de datos', healthDataProcessing: 'Tratamiento de información médica',
  kinesiology: 'Consentimiento kinésico', manualEvaluation: 'Evaluación física, palpación y contacto manual', therapeuticExercise: 'Ejercicio terapéutico', manualTherapy: 'Terapia manual', physicalAgents: 'Agentes físicos y electroterapia', dryNeedling: 'Punción seca', taping: 'Vendaje funcional / neuromuscular',
  shareWithDoctors: 'Comunicación a médicos', shareWithClubs: 'Comunicación a clubes',
  clinicalImage: 'Uso de imagen clínica', institutionalImage: 'Uso de imagen institucional',
} as const;
type ConsentKey = keyof typeof consentLabels;
const requiredConsents: ConsentKey[] = ['physicalActivity', 'truthfulness', 'emergenciesAndPrivacy', 'healthDataProcessing'];
const explicitDecisions: ConsentKey[] = [...requiredConsents, 'shareWithDoctors', 'shareWithClubs', 'clinicalImage', 'institutionalImage'];
const kinesiologyConsents: ConsentKey[] = ['kinesiology', 'manualEvaluation', 'therapeuticExercise', 'manualTherapy', 'physicalAgents', 'dryNeedling', 'taping'];
const consentExplanations: Record<ConsentKey, string> = {
  physicalActivity: 'Confirmá que comprendés los riesgos y las pautas de seguridad de la actividad física.',
  truthfulness: 'Confirmá que los datos que proporcionás son veraces y completos.',
  emergenciesAndPrivacy: 'Autorizá la asistencia ante urgencias y confirmá la información sobre privacidad.',
  healthDataProcessing: 'Autorizá el tratamiento confidencial de la información médica para las finalidades indicadas en la declaración final.',
  kinesiology: 'Podés autorizar el tratamiento kinésico informado por el profesional.',
  manualEvaluation: 'Podés autorizar la evaluación física, la palpación y el contacto manual.',
  therapeuticExercise: 'Podés autorizar el ejercicio terapéutico y las cargas progresivas.',
  manualTherapy: 'Podés autorizar movilizaciones y técnicas de manipulación.',
  physicalAgents: 'Podés autorizar agentes físicos y electroterapia.',
  dryNeedling: 'Podés autorizar la punción seca, con explicación específica del profesional.',
  taping: 'Podés autorizar el vendaje funcional o neuromuscular.',
  shareWithDoctors: 'Elegí si autorizás comunicar información clínica a médicos tratantes o derivantes.',
  shareWithClubs: 'Elegí si autorizás comunicar tu evolución a tu institución o club deportivo.',
  clinicalImage: 'Elegí si autorizás fotos o videos para tu historia clínica, sin difusión.',
  institutionalImage: 'Elegí si autorizás el uso de imagen en comunicaciones y redes sociales de Athleta.',
};
export const finalHealthConfirmation = 'Declaro haber leído y comprendido la información anterior y confirmo la veracidad de los datos proporcionados.';
const decisionSchema = z.enum(['', 'YES', 'NO']);
const formSchema = z.object({
  personal: z.object({ emergencyContactName: z.string().trim().min(1, 'Ingresá el contacto de emergencia.').max(200), emergencyContactPhone: z.string().trim().min(1, 'Ingresá el teléfono de emergencia.').max(80).regex(/^[+\d\s().-]+$/, 'Ingresá un teléfono válido.'), address: z.string().max(300), locality: z.string().max(200), occupation: z.string().max(200), socialWork: z.string().max(200), affiliateNumber: z.string().max(200), primaryDoctor: z.string().max(200), guardianName: z.string().max(200), guardianDni: z.string().max(80), guardianConfirmed: z.boolean() }),
  activity: z.object({ practice: z.enum(['', 'YES', 'NO', 'NOT_DISCLOSED']), sport: z.string().max(200), frequency: z.string().max(200), club: z.string().max(200), level: z.string().max(200) }),
  kinesiologyChoice: decisionSchema,
  kinesiology: z.object({ reason: z.string().max(300), affectedArea: z.string().max(300), pain: z.string().refine(value => value === '' || (/^\d+(\.\d+)?$/.test(value) && Number(value) >= 0 && Number(value) <= 10), 'Ingresá un valor entre 0 y 10.'), diagnosis: z.string().max(300), referral: z.string().max(300), studies: z.string().max(300) }),
  consents: z.object({ physicalActivity: decisionSchema, truthfulness: decisionSchema, emergenciesAndPrivacy: decisionSchema, healthDataProcessing: decisionSchema, kinesiology: decisionSchema, manualEvaluation: decisionSchema, therapeuticExercise: decisionSchema, manualTherapy: decisionSchema, physicalAgents: decisionSchema, dryNeedling: decisionSchema, taping: decisionSchema, shareWithDoctors: decisionSchema, shareWithClubs: decisionSchema, clinicalImage: decisionSchema, institutionalImage: decisionSchema }),
  answers: z.record(z.string(), z.object({ answer: z.enum(['YES', 'NO', 'NOT_DISCLOSED']), details: z.string().max(2000).optional() })),
  confirmed: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;
const documentSchema = z.object({
  version: z.string().min(1), questions: z.array(z.object({ id: z.string(), category: z.string(), text: z.string().min(1), responseType: z.enum(['TEXT', 'CHOICE']).optional() })).min(1),
  consents: z.array(z.object({ key: z.enum(Object.keys(consentLabels) as [ConsentKey, ...ConsentKey[]]), text: z.string().min(1) })),
  guardianConfirmation: z.string().min(1), finalConfirmation: z.string().min(1), introduction: z.string().optional(), healthInstructions: z.string().optional(), notices: z.object({ attendance: z.string(), validity: z.string() }).optional(),
}).refine(doc => Object.keys(consentLabels).every(key => doc.consents.some(consent => consent.key === key)));
export type FormDocument = z.infer<typeof documentSchema>;
export function parseHealthDocument(value: unknown): FormDocument | null { const parsed = documentSchema.safeParse(value); return parsed.success ? parsed.data : null; }
export type HealthPerson = { firstName: string; lastName: string; dni: string; birthDate: string; phone: string; emergencyContactName?: string; emergencyContactPhone?: string; socialWorkName?: string; affiliateNumber?: string };
export function healthAge(birthDate: string, today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())): number {
  return Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4)) - (today.slice(5) < birthDate.slice(5) ? 1 : 0);
}
export const healthSteps = ['Datos personales', 'Actividad física y estado actual', 'Antecedentes de salud', 'Consentimientos', 'Revisión y finalización'];
const personalLabels = { address: 'Domicilio', locality: 'Localidad', occupation: 'Ocupación', socialWork: 'Obra social', affiliateNumber: 'Afiliación', primaryDoctor: 'Médico de cabecera', emergencyContactName: 'Contacto de emergencia', emergencyContactPhone: 'Teléfono de emergencia', guardianName: 'Nombre y apellido del padre, madre o tutor', guardianDni: 'DNI del responsable' } as const;
const activityLabels = { sport: 'Deporte', frequency: 'Frecuencia semanal', club: 'Institución / club', level: 'Nivel' } as const;
const kinesiologyLabels = { reason: 'Motivo de consulta', affectedArea: 'Zona afectada', pain: 'Dolor actual (0 a 10)', diagnosis: 'Diagnóstico informado', referral: 'Derivación', studies: 'Estudios' } as const;
export function HealthForm({ person, document, onSubmit, pending = false, error }: {
  person: HealthPerson; document: FormDocument | null; onSubmit: (data: SubmitHealthDeclarationDto) => Promise<void>; pending?: boolean; error?: string | undefined;
}): React.JSX.Element {
  const [step, setStep] = React.useState(0);
  const title = React.useRef<HTMLHeadingElement>(null);
  const age = healthAge(person.birthDate); const minor = age < 18;
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), shouldUnregister: false, defaultValues: {
    personal: { address: '', locality: '', occupation: '', socialWork: person.socialWorkName ?? '', affiliateNumber: person.affiliateNumber ?? '', primaryDoctor: '', emergencyContactName: person.emergencyContactName ?? '', emergencyContactPhone: person.emergencyContactPhone ?? '', guardianName: '', guardianDni: '', guardianConfirmed: false },
    activity: { practice: '', sport: '', frequency: '', club: '', level: '' },
    kinesiologyChoice: '',
    kinesiology: { reason: '', affectedArea: '', pain: '', diagnosis: '', referral: '', studies: '' },
    consents: { physicalActivity: '', truthfulness: '', emergenciesAndPrivacy: '', healthDataProcessing: '', kinesiology: '', manualEvaluation: '', therapeuticExercise: '', manualTherapy: '', physicalAgents: '', dryNeedling: '', taping: '', shareWithDoctors: '', shareWithClubs: '', clinicalImage: '', institutionalImage: '' }, answers: {}, confirmed: false,
  } });
  const values = form.watch();
  const includeKinesiology = values.kinesiologyChoice === 'YES';
  const grouped = new Map<string, FormDocument['questions']>();
  for (const question of document?.questions ?? []) grouped.set(question.category, [...(grouped.get(question.category) ?? []), question]);
  const categories = [...grouped.entries()];
  function validateCategories() {
    let valid = true;
    for (const [, questions] of categories) {
      const required = categoryQuestions(questions ?? []);
      if (!categoryAnswered(required, form.getValues('answers'))) {
        form.setError(`answers.${required[0]!.id}.answer`, { message: 'Seleccioná condiciones, Ninguna de las anteriores o Prefiero no informar.' });
        valid = false;
      }
    }
    return valid;
  }
  React.useEffect(() => { title.current?.focus(); }, [step]);
  const field = (name: `personal.${keyof typeof personalLabels}` | `activity.${keyof typeof activityLabels}` | `kinesiology.${keyof typeof kinesiologyLabels}`, label: string, required = false) => {
    const state = form.getFieldState(name, form.formState);
    return <label key={name} className="block text-sm font-medium" htmlFor={name}>{label}{required ? ' *' : ' (opcional)'}<input id={name} type={name === 'kinesiology.pain' ? 'number' : name.endsWith('Phone') ? 'tel' : 'text'} min={name === 'kinesiology.pain' ? 0 : undefined} max={name === 'kinesiology.pain' ? 10 : undefined} aria-required={required} aria-invalid={Boolean(state.error)} aria-describedby={state.error ? `${name}-error` : undefined} maxLength={name.endsWith('Phone') || name.endsWith('Dni') ? 80 : name === 'personal.address' || name.startsWith('kinesiology.') ? 300 : 200} className="mt-2 min-h-11 w-full rounded-md border border-border bg-surface px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" {...form.register(name)} />{state.error ? <span id={`${name}-error`} role="alert" className="mt-1 block text-sm text-red-700">{state.error.message}</span> : null}</label>;
  };
  async function next() {
    form.clearErrors();
    if (step === 0) {
      if (!(await form.trigger('personal', { shouldFocus: true }))) return;
      if (minor && document && !values.personal.guardianConfirmed) { form.setError('personal.guardianConfirmed', { message: 'Se requiere la confirmación del responsable.' }); return; }
      if (minor && (!values.personal.guardianName.trim() || !values.personal.guardianDni.trim())) {
        if (!values.personal.guardianName.trim()) form.setError('personal.guardianName', { message: 'Identificá al responsable del menor.' }, { shouldFocus: true });
        if (!values.personal.guardianDni.trim()) form.setError('personal.guardianDni', { message: 'Ingresá el DNI del responsable.' });
        return;
      }
    }
    if (step === 1 && !(await form.trigger(['activity', 'kinesiology'], { shouldFocus: true }))) return;
    if (step === 2 && document && !validateCategories()) return;
    if (step === 3 && document) {
      let valid = true;
      for (const key of explicitDecisions) if (!values.consents[key] || (requiredConsents.includes(key) && values.consents[key] !== 'YES')) { form.setError(`consents.${key}`, { message: requiredConsents.includes(key) ? 'Esta confirmación es obligatoria.' : 'Elegí Sí o No.' }); valid = false; }
      if (minor && !values.personal.guardianConfirmed) { form.setError('personal.guardianConfirmed', { message: 'Se requiere la confirmación del responsable.' }); valid = false; }
      if (!valid) return;
    }
    setStep(step + 1);
  }
  function consentChoice(key: ConsentKey, text: string) {
    return <fieldset key={key} className="space-y-3 border-b border-border py-5"><legend className="pt-4 font-semibold">{consentLabels[key]}{requiredConsents.includes(key) ? ' *' : ' (opcional)'}</legend><p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p><div className="flex flex-wrap gap-5">{(['YES', 'NO'] as const).map(choice => <label key={choice} className="inline-flex min-h-11 items-center gap-2 text-sm"><input type="radio" value={choice} {...form.register(`consents.${key}`)} />{choice === 'YES' ? 'Sí' : 'No'}</label>)}</div>{form.formState.errors.consents?.[key] ? <p role="alert" className="text-sm text-red-700">{form.formState.errors.consents[key]?.message}</p> : null}</fieldset>;
  }
  return <div className="mx-auto max-w-3xl space-y-5">
    {!document ? <p role="status" className="rounded-md border border-border bg-surface p-4 text-sm">El formulario está pendiente del documento de Athleta. Podés recorrer los pasos disponibles; todavía no se pueden confirmar ni guardar respuestas.</p> : null}
    <div><p className="mb-2 text-sm text-muted-foreground">Paso {step + 1} de 5</p><div role="progressbar" aria-label="Progreso de la declaración" aria-valuemin={0} aria-valuemax={5} aria-valuenow={step + 1} className="h-2 overflow-hidden rounded bg-surface-muted"><div className="h-full bg-primary" style={{ width: `${(step + 1) * 20}%` }} /></div></div>
    <form noValidate onSubmit={form.handleSubmit(async data => {
      if (step !== 4 || !document || pending) return;
      if (!data.confirmed) { form.setError('confirmed', { message: 'Confirmá la presentación para finalizar.' }); return; }
      const consents: SubmitHealthDeclarationDto['consents'] = { physicalActivity: data.consents.physicalActivity === 'YES', truthfulness: data.consents.truthfulness === 'YES', emergenciesAndPrivacy: data.consents.emergenciesAndPrivacy === 'YES', healthDataProcessing: data.consents.healthDataProcessing === 'YES', kinesiology: data.consents.kinesiology === 'YES', manualEvaluation: data.consents.manualEvaluation === 'YES', therapeuticExercise: data.consents.therapeuticExercise === 'YES', manualTherapy: data.consents.manualTherapy === 'YES', physicalAgents: data.consents.physicalAgents === 'YES', dryNeedling: data.consents.dryNeedling === 'YES', taping: data.consents.taping === 'YES', shareWithDoctors: data.consents.shareWithDoctors === 'YES', shareWithClubs: data.consents.shareWithClubs === 'YES', clinicalImage: data.consents.clinicalImage === 'YES', institutionalImage: data.consents.institutionalImage === 'YES' };
      if (explicitDecisions.some(key => !data.consents[key]) || requiredConsents.some(key => !consents[key])) { setStep(3); return; }
      if (!validateCategories()) { setStep(2); return; }
      for (const key of kinesiologyConsents) if (!includeKinesiology) consents[key] = false;
      await onSubmit({ documentVersion: document.version, personal: data.personal, activity: { sport: data.activity.sport, frequency: data.activity.frequency, club: data.activity.club, level: data.activity.level, ...(data.activity.practice ? { practice: data.activity.practice } : {}) }, kinesiology: includeKinesiology ? data.kinesiology : {}, answers: data.answers, consents, confirmed: true });
    })} className="space-y-6 rounded-md border border-border bg-surface p-4 sm:p-6">
      <h2 ref={title} tabIndex={-1} className="text-xl font-semibold outline-none">{healthSteps[step]}</h2>
      {step === 0 ? <>{document?.introduction ? <p className="text-sm leading-relaxed">{document.introduction}</p> : null}<dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">{[['Nombre', person.firstName], ['Apellido', person.lastName], ['DNI', person.dni], ['Nacimiento', person.birthDate.split('-').reverse().join('/')], ['Edad', `${age} años`], ['Teléfono', person.phone]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl><p className="text-sm text-muted-foreground">Para corregir tus datos precargados, comunicate con Athleta. Los campos con * son obligatorios.</p><div className="grid gap-5 sm:grid-cols-2">{Object.entries(personalLabels).filter(([key]) => !key.startsWith('guardian')).map(([key, label]) => field(`personal.${key as keyof typeof personalLabels}`, label, key.startsWith('emergency')))}</div>{minor ? <fieldset className="space-y-4 border-t border-border pt-5"><legend className="font-semibold">Responsable del menor</legend>{field('personal.guardianName', personalLabels.guardianName, true)}{field('personal.guardianDni', personalLabels.guardianDni, true)}{minor && document ? <label className="block text-sm"><input type="checkbox" className="mr-2" {...form.register('personal.guardianConfirmed')} />{document.guardianConfirmation}{form.formState.errors.personal?.guardianConfirmed ? <span role="alert" className="block text-red-700">{form.formState.errors.personal.guardianConfirmed.message}</span> : null}</label> : null}</fieldset> : null}</> : null}
      {step === 1 ? <><label className="block text-sm font-medium">Práctica deportiva<select className="mt-2 min-h-11 w-full rounded-md border border-border px-3" {...form.register('activity.practice')}><option value="">Seleccionar (opcional)</option><option value="YES">Sí</option><option value="NO">No</option><option value="NOT_DISCLOSED">Prefiero no informar</option></select></label>{values.activity.practice === 'YES' ? <div className="grid gap-5 sm:grid-cols-2">{Object.entries(activityLabels).filter(([key]) => key !== 'level').map(([key, label]) => field(`activity.${key as keyof typeof activityLabels}`, label))}<label className="block text-sm font-medium">Nivel (opcional)<select className="mt-2 min-h-11 w-full rounded-md border px-3" {...form.register('activity.level')}><option value="">Sin informar</option>{['Recreativo', 'Competitivo', 'Alto rendimiento'].map(level => <option key={level}>{level}</option>)}</select></label></div> : null}<fieldset className="space-y-3"><legend className="font-semibold">Consulta kinésica (opcional)</legend><p className="text-sm">¿Querés agregar información para una consulta de Kinesiología?</p><div className="flex gap-5">{(['YES', 'NO'] as const).map(choice => <label key={choice} className="inline-flex min-h-11 items-center gap-2 text-sm"><input type="radio" value={choice} {...form.register('kinesiologyChoice')} onChange={() => {
        form.setValue('kinesiologyChoice', choice);
        if (choice === 'NO') {
          form.setValue('kinesiology', { reason: '', affectedArea: '', pain: '', diagnosis: '', referral: '', studies: '' });
          for (const key of kinesiologyConsents) form.setValue(`consents.${key}`, '');
        }
      }} />{choice === 'YES' ? 'Sí' : 'No'}</label>)}</div></fieldset>{includeKinesiology ? <div className="grid gap-5 sm:grid-cols-2">{Object.entries(kinesiologyLabels).map(([key, label]) => field(`kinesiology.${key as keyof typeof kinesiologyLabels}`, label))}</div> : null}</> : null}
      {step === 2 ? <><p className="text-sm">Respondé cada categoría. Podés elegir no informar antecedentes sensibles. Este formulario no determina diagnósticos ni aptitud médica.</p>{!document ? <p className="text-sm text-muted-foreground">Las preguntas se incorporarán desde el documento fuente.</p> : <div className="space-y-8">{document.healthInstructions ? <p className="text-sm">{document.healthInstructions}</p> : null}{categories.map(([category, items]) => {
        const questions = items ?? [];
        const required = categoryQuestions(questions);
        const exclusive = (answer: 'NO' | 'NOT_DISCLOSED') => required.every(question => values.answers[question.id]?.answer === answer);
        const setExclusive = (answer: 'NO' | 'NOT_DISCLOSED') => {
          for (const question of questions) form.setValue(`answers.${question.id}`, { answer });
          form.clearErrors('answers');
        };
        return <fieldset key={category} className="space-y-4 border-b border-border pb-6"><legend className="mb-3 text-lg font-semibold">{category}</legend>
          <div className="grid grid-cols-1 items-start gap-x-6 gap-y-4 sm:grid-cols-2">{questions.filter(question => question.responseType !== 'TEXT').map(question => <div key={question.id}>
            <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-4 shrink-0" checked={values.answers[question.id]?.answer === 'YES'} onChange={event => {
              if (event.target.checked) for (const item of required) if (values.answers[item.id]?.answer !== 'YES') form.setValue(`answers.${item.id}`, { answer: 'NO' });
              form.setValue(`answers.${question.id}`, { answer: event.target.checked ? 'YES' : 'NO' });
              if (!event.target.checked && !required.some(item => item.id !== question.id && values.answers[item.id]?.answer === 'YES')) {
                const answers = { ...form.getValues('answers') };
                for (const item of required) delete answers[item.id];
                form.setValue('answers', answers);
              }
              form.clearErrors('answers');
            }} />{question.text}</label>
            {values.answers[question.id]?.answer === 'YES' ? <label className="mt-2 block text-sm">Descripción (opcional)<textarea aria-label={`Descripción de ${question.text} (opcional)`} maxLength={2000} className="mt-2 min-h-24 w-full rounded-md border border-border p-3" {...form.register(`answers.${question.id}.details`)} /></label> : null}
          </div>)}</div>
          <div className="space-y-2">{(['NO', 'NOT_DISCLOSED'] as const).map(answer => <label key={answer} className="flex min-h-11 items-center gap-3 text-sm"><input type="radio" name={`category-${category}`} checked={exclusive(answer)} onChange={() => setExclusive(answer)} />{answer === 'NO' ? 'Ninguna de las anteriores' : 'Prefiero no informar'}</label>)}</div>
          {questions.filter(question => question.responseType === 'TEXT').map(question => <label key={question.id} className="block whitespace-pre-wrap text-sm">{question.text} (opcional)<textarea maxLength={2000} className="mt-2 min-h-24 w-full rounded-md border border-border p-3" value={values.answers[question.id]?.details ?? ''} onChange={event => {
            const details = event.target.value;
            if (details && questions.every(item => item.responseType === 'TEXT')) for (const item of required) if (values.answers[item.id]?.answer !== 'YES') form.setValue(`answers.${item.id}`, { answer: 'NO' });
            form.setValue(`answers.${question.id}`, details ? { answer: 'YES', details } : { answer: 'NO' });
            if (!details && questions.every(item => item.responseType === 'TEXT') && !required.some(item => item.id !== question.id && values.answers[item.id]?.answer === 'YES')) {
              const answers = { ...form.getValues('answers') };
              for (const item of required) delete answers[item.id];
              form.setValue('answers', answers);
            }
            form.clearErrors('answers');
          }} /></label>)}
          {form.formState.errors.answers?.[required[0]!.id]?.answer ? <p role="alert" className="text-sm text-red-700">{form.formState.errors.answers[required[0]!.id]?.answer?.message}</p> : null}
        </fieldset>;
      })}</div>}</> : null}
      {step === 3 ? <>{document ? document.consents.filter(consent => includeKinesiology || !kinesiologyConsents.includes(consent.key)).map(consent => consentChoice(consent.key, consentExplanations[consent.key])) : <p className="text-sm">Los textos de consentimiento todavía no están disponibles. No es posible prestar consentimiento en esta pantalla.</p>}</> : null}
      {step === 4 ? <><HealthReview person={person} values={values} document={document} onEdit={target => { form.setValue('confirmed', false); setStep(target); }} /><p className="text-sm">La presentación tendrá una vigencia de 12 meses. Una actualización genera una nueva presentación y conserva las anteriores.</p>{document ? <><HealthLegalNotice document={document} includeKinesiology={includeKinesiology} /><label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-4 shrink-0" {...form.register('confirmed')} />{finalHealthConfirmation}</label>{form.formState.errors.confirmed ? <p role="alert" className="text-sm text-red-700">{form.formState.errors.confirmed.message}</p> : null}</> : <p className="text-sm">La finalización está pendiente del documento fuente.</p>}</> : null}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-5"><Button variant="secondary" type="button" disabled={step === 0 || pending} onClick={() => { form.setValue('confirmed', false); setStep(step - 1); }}>Anterior</Button>{step < 4 ? <Button key="next" type="button" onClick={() => void next()}>Continuar</Button> : <Button key="submit" type="submit" disabled={!document || pending}>{pending ? 'Guardando…' : 'Confirmar y finalizar'}</Button>}</div>
    </form>
  </div>;
}
function HealthReview({ person, values, document, onEdit }: { person: HealthPerson; values: FormValues; document: FormDocument | null; onEdit: (step: number) => void }): React.JSX.Element {
  const includeKinesiology = values.kinesiologyChoice === 'YES';
  return <div className="space-y-5">{healthSteps.slice(0, 4).map((label, index) => <section key={label} className="border-b border-border pb-5"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{label}</h3><button type="button" className="min-h-11 px-3 text-sm underline" onClick={() => onEdit(index)}>Editar {label.toLowerCase()}</button></div>{index === 0 ? <><p className="text-sm">{person.firstName} {person.lastName} · DNI {person.dni} · {person.phone}</p><p className="text-sm">Nacimiento: {person.birthDate.split('-').reverse().join('/')} · Edad: {healthAge(person.birthDate)} años</p><dl className="mt-3 space-y-2 text-sm">{Object.entries(personalLabels).filter(([key]) => !key.startsWith('guardian') || healthAge(person.birthDate) < 18).map(([key, text]) => <div key={key}><dt className="text-muted-foreground">{text}</dt><dd>{values.personal[key as keyof typeof personalLabels] || 'Sin informar'}</dd></div>)}</dl></> : index === 1 ? <div className="space-y-2 text-sm"><p>Práctica deportiva: {values.activity.practice === 'YES' ? 'Sí' : values.activity.practice === 'NO' ? 'No' : 'Sin informar'}</p>{values.activity.practice === 'YES' ? Object.entries(activityLabels).map(([key, text]) => <p key={key}>{text}: {values.activity[key as keyof typeof activityLabels] || 'Sin informar'}</p>) : null}{includeKinesiology ? Object.entries(kinesiologyLabels).map(([key, text]) => <p key={key}>{text}: {values.kinesiology[key as keyof typeof kinesiologyLabels] || 'Sin informar'}</p>) : <p>Sin información kinésica.</p>}</div> : index === 2 ? <div className="space-y-2 text-sm">{document ? document.questions.map(question => <p key={question.id}>{question.text}: {values.answers[question.id]?.answer === 'YES' ? `Sí${values.answers[question.id]?.details ? ` · ${values.answers[question.id]?.details}` : ''}` : values.answers[question.id]?.answer === 'NO' ? 'No' : 'Sin informar'}</p>) : <p>Sin antecedentes informados.</p>}</div> : <dl className="space-y-2 text-sm">{Object.entries(consentLabels).filter(([key]) => includeKinesiology || !kinesiologyConsents.includes(key as ConsentKey)).map(([key, text]) => <div key={key}><dt className="text-muted-foreground">{text}</dt><dd>{values.consents[key as ConsentKey] === 'YES' ? 'Sí' : values.consents[key as ConsentKey] === 'NO' ? 'No' : 'Sin autorización'}</dd></div>)}</dl>}</section>)}</div>;
}

function categoryQuestions(questions: FormDocument['questions']) {
  const choices = questions.filter(question => question.responseType !== 'TEXT');
  return choices.length ? choices : questions;
}
function categoryAnswered(questions: FormDocument['questions'], answers: FormValues['answers']) {
  const responses = questions.map(question => answers[question.id]?.answer);
  return responses.every(answer => answer === 'NOT_DISCLOSED') || responses.every(answer => answer === 'YES' || answer === 'NO');
}
function HealthLegalNotice({ document, includeKinesiology }: { document: FormDocument; includeKinesiology: boolean }): React.JSX.Element {
  // Reuse every source obligation once; the processing notice repeats lines from the privacy notice.
  const seen = new Set<string>();
  const sections = document.consents.filter(consent => includeKinesiology || !kinesiologyConsents.includes(consent.key)).map(consent => {
    const text = consent.text.split('\n').filter(line => {
      if (!line.trim()) return false;
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    }).join('\n');
    return text ? <div key={consent.key} className="space-y-2"><h4 className="font-semibold">{consentLabels[consent.key]}</h4><p className="whitespace-pre-wrap leading-relaxed">{text}</p></div> : null;
  });
  return <section className="space-y-5 text-sm" aria-labelledby="health-legal-title"><h3 id="health-legal-title" className="text-lg font-semibold">Declaración jurada y protección de datos</h3>{sections}{document.notices ? <><div><h4 className="font-semibold">Normas de puntualidad y asistencia</h4><p className="whitespace-pre-wrap leading-relaxed">{document.notices.attendance}</p></div><p className="leading-relaxed">{document.notices.validity}</p></> : null}<p className="leading-relaxed">{document.finalConfirmation}</p></section>;
}
