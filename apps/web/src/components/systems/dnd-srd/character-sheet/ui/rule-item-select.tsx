'use client';

import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { normalizeFeatureDesc } from '@/lib/dnd-srd/derived-character-stats';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { RuleItemResponse } from '@rpgforce-ai/shared';

const triggerClassName =
  'mt-1 flex h-9 w-full items-center justify-between rounded-md border border-input bg-secondary/50 px-3 py-2 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50 disabled:pointer-events-none';

function getDetailSnippets(item: RuleItemResponse): { label: string; value: string }[] {
  const raw = item.raw ?? {};
  const snippets: { label: string; value: string }[] = [];

  const hitDice = raw.hit_dice as string | undefined;
  if (hitDice && item.kind !== 'CLASS') snippets.push({ label: 'Hit Dice', value: hitDice });

  const speed = raw.speed as string | undefined;
  if (speed) snippets.push({ label: 'Speed', value: speed });

  const size = raw.size as string | undefined;
  if (size) snippets.push({ label: 'Size', value: size });

  const skillProficiencies = raw.skill_proficiencies as string | undefined;
  if (skillProficiencies) snippets.push({ label: 'Proficiencies', value: skillProficiencies });

  const languages = raw.languages as string | undefined;
  if (languages) snippets.push({ label: 'Languages', value: languages });

  const weaponProficiencies = raw.weapon_proficiencies as string | undefined;
  if (weaponProficiencies) snippets.push({ label: 'Weapons', value: weaponProficiencies });

  const armorProficiencies = raw.armor_proficiencies as string | undefined;
  if (armorProficiencies) snippets.push({ label: 'Armor', value: armorProficiencies });

  return snippets;
}

function tableLikeToBullets(text: string): string {
  if (!text?.trim()) return '';
  const lines = text.replace(/^\s*\|\|\|?\s*\n?/, '').trim().split(/\n/);
  const bullets: string[] = [];
  for (const line of lines) {
    if (!line.includes('|')) continue;
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    if (cells.every((c) => /^-+$/.test(c))) continue;
    const label = cells[0];
    const value = cells.slice(1).join(' — ').trim();
    if (label && value) bullets.push(`- **${label}**: ${value}`);
  }
  return bullets.join('\n');
}

const PREVIEW_SECTION_TITLES: Record<string, string> = {
  CLASS: 'Core Traits',
  RACE: 'Traits',
  BACKGROUND: 'Benefits',
};

function getPreviewFromNormalized(item: RuleItemResponse): { content: string; sectionTitle: string } {
  const norm = item.normalized;
  const sectionTitle = PREVIEW_SECTION_TITLES[item.kind] ?? 'Details';
  if (!norm || typeof norm !== 'object') return { content: '', sectionTitle };

  if (item.kind === 'CLASS') {
    const sourceKey = item.sourceKey ?? '';
    const coreTraitsKey = `${sourceKey}_core-traits`;
    const features = norm.features as Array<{ key?: string; desc?: string }> | undefined;
    if (!Array.isArray(features)) return { content: '', sectionTitle };
    const core =
      features.find((f) => f.key === coreTraitsKey) ??
      features.find((f) => (f.key ?? '').endsWith('_core-traits'));
    const desc = core?.desc;
    if (typeof desc === 'string' && desc.trim())
      return { content: tableLikeToBullets(desc), sectionTitle };
  }

  if (item.kind === 'RACE') {
    const traits = norm.traits as Array<{ name?: string; desc?: string; order?: number }> | undefined;
    if (!Array.isArray(traits) || traits.length === 0) return { content: '', sectionTitle };
    const sorted = [...traits].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    const parts = sorted
      .filter((t) => t.name || t.desc)
      .map((t) => {
        const name = typeof t.name === 'string' ? t.name : 'Trait';
        const desc = typeof t.desc === 'string' ? t.desc : '';
        return desc.trim() ? `### ${name}\n\n${desc.trim()}` : `### ${name}`;
      });
    if (parts.length > 0) return { content: parts.join('\n\n'), sectionTitle };
  }

  if (item.kind === 'BACKGROUND') {
    const benefits = norm.benefits as Array<{ name?: string; type?: string; desc?: string }> | undefined;
    if (!Array.isArray(benefits) || benefits.length === 0) return { content: '', sectionTitle };
    const typeOrder = ['abilityScore', 'skillProficiency', 'toolProficiency', 'feat', 'equipment'];
    const sorted = [...benefits].sort((a, b) => {
      const ia = typeOrder.indexOf((a.type as string) ?? '');
      const ib = typeOrder.indexOf((b.type as string) ?? '');
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return ((a.type as string) ?? '').localeCompare((b.type as string) ?? '');
    });
    const parts = sorted
      .filter((b) => b.name || b.desc)
      .map((b) => {
        const name = (b.name as string) ?? (b.type as string) ?? 'Benefit';
        const desc = (b.desc as string) ?? '';
        return desc.trim() ? `### ${name}\n\n${desc.trim()}` : `### ${name}`;
      });
    if (parts.length > 0) return { content: parts.join('\n\n'), sectionTitle };
  }

  return { content: '', sectionTitle };
}

