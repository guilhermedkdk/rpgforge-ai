'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, Search } from 'lucide-react';
import type { PackResponse, RuleItemResponse } from '@rpgforce-ai/shared';
import { BackLink } from '@/components/ui/back-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingState } from '@/components/ui/loading-state';
import { cn } from '@/lib/utils';
import { ruleItemSpellLevel } from '../../character-sheet/sections/spellcasting/spell-utils';
import { useBrowseLibrary } from './use-browse-library';
import { BrowseCard } from './browse-card';
import { FilterChipRow } from './filter-chip-row';
import {
  BROWSE_CATEGORIES,
  DEFAULT_BROWSE_CATEGORY,
  ITEM_CATEGORY_TAG_PREFIX,
  ITEM_MAGIC_NO_TAG,
  ITEM_MAGIC_YES_TAG,
  ITEM_RARITY_TAG_PREFIX,
  SPELL_CLASS_TAG_PREFIX,
  SPELL_SCHOOL_TAG_PREFIX,
  filterOptionsFromTagPrefix,
  normalizedString,
  plainTextSnippet,
  type BrowseCategoryKey,
  type FilterOption,
} from './browse-config';
import {
  backgroundEntry,
  classEntry,
  equipmentEntry,
  featEntry,
  rulesForRuleset,
  rulesetEntry,
  speciesEntry,
  spellEntry,
  type BrowseEntry,
} from './browse-entries';
import { stripContentPreamble } from './browse-markdown';

const PAGE_SIZE = 24;
const RARITY_SORT = ['common', 'uncommon', 'rare', 'very-rare', 'legendary', 'artifact'];
const FEAT_TYPE_SORT = ['Origin', 'General', 'Fighting Style', 'Epic Boon'];

const isBrowseCategory = (value: string | null): value is BrowseCategoryKey =>
  BROWSE_CATEGORIES.some((c) => c.key === value);

const sortByExplicitOrder = (options: FilterOption[], order: string[]): FilterOption[] =>
  [...options].sort((a, b) => {
    const ia = order.indexOf(a.value);
    const ib = order.indexOf(b.value);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.label.localeCompare(b.label);
  });

