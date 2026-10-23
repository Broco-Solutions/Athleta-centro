'use client';
import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getPortalHealthDeclarationStatus, submitPortalHealthDeclaration, getPortalHealthDocument, listPortalHealthDeclarations, getPortalHealthDeclaration, type SubmitHealthDeclarationDto } from '@athleta/api-client';
import Link from 'next/link';
import { formatOperationalDate } from '../../../lib/operational-date';
import { ConfirmedHealthDeclaration } from '../../../features/health-declaration/health-read-only';
import { HealthForm, parseHealthDocument, type HealthPerson } from '../../../features/health-declaration/health-form';
import { PortalFrame, portalFetch } from '../portal-ui';
export default function HealthDeclarationPage(): React.JSX.Element {
  const client = useQueryClient();
  const [saved, setSaved] = React.useState(false);
  const [selected, setSelected] = React.useState('');
  const status = useQuery({ queryKey: ['portal', 'health-status'], queryFn: async () => { const response = await getPortalHealthDeclarationStatus({ credentials: 'include' }); if (response.status !== 200) throw new Error('No pudimos cargar el estado.'); return response.data.data; }, retry: false });
  const history = useQuery({ queryKey: ['portal', 'health-history'], queryFn: async () => { const response = await listPortalHealthDeclarations({ credentials: 'include' }); if (response.status !== 200) throw new Error('No pudimos cargar las presentaciones.'); return response.data.data; }, retry: false });
  const copy = useQuery({ queryKey: ['portal', 'health-copy', selected], queryFn: async () => { const response = await getPortalHealthDeclaration(selected, { credentials: 'include' }); if (response.status !== 200) throw new Error('No pudimos cargar la declaración.'); return response.data.data; }, enabled: Boolean(selected), gcTime: 0, retry: false });
  const person = useQuery({ queryKey: ['portal', 'me'], queryFn: () => portalFetch<HealthPerson>('me'), retry: false });
  const document = useQuery({ queryKey: ['portal', 'health-document'], queryFn: async () => { const response = await getPortalHealthDocument({ credentials: 'include' }); if (response.status !== 200) throw new Error('No pudimos cargar el documento.'); return parseHealthDocument(response.data.data); }, enabled: status.isSuccess && status.data.required, retry: false });
  const submit = useMutation({ mutationFn: async (data: SubmitHealthDeclarationDto) => {
    const session = await portalFetch<{ csrfToken: string }>('auth/session');
    const response = await submitPortalHealthDeclaration(data, { credentials: 'include', headers: { 'x-csrf-token': session.csrfToken } });
    if (response.status !== 201) { await client.invalidateQueries({ queryKey: ['portal', 'health-status'] }); throw new Error('No pudimos confirmar la declaración. Si continúa vigente, podrás completar una nueva cuando venza la actual.'); }
  }, onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: ['portal', 'session'] }), client.invalidateQueries({ queryKey: ['portal', 'health-history'] }), client.invalidateQueries({ queryKey: ['portal', 'health-status'] })]); setSaved(true); } });
  return <PortalFrame title="Declaración de salud" subtitle="Declaración jurada de salud y consentimiento informado">
    {status.isPending ? <p role="status">Cargando estado…</p> : status.isError ? <p role="alert">No pudimos cargar el estado de tu declaración. Intentá nuevamente.</p> : <section className="mx-auto max-w-3xl space-y-3 rounded-md border bg-surface p-5">
      <h2 className="font-semibold">{status.data.status === 'CURRENT' ? 'Declaración vigente' : status.data.status === 'EXPIRED' ? 'Declaración vencida' : 'Declaración pendiente'}</h2>
      {status.data.status === 'CURRENT' ? <><p>Tu declaración de salud se encuentra vigente. Podrás completar una nueva cuando venza la actual.</p>{status.data.latest?.origin === 'PAPER' ? <p>Tu declaración de salud firmada en papel ya fue registrada por Athleta Centro. No necesitás completarla nuevamente mientras esté vigente.</p> : null}<Link href="/portal" className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 font-semibold">Ir al inicio</Link></> : status.data.status === 'EXPIRED' ? <p>Tu declaración de salud venció. Para continuar utilizando el Portal, completá una nueva declaración.</p> : null}
      {status.data.latest ? <p>{status.data.latest.origin === 'PAPER' ? 'Declaración presentada en papel · Firma' : 'Declaración digital · Presentada'}: {formatOperationalDate(status.data.latest.submittedAt)} · Vencimiento: {formatOperationalDate(status.data.latest.validUntil)}</p> : null}
      <p className="text-sm text-muted-foreground">Si cambió tu estado de salud antes del vencimiento, comunicate con Athleta Centro.</p>
    </section>}
    {history.data?.length ? <section className="mx-auto max-w-3xl space-y-3 rounded-md border bg-surface p-4 text-sm"><h2 className="font-semibold">Mis presentaciones</h2><p>Podés consultar tus presentaciones anteriores.</p><ul className="space-y-2">{history.data.map(item => <li key={item.id}>{item.origin === 'PAPER' ? <span>Declaración presentada en papel · Firma: {formatOperationalDate(item.submittedAt)} · Vencimiento: {formatOperationalDate(item.validUntil)}</span> : <button type="button" className="min-h-11 underline" onClick={() => setSelected(item.id)}>Consultar declaración del {formatOperationalDate(item.submittedAt)}</button>}</li>)}</ul></section> : null}
    {selected ? <section className="mx-auto max-w-3xl space-y-4 rounded-md border bg-surface p-5"><div className="flex flex-wrap justify-between gap-3"><h2 className="font-semibold">Mi declaración confirmada</h2><button type="button" className="min-h-11 underline" onClick={() => setSelected('')}>Cerrar copia</button><button type="button" className="min-h-11 underline" disabled={!copy.data} onClick={() => window.print()}>Imprimir copia</button></div>{copy.isPending ? <p role="status">Cargando copia…</p> : copy.isError || !copy.data ? <p role="alert">No pudimos cargar la copia.</p> : <ConfirmedHealthDeclaration declaration={copy.data} />}</section> : null}
    {saved ? <p role="status">Tu declaración se guardó correctamente. Ya podés acceder al Portal.</p> : null}
    {status.isSuccess && status.data.required && !saved ? person.isPending || document.isPending ? <p role="status">Cargando formulario…</p> : person.isError || document.isError || !person.data ? <p role="alert">No pudimos cargar el formulario. Intentá nuevamente.</p> : <HealthForm person={person.data} document={document.data ?? null} pending={submit.isPending} error={submit.error?.message} onSubmit={async data => { try { await submit.mutateAsync(data); } catch { /* Mutation error is rendered next to the form. */ } }} /> : null}
  </PortalFrame>;
}
