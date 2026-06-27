import type { RuleMechanics } from '@rpgforce-ai/shared';

/**
 * Single source of truth mapping SRD features/feats to machine-readable
 * mechanics. When the SRD changes a feature name or a new feature ships,
 * add/adjust ONE entry here and re-run the ingestion — the frontend matches
 * `mechanics.featureKey` first and only falls back to display-name matching.
 *
 * Matching: `sourceKeySuffixes` win (matched against the end of the Open5e
 * `key`, e.g. `srd-2024_rogue_expertise` ends with `_expertise`); `names` are
 * the normalized (lowercased/trimmed) display-name fallbacks.
 */
export interface FeatureMechanicsRule {
  mechanics: RuleMechanics;
  sourceKeySuffixes?: readonly string[];
  names?: readonly string[];
  /** Substring pairs that must all appear in the name (e.g. ['elven','lineage']). */
  nameIncludesAll?: readonly string[][];
}

const rule = (
  featureKey: string,
  extra: Omit<FeatureMechanicsRule, 'mechanics'> & { mechanics?: Omit<RuleMechanics, 'featureKey'> },
): FeatureMechanicsRule => ({
  mechanics: { featureKey, ...(extra.mechanics ?? {}) },
  sourceKeySuffixes: extra.sourceKeySuffixes,
  names: extra.names,
  nameIncludesAll: extra.nameIncludesAll,
});

