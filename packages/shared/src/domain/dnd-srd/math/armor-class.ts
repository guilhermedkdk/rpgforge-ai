export interface ArmorClassParams {
  /** Parsed `data.armorClass` base; when > 0 it is used as the no-armor base (else 10 + Dex). */
  storedBaseAc?: number;
  dexMod: number;
  conMod: number;
  wisMod: number;
  chaMod: number;
  /** AC from equipped, proficient, STR-met armor; null when no usable armor is equipped. */
  armorAc: number | null;
  /** Any armor equipped — distinct from `armorAc`: non-proficient armor is equipped yet `armorAc` is null. */
  hasArmorEquipped: boolean;
  /** A shield is equipped (raw, regardless of proficiency) — gates the "requires no shield" rule. */
  hasShieldEquipped: boolean;
  /** A proficient shield is equipped → +2. */
  shieldBonusApplies: boolean;
  hasUnarmoredDefense: boolean;
  /** Unarmored Defense uses Wisdom instead of Constitution (Monk / Body and Mind). */
  unarmoredDefenseUsesWis: boolean;
  /** Unarmored Defense requires no shield (Barbarian). */
  unarmoredDefenseRequiresNoShield: boolean;
  /** Draconic Resilience: unarmored base 10 + Dex + Cha (best-of with the other unarmored bases). */
  hasDraconicResilience: boolean;
  /** Defense fighting style applies (+1; the caller already checked "wearing armor"). */
  defenseStyleApplies: boolean;
}

/**
 * Assembles the final AC from already-resolved inputs (mods, the equipped-armor AC, and feature
 * flags). Pack-agnostic: identifying which features are active and reading the armor item stay with
 * the caller; this function owns only the SRD assembly rules (armor vs. Unarmored Defense vs.
 * Draconic best-of, shield +2, Defense style +1). Returns 0 for a non-finite/negative result.
 */
export function assembleArmorClass(params: ArmorClassParams): number {
  const {
    storedBaseAc,
    dexMod,
    conMod,
    wisMod,
    chaMod,
    armorAc,
    hasArmorEquipped,
    hasShieldEquipped,
    shieldBonusApplies,
    hasUnarmoredDefense,
    unarmoredDefenseUsesWis,
    unarmoredDefenseRequiresNoShield,
    hasDraconicResilience,
    defenseStyleApplies,
  } = params;

  const defaultBaseNoArmor = storedBaseAc != null && storedBaseAc > 0 ? storedBaseAc : 10 + dexMod;
  const unarmoredDefenseBase = 10 + dexMod + (unarmoredDefenseUsesWis ? wisMod : conMod);

  let total: number;
  if (armorAc != null) {
    total = armorAc;
  } else {
    const canUseUnarmoredDefense =
      hasUnarmoredDefense &&
      !hasArmorEquipped &&
      (!unarmoredDefenseRequiresNoShield || !hasShieldEquipped);
    total = canUseUnarmoredDefense ? unarmoredDefenseBase : defaultBaseNoArmor;
    // Draconic Resilience: best-of unarmored base (the shield still adds below).
    if (hasDraconicResilience && !hasArmorEquipped) {
      total = Math.max(total, 10 + dexMod + chaMod);
    }
  }

  if (shieldBonusApplies) total += 2;
  if (defenseStyleApplies) total += 1;

  if (!Number.isFinite(total) || total < 0) return 0;
  return total;
}
