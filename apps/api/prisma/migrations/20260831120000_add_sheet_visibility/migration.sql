-- Sheets are private until published; publishedAt is the feed's ordering key.
ALTER TABLE "character_sheets" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "character_sheets" ADD COLUMN "publishedAt" TIMESTAMP(3);

CREATE INDEX "character_sheets_isPublic_publishedAt_idx" ON "character_sheets"("isPublic", "publishedAt");
