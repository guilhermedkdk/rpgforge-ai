/**
 * Deriva campos da ficha (hitDice, speed, proficiencies, features, savingThrows)
 * a partir da coluna normalized dos rule items de classe, raça e antecedente.
 * Usado na criação manual para preencher e travar esses campos.
 */
import {
  hitDieMaxFromNotation,
  maxHpForLevel,
  proficiencyBonusForLevel,
  type RuleItemResponse,
} from '@rpgforce-ai/shared';
import type { AbilityScoreImprovementGainChoice, CharacterFormData, MagicInitiateGain, MagicInitiateSpellList } from './character-state';
import {
  columnKeySlug,
  columnSlug,
  extractColumnReferences,
} from './feature-column-tables';
import {
  buildMiAsiKey,
  buildMiEldritchKey,
  buildMiFdKey,
  canApplyAbilityScoreImprovementASI,
  DIVINE_ORDER_DISPLAY_NAME,
  PRIMAL_ORDER_DISPLAY_NAME,
  DND_ATTRIBUTES,
  getDefaultSavingThrows,
  getEffectiveEpicBoonAbilityScore,
  getEffectiveModifier,
  getFightingStyleCantripGrant,
  getPrimalChampionBodyAndMindBonusFlags,
  getTotalAbilityScoreImprovementFromGains,
  isSkilledFeatureName,
  isSkillFromNonSkilledSource,
  isThievesCantFeatureName,
  isUnarmoredMovementFeatureName,
  MAGIC_INITIATE_SPELL_LISTS,
  maxAsiBonusForAttribute,
  MI_VERSATILE_KEY,
  sumIncreaseScoresInGain,
} from './character-state';
import {
  areStartingEquipmentParsedOptionsEquivalent,
  getEquipmentWithoutSource,
  normalizeStartingEquipmentOptionTextForCompare,
  splitEquipmentBySource,
} from './equipment-utils';
import { reconcileFeatPrerequisites } from './feat-prerequisites';
import {
  pruneEldritchInvocationSelections,
  type EldritchInvocationSelection,
} from './eldritch-invocations';
import { getEldritchInvocationsKnown } from './spellcasting-limits';


function parseSpeedToNumber(speed: string | undefined): number {
  if (!speed || typeof speed !== 'string') return 0;
  const match = speed.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

function normalizeHitDice(text: string | undefined): string {
  if (!text || typeof text !== 'string') return '';
  const match = text.match(/(\d+)\s*[dD]\s*(\d+)/);
  return match ? `${match[1].toLowerCase()}d${match[2]}` : text.trim();
}

/**
 * Extrai pares label/valor de texto em formato de tabela (|Label|Value|)
 * para obter Skill Proficiencies, Weapon Proficiencies, Armor Training do core traits.
 */
function parseTableLikeToMap(text: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!text?.trim()) return out;
  const lines = text
    .replace(/^\s*\|\|\|?\s*\n?/, '')
    .trim()
    .split(/\n/);
  for (const line of lines) {
    if (!line.includes('|')) continue;
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 2) continue;
    if (cells.every((c) => /^-+$/.test(c))) continue;
    const label = cells[0];
    const value = cells.slice(1).join(' — ').trim();
    if (label && value) out[label] = value;
  }
  return out;
}

/**
 * Merges proficiency lines that share the same label (e.g. "Tool Proficiencies"
 * from class and background) into a single line with combined values.
 */
function mergeProficiencyLines(parts: string[]): string[] {
  const byLabel = new Map<string, string[]>();
  const order: string[] = [];
  for (const line of parts) {
    const idx = line.indexOf(': ');
    if (idx === -1) continue;
    const label = line.slice(0, idx).trim();
    const value = line.slice(idx + 2).trim();
    if (!value) continue;
    if (!byLabel.has(label)) {
      byLabel.set(label, []);
      order.push(label);
    }
    byLabel.get(label)!.push(value);
  }
  return order.map((label) => {
    const values = byLabel.get(label)!;
    return `${label}: ${values.join(', ')}`;
  });
}

/**
 * Proficiencies granted by feature-option choices (not class defaults), merged on top of the
 * class/race/background proficiencies. Cleric Divine Order → Protector grants Martial weapons +
 * Heavy armor; Druid Primal Order → Warden grants Martial weapons + Medium armor.
 *
 * Applied at read time (see `getEffectiveProficiencies`) rather than baked into `data.proficiencies`:
 * the full derivation does not re-run when a `raceTraitSelections` option is toggled, so the only
 * way for the change to be reactive is to keep `data.proficiencies` as the pure class base and layer
 * the option grants on top wherever the string is consumed. Idempotent because the base never
 * contains the option-granted entries (Divine Order is Cleric-only; Cleric lacks Martial/Heavy).
 */
function applyOptionGrantedProficiencies(
  proficiencies: string,
  raceTraitSelections: Record<string, string> | undefined,
): string {
  const extra: string[] = [];
  if (raceTraitSelections?.[DIVINE_ORDER_DISPLAY_NAME] === 'protector') {
    extra.push('Weapon Proficiencies: Martial weapons');
    extra.push('Armor Training: Heavy armor');
  }
  if (raceTraitSelections?.[PRIMAL_ORDER_DISPLAY_NAME] === 'warden') {
    extra.push('Weapon Proficiencies: Martial weapons');
    extra.push('Armor Training: Medium armor');
  }
  if (extra.length === 0) return proficiencies;
  const baseParts = proficiencies ? proficiencies.split('\n') : [];
  return mergeProficiencyLines([...baseParts, ...extra]).join('\n');
}

/**
 * The character's proficiencies string with feature-option grants (e.g. Divine Order → Protector)
 * layered on. Single source of truth for every consumer of the proficiencies string so the option
 * grants stay reactive and consistent across display, attacks and armor checks.
 */
export function getEffectiveProficiencies(data: CharacterFormData): string {
  return applyOptionGrantedProficiencies(data.proficiencies ?? '', data.raceTraitSelections);
}

function toolChooseKeyStillReferencedInDerived(derivedBlob: string, segmentKey: string): boolean {
  const raw = derivedBlob ?? '';
  if (!segmentKey.trim()) return false;
  if (raw.includes(segmentKey)) return true;
  const want = normalizeStartingEquipmentOptionTextForCompare(segmentKey);
  if (!want) return false;
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const labelPart = line.slice(0, colonIdx).trim().toLowerCase();
    if (!labelPart.includes('tool')) continue;
    const valuePart = line.slice(colonIdx + 1).trim();
    if (!valuePart) continue;
    const segments = valuePart
      .split(/\s*,\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const segment of segments) {
      if (normalizeStartingEquipmentOptionTextForCompare(segment) === want) return true;
    }
  }
  return false;
}

export interface FeatureDetail {
  name: string;
  desc: string;
  /** Origem da habilidade/traço: classe, raça ou antecedente. */
  source?: 'class' | 'race' | 'background';
  /** Sub-opções selecionáveis (ex.: Elven Lineage → Drow / High Elf / Wood Elf). */
  options?: Array<{
    key: string;
    label: string;
    desc?: string;
    cost?: string;
    /** Eldritch Invocation / similar — raw prerequisite text from source. */
    prerequisite?: string;
  }>;
  /**
   * Dados de tabela(s) por nível associados à feature (ex.: Weapon Mastery, Rages, Rage Damage).
   * Uma feature pode ter uma ou mais tabelas (e.g. Rage tem "Rages" e "Rage Damage").
   */
  tableData?: Array<{
    label: string;
    rows: Array<{ level: number; value: string }>;
  }>;
  /**
   * Quantas vezes esta feature foi ganha até o nível atual do personagem.
   * Ex.: Metamagic tem gainedAt [2, 10, 17] → gainCount=1 no nível 5, gainCount=2 no nível 10, gainCount=3 no nível 17.
   */
  gainCount?: number;
  /**
   * Níveis em que cada ganho ocorreu (≤ nível atual), na mesma ordem dos slots cumulativos.
   * Útil para ASI: uma “página” por nível de ganho.
   */
  gainedAtLevels?: number[];
  /**
   * Texto por ganho (ex. `gainedAt[].detail` da API), alinhado a `gainedAtLevels` — ex.: Mystic Arcanum "level 6 spell".
   */
  gainedAtDetails?: string[];
}

/** Bônus de atributo do antecedente: total de pontos, teto por atributo e lista de atributos permitidos. */
export interface BackgroundAbilityScoreOption {
  totalPoints: number;
  maxPerAbility: number;
  /** Nomes canônicos dos atributos que podem receber bônus (ex.: ['Constitution', 'Intelligence', 'Wisdom']). Se vazio, todos os 6 são permitidos. */
  allowedAbilityNames: string[];
}

function parseAllowedAbilityNamesFromDesc(desc: string): string[] {
  if (!desc || typeof desc !== 'string') return [];
  const parts = desc
    .split(/\s*,\s*|\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const allowed: string[] = [];
  const canonicalLower = new Map(DND_ATTRIBUTES.map((a) => [a.toLowerCase(), a]));
  for (const part of parts) {
    const canonical = canonicalLower.get(part.toLowerCase());
    if (canonical && !allowed.includes(canonical)) allowed.push(canonical);
  }
  return allowed;
}

export interface DerivedCharacterStats {
  hitDice: string;
  speed: number;
  proficiencies: string;
  features: string;
  featureDetails: FeatureDetail[];
  savingThrows: Record<string, boolean>;
  /** Skill keys (e.g. athletics, insight) marcados como proficientes pelo antecedente. */
  skillProficiencies: Record<string, boolean>;
  /** Perícias que a classe permite escolher (para popover); chooseN = quantas escolher. */
  classSkillOptions: { keys: string[]; chooseN: number | null };
  /** Opções de equipamento inicial da classe (label vindo dos dados, ex. "Starting Equipment"). */
  startingEquipmentOptions: { label: string; options: { label: string; text: string }[] } | null;
  /** Opções de equipamento do antecedente (label vindo dos dados, ex. "Equipment"). */
  backgroundEquipmentOptions: { label: string; options: { label: string; text: string }[] } | null;
  /** Se o antecedente concede bônus de atributo (ex.: +3 pontos, máx +2 por atributo). */
  backgroundAbilityScoreOption: BackgroundAbilityScoreOption | null;
}

function skillNameToKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Extrai da string de Skill Proficiencies (ex.: "Choose 2: Athletics, Insight, or Religion")
 * a lista de keys e quantas escolher (chooseN). Retorna { keys, chooseN }.
 * "Choose any N skills" -> keys = [] e chooseN = N (qualquer perícia).
 */
function parseSkillProficienciesText(text: string | undefined): {
  keys: string[];
  chooseN: number | null;
} {
  if (!text || typeof text !== 'string') return { keys: [], chooseN: null };
  const anyMatch = text.match(/choose\s+any\s+(\d+)\s+skills?/i);
  if (anyMatch) {
    return { keys: [], chooseN: parseInt(anyMatch[1], 10) };
  }
  const chooseMatch = text.match(/choose\s+(\d+)/i);
  const chooseN = chooseMatch ? parseInt(chooseMatch[1], 10) : null;
  const afterColon = text.includes(':') ? text.split(':').slice(1).join(':').trim() : text;
  const rawNames = afterColon
    .split(/\s*,\s*|\s+or\s+|\s+and\s+/i)
    .map((s) =>
      s
        .trim()
        .replace(/^(or|and)\s+/i, '')
        .trim()
    )
    .filter(Boolean);
  const keys = rawNames.map(skillNameToKey).filter(Boolean);
  return { keys, chooseN };
}

function parseKeenSensesSkillOptions(desc: string): Array<{ key: string; label: string }> {
  if (!desc?.trim()) return [];
  const m = desc.match(/proficiency in\s+(?:the\s+)?(.+?)\s+skills?\b/i);
  if (!m) return [];
  const { keys } = parseSkillProficienciesText(`Choose one: ${m[1].trim()}`);
  if (keys.length === 0) return [];
  return keys.map((key) => ({
    key,
    label: key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  }));
}

/**
 * Extrai opções de Starting Equipment nos formatos:
 * - "Choose A or B: (A) ...; or (B) ..."
 * - "*Choose A or B:* (A) ...; or (B) ..." (markdown no início)
 * - "Choose A, B, or C: (A) ...; (B) ...; or (C) ..."
 * Retorna array de { label, text } (ex.: [{ label: 'A', text: '...' }, { label: 'B', text: '...' }]).
 */
function parseStartingEquipmentOptions(
  text: string | undefined
): { label: string; text: string }[] {
  if (!text || typeof text !== 'string') return [];
  let trimmed = text.trim();
  trimmed = trimmed
    .replace(/^\s*\*+/, '')
    .replace(/\*+\s*$/, '')
    .trim();
  const afterColon = trimmed.includes(':') ? trimmed.split(':').slice(1).join(':').trim() : trimmed;
  const afterColonClean = afterColon.replace(/^\s*\*+/, '').trim();
  if (!afterColonClean) return [];
  const parts = afterColonClean
    .split(/\s*;\s*/)
    .map((p) =>
      p
        .replace(/^\s*or\s+/i, '')
        .replace(/^\s*\*+/, '')
        .trim()
    )
    .filter(Boolean);
  const options: { label: string; text: string }[] = [];
  for (const part of parts) {
    const match = part.match(/^\s*\(([A-Za-z])\)\s*([\s\S]+)$/);
    if (match) {
      options.push({ label: match[1].toUpperCase(), text: match[2].trim() });
    }
  }
  return options;
}

function getGainedAtLevels(f: { gained_at?: unknown }): number[] {
  const gainedAt = f.gained_at;
  if (!gainedAt) return [];
  if (!Array.isArray(gainedAt)) return [];
  const levels: number[] = [];
  for (const x of gainedAt) {
    if (typeof x === 'number') levels.push(x);
    else if (x && typeof x === 'object' && 'level' in x)
      levels.push(Number((x as { level?: number }).level));
  }
  return levels;
}

/**
 * Recovers extra "gained again" levels from a feature's description. Open5e's structured `gained_at`
 * is sometimes incomplete — e.g. Bard Expertise has `gained_at: [2]` while the text says "At Bard
 * level 9, you gain Expertise in two more". Anchoring on "you gain <this feature>" keeps it to real
 * re-gains of the same feature (never a different benefit granted at that level).
 */
function parseRepeatGainLevelsFromDesc(desc: string, featureName: string): number[] {
  const name = featureName.trim();
  if (!desc || name.length < 2) return [];
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `\\bat\\s+(?:[a-z]+\\s+)?level\\s+(\\d+)\\s*,?\\s+you\\s+gain\\s+${escaped}\\b`,
    'gi'
  );
  const levels: number[] = [];
  for (const m of desc.matchAll(re)) {
    const lvl = Number(m[1]);
    if (Number.isFinite(lvl) && lvl > 0) levels.push(lvl);
  }
  return levels;
}

