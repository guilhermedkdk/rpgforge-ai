'use client';

import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { descReferencesColumn, splitDescByColumnTables } from '@/lib/dnd-srd/feature-column-tables';
import { isSpellcastingTableFeature } from './spellcasting-table-view';
import { LevelValueTable } from './level-value-table';
import type { FeatureDetail } from './types';

/** True when the description references one of the feature's class-table columns,
 * so the table should be stitched inline. */
export function isInlineColumnTableFeature(feat: FeatureDetail | null | undefined): boolean {
  if (!feat || isSpellcastingTableFeature(feat)) return false;
  const tables = feat.tableData ?? [];
  if (tables.length === 0) return false;
  const desc = feat.desc ?? '';
  return tables.some((t) => descReferencesColumn(desc, t.label));
}

interface FeatureColumnTableViewProps {
  feat: FeatureDetail;
}

export function FeatureColumnTableView({ feat }: FeatureColumnTableViewProps) {
  const segments = React.useMemo(
    () => splitDescByColumnTables(feat.desc ?? '', feat.tableData ?? []),
    [feat.desc, feat.tableData],
  );
  const segmentClass = '[&_p]:mb-1.5 [&_p:last-child]:mb-0';
  return (
    <div className="flex flex-col gap-3">
      {segments.map((seg, i) =>
        seg.type === 'prose' ? (
          <div key={i} className={segmentClass}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{seg.text}</ReactMarkdown>
          </div>
        ) : (
          <LevelValueTable key={i} rows={seg.table.rows} />
        ),
      )}
    </div>
  );
}
