# StylePort Incremental Upgrade - Full Modified/New Files

## Updated Project Tree
```text
.
.env
.env.example
.env.local
.gitignore
.prettierignore
.prettierrc.json
FULL_CODE_DUMP_STYLEPORT.md
FULL_CODE_DUMP_STYLEPORT_INCREMENTAL.md
README.md
auth.ts
eslint.config.mjs
middleware.ts
next-env.d.ts
next.config.ts
package-lock.json
package.json
postcss.config.mjs
tsconfig.json
vitest.config.ts
vitest.setup.ts
app/
  globals.css
  icon.svg
  layout.tsx
  (admin)/
    admin/
      layout.tsx
      page.tsx
      ads/
        page.tsx
        [id]/
          page.tsx
        new/
          page.tsx
      categories/
        page.tsx
        [id]/
          page.tsx
        new/
          page.tsx
      logs/
        page.tsx
      requests/
        page.tsx
        [id]/
          page.tsx
      settings/
        page.tsx
      translators/
        page.tsx
        [id]/
          page.tsx
        ai/
          new/
            page.tsx
        new/
          page.tsx
  (public)/
    page.tsx
    login/
      page.tsx
    translators/
      page.tsx
      [slug]/
        page.tsx
  api/
    admin/
      ads/
        route.ts
        [id]/
          route.ts
      analytics/
        route.ts
      categories/
        route.ts
        [id]/
          route.ts
      models/
        route.ts
      requests/
        route.ts
        [id]/
          route.ts
          create-translator/
            route.ts
          generate-draft/
            route.ts
      settings/
        route.ts
      translators/
        route.ts
        [id]/
          route.ts
          duplicate/
            route.ts
          toggle-active/
            route.ts
        ai-draft/
          route.ts
    auth/
      [...nextauth]/
        route.ts
    ocr/
      route.ts
    translate/
      route.ts
    translator-requests/
      route.ts
    translators/
      suggest/
        route.ts
components/
  admin/
    ad-form.tsx
    ad-table.tsx
    admin-shell.tsx
    admin-sidebar.tsx
    admin-topbar.tsx
    ai-translator-creator.tsx
    category-form.tsx
    category-table.tsx
    confirm-dialog.tsx
    kpi-card.tsx
    login-form.tsx
    logout-button.tsx
    request-detail.tsx
    request-table.tsx
    settings-form.tsx
    translator-form.tsx
    translator-table.tsx
  providers/
    toast-provider.tsx
  public/
    category-nav.tsx
    discovery-pagination.tsx
    discovery-search.tsx
    featured-translators.tsx
    request-translator-modal.tsx
    translator-directory.tsx
  sections/
    faq.tsx
    footer.tsx
    hero.tsx
    how-it-works.tsx
    navbar.tsx
  shared/
    ad-slot.tsx
  translator/
    mode-selector.tsx
    seed-buttons.tsx
    translator-card.tsx
    upload-image-button.tsx
  ui/
    button.tsx
    card.tsx
    select.tsx
    textarea.tsx
hooks/
  use-auto-resize.ts
  use-local-storage.ts
lib/
  api-response.ts
  auth.ts
  constants.ts
  model-catalog.ts
  ocr.ts
  openai.ts
  permissions.ts
  pricing.ts
  prisma.ts
  prompt-builder.ts
  prompts.ts
  rate-limit.ts
  settings.ts
  slug.ts
  slugify.ts
  translator-draft.ts
  turnstile.ts
  types.ts
  utils.ts
  validators.ts
  actions/
    auth-actions.ts
  data/
    ads.ts
    categories.ts
    requests.ts
    translators.ts
prisma/
  schema.prisma
  seed.ts
  migrations/
    migration_lock.toml
    20260419233000_init/
      migration.sql
    20260420010000_styleport_upgrade/
      migration.sql
    20260420193000_translator_requests/
      migration.sql
public/
  og-image.svg
tests/
  prompts.test.ts
  request-features.test.ts
  slug.test.ts
  translate-route.test.ts
  translator-card.test.tsx
  translator-directory.test.tsx
  validators.test.ts
types/
  next-auth.d.ts
```

## .env.example

```example
# PostgreSQL connection string
# Example: postgresql://postgres:postgres@localhost:5432/styleport
DATABASE_URL=

# Auth.js / NextAuth settings
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000

# OpenAI server settings
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini

# Public app branding
NEXT_PUBLIC_APP_NAME=StylePort

# Admin seed bootstrap
ADMIN_SEED_EMAIL=admin@example.com
ADMIN_SEED_PASSWORD=ChangeMe123!

# Cloudflare Turnstile (captcha)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
```

## .env

```env
DATABASE_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
NEXT_PUBLIC_APP_NAME=StylePort
ADMIN_SEED_EMAIL=admin@example.com
ADMIN_SEED_PASSWORD=ChangeMe123!
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
```

## .env.local

```text
DATABASE_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
NEXT_PUBLIC_APP_NAME=StylePort
ADMIN_SEED_EMAIL=admin@example.com
ADMIN_SEED_PASSWORD=ChangeMe123!
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
```

## README.md

```md
# StylePort Platform

StylePort is a production-ready multi-translator discovery platform.

It includes:
- Public translator catalog with category filters, search autosuggest, featured modules, and pagination
- Public “Request a translator” flow with anti-spam protection
- Dynamic translator pages driven by database configuration
- Secure admin dashboard for translators, categories, requests, settings, analytics, and monetization placements
- Auth.js credentials auth with admin route protection
- Prisma + PostgreSQL data layer
- Server-side OpenAI translation pipeline with usage/cost logging

## Core Features

### Public Experience
- `/` as primary discovery homepage
- Search + autosuggest (`name`, `slug`, `description`, `category`)
- Category chips and query-param filters (`q`, `category`, `page`)
- Featured translators section
- Paginated translator cards (mobile-first)
- Translator detail pages at `/translators/[slug]`
- Public request modal for submitting new translator ideas
- Server-side captcha verification and honeypot anti-spam checks
- Simplified translator UX:
  - two-panel layout
  - copy action in source panel
  - copy action in output panel
  - translate / regenerate / clear controls
  - optional swap and optional mode selector from translator config
  - keyboard shortcut (`Ctrl/Cmd + Enter`)

### Admin Experience
- `/login`, `/admin` with role-protected access
- `/admin/translators` CRUD + duplicate + archive/unarchive + hard delete
- `/admin/translators/ai/new` direct AI-assisted translator creation
- `/admin/categories` CRUD + archive/unarchive + hard delete
- `/admin/requests` review queue with filters, status updates, AI draft generation, and create-from-draft action
- `/admin/ads` CRUD + targeting and provider controls
- `/admin/settings` for branding, discovery, model defaults, monetization toggles
- `/admin/logs` and `/admin` overview analytics

### Analytics + Cost Tracking
Each translation log captures:
- translator, status, mode
- input/output lengths
- model used
- prompt/completion/total tokens when available
- estimated cost via centralized pricing config
- latency and timestamp

### Monetization Readiness
- Ad placement model + admin management
- Global ads on/off setting
- Placement targeting by page/device/category
- AdSense slot and custom snippet support
- Reusable ad slot renderer

## Stack
- Next.js 16 App Router + TypeScript
- Tailwind CSS v4
- Auth.js (`next-auth`) + Prisma Adapter
- Prisma ORM + PostgreSQL
- OpenAI Node SDK (server-side)
- Zod validation
- Vitest + Testing Library

## Environment Variables

Use `.env.example`:

```env
DATABASE_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
NEXT_PUBLIC_APP_NAME=StylePort
ADMIN_SEED_EMAIL=admin@example.com
ADMIN_SEED_PASSWORD=ChangeMe123!
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
```

Notes:
- Keep `OPENAI_API_KEY` server-side only.
- Set a strong `NEXTAUTH_SECRET`.
- Change seeded admin credentials after first login.
- For production request submissions, configure both Turnstile keys.

## Local Setup

1. Install:

```bash
npm install
```

2. Generate Prisma client:

```bash
npm run prisma:generate
```

3. Run migrations:

```bash
npm run prisma:migrate
```

4. Seed database:

```bash
npm run prisma:seed
```

5. Start dev server:

```bash
npm run dev
```

App: [http://localhost:3000](http://localhost:3000)

## Admin Bootstrap
- Email: `admin@example.com` (or `ADMIN_SEED_EMAIL`)
- Password: `ChangeMe123!` (or `ADMIN_SEED_PASSWORD`)
- Login URL: `/login`

## Prisma Models
- `User`, `Account`, `Session`, `VerificationToken`
- `Translator`, `TranslationMode`, `TranslatorExample`
- `Category`, `TranslatorCategory`
- `TranslationLog`
- `TranslatorRequest`
- `AdPlacement`
- `AppSetting`

## API Contracts

### `POST /api/translate`

Request:

```json
{
  "text": "Rewrite this sentence",
  "translatorSlug": "regal-rewrite",
  "modeKey": "classic"
}
```

### `POST /api/translator-requests`

Request:

```json
{
  "requestedName": "Startup Pitch Polisher",
  "description": "Rewrite rough startup pitches into concise investor-ready language.",
  "exampleInput": "we build ai for stores",
  "desiredStyle": "confident and clear",
  "suggestedCategory": "Professional",
  "audience": "Founders",
  "requesterEmail": "founder@example.com",
  "notes": "Prefer short outputs",
  "honeypot": "",
  "turnstileToken": "token"
}
```

Success:

```json
{
  "ok": true,
  "requestId": "..."
}
```

Success:

```json
{
  "ok": true,
  "result": "..."
}
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR|TOO_LONG|RATE_LIMITED|NOT_FOUND|INACTIVE_TRANSLATOR|UPSTREAM_ERROR|BAD_REQUEST|MODEL_UNAVAILABLE",
    "message": "..."
  }
}
```

### Admin APIs
- `GET/POST /api/admin/translators`
- `GET/PATCH/DELETE /api/admin/translators/[id]`
- `POST /api/admin/translators/[id]/duplicate`
- `POST /api/admin/translators/[id]/toggle-active`
- `POST /api/admin/translators/ai-draft`
- `GET/POST /api/admin/categories`
- `GET/PATCH/DELETE /api/admin/categories/[id]`
- `GET /api/admin/requests`
- `GET/PATCH /api/admin/requests/[id]`
- `POST /api/admin/requests/[id]/generate-draft`
- `POST /api/admin/requests/[id]/create-translator`
- `GET/POST /api/admin/ads`
- `GET/PATCH/DELETE /api/admin/ads/[id]`
- `GET /api/admin/models`
- `GET /api/admin/analytics`
- `GET/PUT /api/admin/settings`

All admin endpoints require authenticated `ADMIN` role.

## Scripts
- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run test`
- `npm run prisma:generate`
- `npm run prisma:migrate`
- `npm run prisma:deploy`
- `npm run prisma:seed`
- `npm run prisma:studio`

## Deployment

### Vercel + Postgres (Neon/Supabase/Vercel Postgres)
1. Provision PostgreSQL and set `DATABASE_URL`.
2. Set all environment variables.
3. Run deploy migrations:

```bash
npm run prisma:deploy
```

4. Seed once:

```bash
npm run prisma:seed
```

5. Deploy app.

## Security Notes
- Server-side OpenAI calls only
- Auth.js middleware + server permission checks
- Password hashing with bcrypt
- Zod validation on all mutation endpoints
- Archive-first deletion flow + explicit hard delete
```

## prisma/schema.prisma

```text
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  ADMIN
  EDITOR
  USER
}

enum TranslationStatus {
  SUCCESS
  FAILURE
}

enum AdPageType {
  ALL
  HOMEPAGE
  TRANSLATOR
  CATEGORY
}

enum AdDeviceType {
  ALL
  DESKTOP
  MOBILE
}

enum AdPlacementType {
  HOMEPAGE_TOP
  HOMEPAGE_BETWEEN_SECTIONS
  TRANSLATOR_ABOVE_TOOL
  TRANSLATOR_BELOW_TOOL
  SIDEBAR_SLOT
  FOOTER_SLOT
  MOBILE_STICKY_SLOT
  CUSTOM
}

enum AdProviderType {
  ADSENSE
  CUSTOM_HTML
}

enum TranslatorRequestStatus {
  NEW
  REVIEWING
  DRAFT_GENERATED
  APPROVED
  REJECTED
  COMPLETED
}

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  passwordHash  String
  role          Role      @default(USER)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  accounts      Account[]
  sessions      Session[]
}

model Account {
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([provider, providerAccountId])
}

model Session {
  sessionToken String   @unique
  userId       String
  expires      DateTime
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([sessionToken])
}

model VerificationToken {
  identifier String
  token      String
  expires    DateTime

  @@id([identifier, token])
}

model Translator {
  id                 String               @id @default(cuid())
  name               String
  slug               String               @unique
  title              String
  subtitle           String
  shortDescription   String
  sourceLabel        String
  targetLabel        String
  category           String?
  iconName           String?
  promptSystem       String
  promptInstructions String
  modelOverride      String?
  seoTitle           String?
  seoDescription     String?
  showModeSelector   Boolean              @default(false)
  showSwap           Boolean              @default(false)
  showExamples       Boolean              @default(false)
  isActive           Boolean              @default(true)
  isFeatured         Boolean              @default(false)
  sortOrder          Int                  @default(0)
  archivedAt         DateTime?
  primaryCategoryId  String?
  createdAt          DateTime             @default(now())
  updatedAt          DateTime             @updatedAt
  modes              TranslationMode[]
  examples           TranslatorExample[]
  logs               TranslationLog[]
  categories         TranslatorCategory[]
  primaryCategory    Category?            @relation("PrimaryTranslatorCategory", fields: [primaryCategoryId], references: [id], onDelete: SetNull)
  fulfilledRequests  TranslatorRequest[]  @relation("RequestCreatedTranslator")

  @@index([isActive, isFeatured, sortOrder])
  @@index([updatedAt])
  @@index([primaryCategoryId])
}

model Category {
  id             String               @id @default(cuid())
  name           String
  slug           String               @unique
  description    String?
  sortOrder      Int                  @default(0)
  isActive       Boolean              @default(true)
  iconKey        String?
  seoTitle       String?
  seoDescription String?
  archivedAt     DateTime?
  createdAt      DateTime             @default(now())
  updatedAt      DateTime             @updatedAt
  translators    TranslatorCategory[]
  primaryFor     Translator[]         @relation("PrimaryTranslatorCategory")
  adPlacements   AdPlacement[]

  @@index([isActive, sortOrder])
}

model TranslatorCategory {
  id           String     @id @default(cuid())
  translatorId String
  categoryId   String
  sortOrder    Int        @default(0)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  translator   Translator @relation(fields: [translatorId], references: [id], onDelete: Cascade)
  category     Category   @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@unique([translatorId, categoryId])
  @@index([translatorId, sortOrder])
  @@index([categoryId, sortOrder])
}

