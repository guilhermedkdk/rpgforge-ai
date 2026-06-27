'use client';

import * as React from 'react';
import { DialogTitle, DialogDescription } from '@/components/ui/dialog';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { RuleItemResponse } from '@rpgforce-ai/shared';
import type { CharacterFormData } from '@/lib/dnd-srd/character-state';
import {
  ABILITY_SCORE_CAP_FROM_ASI,
  canApplyAbilityScoreImprovementASI,
  getAbilityScoreImprovementASIBlockedReasons,
  getAbilityScoreImprovementFeatIdsFromGains,
} from '@/lib/dnd-srd/character-state';
import {
  getExpertiseSelectionPrerequisiteMessage,
  parseToolProficiencyChoose,
} from '../../helpers';
import { RequirementAlert, SelectionSection } from './feature-detail-primitives';
import { SkilledFeatPanel } from './skilled-feat-panel';
import { AbilityScoreIncreasePicker } from './ability-score-increase-picker';
import { buildEffectiveAttributeScores, normalizeFeatName } from '@/lib/dnd-srd/feat-prerequisites';

interface AdditionalFeatViewProps {
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  featsList: RuleItemResponse[];
  selectedAdditionalFeatId: string | null;
  skillsList: Array<{ key: string; name: string; abilityKey: string }>;
  toolItemsByCategory: Record<string, RuleItemResponse[]>;
}

