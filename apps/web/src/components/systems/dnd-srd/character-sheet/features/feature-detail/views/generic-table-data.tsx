'use client';

import { LevelValueTable } from './level-value-table';

interface GenericTableDataProps {
  tableData: Array<{ label: string; rows: Array<{ level: number; value: string }> }>;
}

/** Level/value tables for features whose tableData isn't handled by the spellcasting view. */
export function GenericTableData({ tableData }: GenericTableDataProps) {
  if (tableData.length === 0) return null;
  return (
    <>
      {tableData.map((tbl, tblIdx) => (
        <LevelValueTable key={tblIdx} rows={tbl.rows} />
      ))}
    </>
  );
}