model TranslationMode {
  id           String     @id @default(cuid())
  translatorId String
  key          String
  label        String
  description  String?
  instruction  String
  sortOrder    Int        @default(0)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  translator   Translator @relation(fields: [translatorId], references: [id], onDelete: Cascade)

  @@unique([translatorId, key])
  @@index([translatorId, sortOrder])
}

model TranslatorExample {
  id           String     @id @default(cuid())
  translatorId String
  label        String
  value        String
  sortOrder    Int        @default(0)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  translator   Translator @relation(fields: [translatorId], references: [id], onDelete: Cascade)

  @@index([translatorId, sortOrder])
}

model TranslationLog {
  id               String            @id @default(cuid())
  translatorId     String
  inputText        String
  outputText       String?
  modeUsed         String?
  status           TranslationStatus @default(SUCCESS)
  inputLength      Int               @default(0)
  outputLength     Int               @default(0)
  model            String?
  promptTokens     Int?
  completionTokens Int?
  totalTokens      Int?
  estimatedCost    Decimal?          @db.Decimal(12, 6)
  errorCode        String?
  latencyMs        Int?
  ipHash           String?
  userAgent        String?
  createdAt        DateTime          @default(now())
  translator       Translator        @relation(fields: [translatorId], references: [id], onDelete: Cascade)

  @@index([translatorId, createdAt])
  @@index([createdAt])
  @@index([status, createdAt])
}

model TranslatorRequest {
  id                 String                  @id @default(cuid())
  requesterEmail     String?
  requestedName      String
  description        String
  exampleInput       String?
  desiredStyle       String?
  suggestedCategory  String?
  audience           String?
  notes              String?
  adminNotes         String?
  status             TranslatorRequestStatus @default(NEW)
  aiDraftJson        Json?
  aiDraftGeneratedAt DateTime?
  createdTranslatorId String?
  createdTranslator  Translator?             @relation("RequestCreatedTranslator", fields: [createdTranslatorId], references: [id], onDelete: SetNull)
  createdAt          DateTime                @default(now())
  updatedAt          DateTime                @updatedAt

  @@index([status, createdAt])
  @@index([createdAt])
  @@index([createdTranslatorId])
}

model AdPlacement {
  id            String          @id @default(cuid())
  name          String
  key           String          @unique
  description   String?
  pageType      AdPageType      @default(ALL)
  deviceType    AdDeviceType    @default(ALL)
  placementType AdPlacementType @default(CUSTOM)
  providerType  AdProviderType  @default(ADSENSE)
  adSenseSlot   String?
  codeSnippet   String?
  categoryId    String?
  isActive      Boolean         @default(false)
  sortOrder     Int             @default(0)
  archivedAt    DateTime?
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
  category      Category?       @relation(fields: [categoryId], references: [id], onDelete: SetNull)

  @@index([pageType, deviceType, isActive, sortOrder])
  @@index([categoryId, isActive])
}

model AppSetting {
  id        String   @id @default(cuid())
  key       String   @unique
  value     Json
  updatedAt DateTime @updatedAt
}
```

## prisma/migrations/20260420193000_translator_requests/migration.sql

```sql
-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TranslatorRequestStatus') THEN
    CREATE TYPE "TranslatorRequestStatus" AS ENUM (
      'NEW',
      'REVIEWING',
      'DRAFT_GENERATED',
      'APPROVED',
      'REJECTED',
      'COMPLETED'
    );
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "TranslatorRequest" (
  "id" TEXT NOT NULL,
  "requesterEmail" TEXT,
  "requestedName" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "exampleInput" TEXT,
  "desiredStyle" TEXT,
  "suggestedCategory" TEXT,
  "audience" TEXT,
  "notes" TEXT,
  "adminNotes" TEXT,
  "status" "TranslatorRequestStatus" NOT NULL DEFAULT 'NEW',
  "aiDraftJson" JSONB,
  "aiDraftGeneratedAt" TIMESTAMP(3),
  "createdTranslatorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TranslatorRequest_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "TranslatorRequest_status_createdAt_idx"
  ON "TranslatorRequest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "TranslatorRequest_createdAt_idx"
  ON "TranslatorRequest"("createdAt");
CREATE INDEX IF NOT EXISTS "TranslatorRequest_createdTranslatorId_idx"
  ON "TranslatorRequest"("createdTranslatorId");

-- FK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TranslatorRequest_createdTranslatorId_fkey'
  ) THEN
    ALTER TABLE "TranslatorRequest"
      ADD CONSTRAINT "TranslatorRequest_createdTranslatorId_fkey"
      FOREIGN KEY ("createdTranslatorId") REFERENCES "Translator"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
```

## lib/types.ts

```ts
import type { Role, TranslatorRequestStatus } from "@prisma/client";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "TOO_LONG"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "BAD_REQUEST"
  | "OCR_ERROR"
  | "UNSUPPORTED_FILE"
  | "NOT_FOUND"
  | "INACTIVE_TRANSLATOR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "MODEL_UNAVAILABLE";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
}

export interface ApiErrorResponse {
  ok: false;
  error: ApiError;
}

export interface TranslateSuccessResponse {
  ok: true;
  result: string;
}

export type TranslateResponse = TranslateSuccessResponse | ApiErrorResponse;

export interface OcrSuccessResponse {
  ok: true;
  text: string;
}

export type OcrResponse = OcrSuccessResponse | ApiErrorResponse;

export interface PublicMode {
  id: string;
  key: string;
  label: string;
  description: string | null;
  sortOrder: number;
}

export interface PublicExample {
  id: string;
  label: string;
  value: string;
  sortOrder: number;
}

export interface PublicCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  iconKey: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
}

export interface PublicTranslator {
  id: string;
  name: string;
  slug: string;
  title: string;
  subtitle: string;
  shortDescription: string;
  sourceLabel: string;
  targetLabel: string;
  seoTitle: string | null;
  seoDescription: string | null;
  isFeatured: boolean;
  iconName: string | null;
  showModeSelector: boolean;
  showSwap: boolean;
  showExamples: boolean;
  primaryCategory: Pick<PublicCategory, "id" | "name" | "slug"> | null;
  categories: Array<Pick<PublicCategory, "id" | "name" | "slug">>;
  modes: PublicMode[];
  examples: PublicExample[];
}

export interface RuntimeTranslator {
  id: string;
  slug: string;
  promptSystem: string;
  promptInstructions: string;
  modelOverride: string | null;
  showModeSelector: boolean;
  modes: Array<{
    key: string;
    label: string;
    instruction: string;
  }>;
}

export interface TranslatorModeInput {
  key: string;
  label: string;
  description?: string;
  instruction: string;
  sortOrder: number;
}

export interface TranslatorExampleInput {
  label: string;
  value: string;
  sortOrder: number;
}

export interface TranslatorUpsertInput {
  name: string;
  slug: string;
  title: string;
  subtitle: string;
  shortDescription: string;
  sourceLabel: string;
  targetLabel: string;
  iconName?: string;
  promptSystem: string;
  promptInstructions: string;
  seoTitle?: string;
  seoDescription?: string;
  modelOverride?: string;
  isActive: boolean;
  isFeatured: boolean;
  showModeSelector: boolean;
  showSwap: boolean;
  showExamples: boolean;
  sortOrder: number;
  primaryCategoryId?: string | null;
  categoryIds: string[];
  modes: TranslatorModeInput[];
  examples: TranslatorExampleInput[];
}

export interface TranslatorListItem {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  isFeatured: boolean;
  archivedAt: string | null;
  updatedAt: string;
  sortOrder: number;
  categories: Array<{ id: string; name: string; slug: string }>;
}

export interface CategoryUpsertInput {
  name: string;
  slug: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
  iconKey?: string;
  seoTitle?: string;
  seoDescription?: string;
}

export interface AdPlacementUpsertInput {
  name: string;
  key: string;
  description?: string;
  pageType: "ALL" | "HOMEPAGE" | "TRANSLATOR" | "CATEGORY";
  deviceType: "ALL" | "DESKTOP" | "MOBILE";
  placementType:
    | "HOMEPAGE_TOP"
    | "HOMEPAGE_BETWEEN_SECTIONS"
    | "TRANSLATOR_ABOVE_TOOL"
    | "TRANSLATOR_BELOW_TOOL"
    | "SIDEBAR_SLOT"
    | "FOOTER_SLOT"
    | "MOBILE_STICKY_SLOT"
    | "CUSTOM";
  providerType: "ADSENSE" | "CUSTOM_HTML";
  adSenseSlot?: string;
  codeSnippet?: string;
  categoryId?: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface AdminSession {
  user: {
    id: string;
    email?: string | null;
    name?: string | null;
    role: Role;
  };
}

export interface AppSettings {
  platformName: string;
  homepageTitle: string;
  homepageSubtitle: string;
  footerDisclaimer: string;
  catalogIntro: string;
  defaultTranslatorSlug: string;
  featuredTranslatorsEnabled: boolean;
  defaultModelOverride: string;
  discoveryPageSize: number;
  adsEnabled: boolean;
  adSenseClientId: string;
}

export interface DiscoveryQuery {
  q?: string;
  category?: string;
  page: number;
  pageSize: number;
}

export interface DiscoveryResult {
  translators: PublicTranslator[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  categories: PublicCategory[];
  q?: string;
  category?: string;
}

export interface UsageSeriesPoint {
  date: string;
  translations: number;
  totalTokens: number;
  estimatedCost: number;
}

export interface TranslatorRequestInput {
  requesterEmail?: string;
  requestedName: string;
  description: string;
  exampleInput?: string;
  desiredStyle?: string;
  suggestedCategory?: string;
  audience?: string;
  notes?: string;
  honeypot?: string;
  turnstileToken?: string;
}

export interface TranslatorDraftModeInput {
  key: string;
  label: string;
  description?: string;
  instruction: string;
  sortOrder: number;
}

export interface TranslatorDraftExampleInput {
  label: string;
  value: string;
  sortOrder: number;
}

export interface TranslatorDraft {
  name: string;
  slug: string;
  title: string;
  subtitle: string;
  shortDescription: string;
  sourceLabel: string;
  targetLabel: string;
  systemPrompt: string;
  promptInstructions: string;
  seoTitle?: string;
  seoDescription?: string;
  categorySuggestion?: string;
  modes: TranslatorDraftModeInput[];
  examples: TranslatorDraftExampleInput[];
}

export interface AdminTranslatorRequestListItem {
  id: string;
  requesterEmail: string | null;
  requestedName: string;
  suggestedCategory: string | null;
  status: TranslatorRequestStatus;
  createdAt: string;
}

export interface AdminTranslatorRequestDetail {
  id: string;
  requesterEmail: string | null;
  requestedName: string;
  description: string;
  exampleInput: string | null;
  desiredStyle: string | null;
  suggestedCategory: string | null;
  audience: string | null;
  notes: string | null;
  adminNotes: string | null;
  status: TranslatorRequestStatus;
  aiDraftJson: TranslatorDraft | null;
  aiDraftGeneratedAt: string | null;
  createdTranslatorId: string | null;
  createdTranslator: { id: string; name: string; slug: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface RequestFilters {
  q?: string;
  status?: "all" | TranslatorRequestStatus;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
}
```

## lib/validators.ts

```ts
import { z } from "zod";
import { TranslatorRequestStatus } from "@prisma/client";

import { MAX_INPUT_CHARS } from "@/lib/constants";
import type { ApiError } from "@/lib/types";
import { safeTrim } from "@/lib/utils";

export const modeKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/i, "Mode key must be alphanumeric or dash.");

export const translatorSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9-]+$/, "Slug must use lowercase letters, numbers, and dashes.");

export const translateRequestSchema = z.object({
  text: z.string(),
  translatorSlug: z.string().trim().optional(),
  modeKey: z.string().trim().optional(),
  mode: z.string().trim().optional(),
});

export type TranslateValidationResult =
  | {
      ok: true;
      data: { text: string; translatorSlug?: string; modeKey?: string };
    }
  | {
      ok: false;
      status: number;
      error: ApiError;
    };

export function validateTranslateInput(payload: unknown): TranslateValidationResult {
  const parsed = translateRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: {
        code: "VALIDATION_ERROR",
        message: "Please provide valid text and translator options.",
      },
    };
  }

  const text = safeTrim(parsed.data.text);

  if (!text) {
    return {
      ok: false,
      status: 400,
      error: {
        code: "VALIDATION_ERROR",
        message: "Please enter some text first.",
      },
    };
  }

  if (text.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      status: 413,
      error: {
        code: "TOO_LONG",
        message: "This passage is too long. Please shorten it.",
      },
    };
  }

  const modeKey = parsed.data.modeKey || parsed.data.mode;

  return {
    ok: true,
    data: {
      text,
      translatorSlug: parsed.data.translatorSlug || undefined,
      modeKey: modeKey || undefined,
    },
  };
}

export const categorySlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9-]+$/, "Slug must use lowercase letters, numbers, and dashes.");

const modeInputSchema = z.object({
  key: modeKeySchema,
  label: z.string().trim().min(2).max(120),
  description: z.string().trim().max(240).optional().or(z.literal("")),
  instruction: z.string().trim().min(8),
  sortOrder: z.number().int().min(0),
});

const exampleInputSchema = z.object({
  label: z.string().trim().min(2).max(120),
  value: z.string().trim().min(2).max(1200),
  sortOrder: z.number().int().min(0),
});

export const translatorUpsertSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: translatorSlugSchema,
  title: z.string().trim().min(2).max(140),
  subtitle: z.string().trim().min(2).max(260),
  shortDescription: z.string().trim().min(2).max(260),
  sourceLabel: z.string().trim().min(2).max(80),
  targetLabel: z.string().trim().min(2).max(80),
  iconName: z.string().trim().max(80).optional().or(z.literal("")),
  promptSystem: z.string().trim().min(10),
  promptInstructions: z.string().trim().min(10),
  seoTitle: z.string().trim().max(180).optional().or(z.literal("")),
  seoDescription: z.string().trim().max(320).optional().or(z.literal("")),
  modelOverride: z.string().trim().max(120).optional().or(z.literal("")),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
  showModeSelector: z.boolean(),
  showSwap: z.boolean(),
  showExamples: z.boolean(),
  sortOrder: z.number().int().min(0).max(9999),
  primaryCategoryId: z.string().trim().min(1).optional().nullable().or(z.literal("")),
  categoryIds: z.array(z.string().trim().min(1)).min(1).max(20),
  modes: z.array(modeInputSchema).max(12),
  examples: z.array(exampleInputSchema).max(20),
});

