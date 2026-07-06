'use client';

import * as React from 'react';
import Link from 'next/link';
import type { PackResponse, RuleItemKind, RuleItemResponse } from '@rpgforce-ai/shared';
import { BackLink } from '@/components/ui/back-link';
import { Badge } from '@/components/ui/badge';
import { LoadingState } from '@/components/ui/loading-state';
import { normalizeFeatureDesc } from '@/lib/dnd-srd/derived-character-stats';
import { getBackgroundBenefits, getRaceTraits } from '@/lib/dnd-srd/rule-item-presentation';
import { licenseLabel } from '@/lib/license';
import { SpellRuleItemDetailBody } from '../../character-sheet/sections/spellcasting/spell-detail';
import { useBrowseLibrary } from './use-browse-library';
import { BrowseMarkdown, stripContentPreamble } from './browse-markdown';
import { ClassDetail, SubclassDetail } from './class-detail';
import {
  backgroundEntry,
  classEntry,
  equipmentEntry,
  featEntry,
  findParentClass,
  findParentRuleset,
  formatCost,
  formatWeight,
  itemArmor,
  itemWeapon,
  rulesForRuleset,
  speciesEntry,
  spellEntry,
  subclassEntry,
} from './browse-entries';
import {
  CATEGORY_BY_KIND,
  ITEM_MAGIC_YES_TAG,
  ITEM_RARITY_TAG_PREFIX,
  SPELL_CLASS_TAG_PREFIX,
  normalizedString,
  prettifyTagValue,
  tagValueForPrefix,
  tagValuesForPrefix,
} from './browse-config';

const KIND_LABELS: Record<RuleItemKind, string> = {
  CLASS: 'Class',
  SUBCLASS: 'Subclass',
  CLASS_FEATURE: 'Class Feature',
  SPELL: 'Spell',
  FEAT: 'Feat',
  BACKGROUND: 'Background',
  RACE: 'Species',
  ABILITY: 'Ability',
  RULESET: 'Rules',
  RULE: 'Rule',
  ITEM: 'Equipment',
  OTHER: 'Reference',
};

const headerChips = (item: RuleItemResponse): string[] => {
  switch (item.kind) {
    case 'CLASS':
      return classEntry(item).chips;
    case 'SUBCLASS':
      return subclassEntry(item).chips;
    case 'RACE':
      return speciesEntry(item).chips;
    case 'BACKGROUND':
      return backgroundEntry(item).chips;
    case 'FEAT':
      return featEntry(item).chips;
    case 'SPELL':
      return spellEntry(item).chips;
    case 'ITEM':
      return equipmentEntry(item).chips;
    default:
      return [];
  }
};

