CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE', 'DISCORD');

-- Null password: an account that only ever signed in through a provider has none.
ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;

CREATE TABLE "oauth_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "OAuthProvider" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "email" TEXT,
    -- Each provider keeps its own picture, so unlinking one cannot leave another showing a dead link.
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "oauth_accounts_userId_idx" ON "oauth_accounts"("userId");
CREATE UNIQUE INDEX "oauth_accounts_provider_providerAccountId_key" ON "oauth_accounts"("provider", "providerAccountId");
CREATE UNIQUE INDEX "oauth_accounts_userId_provider_key" ON "oauth_accounts"("userId", "provider");

ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