export const categoryUpsertSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: categorySlugSchema,
  description: z.string().trim().max(260).optional().or(z.literal("")),
  sortOrder: z.number().int().min(0).max(9999),
  isActive: z.boolean(),
  iconKey: z.string().trim().max(80).optional().or(z.literal("")),
  seoTitle: z.string().trim().max(180).optional().or(z.literal("")),
  seoDescription: z.string().trim().max(320).optional().or(z.literal("")),
});

export const adPlacementUpsertSchema = z.object({
  name: z.string().trim().min(2).max(120),
  key: z.string().trim().min(2).max(120).regex(/^[a-z0-9_-]+$/),
  description: z.string().trim().max(260).optional().or(z.literal("")),
  pageType: z.enum(["ALL", "HOMEPAGE", "TRANSLATOR", "CATEGORY"]),
  deviceType: z.enum(["ALL", "DESKTOP", "MOBILE"]),
  placementType: z.enum([
    "HOMEPAGE_TOP",
    "HOMEPAGE_BETWEEN_SECTIONS",
    "TRANSLATOR_ABOVE_TOOL",
    "TRANSLATOR_BELOW_TOOL",
    "SIDEBAR_SLOT",
    "FOOTER_SLOT",
    "MOBILE_STICKY_SLOT",
    "CUSTOM",
  ]),
  providerType: z.enum(["ADSENSE", "CUSTOM_HTML"]),
  adSenseSlot: z.string().trim().max(120).optional().or(z.literal("")),
  codeSnippet: z.string().trim().max(4000).optional().or(z.literal("")),
  categoryId: z.string().trim().min(1).optional().nullable().or(z.literal("")),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(9999),
});

export const adminTranslatorFilterSchema = z.object({
  q: z.string().optional(),
  status: z.enum(["all", "active", "inactive", "archived"]).optional(),
  featured: z.enum(["all", "featured", "non-featured"]).optional(),
  category: z.string().optional(),
});

export const discoveryQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(24).default(12),
});

export const settingsSchema = z.object({
  platformName: z.string().trim().min(2).max(120),
  homepageTitle: z.string().trim().min(2).max(180),
  homepageSubtitle: z.string().trim().min(2).max(320),
  catalogIntro: z.string().trim().min(2).max(320),
  footerDisclaimer: z.string().trim().min(2).max(420),
  defaultTranslatorSlug: translatorSlugSchema,
  featuredTranslatorsEnabled: z.boolean(),
  defaultModelOverride: z.string().trim().max(120).optional().or(z.literal("")),
  discoveryPageSize: z.number().int().min(1).max(24),
  adsEnabled: z.boolean(),
  adSenseClientId: z.string().trim().max(180).optional().or(z.literal("")),
});

export const translatorRequestSchema = z.object({
  requesterEmail: z
    .string()
    .trim()
    .email("Please enter a valid email.")
    .max(160)
    .optional()
    .or(z.literal("")),
  requestedName: z.string().trim().min(2).max(140),
  description: z.string().trim().min(10).max(1800),
  exampleInput: z.string().trim().max(1600).optional().or(z.literal("")),
  desiredStyle: z.string().trim().max(900).optional().or(z.literal("")),
  suggestedCategory: z.string().trim().max(120).optional().or(z.literal("")),
  audience: z.string().trim().max(240).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  honeypot: z.string().max(0).optional().or(z.literal("")),
  turnstileToken: z.string().trim().optional().or(z.literal("")),
});

export const adminRequestFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.nativeEnum(TranslatorRequestStatus).optional().or(z.literal("all")),
  category: z.string().trim().max(120).optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

export const requestStatusUpdateSchema = z.object({
  status: z.nativeEnum(TranslatorRequestStatus).optional(),
  adminNotes: z.string().trim().max(2400).optional().or(z.literal("")),
});

export const translatorDraftSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: translatorSlugSchema,
  title: z.string().trim().min(2).max(160),
  subtitle: z.string().trim().min(2).max(320),
  shortDescription: z.string().trim().min(2).max(260),
  sourceLabel: z.string().trim().min(2).max(80),
  targetLabel: z.string().trim().min(2).max(80),
  systemPrompt: z.string().trim().min(20).max(5000),
  promptInstructions: z.string().trim().min(20).max(5000),
  seoTitle: z.string().trim().max(180).optional().or(z.literal("")),
  seoDescription: z.string().trim().max(320).optional().or(z.literal("")),
  categorySuggestion: z.string().trim().max(120).optional().or(z.literal("")),
  modes: z
    .array(
      z.object({
        key: modeKeySchema,
        label: z.string().trim().min(2).max(120),
        description: z.string().trim().max(280).optional().or(z.literal("")),
        instruction: z.string().trim().min(8).max(1200),
        sortOrder: z.number().int().min(1).max(100),
      }),
    )
    .min(1)
    .max(8),
  examples: z
    .array(
      z.object({
        label: z.string().trim().min(2).max(120),
        value: z.string().trim().min(2).max(1200),
        sortOrder: z.number().int().min(1).max(100),
      }),
    )
    .max(12),
});

export const aiDraftInputSchema = z.object({
  idea: z.string().trim().min(2).max(200),
  description: z.string().trim().min(10).max(1600),
  category: z.string().trim().max(120).optional().or(z.literal("")),
  styleDirection: z.string().trim().max(1200).optional().or(z.literal("")),
  exampleInput: z.string().trim().max(1200).optional().or(z.literal("")),
  desiredOutput: z.string().trim().max(1200).optional().or(z.literal("")),
  audience: z.string().trim().max(240).optional().or(z.literal("")),
  seoDirection: z.string().trim().max(600).optional().or(z.literal("")),
});
```

## lib/data/requests.ts

```ts
import { Prisma, TranslatorRequestStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type {
  AdminTranslatorRequestDetail,
  AdminTranslatorRequestListItem,
  RequestFilters,
  TranslatorDraft,
  TranslatorRequestInput,
} from "@/lib/types";
import { translatorDraftSchema } from "@/lib/validators";

function normalizeOptional(value?: string | null) {
  return value?.trim() || null;
}

function mapDraft(value: Prisma.JsonValue | null): TranslatorDraft | null {
  if (!value) {
    return null;
  }

  const parsed = translatorDraftSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function createPublicTranslatorRequest(input: TranslatorRequestInput) {
  return prisma.translatorRequest.create({
    data: {
      requesterEmail: normalizeOptional(input.requesterEmail),
      requestedName: input.requestedName.trim(),
      description: input.description.trim(),
      exampleInput: normalizeOptional(input.exampleInput),
      desiredStyle: normalizeOptional(input.desiredStyle),
      suggestedCategory: normalizeOptional(input.suggestedCategory),
      audience: normalizeOptional(input.audience),
      notes: normalizeOptional(input.notes),
      status: TranslatorRequestStatus.NEW,
    },
    select: {
      id: true,
    },
  });
}

export async function listAdminTranslatorRequests(
  filters: RequestFilters,
): Promise<AdminTranslatorRequestListItem[]> {
  const where: Prisma.TranslatorRequestWhereInput = {};

  if (filters.q?.trim()) {
    where.OR = [
      { requestedName: { contains: filters.q, mode: "insensitive" } },
      { description: { contains: filters.q, mode: "insensitive" } },
      { suggestedCategory: { contains: filters.q, mode: "insensitive" } },
      { requesterEmail: { contains: filters.q, mode: "insensitive" } },
    ];
  }

  if (filters.status && filters.status !== "all") {
    where.status = filters.status;
  }

  if (filters.category?.trim()) {
    where.suggestedCategory = {
      contains: filters.category,
      mode: "insensitive",
    };
  }

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) {
      where.createdAt.gte = new Date(`${filters.dateFrom}T00:00:00.000Z`);
    }
    if (filters.dateTo) {
      where.createdAt.lte = new Date(`${filters.dateTo}T23:59:59.999Z`);
    }
  }

  const rows = await prisma.translatorRequest.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      requesterEmail: true,
      requestedName: true,
      suggestedCategory: true,
      status: true,
      createdAt: true,
    },
  });

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getAdminTranslatorRequestById(id: string): Promise<AdminTranslatorRequestDetail | null> {
  const row = await prisma.translatorRequest.findUnique({
    where: { id },
    include: {
      createdTranslator: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    requesterEmail: row.requesterEmail,
    requestedName: row.requestedName,
    description: row.description,
    exampleInput: row.exampleInput,
    desiredStyle: row.desiredStyle,
    suggestedCategory: row.suggestedCategory,
    audience: row.audience,
    notes: row.notes,
    adminNotes: row.adminNotes,
    status: row.status,
    aiDraftJson: mapDraft(row.aiDraftJson),
    aiDraftGeneratedAt: row.aiDraftGeneratedAt ? row.aiDraftGeneratedAt.toISOString() : null,
    createdTranslatorId: row.createdTranslatorId,
    createdTranslator: row.createdTranslator,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function updateTranslatorRequestById(
  id: string,
  input: { status?: TranslatorRequestStatus; adminNotes?: string | null },
) {
  return prisma.translatorRequest.update({
    where: { id },
    data: {
      status: input.status,
      adminNotes: normalizeOptional(input.adminNotes),
    },
  });
}

export async function saveTranslatorRequestDraft(id: string, draft: TranslatorDraft) {
  return prisma.translatorRequest.update({
    where: { id },
    data: {
      aiDraftJson: JSON.parse(JSON.stringify(draft)) as Prisma.InputJsonValue,
      aiDraftGeneratedAt: new Date(),
      status: TranslatorRequestStatus.DRAFT_GENERATED,
    },
  });
}

export async function linkRequestToTranslator(
  id: string,
  payload: { translatorId: string; status?: TranslatorRequestStatus },
) {
  return prisma.translatorRequest.update({
    where: { id },
    data: {
      createdTranslatorId: payload.translatorId,
      status: payload.status || TranslatorRequestStatus.COMPLETED,
    },
  });
}
```

## lib/turnstile.ts

```ts
const TURNSTILE_VERIFY_ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileVerificationResult {
  success: boolean;
  skipped?: boolean;
  errorCodes?: string[];
}

export async function verifyTurnstileToken(params: {
  token?: string | null;
  ip?: string;
}): Promise<TurnstileVerificationResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const isProduction = process.env.NODE_ENV === "production";

  if (!secret) {
    if (!isProduction) {
      return { success: true, skipped: true };
    }

    return { success: false, errorCodes: ["missing-secret"] };
  }

  if (!params.token?.trim()) {
    return { success: false, errorCodes: ["missing-input-response"] };
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", params.token.trim());

  if (params.ip?.trim()) {
    body.set("remoteip", params.ip.trim());
  }

  try {
    const response = await fetch(TURNSTILE_VERIFY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      return { success: false, errorCodes: ["verification-request-failed"] };
    }

    const payload = (await response.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };

    return {
      success: Boolean(payload.success),
      errorCodes: payload["error-codes"] || [],
    };
  } catch {
    return { success: false, errorCodes: ["verification-request-failed"] };
  }
}
```

## lib/translator-draft.ts

```ts
import OpenAI from "openai";

import { DEFAULT_MODEL } from "@/lib/constants";
import { slugify } from "@/lib/slugify";
import type { TranslatorDraft, TranslatorRequestInput, TranslatorUpsertInput } from "@/lib/types";
import { translatorDraftSchema } from "@/lib/validators";

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  return new OpenAI({ apiKey });
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // continue
    }
  }

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return JSON.parse(trimmed.slice(first, last + 1));
  }

  throw new Error("No valid JSON object found in AI output.");
}

function normalizeDraft(value: TranslatorDraft): TranslatorDraft {
  return {
    ...value,
    slug: slugify(value.slug || value.name),
    modes: value.modes
      .map((mode, index) => ({
        ...mode,
        key: slugify(mode.key || mode.label),
        sortOrder: mode.sortOrder || index + 1,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder),
    examples: value.examples
      .map((example, index) => ({
        ...example,
        sortOrder: example.sortOrder || index + 1,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

function buildSystemPrompt() {
  return [
    "You are an expert product linguist designing reusable text style translators.",
    "Generate practical translator configurations for a SaaS admin dashboard.",
    "Return JSON only, no markdown.",
    "Preserve clarity and avoid unsafe or abusive content.",
    "Ensure prompts preserve meaning and facts while transforming style.",
  ].join("\n");
}

function buildUserPrompt(input: {
  idea: string;
  description: string;
  category?: string;
  styleDirection?: string;
  exampleInput?: string;
  desiredOutput?: string;
  audience?: string;
  seoDirection?: string;
}) {
  return [
    "Create a translator configuration draft from the following request.",
    `Idea: ${input.idea}`,
    `Description: ${input.description}`,
    input.category ? `Category hint: ${input.category}` : "",
    input.styleDirection ? `Style direction: ${input.styleDirection}` : "",
    input.exampleInput ? `Example input: ${input.exampleInput}` : "",
    input.desiredOutput ? `Desired output style example: ${input.desiredOutput}` : "",
    input.audience ? `Audience: ${input.audience}` : "",
    input.seoDirection ? `SEO direction: ${input.seoDirection}` : "",
    "Required JSON shape:",
    JSON.stringify(
      {
        name: "",
        slug: "",
        title: "",
        subtitle: "",
        shortDescription: "",
        sourceLabel: "",
        targetLabel: "",
        systemPrompt: "",
        promptInstructions: "",
        seoTitle: "",
        seoDescription: "",
        categorySuggestion: "",
        modes: [
          {
            key: "classic",
            label: "Classic",
            description: "",
            instruction: "",
            sortOrder: 1,
          },
        ],
        examples: [
          {
            label: "Starter",
            value: "",
            sortOrder: 1,
          },
        ],
      },
      null,
      2,
    ),
    "Constraints:",
    "- Keep 1-4 useful modes.",
    "- Keep 0-6 examples.",
    "- Make title/subtitle marketable and specific.",
    "- Keep output plain JSON only.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function generateTranslatorDraft(input: {
  idea: string;
  description: string;
  category?: string;
  styleDirection?: string;
  exampleInput?: string;
  desiredOutput?: string;
  audience?: string;
  seoDirection?: string;
  model?: string;
}) {
  const client = getClient();
  const model = input.model || process.env.OPENAI_MODEL || DEFAULT_MODEL;

  const response = await client.responses.create({
    model,
    temperature: 0.4,
    max_output_tokens: 2000,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: buildSystemPrompt() }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: buildUserPrompt(input) }],
      },
    ],
  });

  const text = response.output_text || "";
  const parsed = extractJson(text);
  const validated = translatorDraftSchema.parse(parsed);

  return normalizeDraft(validated);
}

export function requestInputToDraftPrompt(input: TranslatorRequestInput) {
  return {
    idea: input.requestedName,
    description: input.description,
    category: input.suggestedCategory,
    styleDirection: input.desiredStyle,
    exampleInput: input.exampleInput,
    desiredOutput: input.desiredStyle,
    audience: input.audience,
    seoDirection: input.notes,
  };
}

export function draftToTranslatorInput(params: {
  draft: TranslatorDraft;
  categoryIds: string[];
  primaryCategoryId?: string | null;
}): TranslatorUpsertInput {
  return {
    name: params.draft.name,
    slug: slugify(params.draft.slug || params.draft.name),
    title: params.draft.title,
    subtitle: params.draft.subtitle,
    shortDescription: params.draft.shortDescription,
    sourceLabel: params.draft.sourceLabel,
    targetLabel: params.draft.targetLabel,
    iconName: "",
    promptSystem: params.draft.systemPrompt,
    promptInstructions: params.draft.promptInstructions,
    seoTitle: params.draft.seoTitle || "",
    seoDescription: params.draft.seoDescription || "",
    modelOverride: "",
    isActive: false,
    isFeatured: false,
    showModeSelector: false,
    showSwap: false,
    showExamples: false,
    sortOrder: 50,
    primaryCategoryId: params.primaryCategoryId || params.categoryIds[0] || null,
    categoryIds: params.categoryIds,
    modes: params.draft.modes.map((mode, index) => ({
      ...mode,
      key: slugify(mode.key || mode.label),
      sortOrder: mode.sortOrder || index + 1,
    })),
    examples: params.draft.examples.map((example, index) => ({
      ...example,
      sortOrder: example.sortOrder || index + 1,
    })),
  };
}
```

## app/api/translator-requests/route.ts

```ts
import { apiError, apiOk } from "@/lib/api-response";
import { createPublicTranslatorRequest } from "@/lib/data/requests";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { extractClientIp } from "@/lib/utils";
import { translatorRequestSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const identifier = extractClientIp(request);
  const limit = checkRateLimit(`translator-request:${identifier}`);

  if (!limit.allowed) {
    return apiError(429, "RATE_LIMITED", "Too many request submissions. Please try again shortly.");
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "Invalid JSON payload.");
  }

  const parsed = translatorRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Please complete all required request fields.");
  }

  if (parsed.data.honeypot?.trim()) {
    return apiError(403, "FORBIDDEN", "Submission blocked.");
  }

  const turnstile = await verifyTurnstileToken({
    token: parsed.data.turnstileToken,
    ip: identifier,
  });

  if (!turnstile.success) {
    return apiError(403, "FORBIDDEN", "Captcha verification failed.");
  }

  const created = await createPublicTranslatorRequest(parsed.data);

  return apiOk({ requestId: created.id }, 201);
}
```

## app/api/admin/requests/route.ts

```ts
import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { listAdminTranslatorRequests } from "@/lib/data/requests";
import { adminRequestFilterSchema } from "@/lib/validators";

