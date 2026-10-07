ALTER TYPE "GrowthJobType" ADD VALUE 'IDEA_AUTOPILOT_DECIDE';
ALTER TYPE "GrowthJobType" ADD VALUE 'IDEA_AUTOPILOT_EXECUTE';

ALTER TYPE "GrowthDecisionType" ADD VALUE 'CREATE_IDEA';
ALTER TYPE "GrowthDecisionType" ADD VALUE 'IMPROVE_IDEA';

CREATE TYPE "GrowthIdeaStatus" AS ENUM (
  'DRAFT',
  'VALIDATING',
  'NEEDS_REVISION',
  'PUBLISHED',
  'REVISING',
  'ARCHIVED',
  'CANCELLED'
);

CREATE TYPE "GrowthIdeaVersionAction" AS ENUM ('CREATE', 'IMPROVE', 'ROLLBACK');
CREATE TYPE "GrowthIdeaTranslatorReferenceKind" AS ENUM ('CTA', 'EMBEDDED');

CREATE TABLE "GrowthIdeaCategory" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrowthIdeaCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrowthIdea" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "status" "GrowthIdeaStatus" NOT NULL DEFAULT 'DRAFT',
  "currentVersionId" TEXT,
  "clusterId" TEXT,
  "seoTitle" TEXT NOT NULL,
  "seoDescription" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrowthIdea_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrowthIdeaVersion" (
  "id" TEXT NOT NULL,
  "ideaId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "decisionId" TEXT,
  "jobId" TEXT,
  "sourceVersionId" TEXT,
  "authorUserId" TEXT,
  "version" INTEGER NOT NULL,
  "action" "GrowthIdeaVersionAction" NOT NULL,
  "title" TEXT NOT NULL,
  "excerpt" TEXT NOT NULL,
  "seoTitle" TEXT NOT NULL,
  "seoDescription" TEXT NOT NULL,
  "blocks" JSONB NOT NULL,
  "checksum" TEXT NOT NULL,
  "qualityResult" JSONB NOT NULL,
  "decisionModelVersion" TEXT NOT NULL,
  "generationModelVersion" TEXT NOT NULL,
  "qualityModelVersion" TEXT NOT NULL,
  "dedupeModelVersion" TEXT NOT NULL,
  "snapshotModelVersion" TEXT NOT NULL,
  "aiProvider" TEXT,
  "aiModel" TEXT,
  "aiResponseId" TEXT,
  "aiPromptTokens" INTEGER,
  "aiCompletionTokens" INTEGER,
  "aiTotalTokens" INTEGER,
  "generationAttemptCount" INTEGER NOT NULL DEFAULT 0,
  "authorKind" "GrowthActivityActorKind" NOT NULL,
  "mutationKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3),
  CONSTRAINT "GrowthIdeaVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrowthIdeaTranslatorReference" (
  "id" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "translatorId" TEXT NOT NULL,
  "kind" "GrowthIdeaTranslatorReferenceKind" NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrowthIdeaTranslatorReference_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "GrowthDecision" ADD COLUMN "ideaId" TEXT;

CREATE UNIQUE INDEX "GrowthIdeaCategory_slug_key" ON "GrowthIdeaCategory"("slug");
CREATE INDEX "GrowthIdeaCategory_isActive_sortOrder_idx" ON "GrowthIdeaCategory"("isActive", "sortOrder");
CREATE UNIQUE INDEX "GrowthIdea_slug_key" ON "GrowthIdea"("slug");
CREATE UNIQUE INDEX "GrowthIdea_currentVersionId_key" ON "GrowthIdea"("currentVersionId");
CREATE INDEX "GrowthIdea_status_publishedAt_idx" ON "GrowthIdea"("status", "publishedAt");
CREATE INDEX "GrowthIdea_categoryId_status_publishedAt_idx" ON "GrowthIdea"("categoryId", "status", "publishedAt");
CREATE INDEX "GrowthIdea_clusterId_status_idx" ON "GrowthIdea"("clusterId", "status");
CREATE UNIQUE INDEX "GrowthIdeaVersion_mutationKey_key" ON "GrowthIdeaVersion"("mutationKey");
CREATE UNIQUE INDEX "GrowthIdeaVersion_ideaId_version_key" ON "GrowthIdeaVersion"("ideaId", "version");
CREATE INDEX "GrowthIdeaVersion_ideaId_createdAt_idx" ON "GrowthIdeaVersion"("ideaId", "createdAt");
CREATE INDEX "GrowthIdeaVersion_decisionId_createdAt_idx" ON "GrowthIdeaVersion"("decisionId", "createdAt");
CREATE INDEX "GrowthIdeaVersion_checksum_idx" ON "GrowthIdeaVersion"("checksum");
CREATE UNIQUE INDEX "GrowthIdeaTranslatorReference_versionId_translatorId_kind_key" ON "GrowthIdeaTranslatorReference"("versionId", "translatorId", "kind");
CREATE INDEX "GrowthIdeaTranslatorReference_translatorId_createdAt_idx" ON "GrowthIdeaTranslatorReference"("translatorId", "createdAt");
CREATE INDEX "GrowthDecision_ideaId_createdAt_idx" ON "GrowthDecision"("ideaId", "createdAt");

ALTER TABLE "GrowthIdea" ADD CONSTRAINT "GrowthIdea_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GrowthIdeaCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthIdea" ADD CONSTRAINT "GrowthIdea_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "GrowthContentCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthIdea" ADD CONSTRAINT "GrowthIdea_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "GrowthIdeaVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthIdeaVersion" ADD CONSTRAINT "GrowthIdeaVersion_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "GrowthIdea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthIdeaVersion" ADD CONSTRAINT "GrowthIdeaVersion_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "GrowthDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthIdeaVersion" ADD CONSTRAINT "GrowthIdeaVersion_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "GrowthJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthIdeaVersion" ADD CONSTRAINT "GrowthIdeaVersion_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthIdeaVersion" ADD CONSTRAINT "GrowthIdeaVersion_sourceVersionId_fkey" FOREIGN KEY ("sourceVersionId") REFERENCES "GrowthIdeaVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrowthIdeaTranslatorReference" ADD CONSTRAINT "GrowthIdeaTranslatorReference_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "GrowthIdeaVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrowthIdeaTranslatorReference" ADD CONSTRAINT "GrowthIdeaTranslatorReference_translatorId_fkey" FOREIGN KEY ("translatorId") REFERENCES "Translator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthDecision" ADD CONSTRAINT "GrowthDecision_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "GrowthIdea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GrowthIdeaCategory" ADD CONSTRAINT "GrowthIdeaCategory_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "GrowthIdea" ADD CONSTRAINT "GrowthIdea_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "GrowthIdea" ADD CONSTRAINT "GrowthIdea_publication_state_check" CHECK (
  ("status" <> 'PUBLISHED' OR ("currentVersionId" IS NOT NULL AND "publishedAt" IS NOT NULL AND "archivedAt" IS NULL))
  AND ("status" <> 'ARCHIVED' OR "archivedAt" IS NOT NULL)
);
ALTER TABLE "GrowthIdeaVersion" ADD CONSTRAINT "GrowthIdeaVersion_version_check" CHECK ("version" > 0);
ALTER TABLE "GrowthIdeaVersion" ADD CONSTRAINT "GrowthIdeaVersion_checksum_check" CHECK ("checksum" ~ '^[a-f0-9]{64}$');
ALTER TABLE "GrowthIdeaVersion" ADD CONSTRAINT "GrowthIdeaVersion_blocks_size_check" CHECK (octet_length("blocks"::text) <= 98304);

