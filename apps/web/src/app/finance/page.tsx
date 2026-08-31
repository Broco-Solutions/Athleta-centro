'use client';
import { useQuery } from '@tanstack/react-query';
import { WorkspaceShell } from '../../features/auth/workspace-shell';
import { currentSession } from '../../features/auth/auth';
const get = async (path: string) => { const r = await fetch(`/api/finance/${path}`, { credentials: 'include' }); if (!r.ok) throw new Error('No pudimos cargar Finanzas'); const b = await r.json(); return (b.data?.data ?? b.data) as unknown; };
export default function FinancePage() {
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const read = session.data?.permissions.includes('FINANCE_OPERATIONAL_READ') ?? false;
  const executive = session.data?.permissions.includes('FINANCE_EXECUTIVE_READ') ?? false;
  const totals = useQuery({ queryKey: ['finance', 'totals'], queryFn: () => get(executive ? 'executive-totals' : 'totals'), enabled: read });
  const income = useQuery({ queryKey: ['finance', 'income'], queryFn: () => get('income'), enabled: read });
  const expenses = useQuery({ queryKey: ['finance', 'expenses'], queryFn: () => get('expenses'), enabled: read });
  const metrics: Array<[string, string]> = [['Ingresos', 'totalIncome'], ['Sala', 'salaIncome'], ['Clínica', 'clinicalIncome'], ['Gastos', 'expenses'], ['Neto', 'net']];
  const totalData = totals.data as Record<string, unknown> | undefined;
  return <WorkspaceShell active="Finanzas"><main className="mx-auto max-w-6xl space-y-6"><header><p className="text-sm text-muted-foreground">Operación económica · ARS</p><h1 className="text-3xl font-semibold">Finanzas</h1></header>{read ? <><section className="grid gap-4 md:grid-cols-4">{metrics.slice(0, executive ? 5 : 4).map(([label, key]) => <article className="rounded border bg-white p-4" key={key}><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">$ {String(totalData?.[key] ?? '0')}</p></article>)}</section><Data title="Ingresos" value={income.data}/><Data title="Gastos" value={expenses.data}/></> : <section className="rounded border bg-white p-5"><h2 className="font-semibold">Registrar un gasto</h2><p className="mt-2 text-sm text-muted-foreground">Podés registrar un gasto sin acceder al historial financiero.</p></section>}</main></WorkspaceShell>;
}
function Data({ title, value }: { title: string; value: unknown }) { const rows = Array.isArray(value) ? value as Array<Record<string, unknown>> : []; return <section className="rounded border bg-white p-5"><h2 className="font-semibold">{title}</h2>{rows.length ? rows.map(row => <div className="flex justify-between border-b py-2 text-sm" key={String(row.id)}><span>{String(row.cashDate ?? '')} · {String(row.source ?? row.area ?? '')}</span><strong>$ {String(row.amount ?? '0')}</strong></div>) : <p className="mt-3 text-sm text-muted-foreground">No hay registros.</p>}</section>; }
