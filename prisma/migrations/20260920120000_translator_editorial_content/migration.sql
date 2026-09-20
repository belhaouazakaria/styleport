-- Additive editorial content layer. Existing translator content remains untouched.
CREATE TYPE "EditorialListKind" AS ENUM ('BEST_USE', 'HOW_TO_USE', 'TIP');

CREATE TABLE "TranslatorEditorialContent" (
    "id" TEXT NOT NULL,
    "translatorId" TEXT NOT NULL,
    "about" TEXT,
    "whatItDoes" TEXT,
    "differenceDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TranslatorEditorialContent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TranslatorEditorialList" (
    "id" TEXT NOT NULL,
    "translatorId" TEXT NOT NULL,
    "kind" "EditorialListKind" NOT NULL,
    "content" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TranslatorEditorialList_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TranslatorEditorialExample" (
    "id" TEXT NOT NULL,
    "translatorId" TEXT NOT NULL,
    "contextTitle" TEXT,
    "originalText" TEXT NOT NULL,
    "transformedText" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TranslatorEditorialExample_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TranslatorEditorialFaq" (
    "id" TEXT NOT NULL,
    "translatorId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TranslatorEditorialFaq_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TranslatorEditorialContent_translatorId_key" ON "TranslatorEditorialContent"("translatorId");
CREATE INDEX "TranslatorEditorialList_translatorId_kind_sortOrder_idx" ON "TranslatorEditorialList"("translatorId", "kind", "sortOrder");
CREATE INDEX "TranslatorEditorialExample_translatorId_sortOrder_idx" ON "TranslatorEditorialExample"("translatorId", "sortOrder");
CREATE INDEX "TranslatorEditorialFaq_translatorId_sortOrder_idx" ON "TranslatorEditorialFaq"("translatorId", "sortOrder");

ALTER TABLE "TranslatorEditorialContent" ADD CONSTRAINT "TranslatorEditorialContent_translatorId_fkey" FOREIGN KEY ("translatorId") REFERENCES "Translator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TranslatorEditorialList" ADD CONSTRAINT "TranslatorEditorialList_translatorId_fkey" FOREIGN KEY ("translatorId") REFERENCES "Translator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TranslatorEditorialExample" ADD CONSTRAINT "TranslatorEditorialExample_translatorId_fkey" FOREIGN KEY ("translatorId") REFERENCES "Translator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TranslatorEditorialFaq" ADD CONSTRAINT "TranslatorEditorialFaq_translatorId_fkey" FOREIGN KEY ("translatorId") REFERENCES "Translator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
