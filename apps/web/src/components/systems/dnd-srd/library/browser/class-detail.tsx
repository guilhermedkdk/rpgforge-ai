'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  normalizeFeatureDesc,
  getClassCoreTraitsDesc,
  getMulticlassSummary,
  tableLikeToBullets,
  type RuleItemResponse,
} from '@rpgforce-ai/shared';
import { BrowseMarkdown } from './browse-markdown';
import { BrowseCard } from './browse-card';
import { CollapsibleSectionList, type CollapsibleEntry } from './collapsible-section-list';
import { findParentClass, subclassEntry } from './browse-entries';

interface ClassFeature {
  key?: string;
  name?: string;
  desc?: string;
  featureType?: string;
  gainedAt?: Array<{ level?: number; detail?: string | null }>;
  dataForClassTable?: Array<{ level?: number; columnValue?: string }>;
}

const getFeatures = (item: RuleItemResponse): ClassFeature[] => {
  const features = (item.normalized as { features?: ClassFeature[] } | undefined)?.features;
  return Array.isArray(features) ? features : [];
};

const featureLevels = (feature: ClassFeature): number[] =>
  (feature.gainedAt ?? [])
    .map((g) => Number(g.level))
    .filter((l) => Number.isFinite(l) && l >= 1 && l <= 20)
    .sort((a, b) => a - b);

const minFeatureLevel = (feature: ClassFeature): number => featureLevels(feature)[0] ?? Infinity;

/** Spell-slot columns are named '1st'…'9th'; sort by their ordinal. */
const slotOrdinal = (feature: ClassFeature): number =>
  Number(/^\d+/.exec(feature.name ?? '')?.[0] ?? 99);

const columnValues = (feature: ClassFeature): Map<number, string> => {
  const map = new Map<number, string>();
  for (const row of feature.dataForClassTable ?? []) {
    const level = Number(row.level);
    if (Number.isFinite(level) && typeof row.columnValue === 'string') {
      map.set(level, row.columnValue);
    }
  }
  return map;
};

