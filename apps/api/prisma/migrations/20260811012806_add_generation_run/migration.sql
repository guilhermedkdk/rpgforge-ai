-- DropIndex
DROP INDEX "rule_items_embedding_idx";

-- CreateTable
CREATE TABLE "generation_runs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "characterSheetId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "meta" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "generation_runs_characterSheetId_key" ON "generation_runs"("characterSheetId");

-- CreateIndex
CREATE INDEX "generation_runs_userId_createdAt_idx" ON "generation_runs"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_packId_fkey" FOREIGN KEY ("packId") REFERENCES "packs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_characterSheetId_fkey" FOREIGN KEY ("characterSheetId") REFERENCES "character_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
