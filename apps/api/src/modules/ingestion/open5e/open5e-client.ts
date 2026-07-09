/**
 * Minimal Open5e API v2 client for SRD ingestion.
 * Base URL: https://api.open5e.com/v2
 */

const OPEN5E_BASE = 'https://api.open5e.com/v2';
const ALLOWED_PACK_SLUG = 'srd-2024';

export const ALLOWED_PACK_SLUGS = [ALLOWED_PACK_SLUG] as const;

type Open5eDocumentKey = (typeof ALLOWED_PACK_SLUGS)[number];

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface Open5eDocument {
  name: string;
  key: string;
  type?: string;
  display_name?: string;
  publisher?: { name: string; key: string; url?: string };
  gamesystem?: { name: string; key: string; url?: string };
  permalink?: string;
}

function getDocumentKey(item: { document?: Open5eDocument }): string | undefined {
  return item.document?.key;
}

function isAllowedDocument(item: { document?: Open5eDocument }): boolean {
  const key = getDocumentKey(item);
  return key != null && ALLOWED_PACK_SLUGS.includes(key as Open5eDocumentKey);
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open5e HTTP ${res.status}: ${url}`);
  }
  return res.json() as Promise<T>;
}

async function fetchAllPaginated<T>(
  endpoint: string,
  query: Record<string, string> = {},
): Promise<T[]> {
  const params = new URLSearchParams({ limit: '100', ...query });
  const url = `${OPEN5E_BASE}/${endpoint}/?${params}`;
  const all: T[] = [];
  let next: string | null = url;

  while (next) {
    const data = await fetchJson<PaginatedResponse<T>>(next);
    all.push(...data.results);
    next = data.next;
  }

  return all;
}

async function fetchDocuments(): Promise<Open5eDocument[]> {
  const data = await fetchJson<PaginatedResponse<Open5eDocument>>(
    `${OPEN5E_BASE}/documents/?limit=100`,
  );
  return data.results;
}

export async function fetchDocumentByKey(key: string): Promise<Open5eDocument | null> {
  const list = await fetchDocuments();
  return list.find((d) => d.key === key) ?? null;
}

export async function fetchSpells(documentKey: string): Promise<unknown[]> {
  const results = await fetchAllPaginated<unknown>('spells', {
    document__key: documentKey,
  });
  return results.filter((item) => isAllowedDocument(item as { document?: Open5eDocument }));
}

export async function fetchFeats(documentKey: string): Promise<unknown[]> {
  const results = await fetchAllPaginated<unknown>('feats', {
    document__key: documentKey,
  });
  return results.filter((item) => isAllowedDocument(item as { document?: Open5eDocument }));
}

export async function fetchItems(documentKey: string): Promise<unknown[]> {
  const results = await fetchAllPaginated<unknown>('items', {
    document__key__iexact: documentKey,
  });
  return results.filter((item) => isAllowedDocument(item as { document?: Open5eDocument }));
}

/** Magic items (same shape as `items`, plus `rarity`/`requires_attunement`) — mapped as kind ITEM too. */
export async function fetchMagicItems(documentKey: string): Promise<unknown[]> {
  const results = await fetchAllPaginated<unknown>('magicitems', {
    document__key__iexact: documentKey,
  });
  return results.filter((item) => isAllowedDocument(item as { document?: Open5eDocument }));
}

export async function fetchClasses(documentKey: string): Promise<unknown[]> {
  const results = await fetchAllPaginated<unknown>('classes', {
    document__key: documentKey,
  });
  return results.filter((item) => isAllowedDocument(item as { document?: Open5eDocument }));
}

export async function fetchBackgrounds(documentKey: string): Promise<unknown[]> {
  const results = await fetchAllPaginated<unknown>('backgrounds', {
    document__key: documentKey,
  });
  return results.filter((item) => isAllowedDocument(item as { document?: Open5eDocument }));
}

/** Fetch races (species in Open5e v2) filtered by document. */
export async function fetchRaces(documentKey: string): Promise<unknown[]> {
  const results = await fetchAllPaginated<unknown>('species', {
    document__key: documentKey,
  });
  return results.filter((item) => isAllowedDocument(item as { document?: Open5eDocument }));
}

interface AbilityDescription {
  desc?: string;
  document?: string;
  gamesystem?: string;
}

interface AbilitySkill {
  key?: string;
  name?: string;
  ability?: string;
  document?: string;
  descriptions?: AbilityDescription[];
}

interface AbilityRaw {
  url?: string;
  key?: string;
  name?: string;
  short_desc?: string;
  document?: string;
  descriptions?: AbilityDescription[];
  skills?: AbilitySkill[];
}

function normalizeAbilityForDocument(
  ability: AbilityRaw,
  documentKey: string
): Record<string, unknown> {
  const descriptions = (ability.descriptions ?? []) as AbilityDescription[];
  const docDesc = descriptions.find((d) => d.document === documentKey);
  const skills = (ability.skills ?? []) as AbilitySkill[];
  const skillsNormalized = skills
    .filter((sk) =>
      (sk.descriptions ?? []).some((d: AbilityDescription) => d.document === documentKey),
    )
    .map((sk) => {
      const skDescs = (sk.descriptions ?? []) as AbilityDescription[];
      const skDocDesc = skDescs.find((d) => d.document === documentKey);
      return {
        key: sk.key,
        name: sk.name,
        ability: sk.ability,
        desc: skDocDesc?.desc ?? '',
        descriptions: skDocDesc ? [skDocDesc] : [],
      };
    });
  return {
    url: ability.url,
    key: ability.key,
    name: ability.name,
    short_desc: ability.short_desc,
    desc: docDesc?.desc ?? '',
    descriptions: docDesc ? [docDesc] : [],
    skills: skillsNormalized,
  };
}

export interface Open5eRule {
  url?: string;
  name: string;
  desc?: string;
  index: number;
  initialHeaderLevel?: number;
  document?: Open5eDocument;
  ruleset?: string;
}

export interface Open5eRuleset {
  url?: string;
  key: string;
  name: string;
  desc?: string;
  document?: Open5eDocument;
  rules?: Open5eRule[];
}

export async function fetchRulesets(documentKey: string): Promise<Open5eRuleset[]> {
  return fetchAllPaginated<Open5eRuleset>('rulesets', { document__key: documentKey });
}

/**
 * Fetch abilities; filtra por documento (ex.: srd-2024) e normaliza para manter só descrições desse documento.
 * O endpoint v2/abilities não filtra por document na API, então buscamos todos e filtramos por descriptions[].document.
 */
export async function fetchAbilities(documentKey: string): Promise<unknown[]> {
  const all = await fetchAllPaginated<AbilityRaw>('abilities', {});
  const withDoc = all.filter((a) =>
    (a.descriptions ?? []).some((d: AbilityDescription) => d.document === documentKey)
  );
  return withDoc.map((a) => normalizeAbilityForDocument(a, documentKey));
}
