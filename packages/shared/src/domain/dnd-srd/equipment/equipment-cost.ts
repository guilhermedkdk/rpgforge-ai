/** Item cost parsing (from Open5e/rule-item `raw`) + coin display formatting. */

/**
 * Parses item cost from Open5e/rule-item raw data to GP.
 * Supports: cost "15 gp", cost { quantity, unit }, cost_quantity/cost_unit.
 */
export function getItemCostGP(raw: Record<string, unknown> | null | undefined): number | null {
  if (!raw) return null;
  const cost = raw.cost ?? (raw as Record<string, unknown>).cost;
  if (typeof cost === 'string') {
    // Open5e v2 stores costs pre-normalized to GP as decimals (e.g. "0.02" = 2 CP, "0.20" = 2 SP)
    const m = cost.trim().match(/^(\d+(?:\.\d+)?)\s*(gp|gold|gold pieces?)?$/i);
    if (m) return parseFloat(m[1]);
    const m2 = cost.trim().match(/^(\d+)\s*(sp|silver)/i);
    if (m2) return parseInt(m2[1], 10) / 10;
    const m3 = cost.trim().match(/^(\d+)\s*(cp|copper)/i);
    if (m3) return parseInt(m3[1], 10) / 100;
    return null;
  }
  if (cost && typeof cost === 'object') {
    const obj = cost as { quantity?: number; unit?: string };
    const q = obj.quantity ?? (raw as Record<string, unknown>).cost_quantity;
    const unit = String(
      obj.unit ?? (raw as Record<string, unknown>).cost_unit ?? 'gp'
    ).toLowerCase();
    if (q == null || typeof q !== 'number') return null;
    if (unit.includes('gp') || unit === 'gold') return q;
    if (unit.includes('sp') || unit === 'silver') return q / 10;
    if (unit.includes('cp') || unit === 'copper') return q / 100;
    return q;
  }
  const q = (raw as Record<string, unknown>).cost_quantity;
  if (typeof q === 'number') return q;
  return null;
}

export type CoinType = 'gp' | 'sp' | 'cp';

/**
 * Returns the display text and coin type for a GP decimal value.
 * 2.00 → { text: "2 GP", currency: "gp" }
 * 0.20 → { text: "2 SP", currency: "sp" }
 * 0.02 → { text: "2 CP", currency: "cp" }
 */
export function formatCostInfo(gp: number): { text: string; currency: CoinType } {
  if (gp <= 0) return { text: 'Free', currency: 'gp' };
  if (gp >= 1) return { text: `${Math.round(gp)} GP`, currency: 'gp' };
  const asSP = gp * 10;
  if (Math.abs(asSP - Math.round(asSP)) < 0.001) {
    return { text: `${Math.round(asSP)} SP`, currency: 'sp' };
  }
  const asCP = Math.round(gp * 100);
  return { text: asCP > 0 ? `${asCP} CP` : 'Free', currency: 'cp' };
}
