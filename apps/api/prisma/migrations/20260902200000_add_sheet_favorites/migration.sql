-- Sheets bookmarked from the explore feed. Composite key: favouriting twice is a no-op.
CREATE TABLE "sheet_favorites" (
    "userId" TEXT NOT NULL,
    "characterSheetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sheet_favorites_pkey" PRIMARY KEY ("userId","characterSheetId")
);

CREATE INDEX "sheet_favorites_userId_createdAt_idx" ON "sheet_favorites"("userId", "createdAt");
CREATE INDEX "sheet_favorites_characterSheetId_idx" ON "sheet_favorites"("characterSheetId");

ALTER TABLE "sheet_favorites" ADD CONSTRAINT "sheet_favorites_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sheet_favorites" ADD CONSTRAINT "sheet_favorites_characterSheetId_fkey"
    FOREIGN KEY ("characterSheetId") REFERENCES "character_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
