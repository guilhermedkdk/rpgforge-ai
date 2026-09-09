import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma.service';
import { findModelPrice } from '../ai-usage/ai-pricing';
import type {
  AdminOverviewResponse,
  AdminSpendDay,
  AdminSpendDayUser,
  AdminSpendSlice,
  AdminUserRow,
  AdminUserSort,
  AdminUsersResponse,
} from '@rpgforce-ai/shared';

const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;

/**
 * How many accounts the users view merges in memory before paging.
 *
 * Per-user spend lives in a separate table, so ordering by it cannot be done by the database page:
 * the aggregates have to be joined first. That is honest up to a few thousand accounts; past that
 * the fix is a materialized per-user rollup, not a bigger number here.
 */
const MAX_USERS_MERGED = 5_000;

const MINUTE_MS = 60_000;

/**
 * Start of the reader's day, as a real instant.
 *
 * `offsetMinutes` is the browser's own `getTimezoneOffset()` (180 for UTC-3), so the panel's days are
 * the days on the reader's clock. Bucketing in UTC instead put a bar on "tomorrow" every evening for
 * anyone behind UTC. A DST change inside the window shifts one boundary by an hour, which is not
 * worth a timezone database here.
 */
const startOfLocalDay = (now: Date, offsetMinutes: number): Date => {
  const shifted = new Date(now.getTime() - offsetMinutes * MINUTE_MS);
  const midnightLocal = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate()
  );
  return new Date(midnightLocal + offsetMinutes * MINUTE_MS);
};

/** The reader's calendar day for an instant, as YYYY-MM-DD. */
const localDayKey = (date: Date, offsetMinutes: number): string =>
  new Date(date.getTime() - offsetMinutes * MINUTE_MS).toISOString().slice(0, 10);

