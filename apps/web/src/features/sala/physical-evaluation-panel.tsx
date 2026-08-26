'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@athleta/ui';
import { createSalaPhysicalEvaluation, listPersonPhysicalEvaluations, listSalaPhysicalTestDefinitions } from '@athleta/api-client';

type TestDefinition = { id: string; name: string; type: string };
type Evaluation = { id: string; evaluationDate: string; professor?: { firstName: string; lastName: string }; results: Array<{ resultText: string; testDefinition?: { name: string } }> };
const unwrap = <T,>(value: unknown): T[] => { const body = (value as { data?: unknown }).data; if (Array.isArray(body)) return body as T[]; const nested = (body as { data?: unknown } | undefined)?.data; return Array.isArray(nested) ? nested as T[] : []; };

export function PhysicalEvaluationPanel({ personId, participationId, professorId, csrfToken }: { personId: string; participationId: string; professorId: string; csrfToken: string }): React.JSX.Element {
  const queryClient = useQueryClient();
  const [testId, setTestId] = useState('');
  const [resultText, setResultText] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const tests = useQuery({ queryKey: ['sala', 'physical-tests'], queryFn: async () => unwrap<TestDefinition>(await listSalaPhysicalTestDefinitions({ credentials: 'include' })), initialData: [] });
  const evaluations = useQuery({ queryKey: ['sala', 'physical-evaluations', personId], queryFn: async () => unwrap<Evaluation>(await listPersonPhysicalEvaluations(personId, { credentials: 'include' })), enabled: Boolean(personId), initialData: [] });
  const create = useMutation({ mutationFn: async () => createSalaPhysicalEvaluation({ personId, salaParticipationId: participationId, professorId, evaluationDate: date, results: [{ testDefinitionId: testId, resultText }] }, { credentials: 'include', headers: { 'x-csrf-token': csrfToken } }), onSuccess: async () => { setResultText(''); await queryClient.invalidateQueries({ queryKey: ['sala', 'physical-evaluations', personId] }); } });
  return <section className="mt-5 rounded-md border bg-white p-5"><h2 className="mb-4 text-lg font-semibold">Evaluaciones físicas</h2><form className="grid gap-3 md:grid-cols-4" onSubmit={(event) => { event.preventDefault(); if (testId && resultText.trim()) create.mutate(); }}><input aria-label="Fecha de evaluación" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-10 rounded-md border px-3" /><select aria-label="Prueba física" value={testId} onChange={(event) => setTestId(event.target.value)} className="h-10 rounded-md border px-3"><option value="">Seleccionar prueba</option>{tests.data.map((test) => <option key={test.id} value={test.id}>{test.name}</option>)}</select><input aria-label="Resultado" value={resultText} onChange={(event) => setResultText(event.target.value)} placeholder="Resultado" className="h-10 rounded-md border px-3" /><Button type="submit" disabled={create.isPending || !testId || !resultText.trim()}>Registrar</Button></form>{create.isError ? <p role="alert" className="mt-3 text-sm text-red-700">No se pudo registrar la evaluación.</p> : null}<div className="mt-4 space-y-2">{evaluations.data.map((evaluation) => <div key={evaluation.id} className="rounded border p-3 text-sm"><strong>{evaluation.evaluationDate}</strong>{evaluation.results.map((result, index) => <span key={`${evaluation.id}-${index}`} className="ml-3">{result.testDefinition?.name ?? 'Prueba'}: {result.resultText}</span>)}</div>)}</div></section>;
}
