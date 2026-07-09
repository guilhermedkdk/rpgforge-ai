import type { RuleItemKind } from '@rpgforce-ai/shared';

type TaggedRuleItemKind = RuleItemKind | 'RULESET' | 'RULE';

/**
 * Derives tag keys from a rule item's raw/normalized data for filtering.
 * Tag format: "kind:category:value" (e.g. spell:level:3, spell:school:evocation).
 */
export function deriveTagKeys(kind: TaggedRuleItemKind, raw: Record<string, unknown>): string[] {
  const keys: string[] = [];

  switch (kind) {
    case 'SPELL': {
      const level = raw.level as number | undefined;
      if (typeof level === 'number') keys.push(`spell:level:${level}`);
      const school = (raw.school as { key?: string })?.key ?? (raw.school as string);
      if (school) keys.push(`spell:school:${String(school).toLowerCase()}`);
      if (raw.ritual === true) keys.push('spell:ritual');
      if (raw.concentration === true) keys.push('spell:concentration');
      const damageTypes = raw.damage_types as string[] | undefined;
      if (Array.isArray(damageTypes)) {
        for (const d of damageTypes) if (d) keys.push(`spell:damage:${String(d).toLowerCase()}`);
      }
      const save = raw.saving_throw_ability as string | undefined;
      if (save) keys.push(`spell:save:${String(save).toLowerCase()}`);
      // Class availability (Open5e `classes: [{ name, key }]`) — lets the web slice per-class spell
      // lists from the full catalog instead of one request per class.
      const spellClasses = raw.classes as Array<{ name?: string }> | undefined;
      if (Array.isArray(spellClasses)) {
        for (const c of spellClasses) {
          const cn = c?.name?.trim();
          if (cn) keys.push(`spell:class:${cn.toLowerCase().replace(/\s+/g, '-')}`);
        }
      }
      break;
    }
    case 'ITEM': {
      const category = raw.category as { key?: string; name?: string } | string | undefined;
      let categoryKey = '';
      if (category && typeof category === 'object') {
        categoryKey = (category.key ?? '').toLowerCase();
        if (!categoryKey && category.name)
          categoryKey = category.name.toLowerCase().replace(/\s+/g, '-');
      } else if (typeof category === 'string' && category) {
        categoryKey = category.toLowerCase().replace(/\s+/g, '-');
      }
      if (categoryKey) keys.push(`item:category:${categoryKey}`);

      // --- tools subcategory from name (e.g. "Gaming Set, Dice" → gaming-set, "Musical Instrument, Flute" → musical-instrument) ---
      if (categoryKey === 'tools') {
        const name = (raw.name as string) ?? '';
        const nameNorm = name.trim();
        const nameLower = nameNorm.toLowerCase();
        if (nameLower.startsWith('gaming set')) {
          keys.push('item:category:gaming-set');
        } else if (nameLower.startsWith('musical instrument')) {
          keys.push('item:category:musical-instrument');
        }
      }

      const rarity = raw.rarity as { key?: string; name?: string } | string | undefined;
      let rarityKey = '';
      if (rarity && typeof rarity === 'object') {
        rarityKey = (rarity.key ?? rarity.name ?? '').toLowerCase().replace(/\s+/g, '-');
      } else if (typeof rarity === 'string' && rarity) {
        rarityKey = rarity.toLowerCase().replace(/\s+/g, '-');
      }
      if (rarityKey) keys.push(`item:rarity:${rarityKey}`);

      // --- boolean flags (yes/no): use presence of weapon/armor object, not category ---
      // Acid has category "Weapon" but weapon: null; only Battleaxe has weapon: { ... }.
      const weaponObj = raw.weapon as Record<string, unknown> | null | undefined;
      const armorObj = raw.armor as Record<string, unknown> | null | undefined;
      const isWeapon =
        raw.is_weapon === true || (weaponObj != null && typeof weaponObj === 'object');
      const isArmor = raw.is_armor === true || (armorObj != null && typeof armorObj === 'object');
      // Open5e has no `is_magic_item` flag; magic items are the ones with a `rarity` (mundane
      // items never have it), sourced only from the /magicitems/ endpoint.
      const isMagic = raw.is_magic_item === true || raw.rarity != null;

      keys.push(`item:weapon:${isWeapon ? 'yes' : 'no'}`);
      keys.push(`item:armor:${isArmor ? 'yes' : 'no'}`);
      keys.push(`item:magic:${isMagic ? 'yes' : 'no'}`);

      // --- weapon-specific sub-tags: only when weapon object exists; read is_simple/is_martial from weapon ---
      if (isWeapon && weaponObj) {
        const isSimple = weaponObj.is_simple === true;
        const isMartial = weaponObj.is_martial === true;
        if (isSimple) keys.push('weapon:type:simple');
        else if (isMartial) keys.push('weapon:type:martial');
        const props =
          (weaponObj.properties as Array<{ property?: { name?: string } }>) ??
          (raw.properties as Array<{ property?: { name?: string } }>);
        if (Array.isArray(props)) {
          for (const p of props) {
            const name = p?.property?.name;
            if (name)
              keys.push(`weapon:property:${String(name).toLowerCase().replace(/\s+/g, '-')}`);
          }
        }
        if (weaponObj.is_finesse === true || raw.is_finesse === true)
          keys.push('weapon:property:finesse');
        if (weaponObj.is_thrown === true || raw.is_thrown === true)
          keys.push('weapon:property:thrown');
        if (weaponObj.is_two_handed === true || raw.is_two_handed === true)
          keys.push('weapon:property:two-handed');
        if (weaponObj.is_versatile === true || raw.is_versatile === true)
          keys.push('weapon:property:versatile');
        if (weaponObj.is_light === true || raw.is_light === true)
          keys.push('weapon:property:light');
      }
      break;
    }
    case 'FEAT': {
      keys.push('feat');

      const featType = (raw.type as string | undefined)?.trim();
      if (featType) {
        const typeKey = featType.toLowerCase().replace(/\s+/g, '-');
        keys.push(`feat:type:${typeKey}`);
      }

      const hasPrerequisite =
        raw.has_prerequisite === true ||
        (typeof raw.prerequisite === 'string' && raw.prerequisite.trim().length > 0);
      if (hasPrerequisite) {
        keys.push('feat:has-prerequisite');
      }
      break;
    }
    case 'CLASS':
      keys.push('class');
      break;
    case 'SUBCLASS':
      keys.push('subclass');
      break;
    case 'CLASS_FEATURE':
      keys.push('class-feature');
      break;
    case 'BACKGROUND':
      keys.push('background');
      break;
    case 'RULESET': {
      keys.push('ruleset');
      const key = raw.key as string | undefined;
      if (key) keys.push(`ruleset:key:${key}`);
      break;
    }
    case 'RULE': {
      keys.push('rule');
      const rulesetKey = raw.rulesetKey as string | undefined;
      if (rulesetKey) keys.push(`rule:ruleset:${rulesetKey}`);
      const index = raw.index as number | undefined;
      if (typeof index === 'number') keys.push(`rule:index:${index}`);
      break;
    }
    case 'OTHER': {
      // Languages (packages/shared-independent SRD 5.2 list, see synthetic-items.ts) are
      // distinguished by `languageRarity`; anything else falls back to a bare "other" tag.
      const languageRarity = raw.languageRarity as string | undefined;
      if (languageRarity) {
        keys.push('language');
        keys.push(`language:rarity:${languageRarity}`);
      } else {
        keys.push('other');
      }
      break;
    }
    default:
      keys.push(kind.toLowerCase());
  }

  return keys;
}