const laterOf = (a: Date | null, b: Date | null): Date | null => {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
};

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** The panel's headline numbers plus the series behind its chart, in one request. */
  async getOverview(
    daysInput?: number,
    offsetMinutesInput?: number
  ): Promise<AdminOverviewResponse> {
    const days = Math.min(Math.max(Math.trunc(daysInput ?? DEFAULT_DAYS), 1), MAX_DAYS);
    // Clamped to the real range of UTC offsets, so a bad value cannot move the window by years.
    const offsetMinutes = Math.min(Math.max(Math.trunc(offsetMinutesInput ?? 0), -840), 840);
    // The window runs from the START of the reader's day `days - 1` ago, so "7 days" means 7
    // calendar days including today, matching what the chart draws.
    const today = startOfLocalDay(new Date(), offsetMinutes);
    const since = new Date(today.getTime() - (days - 1) * 24 * 60 * MINUTE_MS);

    const [
      usersTotal,
      usersInPeriod,
      sheetsTotal,
      sheetsInPeriod,
      publishedTotal,
      publishedInPeriod,
      usageTotal,
      usageInPeriod,
      byDayRows,
      byModel,
      byOperation,
      byDayUserRows,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: since } } }),
      this.prisma.characterSheet.count(),
      this.prisma.characterSheet.count({ where: { createdAt: { gte: since } } }),
      this.prisma.characterSheet.count({ where: { isPublic: true } }),
      this.prisma.characterSheet.count({
        where: { isPublic: true, publishedAt: { gte: since } },
      }),
      this.prisma.aiUsage.aggregate({
        _count: { _all: true },
        _sum: { costMicroUsd: true, totalTokens: true },
      }),
      this.prisma.aiUsage.aggregate({
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { costMicroUsd: true, totalTokens: true },
      }),
      // Grouped in SQL rather than in JS: a year of calls is a lot of rows to ship just to bucket them.
      this.prisma.$queryRaw<
        Array<{ day: Date; calls: bigint; tokens: bigint | null; cost: bigint | null }>
      >(Prisma.sql`
        SELECT date_trunc('day', "createdAt" - make_interval(mins => ${offsetMinutes}::int)) AS day,
               COUNT(*)                       AS calls,
               SUM("totalTokens")             AS tokens,
               SUM("costMicroUsd")            AS cost
        FROM "ai_usage"
        WHERE "createdAt" >= ${since}
        GROUP BY 1
        ORDER BY 1
      `),
      this.prisma.aiUsage.groupBy({
        by: ['model'],
        _count: { _all: true },
        _sum: { costMicroUsd: true, totalTokens: true },
      }),
      this.prisma.aiUsage.groupBy({
        by: ['operation'],
        _count: { _all: true },
        _sum: { costMicroUsd: true, totalTokens: true },
      }),
      // Per day AND per account, for the chart's tooltip. Joined here rather than in JS so the
      // usernames come back with the amounts; a deleted account arrives as a null username.
      this.prisma.$queryRaw<
        Array<{
          day: Date;
          username: string | null;
          displayName: string | null;
          calls: bigint;
          cost: bigint | null;
        }>
      >(Prisma.sql`
        SELECT date_trunc('day', a."createdAt" - make_interval(mins => ${offsetMinutes}::int)) AS day,
               u."username"                AS username,
               u."displayName"             AS "displayName",
               COUNT(*)                    AS calls,
               SUM(a."costMicroUsd")       AS cost
        FROM "ai_usage" a
        LEFT JOIN "users" u ON u."id" = a."userId"
        WHERE a."createdAt" >= ${since}
        GROUP BY 1, 2, 3
        ORDER BY 1, 5 DESC
      `),
    ]);

    // Every day in the window is present, including the empty ones: a chart with gaps reads as
    // missing data rather than as a quiet day.
    const byDay = new Map(
      byDayRows.map((row) => [
        // Already shifted by the query: this is a naive local timestamp, not an instant.
        row.day.toISOString().slice(0, 10),
        {
          calls: Number(row.calls),
          tokens: Number(row.tokens ?? 0),
          costMicroUsd: Number(row.cost ?? 0),
        },
      ])
    );
    const usersByDay = new Map<string, AdminSpendDayUser[]>();
    for (const row of byDayUserRows) {
      const key = row.day.toISOString().slice(0, 10);
      const list = usersByDay.get(key) ?? [];
      list.push({
        username: row.username,
        displayName: row.displayName,
        calls: Number(row.calls),
        costMicroUsd: Number(row.cost ?? 0),
      });
      usersByDay.set(key, list);
    }

    const spendByDay: AdminSpendDay[] = [];
    for (let i = 0; i < days; i += 1) {
      const key = localDayKey(new Date(since.getTime() + i * 24 * 60 * MINUTE_MS), offsetMinutes);
      spendByDay.push({
        day: key,
        calls: 0,
        tokens: 0,
        costMicroUsd: 0,
        ...byDay.get(key),
        users: usersByDay.get(key) ?? [],
      });
    }

    const toSlices = <
      T extends {
        _count: { _all: number };
        _sum: { costMicroUsd: number | null; totalTokens: number | null };
      },
    >(
      rows: T[],
      keyOf: (row: T) => string
    ): AdminSpendSlice[] =>
      rows
        .map((row) => ({
          key: keyOf(row),
          calls: row._count._all,
          tokens: row._sum.totalTokens ?? 0,
          costMicroUsd: row._sum.costMicroUsd ?? 0,
        }))
        .sort((a, b) => b.costMicroUsd - a.costMicroUsd || b.calls - a.calls);

    return {
      days,
      users: { total: usersTotal, inPeriod: usersInPeriod },
      sheets: { total: sheetsTotal, inPeriod: sheetsInPeriod },
      publishedSheets: { total: publishedTotal, inPeriod: publishedInPeriod },
      aiCalls: { total: usageTotal._count._all, inPeriod: usageInPeriod._count._all },
      aiSpendMicroUsd: {
        total: usageTotal._sum.costMicroUsd ?? 0,
        inPeriod: usageInPeriod._sum.costMicroUsd ?? 0,
      },
      aiTokens: {
        total: usageTotal._sum.totalTokens ?? 0,
        inPeriod: usageInPeriod._sum.totalTokens ?? 0,
      },
      spendByDay,
      spendByModel: toSlices(byModel, (row) => row.model),
      spendByOperation: toSlices(byOperation, (row) => row.operation),
      // Surfaced instead of hidden: a model with no price is recorded at cost 0, so a panel that
      // did not say so would be quietly under-reporting the bill.
      unpricedModels: byModel
        .map((row) => row.model)
        .filter((model) => findModelPrice(model) == null),
    };
  }

  /** Who is on the site and what they have cost. */
  async getUsers(params: {
    limit?: number;
    offset?: number;
    sort?: AdminUserSort;
  }): Promise<AdminUsersResponse> {
    const limit = Math.min(Math.max(params.limit ?? 25, 1), 100);
    const offset = Math.max(params.offset ?? 0, 0);
    const sort = params.sort ?? 'spend';

    const [users, usage, sheets, published, lastSheetEdit] = await Promise.all([
      this.prisma.user.findMany({
        take: MAX_USERS_MERGED,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          role: true,
          createdAt: true,
        },
      }),
      this.prisma.aiUsage.groupBy({
        by: ['userId'],
        _count: { _all: true },
        _sum: { costMicroUsd: true, totalTokens: true },
        _max: { createdAt: true },
      }),
      this.prisma.characterSheet.groupBy({ by: ['userId'], _count: { _all: true } }),
      this.prisma.characterSheet.groupBy({
        by: ['userId'],
        where: { isPublic: true },
        _count: { _all: true },
      }),
      this.prisma.characterSheet.groupBy({ by: ['userId'], _max: { updatedAt: true } }),
    ]);

    const usageByUser = new Map(usage.filter((r) => r.userId).map((r) => [r.userId as string, r]));
    const sheetsByUser = new Map(sheets.map((r) => [r.userId, r._count._all]));
    const publishedByUser = new Map(published.map((r) => [r.userId, r._count._all]));
    const editByUser = new Map(lastSheetEdit.map((r) => [r.userId, r._max.updatedAt]));

    const rows: AdminUserRow[] = users.map((user) => {
      const spend = usageByUser.get(user.id);
      return {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
        sheets: sheetsByUser.get(user.id) ?? 0,
        publishedSheets: publishedByUser.get(user.id) ?? 0,
        aiCalls: spend?._count._all ?? 0,
        aiTokens: spend?._sum.totalTokens ?? 0,
        aiSpendMicroUsd: spend?._sum.costMicroUsd ?? 0,
        lastActivityAt:
          laterOf(editByUser.get(user.id) ?? null, spend?._max.createdAt ?? null)?.toISOString() ??
          null,
      };
    });

    const compare: Record<AdminUserSort, (a: AdminUserRow, b: AdminUserRow) => number> = {
      spend: (a, b) => b.aiSpendMicroUsd - a.aiSpendMicroUsd || b.aiCalls - a.aiCalls,
      recent: (a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''),
      sheets: (a, b) => b.sheets - a.sheets,
      created: (a, b) => b.createdAt.localeCompare(a.createdAt),
    };
    rows.sort(compare[sort]);

    return { items: rows.slice(offset, offset + limit), total: rows.length };
  }
}
