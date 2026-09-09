'use client';

import { useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { AdminUserSort } from '@rpgforce-ai/shared';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { FilterChip } from '@/components/ui/filter-chip';
import { LoadingState } from '@/components/ui/loading-state';
import { adminApi } from '@/lib/api/admin';
import { cn } from '@/lib/utils';
import { formatCompact, formatDateTime, formatUsd } from './format';

const PAGE_SIZE = 25;

const SORTS: Array<{ key: AdminUserSort; label: string }> = [
  { key: 'spend', label: 'Maior gasto' },
  { key: 'recent', label: 'Atividade recente' },
  { key: 'sheets', label: 'Mais fichas' },
  { key: 'created', label: 'Entrou por último' },
];

/** Who is on the site, what they built and what they cost. Read-only: roles are changed by CLI. */
export const AdminUsersTable = () => {
  const [sort, setSort] = useState<AdminUserSort>('spend');
  const [page, setPage] = useState(0);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-users', sort, page],
    queryFn: () => adminApi.users({ sort, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    // Same reason as the overview: re-sorting must not replace the table with a spinner.
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(Math.ceil(total / PAGE_SIZE) - 1, 0);

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-base font-semibold text-foreground">Usuários</h2>
        <div className="flex flex-wrap gap-1.5">
          {SORTS.map((option) => (
            <FilterChip
              key={option.key}
              active={sort === option.key}
              onClick={() => {
                setSort(option.key);
                setPage(0);
              }}
            >
              {option.label}
            </FilterChip>
          ))}
        </div>
      </header>

      {error ? (
        <ErrorState
          title="Não foi possível carregar os usuários"
          description="Verifique sua conexão e tente novamente."
          onRetry={() => void refetch()}
          isRetrying={isFetching}
        />
      ) : isLoading ? (
        <LoadingState />
      ) : (
        <div
          className={cn(
            'overflow-x-auto rounded-lg border border-border bg-card transition-opacity',
            isFetching && 'opacity-60'
          )}
        >
          <table className="w-full min-w-176 table-fixed text-sm">
            {/* Fixed widths: with the role column gone the browser was sizing every measure to its
                own header, so the numbers sat at five different distances from their titles. */}
            <colgroup>
              <col className="w-[30%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[18%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border text-center text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Conta
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Fichas
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Chamadas
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Tokens
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Gasto
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Última atividade
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((user) => (
                <tr key={user.id} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-2">
                    <div className="flex min-w-0 flex-col">
                      <Link
                        href={`/u/${encodeURIComponent(user.username)}`}
                        className="truncate font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {user.displayName?.trim() || user.username}
                      </Link>
                      <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {user.sheets}
                    {user.publishedSheets > 0 ? (
                      <span className="text-xs text-muted-foreground">
                        {' '}
                        ({user.publishedSheets} pública
                        {user.publishedSheets === 1 ? '' : 's'})
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">{user.aiCalls}</td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {formatCompact(user.aiTokens)}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {formatUsd(user.aiSpendMicroUsd)}
                  </td>
                  <td className="px-3 py-2 text-center text-xs tabular-nums text-muted-foreground">
                    {formatDateTime(user.lastActivityAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE_SIZE ? (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0 || isFetching}
            onClick={() => setPage((p) => Math.max(p - 1, 0))}
          >
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            Página {page + 1} de {lastPage + 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= lastPage || isFetching}
            onClick={() => setPage((p) => Math.min(p + 1, lastPage))}
          >
            Próxima
          </Button>
        </div>
      ) : null}
    </section>
  );
};
