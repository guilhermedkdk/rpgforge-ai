-- CreateEnum
CREATE TYPE "RuleItemKind" AS ENUM ('CLASS', 'SUBCLASS', 'CLASS_FEATURE', 'SPELL', 'FEAT', 'BACKGROUND', 'RACE', 'ABILITY', 'RULESET', 'RULE', 'ITEM', 'OTHER');

-- CreateEnum
CREATE TYPE "RuleRelationType" AS ENUM ('SUBCLASS_OF', 'CLASS_HAS_FEATURE', 'SUBCLASS_HAS_FEATURE', 'SPELL_AVAILABLE_TO_CLASS', 'RULESET_HAS_RULE');

-- AlterTable
ALTER TABLE "packs" ADD COLUMN     "apiVersionHint" TEXT,
ADD COLUMN     "externalKey" TEXT,
ADD COLUMN     "isEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "permalink" TEXT,
ADD COLUMN     "publisherName" TEXT;

-- CreateTable
CREATE TABLE "rule_items" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "kind" "RuleItemKind" NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'open5e',
    "sourceKey" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceVersion" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "contentMd" TEXT,
    "raw" JSONB NOT NULL,
    "normalized" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rule_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_item_relations" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "type" "RuleRelationType" NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rule_item_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_item_tags" (
    "ruleItemId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "rule_item_tags_pkey" PRIMARY KEY ("ruleItemId","tagId")
);

-- CreateTable
CREATE TABLE "character_sheets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rule_items_packId_kind_idx" ON "rule_items"("packId", "kind");

-- CreateIndex
CREATE INDEX "rule_items_name_idx" ON "rule_items"("name");

-- CreateIndex
CREATE UNIQUE INDEX "rule_items_packId_kind_sourceKey_key" ON "rule_items"("packId", "kind", "sourceKey");

-- CreateIndex
CREATE INDEX "rule_item_relations_fromId_type_idx" ON "rule_item_relations"("fromId", "type");

-- CreateIndex
CREATE INDEX "rule_item_relations_toId_type_idx" ON "rule_item_relations"("toId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "rule_item_relations_fromId_toId_type_key" ON "rule_item_relations"("fromId", "toId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "tags_key_key" ON "tags"("key");

-- CreateIndex
CREATE INDEX "rule_item_tags_tagId_idx" ON "rule_item_tags"("tagId");

-- CreateIndex
CREATE INDEX "packs_systemName_idx" ON "packs"("systemName");

-- CreateIndex
CREATE INDEX "character_sheets_userId_idx" ON "character_sheets"("userId");

-- CreateIndex
CREATE INDEX "character_sheets_userId_updatedAt_idx" ON "character_sheets"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "rule_items" ADD CONSTRAINT "rule_items_packId_fkey" FOREIGN KEY ("packId") REFERENCES "packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_item_relations" ADD CONSTRAINT "rule_item_relations_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "rule_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_item_relations" ADD CONSTRAINT "rule_item_relations_toId_fkey" FOREIGN KEY ("toId") REFERENCES "rule_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_item_tags" ADD CONSTRAINT "rule_item_tags_ruleItemId_fkey" FOREIGN KEY ("ruleItemId") REFERENCES "rule_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_item_tags" ADD CONSTRAINT "rule_item_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_sheets" ADD CONSTRAINT "character_sheets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_sheets" ADD CONSTRAINT "character_sheets_packId_fkey" FOREIGN KEY ("packId") REFERENCES "packs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