const ClassLevelTable = ({ features }: { features: ClassFeature[] }) => {
  const columns = React.useMemo(() => {
    const proficiency = features.filter((f) => f.featureType === 'PROFICIENCY_BONUS');
    const tableData = features.filter((f) => f.featureType === 'CLASS_TABLE_DATA');
    const slots = features
      .filter((f) => f.featureType === 'SPELL_SLOTS')
      .sort((a, b) => slotOrdinal(a) - slotOrdinal(b));
    return [...proficiency, ...tableData, ...slots].map((f) => ({
      label: f.featureType === 'PROFICIENCY_BONUS' ? 'PB' : (f.name ?? ''),
      values: columnValues(f),
    }));
  }, [features]);

  const featureNamesByLevel = React.useMemo(() => {
    const map = new Map<number, string[]>();
    for (const feature of features) {
      if (feature.featureType !== 'CLASS_LEVEL_FEATURE' || !feature.name) continue;
      for (const level of featureLevels(feature)) {
        map.set(level, [...(map.get(level) ?? []), feature.name]);
      }
    }
    return map;
  }, [features]);

  if (columns.length === 0 && featureNamesByLevel.size === 0) return null;

  const levels = Array.from({ length: 20 }, (_, i) => i + 1);

  return (
    <section aria-label="Class features table">
      <h2 className="mb-2 font-serif text-lg font-semibold text-foreground">Features Table</h2>
      {/* Every column but Features holds a short numeric value, so they are all centered; only the
          Features text column stays left-aligned. */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-muted">
              <th className="border-b border-border px-2 py-1.5 text-center font-semibold text-foreground">
                Level
              </th>
              {columns.length > 0 && (
                <th className="border-b border-border px-2 py-1.5 text-center font-semibold text-foreground">
                  {columns[0].label}
                </th>
              )}
              <th className="w-full border-b border-border px-2 py-1.5 text-left font-semibold text-foreground">
                Features
              </th>
              {columns.slice(1).map((col) => (
                <th
                  key={col.label}
                  className="border-b border-border px-2 py-1.5 text-center font-semibold whitespace-nowrap text-foreground"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {levels.map((level) => (
              <tr key={level} className="odd:bg-background even:bg-muted/30">
                <td className="border-b border-border/50 px-2 py-1 text-center font-semibold text-foreground">
                  {level}
                </td>
                {columns.length > 0 && (
                  <td className="border-b border-border/50 px-2 py-1 text-center text-muted-foreground">
                    {columns[0].values.get(level) ?? '—'}
                  </td>
                )}
                <td className="border-b border-border/50 px-2 py-1 text-left text-muted-foreground">
                  {(featureNamesByLevel.get(level) ?? []).join(', ') || '—'}
                </td>
                {columns.slice(1).map((col) => (
                  <td
                    key={col.label}
                    className="border-b border-border/50 px-2 py-1 text-center text-muted-foreground"
                  >
                    {col.values.get(level) ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const featureKeyOf = (feature: ClassFeature, index: number): string =>
  feature.key ?? feature.name ?? `feature-${index}`;

export const FeatureList = ({ features, title }: { features: ClassFeature[]; title: string }) => {
  const entries = React.useMemo(
    (): CollapsibleEntry[] =>
      features
        .filter((f) => f.featureType === 'CLASS_LEVEL_FEATURE' && f.desc?.trim())
        .sort((a, b) => minFeatureLevel(a) - minFeatureLevel(b))
        .map((feature, index) => {
          const levels = featureLevels(feature);
          return {
            key: featureKeyOf(feature, index),
            title: feature.name ?? '',
            badge: levels.length > 0 ? levels[0] : undefined,
            subtitle:
              levels.length > 1 ? `Também nos níveis ${levels.slice(1).join(', ')}` : undefined,
            content: <BrowseMarkdown>{normalizeFeatureDesc(feature.desc)}</BrowseMarkdown>,
          };
        }),
    [features]
  );

  return <CollapsibleSectionList title={title} entries={entries} />;
};

const HitPointsBlock = ({ item }: { item: RuleItemResponse }) => {
  const hitPoints = (
    item.normalized as
      | {
          hitPoints?: {
            hitDiceName?: string;
            hitPointsAt_1stLevel?: string;
            hitPointsAtHigherLevels?: string;
          };
        }
      | undefined
  )?.hitPoints;
  if (!hitPoints) return null;
  const rows = [
    { label: 'Hit Point Die', value: hitPoints.hitDiceName },
    { label: 'At Level 1', value: hitPoints.hitPointsAt_1stLevel },
    { label: 'At Higher Levels', value: hitPoints.hitPointsAtHigherLevels },
  ].filter((r) => r.value);
  if (rows.length === 0) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
      {rows.map(({ label, value }) => (
        <React.Fragment key={label}>
          <dt className="font-medium text-muted-foreground/70">{label}</dt>
          <dd className="text-foreground">{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
};

export const ClassDetail = ({
  item,
  subclasses,
  packSlug,
}: {
  item: RuleItemResponse;
  subclasses: RuleItemResponse[];
  packSlug: string;
}) => {
  const features = getFeatures(item);
  const classKey = (item.normalized as { key?: string } | undefined)?.key ?? item.sourceKey;
  const ownSubclasses = subclasses.filter(
    (s) =>
      (s.normalized as { subclassOf?: { key?: string } } | undefined)?.subclassOf?.key === classKey
  );
  const coreTraits = getClassCoreTraitsDesc(item);
  const multiclass = getMulticlassSummary(item);
  const desc = (item.normalized as { desc?: string } | undefined)?.desc;

  return (
    <div className="flex flex-col gap-6">
      {desc?.trim() ? <BrowseMarkdown>{desc}</BrowseMarkdown> : null}
      <HitPointsBlock item={item} />
      {coreTraits ? (
        <section aria-label="Core traits" className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 font-serif text-lg font-semibold text-foreground">Core Traits</h2>
          <BrowseMarkdown>{tableLikeToBullets(coreTraits)}</BrowseMarkdown>
        </section>
      ) : null}
      {multiclass ? (
        <section aria-label="Multiclassing" className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 font-serif text-lg font-semibold text-foreground">Multiclassing</h2>
          <p className="mb-2 text-sm text-muted-foreground">
            {multiclass.requirement
              ? `Taking ${item.name} as a second class requires ${multiclass.requirement}, in it and in the classes you already have. You then gain:`
              : `Taking ${item.name} as a second class grants:`}
          </p>
          <ul className="ml-4 list-disc space-y-1 text-sm text-foreground">
            {multiclass.grants.map((grant) => (
              <li key={grant}>{grant}</li>
            ))}
            <li>Its level 1 features, and its later features as you level in it</li>
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Not granted: saving throws, the full starting proficiencies, and starting equipment.
            Those come only from your first class.
          </p>
        </section>
      ) : null}
      <ClassLevelTable features={features} />
      <FeatureList features={features} title="Class Features" />
      {ownSubclasses.length > 0 && (
        <section aria-label="Subclasses">
          <h2 className="mb-2 font-serif text-lg font-semibold text-foreground">Subclasses</h2>
          <ul className="grid list-none gap-4 p-0 sm:grid-cols-2">
            {ownSubclasses.map((subclass) => {
              const entry = subclassEntry(subclass);
              return (
                <li key={subclass.id} className="min-w-0">
                  <BrowseCard
                    href={`/library/${encodeURIComponent(packSlug)}/${encodeURIComponent(subclass.slug ?? subclass.id)}`}
                    title={subclass.name}
                    chips={entry.chips}
                    snippet={entry.snippet}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
};

export const SubclassDetail = ({
  item,
  classes,
  packSlug,
}: {
  item: RuleItemResponse;
  classes: RuleItemResponse[];
  packSlug: string;
}) => {
  const features = getFeatures(item);
  const parent = findParentClass(item, classes);
  const desc = (item.normalized as { desc?: string } | undefined)?.desc;

  return (
    <div className="flex flex-col gap-6">
      {parent ? (
        <p className="text-sm text-muted-foreground">
          Subclass of{' '}
          <Link
            href={`/library/${encodeURIComponent(packSlug)}/${encodeURIComponent(parent.slug ?? parent.id)}`}
            className="font-medium text-primary-ink hover:underline"
          >
            {parent.name}
          </Link>
        </p>
      ) : null}
      {desc?.trim() ? <BrowseMarkdown>{desc}</BrowseMarkdown> : null}
      <FeatureList features={features} title="Subclass Features" />
    </div>
  );
};