INSERT INTO "GrowthIdeaCategory" ("id", "slug", "name", "description", "sortOrder") VALUES
  ('idea-category-texting-dms', 'texting-dms', 'Texting & DMs', 'Useful wording for texts, direct messages, and everyday digital conversations.', 10),
  ('idea-category-dating-relationships', 'dating-relationships', 'Dating & Relationships', 'Thoughtful language for dating, relationships, and romantic communication.', 20),
  ('idea-category-funny-things-to-say', 'funny-things-to-say', 'Funny Things to Say', 'Playful lines, jokes, and lighthearted ways to express an idea.', 30),
  ('idea-category-captions', 'captions', 'Captions', 'Caption ideas for social posts, photos, and memorable moments.', 40),
  ('idea-category-friends', 'friends', 'Friends', 'Messages and conversation ideas for friendships.', 50),
  ('idea-category-birthdays', 'birthdays', 'Birthdays', 'Original birthday messages, wishes, and celebration ideas.', 60),
  ('idea-category-work-school', 'work-school', 'Work & School', 'Clear and appropriate wording for professional and academic situations.', 70),
  ('idea-category-slang-generations', 'slang-generations', 'Slang & Generations', 'Plain explanations and examples of generational language and slang.', 80),
  ('idea-category-comebacks', 'comebacks', 'Comebacks', 'Clever responses for awkward, playful, or difficult moments.', 90),
  ('idea-category-conversation-starters', 'conversation-starters', 'Conversation Starters', 'Prompts and opening lines that make conversations easier to begin.', 100)
ON CONFLICT ("slug") DO NOTHING;
