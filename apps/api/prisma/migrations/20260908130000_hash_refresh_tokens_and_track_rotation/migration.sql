-- Store only the SHA-256 of each refresh token, and remember when rotation replaced it.
--
-- Existing rows are migrated in place rather than dropped: hashing the token we already hold keeps
-- every open session working, since the cookie the browser holds still hashes to the same value.
-- `sha256` is built in from PostgreSQL 11 and must match Node's
-- `createHash('sha256').update(token).digest('hex')`, which hashes the UTF-8 bytes to lowercase hex.

ALTER TABLE "refresh_tokens" ADD COLUMN "tokenHash" TEXT;

UPDATE "refresh_tokens"
SET "tokenHash" = encode(sha256(convert_to("token", 'UTF8')), 'hex');

ALTER TABLE "refresh_tokens" ALTER COLUMN "tokenHash" SET NOT NULL;

ALTER TABLE "refresh_tokens" ADD COLUMN "usedAt" TIMESTAMP(3);

-- The plaintext column and its index go together: a lookup index over a secret is the dump risk
-- this migration exists to remove.
DROP INDEX "refresh_tokens_token_idx";
DROP INDEX "refresh_tokens_token_key";
ALTER TABLE "refresh_tokens" DROP COLUMN "token";

CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");