const StatRows = ({ rows }: { rows: Array<{ label: string; value?: string | null }> }) => {
  const filled = rows.filter((r) => r.value?.trim());
  if (filled.length === 0) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
      {filled.map(({ label, value }) => (
        <React.Fragment key={label}>
          <dt className="font-medium text-muted-foreground/70">{label}</dt>
          <dd className="text-foreground">{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
};

const SpellBody = ({ item }: { item: RuleItemResponse }) => {
  const classNames = tagValuesForPrefix(item, SPELL_CLASS_TAG_PREFIX).map(prettifyTagValue).sort();
  return (
    <div className="flex flex-col gap-4">
      <SpellRuleItemDetailBody spell={item} />
      {classNames.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
          <span className="text-xs font-medium text-muted-foreground/70">Available to</span>
          {classNames.map((name) => (
            <Badge key={name} variant="secondary" className="px-1.5 py-0 text-[10px]">
              {name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};

const ClassBody = ({ pack, item }: { pack: PackResponse; item: RuleItemResponse }) => {
  const { subclasses } = useBrowseLibrary(pack.id);
  return <ClassDetail item={item} subclasses={subclasses} packSlug={pack.slug} />;
};

const SubclassBody = ({ pack, item }: { pack: PackResponse; item: RuleItemResponse }) => {
  const { classes } = useBrowseLibrary(pack.id);
  return <SubclassDetail item={item} classes={classes} packSlug={pack.slug} />;
};

const SpeciesBody = ({ item }: { item: RuleItemResponse }) => {
  const traits = getRaceTraits(item);
  const sizeSpeedRows = traits
    .filter((t) => t.type === 'SIZE' || t.type === 'SPEED')
    .map((t) => ({ label: t.name ?? '', value: t.desc }));
  const featureTraits = traits.filter((t) => t.type !== 'SIZE' && t.type !== 'SPEED');
  return (
    <div className="flex flex-col gap-4">
      <StatRows rows={sizeSpeedRows} />
      {featureTraits.map((trait) => (
        <section key={trait.name}>
          <h2 className="mb-1 font-serif text-lg font-semibold text-foreground">{trait.name}</h2>
          <BrowseMarkdown>{normalizeFeatureDesc(trait.desc)}</BrowseMarkdown>
        </section>
      ))}
    </div>
  );
};

const BackgroundBody = ({ item }: { item: RuleItemResponse }) => (
  <div className="flex flex-col gap-4">
    {getBackgroundBenefits(item).map((benefit) => (
      <section key={benefit.name ?? benefit.type}>
        <h2 className="mb-1 font-serif text-lg font-semibold text-foreground">
          {benefit.name ?? benefit.type}
        </h2>
        <BrowseMarkdown>{benefit.desc ?? ''}</BrowseMarkdown>
      </section>
    ))}
  </div>
);

const FeatBody = ({ item }: { item: RuleItemResponse }) => {
  const prerequisite = normalizedString(item, 'prerequisite');
  const benefits = (
    (item.normalized as { benefits?: Array<{ desc?: string }> } | undefined)?.benefits ?? []
  ).filter((b) => b.desc?.trim());
  return (
    <div className="flex flex-col gap-3">
      {prerequisite && (
        <p className="text-sm text-foreground">
          <span className="font-semibold">Prerequisite:</span> {prerequisite}
        </p>
      )}
      <ul className="flex list-disc flex-col gap-2 pl-5">
        {benefits.map((benefit, index) => (
          <li key={index}>
            <BrowseMarkdown>{benefit.desc ?? ''}</BrowseMarkdown>
          </li>
        ))}
      </ul>
    </div>
  );
};

const EquipmentBody = ({ item }: { item: RuleItemResponse }) => {
  const weapon = itemWeapon(item);
  const armor = itemArmor(item);
  const isMagic = item.tagKeys.includes(ITEM_MAGIC_YES_TAG);
  const rarity = tagValueForPrefix(item, ITEM_RARITY_TAG_PREFIX);
  const desc = normalizedString(item, 'desc');
  const properties = (weapon?.properties ?? []).filter((p) => p.property?.name);

  const rows = [
    { label: 'Category', value: normalizedString(item, 'categoryName') },
    { label: 'Rarity', value: isMagic && rarity ? prettifyTagValue(rarity) : null },
    { label: 'Cost', value: formatCost(normalizedString(item, 'cost')) },
    { label: 'Weight', value: formatWeight(normalizedString(item, 'weight')) },
    {
      label: 'Damage',
      value: weapon?.damageDice
        ? [weapon.damageDice, weapon.damageType?.name].filter(Boolean).join(' ')
        : null,
    },
    {
      label: 'Weapon Type',
      value: weapon ? (weapon.isMartial ? 'Martial' : weapon.isSimple ? 'Simple' : null) : null,
    },
    { label: 'Armor Class', value: armor?.acDisplay ? `AC ${armor.acDisplay}` : null },
    { label: 'Armor Type', value: armor?.category ? prettifyTagValue(armor.category) : null },
    {
      label: 'Strength',
      value: armor?.strengthScoreRequired ? String(armor.strengthScoreRequired) : null,
    },
    { label: 'Stealth', value: armor?.grantsStealthDisadvantage ? 'Disadvantage' : null },
  ];

  return (
    <div className="flex flex-col gap-4">
      <StatRows rows={rows} />
      {properties.length > 0 && (
        <section>
          <h2 className="mb-2 font-serif text-lg font-semibold text-foreground">Properties</h2>
          <ul className="flex list-none flex-col gap-2 p-0">
            {properties.map((p, index) => (
              <li key={index} className="text-sm">
                <span className="font-semibold text-foreground">
                  {p.property?.name}
                  {p.detail ? ` (${p.detail})` : ''}
                  {p.property?.type ? (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      {p.property.type}
                    </span>
                  ) : null}
                </span>
                {p.property?.desc ? (
                  <p className="text-muted-foreground">{p.property.desc}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}
      {desc ? <BrowseMarkdown>{normalizeFeatureDesc(desc)}</BrowseMarkdown> : null}
    </div>
  );
};

const RulesetBody = ({ pack, item }: { pack: PackResponse; item: RuleItemResponse }) => {
  const { rules, isLoading } = useBrowseLibrary(pack.id);
  const children = rulesForRuleset(item, rules);
  const intro = stripContentPreamble(item.contentMd ?? '');
  return (
    <div className="flex flex-col gap-5">
      {intro ? <BrowseMarkdown>{intro}</BrowseMarkdown> : null}
      {isLoading ? (
        <LoadingState />
      ) : (
        children.map((rule) => (
          <section
            key={rule.id}
            className="rounded-lg border border-border bg-card p-4"
            aria-label={rule.name}
          >
            <h2 className="mb-2 font-serif text-lg font-semibold text-foreground">{rule.name}</h2>
            <BrowseMarkdown>{stripContentPreamble(rule.contentMd ?? '')}</BrowseMarkdown>
          </section>
        ))
      )}
    </div>
  );
};

const RuleBody = ({ pack, item }: { pack: PackResponse; item: RuleItemResponse }) => {
  const { rulesets } = useBrowseLibrary(pack.id);
  const parent = findParentRuleset(item, rulesets);
  return (
    <div className="flex flex-col gap-4">
      {parent ? (
        <p className="text-sm text-muted-foreground">
          Part of{' '}
          <Link
            href={`/library/${encodeURIComponent(pack.slug)}/${encodeURIComponent(parent.slug ?? parent.id)}`}
            className="font-medium text-primary hover:underline"
          >
            {parent.name}
          </Link>
        </p>
      ) : null}
      <BrowseMarkdown>{stripContentPreamble(item.contentMd ?? '')}</BrowseMarkdown>
    </div>
  );
};

const GenericBody = ({ item }: { item: RuleItemResponse }) => {
  const desc = normalizedString(item, 'desc');
  const content = desc ?? stripContentPreamble(item.contentMd ?? '');
  return content ? (
    <BrowseMarkdown>{normalizeFeatureDesc(content)}</BrowseMarkdown>
  ) : (
    <p className="text-sm italic text-muted-foreground">No description available.</p>
  );
};

const DetailBody = ({ pack, item }: { pack: PackResponse; item: RuleItemResponse }) => {
  switch (item.kind) {
    case 'SPELL':
      return <SpellBody item={item} />;
    case 'CLASS':
      return <ClassBody pack={pack} item={item} />;
    case 'SUBCLASS':
      return <SubclassBody pack={pack} item={item} />;
    case 'RACE':
      return <SpeciesBody item={item} />;
    case 'BACKGROUND':
      return <BackgroundBody item={item} />;
    case 'FEAT':
      return <FeatBody item={item} />;
    case 'ITEM':
      return <EquipmentBody item={item} />;
    case 'RULESET':
      return <RulesetBody pack={pack} item={item} />;
    case 'RULE':
      return <RuleBody pack={pack} item={item} />;
    default:
      return <GenericBody item={item} />;
  }
};

export const LibraryItemDetail = ({
  pack,
  item,
  backHref: fromHref,
}: {
  pack: PackResponse;
  item: RuleItemResponse;
  /** Validated `?from=` from the browse listing the user came from (filters preserved). */
  backHref?: string;
}) => {
  const { classes, rulesets } = useBrowseLibrary(pack.id);
  const parent =
    item.kind === 'SUBCLASS'
      ? findParentClass(item, classes)
      : item.kind === 'RULE'
        ? findParentRuleset(item, rulesets)
        : undefined;

  const backCategory = CATEGORY_BY_KIND[item.kind];
  const packLibraryHref = `/library/${encodeURIComponent(pack.slug)}`;
  const categoryHref = backCategory ? `${packLibraryHref}?cat=${backCategory}` : packLibraryHref;
  const parentHref = parent
    ? `${packLibraryHref}/${encodeURIComponent(parent.slug ?? parent.id)}`
    : null;
  // Nested items go back to their parent; others prefer the filtered `from` listing, then the category tab.
  const backHref = parentHref ?? fromHref ?? categoryHref;
  const chips = headerChips(item);

  return (
    <article className="flex flex-col gap-6">
      <div>
        <BackLink href={backHref}>{parent ? `Back to ${parent.name}` : 'Back to library'}</BackLink>
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{KIND_LABELS[item.kind]}</Badge>
          {chips.map((chip) => (
            <Badge key={chip} variant="secondary" className="px-1.5 py-0 text-[10px]">
              {chip}
            </Badge>
          ))}
        </div>
        <h1 className="mt-2 font-serif text-3xl font-bold text-foreground">{item.name}</h1>
      </div>

      <DetailBody pack={pack} item={item} />

      <footer className="border-t border-border pt-4 text-xs text-muted-foreground">
        Content from {pack.name}
        {pack.publisherName ? ` · ${pack.publisherName}` : ''} ·{' '}
        {pack.licenseUrl ? (
          <a
            href={pack.licenseUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            {licenseLabel(pack.licenseType)}
          </a>
        ) : (
          licenseLabel(pack.licenseType)
        )}{' '}
        ·{' '}
        <Link href="/legal" className="text-primary hover:underline">
          Attribution
        </Link>
      </footer>
    </article>
  );
};
