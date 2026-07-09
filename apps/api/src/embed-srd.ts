/**
 * Standalone script to backfill `rule_items.embedding` (pgvector) via OpenAI.
 *
 * Default: embeds only rows where `embedding IS NULL`.
 *   pnpm --filter @rpgforce-ai/api run embed:srd
 *
 * Re-embed everything (e.g. after changing the embedding text formula):
 *   pnpm --filter @rpgforce-ai/api run embed:srd -- --force
 */
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { AppModule } from './app.module';
import { PrismaService } from './shared/prisma.service';
import { EmbeddingsService } from './modules/embeddings/embeddings.service';
import { buildEmbeddingText, toVectorLiteral } from './modules/embeddings/embedding-text-builder';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const TABLE_WIDTH = 48;
const WRITE_PROGRESS_EVERY = 200;

interface RuleItemRow {
  id: string;
  name: string;
  kind: string;
  contentMd: string | null;
  normalized: unknown;
}

function printSummary(result: {
  countsByKind: Record<string, number>;
  total: number;
  embedMs: number;
  writeMs: number;
  force: boolean;
}) {
  const rows = Object.entries(result.countsByKind)
    .filter(([, n]) => n > 0)
    .sort(([, a], [, b]) => b - a);

  const border = '─'.repeat(TABLE_WIDTH);
  const numWidth = 6;
  const padRow = (left: string, right: string) => {
    const rightPadded = String(right).padStart(numWidth);
    const contentLen = 1 + left.length + 1 + rightPadded.length;
    const spaces = Math.max(0, TABLE_WIDTH - contentLen);
    return `│ ${left}${' '.repeat(spaces)}${rightPadded} │`;
  };

  const title = 'Resumo do embedding';
  const titlePadded = title
    .padStart(Math.floor((TABLE_WIDTH - title.length) / 2) + title.length)
    .padEnd(TABLE_WIDTH);

  console.log('');
  console.log(`┌${border}┐`);
  console.log(`│${titlePadded}│`);
  console.log(`├${border}┤`);
  for (const [kind, count] of rows) {
    console.log(padRow(kind, String(count)));
  }
  console.log(`├${border}┤`);
  console.log(padRow('Total embedado', String(result.total)));
  console.log(padRow('Modelo', EMBEDDING_MODEL));
  console.log(padRow('Tempo (OpenAI)', `${(result.embedMs / 1000).toFixed(2)}s`));
  console.log(padRow('Tempo (gravação)', `${(result.writeMs / 1000).toFixed(2)}s`));
  console.log(padRow('Duração total', `${((result.embedMs + result.writeMs) / 1000).toFixed(2)}s`));
  if (result.force) console.log(padRow('Modo', '--force (tudo)'));
  console.log(`└${border}┘`);
  console.log('');
}

const run = async () => {
  const force = process.argv.includes('--force');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const prisma = app.get(PrismaService);
  const embeddings = app.get(EmbeddingsService);

  const banner = '═'.repeat(55);
  console.log(banner);
  console.log(`  Embedding SRD (${EMBEDDING_MODEL})${force ? ' — --force' : ''}`);
  console.log(banner);
  console.log('');

  const rows = await prisma.$queryRaw<RuleItemRow[]>`
    SELECT "id", "name", "kind", "contentMd", "normalized"
    FROM "rule_items"
    WHERE ${force ? Prisma.sql`TRUE` : Prisma.sql`"embedding" IS NULL`}
    ORDER BY "kind", "name"
  `;

  if (rows.length === 0) {
    console.log('Nada para embedar: todos os rule_items já têm embedding.');
    console.log('Use --force para reprocessar tudo.');
    await app.close();
    process.exit(0);
  }

  const countsByKind: Record<string, number> = {};
  for (const row of rows) countsByKind[row.kind] = (countsByKind[row.kind] ?? 0) + 1;

  console.log(`Encontrados ${rows.length} rule_item(s) para embedar:`);
  for (const [kind, count] of Object.entries(countsByKind).sort(([, a], [, b]) => b - a)) {
    console.log(`  ${kind}: ${count}`);
  }
  console.log('');

  console.log('Gerando embeddings via OpenAI...');
  const texts = rows.map((row) => buildEmbeddingText(row));
  const embedStartMs = Date.now();
  const vectors = await embeddings.embedTexts(texts, ({ batchIndex, totalBatches, batchSize, elapsedMs }) => {
    console.log(
      `  Lote ${batchIndex}/${totalBatches}: ${batchSize} item(s) em ${(elapsedMs / 1000).toFixed(2)}s`
    );
  });
  const embedMs = Date.now() - embedStartMs;
  console.log(`  ✓ ${rows.length} embeddings gerados em ${(embedMs / 1000).toFixed(2)}s`);
  console.log('');

  console.log('Gravando vetores no banco...');
  const writeStartMs = Date.now();
  for (let i = 0; i < rows.length; i++) {
    await prisma.$executeRaw`
      UPDATE "rule_items" SET "embedding" = ${toVectorLiteral(vectors[i])}::vector
      WHERE "id" = ${rows[i].id}
    `;
    const done = i + 1;
    if (done % WRITE_PROGRESS_EVERY === 0 || done === rows.length) {
      console.log(`  ${done}/${rows.length} gravados`);
    }
  }
  const writeMs = Date.now() - writeStartMs;
  console.log(`  ✓ gravação concluída em ${(writeMs / 1000).toFixed(2)}s`);

  await app.close();
  printSummary({ countsByKind, total: rows.length, embedMs, writeMs, force });
  process.exit(0);
};

run().catch((err) => {
  console.error('Embedding falhou:', err);
  process.exit(1);
});
