import type { UserRole } from './auth';

/** Who spent on a given day. The chart's tooltip is the only place this granularity is needed. */
export interface AdminSpendDayUser {
  /** Null when the account has since been deleted: the ledger keeps the call, not the link. */
  username: string | null;
  displayName: string | null;
  calls: number;
  costMicroUsd: number;
}

/** One day of AI spend, for the panel's chart. Days with no calls are filled in as zeros. */
export interface AdminSpendDay {
  /** ISO date, day precision (YYYY-MM-DD). */
  day: string;
  calls: number;
  tokens: number;
  costMicroUsd: number;
  /** Biggest spender first; empty on a day with no calls. */
  users: AdminSpendDayUser[];
}

/** Spend grouped by something (a model, an operation), biggest first. */
export interface AdminSpendSlice {
  key: string;
  calls: number;
  tokens: number;
  costMicroUsd: number;
}

/** A count with how much of it arrived inside the requested window. */
export interface AdminCount {
  total: number;
  inPeriod: number;
}

export interface AdminOverviewResponse {
  /** Length of the window every `inPeriod` and the series below refer to. */
  days: number;
  users: AdminCount;
  sheets: AdminCount;
  publishedSheets: AdminCount;
  aiCalls: AdminCount;
  /** Micro-dollars (1 USD = 1_000_000), as stored: never a float. */
  aiSpendMicroUsd: AdminCount;
  aiTokens: AdminCount;
  /** One entry per day in the window, oldest first. */
  spendByDay: AdminSpendDay[];
  spendByModel: AdminSpendSlice[];
  spendByOperation: AdminSpendSlice[];
  /** Models the ledger saw with no price configured: their cost is recorded as 0 on purpose. */
  unpricedModels: string[];
}

export interface AdminUserRow {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  role: UserRole;
  createdAt: string;
  sheets: number;
  publishedSheets: number;
  aiCalls: number;
  aiTokens: number;
  aiSpendMicroUsd: number;
  /** Most recent sheet edit or AI call; null for an account that never did either. */
  lastActivityAt: string | null;
}

/** What the users table can be ordered by. */
export type AdminUserSort = 'spend' | 'recent' | 'sheets' | 'created';

export interface AdminUsersResponse {
  items: AdminUserRow[];
  total: number;
}
