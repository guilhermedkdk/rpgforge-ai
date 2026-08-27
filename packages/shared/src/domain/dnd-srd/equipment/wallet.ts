/** Coin/wallet math shared by the web editor and the backend (persisted wallet fields). */

export function breakdownGP(gp: number): { gp: number; sp: number; cp: number } {
  const totalCP = Math.round(Math.max(0, gp) * 100);
  return {
    gp: Math.floor(totalCP / 100),
    sp: Math.floor((totalCP % 100) / 10),
    cp: totalCP % 10,
  };
}

/** Max whole coins per denomination (GP / SP / CP) in wallet UI and persisted form state. */
export const WALLET_COIN_MAX = 999;

/** Whole coins for wallet fields; `''` / NaN / non-finite → 0 (avoids empty controlled inputs). */
export function coerceNonNegativeWalletInt(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.trunc(v));
  if (typeof v === 'string') {
    const t = v.trim().replace(/\D/g, '');
    if (t === '') return 0;
    const n = parseInt(t, 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  return 0;
}
