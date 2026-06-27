'use client';

import * as React from 'react';
import type { LevelValueRow } from '@/lib/dnd-srd/feature-column-tables';

interface LevelValueTableProps {
  rows: LevelValueRow[];
}

const thClass =
  'border border-border px-2 py-1 bg-muted text-left text-foreground font-medium';
const tdClass = 'border border-border px-2 py-1 align-top text-muted-foreground';

/** Shared narrow Level/Value table used by feature class-table columns. */
export function LevelValueTable({ rows }: LevelValueTableProps) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-1 mb-1 overflow-x-auto">
      <div className="inline-block">
        <table className="mb-0! border-collapse w-auto!">
          <thead>
            <tr>
              <th className={thClass}>Level</th>
              <th className={thClass}>Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${row.level}-${rowIndex}`}>
                <td className={tdClass}>{row.level}</td>
                <td className={tdClass}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