export interface RuleItemSelectProps {
  id: string;
  label: string;
  placeholder?: string;
  value: string | null;
  items: RuleItemResponse[];
  disabled?: boolean;
  loading?: boolean;
  filterItems?: (item: RuleItemResponse) => boolean;
  onSelect: (id: string | null, item: RuleItemResponse | null) => void;
  'aria-label'?: string;
  showClearOption?: boolean;
  /** Flags the trigger in red after a blocked save attempt with no selection. */
  invalid?: boolean;
}

export function RuleItemSelect({
  id,
  label,
  placeholder = 'Select',
  value,
  items,
  disabled = false,
  loading = false,
  filterItems,
  onSelect,
  'aria-label': ariaLabel,
  showClearOption = false,
  invalid = false,
}: RuleItemSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [previewId, setPreviewId] = React.useState<string | null>(null);

  const filteredItems = filterItems ? items.filter(filterItems) : items;
  const selectedItem = value ? items.find((i) => i.id === value) || null : null;
  const displayItem = previewId
    ? items.find((i) => i.id === previewId) || selectedItem
    : selectedItem;

  const handleSelect = React.useCallback(
    (id: string | null, item: RuleItemResponse | null) => {
      onSelect(id, item);
      setOpen(false);
      setPreviewId(null);
    },
    [onSelect]
  );

  return (
    <div className="flex flex-col">
      <Label
        htmlFor={id}
        className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
      >
        {label}
      </Label>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          id={id}
          disabled={disabled || loading}
          className={cn(triggerClassName, 'cursor-pointer', invalid && 'border-destructive')}
          aria-label={ariaLabel ?? label}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className={cn(!selectedItem && 'text-muted-foreground')}>
            {loading ? <Spinner size="sm" /> : selectedItem ? selectedItem.name : placeholder}
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform data-[state=open]:rotate-180"
            aria-hidden="true"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={4}
          className="min-w-[320px] max-w-[90vw] p-0 sm:min-w-[420px] sm:max-w-[480px]"
        >
          <div className="flex max-h-[min(70vh,420px)] flex-col sm:flex-row">
            <ul
              className="flex max-h-60 shrink-0 flex-col overflow-y-auto border-b border-border px-3 py-2 sm:max-h-none sm:max-w-[200px] sm:border-b-0 sm:border-r"
              role="listbox"
              aria-label={label}
            >
              {showClearOption ? (
                <DropdownMenuItem
                  onSelect={() => handleSelect(null, null)}
                  onPointerEnter={() => setPreviewId(null)}
                  className="cursor-pointer border-b border-border/50 font-medium"
                >
                  {placeholder}
                </DropdownMenuItem>
              ) : null}
              {filteredItems.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onSelect={() => handleSelect(item.id, item)}
                  onPointerEnter={() => setPreviewId(item.id)}
                  className={cn(
                    'cursor-pointer',
                    value === item.id && 'bg-primary/10 font-medium text-primary'
                  )}
                >
                  {item.name}
                </DropdownMenuItem>
              ))}
            </ul>
            <div className="flex min-h-[180px] max-w-[360px] flex-1 flex-col overflow-y-auto bg-muted/30 p-4 sm:min-h-0 sm:max-w-[400px] sm:p-5">
              {displayItem ? (
                <>
                  {(() => {
                    const preview = getPreviewFromNormalized(displayItem);
                    const snippets = getDetailSnippets(displayItem);
                    return (
                      <>
                        <h4 className="font-serif text-sm font-semibold text-foreground">
                          {displayItem.name}
                        </h4>
                        {snippets.length > 0 && (
                          <dl className="mt-2 space-y-1 border-t border-border/50 pt-2">
                            {snippets.map(({ label: dlLabel, value: dlValue }) => (
                              <div key={dlLabel}>
                                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  {dlLabel}
                                </dt>
                                <dd className="text-xs text-foreground">{dlValue}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                        {preview.content ? (
                          <div className="markdown-preview mt-2 border-t border-border/50 pt-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {preview.sectionTitle}
                            </span>
                            <div className="mt-1 text-xs leading-relaxed text-muted-foreground [&_ul]:list-none [&_ul]:pl-0 [&_li]:mb-2 [&_li]:last:mb-0 [&_h3]:mt-2 [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:text-xs [&_h3]:first:mt-1 [&_h4]:mt-2 [&_h4]:mb-1 [&_h4]:font-semibold [&_h4]:text-foreground [&_h4]:text-xs [&_strong]:font-semibold [&_strong]:text-foreground [&_table]:w-full [&_table]:text-[11px] [&_th]:border [&_th]:border-border [&_th]:px-1.5 [&_th]:py-0.5 [&_th]:bg-muted [&_td]:border [&_td]:border-border [&_td]:px-1.5 [&_td]:py-0.5">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {normalizeFeatureDesc(preview.content)}
                              </ReactMarkdown>
                            </div>
                          </div>
                        ) : null}
                        {!preview.content && snippets.length === 0 && (
                          <p className="mt-2 text-xs italic text-muted-foreground">
                            No description available.
                          </p>
                        )}
                      </>
                    );
                  })()}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select an option or hover over items to see details.
                </p>
              )}
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