export async function GET(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { searchParams } = new URL(request.url);
  const parsed = adminRequestFilterSchema.safeParse({
    q: searchParams.get("q") || undefined,
    status: searchParams.get("status") || undefined,
    category: searchParams.get("category") || undefined,
    dateFrom: searchParams.get("dateFrom") || undefined,
    dateTo: searchParams.get("dateTo") || undefined,
  });

  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Invalid request filter query.");
  }

  const requests = await listAdminTranslatorRequests(parsed.data);
  return apiOk({ requests });
}
```

## app/api/admin/requests/[id]/route.ts

```ts
import { apiError, apiOk } from "@/lib/api-response";
import { getAdminTranslatorRequestById, updateTranslatorRequestById } from "@/lib/data/requests";
import { adminRouteGuard } from "@/lib/permissions";
import { requestStatusUpdateSchema } from "@/lib/validators";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { id } = await context.params;
  const request = await getAdminTranslatorRequestById(id);

  if (!request) {
    return apiError(404, "NOT_FOUND", "Request not found.");
  }

  return apiOk({ request });
}

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "Invalid JSON payload.");
  }

  const parsed = requestStatusUpdateSchema.safeParse(payload);

  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Please provide valid request updates.");
  }

  const { id } = await context.params;

  try {
    const updated = await updateTranslatorRequestById(id, {
      status: parsed.data.status,
      adminNotes: parsed.data.adminNotes,
    });
    return apiOk({ request: updated });
  } catch {
    return apiError(500, "BAD_REQUEST", "Unable to update request right now.");
  }
}
```

## app/api/admin/requests/[id]/generate-draft/route.ts

```ts
import { getAppSettings } from "@/lib/settings";
import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { getAdminTranslatorRequestById, saveTranslatorRequestDraft } from "@/lib/data/requests";
import { generateTranslatorDraft } from "@/lib/translator-draft";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { id } = await context.params;
  const translatorRequest = await getAdminTranslatorRequestById(id);

  if (!translatorRequest) {
    return apiError(404, "NOT_FOUND", "Request not found.");
  }

  try {
    const settings = await getAppSettings();
    const draft = await generateTranslatorDraft({
      idea: translatorRequest.requestedName,
      description: translatorRequest.description,
      category: translatorRequest.suggestedCategory || undefined,
      styleDirection: translatorRequest.desiredStyle || undefined,
      exampleInput: translatorRequest.exampleInput || undefined,
      desiredOutput: translatorRequest.desiredStyle || undefined,
      audience: translatorRequest.audience || undefined,
      seoDirection: translatorRequest.notes || undefined,
      model: settings.defaultModelOverride || undefined,
    });

    await saveTranslatorRequestDraft(id, draft);

    return apiOk({ draft });
  } catch {
    return apiError(502, "UPSTREAM_ERROR", "Unable to generate a draft right now.");
  }
}
```

## app/api/admin/requests/[id]/create-translator/route.ts

```ts
import { TranslatorRequestStatus } from "@prisma/client";

import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { createTranslator } from "@/lib/data/translators";
import { getAdminTranslatorRequestById, linkRequestToTranslator } from "@/lib/data/requests";
import { draftToTranslatorInput } from "@/lib/translator-draft";
import { getCategoryChoices } from "@/lib/data/categories";
import { slugify } from "@/lib/slugify";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function resolveCategoryId(params: {
  suggestedCategory?: string | null;
  draftCategory?: string | null;
  categories: Array<{ id: string; name: string; slug: string }>;
}) {
  const candidates = [params.suggestedCategory, params.draftCategory]
    .filter(Boolean)
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean);

  for (const candidate of candidates) {
    const bySlug = params.categories.find((item) => item.slug === slugify(candidate));
    if (bySlug) {
      return bySlug.id;
    }

    const byName = params.categories.find((item) => item.name.toLowerCase() === candidate);
    if (byName) {
      return byName.id;
    }
  }

  return params.categories[0]?.id || null;
}

export async function POST(_: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { id } = await context.params;
  const [translatorRequest, categories] = await Promise.all([
    getAdminTranslatorRequestById(id),
    getCategoryChoices(),
  ]);

  if (!translatorRequest) {
    return apiError(404, "NOT_FOUND", "Request not found.");
  }

  if (!translatorRequest.aiDraftJson) {
    return apiError(400, "BAD_REQUEST", "No AI draft found for this request.");
  }

  if (!categories.length) {
    return apiError(400, "BAD_REQUEST", "Create at least one category before creating translators.");
  }

  try {
    const categoryId = resolveCategoryId({
      suggestedCategory: translatorRequest.suggestedCategory,
      draftCategory: translatorRequest.aiDraftJson.categorySuggestion,
      categories,
    });

    if (!categoryId) {
      return apiError(400, "BAD_REQUEST", "No category available for this draft.");
    }

    const input = draftToTranslatorInput({
      draft: translatorRequest.aiDraftJson,
      categoryIds: [categoryId],
      primaryCategoryId: categoryId,
    });

    const translator = await createTranslator(input);

    await linkRequestToTranslator(id, {
      translatorId: translator.id,
      status: TranslatorRequestStatus.COMPLETED,
    });

    return apiOk({ translator }, 201);
  } catch {
    return apiError(500, "BAD_REQUEST", "Unable to create translator from draft right now.");
  }
}
```

## app/api/admin/translators/ai-draft/route.ts

```ts
import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { getAppSettings } from "@/lib/settings";
import { generateTranslatorDraft } from "@/lib/translator-draft";
import { aiDraftInputSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "Invalid JSON payload.");
  }

  const parsed = aiDraftInputSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Please provide valid AI draft input fields.");
  }

  try {
    const settings = await getAppSettings();
    const draft = await generateTranslatorDraft({
      idea: parsed.data.idea,
      description: parsed.data.description,
      category: parsed.data.category,
      styleDirection: parsed.data.styleDirection,
      exampleInput: parsed.data.exampleInput,
      desiredOutput: parsed.data.desiredOutput,
      audience: parsed.data.audience,
      seoDirection: parsed.data.seoDirection,
      model: settings.defaultModelOverride || undefined,
    });

    return apiOk({ draft });
  } catch {
    return apiError(502, "UPSTREAM_ERROR", "Unable to generate AI draft right now.");
  }
}
```

## app/(admin)/admin/requests/page.tsx

```tsx
import { TranslatorRequestStatus } from "@prisma/client";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { RequestTable } from "@/components/admin/request-table";
import { getCategoryChoices } from "@/lib/data/categories";
import { listAdminTranslatorRequests } from "@/lib/data/requests";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    status?: string;
    category?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
}

export const dynamic = "force-dynamic";

function parseStatus(value?: string) {
  if (!value || value === "all") {
    return "all";
  }

  return Object.values(TranslatorRequestStatus).includes(value as TranslatorRequestStatus)
    ? (value as TranslatorRequestStatus)
    : "all";
}

export default async function AdminRequestsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const [requests, categories] = await Promise.all([
    listAdminTranslatorRequests({
      q: params.q || undefined,
      status: parseStatus(params.status),
      category: params.category || undefined,
      dateFrom: params.dateFrom || undefined,
      dateTo: params.dateTo || undefined,
    }),
    getCategoryChoices(),
  ]);

  return (
    <>
      <AdminTopbar
        title="Translator Requests"
        subtitle="Review visitor requests, generate drafts, and convert approved requests into translators."
      />
      <main className="space-y-4 p-4 sm:p-6">
        <form className="grid gap-2 rounded-2xl border border-border bg-surface p-4 md:grid-cols-[1fr_170px_190px_180px_180px_auto]">
          <input
            type="text"
            name="q"
            defaultValue={params.q || ""}
            placeholder="Search by name, description, or email"
            className="h-11 rounded-xl border border-border bg-surface px-3 text-ink"
          />

          <select
            name="status"
            defaultValue={params.status || "all"}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-ink"
          >
            <option value="all">All statuses</option>
            {Object.values(TranslatorRequestStatus).map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <select
            name="category"
            defaultValue={params.category || ""}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-ink"
          >
            <option value="">All category suggestions</option>
            {categories.map((category) => (
              <option key={category.id} value={category.name}>
                {category.name}
              </option>
            ))}
          </select>

          <input
            type="date"
            name="dateFrom"
            defaultValue={params.dateFrom || ""}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-ink"
          />

          <input
            type="date"
            name="dateTo"
            defaultValue={params.dateTo || ""}
            className="h-11 rounded-xl border border-border bg-surface px-3 text-ink"
          />

          <button
            type="submit"
            className="h-11 rounded-xl bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
          >
            Filter
          </button>
        </form>

        <RequestTable requests={requests} />
      </main>
    </>
  );
}
```

## app/(admin)/admin/requests/[id]/page.tsx

```tsx
import { notFound } from "next/navigation";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { RequestDetail } from "@/components/admin/request-detail";
import { getAdminTranslatorRequestById } from "@/lib/data/requests";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function AdminRequestDetailPage({ params }: PageProps) {
  const { id } = await params;
  const request = await getAdminTranslatorRequestById(id);

  if (!request) {
    notFound();
  }

  return (
    <>
      <AdminTopbar
        title={`Request: ${request.requestedName}`}
        subtitle="Inspect request details, update status, and generate an AI translator draft."
      />
      <main className="p-4 sm:p-6">
        <RequestDetail request={request} />
      </main>
    </>
  );
}
```

## app/(admin)/admin/translators/ai/new/page.tsx

```tsx
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { AiTranslatorCreator } from "@/components/admin/ai-translator-creator";
import { getCategoryChoices } from "@/lib/data/categories";

export const dynamic = "force-dynamic";

export default async function AdminAiTranslatorCreatePage() {
  const categories = await getCategoryChoices();

  return (
    <>
      <AdminTopbar
        title="Create Translator With AI"
        subtitle="Describe your translator concept, generate a draft config, then publish as an editable translator."
      />
      <main className="p-4 sm:p-6">
        <AiTranslatorCreator categories={categories} />
      </main>
    </>
  );
}
```

## components/admin/request-table.tsx

```tsx
import Link from "next/link";
import type { TranslatorRequestStatus } from "@prisma/client";

import type { AdminTranslatorRequestListItem } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

interface RequestTableProps {
  requests: AdminTranslatorRequestListItem[];
}

function statusClasses(status: TranslatorRequestStatus) {
  switch (status) {
    case "NEW":
      return "bg-brand-100 text-brand-700";
    case "REVIEWING":
      return "bg-amber-100 text-amber-700";
    case "DRAFT_GENERATED":
      return "bg-indigo-100 text-indigo-700";
    case "APPROVED":
    case "COMPLETED":
      return "bg-emerald-100 text-emerald-700";
    case "REJECTED":
      return "bg-red-100 text-red-700";
    default:
      return "bg-muted-surface text-muted-ink";
  }
}

export function RequestTable({ requests }: RequestTableProps) {
  if (!requests.length) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-muted-ink">
        No translator requests found for the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="min-w-full text-sm">
        <thead className="bg-muted-surface text-left text-muted-ink">
          <tr>
            <th className="px-4 py-3 font-medium">Requested Name</th>
            <th className="px-4 py-3 font-medium">Category</th>
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Created</th>
            <th className="px-4 py-3 font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {requests.map((request) => (
            <tr key={request.id}>
              <td className="px-4 py-3 font-medium text-ink">{request.requestedName}</td>
              <td className="px-4 py-3 text-muted-ink">{request.suggestedCategory || "-"}</td>
              <td className="px-4 py-3 text-muted-ink">{request.requesterEmail || "-"}</td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClasses(request.status)}`}>
                  {request.status}
                </span>
              </td>
              <td className="px-4 py-3 text-muted-ink">{formatDateTime(request.createdAt)}</td>
              <td className="px-4 py-3">
                <Link
                  href={`/admin/requests/${request.id}`}
                  className="inline-flex h-8 items-center rounded-lg border border-border bg-muted-surface px-3 text-xs font-medium text-ink transition hover:border-brand-300 hover:bg-surface"
                >
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

## components/admin/request-detail.tsx

```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TranslatorRequestStatus } from "@prisma/client";
import { RefreshCcw, Sparkles } from "lucide-react";