const FEATURE_MECHANICS_RULES: readonly FeatureMechanicsRule[] = [
  // ── Spellcasting cores ────────────────────────────────────────────────
  rule('spellcasting', {
    sourceKeySuffixes: ['_spellcasting'],
    names: ['spellcasting'],
    mechanics: {
      tables: [
        { name: 'Cantrips', role: 'cantrips' },
        { name: 'Prepared Spells', role: 'prepared' },
      ],
    },
  }),
  rule('pact-magic', {
    sourceKeySuffixes: ['_pact-magic'],
    names: ['pact magic'],
    mechanics: {
      tables: [
        { name: 'Spell Slots', role: 'slots' },
        { name: 'Cantrips', role: 'cantrips' },
        { name: 'Prepared Spells', role: 'prepared' },
      ],
    },
  }),

  // ── Class features with selections ───────────────────────────────────
  rule('expertise', {
    sourceKeySuffixes: ['_expertise'],
    names: ['expertise'],
    mechanics: { choices: [{ featureKey: 'expertise', selectionKind: 'skill', choicesPerGain: 2 }] },
  }),
  rule('metamagic', {
    sourceKeySuffixes: ['_metamagic'],
    names: ['metamagic'],
    mechanics: { choices: [{ featureKey: 'metamagic', selectionKind: 'option', choicesPerGain: 2 }] },
  }),
  rule('eldritch-invocations', {
    sourceKeySuffixes: ['_eldritch-invocations'],
    names: ['eldritch invocations', 'eldritch invocation'],
    mechanics: { choices: [{ featureKey: 'eldritch-invocations', selectionKind: 'option', choicesPerGain: 1 }] },
  }),
  rule('mystic-arcanum', {
    sourceKeySuffixes: ['_mystic-arcanum'],
    names: ['mystic arcanum'],
    mechanics: { choices: [{ featureKey: 'mystic-arcanum', selectionKind: 'spell', choicesPerGain: 1 }] },
  }),
  rule('signature-spells', {
    sourceKeySuffixes: ['_signature-spells'],
    names: ['signature spells'],
    mechanics: { choices: [{ featureKey: 'signature-spells', selectionKind: 'spell', choicesPerGain: 2 }] },
  }),
  rule('spell-mastery', {
    sourceKeySuffixes: ['_spell-mastery'],
    names: ['spell mastery'],
    mechanics: { choices: [{ featureKey: 'spell-mastery', selectionKind: 'spell', choicesPerGain: 2 }] },
  }),
  rule('magical-secrets', {
    sourceKeySuffixes: ['_magical-secrets'],
    names: ['magical secrets'],
    mechanics: { markers: ['extra-spell-lists'] },
  }),
  rule('weapon-mastery', {
    sourceKeySuffixes: ['_weapon-mastery'],
    names: ['weapon mastery'],
    mechanics: { choices: [{ featureKey: 'weapon-mastery', selectionKind: 'item', choicesPerGain: 1 }] },
  }),
  rule('fighting-style', {
    sourceKeySuffixes: ['_fighting-style'],
    names: ['fighting style'],
    mechanics: { choices: [{ featureKey: 'fighting-style', selectionKind: 'feat', choicesPerGain: 1 }] },
  }),
  rule('ability-score-improvement', {
    sourceKeySuffixes: ['_ability-score-improvement'],
    names: ['ability score improvement'],
    mechanics: { choices: [{ featureKey: 'ability-score-improvement', selectionKind: 'ability', choicesPerGain: 1 }] },
  }),
  rule('epic-boon', {
    sourceKeySuffixes: ['_epic-boon'],
    names: ['epic boon'],
    mechanics: { choices: [{ featureKey: 'epic-boon', selectionKind: 'feat', choicesPerGain: 1 }] },
  }),
  rule('primal-knowledge', {
    sourceKeySuffixes: ['_primal-knowledge'],
    names: ['primal knowledge'],
    mechanics: { choices: [{ featureKey: 'primal-knowledge', selectionKind: 'skill', choicesPerGain: 1 }] },
  }),
  rule('scholar', {
    sourceKeySuffixes: ['_scholar'],
    names: ['scholar'],
    mechanics: { choices: [{ featureKey: 'scholar', selectionKind: 'skill', choicesPerGain: 1 }] },
  }),
  rule('deft-explorer', {
    sourceKeySuffixes: ['_deft-explorer'],
    names: ['deft explorer'],
    mechanics: {
      choices: [
        { featureKey: 'deft-explorer', selectionKind: 'skill', choicesPerGain: 1 },
        { featureKey: 'deft-explorer-languages', selectionKind: 'language', choicesPerGain: 2 },
      ],
    },
  }),

  // ── Class features with fixed behavior ───────────────────────────────
  rule('thieves-cant', { sourceKeySuffixes: ['_thieves-cant'], names: ["thieves' cant", 'thieves cant'] }),
  rule('druidic', { sourceKeySuffixes: ['_druidic'], names: ['druidic'] }),
  rule('words-of-creation', { sourceKeySuffixes: ['_words-of-creation'], names: ['words of creation'] }),
  rule('faithful-steed', { sourceKeySuffixes: ['_faithful-steed'], names: ['faithful steed'] }),
  rule('paladins-smite', { sourceKeySuffixes: ['_paladins-smite'], names: ["paladin's smite", 'paladins smite'] }),
  rule('contact-patron', { sourceKeySuffixes: ['_contact-patron'], names: ['contact patron'] }),
  rule('jack-of-all-trades', { sourceKeySuffixes: ['_jack-of-all-trades'], names: ['jack of all trades'] }),
  rule('unarmored-defense', { sourceKeySuffixes: ['_unarmored-defense'], names: ['unarmored defense'] }),
  rule('aura-of-protection', { sourceKeySuffixes: ['_aura-of-protection'], names: ['aura of protection'] }),
  rule('fast-movement', { sourceKeySuffixes: ['_fast-movement'], names: ['fast movement'] }),
  rule('roving', { sourceKeySuffixes: ['_roving'], names: ['roving'] }),
  rule('unarmored-movement', { sourceKeySuffixes: ['_unarmored-movement'], names: ['unarmored movement'] }),
  rule('martial-arts', { sourceKeySuffixes: ['_martial-arts'], names: ['martial arts'] }),
  rule('primal-champion', { sourceKeySuffixes: ['_primal-champion'], names: ['primal champion'] }),
  rule('body-and-mind', { sourceKeySuffixes: ['_body-and-mind'], names: ['body and mind'] }),
  rule('rage', {
    sourceKeySuffixes: ['_rage'],
    names: ['rage'],
    mechanics: { tables: [{ name: 'Rages', role: 'resource' }, { name: 'Rage Damage', role: 'resource' }] },
  }),
  rule('bardic-inspiration', {
    sourceKeySuffixes: ['_bardic-inspiration'],
    names: ['bardic inspiration'],
    mechanics: { tables: [{ name: 'Bardic Die', role: 'resource' }] },
  }),
  rule('font-of-magic', {
    sourceKeySuffixes: ['_font-of-magic'],
    names: ['font of magic'],
    mechanics: { tables: [{ name: 'Sorcery Points', role: 'resource' }] },
  }),

  // ── Race traits ───────────────────────────────────────────────────────
  // Distinct keys per lineage: the frontend resolves different granted spells
  // for each, but all share the `lineage-spellcasting` selection behavior.
  rule('elven-lineage', {
    names: ['elven lineage'],
    nameIncludesAll: [['elven', 'lineage']],
    mechanics: { markers: ['lineage-spellcasting'], choices: [{ featureKey: 'elven-lineage', selectionKind: 'option', choicesPerGain: 1 }] },
  }),
  rule('gnomish-lineage', {
    names: ['gnomish lineage'],
    nameIncludesAll: [['gnomish', 'lineage']],
    mechanics: { markers: ['lineage-spellcasting'], choices: [{ featureKey: 'gnomish-lineage', selectionKind: 'option', choicesPerGain: 1 }] },
  }),
  rule('fiendish-legacy', {
    names: ['fiendish legacy'],
    nameIncludesAll: [['fiendish', 'legacy']],
    mechanics: { markers: ['lineage-spellcasting'], choices: [{ featureKey: 'fiendish-legacy', selectionKind: 'option', choicesPerGain: 1 }] },
  }),
  rule('otherworldly-presence', { names: ['otherworldly presence'] }),
  rule('keen-senses', { names: ['keen senses'] }),
  rule('skillful', { names: ['skillful'] }),

  // ── Feats (top-level FEAT rule items) ─────────────────────────────────
  rule('magic-initiate', {
    sourceKeySuffixes: ['_magic-initiate'],
    names: ['magic initiate'],
    mechanics: { choices: [{ featureKey: 'magic-initiate', selectionKind: 'spell', choicesPerGain: 3 }] },
  }),
  rule('skilled', {
    sourceKeySuffixes: ['_skilled'],
    names: ['skilled'],
    mechanics: { choices: [{ featureKey: 'skilled', selectionKind: 'skill', choicesPerGain: 3 }] },
  }),
  rule('grappler', { sourceKeySuffixes: ['_grappler'], names: ['grappler'] }),
  rule('alert', { sourceKeySuffixes: ['_alert'], names: ['alert'] }),
  rule('versatile', { sourceKeySuffixes: ['_versatile'], names: ['versatile'] }),
];

const normalizeName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/\s+/g, ' ');

export function findMechanicsRule(
  sourceKey: string | null | undefined,
  name: string | null | undefined,
): FeatureMechanicsRule | null {
  const key = (sourceKey ?? '').trim().toLowerCase();
  if (key) {
    for (const r of FEATURE_MECHANICS_RULES) {
      if (r.sourceKeySuffixes?.some((s) => key.endsWith(s))) return r;
    }
  }
  const n = normalizeName(name ?? '');
  if (!n) return null;
  for (const r of FEATURE_MECHANICS_RULES) {
    if (r.names?.includes(n)) return r;
    if (r.nameIncludesAll?.some((parts) => parts.every((p) => n.includes(p)))) return r;
  }
  return null;
}
