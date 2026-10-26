import React from 'react';
import { Button } from '@athleta/ui';

export const LIST_PAGE_SIZE = 25;

export function ListPagination({ total, page, onPage }: { total: number; page: number; onPage: (page: number) => void }): React.JSX.Element {
  const pages = Math.max(1, Math.ceil(total / LIST_PAGE_SIZE));
  return <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
    <span>Mostrando {total ? (page - 1) * LIST_PAGE_SIZE + 1 : 0}–{Math.min(page * LIST_PAGE_SIZE, total)} de {total}</span>
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</Button>
      <span>Página {page} de {pages}</span>
      <Button type="button" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Siguiente</Button>
    </div>
  </div>;
}
