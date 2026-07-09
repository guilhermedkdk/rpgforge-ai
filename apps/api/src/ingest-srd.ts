/**
 * Standalone script to run SRD ingestion (full or by scope).
 *
 * Full ingestion (all types, many API calls):
 *   pnpm --filter @rpgforce-ai/api run ingest:srd
 *   node dist/ingest-srd.js
 *
 * Ingest only one type (fewer API calls, lighter on Open5e):
 *   pnpm --filter @rpgforce-ai/api run ingest:srd items
 *   node dist/ingest-srd.js spells
 *
 * Scopes: all | items | spells | feats | backgrounds | races | abilities | classes | rulesets
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  Open5eIngestionService,
  INGESTION_SCOPES,
  type IngestionScope,
} from './modules/ingestion/open5e/open5e-ingestion.service';

const SUMMARY_LABELS: Record<string, string> = {
  spells: 'Magias',
  feats: 'Talentos',
  items: 'Itens',
  magicitems: 'Itens mágicos',
  backgrounds: 'Antecedentes',
  races: 'Raças',
  abilities: 'Habilidades',
  classes: 'Classes',
  subclasses: 'Subclasses',
  class_features: 'Características de classe',
  rulesets: 'Rulesets (capítulos)',
  rules: 'Rules (tópicos)',
  languages: 'Idiomas',
  synthetic: 'Conteúdo sintético',
};

const TABLE_WIDTH = 48;

function printSummary(result: { packId: string; counts: Record<string, number>; durationMs: number }) {
  const total = Object.entries(result.counts).reduce((sum, [, n]) => sum + n, 0);

  const rows = Object.entries(result.counts)
    .filter(([, n]) => n != null && n > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([key, count]) => ({
      label: SUMMARY_LABELS[key] ?? key,
      count,
    }));

  const border = '─'.repeat(TABLE_WIDTH);
  const numWidth = 6;
  const padRow = (left: string, right: string) => {
    const rightPadded = String(right).padStart(numWidth);
    const contentLen = 1 + left.length + 1 + rightPadded.length;
    const spaces = Math.max(0, TABLE_WIDTH - contentLen);
    return `│ ${left}${' '.repeat(spaces)}${rightPadded} │`;
  };

  const title = 'Resumo da ingestão';
  const titlePadded = title
    .padStart(Math.floor((TABLE_WIDTH - title.length) / 2) + title.length)
    .padEnd(TABLE_WIDTH);

  console.log('');
  console.log(`┌${border}┐`);
  console.log(`│${titlePadded}│`);
  console.log(`├${border}┤`);
  for (const { label, count } of rows) {
    const labelShort = label.length > TABLE_WIDTH - 10 ? label.slice(0, TABLE_WIDTH - 11) : label;
    console.log(padRow(labelShort, String(count)));
  }
  console.log(`├${border}┤`);
  console.log(padRow('Total de itens', String(total)));
  console.log(padRow('Duração', `${(result.durationMs / 1000).toFixed(2)}s`));
  const packIdDisplay = result.packId.length > TABLE_WIDTH - 14 ? `${result.packId.slice(0, TABLE_WIDTH - 15)}…` : result.packId;
  console.log(padRow('Pack ID', packIdDisplay));
  console.log(`└${border}┘`);
  console.log('');
}

function parseScope(argv: string[]): IngestionScope {
  // argv[0]=node, argv[1]=script; pnpm run ingest:srd -- items → argv[2] may be "--", argv[3]="items"
  const raw = argv[2] === '--' ? argv[3] : argv[2];
  const arg = raw?.toLowerCase()?.trim();
  if (!arg || arg === 'all') return 'all';
  if (INGESTION_SCOPES.includes(arg as IngestionScope)) return arg as IngestionScope;
  console.error(`Escopo inválido: "${raw ?? ''}". Use: ${INGESTION_SCOPES.join(' | ')}`);
  process.exit(1);
}

const run = async () => {
  const scope = parseScope(process.argv);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const ingestion = app.get(Open5eIngestionService);
  const result = await ingestion.run({ scope });
  await app.close();
  printSummary(result);
  process.exit(0);
};

run().catch((err) => {
  console.error('Ingestão falhou:', err);
  process.exit(1);
});
