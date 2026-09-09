'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Coins, Gauge, ScrollText, ShieldAlert, Users } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { SiteFooter } from '@/components/layout/footer';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingState } from '@/components/ui/loading-state';
import { FilterChip } from '@/components/ui/filter-chip';
import { AdminStatTile } from '@/components/admin/admin-stat-tile';
import { AdminUsersTable } from '@/components/admin/admin-users-table';
import { SpendBreakdown } from '@/components/admin/spend-breakdown';
import { SpendChart } from '@/components/admin/spend-chart';
import { formatCompact, formatNumber, formatUsd } from '@/components/admin/format';
import { useAuth, useRequireAuth } from '@/contexts/auth-context';
import { adminApi } from '@/lib/api/admin';

// Capped at 30: at 90 the daily bars are hairlines and the chart stops being readable.
const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 14, label: '14 dias' },
  { days: 30, label: '30 dias' },
];

export default function AdminPage() {
  const { ready } = useRequireAuth();
  const { user } = useAuth();
  const [days, setDays] = useState(30);

  const isAdmin = user?.role === 'ADMIN';

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-overview', days],
    queryFn: () => adminApi.overview(days),
    enabled: ready && isAdmin,
    // Changing the period is a new query key, which would blank `data` and drop the whole page to a
    // spinner. Holding the previous window keeps the layout still; the affected parts fade instead.
    placeholderData: keepPreviousData,
  });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Gauge className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="font-serif text-2xl font-bold text-foreground">Painel</h1>
          </div>
          {/* The page's one filter shares the subtitle's line: it scopes everything below, and on a
              row of its own it read as floating. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Quanto o site está custando de IA e o que as contas estão fazendo.
            </p>
            {isAdmin ? (
              <div className="flex flex-wrap justify-end gap-1.5">
                {PERIODS.map((option) => (
                  <FilterChip
                    key={option.days}
                    active={days === option.days}
                    onClick={() => setDays(option.days)}
                  >
                    {option.label}
                  </FilterChip>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {!ready || (isAdmin && isLoading) ? (
          <LoadingState />
        ) : !isAdmin ? (
          <div className="content-reveal">
            <ErrorState
              title="Área restrita"
              description="Esta página é só para contas administradoras."
            />
          </div>
        ) : error ? (
          <div className="content-reveal">
            <ErrorState
              title="Não foi possível carregar o painel"
              description="Verifique sua conexão e tente novamente."
              onRetry={() => void refetch()}
              isRetrying={isFetching}
            />
          </div>
        ) : !data ? null : (
          <div className="flex flex-col gap-6 content-reveal">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <AdminStatTile
                icon={Coins}
                label={`Gasto de IA · ${days} dias`}
                value={formatUsd(data.aiSpendMicroUsd.inPeriod)}
                delta={`${formatUsd(data.aiSpendMicroUsd.total)} desde o início`}
              />
              <AdminStatTile
                icon={Gauge}
                label={`Chamadas de IA · ${days} dias`}
                value={formatNumber(data.aiCalls.inPeriod)}
                delta={`${formatNumber(data.aiCalls.total)} desde o início`}
                note={`${formatCompact(data.aiTokens.total)} tokens no total`}
              />
              <AdminStatTile
                icon={Users}
                label="Contas"
                value={formatNumber(data.users.total)}
                delta={`${data.users.inPeriod > 0 ? '+' : ''}${formatNumber(data.users.inPeriod)} nos últimos ${days} dias`}
              />
              <AdminStatTile
                icon={ScrollText}
                label="Fichas"
                value={formatNumber(data.sheets.total)}
                delta={`${data.sheets.inPeriod > 0 ? '+' : ''}${formatNumber(data.sheets.inPeriod)} nos últimos ${days} dias`}
                note={`${formatNumber(data.publishedSheets.total)} publicadas`}
              />
            </div>

            {data.unpricedModels.length > 0 ? (
              <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Sem preço configurado para {data.unpricedModels.join(', ')}: as chamadas estão
                  registradas com os tokens certos e custo zero, então o gasto acima está
                  subestimado. Acrescente o preço em <code>ai-pricing.ts</code>.
                </span>
              </p>
            ) : null}

            <SpendChart days={data.spendByDay} isRefetching={isFetching} />

            <div className="grid gap-4 lg:grid-cols-2">
              <SpendBreakdown
                title="Gasto por modelo"
                description="Qual modelo de IA consumiu o orçamento, somando todo o histórico."
                slices={data.spendByModel}
                emptyLabel="Nenhuma chamada registrada ainda."
              />
              <SpendBreakdown
                title="Gasto por etapa"
                description="Em que passo o dinheiro foi gasto: cada ficha gerada faz duas chamadas."
                slices={data.spendByOperation}
                labelled
                emptyLabel="Nenhuma chamada registrada ainda."
              />
            </div>

            <AdminUsersTable />
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
