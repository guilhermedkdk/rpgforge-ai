-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "rule_items" ADD COLUMN     "embedding" vector(1536);

-- CreateIndex
CREATE INDEX "rule_items_embedding_idx" ON "rule_items" USING hnsw ("embedding" vector_cosine_ops);
