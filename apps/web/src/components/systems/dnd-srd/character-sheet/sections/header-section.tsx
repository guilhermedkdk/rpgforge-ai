'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { RuleItemSelect } from '../ui/rule-item-select';
import type { RuleItemResponse } from '@rpgforce-ai/shared';
import { getDefaultAttributes, isCharacterBackgroundSelected } from '@/lib/dnd-srd/character-state';
import type { CharacterFormData } from '../types';
import { updateField } from '../helpers';
import { numberInputNoSpinner, requiredFieldErrorBorder } from '../constants';

export interface HeaderSectionProps {
  data: CharacterFormData;
  onChange: (data: CharacterFormData) => void;
  classes: RuleItemResponse[];
  backgrounds: RuleItemResponse[];
  races: RuleItemResponse[];
  classesLoading: boolean;
  backgroundsLoading: boolean;
  racesLoading: boolean;
  readOnly?: boolean;
  saveAttempted?: boolean;
}

export function HeaderSection({
  data,
  onChange,
  classes,
  backgrounds,
  races,
  classesLoading,
  backgroundsLoading,
  racesLoading,
  readOnly = false,
  saveAttempted = false,
}: HeaderSectionProps) {
  const [levelInput, setLevelInput] = useState<string>(() => String(data.level ?? 1));

  useEffect(() => {
    setLevelInput(String(data.level ?? 1));
  }, [data.level]);

  // Name is text-only (no derived stat reads it) — keep keystrokes local and commit on blur so
  // typing doesn't re-render the whole sheet. Never resync while focused (don't clobber typing).
  const [nameInput, setNameInput] = useState<string>(() => data.name ?? '');
  const nameFocusedRef = useRef(false);
  useEffect(() => {
    if (!nameFocusedRef.current) setNameInput(data.name ?? '');
  }, [data.name]);

  const handleLevelChange = useCallback(
    (rawValue: string) => {
      if (rawValue === '') {
        setLevelInput('');
        return;
      }
      const n = Number(rawValue);
      if (Number.isNaN(n)) {
        return;
      }
      const clamped = Math.max(1, Math.min(20, n));
      setLevelInput(String(clamped));
      if (clamped !== data.level) {
        updateField(data, onChange, 'level', clamped);
      }
    },
    [data, onChange, data.level]
  );

  const handleLevelBlur = useCallback(() => {
    if (levelInput === '') {
      setLevelInput('1');
      if (data.level !== 1) {
        updateField(data, onChange, 'level', 1);
      }
      return;
    }
    const n = Number(levelInput);
    if (Number.isNaN(n)) {
      setLevelInput(String(data.level ?? 1));
      return;
    }
    const clamped = Math.max(1, Math.min(20, n));
    if (clamped !== n) {
      setLevelInput(String(clamped));
    }
    if (clamped !== data.level) {
      updateField(data, onChange, 'level', clamped);
    }
  }, [levelInput, data, onChange]);

  const levelNum = Math.floor(Number(data.level));
  const nameInvalid = saveAttempted && !nameInput.trim();
  const levelInvalid =
    saveAttempted && !(Number.isFinite(levelNum) && levelNum >= 1 && levelNum <= 20);
  const classInvalid =
    saveAttempted && data.classRuleItemId == null && !(data.className ?? '').trim();
  const raceInvalid = saveAttempted && data.raceRuleItemId == null && !(data.race ?? '').trim();
  const backgroundInvalid = saveAttempted && !isCharacterBackgroundSelected(data);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3">
        <div>
          <Label
            htmlFor="char-name"
            className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
          >
            Character Name
          </Label>
          <Input
            id="char-name"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onFocus={() => {
              nameFocusedRef.current = true;
            }}
            onBlur={(e) => {
              nameFocusedRef.current = false;
              const trimmed = e.target.value.trim();
              if (trimmed !== nameInput) setNameInput(trimmed);
              if (trimmed !== data.name) {
                updateField(data, onChange, 'name', trimmed);
              }
            }}
            placeholder="Character name"
            className={cn(
              'mt-1 border-0 border-b border-border bg-transparent text-xl font-serif font-bold text-foreground placeholder:text-muted-foreground/40 rounded-none focus-visible:ring-0 focus-visible:border-primary',
              nameInvalid && requiredFieldErrorBorder
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_6.5rem_minmax(0,1fr)_minmax(0,1fr)]">
          {readOnly ? (
            <div>
              <Label
                htmlFor="char-class-readonly"
                className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
              >
                Class
              </Label>
              <div
                id="char-class-readonly"
                className="mt-1 flex min-h-9 w-full items-center rounded-md border border-border/70 bg-muted/25 px-3 py-2 text-sm text-foreground"
                aria-label="Class"
              >
                <span className="truncate">{data.className?.trim() || '—'}</span>
              </div>
            </div>
          ) : (
            <RuleItemSelect
              id="char-class"
              label="Class"
              placeholder="Select"
              value={data.classRuleItemId}
              items={classes}
              disabled={classesLoading}
              loading={classesLoading}
              filterItems={(c) => !(c.raw as { subclass_of?: unknown })?.subclass_of}
              invalid={classInvalid}
              onSelect={(id, item) => {
                const method = data.abilityScoreMethod ?? 'standard-array';
                const prevClassId = data.classRuleItemId ?? null;
                const nextClassId = id ?? null;
                const classChanged = prevClassId !== nextClassId;
                onChange({
                  ...data,
                  classRuleItemId: id,
                  className: item?.name ?? '',
                  level: 1,
                  ...(classChanged
                    ? {
                        attributes: getDefaultAttributes(method),
                        backgroundAbilityScoreIncrease: {},
                      }
                    : {}),
                });
              }}
              aria-label="Class"
            />
          )}
          <div className="min-w-0">
            <Label
              htmlFor="char-level"
              className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
            >
              Level
            </Label>
            <Input
              id="char-level"
              type="number"
              min={1}
              max={20}
              value={levelInput}
              onChange={(e) => handleLevelChange(e.target.value)}
              onBlur={handleLevelBlur}
              className={cn(
                numberInputNoSpinner,
                'mt-1 h-9 w-full rounded-md border border-border bg-secondary/50 px-2 text-center text-sm font-semibold text-foreground tabular-nums',
                'outline-none shadow-none focus:border-primary focus-visible:ring-0 focus-visible:ring-offset-0',
                levelInvalid && requiredFieldErrorBorder
              )}
            />
          </div>
          {readOnly ? (
            <div>
              <Label
                htmlFor="char-race-readonly"
                className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
              >
                Species
              </Label>
              <div
                id="char-race-readonly"
                className="mt-1 flex min-h-9 w-full items-center rounded-md border border-border/70 bg-muted/25 px-3 py-2 text-sm text-foreground"
                aria-label="Species"
              >
                <span className="truncate">{data.race?.trim() || '—'}</span>
              </div>
            </div>
          ) : (
            <RuleItemSelect
              id="char-race"
              label="Species"
              placeholder="Select"
              value={data.raceRuleItemId}
              items={races}
              disabled={racesLoading}
              loading={racesLoading}
              invalid={raceInvalid}
              onSelect={(id, item) =>
                onChange({
                  ...data,
                  raceRuleItemId: id,
                  race: item?.name ?? '',
                })
              }
              aria-label="Species"
            />
          )}
          {readOnly ? (
            <div>
              <Label
                htmlFor="char-bg-readonly"
                className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
              >
                Background
              </Label>
              <div
                id="char-bg-readonly"
                className="mt-1 flex min-h-9 w-full items-center rounded-md border border-border/70 bg-muted/25 px-3 py-2 text-sm text-foreground"
                aria-label="Background"
              >
                <span className="truncate">{data.background?.trim() || '—'}</span>
              </div>
            </div>
          ) : (
            <RuleItemSelect
              id="char-bg"
              label="Background"
              placeholder="Select"
              value={data.backgroundRuleItemId}
              items={backgrounds}
              disabled={backgroundsLoading}
              loading={backgroundsLoading}
              invalid={backgroundInvalid}
              onSelect={(id, item) =>
                onChange({
                  ...data,
                  backgroundRuleItemId: id,
                  background: item?.name ?? '',
                })
              }
              aria-label="Background"
            />
          )}
        </div>
      </div>
    </div>
  );
}
