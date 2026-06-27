import {
  CLASS_MARKER_SPELLBOOK_CASTER,
  type RuleItemKind,
  type RuleMechanics,
} from '@rpgforce-ai/shared';
import { findMechanicsRule } from './mechanics-config';

/**
 * Attaches machine-readable mechanics to a rule item's `normalized` payload:
 * - FEAT / standalone items get `normalized.mechanics`;
 * - CLASS / RACE items also get per-entry `features[i].mechanics` /
 *   `traits[i].mechanics`, plus class-level markers (e.g. spellbook caster).
 */
export function applyMechanics(
  kind: RuleItemKind,
  sourceKey: string,
  name: string,
  normalized: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!normalized) return normalized;

  const out: Record<string, unknown> = { ...normalized };

  const itemRule = findMechanicsRule(sourceKey, name);
  const itemMechanics: RuleMechanics = { ...(itemRule?.mechanics ?? {}) };

  if (kind === 'CLASS' || kind === 'SUBCLASS') {
    out.features = annotateEntries(out.features);
    const markers = deriveClassMarkers(out.features);
    if (markers.length > 0) {
      itemMechanics.markers = [...new Set([...(itemMechanics.markers ?? []), ...markers])];
    }
  }
  if (kind === 'RACE') {
    out.traits = annotateEntries(out.traits);
    out.features = annotateEntries(out.features);
  }

  if (Object.keys(itemMechanics).length > 0) {
    out.mechanics = itemMechanics;
  }
  return out;
}

type FeatureEntry = Record<string, unknown> & {
  key?: unknown;
  name?: unknown;
  desc?: unknown;
};

function annotateEntries(entries: unknown): unknown {
  if (!Array.isArray(entries)) return entries;
  return entries.map((entry) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    const f = entry as FeatureEntry;
    const rule = findMechanicsRule(
      typeof f.key === 'string' ? f.key : null,
      typeof f.name === 'string' ? f.name : null,
    );
    if (!rule) return entry;
    return { ...f, mechanics: rule.mechanics };
  });
}

function deriveClassMarkers(features: unknown): string[] {
  if (!Array.isArray(features)) return [];
  const markers: string[] = [];
  for (const entry of features) {
    if (entry === null || typeof entry !== 'object') continue;
    const f = entry as FeatureEntry & { mechanics?: RuleMechanics };
    if (f.mechanics?.featureKey !== 'spellcasting') continue;
    const desc = typeof f.desc === 'string' ? f.desc : '';
    if (/\bspellbook\b/i.test(desc)) markers.push(CLASS_MARKER_SPELLBOOK_CASTER);
  }
  return markers;
}