function getGainedAtEntriesAtOrBefore(
  gainedAt: unknown,
  currentLevel: number
): Array<{ level: number; detail?: string }> {
  if (!Array.isArray(gainedAt)) return [];
  const entries: Array<{ level: number; detail?: string }> = [];
  for (const x of gainedAt) {
    if (typeof x === 'number') {
      if (x <= currentLevel) entries.push({ level: x });
    } else if (x && typeof x === 'object' && 'level' in x) {
      const level = Number((x as { level?: number }).level);
      if (!Number.isFinite(level) || level > currentLevel) continue;
      const detailRaw = (x as { detail?: unknown }).detail;
      const detail = typeof detailRaw === 'string' ? detailRaw : undefined;
      entries.push({ level, detail });
    }
  }
  return entries.sort((a, b) => a.level - b.level);
}

function getFeatDescription(feat: RuleItemResponse): string {
  if (feat.contentMd?.trim()) return feat.contentMd.trim();
  const raw = (feat.raw ?? {}) as Record<string, unknown>;
  const benefits = raw.benefits as Array<{ desc?: string }> | undefined;
  if (Array.isArray(benefits) && benefits.length > 0) {
    return benefits
      .map((b) => (b.desc ?? '').trim())
      .filter(Boolean)
      .join('\n\n');
  }
  const d = raw.desc as string | undefined;
  return typeof d === 'string' ? d.trim() : '';
}

/** Keywords no nome de um traço que indicam que ele possui sub-opções selecionáveis. */
const SELECTABLE_TRAIT_KEYWORDS = ['lineage', 'ancestry', 'legacy'];

function isSelectableTrait(name: string): boolean {
  const lower = name.toLowerCase();
  return SELECTABLE_TRAIT_KEYWORDS.some((k) => lower.includes(k));
}

/**
 * Extrai opções de um traço em formato de tabela markdown.
 * Retorna a primeira coluna de cada linha de dados (ignora header e separador).
 */
function parseTableTraitOptions(desc: string): Array<{ key: string; label: string }> {
  const lines = desc.split('\n');
  const options: { key: string; label: string }[] = [];
  let tableStarted = false;
  let headerSkipped = false;
  let separatorSkipped = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      if (tableStarted && options.length > 0) break;
      tableStarted = false;
      headerSkipped = false;
      separatorSkipped = false;
      continue;
    }
    tableStarted = true;
    if (!headerSkipped) {
      headerSkipped = true;
      continue;
    }
    const cells = trimmed
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean);
    if (!separatorSkipped) {
      if (cells.every((c) => /^:?-+:?$/.test(c))) {
        separatorSkipped = true;
        continue;
      }
      separatorSkipped = true;
    }
    if (cells.length > 0) {
      const label = cells[0];
      if (label && !/^:?-+:?$/.test(label)) {
        options.push({ key: label.toLowerCase().replace(/\s+/g, '-'), label });
      }
    }
  }
  return options;
}

/**
 * Extrai opções de um traço em formato de parágrafos.
 * Suporta:
 * - Markdown bold: "**Forest Gnome.**" ou "**Cloud's Jaunt (Cloud Giant)**." (Gnome, Goliath)
 * - Texto simples: "Name (Subtype). Description" ou "Name. Description"
 */
