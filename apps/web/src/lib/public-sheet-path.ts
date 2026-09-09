/**
 * Where a published sheet lives. Profile-scoped on purpose: the owner is part of the address, and
 * `/sheets/*` stays entirely private (the proxy guards that prefix).
 */
export const publicSheetPath = (username: string, sheetId: string): string =>
  `/u/${encodeURIComponent(username)}/${encodeURIComponent(sheetId)}`;
