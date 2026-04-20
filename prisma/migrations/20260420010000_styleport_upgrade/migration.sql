DO $$ BEGIN
  CREATE TYPE "TranslationStatus" AS ENUM ('SUCCESS', 'FAILURE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AdPageType" AS ENUM ('ALL', 'HOMEPAGE', 'TRANSLATOR', 'CATEGORY');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AdDeviceType" AS ENUM ('ALL', 'DESKTOP', 'MOBILE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AdPlacementType" AS ENUM (
    'HOMEPAGE_TOP',
    'HOMEPAGE_BETWEEN_SECTIONS',
    'TRANSLATOR_ABOVE_TOOL',
    'TRANSLATOR_BELOW_TOOL',
    'SIDEBAR_SLOT',
    'FOOTER_SLOT',
    'MOBILE_STICKY_SLOT',
    'CUSTOM'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AdProviderType" AS ENUM ('ADSENSE', 'CUSTOM_HTML');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Translator"
  ADD COLUMN IF NOT EXISTS "modelOverride" TEXT,
  ADD COLUMN IF NOT EXISTS "showModeSelector" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "showSwap" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "showExamples" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "primaryCategoryId" TEXT;

CREATE TABLE IF NOT EXISTS "Category" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "iconKey" TEXT,
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Category_slug_key" ON "Category"("slug");
CREATE INDEX IF NOT EXISTS "Category_isActive_sortOrder_idx" ON "Category"("isActive", "sortOrder");

CREATE TABLE IF NOT EXISTS "TranslatorCategory" (
  "id" TEXT NOT NULL,
  "translatorId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TranslatorCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TranslatorCategory_translatorId_categoryId_key"
  ON "TranslatorCategory"("translatorId", "categoryId");
CREATE INDEX IF NOT EXISTS "TranslatorCategory_translatorId_sortOrder_idx"
  ON "TranslatorCategory"("translatorId", "sortOrder");
CREATE INDEX IF NOT EXISTS "TranslatorCategory_categoryId_sortOrder_idx"
  ON "TranslatorCategory"("categoryId", "sortOrder");

CREATE TABLE IF NOT EXISTS "AdPlacement" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "description" TEXT,
  "pageType" "AdPageType" NOT NULL DEFAULT 'ALL',
  "deviceType" "AdDeviceType" NOT NULL DEFAULT 'ALL',
  "placementType" "AdPlacementType" NOT NULL DEFAULT 'CUSTOM',
  "providerType" "AdProviderType" NOT NULL DEFAULT 'ADSENSE',
  "adSenseSlot" TEXT,
  "codeSnippet" TEXT,
  "categoryId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AdPlacement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdPlacement_key_key" ON "AdPlacement"("key");
CREATE INDEX IF NOT EXISTS "AdPlacement_pageType_deviceType_isActive_sortOrder_idx"
  ON "AdPlacement"("pageType", "deviceType", "isActive", "sortOrder");
CREATE INDEX IF NOT EXISTS "AdPlacement_categoryId_isActive_idx"
  ON "AdPlacement"("categoryId", "isActive");

ALTER TABLE "TranslationLog"
  ALTER COLUMN "outputText" DROP NOT NULL;

ALTER TABLE "TranslationLog"
  ADD COLUMN IF NOT EXISTS "status" "TranslationStatus" NOT NULL DEFAULT 'SUCCESS',
  ADD COLUMN IF NOT EXISTS "inputLength" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "outputLength" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "model" TEXT,
  ADD COLUMN IF NOT EXISTS "promptTokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "completionTokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "totalTokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "estimatedCost" DECIMAL(12,6),
  ADD COLUMN IF NOT EXISTS "errorCode" TEXT,
  ADD COLUMN IF NOT EXISTS "latencyMs" INTEGER;

CREATE INDEX IF NOT EXISTS "TranslationLog_status_createdAt_idx"
  ON "TranslationLog"("status", "createdAt");

ALTER TABLE "Translator"
  ADD CONSTRAINT "Translator_primaryCategoryId_fkey"
  FOREIGN KEY ("primaryCategoryId") REFERENCES "Category"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TranslatorCategory"
  ADD CONSTRAINT "TranslatorCategory_translatorId_fkey"
  FOREIGN KEY ("translatorId") REFERENCES "Translator"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TranslatorCategory"
  ADD CONSTRAINT "TranslatorCategory_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdPlacement"
  ADD CONSTRAINT "AdPlacement_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Translator_primaryCategoryId_idx" ON "Translator"("primaryCategoryId");