function parseParagraphTraitOptions(desc: string): Array<{ key: string; label: string }> {
  // Markdown bullet list of options, e.g. Goliath's Giant Ancestry:
  //   "- **Cloud's Jaunt (Cloud Giant)**. ...\n- **Fire's Burn (Fire Giant)**. ..."
  // The bullets share single newlines, so the paragraph split below keeps them in one block and the
  // leading "- " hides the bold label — parse the bulleted labels directly first.
  const bulletOptions: { key: string; label: string }[] = [];
  for (const m of desc.matchAll(/^[ \t]*[-*][ \t]+\*\*([^*]+)\*\*/gm)) {
    const label = m[1].replace(/\.\s*$/, '').trim();
    if (label.length >= 2 && label.length <= 70) {
      bulletOptions.push({ key: label.toLowerCase().replace(/['\s]+/g, '-'), label });
    }
  }
  if (bulletOptions.length >= 2) return bulletOptions;

  const INTRO_PREFIXES = [
    'you are',
    'you have',
    'you gain',
    'choose',
    'your ',
    'when ',
    'once ',
    'this ',
    'as a ',
    'at level',
    'the following',
    'intelligence',
    'each of',
    'in addition',
    'starting at',
    'whichever',
  ];
  const paragraphs = desc.split(/\n\n+/);
  const options: { key: string; label: string }[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (INTRO_PREFIXES.some((p) => lower.startsWith(p))) continue;
    // Parágrafos introdutórios que explicam que você escolhe entre opções,
    // como "Divine power infuses you in battle. You gain one of the following options..."
    // não devem ser tratados como opções em si.
    if (lower.includes('one of the following options')) continue;

    // 1) Formato bold markdown: **Name** ou **Name (Subtype)**.
    const boldMatch = trimmed.match(/^\s*\*\*([^*]+)\*\*/);
    if (boldMatch) {
      const label = boldMatch[1].replace(/\.\s*$/, '').trim();
      if (label.length >= 2 && label.length <= 70) {
        options.push({ key: label.toLowerCase().replace(/['\s]+/g, '-'), label });
      }
      continue;
    }

    // 2) Formato texto simples: "Name (Subtype). Description" ou "Name. Description"
    const plainMatch = trimmed.match(
      /^([A-Z][A-Za-z'\-\s]{1,55}?)(?:\s*\([^)]{1,50}\))?\.\s+[A-Z]/
    );
    if (plainMatch) {
      const label = plainMatch[1].trim();
      if (label.length >= 2 && label.length <= 60 && label.split(' ').length <= 8) {
        options.push({ key: label.toLowerCase().replace(/['\s]+/g, '-'), label });
      }
    }
  }
  return options;
}

/** Detecta e retorna as sub-opções selecionáveis de um traço (tabela ou parágrafo). */
function parseTraitOptions(desc: string): Array<{ key: string; label: string }> {
  const tableOpts = parseTableTraitOptions(desc);
  if (tableOpts.length >= 2) return tableOpts;
  return parseParagraphTraitOptions(desc);
}

/**
 * ### headings and plain-title blocks before *Cost* / *Prerequisite* (CLASS_FEATURE_OPTION_LIST text).
 */
function collectOptionListBlocks(desc: string): Map<string, { label: string; block: string }> {
  if (!desc?.trim()) return new Map();
  const normalizeKey = (labelRaw: string) =>
    labelRaw
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .replace(/[^\w\s-]/g, '');
  const byNorm = new Map<string, { label: string; block: string }>();

  for (const m of desc.matchAll(/(?:^|\n)###\s+([^\n#][^\n]*)\n([\s\S]*?)(?=\n###\s|$)/g)) {
    const rawLabel = (m[1] ?? '').trim();
    const block = (m[2] ?? '').trim();
    if (!rawLabel) continue;
    byNorm.set(normalizeKey(rawLabel), { label: rawLabel, block });
  }

  for (const m of desc.matchAll(
    /(?:^|\n)\s*([A-Z][A-Za-z'\-\s]{2,60})\s*\n\s*\n\s*(\*{1,2}(?:Cost|Prerequisite):[\s\S]*?)(?=\n###\s|\n\s*[A-Z][A-Za-z'\-\s]{2,60}\s*\n\s*\n\s*\*{1,2}(?:Cost|Prerequisite):|$)/g
  )) {
    const rawLabel = (m[1] ?? '').trim();
    const block = (m[2] ?? '').trim();
    const n = normalizeKey(rawLabel);
    if (!rawLabel || byNorm.has(n)) continue;
    byNorm.set(n, { label: rawLabel, block });
  }

  return byNorm;
}

function stripStarredFieldLine(line: string, field: 'Cost' | 'Prerequisite'): string | null {
  const t = line.trim();
  if (!new RegExp(`^\\*{1,2}\\s*${field}`, 'i').test(t)) return null;
  let s = t
    .replace(/^\*{1,2}\s*/, '')
    .replace(/\*+$/g, '')
    .trim();
  const reField = new RegExp(`^${field}:?\\s*`, 'i');
  s = s.replace(reField, '').trim();
  return s || null;
}

/**
 * Extracts Metamagic option names from the "Metamagic Options" feature list text.
 * Supports markdown headings ("### Careful Spell") and plain blocks before "*Cost:" / "*Prerequisite:".
 */
function parseMetamagicOptions(
  desc: string
): Array<{ key: string; label: string; desc?: string; cost?: string }> {
  if (!desc?.trim()) return [];
  const out: Array<{ key: string; label: string; desc?: string; cost?: string }> = [];
  const seen = new Set<string>();

  const add = (labelRaw: string, blockRaw?: string) => {
    const label = labelRaw.trim().replace(/\s+/g, ' ');
    if (!label) return;
    const key = label.toLowerCase().replace(/['\s]+/g, '-');
    if (seen.has(key)) return;
    seen.add(key);
    const block = (blockRaw ?? '').trim();
    if (!block) {
      out.push({ key, label });
      return;
    }
    const lines = block.split('\n');
    const costLine = lines.find((l) => /^\*{1,2}\s*Cost/i.test(l.trim()));
    const cost = costLine ? (stripStarredFieldLine(costLine, 'Cost') ?? undefined) : undefined;
    const body = lines
      .filter((l) => l !== costLine)
      .join('\n')
      .trim();
    out.push({ key, label, desc: body || undefined, cost });
  };

  for (const { label, block } of collectOptionListBlocks(desc).values()) {
    add(label, block);
  }

  return out;
}

/**
 * Eldritch Invocation Options list: same block structure as Metamagic Options, often with *Prerequisite:*.
 */
function parseEldritchInvocationOptions(desc: string): Array<{
  key: string;
  label: string;
  desc?: string;
  cost?: string;
  prerequisite?: string;
}> {
  if (!desc?.trim()) return [];
  const out: Array<{
    key: string;
    label: string;
    desc?: string;
    cost?: string;
    prerequisite?: string;
  }> = [];
  const seen = new Set<string>();

  for (const { label: rawLabel, block: blockRaw } of collectOptionListBlocks(desc).values()) {
    const label = rawLabel.trim().replace(/\s+/g, ' ');
    if (!label) continue;
    const key = label.toLowerCase().replace(/['\s]+/g, '-');
    if (seen.has(key)) continue;
    seen.add(key);
    const block = blockRaw.trim();
    if (!block) {
      out.push({ key, label });
      continue;
    }
    const lines = block.split('\n');
    const isPrereqLine = (l: string) => /^\*{1,2}\s*Prerequisite/i.test(l.trim());
    const isCostLine = (l: string) => /^\*{1,2}\s*Cost/i.test(l.trim());
    const prereqLines = lines.filter(isPrereqLine);
    const costLines = lines.filter(isCostLine);
    const prereqParts = prereqLines
      .map((l) => stripStarredFieldLine(l, 'Prerequisite'))
      .filter((p): p is string => Boolean(p));
    const prerequisite = prereqParts.length > 0 ? prereqParts.join(' ') : undefined;
    const costParts = costLines
      .map((l) => stripStarredFieldLine(l, 'Cost'))
      .filter((p): p is string => Boolean(p));
    const cost = costParts.length > 0 ? costParts.join(' ') : undefined;
    const skip = new Set([...prereqLines, ...costLines]);
    const body = lines
      .filter((l) => !skip.has(l))
      .join('\n')
      .trim();
    out.push({
      key,
      label,
      desc: body || undefined,
      cost,
      prerequisite,
    });
  }

  return out;
}

/** Roman numeral (I–IX) to level number for spell list headings */
const ROMAN_TO_LEVEL: Record<string, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
};

/**
 * Retorna o título de nível unificado em bold (estilo Bard): "**Cantrips (Level 0)**" ou "**Level N**".
 * Recebe o texto do título (ex.: "Cantrips (Level 0 Cleric Spells)", "Table: Level 1 Cleric Spells", "#### Level 4 Cleric Spells").
 */
function spellListLevelToBold(title: string): string | null {
  const t = title.trim();
  const lower = t.toLowerCase();
  if (lower.includes('cantrips') && lower.includes('level 0')) return '**Cantrips (Level 0)**';
  const levelDigitMatch = t.match(/\blevel\s*(\d+)\b/i);
  if (levelDigitMatch) return `**Level ${levelDigitMatch[1]}**`;
  const levelRomanMatch = t.match(/\blevel\s*(I{1,3}|IV|V|VI{0,3}|IX)\b/i);
  if (levelRomanMatch) {
    const num = ROMAN_TO_LEVEL[levelRomanMatch[1].toUpperCase()];
    if (num != null) return `**Level ${num}**`;
  }
  const levelOnlyDigitMatch = t.match(/^\s*LEVEL\s+(\d+)\s+/i);
  if (levelOnlyDigitMatch) return `**Level ${levelOnlyDigitMatch[1]}**`;
  const onlyRomanMatch = t.match(/^\s*LEVEL\s+(I{1,3}|IV|V|VI{0,3}|IX)\s+/i);
  if (onlyRomanMatch) {
    const num = ROMAN_TO_LEVEL[onlyRomanMatch[1].toUpperCase()];
    if (num != null) return `**Level ${num}**`;
  }
  return null;
}

/**
 * Unifica os títulos de nível nas listas de magias (Bard Spell List, Cleric Spell List, etc.)
 * para o mesmo estilo do Bard: **Cantrips (Level 0)** e **Level 1** (bold, fonte normal).
 * Trata: "Table: Cantrips (Level 0 Cleric Spells)", "Table: Level N ... Spells", e headings "#### Level N ...".
 */
export function normalizeSpellListLevelHeadings(md: string): string {
  if (!md.trim()) return md;
  const lines = md.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    // Markdown heading: # a ## ### #### etc.
    const headingMatch = line.match(/^(#{1,6})\s*(.+)$/);
    if (headingMatch) {
      const bold = spellListLevelToBold(headingMatch[2]);
      if (bold) {
        out.push(bold);
        continue;
      }
      out.push(line);
      continue;
    }
    // "Table: Cantrips (Level 0 Cleric Spells)" / "Table: Level 1 Cleric Spells" (outras classes)
    const tableMatch = line.match(/^Table:\s*(.+)$/);
    if (tableMatch) {
      const bold = spellListLevelToBold(tableMatch[1]);
      if (bold) {
        out.push(bold);
        continue;
      }
    }
    out.push(line);
  }
  return out.join('\n');
}

export function normalizeFeatureDesc(desc: string | undefined): string {
  if (!desc) return '';
  let text = desc.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Converte linhas "Table: Nome" em título de seção markdown.
  text = text.replace(/^Table:\s*([^\n]+)$/gm, '#### $1');
  return text;
}

/** Placeholders inseridos na desc da Spellcasting para posicionar tabelas. Usam @@ para não serem interpretados como markdown. */
export const SPELLCASTING_TABLE_PLACEHOLDERS = {
  cantrips: '@@TABLE_CANTRIPS@@',
  spellSlots: '@@TABLE_SPELL_SLOTS@@',
  preparedSpells: '@@TABLE_PREPARED_SPELLS@@',
} as const;

/**
 * Insere placeholders na descrição da habilidade Spellcasting para que as tabelas
 * sejam renderizadas após cada seção correspondente (Cantrips → tabela Cantrips, etc.).
 */
export function injectSpellcastingTablePlaceholders(desc: string, tableLabels: string[]): string {
  if (!desc.trim()) return desc;
  const hasCantrips = tableLabels.some((l) => l.toLowerCase() === 'cantrips');
  const hasSlots = tableLabels.some((l) => l.toLowerCase().includes('slots'));
  const hasPrepared = tableLabels.some((l) => l.toLowerCase().includes('prepared spells'));
  if (!hasCantrips && !hasSlots && !hasPrepared) return desc;

  const block = '\n\n';
  let out = desc;
  // Inserir do final para o início para não deslocar índices.
  // Antes de "Spellcasting Ability." → tabela Prepared Spells
  if (hasPrepared) {
    const re = /(\n\n)((?:\*\*)?Spellcasting\s+Ability\.)/i;
    out = out.replace(re, `$1${SPELLCASTING_TABLE_PLACEHOLDERS.preparedSpells}${block}$2`);
  }
  // Antes de "Prepared Spells (of Level 1+)." → tabelas Spell Slots
  if (hasSlots) {
    const re = /(\n\n)((?:\*\*)?Prepared\s+Spells(?:\s+of\s+Level\s+1\+)?\.?)/i;
    out = out.replace(re, `$1${SPELLCASTING_TABLE_PLACEHOLDERS.spellSlots}${block}$2`);
  }
  // Antes de "Spell Slots." → tabela Cantrips
  if (hasCantrips) {
    const re = /(\n\n)((?:\*\*)?Spell\s+Slots\.)/i;
    out = out.replace(re, `$1${SPELLCASTING_TABLE_PLACEHOLDERS.cantrips}${block}$2`);
  }
  return out;
}

export function getDerivedFromRuleItems(
  classItem: RuleItemResponse | null,
  raceItem: RuleItemResponse | null,
  backgroundItem: RuleItemResponse | null,
  level: number,
  feats?: RuleItemResponse[],
  /** Todas as perícias (ex.: traço Skillful — escolher 1). */
  allSkillOptions?: Array<{ key: string; label: string }>
): DerivedCharacterStats {
  const savingThrows = { ...getDefaultSavingThrows() };
  // Initialize all known skills to false so the persisted map is always complete.
  const skillProficiencies: Record<string, boolean> = {};
  for (const s of allSkillOptions ?? []) {
    skillProficiencies[s.key] = false;
  }
  let classSkillOptions: { keys: string[]; chooseN: number | null } = { keys: [], chooseN: null };
  const proficiencyParts: string[] = [];
  const featureParts: string[] = [];
  const featureDetails: FeatureDetail[] = [];
  let hitDice = '';
  let speed = 0;
  let startingEquipmentParsed: { label: string; text: string }[] = [];
  let startingEquipmentLabel = 'Starting Equipment';
  let backgroundEquipmentParsed: { label: string; text: string }[] = [];
  let backgroundEquipmentLabel = 'Equipment';
  let backgroundAbilityScoreOption: DerivedCharacterStats['backgroundAbilityScoreOption'] = null;
  const currentLevel = Math.max(1, Math.min(20, level));

  if (classItem?.normalized && typeof classItem.normalized === 'object') {
    const norm = classItem.normalized as Record<string, unknown>;

    const hitPoints = (norm.hitPoints ?? norm.hit_points) as
      | { hitDiceName?: string; hit_dice_name?: string }
      | undefined;
    const hitDiceName = hitPoints?.hitDiceName ?? hitPoints?.hit_dice_name;
    if (hitDiceName) {
      hitDice = normalizeHitDice(hitDiceName as string);
    }

    const savingThrowsList = (norm.savingThrows ?? norm.saving_throws) as
      | Array<{ name?: string }>
      | undefined;
    if (Array.isArray(savingThrowsList)) {
      for (const s of savingThrowsList) {
        const name = s.name as string | undefined;
        if (name && DND_ATTRIBUTES.includes(name)) savingThrows[name] = true;
      }
    }

    type FeatureWithTable = {
      name?: string;
      featureType?: string;
      feature_type?: string;
      gainedAt?: unknown;
      gained_at?: unknown;
      desc?: string;
      key?: string;
      mechanics?: { featureKey?: string };
      dataForClassTable?: Array<{ level?: number; columnValue?: string }>;
      data_for_class_table?: Array<{ level?: number; column_value?: string }>;
    };

    const compactTableRows = (
      rawTable: Array<{ level?: number; columnValue?: string; column_value?: string }>
    ): Array<{ level: number; value: string }> => {
      const rawRows = rawTable.map((row) => {
        const level = Number(row.level ?? 0);
        const value =
          'columnValue' in row && row.columnValue !== undefined
            ? String(row.columnValue).trim()
            : 'column_value' in row && row.column_value !== undefined
              ? String(row.column_value).trim()
              : '';
        return { level, value };
      });
      const sorted = rawRows
        .filter((row) => row.level > 0 && row.value !== '')
        .sort((a, b) => a.level - b.level);
      const compact: Array<{ level: number; value: string }> = [];
      for (const row of sorted) {
        const last = compact[compact.length - 1];
        if (!last || last.value !== row.value) {
          compact.push(row);
        }
      }
      return compact;
    };

    const pushTableData = (
      f: FeatureWithTable,
      tableDataByName: Map<string, Array<{ level: number; value: string }>>,
      tableDataByKey: Map<string, Array<{ level: number; value: string }>>
    ) => {
      const type = (f.featureType ?? f.feature_type ?? '').toUpperCase();
      const hasTable =
        Array.isArray(f.dataForClassTable ?? f.data_for_class_table) &&
        (f.dataForClassTable ?? f.data_for_class_table)!.length > 0;
      const allowedType =
        type === 'CLASS_TABLE_DATA' ||
        type === 'SPELL_SLOTS' ||
        (type === 'CLASS_LEVEL_FEATURE' && hasTable);
      if (!allowedType) return;
      const name = (f.name as string | undefined)?.trim();
      const key = (f.key as string | undefined)?.trim();
      if (!name && !key) return;
      const rawTable =
        f.dataForClassTable ??
        f.data_for_class_table ??
        (null as unknown as Array<{ level?: number; columnValue?: string; column_value?: string }>);
      if (!Array.isArray(rawTable)) return;
      const compact = compactTableRows(rawTable);
      if (compact.length > 0) {
        if (name) tableDataByName.set(name, compact);
        if (key) tableDataByKey.set(key, compact);
      }
    };

    const features = norm.features as FeatureWithTable[] | undefined;
    const rawFeatures = (classItem as { raw?: { features?: unknown[] } }).raw?.features as
      | FeatureWithTable[]
      | undefined;
    const allFeaturesForTables = Array.isArray(features)
      ? Array.isArray(rawFeatures)
        ? [
            ...features,
            ...rawFeatures.filter(
              (rf) => !features.some((f) => (f.key ?? f.name) === (rf.key ?? rf.name))
            ),
          ]
        : features
      : Array.isArray(rawFeatures)
        ? rawFeatures
        : [];

    if (Array.isArray(features) || Array.isArray(rawFeatures)) {
      const tableDataByName = new Map<string, Array<{ level: number; value: string }>>();
      const tableDataByKey = new Map<string, Array<{ level: number; value: string }>>();
      for (const f of allFeaturesForTables) {
        pushTableData(f, tableDataByName, tableDataByKey);
      }

      // Slug index so a column resolves even when its upstream display name is wrong.
      const sourceKey = (classItem.sourceKey ?? '').trim();
      const tableDataBySlug = new Map<string, Array<{ level: number; value: string }>>();
      for (const [key, rows] of tableDataByKey.entries()) {
        const slug = columnKeySlug(key, sourceKey);
        if (slug && !tableDataBySlug.has(slug)) tableDataBySlug.set(slug, rows);
      }

      /** Keys das tabelas de spellcasting por classe (base = sourceKey da classe, ex.: srd-2024_bard). */
      const SPELLCASTING_TABLE_KEYS = [
        { keySuffix: 'cantrips', label: 'Cantrips' },
        { keySuffix: 'prepared-spells', label: 'Prepared Spells' },
        { keySuffix: 'slots-1st', label: '1st-level Slots' },
        { keySuffix: 'slots-2nd', label: '2nd-level Slots' },
        { keySuffix: 'slots-3rd', label: '3rd-level Slots' },
        { keySuffix: 'slots-4th', label: '4th-level Slots' },
        { keySuffix: 'slots-5th', label: '5th-level Slots' },
        { keySuffix: 'slots-6th', label: '6th-level Slots' },
        { keySuffix: 'slots-7th', label: '7th-level Slots' },
        { keySuffix: 'slots-8th', label: '8th-level Slots' },
        { keySuffix: 'slots-9th', label: '9th-level Slots' },
      ];

      const allClassFeatures = features ?? [];
      const metamagicOptionsFeature = allClassFeatures.find((f) => {
        const type = (f.featureType ?? f.feature_type ?? '').toUpperCase();
        const name = (f.name ?? '').trim().toLowerCase();
        const key = (f.key ?? '').trim().toLowerCase();
        return (
          type === 'CLASS_FEATURE_OPTION_LIST' &&
          (name === 'metamagic options' || key.includes('metamagic-options'))
        );
      });
      const metamagicOptions = parseMetamagicOptions(
        typeof metamagicOptionsFeature?.desc === 'string' ? metamagicOptionsFeature.desc : ''
      );

      const eldritchInvocationOptionsFeature = allClassFeatures.find((f) => {
        const type = (f.featureType ?? f.feature_type ?? '').toUpperCase();
        const name = (f.name ?? '').trim().toLowerCase();
        const key = (f.key ?? '').trim().toLowerCase();
        return (
          type === 'CLASS_FEATURE_OPTION_LIST' &&
          (name === 'eldritch invocation options' ||
            name === 'eldritch invocations options' ||
            key.includes('eldritch-invocation-options') ||
            key.includes('eldritch_invocation_options'))
        );
      });
      const eldritchInvocationOptions = parseEldritchInvocationOptions(
        typeof eldritchInvocationOptionsFeature?.desc === 'string'
          ? eldritchInvocationOptionsFeature.desc
          : ''
      );

      // `[Column data]` is a pure class-table column mistyped upstream as a feature
      // (Druid "Cantrips Known" = the Wild Shape column); don't render it as a feature.
      const levelFeatures = allClassFeatures.filter(
        (f) =>
          (f.featureType ?? f.feature_type ?? '').toUpperCase() === 'CLASS_LEVEL_FEATURE' &&
          (typeof f.desc === 'string' ? f.desc.trim() : '') !== '[Column data]'
      );
      for (const f of levelFeatures) {
        const gainedAt = f.gainedAt ?? f.gained_at;
        const structuredLevels = getGainedAtLevels({ gained_at: gainedAt } as { gained_at?: unknown });
        // Merge any "gained again at level N" levels the structured data missed (see helper).
        const repeatLevels = parseRepeatGainLevelsFromDesc(
          typeof f.desc === 'string' ? f.desc : '',
          typeof f.name === 'string' ? f.name : ''
        );
        const levels = Array.from(new Set([...structuredLevels, ...repeatLevels])).sort(
          (a, b) => a - b
        );
        const entriesAtOrBefore = getGainedAtEntriesAtOrBefore(gainedAt, currentLevel);
        const levelsAtOrBefore =
          levels.length === 0
            ? []
            : [...levels].filter((lvl) => lvl <= currentLevel).sort((a, b) => a - b);
        const gainCount = levels.length === 0 ? 1 : levelsAtOrBefore.length;
        const hasAtOrBeforeLevel = gainCount > 0;
        if (hasAtOrBeforeLevel && f.name) {
          const name = f.name as string;
          const rawDesc = typeof f.desc === 'string' ? f.desc : '';
          const desc = name.trim().toLowerCase().includes('spell list')
            ? normalizeFeatureDesc(normalizeSpellListLevelHeadings(rawDesc))
            : normalizeFeatureDesc(rawDesc);
          const baseDetail: FeatureDetail = {
            name,
            desc,
            source: 'class',
            gainCount,
            ...(f.mechanics?.featureKey ? { featureKey: f.mechanics.featureKey } : {}),
          };
          if (levelsAtOrBefore.length > 0) {
            baseDetail.gainedAtLevels = levelsAtOrBefore;
            if (entriesAtOrBefore.length > 0) {
              const detailByLevel = new Map(
                entriesAtOrBefore.map((e) => [e.level, e.detail as string | undefined])
              );
              const aligned = levelsAtOrBefore.map((lvl) => detailByLevel.get(lvl));
              if (aligned.some((d) => d != null && String(d).trim() !== '')) {
                baseDetail.gainedAtDetails = aligned.map((d) => (d != null ? d : ''));
              }
            }
          }
          /** Só preenche options para habilidades de “escolha única” conhecidas (ex.: Blessed Strikes, Divine Order, Elemental Fury, Primal Order). */
          const SINGLE_CHOICE_CLASS_FEATURES = [
            'blessed strikes',
            'divine order',
            'improved blessed strikes',
            'elemental fury',
            'improved elemental fury',
            'primal order',
            'fighting style',
          ];
          const nameLower = name.trim().toLowerCase();
          if (SINGLE_CHOICE_CLASS_FEATURES.some((n) => nameLower === n)) {
            const traitOpts = parseTraitOptions(rawDesc);
            // Alguns recursos têm apenas 1 opção textual (ex.: Paladin Fighting Style -> Blessed Warrior).
            const minOpts = nameLower === 'fighting style' ? 1 : 2;
            if (traitOpts.length >= minOpts) {
              baseDetail.options = traitOpts;
            }
          }
          if (nameLower === 'metamagic') {
            const traitOpts =
              metamagicOptions.length >= 2 ? metamagicOptions : parseTraitOptions(rawDesc);
            if (traitOpts.length >= 2) {
              baseDetail.options = traitOpts;
            }
          }
          if (nameLower === 'eldritch invocations' || nameLower === 'eldritch invocation') {
            const traitOpts =
              eldritchInvocationOptions.length >= 1
                ? eldritchInvocationOptions
                : parseTraitOptions(rawDesc);
            if (traitOpts.length >= 1) {
              baseDetail.options = traitOpts;
            }
          }
          if (nameLower === 'skillful' && allSkillOptions && allSkillOptions.length > 0) {
            baseDetail.options = allSkillOptions;
          }
          const tables: Array<{ label: string; rows: Array<{ level: number; value: string }> }> =
            [];
          // Spellcasting / Pact Magic keep bespoke logic (multi-column slot grids);
          // every other column table is resolved generically in the `else` branch.
          if (name.trim().toLowerCase().includes('spellcasting')) {
            const baseKey = (classItem.sourceKey ?? '').trim();
            if (baseKey) {
              for (const { keySuffix, label } of SPELLCASTING_TABLE_KEYS) {
                const keyWithDash = `${baseKey}_${keySuffix}`;
                const keyWithUnderscore = `${baseKey}_${keySuffix.replace(/-/g, '_')}`;
                const rows =
                  tableDataByKey.get(keyWithDash) ?? tableDataByKey.get(keyWithUnderscore);
                if (rows && rows.length > 0) {
                  tables.push({ label, rows });
                }
              }
            }
            if (tables.length === 0) {
              const tableRows = tableDataByName.get(name);
              if (tableRows && tableRows.length > 0) {
                tables.push({ label: name, rows: tableRows });
              }
            }
            if (tables.length > 0) {
              baseDetail.desc = injectSpellcastingTablePlaceholders(
                baseDetail.desc,
                tables.map((t) => t.label)
              );
            }
          } else if (
            name.trim().toLowerCase().includes('pact') &&
            name.trim().toLowerCase().includes('magic')
          ) {
            // Warlock: Pact Magic pode ter tabelas com labels diferentes do spellcasting.
            // Aqui fazemos uma correspondência tolerante por label.
            for (const [tableLabel, rows] of tableDataByName.entries()) {
              const tl = tableLabel.trim().toLowerCase();
              if (tl.includes('pact') && tl.includes('magic')) {
                tables.push({ label: tableLabel, rows });
              }
            }
            // Fallback: "pact" + "slot"
            if (tables.length === 0) {
              for (const [tableLabel, rows] of tableDataByName.entries()) {
                const tl = tableLabel.trim().toLowerCase();
                if (tl.includes('pact') && tl.includes('slot')) {
                  tables.push({ label: tableLabel, rows });
                }
              }
            }
            // Final fallback: qualquer tabela com "slot" (não fica sem UI)
            if (tables.length === 0) {
              for (const [tableLabel, rows] of tableDataByName.entries()) {
                const tl = tableLabel.trim().toLowerCase();
                if (tl.includes('slot')) {
                  tables.push({ label: tableLabel, rows });
                }
              }
            }

            // Warlock também possui Cantrips (ex.: Eldritch Blast). O modal só renderiza
            // a tabela quando o label é exatamente "Cantrips".
            const cantripsRow = (() => {
              for (const [tableLabel, rows] of tableDataByName.entries()) {
                const tl = tableLabel.trim().toLowerCase();
                if (tl.includes('cantrips')) {
                  return { rows };
                }
              }
              return null;
            })();
            if (cantripsRow && !tables.some((t) => t.label.trim().toLowerCase() === 'cantrips')) {
              tables.push({ label: 'Cantrips', rows: cantripsRow.rows });
            }

            // Caso o backend traga alguma seção de "Prepared Spells" para Pact Magic,
            // o modal procura label exatamente "Prepared Spells".
            const preparedRow = (() => {
              for (const [tableLabel, rows] of tableDataByName.entries()) {
                const tl = tableLabel.trim().toLowerCase();
                if (tl.includes('prepared spells')) {
                  return { rows };
                }
              }
              return null;
            })();
            if (
              preparedRow &&
              !tables.some((t) => t.label.trim().toLowerCase() === 'prepared spells')
            ) {
              tables.push({ label: 'Prepared Spells', rows: preparedRow.rows });
            }

            if (tables.length > 1) {
              const seen = new Set<string>();
              const dedup: Array<{ label: string; rows: Array<{ level: number; value: string }> }> =
                [];
              for (const t of tables) {
                const key = t.label.trim().toLowerCase();
                if (seen.has(key)) continue;
                seen.add(key);
                dedup.push(t);
              }
              tables.splice(0, tables.length, ...dedup);
            }

            // Insere placeholders similares ao fluxo do Spellcasting para posicionar tabelas no markdown,
            // quando o texto contiver os marcadores esperados.
            if (tables.length > 0) {
              baseDetail.desc = injectSpellcastingTablePlaceholders(
                baseDetail.desc,
                tables.map((t) => t.label)
              );
            }
          } else {
            // Attach each column the description references; label is the referenced
            // name so the renderer can stitch it in at that paragraph.
            for (const columnName of extractColumnReferences(baseDetail.desc)) {
              const rows =
                tableDataByName.get(columnName) ?? tableDataBySlug.get(columnSlug(columnName));
              if (rows && rows.length > 0 && !tables.some((t) => t.label === columnName)) {
                tables.push({ label: columnName, rows });
              }
            }

            // No prose reference (e.g. Unarmored Movement): append its own same-named table.
            if (tables.length === 0) {
              let tableRows = tableDataByName.get(name);
              if ((!tableRows || tableRows.length === 0) && isUnarmoredMovementFeatureName(name)) {
                for (const [tableName, rows] of tableDataByName.entries()) {
                  if (isUnarmoredMovementFeatureName(tableName)) {
                    tableRows = rows;
                    break;
                  }
                }
              }
              if (tableRows && tableRows.length > 0) {
                tables.push({ label: name, rows: tableRows });
              }
            }
          }
          featureParts.push(name);
          featureDetails.push(
            tables.length > 0 ? { ...baseDetail, tableData: tables } : baseDetail
          );
        }
      }
    }

    const coreTraitsKey = `${classItem.sourceKey ?? ''}_core-traits`;
    const featuresList = features ?? [];
    const core =
      Array.isArray(featuresList) &&
      (featuresList.find((f: { key?: string }) => f.key === coreTraitsKey) ??
        featuresList.find((f: { key?: string }) => (f.key ?? '').endsWith('_core-traits')));
    const coreDesc =
      core && typeof (core as { desc?: string }).desc === 'string'
        ? (core as { desc: string }).desc
        : undefined;
    const coreMap = parseTableLikeToMap(coreDesc);

    if (coreMap['Skill Proficiencies']) {
      const skillText = coreMap['Skill Proficiencies'];
      proficiencyParts.push(`Skills: ${skillText}`);
      classSkillOptions = parseSkillProficienciesText(skillText);
    }
    if (coreMap['Weapon Proficiencies']) {
      proficiencyParts.push(`Weapon Proficiencies: ${coreMap['Weapon Proficiencies']}`);
    }
    if (coreMap['Armor Training']) {
      proficiencyParts.push(`Armor Training: ${coreMap['Armor Training']}`);
    }
    const toolProf = coreMap['Tool Proficiencies'] ?? coreMap['Tool Proficiency'];
    if (toolProf) {
      proficiencyParts.push(`Tool Proficiencies: ${toolProf}`);
    }

    const startingEquipmentKey =
      coreMap['Starting Equipment'] !== undefined
        ? 'Starting Equipment'
        : coreMap['Starting equipment'] !== undefined
          ? 'Starting equipment'
          : null;
    if (startingEquipmentKey) startingEquipmentLabel = startingEquipmentKey;
    const startingEquipmentRaw =
      coreMap['Starting Equipment'] ??
      coreMap['Starting equipment'] ??
      norm.startingEquipment ??
      (norm as Record<string, unknown>).starting_equipment;
    const startingEquipmentStr =
      typeof startingEquipmentRaw === 'string'
        ? startingEquipmentRaw
        : typeof startingEquipmentRaw === 'object' &&
            startingEquipmentRaw !== null &&
            'desc' in startingEquipmentRaw
          ? String((startingEquipmentRaw as { desc?: string }).desc ?? '')
          : '';
    startingEquipmentParsed = parseStartingEquipmentOptions(startingEquipmentStr);

    if (proficiencyParts.length === 0) {
      const sp = (norm.skillProficiencies ?? norm.skill_proficiencies) as string | undefined;
      const wp = (norm.weaponProficiencies ?? norm.weapon_proficiencies) as string | undefined;
      const ap = (norm.armorProficiencies ?? norm.armor_proficiencies ?? norm.armor_training) as
        | string
        | undefined;
      const tp = (norm.toolProficiencies ?? norm.tool_proficiencies) as string | undefined;
      if (sp) {
        proficiencyParts.push(`Skills: ${sp}`);
        classSkillOptions = parseSkillProficienciesText(sp);
      }
      if (wp) proficiencyParts.push(`Weapon Proficiencies: ${wp}`);
      if (ap) proficiencyParts.push(`Armor Training: ${ap}`);
      if (tp) proficiencyParts.push(`Tool Proficiencies: ${tp}`);
    }
  }

  if (raceItem?.normalized && typeof raceItem.normalized === 'object') {
    const norm = raceItem.normalized as Record<string, unknown>;
    const traits = norm.traits as
      | Array<{ name?: string; desc?: string; mechanics?: { featureKey?: string } }>
      | undefined;
    if (Array.isArray(traits)) {
      const speedTrait = traits.find((t) => (t.name ?? '').toLowerCase() === 'speed');
      if (speedTrait && (speedTrait.desc || speedTrait.name)) {
        const speedSource = (speedTrait.desc as string) ?? (speedTrait.name as string) ?? '';
        speed = parseSpeedToNumber(speedSource);
      }
      if (speed === 0) {
        const speedStr = norm.speed as string | undefined;
        if (speedStr) speed = parseSpeedToNumber(speedStr);
      }
      for (const t of traits) {
        if (t.name) {
          const rawDesc = typeof t.desc === 'string' ? t.desc : '';
          const traitTitle = t.name as string;
          let opts = isSelectableTrait(traitTitle) ? parseTraitOptions(rawDesc) : undefined;
          if (traitTitle.trim().toLowerCase() === 'keen senses') {
            const keenOpts = parseKeenSensesSkillOptions(rawDesc);
            if (keenOpts.length > 0) opts = keenOpts;
          }
          const skillful = traitTitle.trim().toLowerCase() === 'skillful';
          if (skillful && allSkillOptions && allSkillOptions.length > 0) {
            opts = allSkillOptions;
          }
          const keenSenses = traitTitle.trim().toLowerCase() === 'keen senses';
          const includeOpts =
            opts &&
            (opts.length >= 2 ||
              (keenSenses && opts.length === 1) ||
              (skillful && opts.length >= 1));
          featureParts.push(traitTitle);
          const descForTrait = isSelectableTrait(traitTitle)
            ? rawDesc.replace(/^\*{0,2}Table:\s*[^\n]*\*{0,2}$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
            : rawDesc;
          featureDetails.push({
            name: traitTitle,
            desc: normalizeFeatureDesc(descForTrait),
            source: 'race',
            ...(t.mechanics?.featureKey ? { featureKey: t.mechanics.featureKey } : {}),
            ...(includeOpts ? { options: opts } : {}),
          });
        }
      }
    } else {
      const speedStr = norm.speed as string | undefined;
      if (speedStr) speed = parseSpeedToNumber(speedStr);
    }
  }

  if (backgroundItem?.normalized && typeof backgroundItem.normalized === 'object') {
    const norm = backgroundItem.normalized as Record<string, unknown>;
    const benefits = norm.benefits as
      | Array<{ type?: string; name?: string; desc?: string }>
      | undefined;
    if (Array.isArray(benefits)) {
      const toolBenefit = benefits.find((b) => (b.type ?? '').toLowerCase() === 'tool_proficiency');
      if (toolBenefit) {
        const desc = (toolBenefit.desc as string) ?? (toolBenefit.name as string) ?? '';
        if (desc.trim()) proficiencyParts.push(`Tool Proficiencies: ${desc.trim()}`);
      }
      const skillBenefit = benefits.find(
        (b) => (b.type ?? '').toLowerCase() === 'skill_proficiency'
      );
      if (skillBenefit) {
        const desc = (skillBenefit.desc as string) ?? (skillBenefit.name as string) ?? '';
        const { keys, chooseN } = parseSkillProficienciesText(desc);
        const toSelect = chooseN != null ? keys.slice(0, chooseN) : keys;
        for (const key of toSelect) {
          skillProficiencies[key] = true;
        }
      }
      const equipmentBenefit = benefits.find((b) => (b.type ?? '').toLowerCase() === 'equipment');
      if (equipmentBenefit) {
        const name = (equipmentBenefit.name as string) ?? 'Equipment';
        const desc = (equipmentBenefit.desc as string) ?? '';
        backgroundEquipmentLabel = name.trim() || 'Equipment';
        const opts = parseStartingEquipmentOptions(desc);
        if (opts.length > 0) {
          backgroundEquipmentParsed = opts;
        }
      }
      const abilityScoreBenefit = benefits.find(
        (b) => (b.type ?? '').toLowerCase() === 'ability_score'
      );
      if (abilityScoreBenefit) {
        const desc = ((abilityScoreBenefit.desc ?? abilityScoreBenefit.name) as string) ?? '';
        const pointsMatch = desc.match(/(\d+)\s*points?/i);
        const totalPoints = pointsMatch
          ? Math.min(6, Math.max(1, parseInt(pointsMatch[1], 10)))
          : 3;
        const maxPerAbility = 2;
        const allowedAbilityNames = parseAllowedAbilityNamesFromDesc(desc);
        backgroundAbilityScoreOption = {
          totalPoints,
          maxPerAbility,
          allowedAbilityNames:
            allowedAbilityNames.length > 0 ? allowedAbilityNames : [...DND_ATTRIBUTES],
        };
      }
      // Feat(s) granted by background: add to featureDetails for "Habilidades e traços"
      const featBenefits = benefits.filter((b) => (b.type ?? '').toLowerCase() === 'feat');
      for (const fb of featBenefits) {
        const featName = ((fb.desc ?? fb.name) as string)?.trim() || 'Feat';
        let featDesc = '';
        if (Array.isArray(feats) && feats.length > 0) {
          const featNameLower = featName.toLowerCase();
          const featNameSlug = featNameLower
            .replace(/\s*\([^)]*\)\s*/g, ' ')
            .trim()
            .replace(/\s+/g, '-');
          const matched = feats.find((f) => {
            const fName = (f.name ?? '').toLowerCase();
            const fKey = (f.sourceKey ?? '').toLowerCase();
            if (fName === featNameLower) return true;
            if (fKey.endsWith(featNameSlug) || fKey.includes(featNameSlug)) return true;
            const fNameBase = fName.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
            const featNameBase = featNameLower.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
            return fNameBase === featNameBase;
          });
          if (matched) featDesc = getFeatDescription(matched);
        }
        const finalDesc = featDesc || ((fb.desc ?? fb.name) as string | undefined) || '';
        featureDetails.push({
          name: featName,
          desc: normalizeFeatureDesc(finalDesc),
          source: 'background',
        });
        featureParts.push(featName);
      }
    }
  }

  const mergedProficiencyParts = mergeProficiencyLines(proficiencyParts);
  const proficiencies = mergedProficiencyParts.join('\n');
  const features = featureParts.join('\n');

  // Disciplined Survivor: proficiency in all saving throws
  const hasDisciplinedSurvivor = featureDetails.some(
    (f) => f.name.trim().toLowerCase() === 'disciplined survivor'
  );
  if (hasDisciplinedSurvivor) {
    for (const attr of DND_ATTRIBUTES) {
      savingThrows[attr] = true;
    }
  }

  // Slippery Mind (e.g. Rogue 15): proficiency in Wisdom and Charisma saving throws
  const hasSlipperyMind = featureDetails.some(
    (f) => f.name.trim().toLowerCase() === 'slippery mind'
  );
  if (hasSlipperyMind) {
    savingThrows.Wisdom = true;
    savingThrows.Charisma = true;
  }

  const startingEquipmentOptions =
    startingEquipmentParsed.length > 0
      ? { label: startingEquipmentLabel, options: startingEquipmentParsed }
      : null;
  const backgroundEquipmentOptions =
    backgroundEquipmentParsed.length > 0
      ? { label: backgroundEquipmentLabel, options: backgroundEquipmentParsed }
      : null;

  return {
    hitDice,
    speed,
    proficiencies,
    features,
    featureDetails,
    savingThrows,
    skillProficiencies,
    classSkillOptions,
    startingEquipmentOptions,
    backgroundEquipmentOptions,
    backgroundAbilityScoreOption,
  };
}

function normalizeAlertName(name: string): string {
  return (name ?? '').trim().toLowerCase().replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasAlertFeatInFeatures(data: CharacterFormData, featsList?: RuleItemResponse[]): boolean {
  if ((data.featureDetails ?? []).some((f) => normalizeAlertName(f.name) === 'alert')) return true;
  if (!featsList?.length) return false;
  const isAlertId = (id: string | null | undefined): boolean => {
    if (!id) return false;
    const feat = featsList.find((f) => f.id === id);
    return feat ? normalizeAlertName(feat.name) === 'alert' : false;
  };
  if (isAlertId(data.versatileFeatId)) return true;
  if (isAlertId(data.epicBoonFeatId)) return true;
  return (data.abilityScoreImprovementByGain ?? []).some(
    (g) => g?.kind === 'feat' && isAlertId(g.featId),
  );
}

/**
 * Recalcula campos de combate (CA, HP máximo/atual, iniciativa) a partir dos
 * atributos e do dado de vida atuais do personagem. Usa `getEffectiveModifier`,
 * de forma que atributos ainda não selecionados contribuam como 0.
 */
export function applyCombatFromAttributes(data: CharacterFormData, featsList?: RuleItemResponse[]): CharacterFormData {
  let working: CharacterFormData = data;
  if (!canApplyAbilityScoreImprovementASI(working)) {
    const byGain = working.abilityScoreImprovementByGain ?? [];
    if (byGain.some((g) => g?.kind === 'increase_scores' && sumIncreaseScoresInGain(g) > 0)) {
      working = {
        ...working,
        abilityScoreImprovementByGain: byGain.map((g) =>
          g?.kind === 'increase_scores' && sumIncreaseScoresInGain(g) > 0 ? null : g
        ),
      };
    }
  }

  const { hasPrimalChampion, hasBodyAndMind } = getPrimalChampionBodyAndMindBonusFlags(working);
  /** PHB / SRD: +1 ao máximo de PV por nível do personagem. */
  const hasDwarvenToughness = (working.featureDetails ?? []).some(
    (f) => f.name.trim().toLowerCase() === 'dwarven toughness'
  );
  const asiMerged = getTotalAbilityScoreImprovementFromGains(working.abilityScoreImprovementByGain);
  const combinedBonus: Record<string, number> = {};
  for (const k of new Set([
    ...Object.keys(working.backgroundAbilityScoreIncrease ?? {}),
    ...Object.keys(asiMerged),
  ])) {
    combinedBonus[k] =
      ((working.backgroundAbilityScoreIncrease ?? {})[k] ?? 0) + (asiMerged[k] ?? 0);
  }
  const epicBoonForMods = getEffectiveEpicBoonAbilityScore(working);
  const dexMod = getEffectiveModifier(
    working.attributes ?? {},
    combinedBonus,
    'Dexterity',
    epicBoonForMods,
    hasPrimalChampion,
    hasBodyAndMind,
    working.grapplerAbilityScore
  );
  const conMod = getEffectiveModifier(
    working.attributes ?? {},
    combinedBonus,
    'Constitution',
    epicBoonForMods,
    hasPrimalChampion,
    hasBodyAndMind,
    working.grapplerAbilityScore
  );
  const level = Math.max(1, Math.min(20, working.level ?? 1));
  const hitDieMax = hitDieMaxFromNotation(working.hitDice || '');
  const maxHp = maxHpForLevel({
    hitDieMax,
    conMod,
    level,
    dwarvenToughness: hasDwarvenToughness,
  });
  const rawCurrent = working.currentHp;
  const previousCurrent =
    typeof rawCurrent === 'number' && Number.isFinite(rawCurrent) ? rawCurrent : maxHp;
  const currentHp = Math.min(Math.max(0, previousCurrent), maxHp);
  const armorClassStr = working.hitDice ? String(10 + dexMod) : '';
  const hasAlertFeat = hasAlertFeatInFeatures(working, featsList);
  const initiativeValue = hasAlertFeat ? dexMod + proficiencyBonusForLevel(level) : dexMod;
  const initiativeStr = String(initiativeValue);

  return {
    ...working,
    armorClass: armorClassStr,
    maxHp,
    currentHp,
    initiative: initiativeStr,
  };
}

/** Project the stored per-gain ASI choices onto exactly `gainCount` slots. */
function abilityScoreImprovementByGainForCount(
  data: CharacterFormData,
  gainCount: number
): AbilityScoreImprovementGainChoice[] {
  const out: AbilityScoreImprovementGainChoice[] = Array.from({ length: gainCount }, () => null);
  const existing = data.abilityScoreImprovementByGain;
  if (existing && existing.length > 0) {
    for (let i = 0; i < gainCount; i++) {
      out[i] = existing[i] ?? null;
    }
  }
  return out;
}

/** Per-gain clamp: ≤2 points per slot, global cap per ability. */
function clampAbilityScoreImprovementByGain(
  byGain: AbilityScoreImprovementGainChoice[] | undefined,
  gainCount: number,
  data: CharacterFormData
): AbilityScoreImprovementGainChoice[] {
  const arr: AbilityScoreImprovementGainChoice[] = [];
  for (let i = 0; i < gainCount; i++) {
    arr.push(byGain?.[i] ?? null);
  }
  for (let i = 0; i < gainCount; i++) {
    const c = arr[i];
    if (c?.kind === 'feat') {
      if (!c.featId?.trim()) arr[i] = null;
      continue;
    }
    if (!c || c.kind !== 'increase_scores') continue;
    const m: Record<string, number> = { ...c.byAbility };
    for (const a of DND_ATTRIBUTES) {
      m[a] = Math.max(0, Math.min(m[a] ?? 0, 2));
    }
    let sum = DND_ATTRIBUTES.reduce((s, a) => s + (m[a] ?? 0), 0);
    while (sum > 2) {
      const taker = [...DND_ATTRIBUTES].reverse().find((a) => (m[a] ?? 0) > 0);
      if (!taker) break;
      m[taker] = (m[taker] ?? 0) - 1;
      sum -= 1;
    }
    arr[i] = sum === 0 ? null : { kind: 'increase_scores', byAbility: m };
  }
  for (const a of DND_ATTRIBUTES) {
    const cap = maxAsiBonusForAttribute(data, a);
    let total = arr.reduce((s, g) => {
      if (g?.kind === 'increase_scores') return s + (g.byAbility[a] ?? 0);
      return s;
    }, 0);
    while (total > cap) {
      let reduced = false;
      for (let i = arr.length - 1; i >= 0 && total > cap; i--) {
        const g = arr[i];
        if (g?.kind !== 'increase_scores') continue;
        const cur = g.byAbility[a] ?? 0;
        if (cur <= 0) continue;
        const nextMap = { ...g.byAbility, [a]: cur - 1 };
        const nextSum = DND_ATTRIBUTES.reduce((s, x) => s + (nextMap[x] ?? 0), 0);
        arr[i] = nextSum === 0 ? null : { kind: 'increase_scores', byAbility: nextMap };
        total -= 1;
        reduced = true;
        break;
      }
      if (!reduced) break;
    }
  }
  for (let i = 0; i < gainCount; i++) {
    const c = arr[i];
    if (c?.kind !== 'increase_scores') continue;
    const m = { ...c.byAbility };
    let sum = DND_ATTRIBUTES.reduce((s, a) => s + (m[a] ?? 0), 0);
    while (sum > 2) {
      const taker = [...DND_ATTRIBUTES].reverse().find((x) => (m[x] ?? 0) > 0);
      if (!taker) break;
      m[taker] = (m[taker] ?? 0) - 1;
      sum -= 1;
    }
    arr[i] = sum === 0 ? null : { kind: 'increase_scores', byAbility: m };
  }
  return arr;
}

function extractMiLockedSpellList(name: string): MagicInitiateSpellList | null {
  const match = name.match(/\(([^)]+)\)/);
  if (!match) return null;
  const variant = match[1].trim();
  const normalized = variant.charAt(0).toUpperCase() + variant.slice(1).toLowerCase();
  return (MAGIC_INITIATE_SPELL_LISTS as readonly string[]).includes(normalized)
    ? (normalized as MagicInitiateSpellList)
    : null;
}

function normalizeMiFeatName(name: string): string {
  return name.trim().toLowerCase().replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Generic enumeration of the ordered feat "source slots" — every place a feat matching
 * `matches` is granted (feature details incl. background, Versatile, each ASI choice, and
 * Eldritch Invocations / Lessons of the First Ones). Each slot has a stable `key` (shared
 * key scheme so MI and Skilled stores never collide because they live in separate records)
 * plus a human `label` and the granting feat's `featName`.
 */
export function computeActiveFeatSources(
  featureDetails: Array<{ name: string; source?: string; gainCount?: number }>,
  abilityScoreImprovementByGain: (AbilityScoreImprovementGainChoice | null)[] | undefined,
  featsList: RuleItemResponse[],
  versatileFeatId: string | null | undefined,
  eldritchInvocationSelections: EldritchInvocationSelection[] | undefined,
  matches: (name: string) => boolean,
): Array<{ key: string; label: string; featName: string }> {
  const result: Array<{ key: string; label: string; featName: string }> = [];

  for (const fd of featureDetails) {
    if (!matches(fd.name)) continue;
    const n = fd.gainCount ?? 1;
    const src = fd.source === 'background' ? 'Background' : fd.source === 'race' ? 'Race' : 'Class';
    for (let i = 0; i < n; i++) {
      result.push({ key: buildMiFdKey(fd.source, fd.name, i), label: src, featName: fd.name });
    }
  }

  if (versatileFeatId) {
    const vFeat = featsList.find((f) => f.id === versatileFeatId);
    if (vFeat && matches(vFeat.name)) {
      result.push({ key: MI_VERSATILE_KEY, label: 'Versatile', featName: vFeat.name });
    }
  }

  (abilityScoreImprovementByGain ?? []).forEach((gain, idx) => {
    if (gain?.kind !== 'feat') return;
    const f = featsList.find((feat) => feat.id === gain.featId);
    if (!f || !matches(f.name)) return;
    const ordinalLabel = idx === 0 ? '1st' : idx === 1 ? '2nd' : idx === 2 ? '3rd' : `${idx + 1}th`;
    result.push({
      key: buildMiAsiKey(idx),
      label: `${ordinalLabel} Ability Score Improvement`,
      featName: f.name,
    });
  });

  for (const sel of eldritchInvocationSelections ?? []) {
    if (!sel.featId) continue;
    const f = featsList.find((feat) => feat.id === sel.featId);
    if (!f || !matches(f.name)) continue;
    result.push({
      key: buildMiEldritchKey(sel.featId),
      label: 'Lessons of the First Ones',
      featName: f.name,
    });
  }

  return result;
}

/** Magic Initiate predicate — strips the spell-list parenthetical (e.g. "Magic Initiate (Cleric)"). */
const matchesMagicInitiate = (name: string) => normalizeMiFeatName(name) === 'magic initiate';

/**
 * Computes the ordered list of active Magic Initiate source slots from the character's
 * current sources (featureDetails, versatile feat, ASI choices, Eldritch Invocations).
 * Each slot has a stable `key` usable as index into `magicInitiateChoicesBySource`.
 */
export function computeActiveMiSourceInfo(
  featureDetails: Array<{ name: string; source?: string; gainCount?: number }>,
  abilityScoreImprovementByGain: (AbilityScoreImprovementGainChoice | null)[] | undefined,
  featsList: RuleItemResponse[],
  versatileFeatId?: string | null,
  eldritchInvocationSelections?: EldritchInvocationSelection[],
): Array<{ key: string; lockedSpellList: MagicInitiateSpellList | null; label: string }> {
  return computeActiveFeatSources(
    featureDetails,
    abilityScoreImprovementByGain,
    featsList,
    versatileFeatId,
    eldritchInvocationSelections,
    matchesMagicInitiate,
  ).map(({ key, label, featName }) => ({
    key,
    label,
    lockedSpellList: extractMiLockedSpellList(featName),
  }));
}

/**
 * Computes the ordered list of active Skilled source slots (one per Skilled feat granted by
 * any source). Each slot's 3 skill/tool picks live under its `key` in `skilledChoicesBySource`.
 */
export function computeActiveSkilledSources(
  featureDetails: Array<{ name: string; source?: string; gainCount?: number }>,
  abilityScoreImprovementByGain: (AbilityScoreImprovementGainChoice | null)[] | undefined,
  featsList: RuleItemResponse[],
  versatileFeatId?: string | null,
  eldritchInvocationSelections?: EldritchInvocationSelection[],
): Array<{ key: string; label: string }> {
  return computeActiveFeatSources(
    featureDetails,
    abilityScoreImprovementByGain,
    featsList,
    versatileFeatId,
    eldritchInvocationSelections,
    isSkilledFeatureName,
  ).map(({ key, label }) => ({ key, label }));
}

/** Number of skill/tool picks each Skilled instance grants. */
export const SKILLED_PICKS_PER_SOURCE = 3;

/** Skilled is complete only when every active source has all of its picks filled. */
export function isSkilledFullyChosen(
  data: CharacterFormData,
  featsList: RuleItemResponse[],
): boolean {
  const sources = computeActiveSkilledSources(
    data.featureDetails ?? [],
    data.abilityScoreImprovementByGain,
    featsList,
    data.versatileFeatId,
    data.eldritchInvocationSelections,
  );
  const bySource = data.skilledChoicesBySource ?? {};
  return sources.every((s) => (bySource[s.key]?.length ?? 0) >= SKILLED_PICKS_PER_SOURCE);
}

const SKILL_CHOICE_PREFIX = 'skill:';

/**
 * Prunes `skilledChoicesBySource` to the currently-active sources, rebuilds the flattened list, and
 * reconciles `skillProficiencies` (clearing skills dropped by a removed source unless granted by a
 * non-Skilled source). Returns just the affected fields so callers can spread them. This is the
 * single place that keeps Skilled selections in sync with their sources — called by the derivation
 * and by every panel that adds/removes a Skilled source (so removal resets immediately).
 */
export function reconcileSkilledChoices(
  data: CharacterFormData,
  featsList: RuleItemResponse[],
): Pick<
  CharacterFormData,
  'skilledChoicesBySource' | 'skilledProficiencyChoices' | 'skillProficiencies'
> {
  const activeKeys = computeActiveSkilledSources(
    data.featureDetails ?? [],
    data.abilityScoreImprovementByGain,
    featsList,
    data.versatileFeatId,
    data.eldritchInvocationSelections,
  ).map((s) => s.key);

  // Migration: no source map yet but a flat list exists → chunk it into active sources (3 each).
  let prev = data.skilledChoicesBySource;
  if (!prev && (data.skilledProficiencyChoices?.length ?? 0) > 0) {
    prev = {};
    const items = [...(data.skilledProficiencyChoices ?? [])];
    for (const key of activeKeys) {
      if (items.length === 0) break;
      prev[key] = items.splice(0, SKILLED_PICKS_PER_SOURCE);
    }
  }

  const cleanBySource: Record<string, string[]> = {};
  for (const key of activeKeys) {
    const picks = (prev?.[key] ?? []).slice(0, SKILLED_PICKS_PER_SOURCE);
    if (picks.length > 0) cleanBySource[key] = picks;
  }

  const flat: string[] = [];
  const seen = new Set<string>();
  for (const key of activeKeys) {
    for (const id of cleanBySource[key] ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      flat.push(id);
    }
  }

  const keptSkillKeys = new Set(
    flat
      .filter((id) => id.startsWith(SKILL_CHOICE_PREFIX))
      .map((id) => id.slice(SKILL_CHOICE_PREFIX.length)),
  );
  const nextSkillProf = { ...(data.skillProficiencies ?? {}) };
  for (const old of data.skilledProficiencyChoices ?? []) {
    if (!old.startsWith(SKILL_CHOICE_PREFIX)) continue;
    const skillKey = old.slice(SKILL_CHOICE_PREFIX.length);
    if (keptSkillKeys.has(skillKey)) continue;
    if (!isSkillFromNonSkilledSource(data, skillKey)) nextSkillProf[skillKey] = false;
  }
  for (const key of keptSkillKeys) nextSkillProf[key] = true;

  return {
    skilledChoicesBySource: cleanBySource,
    skilledProficiencyChoices: flat,
    skillProficiencies: nextSkillProf,
  };
}

/**
 * Prunes `magicInitiateChoicesBySource` to the active sources and rebuilds the ordered
 * `magicInitiateChoicesByGain` view. Single source of truth for keeping Magic Initiate in sync with
 * its sources — called by the derivation and by every panel that adds/removes an MI source (ASI,
 * Versatile, Lessons of the First Ones) so removal resets immediately.
 */
export function reconcileMagicInitiateChoices(
  data: CharacterFormData,
  featsList: RuleItemResponse[],
): Pick<CharacterFormData, 'magicInitiateChoicesBySource' | 'magicInitiateChoicesByGain'> {
  const activeSlots = computeActiveMiSourceInfo(
    data.featureDetails ?? [],
    data.abilityScoreImprovementByGain,
    featsList,
    data.versatileFeatId,
    data.eldritchInvocationSelections,
  );

  // Migration: old position-based array but no source map → seed the map from it.
  let sourceMap = data.magicInitiateChoicesBySource;
  if (!sourceMap && (data.magicInitiateChoicesByGain?.length ?? 0) > 0) {
    sourceMap = {};
    const oldGains = data.magicInitiateChoicesByGain ?? [];
    activeSlots.forEach(({ key }, i) => {
      (sourceMap as Record<string, MagicInitiateGain | null>)[key] = oldGains[i] ?? null;
    });
  }

  // Keep only active keys, so a removed source's stale entry can't resurface.
  const cleanSourceMap: Record<string, MagicInitiateGain | null> = {};
  for (const { key } of activeSlots) cleanSourceMap[key] = sourceMap?.[key] ?? null;

  return {
    magicInitiateChoicesBySource: cleanSourceMap,
    magicInitiateChoicesByGain: activeSlots.map(({ key }) => cleanSourceMap[key] ?? null),
  };
}

export function applyDerivedToCharacterData(
  data: CharacterFormData,
  derived: DerivedCharacterStats,
  featsList?: RuleItemResponse[],
  /**
   * True when the character's class just changed. Class-feature selections are then dropped even if
   * the new class happens to share the feature (e.g. Weapon Mastery on Barbarian → Fighter) — the
   * code identifies them by `source: 'class'`, so no per-field list is hardcoded.
   */
  classChanged = false,
): CharacterFormData {
  // Merge: derived initializes all skills to false (complete map), data overrides with saved selections.
  // Background skills from derived are always enforced as true.
  const backgroundSkillKeys = Object.keys(derived.skillProficiencies).filter(
    (k) => derived.skillProficiencies[k]
  );
  const skillProficiencies = { ...derived.skillProficiencies, ...data.skillProficiencies };
  for (const k of backgroundSkillKeys) {
    skillProficiencies[k] = true;
  }

  const classKeys = derived.classSkillOptions?.keys ?? [];
  const chooseN = derived.classSkillOptions?.chooseN ?? (classKeys.length || 999);

  // Validate the persisted class skill picks against the current class options.
  const classSkillProficiencyKeys = (data.classSkillProficiencyKeys ?? [])
    .filter((k) => classKeys.length === 0 || classKeys.includes(k))
    .filter((k) => !backgroundSkillKeys.includes(k))
    .slice(0, chooseN);
  for (const k of classSkillProficiencyKeys) {
    skillProficiencies[k] = true;
  }

  for (const k of classSkillProficiencyKeys) skillProficiencies[k] = true;

  // Apply Skilled feat picks: skill:* entries mark skills as proficient.
  for (const choice of data.skilledProficiencyChoices ?? []) {
    if (choice.startsWith('skill:')) {
      const key = choice.slice('skill:'.length);
      if (key) skillProficiencies[key] = true;
    }
  }

  const speedStr = derived.speed != null && derived.speed > 0 ? String(derived.speed) : '';

  const prevClassOptions = data.startingEquipmentOptions?.options ?? [];
  const nextClassOptions = derived.startingEquipmentOptions?.options ?? [];
  // Only treat as "changed" when there were previous options — empty prev means initial
  // load/derivation (not a real class change), so we preserve the persisted index.
  const classOptionsChanged =
    prevClassOptions.length > 0 &&
    !areStartingEquipmentParsedOptionsEquivalent(prevClassOptions, nextClassOptions);
  const prevBackgroundOptions = data.backgroundEquipmentOptions?.options ?? [];
  const nextBackgroundOptions = derived.backgroundEquipmentOptions?.options ?? [];
  const backgroundOptionsChanged =
    prevBackgroundOptions.length > 0 &&
    !areStartingEquipmentParsedOptionsEquivalent(prevBackgroundOptions, nextBackgroundOptions);

  const prevClassText =
    data.startingEquipmentSelectedIndex != null &&
    data.startingEquipmentOptions?.options?.[data.startingEquipmentSelectedIndex]
      ? data.startingEquipmentOptions.options[data.startingEquipmentSelectedIndex].text
      : null;
  const prevBackgroundText =
    data.backgroundEquipmentSelectedIndex != null &&
    data.backgroundEquipmentOptions?.options?.[data.backgroundEquipmentSelectedIndex]
      ? data.backgroundEquipmentOptions.options[data.backgroundEquipmentSelectedIndex].text
      : null;
  let nextEquipment = data.equipment ?? '';
  let nextEquipmentSpentGP = data.equipmentSpentGP ?? 0;
  let nextPurchasedEquipment = data.purchasedEquipment ?? [];
  const treatEquipmentAsManual =
    data.startingEquipmentSelectedIndex == null && data.backgroundEquipmentSelectedIndex == null;
  if (classOptionsChanged || backgroundOptionsChanged) {
    if (treatEquipmentAsManual) {
      // When we don't track class/background starting set selections, treat the current
      // `data.equipment` string as the final truth and do not split/strip it.
      nextEquipmentSpentGP = data.equipmentSpentGP ?? 0;
      nextPurchasedEquipment = data.purchasedEquipment ?? [];
    } else {
      const { classLines, backgroundLines, manualLines } = splitEquipmentBySource(
        data.equipment ?? '',
        prevClassText,
        prevBackgroundText
      );
      const joinBuckets = (...buckets: string[][]) =>
        buckets
          .map((lines) => lines.join('\n'))
          .filter((s) => s.trim().length > 0)
          .join('\n');
      // Only drop the tier whose option list changed; preserve the other source + manual additions.
      if (classOptionsChanged && backgroundOptionsChanged) {
        nextEquipment = joinBuckets(manualLines);
      } else if (classOptionsChanged) {
        nextEquipment = joinBuckets(backgroundLines, manualLines);
      } else {
        nextEquipment = joinBuckets(classLines, manualLines);
      }
      nextEquipmentSpentGP = 0;
      nextPurchasedEquipment = [];
    }
  } else {
    if (classOptionsChanged && prevClassText) {
      nextEquipment = getEquipmentWithoutSource(nextEquipment, prevClassText);
    }
    if (backgroundOptionsChanged && prevBackgroundText) {
      nextEquipment = getEquipmentWithoutSource(nextEquipment, prevBackgroundText);
    }
  }
  const startingEquipmentSelectedIndex = classOptionsChanged
    ? null
    : (data.startingEquipmentSelectedIndex ?? null);
  const backgroundEquipmentSelectedIndex = backgroundOptionsChanged
    ? null
    : (data.backgroundEquipmentSelectedIndex ?? null);

  const nextBgAbilityOption = derived.backgroundAbilityScoreOption ?? null;
  const prevBgAbilityOption = data.backgroundAbilityScoreOption ?? null;
  const allowedChanged =
    JSON.stringify(nextBgAbilityOption?.allowedAbilityNames ?? []) !==
    JSON.stringify(prevBgAbilityOption?.allowedAbilityNames ?? []);
  // Only reset when the background option genuinely changed (not when prevBgAbilityOption is null,
  // which happens when loading a saved sheet — backgroundAbilityScoreOption is not persisted).
  const bgAbilityOptionChanged =
    prevBgAbilityOption !== null &&
    (nextBgAbilityOption?.totalPoints !== prevBgAbilityOption?.totalPoints ||
      nextBgAbilityOption?.maxPerAbility !== prevBgAbilityOption?.maxPerAbility ||
      allowedChanged);
  const backgroundAbilityScoreOption = nextBgAbilityOption;
  const backgroundAbilityScoreIncrease =
    !nextBgAbilityOption || bgAbilityOptionChanged
      ? {}
      : (data.backgroundAbilityScoreIncrease ?? {});

  // Preserve tool proficiency choices for keys that still appear in derived proficiencies.
  // Keys matching "Choose N/one ..." are real proficiency choices — filtered by derived profs.
  // Equipment placeholder keys are source-scoped: class keys are dropped when class options
  // change, background keys when background options change.
  const derivedProfs = derived.proficiencies ?? '';
  const prevChoices = data.toolProficiencyChoices ?? {};
  const toolProficiencyChoices: Record<string, string[]> = {};
  const TOOL_PROFICIENCY_KEY_RE = /^Choose\s+(?:\d+|one)\b/i;
  const EQUIPMENT_CLASS_CHOICE_KEYS = new Set(['Musical Instrument of your choice']);
  const EQUIPMENT_BG_CHOICE_KEYS = new Set(['Musical Instrument of your choice (Background)']);
  for (const key of Object.keys(prevChoices)) {
    if (TOOL_PROFICIENCY_KEY_RE.test(key)) {
      if (toolChooseKeyStillReferencedInDerived(derivedProfs, key))
        toolProficiencyChoices[key] = prevChoices[key];
    } else if (classOptionsChanged && EQUIPMENT_CLASS_CHOICE_KEYS.has(key)) {
      // Class equipment options changed — drop class-scoped placeholder choices
    } else if (backgroundOptionsChanged && EQUIPMENT_BG_CHOICE_KEYS.has(key)) {
      // Background equipment options changed — drop background-scoped placeholder choices
    } else {
      toolProficiencyChoices[key] = prevChoices[key];
    }
  }

  // Preserve only raceTraitSelections whose trait still exists in derived features. On a class
  // change, also drop any selection belonging to a class-sourced feature (e.g. Fighting Style,
  // shared by Fighter/Paladin/Ranger) — identified by source, so race/background traits are kept
  // and no feature name is hardcoded.
  const currentFeatureNames = new Set(derived.featureDetails.map((f) => f.name));
  const classFeatureNames = new Set(
    derived.featureDetails.filter((f) => f.source === 'class').map((f) => f.name)
  );
  const raceTraitSelections: Record<string, string> = {};
  for (const [name, sel] of Object.entries(data.raceTraitSelections ?? {})) {
    if (!currentFeatureNames.has(name)) continue;
    if (classChanged && classFeatureNames.has(name)) continue;
    raceTraitSelections[name] = sel;
  }

  // Same as raceTraitSelections: drop the spellcasting-ability choice for Elven Lineage /
  // Gnomish Lineage / Fiendish Legacy when the trait disappears (e.g. race changed away),
  // so a stale choice doesn't silently reappear if the trait comes back later.
  const raceLineageSpellcastingAbility: Record<string, string> = {};
  for (const [name, ability] of Object.entries(data.raceLineageSpellcastingAbility ?? {})) {
    if (currentFeatureNames.has(name)) raceLineageSpellcastingAbility[name] = ability;
  }

  const keenSensesFeat = derived.featureDetails.find(
    (f) => f.source === 'race' && f.name.trim().toLowerCase() === 'keen senses'
  );
  const keenSensesOpts = keenSensesFeat?.options ?? [];
  if (keenSensesFeat && keenSensesOpts.length > 0) {
    const traitName = keenSensesFeat.name;
    const prevSel = raceTraitSelections[traitName];
    if (prevSel && !keenSensesOpts.some((o) => o.key === prevSel)) {
      delete raceTraitSelections[traitName];
    }
    if (keenSensesOpts.length === 1) {
      raceTraitSelections[traitName] = keenSensesOpts[0].key;
    }
    const sel = raceTraitSelections[traitName];
    if (sel && keenSensesOpts.some((o) => o.key === sel)) {
      skillProficiencies[sel] = true;
    }
  }

  const skillfulFeat = derived.featureDetails.find(
    (f) => f.name.trim().toLowerCase() === 'skillful'
  );
  const skillfulOpts = skillfulFeat?.options ?? [];
  if (skillfulFeat && skillfulOpts.length > 0) {
    const traitName = skillfulFeat.name;
    const prevSf = raceTraitSelections[traitName];
    if (prevSf && !skillfulOpts.some((o) => o.key === prevSf)) {
      delete raceTraitSelections[traitName];
    }
    const sfSel = raceTraitSelections[traitName];
    if (sfSel && skillfulOpts.some((o) => o.key === sfSel)) {
      skillProficiencies[sfSel] = true;
    }
  }

  // High Elf cantrip override: clear when race changes or lineage is no longer High Elf
  const elvenLineageFeatForHighElf = derived.featureDetails.find(
    (f) => f.source === 'race' && f.name.trim().toLowerCase() === 'elven lineage'
  );
  const highElfCantripName =
    elvenLineageFeatForHighElf &&
    raceTraitSelections[elvenLineageFeatForHighElf.name] === 'high-elf'
      ? (data.highElfCantripName ?? null)
      : null;

  // Class-ability selections are cleared only when their granting class feature is gone (the class
  // changed away from one that has it) — never on a level change. Leveling up adds features but
  // keeps the ones already present, so picks must survive level changes (and a higher level may even
  // grant more of them). Each selection below is reset by its own feature's presence, not a blanket
  // "the class feature set changed" flag (which also flips when a new feature unlocks on level-up).
  const hasClassFeature = (name: string): boolean =>
    derived.featureDetails.some(
      (f) => f.source === 'class' && f.name.trim().toLowerCase() === name
    );
  // A class-feature selection survives while its feature is present, but a class change drops it even
  // when the new class shares the feature (Weapon Mastery, Expertise, …). Identified by feature
  // source, so there's no hardcoded per-feature reset list.
  const keepsClassSelection = (name: string): boolean => hasClassFeature(name) && !classChanged;
  const weaponMasteryWeaponIds = keepsClassSelection('weapon mastery')
    ? (data.weaponMasteryWeaponIds ?? [])
    : [];
  const primalKnowledgeSkillKey = keepsClassSelection('primal knowledge')
    ? (data.primalKnowledgeSkillKey ?? null)
    : null;
  if (primalKnowledgeSkillKey) skillProficiencies[primalKnowledgeSkillKey] = true;
  const metamagicOptionKeys = keepsClassSelection('metamagic')
    ? (data.metamagicOptionKeys ?? [])
    : [];

  const expertiseFeat = derived.featureDetails.find(
    (f) => f.source === 'class' && f.name.trim().toLowerCase() === 'expertise'
  );
  const maxExpertiseSelections = expertiseFeat != null ? (expertiseFeat.gainCount ?? 1) * 2 : 0;
  let expertiseSkillKeys: string[];
  if (!expertiseFeat || maxExpertiseSelections === 0 || classChanged) {
    expertiseSkillKeys = [];
  } else {
    const prev = data.expertiseSkillKeys ?? [];
    expertiseSkillKeys =
      prev.length > maxExpertiseSelections ? prev.slice(0, maxExpertiseSelections) : prev;
  }

  const hasDeftExplorerFeat = derived.featureDetails.some(
    (f) => f.source === 'class' && f.name.trim().toLowerCase() === 'deft explorer'
  );
  const hasScholarFeat = derived.featureDetails.some(
    (f) => f.source === 'class' && f.name.trim().toLowerCase() === 'scholar'
  );
  let scholarExpertiseSkillKey =
    hasScholarFeat && !classChanged ? (data.scholarExpertiseSkillKey ?? null) : null;
  let deftExplorerExpertiseSkillKey =
    hasDeftExplorerFeat && !classChanged ? (data.deftExplorerExpertiseSkillKey ?? null) : null;
  let deftExplorerLanguageNames =
    hasDeftExplorerFeat && !classChanged ? [...(data.deftExplorerLanguageNames ?? [])] : [];
  if (scholarExpertiseSkillKey && skillProficiencies[scholarExpertiseSkillKey] !== true) {
    scholarExpertiseSkillKey = null;
  }
  if (deftExplorerExpertiseSkillKey && skillProficiencies[deftExplorerExpertiseSkillKey] !== true) {
    deftExplorerExpertiseSkillKey = null;
  }
  if (deftExplorerExpertiseSkillKey && expertiseSkillKeys.includes(deftExplorerExpertiseSkillKey)) {
    deftExplorerExpertiseSkillKey = null;
  }
  {
    const seen = new Set<string>();
    const k = (s: string) => s.trim().toLowerCase();
    deftExplorerLanguageNames = deftExplorerLanguageNames
      .map((s) => String(s).trim())
      .filter(Boolean)
      .filter((s) => {
        const key = k(s);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 2);
  }
  if (scholarExpertiseSkillKey && !expertiseSkillKeys.includes(scholarExpertiseSkillKey)) {
    expertiseSkillKeys = [...expertiseSkillKeys, scholarExpertiseSkillKey];
  }
  if (
    deftExplorerExpertiseSkillKey &&
    !expertiseSkillKeys.includes(deftExplorerExpertiseSkillKey)
  ) {
    expertiseSkillKeys = [...expertiseSkillKeys, deftExplorerExpertiseSkillKey];
  }

  const hasThievesCantFeat = derived.featureDetails.some(
    (f) => f.source === 'class' && isThievesCantFeatureName(f.name)
  );
  const thievesCantExtraLanguageName =
    hasThievesCantFeat && !classChanged
      ? (() => {
          const raw = data.thievesCantExtraLanguageName;
          if (raw == null || String(raw).trim() === '') return null;
          return String(raw).trim();
        })()
      : null;

  const eldritchFeat = derived.featureDetails.find(
    (f) =>
      f.source === 'class' &&
      (f.name.trim().toLowerCase() === 'eldritch invocations' ||
        f.name.trim().toLowerCase() === 'eldritch invocation')
  );
  const maxEldritchSelections =
    getEldritchInvocationsKnown(eldritchFeat, data.level) || (eldritchFeat?.gainCount ?? 0);
  let eldritchInvocationSelections: EldritchInvocationSelection[] = [];
  if (eldritchFeat && maxEldritchSelections > 0 && !classChanged) {
    // Keep only selections that belong to the current class's invocation list. This clears
    // leftovers on a class change (the feat is gone for non-Warlocks) WITHOUT wiping valid
    // picks on a level-up — so leveling never silently drops invocations.
    const validKeys = new Set((eldritchFeat.options ?? []).map((o) => o.key));
    const known = (data.eldritchInvocationSelections ?? []).filter((s) => validKeys.has(s.key));
    const sliced =
      known.length > maxEldritchSelections ? known.slice(0, maxEldritchSelections) : known;
    // Drop selections orphaned by a level drop or a removed prerequisite invocation/pact.
    eldritchInvocationSelections = pruneEldritchInvocationSelections(sliced, eldritchFeat.options ?? [], {
      characterLevel: data.level,
      featureNamesLower: derived.featureDetails.map((f) => f.name.trim().toLowerCase()),
    });
  }

  const mysticArcanumFeat = derived.featureDetails.find(
    (f) => f.source === 'class' && f.name.trim().toLowerCase() === 'mystic arcanum'
  );
  const maxMysticArcanumGains = mysticArcanumFeat?.gainCount ?? 0;
  let mysticArcanumSpellNamesByGain: (string | null)[];
  if (!mysticArcanumFeat || maxMysticArcanumGains === 0) {
    mysticArcanumSpellNamesByGain = [];
  } else {
    const prev = data.mysticArcanumSpellNamesByGain ?? [];
    mysticArcanumSpellNamesByGain = Array.from({ length: maxMysticArcanumGains }, (_, i) => {
      if (i >= prev.length) return null;
      const v = prev[i];
      return v != null && String(v).trim() ? String(v).trim() : null;
    });
  }

  const asiClassFeat = derived.featureDetails.find(
    (f) => f.source === 'class' && f.name.trim().toLowerCase() === 'ability score improvement'
  );
  const maxAsiGains = asiClassFeat?.gainCount ?? 0;

  let abilityScoreImprovementByGainResolved: AbilityScoreImprovementGainChoice[];

  if (!asiClassFeat || maxAsiGains === 0) {
    abilityScoreImprovementByGainResolved = [];
  } else {
    // Resolve the ASI against the DERIVED features/background, not the stale input. On load a
    // saved sheet has empty featureDetails (not persisted), so using `data` here would compute
    // the wrong caps/flags (e.g. miss Primal Champion's 25 cap, miscount Epic Boon) and clamp
    // valid choices — making the viewer disagree with the editor.
    const dataForAsiResolution: CharacterFormData = {
      ...data,
      featureDetails: derived.featureDetails,
      backgroundAbilityScoreOption,
      backgroundAbilityScoreIncrease,
    };
    const byGain = abilityScoreImprovementByGainForCount(data, maxAsiGains);
    abilityScoreImprovementByGainResolved = canApplyAbilityScoreImprovementASI(dataForAsiResolution)
      ? clampAbilityScoreImprovementByGain(byGain, maxAsiGains, dataForAsiResolution)
      : byGain.map((g) =>
          g?.kind === 'increase_scores' && sumIncreaseScoresInGain(g) > 0 ? null : g
        );
  }

  const base: CharacterFormData = {
    ...data,
    raceTraitSelections,
    raceLineageSpellcastingAbility,
    hitDice: derived.hitDice ?? '',
    speed: speedStr,
    proficiencies: derived.proficiencies,
    features: derived.features,
    featureDetails: derived.featureDetails,
    savingThrows: derived.savingThrows,
    skillProficiencies,
    classSkillOptions: derived.classSkillOptions,
    classSkillProficiencyKeys,
    backgroundSkillKeys,
    toolProficiencyChoices,
    // Holy Symbol picks are scoped to the starting-equipment options; drop the tier whose options changed.
    holySymbolChoiceItemIds: {
      class: classOptionsChanged ? null : (data.holySymbolChoiceItemIds?.class ?? null),
      background: backgroundOptionsChanged
        ? null
        : (data.holySymbolChoiceItemIds?.background ?? null),
    },
    startingEquipmentOptions: derived.startingEquipmentOptions,
    startingEquipmentSelectedIndex,
    backgroundEquipmentOptions: derived.backgroundEquipmentOptions,
    backgroundEquipmentSelectedIndex,
    backgroundAbilityScoreOption,
    backgroundAbilityScoreIncrease,
    equipment: nextEquipment,
    equipmentSpentGP: nextEquipmentSpentGP,
    purchasedEquipment: nextPurchasedEquipment,
    weaponMasteryWeaponIds,
    primalKnowledgeSkillKey,
    metamagicOptionKeys,
    expertiseSkillKeys,
    scholarExpertiseSkillKey,
    deftExplorerExpertiseSkillKey,
    deftExplorerLanguageNames,
    thievesCantExtraLanguageName,
    highElfCantripName,
    eldritchInvocationSelections,
    mysticArcanumSpellNamesByGain,
    abilityScoreImprovementByGain: abilityScoreImprovementByGainResolved,
  };

  // Keep Magic Initiate and Skilled selections in sync with their active sources. The
  // source-changing panels call these same helpers so a removed source resets immediately,
  // even when this full derivation does not re-run. Feat prerequisites are reconciled first so any
  // feat dropped for an unmet prerequisite also releases the MI/Skilled source it granted.
  if (featsList && featsList.length > 0) {
    Object.assign(base, reconcileFeatPrerequisites(base, featsList));
    Object.assign(base, reconcileMagicInitiateChoices(base, featsList));
    Object.assign(base, reconcileSkilledChoices(base, featsList));
  }
  Object.assign(base, reconcileDependentSelections(base));

  return applyCombatFromAttributes(base, featsList);
}

/**
 * Re-validates selections that depend on already-computed sheet state (no rule-item parsing, so it
 * is cheap enough to run on every edit). A selection is reset the moment what it referenced becomes
 * invalid — e.g. Expertise on a skill that loses its proficiency after a Skilled pick is removed or
 * a sub-race changes. Returns the same object when nothing needs pruning (so it never forces a
 * needless re-render). This is the single, central guard against the "stale selection" bug class;
 * extend it here when a new selection that references dynamic state is added.
 */
export function reconcileDependentSelections(data: CharacterFormData): CharacterFormData {
  const prof = data.skillProficiencies ?? {};
  let next = data;

  // Expertise (and its Scholar / Deft Explorer variants) can only apply to a skill the character is
  // currently proficient in.
  const expertise = data.expertiseSkillKeys ?? [];
  const validExpertise = expertise.filter((k) => prof[k] === true);
  if (validExpertise.length !== expertise.length) {
    next = { ...next, expertiseSkillKeys: validExpertise };
  }
  if (data.scholarExpertiseSkillKey && prof[data.scholarExpertiseSkillKey] !== true) {
    next = { ...next, scholarExpertiseSkillKey: null };
  }
  if (data.deftExplorerExpertiseSkillKey && prof[data.deftExplorerExpertiseSkillKey] !== true) {
    next = { ...next, deftExplorerExpertiseSkillKey: null };
  }

  // Fighting Style cantrips (Blessed/Druidic Warrior) exist only while that option is the active
  // Fighting Style choice; clear them when it isn't (switched to a feat / different style / feature
  // gone), and clamp if somehow over the limit.
  const fsGrant = getFightingStyleCantripGrant(next);
  const fsCantrips = next.fightingStyleCantrips ?? [];
  if (!fsGrant && fsCantrips.length > 0) {
    next = { ...next, fightingStyleCantrips: [] };
  } else if (fsGrant && fsCantrips.length > fsGrant.max) {
    next = { ...next, fightingStyleCantrips: fsCantrips.slice(0, fsGrant.max) };
  }

  return next;
}
