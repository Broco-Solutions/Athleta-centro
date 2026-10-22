import React from 'react';
import Link from 'next/link';
import { WorkspaceShell } from '../../../features/auth/workspace-shell';
import { SalaContext, InactivatePersonButton, PersonIdentity } from './clinic-actions';

export default async function PersonWorkspacePage({ params }: { params: Promise<{ id: string }> }): Promise<React.JSX.Element> {
  const { id } = await params;
  return <WorkspaceShell active="people"><div className="mx-auto max-w-5xl space-y-6"><nav aria-label="Breadcrumb" className="text-sm text-muted-foreground"><Link href="/people" className="underline">Personas</Link> <span aria-hidden="true">/</span> Ficha</nav><header className="rounded-md border bg-white p-6"><p className="text-sm text-muted-foreground">Contexto transversal</p><PersonIdentity personId={id}/><InactivatePersonButton personId={id}/></header><section className="grid gap-4"><article className="rounded-md border bg-white p-5"><h2 className="font-semibold">Sala</h2><p className="mt-1 text-sm text-muted-foreground">Participación, reservas, asistencia, rutinas y evaluaciones.</p><SalaContext personId={id}/><Link className="mt-4 inline-flex rounded-md bg-[#FCCC05] px-3 py-2 text-sm font-medium text-black" href={`/sala/people/${id}`}>Abrir Sala</Link></article></section></div></WorkspaceShell>;
}
