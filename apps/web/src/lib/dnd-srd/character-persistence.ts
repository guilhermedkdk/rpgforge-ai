import { PERSISTED_CHARACTER_SCHEMA_VERSION } from '@rpgforce-ai/shared';
import type { CharacterFormData } from './character-state';
import { breakdownGP, coerceNonNegativeWalletInt, WALLET_COIN_MAX } from './equipment-utils';
import { buildFeatureChoices, featureChoicesToFormData } from './feature-choices';

export { PERSISTED_CHARACTER_SCHEMA_VERSION };

export function isPersistedCharacterSheet(raw: unknown): boolean {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return false;
  return (raw as { schemaVersion?: unknown }).schemaVersion === PERSISTED_CHARACTER_SCHEMA_VERSION;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

// Granted spells are re-derived from their feature on load, so only the user's own picks are stored.
function userPickedSpellsByLevel(
  sb: CharacterFormData['spellsByLevel'] | undefined
): CharacterFormData['spellsByLevel'] {
  const out: CharacterFormData['spellsByLevel'] = {};
  for (const [lvl, rows] of Object.entries(sb ?? {})) {
    const picks = (rows ?? []).filter((r) => !r.granted);
    if (picks.length > 0) out[Number(lvl)] = picks;
  }
  return out;
}

/**
 * Converte o JSON aninhado persistido no formato plano usado pelo editor.
 */
export function flattenPersistedSheet(raw: unknown): Partial<CharacterFormData> {
  const o = asRecord(raw);
  if (!o) return {};
  const out: Partial<CharacterFormData> = {};

  const identity = asRecord(o.identity);
  if (identity) {
    if (typeof identity.name === 'string') out.name = identity.name;
    if (typeof identity.level === 'number') out.level = identity.level;
    if ('raceRuleItemId' in identity) out.raceRuleItemId = identity.raceRuleItemId as string | null;
    if ('classRuleItemId' in identity)
      out.classRuleItemId = identity.classRuleItemId as string | null;
    if ('backgroundRuleItemId' in identity) {
      out.backgroundRuleItemId = identity.backgroundRuleItemId as string | null;
    }
    if (
      identity.abilityScoreMethod === 'standard-array' ||
      identity.abilityScoreMethod === 'point-buy'
    ) {
      out.abilityScoreMethod = identity.abilityScoreMethod;
    }
    const attrs = asRecord(identity.attributes);
    if (attrs) out.attributes = attrs as Record<string, number>;
    const bgASI = asRecord(identity.backgroundAbilityScoreIncrease);
    if (bgASI) out.backgroundAbilityScoreIncrease = bgASI as Record<string, number>;
  }

  const personality = asRecord(o.personality);
  if (personality) {
    if (typeof personality.personality === 'string') out.personality = personality.personality;
    if (typeof personality.ideals === 'string') out.ideals = personality.ideals;
    if (typeof personality.bonds === 'string') out.bonds = personality.bonds;
    if (typeof personality.flaws === 'string') out.flaws = personality.flaws;
  }

  const combat = asRecord(o.combat);
  if (combat) {
    if (typeof combat.currentHp === 'number') out.currentHp = combat.currentHp;
    if (typeof combat.maxHp === 'number') out.maxHp = combat.maxHp;
    if (typeof combat.armorClass === 'string') out.armorClass = combat.armorClass;
    if (typeof combat.initiative === 'string') out.initiative = combat.initiative;
    if (typeof combat.speed === 'string') out.speed = combat.speed;
    if (typeof combat.temporaryHp === 'number') out.temporaryHp = combat.temporaryHp;
    if (typeof combat.deathSaveSuccesses === 'number')
      out.deathSaveSuccesses = combat.deathSaveSuccesses;
    if (typeof combat.deathSaveFailures === 'number')
      out.deathSaveFailures = combat.deathSaveFailures;
    if ('equippedArmorId' in combat) out.equippedArmorId = combat.equippedArmorId as string | null;
    if ('equippedShieldId' in combat)
      out.equippedShieldId = combat.equippedShieldId as string | null;
  }

  const spellcasting = asRecord(o.spellcasting);
  if (spellcasting) {
    if (spellcasting.spellsByLevel && typeof spellcasting.spellsByLevel === 'object') {
      out.spellsByLevel = spellcasting.spellsByLevel as CharacterFormData['spellsByLevel'];
    }
    if (spellcasting.spellSlots && typeof spellcasting.spellSlots === 'object') {
      out.spellSlots = spellcasting.spellSlots as CharacterFormData['spellSlots'];
    }
    if (
      spellcasting.wizardSpellbookByLevel &&
      typeof spellcasting.wizardSpellbookByLevel === 'object'
    ) {
      out.wizardSpellbookByLevel = spellcasting.wizardSpellbookByLevel as Record<number, string[]>;
    }
    if (
      spellcasting.wizardSpellbookByScrollByLevel &&
      typeof spellcasting.wizardSpellbookByScrollByLevel === 'object'
    ) {
      out.wizardSpellbookByScrollByLevel = spellcasting.wizardSpellbookByScrollByLevel as Record<
        number,
        string[]
      >;
    }
  }

  const proficiencies = asRecord((o as { proficiencies?: unknown }).proficiencies);
  if (proficiencies) {
    // saves/skills are persisted as arrays of proficient keys; rebuild the boolean maps the form
    // uses (false entries are filled back in by the derivation, which inits a complete map).
    if (Array.isArray(proficiencies.savingThrows)) {
      const map: Record<string, boolean> = {};
      for (const a of proficiencies.savingThrows) if (typeof a === 'string') map[a] = true;
      out.savingThrows = map;
    }
    if (Array.isArray(proficiencies.skills)) {
      const map: Record<string, boolean> = {};
      for (const k of proficiencies.skills) if (typeof k === 'string') map[k] = true;
      out.skillProficiencies = map;
    }
    // classSkillOptions / backgroundSkillKeys / classSkillProficiencyKeys are intentionally not
    // persisted (only the final skill set is needed).
    // armor/weapons are re-derived from the class/race/background rule items on load — the snapshot
    // is write-only for them, so nothing is restored here.
    if (Array.isArray(proficiencies.languages)) {
      out.standardLanguageNames = (proficiencies.languages as unknown[])
        .map((l) => (l && typeof l === 'object' ? String((l as { name?: unknown }).name ?? '') : ''))
        .filter(Boolean);
    }
    // Tools are stored flat (no "Choose…" slot key); stash them so the derivation step can
    // redistribute the choices back into their slots once the derived proficiencies are known.
    if (Array.isArray(proficiencies.tools)) {
      out.persistedToolProficiencies = (proficiencies.tools as unknown[])
        .filter((t): t is Record<string, unknown> => Boolean(t) && typeof t === 'object')
        .map((t) => ({
          ruleItemId: typeof t.ruleItemId === 'string' ? t.ruleItemId : null,
          name: String(t.name ?? ''),
        }))
        .filter((t) => t.name.trim().length > 0);
    }
  }

  const equipment = asRecord(o.equipment);
  if (equipment) {
    const wallet = asRecord(equipment.wallet);
    if (wallet) {
      const gp = coerceNonNegativeWalletInt(wallet.gold);
      const sp = coerceNonNegativeWalletInt(wallet.silver);
      const cp = coerceNonNegativeWalletInt(wallet.copper);
      out.walletGP = Math.min(WALLET_COIN_MAX, gp);
      out.walletSP = Math.min(WALLET_COIN_MAX, sp);
      out.walletCP = Math.min(WALLET_COIN_MAX, cp);
      // Keep equipmentGold (decimal) so the editor rebuild useEffect can restore a GP line
      // when the sheet is loaded for editing in SheetEditor.
      out.equipmentGold = out.walletGP + out.walletSP * 0.1 + out.walletCP * 0.01;
    }
    const itemsArr = equipment.items;
    if (Array.isArray(itemsArr) && itemsArr.length > 0) {
      const rows: Array<{ id?: string; name?: string; quantity?: number }> = [];
      for (const raw of itemsArr) {
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const e = raw as Record<string, unknown>;
        const quantity =
          typeof e.quantity === 'number' && Number.isFinite(e.quantity)
            ? Math.max(1, Math.trunc(e.quantity))
            : 1;
        if (typeof e.id === 'string' && e.id.trim()) {
          rows.push({ id: e.id.trim(), quantity });
        } else if (typeof e.name === 'string' && e.name.trim()) {
          rows.push({ name: e.name.trim(), quantity });
        }
      }
      if (rows.length > 0) {
        out.equipmentPersistedItems = rows;
        if (typeof equipment.startingEquipmentSelectedIndex === 'number') {
          out.startingEquipmentSelectedIndex = equipment.startingEquipmentSelectedIndex;
        }
        if (typeof equipment.backgroundEquipmentSelectedIndex === 'number') {
          out.backgroundEquipmentSelectedIndex = equipment.backgroundEquipmentSelectedIndex;
        }
      }
    }
  }

  Object.assign(out, featureChoicesToFormData((o as { featureChoices?: unknown }).featureChoices));

  return out;
}

/**
 * Resolved proficiency snapshot persisted under `proficiencies` — the complete set the character is
 * proficient with, computed from rule items at save time (see `buildResolvedProficiencies`).
 */
export interface PersistedProficiencies {
  savingThrows: string[];
  skills: string[];
  armor: string[];
  weapons: string[];
  tools: Array<{ ruleItemId: string | null; name: string }>;
  languages: Array<{ ruleItemId: string | null; name: string }>;
}

/**
 * JSON enviado à API (schemaVersion 1, seções). Texto derivável do pack não entra.
 */
export function toPersistedCharacterPayload(
  data: CharacterFormData,
  proficiencies: PersistedProficiencies,
  equipmentSnapshot?: {
    gold?: number;
    silver?: number;
    copper?: number;
    items: Array<{ id?: string; name?: string; quantity?: number }>;
  }
): Record<string, unknown> {
  // Resolve wallet integers. Creation mode passes decimal `gold`; view mode omits it
  // and we read from data.walletGP/SP/CP populated by flattenPersistedSheet.
  let walletGP: number;
  let walletSP: number;
  let walletCP: number;
  if (equipmentSnapshot?.gold != null) {
    // SheetEditor (creation/edit mode): decimal gold from GP lines in equipment string.
    const breakdown = breakdownGP(equipmentSnapshot.gold);
    walletGP = Math.min(WALLET_COIN_MAX, breakdown.gp);
    walletSP = Math.min(WALLET_COIN_MAX, breakdown.sp);
    walletCP = Math.min(WALLET_COIN_MAX, breakdown.cp);
  } else {
    // SheetSession (view mode): wallet managed as integers, edited directly.
    walletGP = Math.min(WALLET_COIN_MAX, Math.max(0, Math.trunc(data.walletGP ?? 0)));
    walletSP = Math.min(WALLET_COIN_MAX, Math.max(0, Math.trunc(data.walletSP ?? 0)));
    walletCP = Math.min(WALLET_COIN_MAX, Math.max(0, Math.trunc(data.walletCP ?? 0)));
  }
  const equipmentItems =
    equipmentSnapshot?.items ??
    data.equipmentPersistedItems?.filter((r) => Boolean(r.id?.trim()) || Boolean(r.name?.trim())) ??
    [];

  const isNonEmptyObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length > 0;

  const featureChoices = buildFeatureChoices(data);

  const payload: Record<string, unknown> = {
    schemaVersion: PERSISTED_CHARACTER_SCHEMA_VERSION,
    identity: {
      name: data.name?.trim() ?? '',
      level: data.level,
      raceRuleItemId: data.raceRuleItemId,
      classRuleItemId: data.classRuleItemId,
      backgroundRuleItemId: data.backgroundRuleItemId,
      abilityScoreMethod: data.abilityScoreMethod,
      attributes: { ...data.attributes },
      backgroundAbilityScoreIncrease: { ...data.backgroundAbilityScoreIncrease },
    },
    personality: {
      personality: data.personality,
      ideals: data.ideals,
      bonds: data.bonds,
      flaws: data.flaws,
    },
    combat: {
      currentHp: data.currentHp,
      maxHp: data.maxHp,
      armorClass: data.armorClass,
      initiative: data.initiative,
      speed: data.speed,
      temporaryHp: data.temporaryHp,
      deathSaveSuccesses: data.deathSaveSuccesses,
      deathSaveFailures: data.deathSaveFailures,
      equippedArmorId: data.equippedArmorId ?? null,
      equippedShieldId: data.equippedShieldId ?? null,
    },
    // Derived spellcasting math (ability, save DC, attack bonus) is recomputed on render and
    // never persisted. Only the user's picks (spellsByLevel), gameplay slot tracking, and the
    // wizard-only spellbook are stored — the spellbook only when non-empty.
    spellcasting: {
      spellsByLevel: userPickedSpellsByLevel(data.spellsByLevel),
      spellSlots: data.spellSlots,
      ...(isNonEmptyObject(data.wizardSpellbookByLevel) && {
        wizardSpellbookByLevel: { ...data.wizardSpellbookByLevel },
      }),
      ...(isNonEmptyObject(data.wizardSpellbookByScrollByLevel) && {
        wizardSpellbookByScrollByLevel: { ...data.wizardSpellbookByScrollByLevel },
      }),
    },
    proficiencies,
    featureChoices,
    equipment: {
      wallet: { gold: walletGP, silver: walletSP, copper: walletCP },
      items: equipmentItems
        .map((r) => {
          const quantity =
            typeof r.quantity === 'number' && Number.isFinite(r.quantity)
              ? Math.max(1, Math.trunc(r.quantity))
              : 1;
          if (r.id?.trim()) return { id: r.id.trim(), quantity };
          if (r.name?.trim()) return { name: r.name.trim(), quantity };
          return null;
        })
        .filter(
          (x): x is { id: string; quantity: number } | { name: string; quantity: number } =>
            x != null
        ),
      ...(data.startingEquipmentSelectedIndex != null && {
        startingEquipmentSelectedIndex: data.startingEquipmentSelectedIndex,
      }),
      ...(data.backgroundEquipmentSelectedIndex != null && {
        backgroundEquipmentSelectedIndex: data.backgroundEquipmentSelectedIndex,
      }),
    },
  };
  return payload;
}