export const LibraryBrowser = ({ pack }: { pack: PackResponse }) => {
  const library = useBrowseLibrary(pack.id);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const catParam = searchParams.get('cat');
  const cat: BrowseCategoryKey = isBrowseCategory(catParam) ? catParam : DEFAULT_BROWSE_CATEGORY;
  const urlQuery = searchParams.get('q') ?? '';
  const levelFilter = searchParams.get('level');
  const schoolFilter = searchParams.get('school');
  const classFilter = searchParams.get('class');
  const categoryFilter = searchParams.get('category');
  const magicFilter = searchParams.get('magic');
  const rarityFilter = searchParams.get('rarity');
  const typeFilter = searchParams.get('type');

  const [query, setQuery] = React.useState(urlQuery);
  React.useEffect(() => setQuery(urlQuery), [urlQuery]);

  const replaceParams = React.useCallback(
    (mutate: (sp: URLSearchParams) => void) => {
      const sp = new URLSearchParams(searchParams.toString());
      mutate(sp);
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, pathname, router]
  );

  React.useEffect(() => {
    const handle = setTimeout(() => {
      if (query === urlQuery) return;
      replaceParams((sp) => {
        if (query.trim()) sp.set('q', query);
        else sp.delete('q');
      });
    }, 250);
    return () => clearTimeout(handle);
  }, [query, urlQuery, replaceParams]);

  const setFilter = (key: string, value: string | null) =>
    replaceParams((sp) => {
      if (value) sp.set(key, value);
      else sp.delete(key);
      if (key === 'magic' && value !== 'magic') sp.delete('rarity');
    });

  const setCategory = (key: BrowseCategoryKey) => {
    setQuery('');
    router.replace(`${pathname}?cat=${key}`, { scroll: false });
  };

  const clearFilters = () => {
    setQuery('');
    router.replace(`${pathname}?cat=${cat}`, { scroll: false });
  };

  const normalizedQuery = query.trim().toLowerCase();

  const rulesetsByPrefix = React.useMemo(() => {
    const map = new Map<string, RuleItemResponse>();
    for (const ruleset of library.rulesets) {
      if (ruleset.slug) map.set(ruleset.slug, ruleset);
    }
    return map;
  }, [library.rulesets]);

  const entries: BrowseEntry[] = React.useMemo(() => {
    switch (cat) {
      case 'classes':
        return library.classes.map(classEntry);
      case 'species':
        return library.races.map(speciesEntry);
      case 'backgrounds':
        return library.backgrounds.map(backgroundEntry);
      case 'feats': {
        const feats = typeFilter
          ? library.feats.filter((f) => normalizedString(f, 'type') === typeFilter)
          : library.feats;
        return feats.map(featEntry);
      }
      case 'spells': {
        let spells = library.spells;
        if (levelFilter !== null)
          spells = spells.filter((s) => ruleItemSpellLevel(s) === Number(levelFilter));
        if (schoolFilter)
          spells = spells.filter((s) =>
            s.tagKeys.includes(`${SPELL_SCHOOL_TAG_PREFIX}${schoolFilter}`)
          );
        if (classFilter)
          spells = spells.filter((s) =>
            s.tagKeys.includes(`${SPELL_CLASS_TAG_PREFIX}${classFilter}`)
          );
        return [...spells]
          .sort(
            (a, b) => ruleItemSpellLevel(a) - ruleItemSpellLevel(b) || a.name.localeCompare(b.name)
          )
          .map(spellEntry);
      }
      case 'equipment': {
        let items = library.items;
        if (categoryFilter)
          items = items.filter((i) =>
            i.tagKeys.includes(`${ITEM_CATEGORY_TAG_PREFIX}${categoryFilter}`)
          );
        if (magicFilter === 'magic')
          items = items.filter((i) => i.tagKeys.includes(ITEM_MAGIC_YES_TAG));
        if (magicFilter === 'mundane')
          items = items.filter((i) => i.tagKeys.includes(ITEM_MAGIC_NO_TAG));
        if (rarityFilter)
          items = items.filter((i) =>
            i.tagKeys.includes(`${ITEM_RARITY_TAG_PREFIX}${rarityFilter}`)
          );
        return items.map(equipmentEntry);
      }
      case 'rules': {
        const rulesetEntries = library.rulesets.map((rs) =>
          rulesetEntry(rs, rulesForRuleset(rs, library.rules).length)
        );
        if (!normalizedQuery) return rulesetEntries;
        const matchingRules: BrowseEntry[] = library.rules
          .filter((r) => r.name.toLowerCase().includes(normalizedQuery))
          .map((rule) => {
            const parentSlug = rule.slug?.replace(/_rule-\d+$/, '') ?? '';
            const parent = rulesetsByPrefix.get(parentSlug);
            return {
              item: rule,
              chips: parent ? [parent.name] : [],
              snippet: plainTextSnippet(stripContentPreamble(rule.contentMd ?? '')),
            };
          });
        return [
          ...rulesetEntries.filter((e) => e.item.name.toLowerCase().includes(normalizedQuery)),
          ...matchingRules,
        ];
      }
    }
  }, [
    cat,
    library,
    typeFilter,
    levelFilter,
    schoolFilter,
    classFilter,
    categoryFilter,
    magicFilter,
    rarityFilter,
    normalizedQuery,
    rulesetsByPrefix,
  ]);

  const searched = React.useMemo(() => {
    if (!normalizedQuery || cat === 'rules') return entries;
    return entries.filter((e) => e.item.name.toLowerCase().includes(normalizedQuery));
  }, [entries, normalizedQuery, cat]);

  const filterSignature = [
    cat,
    normalizedQuery,
    levelFilter,
    schoolFilter,
    classFilter,
    categoryFilter,
    magicFilter,
    rarityFilter,
    typeFilter,
  ].join('|');
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);
  React.useEffect(() => setVisibleCount(PAGE_SIZE), [filterSignature]);

  const featTypeOptions = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const feat of library.feats) {
      const type = normalizedString(feat, 'type');
      if (type) counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    const options = [...counts.entries()].map(([value, count]) => ({
      value,
      label: value,
      count,
    }));
    return sortByExplicitOrder(options, FEAT_TYPE_SORT);
  }, [library.feats]);

  const spellLevelOptions = React.useMemo(() => {
    const counts = new Map<number, number>();
    for (const spell of library.spells) {
      const level = ruleItemSpellLevel(spell);
      counts.set(level, (counts.get(level) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([level, count]) => ({
        value: String(level),
        label: level === 0 ? 'Cantrip' : String(level),
        count,
      }));
  }, [library.spells]);

  const spellSchoolOptions = React.useMemo(
    () => filterOptionsFromTagPrefix(library.spells, SPELL_SCHOOL_TAG_PREFIX),
    [library.spells]
  );
  const spellClassOptions = React.useMemo(
    () => filterOptionsFromTagPrefix(library.spells, SPELL_CLASS_TAG_PREFIX),
    [library.spells]
  );
  const itemCategoryOptions = React.useMemo(
    () => filterOptionsFromTagPrefix(library.items, ITEM_CATEGORY_TAG_PREFIX),
    [library.items]
  );
  const itemMagicOptions = React.useMemo(() => {
    const mundane = library.items.filter((i) => i.tagKeys.includes(ITEM_MAGIC_NO_TAG)).length;
    const magic = library.items.filter((i) => i.tagKeys.includes(ITEM_MAGIC_YES_TAG)).length;
    return [
      { value: 'mundane', label: 'Mundane', count: mundane },
      { value: 'magic', label: 'Magic', count: magic },
    ];
  }, [library.items]);
  const itemRarityOptions = React.useMemo(
    () =>
      sortByExplicitOrder(
        filterOptionsFromTagPrefix(
          library.items.filter((i) => i.tagKeys.includes(ITEM_MAGIC_YES_TAG)),
          ITEM_RARITY_TAG_PREFIX
        ),
        RARITY_SORT
      ),
    [library.items]
  );

  const categoryCounts: Record<BrowseCategoryKey, number> = {
    classes: library.classes.length,
    species: library.races.length,
    backgrounds: library.backgrounds.length,
    feats: library.feats.length,
    spells: library.spells.length,
    equipment: library.items.length,
    rules: library.rulesets.length,
  };

  const activeCategory = BROWSE_CATEGORIES.find((c) => c.key === cat);
  const visible = searched.slice(0, visibleCount);
  const remaining = searched.length - visible.length;

  // Carried as `?from=` on item links so "back" restores this exact filtered view.
  const currentSearch = searchParams.toString();
  const currentUrl = currentSearch ? `${pathname}?${currentSearch}` : pathname;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <BackLink href="/library" className="mb-3">
          Todos os sistemas
        </BackLink>
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" aria-hidden="true" />
          <h1 className="font-serif text-2xl font-bold text-foreground">Biblioteca {pack.name}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Explore o catálogo completo do {pack.name}: Classes, Species, Backgrounds, Feats, Spells,
          Equipment e Rules.{' '}
          <Link href="/legal" className="text-primary hover:underline">
            Licenças e atribuição
          </Link>
        </p>
      </div>

      {library.isLoading ? (
        <LoadingState />
      ) : (
        <>
          <nav className="flex flex-wrap gap-2" aria-label="Categorias da biblioteca">
            {BROWSE_CATEGORIES.map(({ key, label, icon: Icon }) => {
              const active = key === cat;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  aria-pressed={active}
                  className={cn(
                    'flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                  <span className={cn('text-xs', active ? 'opacity-80' : 'opacity-60')}>
                    {categoryCounts[key]}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/50 p-3 sm:p-4">
            <div className="relative max-w-md">
              <Search
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={activeCategory?.searchPlaceholder}
                aria-label={activeCategory?.searchPlaceholder}
                className="bg-secondary pl-10"
              />
            </div>

            {cat === 'feats' && (
              <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
                <FilterChipRow
                  label="Type"
                  options={featTypeOptions}
                  selected={typeFilter}
                  onSelect={(v) => setFilter('type', v)}
                />
              </div>
            )}
            {cat === 'spells' && (
              <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
                <FilterChipRow
                  label="Level"
                  options={spellLevelOptions}
                  selected={levelFilter}
                  onSelect={(v) => setFilter('level', v)}
                />
                <FilterChipRow
                  label="School"
                  options={spellSchoolOptions}
                  selected={schoolFilter}
                  onSelect={(v) => setFilter('school', v)}
                />
                <FilterChipRow
                  label="Class"
                  options={spellClassOptions}
                  selected={classFilter}
                  onSelect={(v) => setFilter('class', v)}
                />
              </div>
            )}
            {cat === 'equipment' && (
              <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
                <FilterChipRow
                  label="Category"
                  options={itemCategoryOptions}
                  selected={categoryFilter}
                  onSelect={(v) => setFilter('category', v)}
                />
                <FilterChipRow
                  label="Magic"
                  options={itemMagicOptions}
                  selected={magicFilter}
                  onSelect={(v) => setFilter('magic', v)}
                />
                {magicFilter === 'magic' && (
                  <FilterChipRow
                    label="Rarity"
                    options={itemRarityOptions}
                    selected={rarityFilter}
                    onSelect={(v) => setFilter('rarity', v)}
                  />
                )}
              </div>
            )}
          </div>

          {searched.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center">
              <p className="text-sm text-muted-foreground">Nenhum resultado para a busca atual.</p>
              <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                Limpar filtros
              </Button>
            </div>
          ) : (
            <>
              <ul className="grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map(({ item, chips, snippet }) => (
                  <li key={item.id} className="min-w-0">
                    <BrowseCard
                      href={`/library/${encodeURIComponent(pack.slug)}/${encodeURIComponent(item.slug ?? item.id)}?from=${encodeURIComponent(currentUrl)}`}
                      title={item.name}
                      chips={chips}
                      snippet={snippet}
                    />
                  </li>
                ))}
              </ul>
              {remaining > 0 && (
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setVisibleCount((c) => c + PAGE_SIZE * 2)}
                  >
                    Mostrar mais
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};
