'use client';

import { useEffect, useState } from 'react';
import { Dna, GitBranch, Shield, Star, type LucideIcon } from 'lucide-react';
import {
  getFeatureChoiceState,
  featRuleItemAsMechanicsFeature,
  isGrapplerFeature,
  isMagicInitiateFeature,
  isSkilledFeature,
  isMagicInitiateFullyChosen,
  isSkilledFullyChosen,
  getCharacterFeatIds,
  realClassEntries,
} from '@rpgforce-ai/shared';
import { Swords, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { TruncatedTooltip } from '@/components/ui/tooltip';
import { useCharacterComputed } from '../context';
import { useAllSpells } from './spellcasting/hooks/use-all-spells';
import { needsChoiceAccent, needsChoiceHighlight } from '../constants';
import { Section } from '../ui/section';
import { FeatureDetailContent } from '../features/feature-detail-dialog';
import type { CharacterFormData } from '../types';
import type { PendingFlags } from '../pending-flags';

interface FeaturesSectionProps {
  data: CharacterFormData;
  onChange: (data: CharacterFormData) => void;
  pendingFlags: PendingFlags;
}

/**
 * At lg each group is `min(content, column share)`: the share (class gets double, having far more
 * items) keeps the sum from overflowing the column, and the `max-content` cap stops a short group
 * from stretching to its whole share — freed space is redistributed by flex to groups that still
 * have content. A fixed px cap won't do: the sum overflows the column and puts a scrollbar on the
 * whole component. Below lg the column grows with content (natural height + cap).
 */
const GROUP_FLEX_CLASS = 'max-h-72 lg:max-h-max lg:flex-[2]';
const GROUP_FLEX_DEFAULT = 'max-h-72 lg:max-h-max lg:flex-1';

function FeatureGroupBox({
  icon: Icon,
  label,
  sizeClass,
  children,
}: {
  icon: LucideIcon;
  label: string;
  sizeClass: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-border bg-muted/40',
        sizeClass
      )}
      role="listitem"
    >
      <div
        className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5"
        style={{ color: 'var(--muted-foreground)' }}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 truncate text-xs font-medium uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-2 py-2">
        <div className="flex w-full min-w-0 max-w-full flex-wrap gap-1.5">{children}</div>
      </div>
    </div>
  );
}

