/**
 * Eldritch Invocation rules parsed from the option descriptions (SRD 2024 text).
 * Centralizes the "is this repeatable / does it need a cantrip pick" logic so the
 * picker UI and the save validation stay in agreement.
 */

export interface EldritchInvocationSelection {
  /** Option key from the feature's parsed options. */
  key: string;
  /** Chosen cantrip name for invocations that require one (Agonizing Blast, Eldritch Spear, Repelling Blast). */
  spellName?: string | null;
  /** Chosen feat id for invocations that grant a feat (Lessons of the First Ones → Origin feat). */
  featId?: string | null;
}

/** True when the invocation can be taken more than once (each instance counts toward the known total). */
export function isRepeatableInvocation(desc: string | undefined | null): boolean {
  const d = (desc ?? '').toLowerCase();
  return d.includes('repeatable') || d.includes('gain this invocation more than once');
}

/**
 * True when the invocation requires the player to choose one of their known Warlock cantrips
 * (Agonizing Blast / Eldritch Spear → "that deals damage"; Repelling Blast → "that requires an
 * attack roll"). The shared lead-in is always "Choose one of your known Warlock cantrips".
 */
export function invocationRequiresCantrip(desc: string | undefined | null): boolean {
  return /choose one of your known warlock cantrips?/i.test(desc ?? '');
}

/** True when the invocation grants an Origin feat of the player's choice (Lessons of the First Ones). */
export function invocationRequiresOriginFeat(desc: string | undefined | null): boolean {
  return /origin feat/i.test(desc ?? '');
}

/**
 * The spell an invocation grants to the sheet, or null. Matches "You learn the *Spell*" and
 * "You can cast *Spell*" (Pact of the Chain → Find Familiar, Armor of Shadows → Mage Armor, …).
 */
export function invocationGrantedSpellName(desc: string | undefined | null): string | null {
  const m = (desc ?? '').match(/you (?:learn the|can(?: also)? cast)\s+\*([^*]+)\*/i);
  return m ? m[1].trim() : null;
}

/** Pact of the Tome's Book of Shadows: pick 3 cantrips + 2 level-1 ritual spells (handled on the spells page). */
export function isPactOfTomeOption(desc: string | undefined | null): boolean {
  const d = (desc ?? '').toLowerCase();
  return d.includes('choose three cantrips') && d.includes('ritual');
}

/** Book of Shadows quotas: 3 cantrips + 2 level-1 ritual spells from any class. */
export const PACT_OF_TOME_MAX_CANTRIPS = 3;
export const PACT_OF_TOME_MAX_RITUALS = 2;

/** Book of Shadows is complete only when all 3 cantrips and 2 ritual spells are chosen. */
export function isPactOfTomeBookComplete(
  pactOfTomeSpellNames: { cantrips?: string[]; rituals?: string[] } | undefined | null,
): boolean {
  const cantrips = pactOfTomeSpellNames?.cantrips ?? [];
  const rituals = pactOfTomeSpellNames?.rituals ?? [];
  return (
    cantrips.length >= PACT_OF_TOME_MAX_CANTRIPS && rituals.length >= PACT_OF_TOME_MAX_RITUALS
  );
}

/** True when one of the selected invocations is Pact of the Tome (its Book of Shadows is then required). */
export function isPactOfTomeSelected(
  selections: EldritchInvocationSelection[],
  optionDescByKey: Map<string, string>,
): boolean {
  return selections.some((s) => isPactOfTomeOption(optionDescByKey.get(s.key)));
}

/** A single selected instance is complete when its required sub-choice (cantrip / feat) is filled. */
export function isInvocationSelectionComplete(
  selection: EldritchInvocationSelection,
  optionDescByKey: Map<string, string>,
): boolean {
  const desc = optionDescByKey.get(selection.key) ?? '';
  if (invocationRequiresCantrip(desc)) {
    return Boolean(selection.spellName && selection.spellName.trim());
  }
  if (invocationRequiresOriginFeat(desc)) {
    return Boolean(selection.featId && selection.featId.trim());
  }
  return true;
}

/** Every selected instance has its required pick, and the count matches Invocations Known. */
export function areEldritchInvocationsFullyChosen(
  selections: EldritchInvocationSelection[],
  optionDescByKey: Map<string, string>,
  invocationsKnown: number,
): boolean {
  if (selections.length !== invocationsKnown) return false;
  return selections.every((s) => isInvocationSelectionComplete(s, optionDescByKey));
}

