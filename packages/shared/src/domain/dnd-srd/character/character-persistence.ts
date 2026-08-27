import { PERSISTED_CHARACTER_SCHEMA_VERSION } from '../../../schemas/character-sheet-data';
import type { CharacterFormData, ClassEntry, EquipmentSource } from './character-form-data';
import { realClassEntries, totalClassLevel } from './class-entries';
import { breakdownGP, coerceNonNegativeWalletInt, WALLET_COIN_MAX } from '../equipment/wallet';
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
 * Reads `identity.classes`, synthesizing it from the singular mirrors for sheets saved before
 * multiclass support. Display names are left blank: the derivation resolves them from the pack.
 */
function readPersistedClasses(identity: Record<string, unknown>): ClassEntry[] {
  const raw = Array.isArray(identity.classes) ? identity.classes : [];
  const entries: ClassEntry[] = [];
  for (const item of raw) {
    const rec = asRecord(item);
    const classRuleItemId = typeof rec?.classRuleItemId === 'string' ? rec.classRuleItemId : '';
    if (!classRuleItemId) continue;
    entries.push({
      classRuleItemId,
      className: '',
      subclassRuleItemId:
        typeof rec?.subclassRuleItemId === 'string' ? rec.subclassRuleItemId : null,
      subclass: '',
      level: typeof rec?.level === 'number' ? Math.max(1, Math.min(20, rec.level)) : 1,
    });
  }
  if (entries.length > 0) return entries;

  const legacyClassId =
    typeof identity.classRuleItemId === 'string' ? identity.classRuleItemId : '';
  if (!legacyClassId) return [];
  return [
    {
      classRuleItemId: legacyClassId,
      className: '',
      subclassRuleItemId:
        typeof identity.subclassRuleItemId === 'string' ? identity.subclassRuleItemId : null,
      subclass: '',
      level: typeof identity.level === 'number' ? Math.max(1, Math.min(20, identity.level)) : 1,
    },
  ];
}

/**
 * Flattens the persisted nested JSON into the flat shape the editor uses.
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
    if ('subclassRuleItemId' in identity)
      out.subclassRuleItemId = identity.subclassRuleItemId as string | null;
    out.classes = readPersistedClasses(identity);
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
    const pactSlots = asRecord(spellcasting.pactMagicSlots);
    if (pactSlots) out.pactMagicSlots = pactSlots as CharacterFormData['pactMagicSlots'];
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
      const rows: Array<{
        id?: string;
        name?: string;
        quantity?: number;
        source?: EquipmentSource;
      }> = [];
      for (const raw of itemsArr) {
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const e = raw as Record<string, unknown>;
        const quantity =
          typeof e.quantity === 'number' && Number.isFinite(e.quantity)
            ? Math.max(1, Math.trunc(e.quantity))
            : 1;
        const source =
          e.source === 'class' || e.source === 'background' || e.source === 'manual'
            ? (e.source as EquipmentSource)
            : undefined;
        if (typeof e.id === 'string' && e.id.trim()) {
          rows.push({ id: e.id.trim(), quantity, source });
        } else if (typeof e.name === 'string' && e.name.trim()) {
          rows.push({ name: e.name.trim(), quantity, source });
        }
      }
      if (rows.length > 0) out.equipmentPersistedItems = rows;
    }
    // Restored regardless of the item list: the "take the gold" bundle option is a real choice that
    // yields no items, and dropping its index reads back as "nothing chosen" (save validation then
    // rejects a complete sheet).
    const goldBySource = asRecord(equipment.goldBySource);
    if (goldBySource) {
      const cls = coerceNonNegativeWalletInt(goldBySource.class);
      const bg = coerceNonNegativeWalletInt(goldBySource.background);
      if (cls > 0 || bg > 0) out.equipmentGoldBySource = { class: cls, background: bg };
    }
    if (typeof equipment.startingEquipmentSelectedIndex === 'number') {
      out.startingEquipmentSelectedIndex = equipment.startingEquipmentSelectedIndex;
    }
    if (typeof equipment.backgroundEquipmentSelectedIndex === 'number') {
      out.backgroundEquipmentSelectedIndex = equipment.backgroundEquipmentSelectedIndex;
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
 * JSON sent to the API (schemaVersion 1, sections). Text derivable from the pack is excluded.
 */
export function toPersistedCharacterPayload(
  data: CharacterFormData,
  proficiencies: PersistedProficiencies,
  equipmentSnapshot?: {
    gold?: number;
    silver?: number;
    copper?: number;
    items: Array<{ id?: string; name?: string; quantity?: number; source?: EquipmentSource }>;
    /** Starting gold per bundle, so a reload can put each amount back in its own block. */
    goldBySource?: { class?: number; background?: number };
  }
): Record<string, unknown> {
  // Resolve wallet integers. Creation mode passes decimal `gold`; play mode omits it
  // and we read from data.walletGP/SP/CP populated by flattenPersistedSheet.
  let walletGP: number;
  let walletSP: number;
  let walletCP: number;
  if (equipmentSnapshot?.gold != null) {
    // Creation: decimal gold from the GP lines in the equipment string.
    const breakdown = breakdownGP(equipmentSnapshot.gold);
    walletGP = Math.min(WALLET_COIN_MAX, breakdown.gp);
    walletSP = Math.min(WALLET_COIN_MAX, breakdown.sp);
    walletCP = Math.min(WALLET_COIN_MAX, breakdown.cp);
  } else {
    // Play (saved sheet): wallet managed as integers, edited directly.
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

  const classEntries = realClassEntries(data);
  // Written only for a real multiclass: a single-class sheet stays byte-identical to pre-multiclass
  // saves, and `readPersistedClasses` rebuilds the array from the mirrors on load.
  const persistedClasses =
    classEntries.length > 1
      ? classEntries.map((c) => ({
          classRuleItemId: c.classRuleItemId,
          subclassRuleItemId: c.subclassRuleItemId ?? null,
          level: c.level,
        }))
      : null;

  const payload: Record<string, unknown> = {
    schemaVersion: PERSISTED_CHARACTER_SCHEMA_VERSION,
    identity: {
      name: data.name?.trim() ?? '',
      level: classEntries.length > 0 ? totalClassLevel(classEntries) : data.level,
      raceRuleItemId: data.raceRuleItemId,
      classRuleItemId: data.classRuleItemId,
      subclassRuleItemId: data.subclassRuleItemId ?? null,
      ...(persistedClasses ? { classes: persistedClasses } : {}),
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
      ...(data.pactMagicSlots ? { pactMagicSlots: { ...data.pactMagicSlots } } : {}),
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
          // Recorded, never re-inferred: the reload puts the item back in the block it came from.
          const source = r.source ? { source: r.source } : {};
          if (r.id?.trim()) return { id: r.id.trim(), quantity, ...source };
          if (r.name?.trim()) return { name: r.name.trim(), quantity, ...source };
          return null;
        })
        .filter((x): x is NonNullable<typeof x> => x != null),
      ...(() => {
        const g = equipmentSnapshot?.goldBySource ?? data.equipmentGoldBySource;
        const cls = Math.max(0, Math.trunc(g?.class ?? 0));
        const bg = Math.max(0, Math.trunc(g?.background ?? 0));
        return cls > 0 || bg > 0 ? { goldBySource: { class: cls, background: bg } } : {};
      })(),
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
