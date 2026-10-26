'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { registerClinicalPatient, type PersonResponseDto } from '@athleta/api-client';
import { Button } from '@athleta/ui';
import { addPerson, fetchPeople } from '../people/people-api';
import { GeneralPersonForm, personInput, personSchema, type PersonValues } from '../people/general-person-form';

export function PatientOnboarding({ csrfToken, canCreate, onClose }: { csrfToken: string; canCreate: boolean; onClose: () => void }): React.JSX.Element {
  const client = useQueryClient();
  const [dni, setDni] = useState('');
  const [searchedDni, setSearchedDni] = useState('');
  const [person, setPerson] = useState<PersonResponseDto | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');
  const register = async (identity: PersonResponseDto) => {
    const response = await registerClinicalPatient({ personId: identity.id }, { credentials: 'include', headers: { 'x-csrf-token': csrfToken } });
    if (response.status >= 400) throw new Error('REGISTER_FAILED');
    setPerson({ ...identity, isClinicalPatient: true });
    await client.invalidateQueries({ queryKey: ['clinic', 'patients'] });
    await client.invalidateQueries({ queryKey: ['person', identity.id] });
  };
  const lookup = useMutation({ mutationFn: async () => {
    setMessage('');
    const parsed = personSchema.shape.dni.safeParse(dni);
    if (!parsed.success) { setMessage('El DNI debe tener entre 6 y 8 dígitos.'); return; }
    let page = 1;
    let match: PersonResponseDto | undefined;
    while (true) {
      const result = await fetchPeople({ search: parsed.data, page, pageSize: 100 });
      match = result.data.find((item) => item.dni.replace(/[^0-9]/g, '') === parsed.data);
      if (match || page >= result.meta.totalPages) break;
      page += 1;
    }
    setPerson(match ?? null);
    setSearchedDni(parsed.data);
  }, onError: () => setMessage('No pudimos buscar la Persona. Intentá nuevamente.') });
  const save = useMutation({ mutationFn: async (values?: PersonValues) => {
    setMessage('');
    let identity = person;
    if (!identity) {
      if (!values || !canCreate) return;
      const created = await addPerson(personInput(values), csrfToken);
      const { initialPin, ...safePerson } = created;
      identity = safePerson;
      setPerson(safePerson);
      if (initialPin) setPin(initialPin);
      await client.invalidateQueries({ queryKey: ['people'] });
    }
    try { await register(identity); }
    catch { setMessage('La Persona está guardada. No pudimos darla de alta en Clínica. Reintentá solo el alta clínica.'); }
  }, onError: (error) => setMessage((error as { status?: number }).status === 409 ? 'Ya existe una Persona con ese DNI. Volvé a buscarla.' : 'No pudimos guardar la Persona. Intentá nuevamente.') });
  return <section aria-label="Nuevo paciente" className="mt-4 rounded-md border bg-surface p-5">
    <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-semibold">Nuevo paciente</h3><Button type="button" variant="secondary" disabled={save.isPending} onClick={onClose}>Cerrar alta</Button></div>
    {!searchedDni ? <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); lookup.mutate(); }}>
      <label className="text-sm">DNI<input aria-label="DNI del paciente" className="block h-10 rounded-md border px-3" value={dni} onChange={(event) => setDni(event.target.value)} /></label>
      <Button type="submit" disabled={lookup.isPending}>{lookup.isPending ? 'Buscando…' : 'Buscar DNI'}</Button>
    </form> : person ? <div className="mt-4 space-y-3">
      <p>{person.firstName} {person.lastName} · DNI {person.dni}</p>
      {person.hasSalaParticipation && <p>Participación actual en Sala</p>}
      {person.isClinicalPatient ? <Link className="inline-block text-sm font-medium underline" href={`/clinic?tab=Paciente&personId=${person.id}`}>Abrir ficha</Link> : <Button type="button" disabled={save.isPending} onClick={() => save.mutate(undefined)}>{save.isPending ? 'Registrando…' : 'Dar de alta en Clínica'}</Button>}
    </div> : canCreate ? <GeneralPersonForm key={searchedDni} defaultDni={searchedDni} onSave={(values) => {
      if (values.dni !== searchedDni) { setMessage('El DNI debe coincidir con la búsqueda previa.'); return; }
      save.mutate(values);
    }} onCancel={onClose} pending={save.isPending} /> : <p className="mt-4">No existe una Persona con ese DNI. Tu perfil no permite crear Personas.</p>}
    {searchedDni && !person && canCreate && <p className="mt-3 text-sm text-muted-foreground">DNI consultado: {searchedDni}. Completá los datos de la Persona para registrarla en Clínica.</p>}
    {message && <p role="alert" className="mt-3 text-sm text-destructive">{message}</p>}
    {searchedDni && !save.isPending && !pin && <Button type="button" variant="secondary" className="mt-3" onClick={() => { setSearchedDni(''); setPerson(null); setMessage(''); }}>Buscar otra Persona</Button>}
    {pin && <div role="dialog" aria-modal="true" aria-labelledby="patient-pin-title" className="fixed inset-0 z-30 grid place-items-center bg-black/50 p-4"><div className="w-full max-w-md rounded-md bg-white p-6 text-center">
      <h3 id="patient-pin-title" className="text-lg font-semibold">PIN temporal del Portal</h3><p aria-label="PIN temporal" className="mt-4 font-mono text-4xl font-bold">{pin}</p>
      <p className="mt-3 text-sm">Este PIN se mostrará una sola vez. Compartilo de forma segura con la Persona.</p>
      <div className="mt-5 flex justify-center gap-2"><Button type="button" variant="secondary" onClick={async () => { try { await navigator.clipboard.writeText(pin); setCopied(true); } catch { setCopied(false); } }}>Copiar PIN</Button><Button type="button" onClick={() => { setPin(null); setCopied(false); }}>Entendido</Button></div>
      {copied && <p role="status">PIN copiado</p>}
    </div></div>}
  </section>;
}
