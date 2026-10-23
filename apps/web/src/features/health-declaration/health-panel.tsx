'use client';
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPersonHealthDeclarationStatus, listPersonHealthDeclarations, getPersonHealthDeclaration } from '@athleta/api-client';
import { Button } from '@athleta/ui';
import { ConfirmedHealthDeclaration } from './health-read-only';
import { formatOperationalDate } from '../../lib/operational-date';

export function HealthDeclarationPanel({ personId, canReadAnswers }: { personId: string; canReadAnswers: boolean }): React.JSX.Element {
  const [selected, setSelected] = React.useState('');
  const status = useQuery({ queryKey: ['health-declaration', personId, 'status'], queryFn: async () => { const response = await getPersonHealthDeclarationStatus(personId, { credentials: 'include' }); if (response.status !== 200) throw new Error('No pudimos cargar el estado.'); return response.data.data; } });
  const history = useQuery({ queryKey: ['health-declaration', personId, 'history'], queryFn: async () => { const response = await listPersonHealthDeclarations(personId, { credentials: 'include' }); if (response.status !== 200) throw new Error('No pudimos cargar el historial.'); return response.data.data; } });
  const detail = useQuery({ queryKey: ['health-declaration', personId, 'detail', selected], queryFn: async () => { const response = await getPersonHealthDeclaration(personId, selected, { credentials: 'include' }); if (response.status !== 200) throw new Error('No pudimos consultar la declaración.'); return response.data.data; }, enabled: Boolean(selected && canReadAnswers), gcTime: 0, retry: false });
  return <section aria-labelledby="health-declaration-title" className="space-y-5 rounded-md border border-border bg-surface p-5">
    <h2 id="health-declaration-title" className="text-xl font-semibold">Declaración de salud</h2>
    {status.isPending ? <p role="status">Cargando estado…</p> : status.isError ? <p role="alert">No pudimos cargar el estado.</p> : <><p className="font-medium">{status.data.status === 'CURRENT' ? 'Vigente' : status.data.status === 'EXPIRED' ? 'Vencida' : 'Sin presentación'}</p>{status.data.latest ? <dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Presentada</dt><dd>{formatOperationalDate(status.data.latest.submittedAt)}</dd></div><div><dt className="text-muted-foreground">Vigente hasta</dt><dd>{formatOperationalDate(status.data.latest.validUntil)}</dd></div></dl> : null}{!status.data.documentAvailable ? <p className="text-sm text-muted-foreground">La recepción de declaraciones está pendiente del documento fuente.</p> : null}</>}
    <h3 className="font-semibold">Historial de presentaciones</h3>
    {history.isPending ? <p role="status">Cargando historial…</p> : history.isError ? <p role="alert">No pudimos cargar el historial.</p> : !history.data.length ? <p className="text-sm text-muted-foreground">Todavía no hay declaraciones confirmadas.</p> : <ul className="divide-y divide-border">{history.data.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span>{formatOperationalDate(item.submittedAt)} · Hasta {formatOperationalDate(item.validUntil)}</span>{canReadAnswers ? <Button type="button" variant="secondary" onClick={() => setSelected(item.id)}>Consultar declaración del {formatOperationalDate(item.submittedAt)}</Button> : null}</li>)}</ul>}
    {selected && canReadAnswers ? <section aria-label="Declaración confirmada" className="space-y-4 border-t border-border pt-5"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Consulta de declaración · solo lectura</h3><Button type="button" variant="secondary" onClick={() => setSelected('')}>Cerrar consulta</Button></div>{detail.isPending ? <p role="status">Cargando declaración…</p> : detail.isError || !detail.data ? <p role="alert">No pudimos consultar la declaración.</p> : <><ConfirmedHealthDeclaration declaration={detail.data} /></>}</section> : null}
  </section>;
}
