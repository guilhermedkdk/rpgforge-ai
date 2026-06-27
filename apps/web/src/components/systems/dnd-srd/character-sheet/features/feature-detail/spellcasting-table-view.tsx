'use client';

import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { FeatureDetail } from './types';

/** Spellcasting/Pact Magic only — their multi-column slot grids need this renderer.
 * Single-column class tables go through `FeatureColumnTableView`. */
export function isSpellcastingTableFeature(feat: FeatureDetail): boolean {
  const n = feat?.name?.trim().toLowerCase() ?? '';
  const hasTables = (feat?.tableData?.length ?? 0) > 0;
  const hasDesc = Boolean(feat?.desc);
  if (!hasTables || !hasDesc) return false;
  const isSpellcasting = n.includes('spellcasting');
  const isPactMagic = n.includes('pact') && n.includes('magic');
  return isSpellcasting || isPactMagic;
}

interface SpellcastingTableViewProps {
  feat: FeatureDetail;
}

/**
 * Renders the description of Spellcasting, Pact Magic, and Rage features,
 * interleaving prose segments with level/value tables.
 * Returns null when not applicable (caller should fall through to generic rendering).
 */
export function SpellcastingTableView({ feat }: SpellcastingTableViewProps) {
  if (!feat) return null;

  const featNameLower = feat.name?.trim().toLowerCase() ?? '';
  const isPactMagic = featNameLower.includes('pact') && featNameLower.includes('magic');
  const rawDesc = feat.desc ?? '';
  const tableData = feat.tableData ?? [];

  const thClass = 'border border-border px-2 py-1 bg-muted text-foreground font-medium';
  const tdClass = 'border border-border px-2 py-1 text-muted-foreground';
  const narrowTableClass = 'mb-0! border-collapse w-auto!';
  const wideTableClass = 'w-full mb-0 border-collapse';

  const renderLevelValueTable = (
    rows: Array<{ level: number; value: string }>,
    key: string,
  ) => (
    <div key={key} className="mt-1 mb-1 overflow-x-auto">
      <table className={narrowTableClass}>
        <thead>
          <tr>
            <th className={thClass + ' text-left'}>Level</th>
            <th className={thClass + ' text-left'}>Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${row.level}-${rowIndex}`}>
              <td className={tdClass + ' align-top'}>{row.level}</td>
              <td className={tdClass + ' align-top'}>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderTable = (tbl: { label: string; rows: Array<{ level: number; value: string }> }) =>
    renderLevelValueTable(tbl.rows, tbl.label);
  const desc = rawDesc.replace(/@@TABLE_\w+@@|__TABLE_\w+__/g, '').trim();
  const cantripsTbl = tableData.find((t) => t.label === 'Cantrips');
  const slotsTbls = tableData.filter((t) => t.label.toLowerCase().includes('slots'));
  const preparedTbl = tableData.find((t) => t.label === 'Prepared Spells');

  const getValueAtLevel = (rows: Array<{ level: number; value: string }>, level: number): string => {
    const sorted = [...rows]
      .filter((r) => r.level <= level)
      .sort((a, b) => b.level - a.level);
    return sorted[0]?.value ?? '—';
  };

  const combinedSlotsRows = (() => {
    if (slotsTbls.length === 0) return [];
    const maxLevel = 20;
    const slotCols = 9;
    const rows: Array<{ level: number; values: string[] }> = [];
    for (let level = 1; level <= maxLevel; level++) {
      const values = slotsTbls
        .map((t) => getValueAtLevel(t.rows, level))
        .concat(Array.from({ length: Math.max(0, slotCols - slotsTbls.length) }, () => '—'));
      rows.push({ level, values: values.slice(0, slotCols) });
    }
    return rows;
  })();

  const renderCombinedSlotsTable = () => (
    <div className="mt-1 mb-1 overflow-x-auto">
      <table className={wideTableClass}>
        <thead>
          <tr>
            <th className={thClass + ' text-left'}>Character Level</th>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <th key={n} className={thClass + ' text-center'}>
                {n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {combinedSlotsRows.map((row, rowIndex) => (
            <tr key={row.level} className={rowIndex % 2 === 1 ? 'bg-muted/30' : undefined}>
              <td className={tdClass + ' text-left font-medium text-foreground'}>{row.level}</td>
              {row.values.map((val, i) => (
                <td key={i} className={tdClass + ' text-center'}>
                  {val}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderPactMagicSlotsTable = () => {
    const spellSlotsTbl =
      tableData.find((t) => t.label.toLowerCase().includes('spell slots')) ?? slotsTbls[0] ?? null;
    const slotLevelTbl =
      tableData.find((t) => t.label.toLowerCase().includes('slot level')) ?? null;
    if (!spellSlotsTbl) return null;
    return (
      <div className="mt-1 mb-1 overflow-x-auto">
        <table className={wideTableClass}>
          <thead>
            <tr>
              <th className="border border-border px-2 py-1 bg-muted text-left text-foreground font-medium">
                Level
              </th>
              <th className="border border-border px-2 py-1 bg-muted text-left text-foreground font-medium">
                Spell Slots
              </th>
              <th className="border border-border px-2 py-1 bg-muted text-left text-foreground font-medium">
                Slot Level
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 20 }, (_, i) => i + 1).map((lvl) => (
              <tr key={lvl} className="bg-muted/0">
                <td className="border border-border px-2 py-1 align-top text-muted-foreground">
                  {lvl}
                </td>
                <td className="border border-border px-2 py-1 align-top text-muted-foreground">
                  {getValueAtLevel(spellSlotsTbl.rows, lvl)}
                </td>
                <td className="border border-border px-2 py-1 align-top text-muted-foreground">
                  {slotLevelTbl ? getValueAtLevel(slotLevelTbl.rows, lvl) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const reSpellSlots = /\n\n(?:\*\*)?Spell\s+Slots\./i;
  const rePactMagicSlots = /\n\n(?:\*\*)?Pact\s+Magic\s+Slots\./i;
  const rePreparedSpells = /\n\n(?:\*\*)?Prepared\s+Spells\s+of\s+Level\s+1\+\.?\s*/i;
  const reSpellcastingAbility = /\n\n(?:\*\*)?Spellcasting\s+Ability\./i;

  const idxPactSlots = desc.search(rePactMagicSlots);
  const i1 = idxPactSlots >= 0 ? idxPactSlots : desc.search(reSpellSlots);
  const i2 = desc.search(rePreparedSpells);
  const i3 = desc.search(reSpellcastingAbility);

  const seg1 = i1 >= 0 ? desc.slice(0, i1) : desc;
  const seg2 = i1 >= 0 && i2 >= 0 ? desc.slice(i1, i2) : i1 >= 0 ? desc.slice(i1) : '';
  const seg3 = i2 >= 0 && i3 >= 0 ? desc.slice(i2, i3) : i2 >= 0 ? desc.slice(i2) : '';
  const seg4 = i3 >= 0 ? desc.slice(i3) : '';
  const hasSeg2 = i1 >= 0 && seg2.trim().length > 0;
  const hasSeg3 = i2 >= 0 && seg3.trim().length > 0;
  const hasSeg4 = i3 >= 0 && seg4.trim().length > 0;
  const segmentClass = '[&_p]:mb-1.5 [&_p:last-child]:mb-0';

  return (
    <div className="flex flex-col gap-4">
      <div className={segmentClass}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{seg1.trim() || ''}</ReactMarkdown>
      </div>
      {cantripsTbl && renderTable(cantripsTbl)}
      {!hasSeg2 &&
        slotsTbls.length > 0 &&
        (isPactMagic ? renderPactMagicSlotsTable() : renderCombinedSlotsTable())}
      {hasSeg2 && (
        <>
          <div className={segmentClass}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{seg2.trim()}</ReactMarkdown>
          </div>
          {slotsTbls.length > 0 &&
            (isPactMagic ? renderPactMagicSlotsTable() : renderCombinedSlotsTable())}
        </>
      )}
      {hasSeg3 &&
        (() => {
          const marker = '**Changing Your Prepared Spells.';
          const idx = seg3.indexOf(marker);
          if (!preparedTbl || idx < 0) {
            return (
              <>
                <div className={segmentClass}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{seg3.trim()}</ReactMarkdown>
                </div>
                {preparedTbl && renderTable(preparedTbl)}
              </>
            );
          }
          const before = seg3.slice(0, idx);
          const after = seg3.slice(idx);
          return (
            <>
              <div className={segmentClass}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{before.trim()}</ReactMarkdown>
              </div>
              {renderTable(preparedTbl)}
              <div className={segmentClass}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{after.trim()}</ReactMarkdown>
              </div>
            </>
          );
        })()}
      {hasSeg4 && (
        <div className={segmentClass}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{seg4.trim()}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