export interface EldritchInvocationOptionMeta {
  key: string;
  label: string;
  prerequisite?: string;
}

interface InvocationPrerequisiteContext {
  characterLevel: number;
  /** Lowercased class/race feature names (for Pact Boon prereqs granted as features). */
  featureNamesLower: string[];
  selectedInvocationKeys: string[];
  allInvocationOptions: Array<{ key: string; label: string }>;
  currentOptionKey: string;
}

/**
 * Whether the character may select an Eldritch Invocation option. Level, Pact Boon, and
 * "requires another invocation" prerequisites are validated; cantrip/spell prerequisites are not.
 */
export function eldritchInvocationPrerequisiteAllowsSelect(
  prerequisite: string | undefined,
  params: InvocationPrerequisiteContext,
): boolean {
  const raw = prerequisite?.trim();
  if (!raw) return true;

  const flat = raw.replace(/\*+/g, '').replace(/\s+/g, ' ').trim();

  const ordLevelMatches = [...flat.matchAll(/\b(\d+)(?:st|nd|rd|th)?\s+level\b/gi)];
  const wordLevelMatches = [...flat.matchAll(/\blevel\s+(\d+)\b/gi)];
  const levelNums: number[] = [];
  for (const m of ordLevelMatches) levelNums.push(parseInt(m[1], 10));
  for (const m of wordLevelMatches) levelNums.push(parseInt(m[1], 10));
  if (levelNums.length > 0) {
    const need = Math.max(...levelNums);
    if (params.characterLevel < need) return false;
  }

  const pactRe = /\bpact\s+of\s+the\s+([a-z]+)\b/gi;
  for (const m of flat.matchAll(pactRe)) {
    const fragment = `pact of the ${m[1].toLowerCase()}`;
    // In SRD 2024 the Pact Boons (Pact of the Blade/Chain/Tome) are themselves Eldritch
    // Invocations, so the requirement is met by a class feature OR a selected invocation.
    const hasFeature = params.featureNamesLower.some((n) => n.includes(fragment));
    const hasInvocation = params.allInvocationOptions.some(
      (o) =>
        o.key !== params.currentOptionKey &&
        o.label.trim().toLowerCase() === fragment &&
        params.selectedInvocationKeys.includes(o.key),
    );
    if (!hasFeature && !hasInvocation) return false;
  }

  const invRe = /\b(?:the\s+)?([A-Za-z][A-Za-z'\s-]{2,50}?)\s+invocation\b/gi;
  const ignorePhrase = new Set(['eldritch', 'your', 'this', 'other', 'one', 'any', 'an', 'new', 'additional']);
  for (const m of flat.matchAll(invRe)) {
    const phrase = m[1].trim().toLowerCase().replace(/\s+/g, ' ');
    if (phrase.length < 4 || ignorePhrase.has(phrase)) continue;
    const matched = params.allInvocationOptions.find((o) => {
      if (o.key === params.currentOptionKey) return false;
      return o.label.trim().toLowerCase() === phrase;
    });
    if (matched && !params.selectedInvocationKeys.includes(matched.key)) return false;
  }

  return true;
}

/**
 * Drops selected invocations whose prerequisite is no longer met (level dropped, a required
 * invocation/pact removed, etc.). Re-checks transitively until the set is stable.
 */
export function pruneEldritchInvocationSelections(
  selections: EldritchInvocationSelection[],
  options: EldritchInvocationOptionMeta[],
  ctx: { characterLevel: number; featureNamesLower: string[] },
): EldritchInvocationSelection[] {
  const optionByKey = new Map(options.map((o) => [o.key, o]));
  const allInvocationOptions = options.map((o) => ({ key: o.key, label: o.label }));
  let current = selections;
  for (let guard = 0; guard <= options.length; guard++) {
    const kept = current.filter((sel) => {
      const opt = optionByKey.get(sel.key);
      if (!opt) return true;
      return eldritchInvocationPrerequisiteAllowsSelect(opt.prerequisite, {
        characterLevel: ctx.characterLevel,
        featureNamesLower: ctx.featureNamesLower,
        selectedInvocationKeys: current.map((s) => s.key),
        allInvocationOptions,
        currentOptionKey: sel.key,
      });
    });
    if (kept.length === current.length) return current;
    current = kept;
  }
  return current;
}