import type { AdminTranslatorRequestDetail } from "@/lib/types";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";

interface RequestDetailProps {
  request: AdminTranslatorRequestDetail;
}

const statusOptions: TranslatorRequestStatus[] = [
  "NEW",
  "REVIEWING",
  "DRAFT_GENERATED",
  "APPROVED",
  "REJECTED",
  "COMPLETED",
];

export function RequestDetail({ request }: RequestDetailProps) {
  const [status, setStatus] = useState<TranslatorRequestStatus>(request.status);
  const [adminNotes, setAdminNotes] = useState(request.adminNotes || "");
  const [draft, setDraft] = useState(request.aiDraftJson);
  const [busy, setBusy] = useState<"save" | "draft" | "create" | null>(null);

  const { toast } = useToast();
  const router = useRouter();

  const isLinked = useMemo(() => Boolean(request.createdTranslatorId), [request.createdTranslatorId]);

  async function saveMeta(nextStatus?: TranslatorRequestStatus) {
    setBusy("save");
    const response = await fetch(`/api/admin/requests/${request.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: nextStatus || status,
        adminNotes,
      }),
    });

    const payload = await response.json();
    setBusy(null);

    if (!response.ok || !payload.ok) {
      toast({
        title: "Update failed",
        description: payload?.error?.message || "Please try again.",
        variant: "error",
      });
      return;
    }

    if (nextStatus) {
      setStatus(nextStatus);
    }

    toast({ title: "Request updated" });
    router.refresh();
  }

  async function generateDraft() {
    setBusy("draft");

    const response = await fetch(`/api/admin/requests/${request.id}/generate-draft`, {
      method: "POST",
    });

    const payload = await response.json();
    setBusy(null);

    if (!response.ok || !payload.ok) {
      toast({
        title: "Draft generation failed",
        description: payload?.error?.message || "Please try again.",
        variant: "error",
      });
      return;
    }

    setDraft(payload.draft || null);
    setStatus("DRAFT_GENERATED");
    toast({ title: "AI draft generated" });
    router.refresh();
  }

  async function createFromDraft() {
    setBusy("create");
    const response = await fetch(`/api/admin/requests/${request.id}/create-translator`, {
      method: "POST",
    });

    const payload = await response.json();
    setBusy(null);

    if (!response.ok || !payload.ok) {
      toast({
        title: "Translator creation failed",
        description: payload?.error?.message || "Please try again.",
        variant: "error",
      });
      return;
    }

    toast({ title: "Translator created from request" });
    router.push(`/admin/translators/${payload.translator.id}`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 rounded-2xl border border-border bg-surface p-5 sm:grid-cols-2 lg:grid-cols-3">
        <article>
          <p className="text-xs font-medium uppercase text-muted-ink">Requester Email</p>
          <p className="mt-1 text-sm text-ink">{request.requesterEmail || "Not provided"}</p>
        </article>
        <article>
          <p className="text-xs font-medium uppercase text-muted-ink">Suggested Category</p>
          <p className="mt-1 text-sm text-ink">{request.suggestedCategory || "Unspecified"}</p>
        </article>
        <article>
          <p className="text-xs font-medium uppercase text-muted-ink">Created</p>
          <p className="mt-1 text-sm text-ink">{formatDateTime(request.createdAt)}</p>
        </article>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-2xl font-semibold text-ink">Request Details</h2>
        <dl className="mt-4 space-y-4 text-sm">
          <div>
            <dt className="font-medium text-muted-ink">Requested Translator Name</dt>
            <dd className="mt-1 text-ink">{request.requestedName}</dd>
          </div>
          <div>
            <dt className="font-medium text-muted-ink">What it should do</dt>
            <dd className="mt-1 whitespace-pre-wrap text-ink">{request.description}</dd>
          </div>
          <div>
            <dt className="font-medium text-muted-ink">Example input</dt>
            <dd className="mt-1 whitespace-pre-wrap text-ink">{request.exampleInput || "-"}</dd>
          </div>
          <div>
            <dt className="font-medium text-muted-ink">Desired output/style</dt>
            <dd className="mt-1 whitespace-pre-wrap text-ink">{request.desiredStyle || "-"}</dd>
          </div>
          <div>
            <dt className="font-medium text-muted-ink">Audience / use case</dt>
            <dd className="mt-1 whitespace-pre-wrap text-ink">{request.audience || "-"}</dd>
          </div>
          <div>
            <dt className="font-medium text-muted-ink">Additional notes</dt>
            <dd className="mt-1 whitespace-pre-wrap text-ink">{request.notes || "-"}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-display text-2xl font-semibold text-ink">Admin Controls</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as TranslatorRequestStatus)}
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-ink"
            >
              {statusOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">Internal admin notes</span>
            <textarea
              value={adminNotes}
              onChange={(event) => setAdminNotes(event.target.value)}
              className="min-h-28 w-full rounded-xl border border-border bg-surface px-3 py-2 text-ink"
              placeholder="Internal notes, review comments, next actions..."
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={() => void saveMeta()} disabled={busy === "save"}>
            {busy === "save" ? "Saving..." : "Save updates"}
          </Button>
          <Button type="button" variant="outline" onClick={() => void saveMeta("REVIEWING")}>
            Mark Reviewing
          </Button>
          <Button type="button" variant="outline" onClick={() => void saveMeta("REJECTED")}>
            Reject
          </Button>
          <Button type="button" variant="outline" onClick={() => void saveMeta("APPROVED")}>
            Approve
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-2xl font-semibold text-ink">AI Draft</h2>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => void generateDraft()} disabled={busy === "draft"}>
              <RefreshCcw className={`h-4 w-4 ${busy === "draft" ? "animate-spin" : ""}`} />
              {draft ? "Regenerate" : "Generate AI draft"}
            </Button>
            <Button
              type="button"
              onClick={() => void createFromDraft()}
              disabled={!draft || isLinked || busy === "create"}
            >
              <Sparkles className="h-4 w-4" />
              {busy === "create" ? "Creating..." : "Create translator from draft"}
            </Button>
          </div>
        </div>

        {request.createdTranslator ? (
          <p className="mt-3 text-sm text-emerald-700">
            Linked translator: {request.createdTranslator.name} (/{request.createdTranslator.slug})
          </p>
        ) : null}

        {draft ? (
          <pre className="mt-4 max-h-[520px] overflow-auto rounded-xl border border-border bg-muted-surface p-4 text-xs text-ink">
            {JSON.stringify(draft, null, 2)}
          </pre>
        ) : (
          <p className="mt-4 text-sm text-muted-ink">
            No AI draft generated yet. Use the button above to create a first pass draft.
          </p>
        )}
      </section>
    </div>
  );
}
```

## components/admin/ai-translator-creator.tsx

```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCcw, Sparkles } from "lucide-react";

import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { slugify } from "@/lib/slugify";
import type { TranslatorDraft } from "@/lib/types";

interface AiTranslatorCreatorProps {
  categories: Array<{ id: string; name: string; slug: string }>;
}

function defaultInput() {
  return {
    idea: "",
    description: "",
    category: "",
    styleDirection: "",
    exampleInput: "",
    desiredOutput: "",
    audience: "",
    seoDirection: "",
  };
}

export function AiTranslatorCreator({ categories }: AiTranslatorCreatorProps) {
  const [form, setForm] = useState(defaultInput);
  const [draft, setDraft] = useState<TranslatorDraft | null>(null);
  const [busy, setBusy] = useState<"generate" | "create" | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState(categories[0]?.id || "");
  const [modesJson, setModesJson] = useState("[]");
  const [examplesJson, setExamplesJson] = useState("[]");

  const router = useRouter();
  const { toast } = useToast();

  const canCreate = useMemo(() => Boolean(draft && selectedCategoryId), [draft, selectedCategoryId]);

  function applyDraft(nextDraft: TranslatorDraft) {
    setDraft(nextDraft);
    setModesJson(JSON.stringify(nextDraft.modes, null, 2));
    setExamplesJson(JSON.stringify(nextDraft.examples, null, 2));

    if (!categories.length) {
      return;
    }

    const suggestion = (nextDraft.categorySuggestion || "").trim().toLowerCase();
    const matched = categories.find(
      (item) => item.slug === slugify(suggestion) || item.name.toLowerCase() === suggestion,
    );

    if (matched) {
      setSelectedCategoryId(matched.id);
    }
  }

  async function generateDraft() {
    setBusy("generate");

    const response = await fetch("/api/admin/translators/ai-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const payload = await response.json();
    setBusy(null);

    if (!response.ok || !payload.ok) {
      toast({
        title: "AI generation failed",
        description: payload?.error?.message || "Please adjust inputs and retry.",
        variant: "error",
      });
      return;
    }

    applyDraft(payload.draft);
    toast({ title: "Draft generated", description: "Review and edit before creating translator." });
  }

  async function createTranslatorFromDraft() {
    if (!draft || !selectedCategoryId) {
      return;
    }

    let modes: Array<{ key: string; label: string; description?: string; instruction: string; sortOrder: number }>;
    let examples: Array<{ label: string; value: string; sortOrder: number }>;

    try {
      modes = JSON.parse(modesJson);
      examples = JSON.parse(examplesJson);
    } catch {
      toast({
        title: "Invalid JSON",
        description: "Modes or examples JSON is invalid.",
        variant: "error",
      });
      return;
    }

    setBusy("create");

    const response = await fetch("/api/admin/translators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        slug: slugify(draft.slug || draft.name),
        title: draft.title,
        subtitle: draft.subtitle,
        shortDescription: draft.shortDescription,
        sourceLabel: draft.sourceLabel,
        targetLabel: draft.targetLabel,
        iconName: "",
        promptSystem: draft.systemPrompt,
        promptInstructions: draft.promptInstructions,
        seoTitle: draft.seoTitle || "",
        seoDescription: draft.seoDescription || "",
        modelOverride: "",
        isActive: false,
        isFeatured: false,
        showModeSelector: false,
        showSwap: false,
        showExamples: false,
        sortOrder: 50,
        primaryCategoryId: selectedCategoryId,
        categoryIds: [selectedCategoryId],
        modes,
        examples,
      }),
    });

    const payload = await response.json();
    setBusy(null);

    if (!response.ok || !payload.ok) {
      toast({
        title: "Create failed",
        description: payload?.error?.message || "Please review the draft and try again.",
        variant: "error",
      });
      return;
    }

    toast({ title: "Translator created", description: "Opening editor for final review." });
    router.push(`/admin/translators/${payload.translator.id}`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display text-2xl font-semibold text-ink">Describe The Translator</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Translator idea</span>
            <input
              value={form.idea}
              onChange={(event) => setForm((current) => ({ ...current, idea: event.target.value }))}
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-ink"
              placeholder="Ex: Startup Pitch Polisher"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Category</span>
            <input
              value={form.category}
              onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-ink"
              placeholder="Professional"
            />
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">What it should do</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              className="min-h-24 w-full rounded-xl border border-border bg-surface px-3 py-2 text-ink"
              placeholder="Explain the transformation behavior and quality bar..."
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Style direction</span>
            <textarea
              value={form.styleDirection}
              onChange={(event) => setForm((current) => ({ ...current, styleDirection: event.target.value }))}
              className="min-h-20 w-full rounded-xl border border-border bg-surface px-3 py-2 text-ink"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Audience / use case</span>
            <textarea
              value={form.audience}
              onChange={(event) => setForm((current) => ({ ...current, audience: event.target.value }))}
              className="min-h-20 w-full rounded-xl border border-border bg-surface px-3 py-2 text-ink"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Example input</span>
            <textarea
              value={form.exampleInput}
              onChange={(event) => setForm((current) => ({ ...current, exampleInput: event.target.value }))}
              className="min-h-20 w-full rounded-xl border border-border bg-surface px-3 py-2 text-ink"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Desired output feel</span>
            <textarea
              value={form.desiredOutput}
              onChange={(event) => setForm((current) => ({ ...current, desiredOutput: event.target.value }))}
              className="min-h-20 w-full rounded-xl border border-border bg-surface px-3 py-2 text-ink"
            />
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">SEO direction (optional)</span>
            <textarea
              value={form.seoDirection}
              onChange={(event) => setForm((current) => ({ ...current, seoDirection: event.target.value }))}
              className="min-h-20 w-full rounded-xl border border-border bg-surface px-3 py-2 text-ink"
            />
          </label>
        </div>

        <div className="mt-4">
          <Button type="button" onClick={() => void generateDraft()} disabled={busy === "generate"}>
            <Sparkles className="h-4 w-4" />
            {busy === "generate" ? "Generating..." : draft ? "Regenerate Draft" : "Generate Draft"}
          </Button>
        </div>
      </section>

      {draft ? (
        <section className="rounded-2xl border border-border bg-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-2xl font-semibold text-ink">Review Draft</h2>
            <Button type="button" variant="outline" onClick={() => void generateDraft()} disabled={busy === "generate"}>
              <RefreshCcw className={`h-4 w-4 ${busy === "generate" ? "animate-spin" : ""}`} />
              Regenerate
            </Button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-muted-ink">Name</span>
              <input
                value={draft.name}
                onChange={(event) => setDraft((current) => (current ? { ...current, name: event.target.value } : current))}
                className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-ink"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-muted-ink">Slug</span>
              <input
                value={draft.slug}
                onChange={(event) => setDraft((current) => (current ? { ...current, slug: slugify(event.target.value) } : current))}
                className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-ink"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium text-muted-ink">Title</span>
              <input
                value={draft.title}
                onChange={(event) => setDraft((current) => (current ? { ...current, title: event.target.value } : current))}
                className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-ink"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium text-muted-ink">Subtitle</span>
              <textarea
                value={draft.subtitle}
                onChange={(event) => setDraft((current) => (current ? { ...current, subtitle: event.target.value } : current))}
                className="min-h-20 w-full rounded-xl border border-border bg-surface px-3 py-2 text-ink"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium text-muted-ink">Short Description</span>
              <textarea
                value={draft.shortDescription}
                onChange={(event) =>
                  setDraft((current) => (current ? { ...current, shortDescription: event.target.value } : current))
                }
                className="min-h-20 w-full rounded-xl border border-border bg-surface px-3 py-2 text-ink"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-muted-ink">Source Label</span>
              <input
                value={draft.sourceLabel}
                onChange={(event) =>
                  setDraft((current) => (current ? { ...current, sourceLabel: event.target.value } : current))
                }
                className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-ink"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-muted-ink">Target Label</span>
              <input
                value={draft.targetLabel}
                onChange={(event) =>
                  setDraft((current) => (current ? { ...current, targetLabel: event.target.value } : current))
                }
                className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-ink"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium text-muted-ink">System Prompt</span>
              <textarea
                value={draft.systemPrompt}
                onChange={(event) =>
                  setDraft((current) => (current ? { ...current, systemPrompt: event.target.value } : current))
                }
                className="min-h-24 w-full rounded-xl border border-border bg-surface px-3 py-2 text-ink"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium text-muted-ink">Prompt Instructions</span>
              <textarea
                value={draft.promptInstructions}
                onChange={(event) =>
                  setDraft((current) => (current ? { ...current, promptInstructions: event.target.value } : current))
                }
                className="min-h-24 w-full rounded-xl border border-border bg-surface px-3 py-2 text-ink"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium text-muted-ink">Modes JSON</span>
              <textarea
                value={modesJson}
                onChange={(event) => setModesJson(event.target.value)}
                className="min-h-32 w-full rounded-xl border border-border bg-surface px-3 py-2 font-mono text-xs text-ink"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium text-muted-ink">Examples JSON</span>
              <textarea
                value={examplesJson}
                onChange={(event) => setExamplesJson(event.target.value)}
                className="min-h-28 w-full rounded-xl border border-border bg-surface px-3 py-2 font-mono text-xs text-ink"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-muted-ink">Category for new translator</span>
              <select
                value={selectedCategoryId}
                onChange={(event) => setSelectedCategoryId(event.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-ink"
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4">
            <Button type="button" onClick={() => void createTranslatorFromDraft()} disabled={!canCreate || busy === "create"}>
              {busy === "create" ? "Creating..." : "Create Translator"}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
```

## components/public/request-translator-modal.tsx

```tsx
"use client";

import { useMemo, useState } from "react";
import Script from "next/script";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/toast-provider";

interface RequestTranslatorModalProps {
  triggerLabel?: string;
  triggerClassName?: string;
}

export function RequestTranslatorModal({
  triggerLabel = "Request a translator",
  triggerClassName,
}: RequestTranslatorModalProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
  const showTurnstile = useMemo(() => Boolean(siteKey), [siteKey]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload = {
      requesterEmail: String(formData.get("requesterEmail") || ""),
      requestedName: String(formData.get("requestedName") || ""),
      description: String(formData.get("description") || ""),
      exampleInput: String(formData.get("exampleInput") || ""),
      desiredStyle: String(formData.get("desiredStyle") || ""),
      suggestedCategory: String(formData.get("suggestedCategory") || ""),
      audience: String(formData.get("audience") || ""),
      notes: String(formData.get("notes") || ""),
      honeypot: String(formData.get("website") || ""),
      turnstileToken: String(formData.get("cf-turnstile-response") || ""),
    };

    const response = await fetch("/api/translator-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    setSubmitting(false);

    if (!response.ok || !result.ok) {
      setError(result?.error?.message || "Unable to submit your request right now.");
      return;
    }

    toast({
      title: "Request submitted",
      description: "Thanks. We’ll review this translator idea in the admin queue.",
    });

    form.reset();
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          triggerClassName ||
          "inline-flex h-11 items-center rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600"
        }
      >
        {triggerLabel}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[75] overflow-y-auto bg-ink/40 p-4">
          <div className="mx-auto mt-6 w-full max-w-2xl rounded-2xl border border-border bg-surface shadow-[0_30px_80px_-45px_rgba(17,24,39,0.45)]">
            <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
              <div>
                <h2 className="font-display text-2xl font-semibold text-ink">Request A Translator</h2>
                <p className="text-sm text-muted-ink">Tell us what transformation you need and we’ll review it.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted-surface text-muted-ink transition hover:border-brand-300 hover:text-ink"
                aria-label="Close request modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-4 px-4 py-4 sm:px-6 sm:py-6">
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                className="hidden"
                aria-hidden="true"
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1 text-sm sm:col-span-2">
                  <span className="font-medium text-muted-ink">Requested translator name or idea</span>
                  <input
                    name="requestedName"
                    required
                    className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-ink"
                    placeholder="Ex: Startup Pitch Sharpen"
                  />
                </label>

                <label className="space-y-1 text-sm sm:col-span-2">
                  <span className="font-medium text-muted-ink">What should this translator do?</span>
                  <textarea
                    name="description"
                    required
                    className="min-h-24 w-full rounded-xl border border-border bg-surface px-3 py-2 text-ink"
                    placeholder="Describe the transformation behavior and quality expectations."
                  />
                </label>

                <label className="space-y-1 text-sm">
                  <span className="font-medium text-muted-ink">Example input</span>
                  <textarea
                    name="exampleInput"
                    className="min-h-20 w-full rounded-xl border border-border bg-surface px-3 py-2 text-ink"
                  />
                </label>

                <label className="space-y-1 text-sm">
                  <span className="font-medium text-muted-ink">Desired output/style direction</span>
                  <textarea
                    name="desiredStyle"
                    className="min-h-20 w-full rounded-xl border border-border bg-surface px-3 py-2 text-ink"
                  />
                </label>

                <label className="space-y-1 text-sm">
                  <span className="font-medium text-muted-ink">Category suggestion</span>
                  <input name="suggestedCategory" className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-ink" />
                </label>

                <label className="space-y-1 text-sm">
                  <span className="font-medium text-muted-ink">Intended audience/use case</span>
                  <input name="audience" className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-ink" />
                </label>

                <label className="space-y-1 text-sm sm:col-span-2">
                  <span className="font-medium text-muted-ink">Email for follow-up (optional)</span>
                  <input
                    name="requesterEmail"
                    type="email"
                    className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-ink"
                    placeholder="you@example.com"
                  />
                </label>

                <label className="space-y-1 text-sm sm:col-span-2">
                  <span className="font-medium text-muted-ink">Additional notes</span>
                  <textarea name="notes" className="min-h-20 w-full rounded-xl border border-border bg-surface px-3 py-2 text-ink" />
                </label>
              </div>

              {showTurnstile ? (
                <>
                  <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
                  <div className="cf-turnstile" data-sitekey={siteKey} data-theme="light" />
                </>
              ) : (
                <p className="rounded-xl border border-dashed border-border bg-muted-surface px-3 py-2 text-xs text-muted-ink">
                  Captcha is not configured in this environment. In production, Turnstile verification is required.
                </p>
              )}

              {error ? <p className="text-sm text-red-600">{error}</p> : null}

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit request"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
```

## app/(public)/page.tsx

```tsx
import type { Metadata } from "next";
import { AdDeviceType, AdPageType } from "@prisma/client";

import { CategoryNav } from "@/components/public/category-nav";
import { DiscoveryPagination } from "@/components/public/discovery-pagination";
import { DiscoverySearch } from "@/components/public/discovery-search";
import { FeaturedTranslators } from "@/components/public/featured-translators";
import { RequestTranslatorModal } from "@/components/public/request-translator-modal";
import { TranslatorDirectory } from "@/components/public/translator-directory";
import { Footer } from "@/components/sections/footer";
import { Hero } from "@/components/sections/hero";
import { Navbar } from "@/components/sections/navbar";
import { AdSlot } from "@/components/shared/ad-slot";
import { DISCOVERY_DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { getRenderableAdPlacements } from "@/lib/data/ads";
import { getDiscoveryResult, getFeaturedPublicTranslators } from "@/lib/data/translators";
import { getAppSettings } from "@/lib/settings";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    category?: string;
    page?: string;
  }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;

  const hasSearch = Boolean(params.q?.trim());
  const hasCategory = Boolean(params.category?.trim());

  return {
    title: "StylePort Translator Discovery",
    description:
      "Browse and search style translators by category, tone, and writing intent.",
    alternates: {
      canonical: hasCategory || hasSearch ? "/" : "/",
    },
    robots: hasSearch
      ? {
          index: false,
          follow: true,
        }
      : undefined,
  };
}

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const settings = await getAppSettings();

  const q = (params.q || "").trim() || undefined;
  const category = (params.category || "").trim() || undefined;
  const page = Math.max(1, Number(params.page || 1) || 1);
  const pageSize = settings.discoveryPageSize || DISCOVERY_DEFAULT_PAGE_SIZE;

  const [discovery, featured, desktopAds, mobileAds] = await Promise.all([
    getDiscoveryResult({ q, category, page, pageSize }),
    getFeaturedPublicTranslators(6),
    getRenderableAdPlacements({
      pageType: AdPageType.HOMEPAGE,
      deviceType: AdDeviceType.DESKTOP,
    }),
    getRenderableAdPlacements({
      pageType: AdPageType.HOMEPAGE,
      deviceType: AdDeviceType.MOBILE,
    }),
  ]);

  return (
    <div className="relative overflow-x-hidden">
      <Navbar />
      <main className="pb-10">
        <Hero title={settings.homepageTitle} subtitle={settings.homepageSubtitle} />

        <section className="mx-auto mt-2 w-full max-w-7xl space-y-4 px-4 sm:px-6 lg:px-8">
          <p className="text-sm text-muted-ink">{settings.catalogIntro}</p>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="min-w-0 flex-1">
              <DiscoverySearch q={q || ""} category={category} />
            </div>
            <RequestTranslatorModal />
          </div>
          <CategoryNav categories={discovery.categories} activeCategory={category} q={q} />
        </section>

        {desktopAds.length ? (
          <section className="mx-auto mt-6 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <AdSlot placement={desktopAds[0]} adSenseClientId={settings.adSenseClientId} />
          </section>
        ) : null}

        {settings.featuredTranslatorsEnabled ? <FeaturedTranslators translators={featured} /> : null}

        {desktopAds.length > 1 ? (
          <section className="mx-auto mt-6 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <AdSlot placement={desktopAds[1]} adSenseClientId={settings.adSenseClientId} />
          </section>
        ) : null}

        <section className="mx-auto mt-8 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="font-display text-3xl font-semibold text-ink">Translator Catalog</h2>
            <p className="text-sm text-muted-ink">
              {discovery.total} result{discovery.total === 1 ? "" : "s"}
            </p>
          </div>
          <TranslatorDirectory translators={discovery.translators} />
          <div className="mt-6">
            <DiscoveryPagination
              page={discovery.page}
              totalPages={discovery.totalPages}
              q={discovery.q}
              category={discovery.category}
            />
          </div>
        </section>

        {mobileAds.length ? (
          <section className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white p-2 md:hidden">
            <AdSlot placement={mobileAds[0]} adSenseClientId={settings.adSenseClientId} />
          </section>
        ) : null}
      </main>
      <Footer platformName={settings.platformName} disclaimer={settings.footerDisclaimer} />
    </div>
  );
}
```

## components/public/translator-directory.tsx

```tsx
import Link from "next/link";

import type { PublicTranslator } from "@/lib/types";

interface TranslatorDirectoryProps {
  translators: PublicTranslator[];
}

export function TranslatorDirectory({ translators }: TranslatorDirectoryProps) {
  if (!translators.length) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center text-muted-ink">
        No active translators match your current filters.
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {translators.map((translator) => (
        <article
          key={translator.id}
          className="rounded-2xl border border-border bg-surface p-5 shadow-[0_20px_35px_-28px_rgba(17,24,39,0.18)] transition hover:border-brand-300"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <h2 className="font-display text-2xl font-semibold text-ink">
              <Link
                href={`/translators/${translator.slug}`}
                className="rounded-sm text-ink transition hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
              >
                {translator.name}
              </Link>
            </h2>
            {translator.isFeatured ? (
              <span className="rounded-full bg-brand-100 px-2 py-1 text-[11px] font-semibold text-brand-700">
                Featured
              </span>
            ) : null}
          </div>

          <p className="text-sm text-muted-ink">{translator.shortDescription}</p>

          {translator.categories.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {translator.categories.slice(0, 3).map((category) => (
                <span
                  key={`${translator.id}-${category.id}`}
                  className="rounded-full border border-border bg-muted-surface px-2 py-1 text-[11px] font-medium text-muted-ink"
                >
                  {category.name}
                </span>
              ))}
            </div>
          ) : null}

          <p className="mt-3 text-xs text-muted-ink">
            {translator.sourceLabel} to {translator.targetLabel}
          </p>
        </article>
      ))}
    </div>
  );
}
```

## components/public/discovery-search.tsx

```tsx
"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface Suggestion {
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  categoryName: string | null;
}

interface DiscoverySearchProps {
  q: string;
  category?: string;
}

export function DiscoverySearch({ q, category }: DiscoverySearchProps) {
  const [value, setValue] = useState(q);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const query = useMemo(() => value.trim(), [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!query) return;

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/translators/suggest?q=${encodeURIComponent(query)}`);
        const payload = await response.json();
        if (response.ok && payload.ok) {
          setSuggestions(payload.suggestions || []);
          setOpen(true);
        }
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div ref={containerRef} className="relative">
      <form action="/" method="GET" className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-ink" />
        <input
          name="q"
          value={value}
          onChange={(event) => {
            const nextValue = event.target.value;
            setValue(nextValue);
            if (!nextValue.trim()) {
              setSuggestions([]);
              setOpen(false);
            }
          }}
          onFocus={() => setOpen(Boolean(query))}
          placeholder="Search translators, categories, or slugs"
          className="h-12 w-full rounded-xl border border-border bg-surface pl-10 pr-24 text-sm text-ink shadow-sm"
        />
        <button
          type="submit"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
        >
          Search
        </button>
        {category ? <input type="hidden" name="category" value={category} /> : null}
        <input type="hidden" name="page" value="1" />
      </form>

      {open ? (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          {loading ? (
            <p className="px-3 py-2 text-sm text-muted-ink">Searching…</p>
          ) : suggestions.length ? (
            <ul className="max-h-72 overflow-y-auto scrollbar-thin">
              {suggestions.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/translators/${item.slug}`}
                    className="block border-b border-border/70 px-3 py-2 last:border-b-0 hover:bg-muted-surface"
                    onClick={() => setOpen(false)}
                  >
                    <p className="text-sm font-semibold text-ink">{item.name}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-ink">{item.shortDescription}</p>
                    {item.categoryName ? (
                      <p className="mt-1 text-[11px] font-medium text-brand-700">{item.categoryName}</p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-2 text-sm text-muted-ink">No matching translators found.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
```

## components/public/discovery-pagination.tsx

```tsx
import Link from "next/link";

interface DiscoveryPaginationProps {
  page: number;
  totalPages: number;
  q?: string;
  category?: string;
}

function makeHref(page: number, q?: string, category?: string) {
  const search = new URLSearchParams();
  if (q) search.set("q", q);
  if (category) search.set("category", category);
  search.set("page", String(page));

  return `/?${search.toString()}`;
}

export function DiscoveryPagination({ page, totalPages, q, category }: DiscoveryPaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const windowStart = Math.max(1, page - 2);
  const windowEnd = Math.min(totalPages, page + 2);
  const pages = Array.from({ length: windowEnd - windowStart + 1 }, (_, index) => windowStart + index);

  return (
    <nav className="flex flex-wrap items-center justify-center gap-2" aria-label="Translator pages">
      <Link
        href={makeHref(Math.max(1, page - 1), q, category)}
        className={`rounded-lg border px-3 py-2 text-sm ${
          page === 1
            ? "pointer-events-none border-border bg-muted-surface text-muted-ink"
            : "border-border bg-surface text-ink hover:border-brand-300"
        }`}
      >
        Previous
      </Link>
      {pages.map((item) => (
        <Link
          key={item}
          href={makeHref(item, q, category)}
          className={`min-w-10 rounded-lg border px-3 py-2 text-center text-sm font-medium ${
            item === page
              ? "border-brand-500 bg-brand-500 text-white"
              : "border-border bg-surface text-ink hover:border-brand-300"
          }`}
        >
          {item}
        </Link>
      ))}
      <Link
        href={makeHref(Math.min(totalPages, page + 1), q, category)}
        className={`rounded-lg border px-3 py-2 text-sm ${
          page === totalPages
            ? "pointer-events-none border-border bg-muted-surface text-muted-ink"
            : "border-border bg-surface text-ink hover:border-brand-300"
        }`}
      >
        Next
      </Link>
    </nav>
  );
}
```

## components/public/category-nav.tsx

```tsx
import Link from "next/link";

interface CategoryNavProps {
  categories: Array<{ id: string; name: string; slug: string }>;
  activeCategory?: string;
  q?: string;
}

function buildHref(params: { category?: string; q?: string }) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.category) search.set("category", params.category);
  search.set("page", "1");

  const query = search.toString();
  return query ? `/?${query}` : "/";
}

export function CategoryNav({ categories, activeCategory, q }: CategoryNavProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={buildHref({ q })}
        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
          !activeCategory
            ? "border-brand-500 bg-brand-500 text-white"
            : "border-border bg-surface text-ink hover:border-brand-300"
        }`}
      >
        All
      </Link>
      {categories.map((category) => (
        <Link
          key={category.id}
          href={buildHref({ category: category.slug, q })}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
            activeCategory === category.slug
              ? "border-brand-500 bg-brand-500 text-white"
              : "border-border bg-surface text-ink hover:border-brand-300"
          }`}
        >
          {category.name}
        </Link>
      ))}
    </div>
  );
}
```

## components/public/featured-translators.tsx

```tsx
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { PublicTranslator } from "@/lib/types";

interface FeaturedTranslatorsProps {
  translators: PublicTranslator[];
}

export function FeaturedTranslators({ translators }: FeaturedTranslatorsProps) {
  if (!translators.length) {
    return null;
  }

  return (
    <section className="mx-auto mt-8 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="rounded-3xl border border-border bg-surface p-5 shadow-[0_20px_45px_-35px_rgba(17,24,39,0.25)] sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="font-display text-2xl font-semibold text-ink">Featured Translators</h2>
          <Link href="/translators" className="text-sm font-medium text-brand-700 hover:text-brand-800">
            Browse all
          </Link>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {translators.map((translator) => (
            <Link
              key={translator.id}
              href={`/translators/${translator.slug}`}
              className="group rounded-2xl border border-border bg-muted-surface p-4 transition hover:border-brand-300 hover:bg-surface"
            >
              <h3 className="font-semibold text-ink">{translator.name}</h3>
              <p className="mt-1 text-sm text-muted-ink">{translator.shortDescription}</p>
              {translator.primaryCategory ? (
                <p className="mt-2 text-xs font-medium text-brand-700">{translator.primaryCategory.name}</p>
              ) : null}
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-700">
                Open translator
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
```

## components/sections/navbar.tsx

```tsx
import Link from "next/link";
import { LayoutGrid, Shield } from "lucide-react";

import { RequestTranslatorModal } from "@/components/public/request-translator-modal";
import { APP_NAME } from "@/lib/constants";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-sm font-black text-white shadow-sm transition group-hover:bg-brand-600">
            SP
          </span>
          <span className="font-display text-xl font-semibold tracking-tight text-ink">{APP_NAME}</span>
        </Link>

        <nav className="flex items-center gap-2 sm:gap-3">
          <RequestTranslatorModal
            triggerLabel="Request"
            triggerClassName="inline-flex h-9 items-center rounded-lg border border-border bg-muted-surface px-2.5 text-sm font-medium text-ink transition hover:border-brand-300 hover:bg-surface"
          />
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-ink transition hover:bg-muted-surface hover:text-ink"
          >
            <LayoutGrid className="h-4 w-4" />
            Discover
          </Link>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-ink transition hover:bg-muted-surface hover:text-ink"
          >
            <Shield className="h-4 w-4" />
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}
```

## components/sections/footer.tsx

```tsx
import { RequestTranslatorModal } from "@/components/public/request-translator-modal";

interface FooterProps {
  platformName: string;
  disclaimer: string;
}

export function Footer({ platformName, disclaimer }: FooterProps) {
  return (
    <footer className="border-t border-border bg-white/70 py-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 text-center text-sm text-muted-ink sm:px-6 lg:px-8">
        <div className="mb-1 flex justify-center">
          <RequestTranslatorModal
            triggerLabel="Request a translator"
            triggerClassName="inline-flex h-10 items-center rounded-xl border border-border bg-muted-surface px-4 text-sm font-semibold text-ink transition hover:border-brand-300 hover:bg-surface"
          />
        </div>
        <p>{disclaimer}</p>
        <p>Built for style discovery, experimentation, and high-velocity drafting workflows.</p>
        <p className="text-xs text-muted-ink/80">{platformName} platform admin dashboard enabled.</p>
      </div>
    </footer>
  );
}
```

## components/admin/admin-sidebar.tsx

```tsx
import Link from "next/link";
import {
  BarChart3,
  Cog,
  FolderTree,
  LayoutTemplate,
  MessageSquareText,
  PlusSquare,
  ScrollText,
  Sparkles,
} from "lucide-react";

const links = [
  { href: "/admin", label: "Overview", icon: BarChart3 },
  { href: "/admin/translators", label: "Translators", icon: Sparkles },
  { href: "/admin/translators/new", label: "Create Translator", icon: PlusSquare },
  { href: "/admin/translators/ai/new", label: "Create With AI", icon: Sparkles },
  { href: "/admin/categories", label: "Categories", icon: FolderTree },
  { href: "/admin/requests", label: "Requests", icon: MessageSquareText },
  { href: "/admin/ads", label: "Monetization", icon: LayoutTemplate },
  { href: "/admin/settings", label: "Settings", icon: Cog },
  { href: "/admin/logs", label: "Logs", icon: ScrollText },
];

export function AdminSidebar() {
  return (
    <aside className="hidden w-72 border-r border-border bg-white p-5 lg:block">
      <Link href="/admin" className="mb-8 flex items-center gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-sm font-black text-white shadow-sm">
          SP
        </span>
        <div>
          <p className="font-display text-lg font-semibold text-ink">StylePort</p>
          <p className="text-xs text-muted-ink">Admin Console</p>
        </div>
      </Link>

      <nav className="space-y-1">
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted-ink transition hover:bg-muted-surface hover:text-ink"
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

export function AdminMobileNav() {
  return (
    <nav className="flex gap-2 overflow-x-auto border-b border-border bg-white px-4 py-2 lg:hidden">
      {links.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-muted-surface px-3 py-1.5 text-xs font-medium text-muted-ink"
        >
          <item.icon className="h-3.5 w-3.5" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
```

## app/(admin)/admin/translators/page.tsx

```tsx
import Link from "next/link";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { TranslatorTable } from "@/components/admin/translator-table";
import { listAdminTranslators } from "@/lib/data/translators";
import { getCategoryChoices } from "@/lib/data/categories";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ q?: string; status?: string; featured?: string; category?: string }>;
}

export default async function AdminTranslatorsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const [translators, categories] = await Promise.all([
    listAdminTranslators({
      q: params.q,
      status:
        params.status === "active" || params.status === "inactive" || params.status === "archived"
          ? params.status
          : "all",
      featured:
        params.featured === "featured" || params.featured === "non-featured"
          ? params.featured
          : "all",
      category: params.category || undefined,
    }),
    getCategoryChoices(),
  ]);

  return (
    <>
      <AdminTopbar title="Translators" subtitle="Manage translator profiles, categories, and runtime behavior." />
      <main className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/translators/new"
            className="inline-flex rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
            Create translator
          </Link>
          <Link
            href="/admin/translators/ai/new"
            className="inline-flex rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:border-brand-300 hover:bg-muted-surface"
          >
            Create with AI
          </Link>
        </div>

        <form className="grid gap-2 rounded-2xl border border-border bg-white p-4 md:grid-cols-[1fr_170px_170px_190px_auto]">
          <input
            type="text"
            name="q"
            defaultValue={params.q || ""}
            placeholder="Search by name or slug"
            className="h-11 rounded-xl border border-border px-3"
          />
          <select
            name="status"
            defaultValue={params.status || "all"}
            className="h-11 rounded-xl border border-border px-3"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
          <select
            name="featured"
            defaultValue={params.featured || "all"}
            className="h-11 rounded-xl border border-border px-3"
          >
            <option value="all">All featured states</option>
            <option value="featured">Featured</option>
            <option value="non-featured">Non-featured</option>
          </select>
          <select
            name="category"
            defaultValue={params.category || ""}
            className="h-11 rounded-xl border border-border px-3"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-11 rounded-xl bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600"
          >
            Filter
          </button>
        </form>

        <TranslatorTable translators={translators} />
      </main>
    </>
  );
}
```

## app/(admin)/admin/translators/new/page.tsx

```tsx
import Link from "next/link";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { TranslatorForm } from "@/components/admin/translator-form";
import { getCategoryChoices } from "@/lib/data/categories";
import { getAvailableModels } from "@/lib/model-catalog";

export const dynamic = "force-dynamic";

export default async function AdminTranslatorCreatePage() {
  const [categories, modelOptions] = await Promise.all([getCategoryChoices(), getAvailableModels()]);

  return (
    <>
      <AdminTopbar title="Create Translator" subtitle="Define prompts, categories, models, and public UX behavior." />
      <main className="p-4 sm:p-6">
        <div className="mb-4">
          <Link
            href="/admin/translators/ai/new"
            className="inline-flex rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:border-brand-300 hover:bg-muted-surface"
          >
            Create with AI instead
          </Link>
        </div>
        <TranslatorForm mode="create" categories={categories} modelOptions={modelOptions} />
      </main>
    </>
  );
}
```

## components/translator/seed-buttons.tsx

```tsx
import { Button } from "@/components/ui/button";
import type { PublicExample } from "@/lib/types";

interface SeedButtonsProps {
  examples: PublicExample[];
  onSelect: (value: string) => void;
}

export function SeedButtons({ examples, onSelect }: SeedButtonsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {examples.map((seed) => (
        <Button
          key={`${seed.label}-${seed.sortOrder}`}
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-full border border-border bg-surface text-muted-ink hover:border-brand-300 hover:bg-muted-surface"
          onClick={() => onSelect(seed.value)}
        >
          {seed.label}
        </Button>
      ))}
    </div>
  );
}
```

## components/translator/mode-selector.tsx

```tsx
import { WandSparkles } from "lucide-react";

import { Select } from "@/components/ui/select";
import type { PublicMode } from "@/lib/types";

interface ModeSelectorProps {
  value: string;
  modes: PublicMode[];
  onChange: (modeKey: string) => void;
}

export function ModeSelector({ value, modes, onChange }: ModeSelectorProps) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-muted-ink">
      <WandSparkles className="h-4 w-4 text-brand-600" />
      <span className="hidden sm:inline">Mode</span>
      <Select
        aria-label="Translation mode"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        options={modes.map((mode) => ({
          value: mode.key,
          label: mode.label,
        }))}
        className="min-w-[220px]"
      />
    </label>
  );
}
```

## components/admin/login-form.tsx

```tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/toast-provider";

export function LoginForm() {
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("ChangeMe123!");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  const callbackUrl = searchParams.get("callbackUrl") || "/admin";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    });

    setLoading(false);

    if (!result || result.error) {
      setError("Invalid credentials. Please try again.");
      return;
    }

    toast({ title: "Welcome back", description: "Redirecting to admin dashboard." });
    router.push(result.url || callbackUrl);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-muted-ink">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
          required
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-muted-ink">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
          required
        />
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
```

## components/admin/confirm-dialog.tsx

```tsx
"use client";

import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: "danger" | "default";
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  variant = "danger",
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/45 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <p className="mt-2 text-sm text-muted-ink">{description}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={variant === "danger" ? "secondary" : "default"}
            className={variant === "danger" ? "bg-red-600 text-white hover:bg-red-700" : undefined}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

## components/ui/button.tsx

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-brand-500 text-white shadow-sm hover:bg-brand-600 active:scale-[0.99]",
        outline:
          "border border-border bg-white text-ink hover:bg-muted-surface",
        ghost: "text-muted-ink hover:bg-muted-surface",
        secondary: "bg-ink text-white hover:bg-brand-700",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-11 px-6 text-sm",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
```

## components/ui/card.tsx

```tsx
import * as React from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-border bg-surface shadow-[0_20px_45px_-30px_rgba(17,24,39,0.22)] backdrop-blur",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 py-4", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 pb-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 pb-6 pt-2", className)} {...props} />;
}
```

## components/ui/select.tsx

```tsx
import * as React from "react";

import { cn } from "@/lib/utils";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: Array<{ value: string; label: string }>;
}

export function Select({ className, options, ...props }: SelectProps) {
  return (
      <select
        className={cn(
          "h-10 rounded-xl border border-border bg-surface px-3 text-sm text-ink shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60",
          className,
        )}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
```

## components/ui/textarea.tsx

```tsx
import * as React from "react";

import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[180px] w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
```

## components/admin/ad-table.tsx

```tsx
"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useToast } from "@/components/providers/toast-provider";

interface AdRow {
  id: string;
  name: string;
  key: string;
  pageType: string;
  deviceType: string;
  providerType: string;
  isActive: boolean;
  archivedAt: string | null;
  category: { id: string; name: string; slug: string } | null;
}

interface AdTableProps {
  ads: AdRow[];
}

type ConfirmState =
  | { type: "archive"; id: string }
  | { type: "unarchive"; id: string }
  | { type: "hard-delete"; id: string }
  | null;

export function AdTable({ ads }: AdTableProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const current = confirm ? ads.find((item) => item.id === confirm.id) : null;

  async function run(mode: "archive" | "unarchive" | "hard") {
    if (!confirm) return;

    setBusyId(confirm.id);
    const response = await fetch(`/api/admin/ads/${confirm.id}?mode=${mode}`, {
      method: "DELETE",
    });
    const payload = await response.json();
    setBusyId(null);
    setConfirm(null);

    if (!response.ok || !payload.ok) {
      toast({ title: "Action failed", description: payload?.error?.message || "Please retry.", variant: "error" });
      return;
    }

    router.refresh();
  }

  if (!ads.length) {
    return (
      <div className="rounded-2xl border border-border bg-white p-10 text-center text-sm text-muted-ink">
        No ad placements found.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-muted-surface text-left text-muted-ink">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Key</th>
              <th className="px-4 py-3 font-medium">Targeting</th>
              <th className="px-4 py-3 font-medium">Provider</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ads.map((row) => {
              const archived = Boolean(row.archivedAt);
              const busy = busyId === row.id;

              return (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium text-ink">{row.name}</td>
                  <td className="px-4 py-3 text-muted-ink">{row.key}</td>
                  <td className="px-4 py-3 text-muted-ink">
                    {row.pageType} / {row.deviceType}
                    {row.category ? ` / ${row.category.name}` : ""}
                  </td>
                  <td className="px-4 py-3 text-muted-ink">{row.providerType}</td>
                  <td className="px-4 py-3">
                    {archived ? (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                        Archived
                      </span>
                    ) : row.isActive ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-muted-surface px-2 py-1 text-xs font-medium text-muted-ink">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/admin/ads/${row.id}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-ink hover:bg-muted-surface"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setConfirm({ type: archived ? "unarchive" : "archive", id: row.id })}
                      >
                        {archived ? "Unarchive" : "Archive"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-300 text-red-700 hover:bg-red-50"
                        disabled={busy}
                        onClick={() => setConfirm({ type: "hard-delete", id: row.id })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm?.type === "hard-delete"
            ? "Permanently delete ad placement?"
            : confirm?.type === "archive"
              ? "Archive ad placement?"
              : "Unarchive ad placement?"
        }
        description={
          confirm?.type === "hard-delete"
            ? `Delete ${current?.name || "this placement"} forever?`
            : confirm?.type === "archive"
              ? `Archive ${current?.name || "this placement"}?`
              : `Unarchive ${current?.name || "this placement"}?`
        }
        confirmLabel={
          confirm?.type === "hard-delete"
            ? "Delete forever"
            : confirm?.type === "archive"
              ? "Archive"
              : "Unarchive"
        }
        onCancel={() => setConfirm(null)}
        onConfirm={() => void run(confirm?.type === "hard-delete" ? "hard" : confirm?.type || "archive")}
        variant={confirm?.type === "hard-delete" ? "danger" : "default"}
      />
    </>
  );
}
```

## components/admin/category-table.tsx

```tsx
"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useToast } from "@/components/providers/toast-provider";
import { formatDateTime } from "@/lib/utils";

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  sortOrder: number;
  archivedAt: string | null;
  updatedAt: string;
  _count: {
    translators: number;
    adPlacements: number;
  };
}

interface CategoryTableProps {
  categories: CategoryRow[];
}

type ConfirmState =
  | { type: "archive"; id: string }
  | { type: "unarchive"; id: string }
  | { type: "hard-delete"; id: string }
  | null;

export function CategoryTable({ categories }: CategoryTableProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const current = confirm ? categories.find((item) => item.id === confirm.id) : null;

  async function run(mode: "archive" | "unarchive" | "hard") {
    if (!confirm) return;

    setBusyId(confirm.id);
    const response = await fetch(`/api/admin/categories/${confirm.id}?mode=${mode}`, {
      method: "DELETE",
    });
    const payload = await response.json();
    setBusyId(null);
    setConfirm(null);

    if (!response.ok || !payload.ok) {
      toast({ title: "Action failed", description: payload?.error?.message || "Please retry.", variant: "error" });
      return;
    }

    router.refresh();
  }

  if (!categories.length) {
    return (
      <div className="rounded-2xl border border-border bg-white p-10 text-center text-sm text-muted-ink">
        No categories found.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-muted-surface text-left text-muted-ink">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Translators</th>
              <th className="px-4 py-3 font-medium">Ads</th>
              <th className="px-4 py-3 font-medium">Updated</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {categories.map((row) => {
              const archived = Boolean(row.archivedAt);
              const busy = busyId === row.id;

              return (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium text-ink">{row.name}</td>
                  <td className="px-4 py-3 text-muted-ink">/{row.slug}</td>
                  <td className="px-4 py-3">
                    {archived ? (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                        Archived
                      </span>
                    ) : row.isActive ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-muted-surface px-2 py-1 text-xs font-medium text-muted-ink">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink">{row._count.translators}</td>
                  <td className="px-4 py-3 text-ink">{row._count.adPlacements}</td>
                  <td className="px-4 py-3 text-muted-ink">{formatDateTime(row.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/admin/categories/${row.id}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-ink hover:bg-muted-surface"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setConfirm({ type: archived ? "unarchive" : "archive", id: row.id })}
                      >
                        {archived ? "Unarchive" : "Archive"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-300 text-red-700 hover:bg-red-50"
                        disabled={busy}
                        onClick={() => setConfirm({ type: "hard-delete", id: row.id })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm?.type === "hard-delete"
            ? "Permanently delete category?"
            : confirm?.type === "archive"
              ? "Archive category?"
              : "Unarchive category?"
        }
        description={
          confirm?.type === "hard-delete"
            ? `Delete ${current?.name || "this category"} forever?`
            : confirm?.type === "archive"
              ? `Archive ${current?.name || "this category"}?`
              : `Unarchive ${current?.name || "this category"}?`
        }
        confirmLabel={
          confirm?.type === "hard-delete"
            ? "Delete forever"
            : confirm?.type === "archive"
              ? "Archive"
              : "Unarchive"
        }
        onCancel={() => setConfirm(null)}
        onConfirm={() => void run(confirm?.type === "hard-delete" ? "hard" : confirm?.type || "archive")}
        variant={confirm?.type === "hard-delete" ? "danger" : "default"}
      />
    </>
  );
}
```

## components/admin/translator-table.tsx

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Copy, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/toast-provider";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import type { TranslatorListItem } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

interface TranslatorTableProps {
  translators: TranslatorListItem[];
}

type ConfirmState =
  | { type: "archive"; id: string }
  | { type: "unarchive"; id: string }
  | { type: "hard-delete"; id: string }
  | null;

export function TranslatorTable({ translators }: TranslatorTableProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const target = useMemo(
    () => (confirm ? translators.find((item) => item.id === confirm.id) || null : null),
    [confirm, translators],
  );

  async function runAction(id: string, action: () => Promise<Response>) {
    setBusyId(id);
    try {
      const response = await action();
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        toast({
          title: "Action failed",
          description: payload?.error?.message || "Please try again.",
          variant: "error",
        });
        return;
      }

      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function duplicate(id: string) {
    await runAction(id, () =>
      fetch(`/api/admin/translators/${id}/duplicate`, {
        method: "POST",
      }),
    );
    toast({ title: "Translator duplicated", description: "A draft copy has been created." });
  }

  async function toggleActive(id: string) {
    await runAction(id, () =>
      fetch(`/api/admin/translators/${id}/toggle-active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
  }

  async function runConfirm() {
    if (!confirm) {
      return;
    }

    const mode = confirm.type === "hard-delete" ? "hard" : confirm.type;

    await runAction(confirm.id, () =>
      fetch(`/api/admin/translators/${confirm.id}?mode=${mode}`, {
        method: "DELETE",
      }),
    );

    setConfirm(null);
  }

  if (!translators.length) {
    return (
      <div className="rounded-2xl border border-border bg-white p-10 text-center text-sm text-muted-ink">
        No translators found for the selected filters.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-border bg-white">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted-surface text-left text-muted-ink">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Categories</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Featured</th>
              <th className="px-4 py-3 font-medium">Updated</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {translators.map((row) => {
              const isBusy = busyId === row.id;
              const isArchived = Boolean(row.archivedAt);

              return (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium text-ink">{row.name}</td>
                  <td className="px-4 py-3 text-muted-ink">/{row.slug}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {row.categories.length ? (
                        row.categories.map((category) => (
                          <span
                            key={`${row.id}-${category.id}`}
                            className="rounded-full border border-border bg-muted-surface px-2 py-0.5 text-[11px] text-muted-ink"
                          >
                            {category.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted-ink">Uncategorized</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {isArchived ? (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                        Archived
                      </span>
                    ) : row.isActive ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-muted-surface px-2 py-1 text-xs font-medium text-muted-ink">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.isFeatured ? (
                      <span className="rounded-full bg-brand-100 px-2 py-1 text-xs font-medium text-brand-700">
                        Featured
                      </span>
                    ) : (
                      <span className="text-muted-ink">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-ink">{formatDateTime(row.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/admin/translators/${row.id}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-medium text-ink hover:bg-muted-surface"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Link>
                      <Button size="sm" variant="outline" onClick={() => duplicate(row.id)} disabled={isBusy}>
                        <Copy className="h-3.5 w-3.5" />
                        Duplicate
                      </Button>
                      {!isArchived ? (
                        <Button size="sm" variant="outline" onClick={() => toggleActive(row.id)} disabled={isBusy}>
                          {row.isActive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          {row.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirm({ type: isArchived ? "unarchive" : "archive", id: row.id })}
                        disabled={isBusy}
                      >
                        {isArchived ? "Unarchive" : "Archive"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-300 text-red-700 hover:bg-red-50"
                        onClick={() => setConfirm({ type: "hard-delete", id: row.id })}
                        disabled={isBusy}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm?.type === "hard-delete"
            ? "Permanently delete translator?"
            : confirm?.type === "archive"
              ? "Archive translator?"
              : "Unarchive translator?"
        }
        description={
          confirm?.type === "hard-delete"
            ? `This will permanently remove ${target?.name || "this translator"} and all related modes, examples, and logs.`
            : confirm?.type === "archive"
              ? `This hides ${target?.name || "this translator"} from public routes.`
              : `This restores ${target?.name || "this translator"} to public availability.`
        }
        confirmLabel={
          confirm?.type === "hard-delete"
            ? "Delete forever"
            : confirm?.type === "archive"
              ? "Archive"
              : "Unarchive"
        }
        onCancel={() => setConfirm(null)}
        onConfirm={() => void runConfirm()}
        variant={confirm?.type === "hard-delete" ? "danger" : "default"}
      />
    </>
  );
}
```

## tests/request-features.test.ts

```ts
import { describe, expect, it, vi } from "vitest";

import { verifyTurnstileToken } from "@/lib/turnstile";
import { aiDraftInputSchema, translatorDraftSchema, translatorRequestSchema } from "@/lib/validators";

describe("translatorRequestSchema", () => {
  it("accepts valid public request payload", () => {
    const parsed = translatorRequestSchema.safeParse({
      requestedName: "Startup Pitch Polisher",
      description: "Rewrite rough pitch text into concise investor-ready copy.",
      exampleInput: "we make AI for stores",
      desiredStyle: "crisp and confident",
      suggestedCategory: "Professional",
      audience: "founders",
      requesterEmail: "founder@example.com",
      notes: "Keep outputs short",
      honeypot: "",
      turnstileToken: "token",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects honeypot values", () => {
    const parsed = translatorRequestSchema.safeParse({
      requestedName: "Idea",
      description: "Some long enough request description for this test case.",
      honeypot: "i am a bot",
    });

    expect(parsed.success).toBe(false);
  });
});

describe("translatorDraftSchema", () => {
  it("validates a structured AI draft", () => {
    const parsed = translatorDraftSchema.safeParse({
      name: "Pitch Polisher",
      slug: "pitch-polisher",
      title: "Sharpen Startup Pitches",
      subtitle: "Turn rough ideas into investor-ready messaging.",
      shortDescription: "Polish startup pitch text quickly.",
      sourceLabel: "Rough Pitch",
      targetLabel: "Refined Pitch",
      systemPrompt: "You are a startup storytelling expert who rewrites text with clarity and accuracy.",
      promptInstructions: "Preserve meaning and facts while improving structure and confidence.",
      seoTitle: "Pitch Polisher Translator",
      seoDescription: "Rewrite startup pitch drafts into concise investor-ready language.",
      categorySuggestion: "Professional",
      modes: [
        {
          key: "classic",
          label: "Classic",
          description: "Balanced output",
          instruction: "Use concise, polished business tone.",
          sortOrder: 1,
        },
      ],
      examples: [
        {
          label: "Pitch",
          value: "we make tools for teams",
          sortOrder: 1,
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });
});

describe("aiDraftInputSchema", () => {
  it("requires key fields", () => {
    const parsed = aiDraftInputSchema.safeParse({
      idea: "",
      description: "short",
    });

    expect(parsed.success).toBe(false);
  });
});

describe("verifyTurnstileToken", () => {
  it("skips verification in development when secret is missing", async () => {
    const previous = process.env.TURNSTILE_SECRET_KEY;
    const previousEnv = process.env.NODE_ENV;
    delete process.env.TURNSTILE_SECRET_KEY;
    process.env.NODE_ENV = "development";

    const result = await verifyTurnstileToken({ token: "" });
    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);

    process.env.TURNSTILE_SECRET_KEY = previous;
    process.env.NODE_ENV = previousEnv;
  });

  it("fails when provider returns unsuccessful result", async () => {
    const previous = process.env.TURNSTILE_SECRET_KEY;
    const previousEnv = process.env.NODE_ENV;
    process.env.TURNSTILE_SECRET_KEY = "secret";
    process.env.NODE_ENV = "production";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyTurnstileToken({ token: "bad-token" });
    expect(result.success).toBe(false);

    vi.unstubAllGlobals();
    process.env.TURNSTILE_SECRET_KEY = previous;
    process.env.NODE_ENV = previousEnv;
  });
});
```

## tests/translator-directory.test.tsx

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TranslatorDirectory } from "@/components/public/translator-directory";
import type { PublicTranslator } from "@/lib/types";

const translators: PublicTranslator[] = [
  {
    id: "1",
    name: "Regal Rewrite",
    slug: "regal-rewrite",
    title: "Regal",
    subtitle: "Sub",
    shortDescription: "Desc",
    sourceLabel: "Plain",
    targetLabel: "Fancy",
    seoTitle: null,
    seoDescription: null,
    isFeatured: true,
    iconName: null,
    showModeSelector: false,
    showSwap: false,
    showExamples: false,
    primaryCategory: null,
    categories: [
      {
        id: "c1",
        name: "Fancy",
        slug: "fancy",
      },
    ],
    modes: [],
    examples: [],
  },
];

describe("TranslatorDirectory", () => {
  it("uses title links and no open button", () => {
    render(<TranslatorDirectory translators={translators} />);

    const titleLink = screen.getByRole("link", { name: "Regal Rewrite" });
    expect(titleLink).toHaveAttribute("href", "/translators/regal-rewrite");

    expect(screen.queryByRole("link", { name: /open translator/i })).toBeNull();
  });
});
```

