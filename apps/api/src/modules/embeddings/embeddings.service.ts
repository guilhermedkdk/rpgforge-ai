import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma.service';
import { batchByTokenBudget, toVectorLiteral } from './embedding-text-builder';

const EMBEDDING_MODEL = 'text-embedding-3-small';

export interface SimilarityHit {
  id: string;
  distance: number;
}

@Injectable()
export class EmbeddingsService {
  private readonly client: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService
  ) {
    this.client = new OpenAI({ apiKey: this.configService.getOrThrow<string>('OPENAI_API_KEY') });
  }

  async embedTexts(
    texts: string[],
    onBatchComplete?: (info: {
      batchIndex: number;
      totalBatches: number;
      batchSize: number;
      elapsedMs: number;
    }) => void
  ): Promise<number[][]> {
    const batches = batchByTokenBudget(texts);
    const results: number[][] = [];
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const startMs = Date.now();
      const response = await this.client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch,
      });
      results.push(...response.data.map((d) => d.embedding));
      onBatchComplete?.({
        batchIndex: i + 1,
        totalBatches: batches.length,
        batchSize: batch.length,
        elapsedMs: Date.now() - startMs,
      });
    }
    return results;
  }

  async searchSimilar(params: {
    queryEmbedding: number[];
    packId?: string;
    kinds?: string[];
    limit?: number;
  }): Promise<SimilarityHit[]> {
    const { queryEmbedding, packId, kinds, limit = 10 } = params;
    const vectorLiteral = toVectorLiteral(queryEmbedding);

    const conditions: Prisma.Sql[] = [Prisma.sql`"embedding" IS NOT NULL`];
    if (packId) conditions.push(Prisma.sql`"packId" = ${packId}`);
    if (kinds?.length) {
      conditions.push(
        Prisma.sql`"kind" = ANY(ARRAY[${Prisma.join(
          kinds.map((k) => Prisma.sql`${k}::"RuleItemKind"`)
        )}])`
      );
    }

    return this.prisma.$queryRaw<SimilarityHit[]>`
      SELECT "id", "embedding" <=> ${vectorLiteral}::vector AS distance
      FROM "rule_items"
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY distance ASC
      LIMIT ${limit}
    `;
  }
}
