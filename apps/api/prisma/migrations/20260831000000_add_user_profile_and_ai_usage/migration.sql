-- Public profile fields. `username` is required, so existing rows get one derived from their email.
ALTER TABLE "users" ADD COLUMN "displayName" TEXT;
ALTER TABLE "users" ADD COLUMN "username" TEXT;
ALTER TABLE "users" ADD COLUMN "avatarId" TEXT;

UPDATE "users"
SET "username" = lower(regexp_replace(split_part("email", '@', 1), '[^a-zA-Z0-9]+', '-', 'g'));

-- Two accounts can share an email local part, and the handle has to stay unique.
UPDATE "users" u
SET "username" = u."username" || '-' || substr(replace(u."id", '-', ''), 1, 4)
WHERE EXISTS (
  SELECT 1 FROM "users" other
  WHERE other."username" = u."username" AND other."id" <> u."id"
);

ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- Every paid AI call, saved draft or not: an abandoned wizard costs the same money.
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "operation" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    -- Part of promptTokens served from the provider's prompt cache, billed at ~90% off.
    "cachedPromptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "costMicroUsd" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_usage_userId_createdAt_idx" ON "ai_usage"("userId", "createdAt");
CREATE INDEX "ai_usage_createdAt_idx" ON "ai_usage"("createdAt");

-- Deleting an account keeps its spend in the ledger, without pointing at a row that is gone.
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
