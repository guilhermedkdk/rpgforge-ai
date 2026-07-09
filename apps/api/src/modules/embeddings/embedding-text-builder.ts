const CHARS_PER_TOKEN_ESTIMATE = 4;
const MAX_INPUT_TOKENS = 6000;
const MAX_BATCH_TOKENS = 250_000;
const MAX_BATCH_ITEMS = 96;

interface EmbeddableRuleItem {
  name: string;
  kind: string;
  contentMd: string | null;
  normalized: unknown;
}

type Norm = Record<string, unknown>;

const asObj = (v: unknown): Norm | null => (v && typeof v === 'object' ? (v as Norm) : null);
const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;
/** Reads a `{ name }` object or a bare string. */
const named = (v: unknown): string | null =>
  typeof v === 'string' ? str(v) : str(asObj(v)?.name);

const languageRarityOf = (normalized: unknown): string | null => str(asObj(normalized)?.languageRarity);

/** Provenance header lines injected into contentMd by ingestion — pure noise for embeddings, and
 * identical across every class/race/background/ruleset, which would inflate their mutual similarity. */
function stripContentMdBoilerplate(md: string | null): string | null {
  if (!md?.trim()) return null;
  const cleaned = md
    .split('\n')
    .filter((line) => !/^\s*>\s*(Fonte|Documento|URL)\b/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned || null;
}

function spellFacts(n: Norm): string[] {
  const facts: string[] = [];
  if (typeof n.level === 'number') facts.push(n.level === 0 ? 'cantrip' : `level ${n.level}`);
  const school = named(n.school);
  if (school) facts.push(school.toLowerCase());
  const castingTime = str(n.castingTime);
  if (castingTime) facts.push(`casting time ${castingTime}`);
  const range = str(n.rangeText) ?? (typeof n.range === 'number' ? `${n.range} feet` : null);
  if (range) facts.push(`range ${range}`);
  const duration = str(n.duration);
  if (duration) facts.push(`duration ${duration}`);
  if (n.concentration === true) facts.push('concentration');
  if (n.ritual === true) facts.push('ritual');
  const damage = str(n.damageRoll);
  if (damage) {
    const types = Array.isArray(n.damageTypes)
      ? n.damageTypes.filter((d): d is string => typeof d === 'string')
      : [];
    facts.push(`deals ${damage}${types.length ? ` ${types.join('/')}` : ''} damage`);
  }
  const save = str(n.savingThrowAbility);
  if (save) facts.push(`${save} saving throw`);
  if (n.attackRoll === true) facts.push('spell attack roll');
  const shape = str(n.shapeType);
  if (shape && typeof n.shapeSize === 'number') facts.push(`${n.shapeSize}-foot ${shape}`);
  return facts;
}

function itemFacts(n: Norm): string[] {
  const facts: string[] = [];
  const weapon = asObj(n.weapon);
  const armor = asObj(n.armor);

  if (weapon) {
    const category =
      weapon.isSimple === true ? 'simple' : weapon.isMartial === true ? 'martial' : null;
    facts.push(category ? `${category} weapon` : 'weapon');
    const dice = str(weapon.damageDice);
    const damageType = named(weapon.damageType);
    if (dice) facts.push(`${dice}${damageType ? ` ${damageType.toLowerCase()}` : ''} damage`);
    const props = Array.isArray(weapon.properties)
      ? weapon.properties
          .map((p) => named(asObj(p)?.property))
          .filter((name): name is string => !!name)
      : [];
    if (props.length) facts.push(`properties: ${props.join(', ')}`);
  } else if (armor) {
    const category = str(armor.category);
    facts.push(category ? `${category} armor` : 'armor');
    const ac = str(armor.acDisplay) ?? (typeof armor.acBase === 'number' ? String(armor.acBase) : null);
    if (ac) facts.push(`AC ${ac}`);
    if (typeof armor.strengthScoreRequired === 'number')
      facts.push(`requires Strength ${armor.strengthScoreRequired}`);
    if (armor.grantsStealthDisadvantage === true) facts.push('disadvantage on Stealth');
  } else {
    const category = str(n.categoryName) ?? named(n.category);
    if (category) facts.push(category.toLowerCase());
  }

  const rarity = named(n.rarity);
  if (rarity) facts.push(rarity.toLowerCase());
  if (n.requiresAttunement === true) facts.push('requires attunement');
  return facts;
}

function featFacts(n: Norm): string[] {
  const facts: string[] = [];
  const type = str(n.type);
  if (type) facts.push(`${type.toLowerCase()} feat`);
  const prerequisite = str(n.prerequisite);
  if (prerequisite) facts.push(`prerequisite: ${prerequisite}`);
  return facts;
}

function classFeatureFacts(n: Norm): string[] {
  const gainedAt = Array.isArray(n.gainedAt) ? asObj(n.gainedAt[0]) : null;
  const level = gainedAt?.level;
  return typeof level === 'number' ? [`gained at level ${level}`] : [];
}

/** Structured, human-meaningful fields per kind — skips bookkeeping (documentKey, size, weightUnit…). */
function structuredFacts(kind: string, normalized: unknown): string[] {
  const n = asObj(normalized);
  if (!n) return [];
  switch (kind) {
    case 'SPELL':
      return spellFacts(n);
    case 'ITEM':
      return itemFacts(n);
    case 'FEAT':
      return featFacts(n);
    case 'CLASS_FEATURE':
      return classFeatureFacts(n);
    case 'OTHER':
      return languageRarityOf(n) ? [`${languageRarityOf(n)} language`] : [];
    default:
      return [];
  }
}

/** The item's description, from wherever the pipeline stored it for that kind. */
function description(item: EmbeddableRuleItem): string | null {
  const md = stripContentMdBoilerplate(item.contentMd);
  if (md) return md;
  const n = asObj(item.normalized);
  if (!n) return null;
  if (item.kind === 'FEAT') {
    const benefits = Array.isArray(n.benefits)
      ? n.benefits.map((b) => str(asObj(b)?.desc)).filter((d): d is string => !!d)
      : [];
    return [str(n.desc), ...benefits].filter(Boolean).join(' ') || null;
  }
  if (item.kind === 'SPELL') {
    return [str(n.desc), str(n.higherLevel)].filter(Boolean).join(' ') || null;
  }
  return str(n.desc);
}

/** Builds the text embedded for a rule item: name + kind + structured facts + description. */
export function buildEmbeddingText(item: EmbeddableRuleItem): string {
  const label =
    item.kind === 'OTHER' && languageRarityOf(item.normalized)
      ? 'language'
      : item.kind.replace('_', ' ').toLowerCase();
  const parts = [item.name, label, ...structuredFacts(item.kind, item.normalized)];
  const desc = description(item);
  if (desc) parts.push(desc);
  return truncateForEmbedding(parts.join(' — '));
}

/** Defensive cap well under the model's 8192-token single-input limit. */
export function truncateForEmbedding(text: string): string {
  const maxChars = MAX_INPUT_TOKENS * CHARS_PER_TOKEN_ESTIMATE;
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

/** Greedy batcher respecting OpenAI's per-request limits (2048 items / 300k tokens). */
export function batchByTokenBudget(texts: string[]): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let currentTokens = 0;

  for (const text of texts) {
    const estTokens = Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
    if (
      current.length &&
      (current.length >= MAX_BATCH_ITEMS || currentTokens + estTokens > MAX_BATCH_TOKENS)
    ) {
      batches.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(text);
    currentTokens += estTokens;
  }
  if (current.length) batches.push(current);
  return batches;
}

/** `[1,2,3]` literal for embedding a vector into raw SQL with an explicit `::vector` cast. */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}