export function AdditionalFeatView({
  data,
  onChange,
  featsList,
  selectedAdditionalFeatId,
  skillsList,
  toolItemsByCategory,
}: AdditionalFeatViewProps) {
  const featIdByName = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const feat of featsList) {
      const key = normalizeFeatName(feat.name ?? '');
      if (!key || map.has(key)) continue;
      map.set(key, feat.id);
    }
    return map;
  }, [featsList]);

  const backgroundFeatIds = (data.featureDetails ?? [])
    .filter((f) => f.source === 'background')
    .map((f) => featIdByName.get(normalizeFeatName(f.name ?? '')) ?? null)
    .filter((id): id is string => id != null);

  const eldritchFeatIds = (data.eldritchInvocationSelections ?? [])
    .map((s) => s.featId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  const ids = [
    ...backgroundFeatIds,
    ...getAbilityScoreImprovementFeatIdsFromGains(data.abilityScoreImprovementByGain),
    ...(data.fightingStyleFeatId ? [data.fightingStyleFeatId] : []),
    ...(data.epicBoonFeatId ? [data.epicBoonFeatId] : []),
    ...(data.versatileFeatId ? [data.versatileFeatId] : []),
    ...eldritchFeatIds,
  ].filter((id, idx, arr) => arr.indexOf(id) === idx);

  const chosenFeats = ids
    .map((id) => featsList.find((f) => f.id === id))
    .filter((f): f is NonNullable<typeof f> => f != null);

  if (chosenFeats.length === 0) return null;

  const feat =
    (selectedAdditionalFeatId && chosenFeats.find((f) => f.id === selectedAdditionalFeatId)) ||
    chosenFeats[0];

  const raw = (feat.raw ?? {}) as Record<string, unknown>;
  const norm = (feat.normalized ?? {}) as Record<string, unknown>;
  const benefits = (norm.benefits ?? raw.benefits ?? []) as Array<{ desc?: string | null }>;
  const benefitDescs = benefits.map((b) => (b?.desc ?? '').trim()).filter(Boolean);
  const prerequisite = (norm.prerequisite ?? raw.prerequisite ?? '') as string;
  const descTop = (norm.desc ?? raw.desc ?? '') as string;
  const contentMd =
    (benefitDescs.length > 0
      ? [
          prerequisite?.trim() ? `**Prerequisite:** ${prerequisite.trim()}` : '',
          ...benefitDescs,
        ]
          .filter(Boolean)
          .join('\n\n')
      : null) ||
    feat.contentMd?.trim() ||
    (prerequisite?.trim() ? `**Prerequisite:** ${prerequisite.trim()}\n\n` : '') + descTop ||
    'No description available.';

  const isSkilledFeat = normalizeFeatName(feat.name ?? '') === 'skilled';
  const isGrapplerFeat = normalizeFeatName(feat.name ?? '') === 'grappler';

  const skilledPrereqMessage = isSkilledFeat
    ? (() => {
        const skillMsg = getExpertiseSelectionPrerequisiteMessage(data, skillsList, {
          contextClosing: 'before choosing Skilled here.',
        });
        if (skillMsg) return skillMsg;

        // Also require all "Choose N X" tool proficiency choices to be complete.
        const profLines = (data.proficiencies ?? '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
        const toolLine = profLines.find((l) => /^Tool Proficien/i.test(l));
        if (toolLine) {
          const valueStr = toolLine.slice(toolLine.indexOf(':') + 1).trim();
          const segments = valueStr.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
          for (const seg of segments) {
            const parsed = parseToolProficiencyChoose(seg);
            if (!parsed || parsed.chooseN <= 0) continue;
            const chosen = data.toolProficiencyChoices?.[seg] ?? [];
            if (chosen.length < parsed.chooseN) {
              return `Complete all tool proficiency choices in the Proficiencies section before choosing Skilled here.`;
            }
          }
        }

        return null;
      })()
    : null;

  const canApplyGrapplerAbilityScore = canApplyAbilityScoreImprovementASI(data);
  const grapplerBlockedReasons = canApplyGrapplerAbilityScore
    ? []
    : getAbilityScoreImprovementASIBlockedReasons(data);
  const grapplerTarget = data.grapplerAbilityScore ?? null;
  const grapplerEffectiveScores = isGrapplerFeat ? buildEffectiveAttributeScores(data) : {};

  return (
    <>
      <DialogTitle className="pr-8">{feat.name}</DialogTitle>
      <DialogDescription asChild>
        <div className="markdown-body max-h-[calc(85vh-7.5rem)] overflow-y-auto pr-3 text-left text-sm text-muted-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_strong]:font-semibold [&_strong]:text-foreground [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:font-serif [&_h3]:font-semibold [&_h3]:text-foreground [&_h4]:mt-2 [&_h4]:mb-1 [&_h4]:font-serif [&_h4]:font-semibold [&_h4]:text-foreground [&_table]:w-full [&_table]:mb-5 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:bg-muted [&_th]:text-foreground [&_th]:font-medium [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_td]:text-muted-foreground">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{contentMd}</ReactMarkdown>

          {isSkilledFeat && skilledPrereqMessage ? (
            <SelectionSection>
              <RequirementAlert reasons={[skilledPrereqMessage]} />
            </SelectionSection>
          ) : null}

          {isSkilledFeat && !skilledPrereqMessage ? (
            <SkilledFeatPanel
              data={data}
              onChange={onChange}
              featsList={featsList}
              skillsList={skillsList}
              toolItemsByCategory={toolItemsByCategory}
            />
          ) : null}

          {isGrapplerFeat ? (
            <SelectionSection density="compact">
              {grapplerBlockedReasons.length > 0 ? (
                <RequirementAlert className="mb-3" reasons={grapplerBlockedReasons} />
              ) : null}
              {canApplyGrapplerAbilityScore ? (
                <AbilityScoreIncreasePicker
                  attributes={['Strength', 'Dexterity']}
                  selected={grapplerTarget}
                  effectiveScores={grapplerEffectiveScores}
                  cap={ABILITY_SCORE_CAP_FROM_ASI}
                  helperText="Choose one ability score to increase by 1 (max 20)."
                  onSelect={(attr) => onChange({ ...data, grapplerAbilityScore: attr })}
                />
              ) : null}
            </SelectionSection>
          ) : null}
        </div>
      </DialogDescription>
    </>
  );
}