export function FeaturesSection({ data, onChange, pendingFlags }: FeaturesSectionProps) {
  const { featureDetails, feats, classes, races, skillsList } = useCharacterComputed();

  const [selectedFeatureIndex, setSelectedFeatureIndex] = useState<number | null>(null);
  const [additionalFeatDialogOpen, setAdditionalFeatDialogOpen] = useState(false);
  const [selectedAdditionalFeatId, setSelectedAdditionalFeatId] = useState<string | null>(null);

  const featsList = feats;
  // Spell catalog (cached; same request the spellcasting section makes) so the "pending" indicators
  // for spell-pick features (Magic Initiate, Magical Discoveries, …) cap their requirement at what
  // the pool can still offer — matching the save gate exactly, so front and back never disagree.
  const spellPackId =
    classes.find((c) => c.id === data.classRuleItemId)?.packId ??
    races.find((r) => r.id === data.raceRuleItemId)?.packId ??
    null;
  const { allSpells } = useAllSpells(spellPackId);
  const spellCatalog = allSpells.length > 0 ? allSpells : undefined;

  type FeatureGroupItem = {
    index: number;
    name: string;
    hasOptions: boolean;
    selectedOptionLabel: string | null;
  };
  type FeatureGroup = {
    id: string;
    label: string;
    icon: LucideIcon;
    size: string;
    fallback: string;
    /** Empty groups render their fallback; a subclass with nothing yet is hidden instead. */
    hideWhenEmpty: boolean;
    items: FeatureGroupItem[];
  };

  // One group per class (and per subclass), so a Fighter/Wizard reads as two boxes instead of one
  // pile. `sourceClassId` is what tells the two apart; without it they would merge.
  const classEntries = realClassEntries(data);
  const groups: FeatureGroup[] = [];
  const groupById = new Map<string, FeatureGroup>();
  const addGroup = (group: FeatureGroup) => {
    groups.push(group);
    groupById.set(group.id, group);
  };

  const multiclassed = classEntries.length > 1;
  for (const entry of classEntries) {
    addGroup({
      id: `class:${entry.classRuleItemId}`,
      label: entry.className ? `${entry.className} class` : 'Class',
      icon: Shield,
      // Splitting the double share across N classes keeps the column bounded (see FeatureGroupBox).
      size: multiclassed ? GROUP_FLEX_DEFAULT : GROUP_FLEX_CLASS,
      fallback: 'Determined by class.',
      hideWhenEmpty: false,
      items: [],
    });
    addGroup({
      id: `subclass:${entry.classRuleItemId}`,
      label: entry.subclass ? `${entry.subclass} subclass` : 'Subclass',
      icon: GitBranch,
      size: GROUP_FLEX_DEFAULT,
      fallback: 'Determined by subclass.',
      hideWhenEmpty: true,
      items: [],
    });
  }
  if (classEntries.length === 0) {
    addGroup({
      id: 'class:',
      label: 'Class',
      icon: Shield,
      size: GROUP_FLEX_CLASS,
      fallback: 'Determined by class.',
      hideWhenEmpty: false,
      items: [],
    });
  }
  addGroup({
    id: 'race',
    label: data.race?.trim() ? `${data.race.trim()} species` : 'Species',
    icon: Dna,
    size: GROUP_FLEX_DEFAULT,
    fallback: 'Determined by species.',
    hideWhenEmpty: false,
    items: [],
  });

  featureDetails.forEach((f, index) => {
    const source = (f.source ?? 'class') as 'class' | 'subclass' | 'race' | 'background';
    if (source === 'background') return;
    if (source !== 'class' && source !== 'subclass' && source !== 'race') return;
    const group =
      source === 'race'
        ? groupById.get('race')
        : (groupById.get(`${source}:${f.sourceClassId ?? ''}`) ??
          // Pre-multiclass data carries no class id: fall back to the first group of that kind.
          groups.find((g) => g.id.startsWith(`${source}:`)));
    if (!group) return;
    const { hasOptions, selectedOptionLabel } = getFeatureChoiceState(f, data, featureDetails, {
      allSpells: spellCatalog,
      skillsList,
    });
    group.items.push({ index, name: f.name, hasOptions, selectedOptionLabel });
  });

  // Same shared list the PDF export renders under FEATS.
  const additionalFeatIds = getCharacterFeatIds(data, featsList);
  const hasAdditionalFeat = additionalFeatIds.length > 0;
  const hasGrapplerFeat = additionalFeatIds.some((id) => {
    const feat = featsList.find((f) => f.id === id);
    return feat != null && isGrapplerFeature(featRuleItemAsMechanicsFeature(feat));
  });

  useEffect(() => {
    if (!hasGrapplerFeat && data.grapplerAbilityScore) {
      onChange({ ...data, grapplerAbilityScore: null });
    }
  }, [data, onChange, hasGrapplerFeat]);

  return (
    <>
      <Section
        title="Features & Traits"
        aiHintArea="features"
        icon={<Swords className="h-4 w-4" />}
        className="flex min-h-0 min-w-0 flex-1 flex-col self-stretch"
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto lg:overflow-y-hidden">
          {groups
            // A subclass group only appears once it has features (level 3+ in that class).
            .filter((group) => !group.hideWhenEmpty || group.items.length > 0)
            .map((group) => {
              const items = group.items;
              const isEmpty = items.length === 0;
              return (
                <FeatureGroupBox
                  key={group.id}
                  icon={group.icon}
                  label={group.label}
                  sizeClass={group.size}
                >
                  {isEmpty ? (
                    <p className="text-xs text-muted-foreground">{group.fallback}</p>
                  ) : (
                    items.map((item) => {
                      const isOpen = selectedFeatureIndex === item.index;
                      const isChoiceFeature = item.hasOptions;
                      const needsChoice = isChoiceFeature && !item.selectedOptionLabel;
                      const featureKey = `feature:${item.name}`;
                      const featureFlagged = pendingFlags.isFlagged(featureKey);
                      const choiceButtonClass = cn(
                        'flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 overflow-hidden rounded-full border px-2.5 py-0.5 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        needsChoice
                          ? needsChoiceHighlight(featureFlagged)
                          : 'border-transparent bg-secondary/60 text-foreground hover:bg-secondary/80',
                        isOpen && 'bg-primary/10 text-primary-ink'
                      );
                      const defaultButtonClass = cn(
                        'flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 overflow-hidden rounded-full border border-transparent bg-secondary/60 px-2.5 py-0.5 text-xs text-foreground transition-colors hover:bg-secondary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        isOpen && 'bg-primary/20 text-primary-ink'
                      );
                      const buttonClass =
                        isChoiceFeature && needsChoice ? choiceButtonClass : defaultButtonClass;
                      return (
                        <button
                          key={`${item.name}-${item.index}`}
                          type="button"
                          onPointerDown={() => pendingFlags.dismiss(featureKey)}
                          onClick={() => setSelectedFeatureIndex(item.index)}
                          className={buttonClass}
                          aria-label={`View details for ${item.name}`}
                          aria-pressed={isOpen}
                        >
                          <span className="block min-w-0 flex-1 truncate text-left">
                            <TruncatedTooltip text={item.name} className="truncate" />
                          </span>
                          <ChevronRight
                            className={cn(
                              'h-3 w-3 shrink-0',
                              isChoiceFeature && needsChoice
                                ? needsChoiceAccent(featureFlagged)
                                : 'text-muted-foreground'
                            )}
                            aria-hidden
                          />
                        </button>
                      );
                    })
                  )}
                </FeatureGroupBox>
              );
            })}
          {hasAdditionalFeat && (
            <FeatureGroupBox
              key="additional-feat"
              icon={Star}
              label="Feats"
              sizeClass={GROUP_FLEX_DEFAULT}
            >
              {additionalFeatIds
                .map((id) => featsList.find((f) => f.id === id))
                .filter((f): f is NonNullable<typeof f> => f != null)
                .map((feat) => {
                  const isOpen = additionalFeatDialogOpen && selectedAdditionalFeatId === feat.id;
                  // A feat is one rule item: its machine key is at the root of `normalized`.
                  const featAsFeature = featRuleItemAsMechanicsFeature(feat);
                  const isSkilled = isSkilledFeature(featAsFeature);
                  const isGrappler = isGrapplerFeature(featAsFeature);
                  const needsSkilledChoice = isSkilled && !isSkilledFullyChosen(data, featsList);
                  const needsGrapplerChoice = isGrappler && !data.grapplerAbilityScore;
                  const isMagicInitiate = isMagicInitiateFeature(featAsFeature);
                  const needsMagicInitiateChoice =
                    isMagicInitiate && !isMagicInitiateFullyChosen(data, spellCatalog);
                  const needsChoice =
                    needsSkilledChoice || needsGrapplerChoice || needsMagicInitiateChoice;
                  const featKey = `feat:${feat.id}`;
                  return (
                    <button
                      key={feat.id}
                      type="button"
                      onPointerDown={() => pendingFlags.dismiss(featKey)}
                      onClick={() => {
                        setSelectedAdditionalFeatId(feat.id);
                        setAdditionalFeatDialogOpen(true);
                      }}
                      className={cn(
                        'flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 overflow-hidden rounded-full px-2.5 py-0.5 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        needsChoice
                          ? cn('border', needsChoiceHighlight(pendingFlags.isFlagged(featKey)))
                          : 'border border-transparent bg-secondary/60 text-foreground hover:bg-secondary/80',
                        isOpen && 'bg-primary/20 text-primary-ink'
                      )}
                      aria-label={`View details for ${feat.name}`}
                      aria-pressed={isOpen}
                    >
                      <span className="block min-w-0 flex-1 truncate text-left">
                        <TruncatedTooltip text={feat.name} className="truncate" />
                      </span>
                      <ChevronRight
                        className="h-3 w-3 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    </button>
                  );
                })}
            </FeatureGroupBox>
          )}
        </div>

        <Dialog
          open={selectedFeatureIndex !== null || additionalFeatDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedFeatureIndex(null);
              setAdditionalFeatDialogOpen(false);
              setSelectedAdditionalFeatId(null);
            }
          }}
        >
          <DialogContent
            className="flex max-h-[85vh] min-h-0 max-w-2xl flex-col overflow-hidden"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <FeatureDetailContent
              selectedFeatureIndex={selectedFeatureIndex}
              additionalFeatDialogOpen={additionalFeatDialogOpen}
              selectedAdditionalFeatId={selectedAdditionalFeatId}
            />
          </DialogContent>
        </Dialog>
      </Section>
    </>
  );
}
