# Project Tree

```text
.env
.env.example
.env.local
.gitignore
.prettierignore
.prettierrc.json
README.md
app/(admin)/admin/ads/[id]/page.tsx
app/(admin)/admin/ads/new/page.tsx
app/(admin)/admin/ads/page.tsx
app/(admin)/admin/categories/[id]/page.tsx
app/(admin)/admin/categories/new/page.tsx
app/(admin)/admin/categories/page.tsx
app/(admin)/admin/layout.tsx
app/(admin)/admin/logs/page.tsx
app/(admin)/admin/page.tsx
app/(admin)/admin/settings/page.tsx
app/(admin)/admin/translators/[id]/page.tsx
app/(admin)/admin/translators/new/page.tsx
app/(admin)/admin/translators/page.tsx
app/(public)/login/page.tsx
app/(public)/page.tsx
app/(public)/translators/[slug]/page.tsx
app/(public)/translators/page.tsx
app/api/admin/ads/[id]/route.ts
app/api/admin/ads/route.ts
app/api/admin/analytics/route.ts
app/api/admin/categories/[id]/route.ts
app/api/admin/categories/route.ts
app/api/admin/models/route.ts
app/api/admin/settings/route.ts
app/api/admin/translators/[id]/duplicate/route.ts
app/api/admin/translators/[id]/route.ts
app/api/admin/translators/[id]/toggle-active/route.ts
app/api/admin/translators/route.ts
app/api/auth/[...nextauth]/route.ts
app/api/ocr/route.ts
app/api/translate/route.ts
app/api/translators/suggest/route.ts
app/globals.css
app/icon.svg
app/layout.tsx
auth.ts
components/admin/ad-form.tsx
components/admin/ad-table.tsx
components/admin/admin-shell.tsx
components/admin/admin-sidebar.tsx
components/admin/admin-topbar.tsx
components/admin/category-form.tsx
components/admin/category-table.tsx
components/admin/confirm-dialog.tsx
components/admin/kpi-card.tsx
components/admin/login-form.tsx
components/admin/logout-button.tsx
components/admin/settings-form.tsx
components/admin/translator-form.tsx
components/admin/translator-table.tsx
components/providers/toast-provider.tsx
components/public/category-nav.tsx
components/public/discovery-pagination.tsx
components/public/discovery-search.tsx
components/public/featured-translators.tsx
components/public/translator-directory.tsx
components/sections/faq.tsx
components/sections/footer.tsx
components/sections/hero.tsx
components/sections/how-it-works.tsx
components/sections/navbar.tsx
components/shared/ad-slot.tsx
components/translator/mode-selector.tsx
components/translator/seed-buttons.tsx
components/translator/translator-card.tsx
components/translator/upload-image-button.tsx
components/ui/button.tsx
components/ui/card.tsx
components/ui/select.tsx
components/ui/textarea.tsx
eslint.config.mjs
hooks/use-auto-resize.ts
hooks/use-local-storage.ts
lib/actions/auth-actions.ts
lib/api-response.ts
lib/auth.ts
lib/constants.ts
lib/data/ads.ts
lib/data/categories.ts
lib/data/translators.ts
lib/model-catalog.ts
lib/ocr.ts
lib/openai.ts
lib/permissions.ts
lib/pricing.ts
lib/prisma.ts
lib/prompt-builder.ts
lib/prompts.ts
lib/rate-limit.ts
lib/settings.ts
lib/slug.ts
lib/slugify.ts
lib/types.ts
lib/utils.ts
lib/validators.ts
middleware.ts
next-env.d.ts
next.config.ts
package-lock.json
package.json
postcss.config.mjs
prisma/migrations/20260419233000_init/migration.sql
prisma/migrations/20260420010000_styleport_upgrade/migration.sql
prisma/migrations/migration_lock.toml
prisma/schema.prisma
prisma/seed.ts
public/og-image.svg
tests/prompts.test.ts
tests/slug.test.ts
tests/translate-route.test.ts
tests/translator-card.test.tsx
tests/validators.test.ts
tsconfig.json
types/next-auth.d.ts
vitest.config.ts
vitest.setup.ts
```

## .env

```text
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/styleport
NEXTAUTH_SECRET=replace-with-strong-random-secret
NEXTAUTH_URL=http://localhost:3000
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
NEXT_PUBLIC_APP_NAME=StylePort
ADMIN_SEED_EMAIL=admin@example.com
ADMIN_SEED_PASSWORD=ChangeMe123!
```

## .env.example

```text
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
```

## .env.local

```text
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/styleport
NEXTAUTH_SECRET=replace-with-strong-random-secret
NEXTAUTH_URL=http://localhost:3000
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
NEXT_PUBLIC_APP_NAME=StylePort
ADMIN_SEED_EMAIL=admin@example.com
ADMIN_SEED_PASSWORD=ChangeMe123!
```

## .gitignore

```text
# See https://help.github.com/articles/ignoring-files/ for more about ignoring files.

# dependencies
/node_modules
/.pnp
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/versions

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# env files (can opt-in for committing if needed)
.env*

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts
```

## .prettierignore

```text
.next
node_modules
coverage
```

## .prettierrc.json

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

## README.md

```md
# StylePort Platform

StylePort is a production-ready multi-translator discovery platform.

It includes:
- Public translator catalog with category filters, search autosuggest, featured modules, and pagination
- Dynamic translator pages driven by database configuration
- Secure admin dashboard for translators, categories, settings, analytics, and monetization placements
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
- `/admin/categories` CRUD + archive/unarchive + hard delete
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
```

Notes:
- Keep `OPENAI_API_KEY` server-side only.
- Set a strong `NEXTAUTH_SECRET`.
- Change seeded admin credentials after first login.

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
- `GET/POST /api/admin/categories`
- `GET/PATCH/DELETE /api/admin/categories/[id]`
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

## app/(admin)/admin/ads/[id]/page.tsx

```tsx
import { notFound } from "next/navigation";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { AdForm } from "@/components/admin/ad-form";
import { getAdById } from "@/lib/data/ads";
import { getCategoryChoices } from "@/lib/data/categories";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminAdEditPage({ params }: PageProps) {
  const { id } = await params;
  const [ad, categories] = await Promise.all([getAdById(id), getCategoryChoices()]);

  if (!ad) {
    notFound();
  }

  return (
    <>
      <AdminTopbar title={`Edit: ${ad.name}`} subtitle="Update placement settings and activation state." />
      <main className="p-4 sm:p-6">
        <AdForm
          mode="edit"
          categories={categories}
          initial={{
            id: ad.id,
            name: ad.name,
            key: ad.key,
            description: ad.description,
            pageType: ad.pageType,
            deviceType: ad.deviceType,
            placementType: ad.placementType,
            providerType: ad.providerType,
            adSenseSlot: ad.adSenseSlot,
            codeSnippet: ad.codeSnippet,
            categoryId: ad.categoryId,
            isActive: ad.isActive,
            sortOrder: ad.sortOrder,
            archivedAt: ad.archivedAt ? ad.archivedAt.toISOString() : null,
          }}
        />
      </main>
    </>
  );
}
```

## app/(admin)/admin/ads/new/page.tsx

```tsx
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { AdForm } from "@/components/admin/ad-form";
import { getCategoryChoices } from "@/lib/data/categories";

export const dynamic = "force-dynamic";

export default async function AdminAdCreatePage() {
  const categories = await getCategoryChoices();

  return (
    <>
      <AdminTopbar title="Create Ad Placement" subtitle="Define where and how this slot appears." />
      <main className="p-4 sm:p-6">
        <AdForm mode="create" categories={categories} />
      </main>
    </>
  );
}
```

## app/(admin)/admin/ads/page.tsx

```tsx
import Link from "next/link";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { AdTable } from "@/components/admin/ad-table";
import { listAdminAds } from "@/lib/data/ads";

export const dynamic = "force-dynamic";

export default async function AdminAdsPage() {
  const ads = await listAdminAds();

  return (
    <>
      <AdminTopbar title="Monetization" subtitle="Manage ad placements and targeting rules." />
      <main className="space-y-4 p-4 sm:p-6">
        <div>
          <Link
            href="/admin/ads/new"
            className="inline-flex rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            Create placement
          </Link>
        </div>
        <AdTable ads={ads} />
      </main>
    </>
  );
}
```

## app/(admin)/admin/categories/[id]/page.tsx

```tsx
import { notFound } from "next/navigation";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { CategoryForm } from "@/components/admin/category-form";
import { getAdminCategoryById } from "@/lib/data/categories";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminCategoryEditPage({ params }: PageProps) {
  const { id } = await params;
  const category = await getAdminCategoryById(id);

  if (!category) {
    notFound();
  }

  return (
    <>
      <AdminTopbar title={`Edit: ${category.name}`} subtitle="Update category behavior and metadata." />
      <main className="p-4 sm:p-6">
        <CategoryForm
          mode="edit"
          initial={{
            id: category.id,
            name: category.name,
            slug: category.slug,
            description: category.description,
            sortOrder: category.sortOrder,
            isActive: category.isActive,
            iconKey: category.iconKey,
            seoTitle: category.seoTitle,
            seoDescription: category.seoDescription,
            archivedAt: category.archivedAt ? category.archivedAt.toISOString() : null,
          }}
        />
      </main>
    </>
  );
}
```

## app/(admin)/admin/categories/new/page.tsx

```tsx
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { CategoryForm } from "@/components/admin/category-form";

export const dynamic = "force-dynamic";

export default function AdminCategoryCreatePage() {
  return (
    <>
      <AdminTopbar title="Create Category" subtitle="Add a new translator discovery category." />
      <main className="p-4 sm:p-6">
        <CategoryForm mode="create" />
      </main>
    </>
  );
}
```

## app/(admin)/admin/categories/page.tsx

```tsx
import Link from "next/link";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { CategoryTable } from "@/components/admin/category-table";
import { listAdminCategories } from "@/lib/data/categories";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  const categories = await listAdminCategories();

  return (
    <>
      <AdminTopbar title="Categories" subtitle="Manage discovery categories and taxonomy metadata." />
      <main className="space-y-4 p-4 sm:p-6">
        <div>
          <Link
            href="/admin/categories/new"
            className="inline-flex rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            Create category
          </Link>
        </div>
        <CategoryTable categories={categories} />
      </main>
    </>
  );
}
```

## app/(admin)/admin/layout.tsx

```tsx
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AdminShell } from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/admin");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/");
  }

  return <AdminShell>{children}</AdminShell>;
}
```

## app/(admin)/admin/logs/page.tsx

```tsx
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { getRecentTranslationLogs } from "@/lib/data/translators";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

function formatCurrency(value: number | null) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 5,
  }).format(Number(value || 0));
}

export default async function AdminLogsPage() {
  const logs = await getRecentTranslationLogs(120);

  return (
    <>
      <AdminTopbar
        title="Translation Logs"
        subtitle="Recent translation activity, usage metrics, and estimated spend."
      />
      <main className="p-4 sm:p-6">
        <div className="overflow-x-auto rounded-2xl border border-border bg-white">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted-surface text-left text-muted-ink">
              <tr>
                <th className="px-4 py-3 font-medium">Translator</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Model</th>
                <th className="px-4 py-3 font-medium">Tokens</th>
                <th className="px-4 py-3 font-medium">Spend</th>
                <th className="px-4 py-3 font-medium">Latency</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{log.translator.name}</p>
                    <p className="text-xs text-muted-ink">/{log.translator.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        log.status === "SUCCESS"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-ink">{log.model || "-"}</td>
                  <td className="px-4 py-3 text-muted-ink">{log.totalTokens || 0}</td>
                  <td className="px-4 py-3 text-muted-ink">{formatCurrency(Number(log.estimatedCost || 0))}</td>
                  <td className="px-4 py-3 text-muted-ink">{log.latencyMs ? `${log.latencyMs}ms` : "-"}</td>
                  <td className="px-4 py-3 text-muted-ink">{formatDateTime(log.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
```

## app/(admin)/admin/page.tsx

```tsx
import Link from "next/link";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { KpiCard } from "@/components/admin/kpi-card";
import { getAdminOverviewStats } from "@/lib/data/translators";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  }).format(value);
}

export default async function AdminOverviewPage() {
  const stats = await getAdminOverviewStats(30);
  const maxUsage = Math.max(1, ...stats.series.map((item) => item.translations));

  return (
    <>
      <AdminTopbar
        title="Platform Overview"
        subtitle="Track usage, costs, and top-performing translators over the last 30 days."
      />
      <main className="space-y-6 p-4 sm:p-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Translations (30d)" value={stats.kpis.totalTranslations} />
          <KpiCard label="Total Tokens" value={stats.kpis.totalTokens} />
          <KpiCard label="Estimated Spend" value={formatCurrency(stats.kpis.estimatedSpend)} />
          <KpiCard label="Active Translators" value={stats.kpis.activeTranslators} />
          <KpiCard label="Categories" value={stats.kpis.categoriesCount} />
          <KpiCard label="Ad Placements" value={stats.kpis.adsCount} />
          <KpiCard label="Featured Translators" value={stats.kpis.featuredTranslators} />
          <KpiCard label="Total Translators" value={stats.kpis.totalTranslators} />
        </section>

        <section className="rounded-2xl border border-border bg-white p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-2xl font-semibold text-ink">Usage Trend (30 days)</h2>
            <p className="text-xs text-muted-ink">Daily translations</p>
          </div>
          <div className="flex items-end gap-1 overflow-x-auto pb-2">
            {stats.series.map((item) => (
              <div key={item.date} className="group flex w-3 shrink-0 flex-col items-center justify-end gap-1">
                <div
                  className="w-full rounded bg-brand-500/80"
                  style={{
                    height: `${Math.max(8, Math.round((item.translations / maxUsage) * 120))}px`,
                  }}
                  title={`${item.date}: ${item.translations} translations`}
                />
                <span className="hidden text-[10px] text-muted-ink group-hover:block">{item.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-border bg-white p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-2xl font-semibold text-ink">Top Translators</h2>
              <Link href="/admin/translators" className="text-sm font-medium text-brand-700 hover:text-brand-800">
                Manage translators
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-ink">
                    <th className="px-2 py-2 font-medium">Translator</th>
                    <th className="px-2 py-2 font-medium">Usage</th>
                    <th className="px-2 py-2 font-medium">Tokens</th>
                    <th className="px-2 py-2 font-medium">Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topTranslators.map((row) => (
                    <tr key={row.translatorId} className="border-b border-border/70 last:border-b-0">
                      <td className="px-2 py-2">
                        <p className="font-medium text-ink">{row.name}</p>
                        <p className="text-xs text-muted-ink">/{row.slug}</p>
                      </td>
                      <td className="px-2 py-2 text-ink">{row.usageCount}</td>
                      <td className="px-2 py-2 text-ink">{row.totalTokens}</td>
                      <td className="px-2 py-2 text-ink">{formatCurrency(row.estimatedSpend)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-white p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-2xl font-semibold text-ink">Recent Activity</h2>
              <Link href="/admin/logs" className="text-sm font-medium text-brand-700 hover:text-brand-800">
                Open logs
              </Link>
            </div>
            <div className="space-y-2">
              {stats.recent.map((item) => (
                <div key={item.id} className="rounded-xl border border-border bg-muted-surface px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-ink">{item.translator.name}</p>
                      <p className="text-xs text-muted-ink">/{item.translator.slug}</p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        item.status === "SUCCESS"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-ink">
                    {item.model || "n/a"} · {item.totalTokens} tokens · {formatCurrency(item.estimatedCost)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-ink">{formatDateTime(item.createdAt)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
```

## app/(admin)/admin/settings/page.tsx

```tsx
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { SettingsForm } from "@/components/admin/settings-form";
import { getAppSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { getAvailableModels } from "@/lib/model-catalog";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const [settings, translators, modelOptions] = await Promise.all([
    getAppSettings(),
    prisma.translator.findMany({
      where: { archivedAt: null },
      select: {
        id: true,
        slug: true,
        name: true,
        isActive: true,
      },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    }),
    getAvailableModels(),
  ]);

  return (
    <>
      <AdminTopbar title="Settings" subtitle="Control global brand, discovery, model, and monetization defaults." />
      <main className="p-4 sm:p-6">
        <SettingsForm initial={settings} translators={translators} modelOptions={modelOptions} />
      </main>
    </>
  );
}
```

## app/(admin)/admin/translators/[id]/page.tsx

```tsx
import { notFound } from "next/navigation";

import { AdminTopbar } from "@/components/admin/admin-topbar";
import { TranslatorForm } from "@/components/admin/translator-form";
import { getCategoryChoices } from "@/lib/data/categories";
import { getAdminTranslatorById } from "@/lib/data/translators";
import { getAvailableModels } from "@/lib/model-catalog";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminTranslatorEditPage({ params }: PageProps) {
  const { id } = await params;
  const [translator, categories, modelOptions] = await Promise.all([
    getAdminTranslatorById(id),
    getCategoryChoices(),
    getAvailableModels(),
  ]);

  if (!translator) {
    notFound();
  }

  return (
    <>
      <AdminTopbar
        title={`Edit: ${translator.name}`}
        subtitle="Update translator behavior, categories, and publishing state."
      />
      <main className="p-4 sm:p-6">
        <TranslatorForm
          mode="edit"
          categories={categories}
          modelOptions={modelOptions}
          initial={{
            id: translator.id,
            name: translator.name,
            slug: translator.slug,
            title: translator.title,
            subtitle: translator.subtitle,
            shortDescription: translator.shortDescription,
            sourceLabel: translator.sourceLabel,
            targetLabel: translator.targetLabel,
            iconName: translator.iconName,
            promptSystem: translator.promptSystem,
            promptInstructions: translator.promptInstructions,
            seoTitle: translator.seoTitle,
            seoDescription: translator.seoDescription,
            modelOverride: translator.modelOverride,
            isActive: translator.isActive,
            isFeatured: translator.isFeatured,
            showModeSelector: translator.showModeSelector,
            showSwap: translator.showSwap,
            showExamples: translator.showExamples,
            sortOrder: translator.sortOrder,
            archivedAt: translator.archivedAt ? translator.archivedAt.toISOString() : null,
            primaryCategoryId: translator.primaryCategoryId,
            categoryIds: translator.categories.map((item) => item.categoryId),
            modes: translator.modes.map((mode) => ({
              key: mode.key,
              label: mode.label,
              description: mode.description || "",
              instruction: mode.instruction,
              sortOrder: mode.sortOrder,
            })),
            examples: translator.examples.map((example) => ({
              label: example.label,
              value: example.value,
              sortOrder: example.sortOrder,
            })),
          }}
        />
      </main>
    </>
  );
}
```

## app/(admin)/admin/translators/new/page.tsx

```tsx
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
        <TranslatorForm mode="create" categories={categories} modelOptions={modelOptions} />
      </main>
    </>
  );
}
```

## app/(admin)/admin/translators/page.tsx

```tsx
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

## app/(public)/login/page.tsx

```tsx
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LoginForm } from "@/components/admin/login-form";
import { Navbar } from "@/components/sections/navbar";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await auth();

  if (session?.user?.role === "ADMIN") {
    redirect("/admin");
  }

  return (
    <div className="min-h-screen bg-page">
      <Navbar />
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center px-4 py-10">
        <div className="w-full rounded-2xl border border-border bg-white p-6 shadow-[0_20px_45px_-35px_rgba(17,24,39,0.3)]">
          <h1 className="font-display text-3xl font-semibold text-ink">Admin Login</h1>
          <p className="mt-2 text-sm text-muted-ink">
            Sign in to manage translators, categories, models, analytics, and monetization.
          </p>
          <div className="mt-6">
            <LoginForm />
          </div>
        </div>
      </main>
    </div>
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
          <DiscoverySearch q={q || ""} category={category} />
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

## app/(public)/translators/[slug]/page.tsx

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdDeviceType, AdPageType } from "@prisma/client";

import { Footer } from "@/components/sections/footer";
import { Navbar } from "@/components/sections/navbar";
import { TranslatorCard } from "@/components/translator/translator-card";
import { AdSlot } from "@/components/shared/ad-slot";
import { getRenderableAdPlacements } from "@/lib/data/ads";
import { getPublicTranslatorBySlug } from "@/lib/data/translators";
import { getAppSettings } from "@/lib/settings";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const translator = await getPublicTranslatorBySlug(slug);

  if (!translator) {
    return {
      title: "Translator Not Found",
    };
  }

  return {
    title: translator.seoTitle || `${translator.name} Translator`,
    description: translator.seoDescription || translator.shortDescription,
  };
}

export default async function TranslatorSlugPage({ params }: PageProps) {
  const { slug } = await params;
  const translator = await getPublicTranslatorBySlug(slug);

  if (!translator) {
    notFound();
  }

  const [settings, ads] = await Promise.all([
    getAppSettings(),
    getRenderableAdPlacements({
      pageType: AdPageType.TRANSLATOR,
      deviceType: AdDeviceType.DESKTOP,
      categorySlug: translator.primaryCategory?.slug,
    }),
    getRenderableAdPlacements({
      pageType: AdPageType.TRANSLATOR,
      deviceType: AdDeviceType.DESKTOP,
      categorySlug: translator.primaryCategory?.slug,
    }),
  ]);

  return (
    <div className="relative overflow-x-hidden">
      <Navbar />
      <main className="pb-10">
        <section className="mx-auto w-full max-w-7xl px-4 pb-6 pt-10 text-center sm:px-6 lg:px-8">
          <p className="text-sm font-medium text-brand-700">
            Home / Translators / {translator.name}
          </p>
          <h1 className="font-display mt-3 text-balance text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            {translator.title}
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-balance text-base text-muted-ink sm:text-lg">
            {translator.subtitle}
          </p>
        </section>

        {ads.length ? (
          <section className="mx-auto mb-6 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <AdSlot placement={ads[0]} adSenseClientId={settings.adSenseClientId} />
          </section>
        ) : null}

        <TranslatorCard translator={translator} />

        {ads.length > 1 ? (
          <section className="mx-auto mt-6 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <AdSlot placement={ads[1]} adSenseClientId={settings.adSenseClientId} />
          </section>
        ) : null}
      </main>
      <Footer platformName={settings.platformName} disclaimer={settings.footerDisclaimer} />
    </div>
  );
}
```

## app/(public)/translators/page.tsx

```tsx
import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    category?: string;
    page?: string;
  }>;
}

export const dynamic = "force-dynamic";

export default async function TranslatorsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = new URLSearchParams();

  if (params.q) query.set("q", params.q);
  if (params.category) query.set("category", params.category);
  if (params.page) query.set("page", params.page);

  const target = query.toString() ? `/?${query.toString()}` : "/";
  redirect(target);
}
```

## app/api/admin/ads/[id]/route.ts

```ts
import {
  archiveAdPlacement,
  getAdById,
  hardDeleteAdPlacement,
  unarchiveAdPlacement,
  updateAdPlacement,
} from "@/lib/data/ads";
import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { adPlacementUpsertSchema } from "@/lib/validators";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { id } = await context.params;
  const ad = await getAdById(id);

  if (!ad) {
    return apiError(404, "NOT_FOUND", "Ad placement not found.");
  }

  return apiOk({ ad });
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

  const parsed = adPlacementUpsertSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Please provide valid ad placement fields.");
  }

  const { id } = await context.params;

  try {
    const ad = await updateAdPlacement(id, parsed.data);
    return apiOk({ ad });
  } catch {
    return apiError(500, "BAD_REQUEST", "Unable to update ad placement right now.");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") || "archive";

  try {
    if (mode === "hard") {
      await hardDeleteAdPlacement(id);
      return apiOk({ deleted: true });
    }

    if (mode === "unarchive") {
      const ad = await unarchiveAdPlacement(id);
      return apiOk({ ad });
    }

    const ad = await archiveAdPlacement(id);
    return apiOk({ ad });
  } catch {
    return apiError(500, "BAD_REQUEST", "Unable to process request.");
  }
}
```

## app/api/admin/ads/route.ts

```ts
import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { adPlacementUpsertSchema } from "@/lib/validators";
import { createAdPlacement, listAdminAds } from "@/lib/data/ads";

export async function GET() {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const ads = await listAdminAds();
  return apiOk({ ads });
}

export async function POST(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "Invalid JSON payload.");
  }

  const parsed = adPlacementUpsertSchema.safeParse(payload);

  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Please provide valid ad placement fields.");
  }

  try {
    const ad = await createAdPlacement(parsed.data);
    return apiOk({ ad }, 201);
  } catch {
    return apiError(500, "BAD_REQUEST", "Unable to create ad placement right now.");
  }
}
```

## app/api/admin/analytics/route.ts

```ts
import { adminRouteGuard } from "@/lib/permissions";
import { apiOk } from "@/lib/api-response";
import { getAdminOverviewStats } from "@/lib/data/translators";

export async function GET(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { searchParams } = new URL(request.url);
  const days = Number(searchParams.get("days") || 30);

  const analytics = await getAdminOverviewStats(days);
  return apiOk({ analytics });
}
```

## app/api/admin/categories/[id]/route.ts

```ts
import {
  archiveCategory,
  getAdminCategoryById,
  hardDeleteCategory,
  unarchiveCategory,
  updateCategory,
} from "@/lib/data/categories";
import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { categoryUpsertSchema } from "@/lib/validators";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { id } = await context.params;
  const category = await getAdminCategoryById(id);

  if (!category) {
    return apiError(404, "NOT_FOUND", "Category not found.");
  }

  return apiOk({ category });
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

  const parsed = categoryUpsertSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Please provide valid category fields.");
  }

  const { id } = await context.params;

  try {
    const category = await updateCategory(id, parsed.data);
    return apiOk({ category });
  } catch {
    return apiError(500, "BAD_REQUEST", "Unable to update category right now.");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") || "archive";

  try {
    if (mode === "hard") {
      await hardDeleteCategory(id);
      return apiOk({ deleted: true });
    }

    if (mode === "unarchive") {
      const category = await unarchiveCategory(id);
      return apiOk({ category });
    }

    const category = await archiveCategory(id);
    return apiOk({ category });
  } catch {
    return apiError(500, "BAD_REQUEST", "Unable to process request.");
  }
}
```

## app/api/admin/categories/route.ts

```ts
import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { categoryUpsertSchema } from "@/lib/validators";
import { createCategory, listAdminCategories } from "@/lib/data/categories";

export async function GET() {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const categories = await listAdminCategories();
  return apiOk({ categories });
}

export async function POST(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "Invalid JSON payload.");
  }

  const parsed = categoryUpsertSchema.safeParse(payload);

  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Please provide valid category fields.");
  }

  try {
    const category = await createCategory(parsed.data);
    return apiOk({ category }, 201);
  } catch {
    return apiError(500, "BAD_REQUEST", "Unable to create category right now.");
  }
}
```

## app/api/admin/models/route.ts

```ts
import { adminRouteGuard } from "@/lib/permissions";
import { apiOk } from "@/lib/api-response";
import { getAvailableModels } from "@/lib/model-catalog";

export async function GET(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "1";

  const models = await getAvailableModels(forceRefresh);
  return apiOk({ models });
}
```

## app/api/admin/settings/route.ts

```ts
import { prisma } from "@/lib/prisma";
import { getAppSettings, updateAppSettings } from "@/lib/settings";
import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { settingsSchema } from "@/lib/validators";

export async function GET() {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const [settings, translators] = await Promise.all([
    getAppSettings(),
    prisma.translator.findMany({
      where: { archivedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
      },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    }),
  ]);

  return apiOk({ settings, translators });
}

export async function PUT(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "Invalid JSON payload.");
  }

  const parsed = settingsSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Please provide valid settings.");
  }

  await updateAppSettings({
    ...parsed.data,
    defaultModelOverride: parsed.data.defaultModelOverride || "",
    adSenseClientId: parsed.data.adSenseClientId || "",
  });

  return apiOk({ saved: true });
}
```

## app/api/admin/translators/[id]/duplicate/route.ts

```ts
import { duplicateTranslator } from "@/lib/data/translators";
import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { id } = await context.params;
  const duplicate = await duplicateTranslator(id);

  if (!duplicate) {
    return apiError(404, "NOT_FOUND", "Translator not found.");
  }

  return apiOk({ translator: duplicate }, 201);
}
```

## app/api/admin/translators/[id]/route.ts

```ts
import {
  archiveTranslator,
  getAdminTranslatorById,
  hardDeleteTranslator,
  unarchiveTranslator,
  updateTranslator,
} from "@/lib/data/translators";
import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { translatorUpsertSchema } from "@/lib/validators";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { id } = await context.params;
  const translator = await getAdminTranslatorById(id);

  if (!translator) {
    return apiError(404, "NOT_FOUND", "Translator not found.");
  }

  return apiOk({ translator });
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

  const parsed = translatorUpsertSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Please provide valid translator fields.");
  }

  const { id } = await context.params;

  try {
    const translator = await updateTranslator(id, parsed.data);
    return apiOk({ translator });
  } catch {
    return apiError(500, "BAD_REQUEST", "Unable to update translator right now.");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") || "archive";

  try {
    if (mode === "hard") {
      await hardDeleteTranslator(id);
      return apiOk({ deleted: true });
    }

    if (mode === "unarchive") {
      const translator = await unarchiveTranslator(id);
      return apiOk({ translator });
    }

    const translator = await archiveTranslator(id);
    return apiOk({ translator });
  } catch {
    return apiError(500, "BAD_REQUEST", "Unable to process delete request.");
  }
}
```

## app/api/admin/translators/[id]/toggle-active/route.ts

```ts
import { z } from "zod";

import { toggleTranslatorActive } from "@/lib/data/translators";
import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";

const schema = z.object({
  active: z.boolean().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  let payload: unknown = {};

  try {
    payload = await request.json();
  } catch {
    // Optional payload.
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Invalid toggle payload.");
  }

  const { id } = await context.params;
  const translator = await toggleTranslatorActive(id, parsed.data.active);

  if (!translator) {
    return apiError(404, "NOT_FOUND", "Translator not found.");
  }

  return apiOk({ translator });
}
```

## app/api/admin/translators/route.ts

```ts
import { adminRouteGuard } from "@/lib/permissions";
import { apiError, apiOk } from "@/lib/api-response";
import { listAdminTranslators, createTranslator } from "@/lib/data/translators";
import { adminTranslatorFilterSchema, translatorUpsertSchema } from "@/lib/validators";

export async function GET(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  const { searchParams } = new URL(request.url);
  const parsed = adminTranslatorFilterSchema.safeParse({
    q: searchParams.get("q") || undefined,
    status: searchParams.get("status") || undefined,
    featured: searchParams.get("featured") || undefined,
    category: searchParams.get("category") || undefined,
  });

  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Invalid translator filter query.");
  }

  const translators = await listAdminTranslators(parsed.data);
  return apiOk({ translators });
}

export async function POST(request: Request) {
  const guard = await adminRouteGuard();
  if (guard) return guard;

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "Invalid JSON payload.");
  }

  const parsed = translatorUpsertSchema.safeParse(payload);

  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Please provide valid translator fields.");
  }

  try {
    const translator = await createTranslator(parsed.data);
    return apiOk({ translator }, 201);
  } catch {
    return apiError(500, "BAD_REQUEST", "Unable to create translator at the moment.");
  }
}
```

## app/api/auth/[...nextauth]/route.ts

```ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

## app/api/ocr/route.ts

```ts
import { NextResponse } from "next/server";

import { ALLOWED_IMAGE_TYPES, OCR_MAX_FILE_SIZE_MB } from "@/lib/constants";
import { extractTextFromImageBuffer } from "@/lib/ocr";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ApiErrorCode, OcrResponse } from "@/lib/types";
import { extractClientIp } from "@/lib/utils";

export const runtime = "nodejs";

function errorResponse(status: number, code: ApiErrorCode, message: string) {
  return NextResponse.json<OcrResponse>(
    {
      ok: false,
      error: { code, message },
    },
    { status },
  );
}

export async function POST(request: Request) {
  const identifier = extractClientIp(request);
  const limit = checkRateLimit(`ocr:${identifier}`);

  if (!limit.allowed) {
    return errorResponse(429, "RATE_LIMITED", "Too many OCR requests. Please try again shortly.");
  }

  const formData = await request.formData();
  const image = formData.get("image");

  if (!(image instanceof File)) {
    return errorResponse(400, "VALIDATION_ERROR", "Please upload an image file first.");
  }

  if (!ALLOWED_IMAGE_TYPES.includes(image.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return errorResponse(415, "UNSUPPORTED_FILE", "Only png, jpg, jpeg, and webp are supported.");
  }

  if (image.size > OCR_MAX_FILE_SIZE_MB * 1024 * 1024) {
    return errorResponse(413, "TOO_LONG", `Image must be smaller than ${OCR_MAX_FILE_SIZE_MB}MB.`);
  }

  try {
    const buffer = Buffer.from(await image.arrayBuffer());
    const text = await extractTextFromImageBuffer(buffer);

    if (!text) {
      return errorResponse(422, "OCR_ERROR", "No readable text was detected in that image.");
    }

    return NextResponse.json<OcrResponse>({ ok: true, text });
  } catch {
    return errorResponse(500, "OCR_ERROR", "OCR failed while reading that image.");
  }
}
```

## app/api/translate/route.ts

```ts
import { TranslationStatus } from "@prisma/client";

import { buildTranslatorPrompts } from "@/lib/prompt-builder";
import { translateWithOpenAI } from "@/lib/openai";
import { checkRateLimit } from "@/lib/rate-limit";
import { estimateCost } from "@/lib/pricing";
import { extractClientIp, hashIp } from "@/lib/utils";
import { validateTranslateInput } from "@/lib/validators";
import { apiError, apiOk } from "@/lib/api-response";
import {
  createTranslationLog,
  getDefaultRuntimeTranslator,
  getRuntimeTranslatorBySlug,
} from "@/lib/data/translators";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const identifier = extractClientIp(request);
  const userAgent = request.headers.get("user-agent") || undefined;
  const limit = checkRateLimit(`translate:${identifier}`);

  if (!limit.allowed) {
    return apiError(429, "RATE_LIMITED", "Too many requests. Please try again shortly.");
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "Invalid JSON payload.");
  }

  const validation = validateTranslateInput(payload);
  if (!validation.ok) {
    return apiError(validation.status, validation.error.code, validation.error.message);
  }

  const requestedSlug = validation.data.translatorSlug;
  const translator = requestedSlug
    ? await getRuntimeTranslatorBySlug(requestedSlug)
    : await getDefaultRuntimeTranslator();

  if (!translator) {
    if (requestedSlug) {
      const existing = await prisma.translator.findUnique({
        where: { slug: requestedSlug },
        select: { isActive: true, archivedAt: true },
      });

      if (existing && (!existing.isActive || existing.archivedAt)) {
        return apiError(403, "INACTIVE_TRANSLATOR", "This translator is currently unavailable.");
      }
    }

    return apiError(404, "NOT_FOUND", "Translator not found.");
  }

  const { systemPrompt, userPrompt, resolvedModeKey } = buildTranslatorPrompts({
    translator,
    userText: validation.data.text,
    modeKey: validation.data.modeKey,
  });

  const settings = await getAppSettings();
  const model = translator.modelOverride || settings.defaultModelOverride || undefined;

  try {
    const generated = await translateWithOpenAI({
      systemPrompt,
      userPrompt,
      model,
    });

    const estimatedCost = estimateCost({
      model: generated.model,
      promptTokens: generated.promptTokens,
      completionTokens: generated.completionTokens,
      totalTokens: generated.totalTokens,
    });

    void createTranslationLog({
      translatorId: translator.id,
      inputText: validation.data.text,
      outputText: generated.text,
      modeUsed: resolvedModeKey,
      status: TranslationStatus.SUCCESS,
      inputLength: validation.data.text.length,
      outputLength: generated.text.length,
      model: generated.model,
      promptTokens: generated.promptTokens,
      completionTokens: generated.completionTokens,
      totalTokens: generated.totalTokens,
      estimatedCost,
      latencyMs: Date.now() - startedAt,
      ipHash: hashIp(identifier),
      userAgent,
    }).catch(() => {
      // Non-blocking log path.
    });

    return apiOk({ result: generated.text });
  } catch {
    void createTranslationLog({
      translatorId: translator.id,
      inputText: validation.data.text,
      outputText: "",
      modeUsed: resolvedModeKey,
      status: TranslationStatus.FAILURE,
      inputLength: validation.data.text.length,
      outputLength: 0,
      model: model || undefined,
      errorCode: "UPSTREAM_ERROR",
      latencyMs: Date.now() - startedAt,
      ipHash: hashIp(identifier),
      userAgent,
    }).catch(() => {
      // Non-blocking log path.
    });

    return apiError(502, "UPSTREAM_ERROR", "We couldn't refine that text just now.");
  }
}
```

## app/api/translators/suggest/route.ts

```ts
import { DISCOVERY_SUGGESTION_LIMIT } from "@/lib/constants";
import { apiError, apiOk } from "@/lib/api-response";
import { getSearchSuggestions } from "@/lib/data/translators";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();

  if (!q) {
    return apiOk({ suggestions: [] });
  }

  if (q.length > 120) {
    return apiError(400, "VALIDATION_ERROR", "Search query is too long.");
  }

  const suggestions = await getSearchSuggestions(q, DISCOVERY_SUGGESTION_LIMIT);
  return apiOk({ suggestions });
}
```

## app/globals.css

```css
@import "tailwindcss";

:root {
  --theme-palette-color-1: #5b5bf6;
  --theme-palette-color-2: #e5e7eb;
  --theme-palette-color-3: #111827;
  --theme-palette-color-4: #6b7280;
  --theme-palette-color-5: #f7f8fc;
  --theme-palette-color-6: #ffffff;
  --theme-palette-color-7: #fafbfc;
  --theme-palette-color-8: #ffffff;
}

@theme inline {
  --font-sans: var(--font-body);
  --font-display: var(--font-display);

  --color-page: var(--theme-palette-color-5);
  --color-surface: var(--theme-palette-color-6);
  --color-muted-surface: var(--theme-palette-color-7);
  --color-border: var(--theme-palette-color-2);
  --color-ink: var(--theme-palette-color-3);
  --color-muted-ink: var(--theme-palette-color-4);

  --color-brand-50: #efefff;
  --color-brand-100: #e4e4ff;
  --color-brand-200: #cfcfff;
  --color-brand-300: #adadff;
  --color-brand-400: #8383fb;
  --color-brand-500: #5b5bf6;
  --color-brand-600: #4c4ce8;
  --color-brand-700: #4040cb;
  --color-brand-800: #3737a6;
  --color-brand-900: #303080;
}

* {
  border-color: var(--theme-palette-color-2);
}

html,
body {
  min-height: 100%;
}

body {
  font-family: var(--font-body), sans-serif;
  color: var(--theme-palette-color-3);
  background:
    radial-gradient(circle at 12% 0%, rgba(91, 91, 246, 0.08), transparent 33%),
    radial-gradient(circle at 88% 10%, rgba(91, 91, 246, 0.06), transparent 40%),
    linear-gradient(to bottom, #f9faff, var(--theme-palette-color-5));
}

.font-display {
  font-family: var(--font-display), serif;
}

input,
textarea,
select,
button {
  font: inherit;
}

:focus-visible {
  outline: 2px solid rgba(91, 91, 246, 0.35);
  outline-offset: 2px;
}

.animate-toast-in {
  animation: toastIn 180ms ease-out;
}

@keyframes toastIn {
  from {
    opacity: 0;
    transform: translateY(-8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.animate-fade-up {
  animation: fadeUp 360ms ease-out;
}

@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.scrollbar-thin {
  scrollbar-width: thin;
  scrollbar-color: #d1d5db transparent;
}
```

## app/icon.svg

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <rect width="64" height="64" rx="14" fill="#5B5BF6" />
  <path d="M14 42.5V21.5h11.2c5.8 0 9.7 2.8 9.7 7.4 0 4.7-3.9 7.5-9.7 7.5H20v6.1h-6Zm6-11.2h4.8c2.6 0 4.2-1 4.2-2.9 0-1.9-1.6-2.9-4.2-2.9H20v5.8Z" fill="white"/>
  <path d="M36 42.5V21.5h10.2c5.5 0 9.2 3.2 9.2 8.2 0 5.1-3.7 8.3-9.2 8.3H42v4.5h-6Zm6-9.8h3.8c2.5 0 4-1.2 4-3 0-1.8-1.5-3-4-3H42v6Z" fill="#E5E7EB"/>
</svg>
```

## app/layout.tsx

```tsx
import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";

import { ToastProvider } from "@/components/providers/toast-provider";
import { APP_NAME, SEO_DESCRIPTION } from "@/lib/constants";

import "./globals.css";

const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const displayFont = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://example.com"),
  title: {
    default: `${APP_NAME} | Style Translator Platform`,
    template: `%s | ${APP_NAME}`,
  },
  description: SEO_DESCRIPTION,
  keywords: [
    "style translator",
    "tone converter",
    "text rewrite platform",
    "writing style transformation",
    "translator discovery",
  ],
  openGraph: {
    title: `${APP_NAME} | Style Translator Platform`,
    description: SEO_DESCRIPTION,
    type: "website",
    url: "https://example.com",
    siteName: APP_NAME,
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: `${APP_NAME} preview`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} | Style Translator Platform`,
    description: SEO_DESCRIPTION,
    images: ["/og-image.svg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <body className="min-h-screen bg-page text-ink antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
```

## auth.ts

```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const credentialSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });

        if (!user) {
          return null;
        }

        const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        if (user.id) {
          token.id = user.id;
        }

        if ("role" in user && user.role) {
          token.role = user.role as Role;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id || token.sub) as string;
        session.user.role = (token.role as Role | undefined) || Role.EDITOR;
      }

      return session;
    },
  },
});
```

## components/admin/ad-form.tsx

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useToast } from "@/components/providers/toast-provider";

interface AdInitial {
  id: string;
  name: string;
  key: string;
  description: string | null;
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
  adSenseSlot: string | null;
  codeSnippet: string | null;
  categoryId: string | null;
  isActive: boolean;
  sortOrder: number;
  archivedAt: string | null;
}

interface AdFormProps {
  mode: "create" | "edit";
  initial?: AdInitial;
  categories: Array<{ id: string; name: string }>;
}

export function AdForm({ mode, initial, categories }: AdFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [form, setForm] = useState({
    name: initial?.name || "",
    key: initial?.key || "",
    description: initial?.description || "",
    pageType: initial?.pageType || "ALL",
    deviceType: initial?.deviceType || "ALL",
    placementType: initial?.placementType || "CUSTOM",
    providerType: initial?.providerType || "ADSENSE",
    adSenseSlot: initial?.adSenseSlot || "",
    codeSnippet: initial?.codeSnippet || "",
    categoryId: initial?.categoryId || "",
    isActive: initial?.isActive ?? false,
    sortOrder: initial?.sortOrder || 10,
  });

  async function save() {
    setBusy(true);

    const payload = {
      ...form,
      sortOrder: Number(form.sortOrder) || 0,
    };

    const endpoint = mode === "create" ? "/api/admin/ads" : `/api/admin/ads/${initial?.id}`;
    const method = mode === "create" ? "POST" : "PATCH";

    const response = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    setBusy(false);

    if (!response.ok || !result.ok) {
      toast({
        title: "Save failed",
        description: result?.error?.message || "Please review values and retry.",
        variant: "error",
      });
      return;
    }

    toast({ title: "Ad placement saved" });
    if (mode === "create") {
      router.push(`/admin/ads/${result.ad.id}`);
    } else {
      router.refresh();
    }
  }

  async function archiveToggle() {
    if (!initial?.id) return;

    setBusy(true);
    const modeValue = initial.archivedAt ? "unarchive" : "archive";
    const response = await fetch(`/api/admin/ads/${initial.id}?mode=${modeValue}`, {
      method: "DELETE",
    });
    const result = await response.json();
    setBusy(false);

    if (!response.ok || !result.ok) {
      toast({ title: "Action failed", description: "Please try again.", variant: "error" });
      return;
    }

    toast({ title: initial.archivedAt ? "Placement restored" : "Placement archived" });
    router.refresh();
  }

  async function hardDelete() {
    if (!initial?.id) return;

    setBusy(true);
    const response = await fetch(`/api/admin/ads/${initial.id}?mode=hard`, {
      method: "DELETE",
    });
    const result = await response.json();
    setBusy(false);

    if (!response.ok || !result.ok) {
      toast({ title: "Delete failed", description: "Please try again.", variant: "error" });
      return;
    }

    toast({ title: "Placement deleted" });
    router.push("/admin/ads");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-white p-6">
        <h2 className="font-display text-2xl font-semibold text-ink">Placement Details</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Name</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Key</span>
            <input
              value={form.key}
              onChange={(event) => setForm((current) => ({ ...current, key: event.target.value }))}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">Description</span>
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              className="min-h-20 w-full rounded-xl border border-border px-3 py-2"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Page Type</span>
            <select
              value={form.pageType}
              onChange={(event) => setForm((current) => ({ ...current, pageType: event.target.value as typeof current.pageType }))}
              className="h-11 w-full rounded-xl border border-border px-3"
            >
              <option value="ALL">All</option>
              <option value="HOMEPAGE">Homepage</option>
              <option value="TRANSLATOR">Translator</option>
              <option value="CATEGORY">Category</option>
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Device Type</span>
            <select
              value={form.deviceType}
              onChange={(event) => setForm((current) => ({ ...current, deviceType: event.target.value as typeof current.deviceType }))}
              className="h-11 w-full rounded-xl border border-border px-3"
            >
              <option value="ALL">All devices</option>
              <option value="DESKTOP">Desktop</option>
              <option value="MOBILE">Mobile</option>
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Placement Type</span>
            <select
              value={form.placementType}
              onChange={(event) =>
                setForm((current) => ({ ...current, placementType: event.target.value as typeof current.placementType }))
              }
              className="h-11 w-full rounded-xl border border-border px-3"
            >
              <option value="HOMEPAGE_TOP">Homepage Top</option>
              <option value="HOMEPAGE_BETWEEN_SECTIONS">Homepage Between Sections</option>
              <option value="TRANSLATOR_ABOVE_TOOL">Translator Above Tool</option>
              <option value="TRANSLATOR_BELOW_TOOL">Translator Below Tool</option>
              <option value="SIDEBAR_SLOT">Sidebar Slot</option>
              <option value="FOOTER_SLOT">Footer Slot</option>
              <option value="MOBILE_STICKY_SLOT">Mobile Sticky Slot</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Provider Type</span>
            <select
              value={form.providerType}
              onChange={(event) =>
                setForm((current) => ({ ...current, providerType: event.target.value as typeof current.providerType }))
              }
              className="h-11 w-full rounded-xl border border-border px-3"
            >
              <option value="ADSENSE">AdSense</option>
              <option value="CUSTOM_HTML">Custom HTML</option>
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Category Target (optional)</span>
            <select
              value={form.categoryId}
              onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}
              className="h-11 w-full rounded-xl border border-border px-3"
            >
              <option value="">None</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">AdSense Slot (optional)</span>
            <input
              value={form.adSenseSlot}
              onChange={(event) =>
                setForm((current) => ({ ...current, adSenseSlot: event.target.value }))
              }
              className="h-11 w-full rounded-xl border border-border px-3"
              placeholder="e.g. 1234567890"
            />
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">Custom Code Snippet (optional)</span>
            <textarea
              value={form.codeSnippet}
              onChange={(event) =>
                setForm((current) => ({ ...current, codeSnippet: event.target.value }))
              }
              className="min-h-24 w-full rounded-xl border border-border px-3 py-2"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Sort Order</span>
            <input
              type="number"
              value={form.sortOrder}
              onChange={(event) =>
                setForm((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))
              }
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-medium text-muted-ink">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
            />
            Active
          </label>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving..." : mode === "create" ? "Create Placement" : "Save Changes"}
        </Button>

        {mode === "edit" ? (
          <>
            <Button type="button" variant="outline" onClick={() => void archiveToggle()} disabled={busy}>
              {initial?.archivedAt ? "Unarchive" : "Archive"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-50"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
            >
              <Trash2 className="h-4 w-4" />
              Delete Forever
            </Button>
          </>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Permanently delete ad placement?"
        description="This action cannot be undone."
        confirmLabel="Delete forever"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void hardDelete();
        }}
        variant="danger"
      />
    </div>
  );
}
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
                      <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700">
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

## components/admin/admin-shell.tsx

```tsx
import type { ReactNode } from "react";

import { AdminMobileNav, AdminSidebar } from "@/components/admin/admin-sidebar";

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-page">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px]">
        <AdminSidebar />
        <div className="min-w-0 flex-1">
          <AdminMobileNav />
          {children}
        </div>
      </div>
    </div>
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
  PlusSquare,
  ScrollText,
  Sparkles,
} from "lucide-react";

const links = [
  { href: "/admin", label: "Overview", icon: BarChart3 },
  { href: "/admin/translators", label: "Translators", icon: Sparkles },
  { href: "/admin/translators/new", label: "Create Translator", icon: PlusSquare },
  { href: "/admin/categories", label: "Categories", icon: FolderTree },
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

## components/admin/admin-topbar.tsx

```tsx
import { LogoutButton } from "@/components/admin/logout-button";

interface AdminTopbarProps {
  title: string;
  subtitle?: string;
}

export function AdminTopbar({ title, subtitle }: AdminTopbarProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-border bg-white px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-ink">{subtitle}</p> : null}
      </div>
      <LogoutButton />
    </div>
  );
}
```

## components/admin/category-form.tsx

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useToast } from "@/components/providers/toast-provider";
import { slugify } from "@/lib/slugify";

interface CategoryInitial {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  iconKey: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  archivedAt: string | null;
}

interface CategoryFormProps {
  mode: "create" | "edit";
  initial?: CategoryInitial;
}

export function CategoryForm({ mode, initial }: CategoryFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));

  const [form, setForm] = useState({
    name: initial?.name || "",
    slug: initial?.slug || "",
    description: initial?.description || "",
    sortOrder: initial?.sortOrder || 10,
    isActive: initial?.isActive ?? true,
    iconKey: initial?.iconKey || "",
    seoTitle: initial?.seoTitle || "",
    seoDescription: initial?.seoDescription || "",
  });

  async function save() {
    setBusy(true);

    const payload = {
      ...form,
      slug: slugify(form.slug || form.name),
      sortOrder: Number(form.sortOrder) || 0,
    };

    const endpoint = mode === "create" ? "/api/admin/categories" : `/api/admin/categories/${initial?.id}`;
    const method = mode === "create" ? "POST" : "PATCH";

    const response = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    setBusy(false);

    if (!response.ok || !result.ok) {
      toast({
        title: "Save failed",
        description: result?.error?.message || "Please verify the fields and retry.",
        variant: "error",
      });
      return;
    }

    toast({ title: "Category saved" });

    if (mode === "create") {
      router.push(`/admin/categories/${result.category.id}`);
    } else {
      router.refresh();
    }
  }

  async function archiveToggle() {
    if (!initial?.id) return;

    setBusy(true);
    const modeValue = initial.archivedAt ? "unarchive" : "archive";
    const response = await fetch(`/api/admin/categories/${initial.id}?mode=${modeValue}`, {
      method: "DELETE",
    });
    const result = await response.json();
    setBusy(false);

    if (!response.ok || !result.ok) {
      toast({ title: "Action failed", description: "Please try again.", variant: "error" });
      return;
    }

    toast({ title: initial.archivedAt ? "Category restored" : "Category archived" });
    router.refresh();
  }

  async function hardDelete() {
    if (!initial?.id) return;

    setBusy(true);
    const response = await fetch(`/api/admin/categories/${initial.id}?mode=hard`, {
      method: "DELETE",
    });
    const result = await response.json();
    setBusy(false);

    if (!response.ok || !result.ok) {
      toast({ title: "Delete failed", description: "Please try again.", variant: "error" });
      return;
    }

    toast({ title: "Category deleted" });
    router.push("/admin/categories");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-white p-6">
        <h2 className="font-display text-2xl font-semibold text-ink">Category Details</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Name</span>
            <input
              value={form.name}
              onChange={(event) => {
                const value = event.target.value;
                setForm((current) => ({ ...current, name: value }));
                if (!slugTouched) {
                  setForm((current) => ({ ...current, slug: slugify(value) }));
                }
              }}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Slug</span>
            <input
              value={form.slug}
              onChange={(event) => {
                setSlugTouched(true);
                setForm((current) => ({ ...current, slug: slugify(event.target.value) }));
              }}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">Description</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              className="min-h-20 w-full rounded-xl border border-border px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Icon Key</span>
            <input
              value={form.iconKey}
              onChange={(event) => setForm((current) => ({ ...current, iconKey: event.target.value }))}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Sort Order</span>
            <input
              type="number"
              value={form.sortOrder}
              onChange={(event) =>
                setForm((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))
              }
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">SEO Title</span>
            <input
              value={form.seoTitle}
              onChange={(event) => setForm((current) => ({ ...current, seoTitle: event.target.value }))}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">SEO Description</span>
            <textarea
              value={form.seoDescription}
              onChange={(event) =>
                setForm((current) => ({ ...current, seoDescription: event.target.value }))
              }
              className="min-h-20 w-full rounded-xl border border-border px-3 py-2"
            />
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-medium text-muted-ink md:col-span-2">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
            />
            Active
          </label>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving..." : mode === "create" ? "Create Category" : "Save Changes"}
        </Button>

        {mode === "edit" ? (
          <>
            <Button type="button" variant="outline" onClick={() => void archiveToggle()} disabled={busy}>
              {initial?.archivedAt ? "Unarchive" : "Archive"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-50"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
            >
              <Trash2 className="h-4 w-4" />
              Delete Forever
            </Button>
          </>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Permanently delete category?"
        description="This action cannot be undone. Translators using this category keep running but lose the relation."
        confirmLabel="Delete forever"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void hardDelete();
        }}
        variant="danger"
      />
    </div>
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
                      <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700">
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
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm text-slate-600">{description}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={variant === "danger" ? "secondary" : "default"}
            className={variant === "danger" ? "bg-red-600 hover:bg-red-700" : undefined}
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

## components/admin/kpi-card.tsx

```tsx
interface KpiCardProps {
  label: string;
  value: number | string;
  hint?: string;
}

export function KpiCard({ label, value, hint }: KpiCardProps) {
  return (
    <article className="rounded-2xl border border-border bg-white p-5 shadow-[0_20px_35px_-30px_rgba(17,24,39,0.22)]">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-ink">{label}</p>
      <p className="font-display mt-2 text-4xl font-semibold text-ink">{value}</p>
      {hint ? <p className="mt-2 text-xs text-muted-ink">{hint}</p> : null}
    </article>
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
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
          required
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
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

## components/admin/logout-button.tsx

```tsx
import { LogOut } from "lucide-react";

import { logoutAction } from "@/lib/actions/auth-actions";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="outline" size="sm">
        <LogOut className="h-4 w-4" />
        Logout
      </Button>
    </form>
  );
}
```

## components/admin/settings-form.tsx

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/toast-provider";
import type { AppSettings } from "@/lib/types";

interface SettingsFormProps {
  initial: AppSettings;
  translators: Array<{
    id: string;
    slug: string;
    name: string;
    isActive: boolean;
  }>;
  modelOptions: string[];
}

export function SettingsForm({ initial, translators, modelOptions: initialModels }: SettingsFormProps) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState(initialModels);
  const [refreshingModels, setRefreshingModels] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  async function refreshModels() {
    setRefreshingModels(true);
    const response = await fetch("/api/admin/models?refresh=1");
    const result = await response.json();
    setRefreshingModels(false);

    if (!response.ok || !result.ok) {
      toast({ title: "Model refresh failed", description: "Using cached list.", variant: "error" });
      return;
    }

    setModels(result.models || []);
    toast({ title: "Model list refreshed" });
  }

  async function save() {
    setBusy(true);
    const response = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const result = await response.json();
    setBusy(false);

    if (!response.ok || !result.ok) {
      toast({
        title: "Save failed",
        description: result?.error?.message || "Unable to save settings.",
        variant: "error",
      });
      return;
    }

    toast({ title: "Settings saved" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-white p-6">
        <h2 className="font-display text-2xl font-semibold text-ink">Platform Settings</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Platform Name</span>
            <input
              value={form.platformName}
              onChange={(event) => setForm((current) => ({ ...current, platformName: event.target.value }))}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Default Translator</span>
            <select
              value={form.defaultTranslatorSlug}
              onChange={(event) =>
                setForm((current) => ({ ...current, defaultTranslatorSlug: event.target.value }))
              }
              className="h-11 w-full rounded-xl border border-border px-3"
            >
              {translators.map((translator) => (
                <option key={translator.id} value={translator.slug}>
                  {translator.name} ({translator.slug})
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">Homepage Title</span>
            <input
              value={form.homepageTitle}
              onChange={(event) => setForm((current) => ({ ...current, homepageTitle: event.target.value }))}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">Homepage Subtitle</span>
            <textarea
              value={form.homepageSubtitle}
              onChange={(event) =>
                setForm((current) => ({ ...current, homepageSubtitle: event.target.value }))
              }
              className="min-h-20 w-full rounded-xl border border-border px-3 py-2"
            />
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">Catalog Intro</span>
            <textarea
              value={form.catalogIntro}
              onChange={(event) =>
                setForm((current) => ({ ...current, catalogIntro: event.target.value }))
              }
              className="min-h-20 w-full rounded-xl border border-border px-3 py-2"
            />
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">Footer Disclaimer</span>
            <textarea
              value={form.footerDisclaimer}
              onChange={(event) =>
                setForm((current) => ({ ...current, footerDisclaimer: event.target.value }))
              }
              className="min-h-20 w-full rounded-xl border border-border px-3 py-2"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Discovery Page Size</span>
            <input
              type="number"
              value={form.discoveryPageSize}
              onChange={(event) =>
                setForm((current) => ({ ...current, discoveryPageSize: Number(event.target.value) || 12 }))
              }
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>

          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-muted-ink">Global Default Model</span>
              <button
                type="button"
                onClick={() => void refreshModels()}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
              >
                <RefreshCcw className={`h-3.5 w-3.5 ${refreshingModels ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
            <select
              value={form.defaultModelOverride}
              onChange={(event) =>
                setForm((current) => ({ ...current, defaultModelOverride: event.target.value }))
              }
              className="h-11 w-full rounded-xl border border-border px-3"
            >
              <option value="">Use environment fallback</option>
              {models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-medium text-muted-ink md:col-span-2">
            <input
              type="checkbox"
              checked={form.featuredTranslatorsEnabled}
              onChange={(event) =>
                setForm((current) => ({ ...current, featuredTranslatorsEnabled: event.target.checked }))
              }
            />
            Show featured translators on homepage
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-medium text-muted-ink md:col-span-2">
            <input
              type="checkbox"
              checked={form.adsEnabled}
              onChange={(event) => setForm((current) => ({ ...current, adsEnabled: event.target.checked }))}
            />
            Enable ad rendering globally
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">AdSense Client ID (optional)</span>
            <input
              value={form.adSenseClientId}
              onChange={(event) =>
                setForm((current) => ({ ...current, adSenseClientId: event.target.value }))
              }
              className="h-11 w-full rounded-xl border border-border px-3"
              placeholder="ca-pub-xxxxxxxxxxxxxxxx"
            />
          </label>
        </div>
      </section>

      <Button type="button" onClick={() => void save()} disabled={busy}>
        {busy ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}
```

## components/admin/translator-form.tsx

```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/toast-provider";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { slugify } from "@/lib/slugify";

interface FormMode {
  key: string;
  label: string;
  description: string;
  instruction: string;
  sortOrder: number;
}

interface FormExample {
  label: string;
  value: string;
  sortOrder: number;
}

interface TranslatorFormInitial {
  id: string;
  name: string;
  slug: string;
  title: string;
  subtitle: string;
  shortDescription: string;
  sourceLabel: string;
  targetLabel: string;
  iconName: string | null;
  promptSystem: string;
  promptInstructions: string;
  seoTitle: string | null;
  seoDescription: string | null;
  modelOverride: string | null;
  isActive: boolean;
  isFeatured: boolean;
  showModeSelector: boolean;
  showSwap: boolean;
  showExamples: boolean;
  sortOrder: number;
  archivedAt: string | null;
  primaryCategoryId: string | null;
  categoryIds: string[];
  modes: FormMode[];
  examples: FormExample[];
}

interface TranslatorFormProps {
  mode: "create" | "edit";
  initial?: TranslatorFormInitial;
  categories: Array<{ id: string; name: string }>;
  modelOptions: string[];
}

function createDefaultState(): Omit<TranslatorFormInitial, "id" | "archivedAt"> {
  return {
    name: "",
    slug: "",
    title: "",
    subtitle: "",
    shortDescription: "",
    sourceLabel: "Input",
    targetLabel: "Output",
    iconName: "",
    promptSystem: "You are an expert stylistic translator.",
    promptInstructions: "Preserve meaning while rewriting for the requested style.",
    seoTitle: "",
    seoDescription: "",
    modelOverride: "",
    isActive: true,
    isFeatured: false,
    showModeSelector: false,
    showSwap: false,
    showExamples: false,
    sortOrder: 10,
    primaryCategoryId: null,
    categoryIds: [],
    modes: [
      {
        key: "classic",
        label: "Classic",
        description: "Balanced default style.",
        instruction: "Use balanced style and clear wording.",
        sortOrder: 1,
      },
    ],
    examples: [
      {
        label: "Starter",
        value: "Rewrite this sentence in the translator style.",
        sortOrder: 1,
      },
    ],
  };
}

export function TranslatorForm({ mode, initial, categories, modelOptions }: TranslatorFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const defaults = useMemo(() => createDefaultState(), []);

  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [form, setForm] = useState({
    name: initial?.name ?? defaults.name,
    slug: initial?.slug ?? defaults.slug,
    title: initial?.title ?? defaults.title,
    subtitle: initial?.subtitle ?? defaults.subtitle,
    shortDescription: initial?.shortDescription ?? defaults.shortDescription,
    sourceLabel: initial?.sourceLabel ?? defaults.sourceLabel,
    targetLabel: initial?.targetLabel ?? defaults.targetLabel,
    iconName: initial?.iconName ?? defaults.iconName,
    promptSystem: initial?.promptSystem ?? defaults.promptSystem,
    promptInstructions: initial?.promptInstructions ?? defaults.promptInstructions,
    seoTitle: initial?.seoTitle ?? defaults.seoTitle,
    seoDescription: initial?.seoDescription ?? defaults.seoDescription,
    modelOverride: initial?.modelOverride ?? defaults.modelOverride,
    isActive: initial?.isActive ?? defaults.isActive,
    isFeatured: initial?.isFeatured ?? defaults.isFeatured,
    showModeSelector: initial?.showModeSelector ?? defaults.showModeSelector,
    showSwap: initial?.showSwap ?? defaults.showSwap,
    showExamples: initial?.showExamples ?? defaults.showExamples,
    sortOrder: initial?.sortOrder ?? defaults.sortOrder,
    primaryCategoryId: initial?.primaryCategoryId ?? defaults.primaryCategoryId,
    categoryIds: initial?.categoryIds?.length ? initial.categoryIds : defaults.categoryIds,
    modes: initial?.modes?.length ? initial.modes : defaults.modes,
    examples: initial?.examples?.length ? initial.examples : defaults.examples,
  });

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateMode(index: number, patch: Partial<FormMode>) {
    setForm((current) => ({
      ...current,
      modes: current.modes.map((modeItem, idx) =>
        idx === index ? { ...modeItem, ...patch } : modeItem,
      ),
    }));
  }

  function updateExample(index: number, patch: Partial<FormExample>) {
    setForm((current) => ({
      ...current,
      examples: current.examples.map((exampleItem, idx) =>
        idx === index ? { ...exampleItem, ...patch } : exampleItem,
      ),
    }));
  }

  function toggleCategory(categoryId: string, checked: boolean) {
    setForm((current) => {
      const nextIds = checked
        ? Array.from(new Set([...current.categoryIds, categoryId]))
        : current.categoryIds.filter((id) => id !== categoryId);

      return {
        ...current,
        categoryIds: nextIds,
        primaryCategoryId:
          current.primaryCategoryId && nextIds.includes(current.primaryCategoryId)
            ? current.primaryCategoryId
            : nextIds[0] || null,
      };
    });
  }

  async function submit() {
    setBusy(true);

    const payload = {
      ...form,
      slug: slugify(form.slug || form.name),
      modes: form.modes
        .filter((modeItem) => modeItem.label.trim() && modeItem.instruction.trim())
        .map((modeItem, index) => ({
          ...modeItem,
          key: slugify(modeItem.key || modeItem.label),
          sortOrder: Number(modeItem.sortOrder) || index + 1,
        })),
      examples: form.examples
        .filter((exampleItem) => exampleItem.label.trim() && exampleItem.value.trim())
        .map((exampleItem, index) => ({
          ...exampleItem,
          sortOrder: Number(exampleItem.sortOrder) || index + 1,
        })),
      sortOrder: Number(form.sortOrder) || 0,
      primaryCategoryId: form.primaryCategoryId || null,
    };

    const endpoint = mode === "create" ? "/api/admin/translators" : `/api/admin/translators/${initial?.id}`;
    const method = mode === "create" ? "POST" : "PATCH";

    const response = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    setBusy(false);

    if (!response.ok || !result.ok) {
      toast({
        title: "Save failed",
        description: result?.error?.message || "Please review form values and try again.",
        variant: "error",
      });
      return;
    }

    toast({ title: "Translator saved", description: "Changes are now live in your dashboard." });

    if (mode === "create") {
      router.push(`/admin/translators/${result.translator.id}`);
    } else {
      router.refresh();
    }
  }

  async function duplicate() {
    if (!initial?.id) return;

    setBusy(true);
    const response = await fetch(`/api/admin/translators/${initial.id}/duplicate`, {
      method: "POST",
    });
    const result = await response.json();
    setBusy(false);

    if (!response.ok || !result.ok) {
      toast({ title: "Duplicate failed", description: "Please try again.", variant: "error" });
      return;
    }

    toast({ title: "Translator duplicated" });
    router.push(`/admin/translators/${result.translator.id}`);
  }

  async function deleteForever() {
    if (!initial?.id) return;

    setBusy(true);
    const response = await fetch(`/api/admin/translators/${initial.id}?mode=hard`, {
      method: "DELETE",
    });
    const result = await response.json();
    setBusy(false);

    if (!response.ok || !result.ok) {
      toast({ title: "Delete failed", description: "Please try again.", variant: "error" });
      return;
    }

    toast({ title: "Translator deleted" });
    router.push("/admin/translators");
  }

  async function archiveToggle() {
    if (!initial?.id) return;

    const modeValue = initial.archivedAt ? "unarchive" : "archive";
    setBusy(true);
    const response = await fetch(`/api/admin/translators/${initial.id}?mode=${modeValue}`, {
      method: "DELETE",
    });
    const result = await response.json();
    setBusy(false);

    if (!response.ok || !result.ok) {
      toast({ title: "Action failed", description: "Please try again.", variant: "error" });
      return;
    }

    toast({ title: initial.archivedAt ? "Translator restored" : "Translator archived" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-white p-6">
        <h2 className="font-display text-2xl font-semibold text-ink">Basic Info</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Name</span>
            <input
              value={form.name}
              onChange={(event) => {
                const value = event.target.value;
                setField("name", value);
                if (!slugTouched) {
                  setField("slug", slugify(value));
                }
              }}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Slug</span>
            <input
              value={form.slug}
              onChange={(event) => {
                setSlugTouched(true);
                setField("slug", slugify(event.target.value));
              }}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">Public Title</span>
            <input
              value={form.title}
              onChange={(event) => setField("title", event.target.value)}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">Public Subtitle</span>
            <textarea
              value={form.subtitle}
              onChange={(event) => setField("subtitle", event.target.value)}
              className="min-h-20 w-full rounded-xl border border-border px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">Short Description</span>
            <textarea
              value={form.shortDescription}
              onChange={(event) => setField("shortDescription", event.target.value)}
              className="min-h-20 w-full rounded-xl border border-border px-3 py-2"
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-white p-6">
        <h2 className="font-display text-2xl font-semibold text-ink">Categories & Labels</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Source Label</span>
            <input
              value={form.sourceLabel}
              onChange={(event) => setField("sourceLabel", event.target.value)}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Target Label</span>
            <input
              value={form.targetLabel}
              onChange={(event) => setField("targetLabel", event.target.value)}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">Icon Key (optional)</span>
            <input
              value={form.iconName || ""}
              onChange={(event) => setField("iconName", event.target.value)}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>

          <div className="space-y-2 rounded-xl border border-border p-3 md:col-span-2">
            <p className="text-sm font-medium text-muted-ink">Category Assignment</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => (
                <label
                  key={category.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-muted-surface px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={form.categoryIds.includes(category.id)}
                    onChange={(event) => toggleCategory(category.id, event.target.checked)}
                  />
                  {category.name}
                </label>
              ))}
            </div>
          </div>

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">Primary Category</span>
            <select
              value={form.primaryCategoryId || ""}
              onChange={(event) => setField("primaryCategoryId", event.target.value || null)}
              className="h-11 w-full rounded-xl border border-border px-3"
            >
              <option value="">Choose primary category</option>
              {categories
                .filter((category) => form.categoryIds.includes(category.id))
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-white p-6">
        <h2 className="font-display text-2xl font-semibold text-ink">AI Prompting & Model</h2>
        <div className="mt-4 space-y-4">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">System Prompt</span>
            <textarea
              value={form.promptSystem}
              onChange={(event) => setField("promptSystem", event.target.value)}
              className="min-h-28 w-full rounded-xl border border-border px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Prompt Instructions</span>
            <textarea
              value={form.promptInstructions}
              onChange={(event) => setField("promptInstructions", event.target.value)}
              className="min-h-28 w-full rounded-xl border border-border px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Model Override (optional)</span>
            <select
              value={form.modelOverride || ""}
              onChange={(event) => setField("modelOverride", event.target.value)}
              className="h-11 w-full rounded-xl border border-border px-3"
            >
              <option value="">Use global default model</option>
              {modelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-white p-6">
        <h2 className="font-display text-2xl font-semibold text-ink">Public UX Controls</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-medium text-muted-ink">
            <input
              type="checkbox"
              checked={form.showModeSelector}
              onChange={(event) => setField("showModeSelector", event.target.checked)}
            />
            Show mode selector publicly
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-medium text-muted-ink">
            <input
              type="checkbox"
              checked={form.showSwap}
              onChange={(event) => setField("showSwap", event.target.checked)}
            />
            Show swap action publicly
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-medium text-muted-ink md:col-span-2">
            <input
              type="checkbox"
              checked={form.showExamples}
              onChange={(event) => setField("showExamples", event.target.checked)}
            />
            Show example prompt chips publicly
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-white p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold text-ink">Modes & Examples</h2>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-ink">Translation Modes</p>
          {form.modes.map((modeItem, index) => (
            <div key={`mode-${index}`} className="rounded-xl border border-border bg-muted-surface p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  value={modeItem.label}
                  onChange={(event) => updateMode(index, { label: event.target.value })}
                  placeholder="Mode label"
                  className="h-10 rounded-lg border border-border px-3"
                />
                <input
                  value={modeItem.key}
                  onChange={(event) => updateMode(index, { key: slugify(event.target.value) })}
                  placeholder="mode-key"
                  className="h-10 rounded-lg border border-border px-3"
                />
                <input
                  value={modeItem.description || ""}
                  onChange={(event) => updateMode(index, { description: event.target.value })}
                  placeholder="Mode description"
                  className="h-10 rounded-lg border border-border px-3 md:col-span-2"
                />
                <textarea
                  value={modeItem.instruction}
                  onChange={(event) => updateMode(index, { instruction: event.target.value })}
                  placeholder="Instruction"
                  className="min-h-20 rounded-lg border border-border px-3 py-2 md:col-span-2"
                />
                <input
                  type="number"
                  value={modeItem.sortOrder}
                  onChange={(event) => updateMode(index, { sortOrder: Number(event.target.value) || 0 })}
                  className="h-10 rounded-lg border border-border px-3"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      modes: current.modes.filter((_, idx) => idx !== index),
                    }))
                  }
                  disabled={form.modes.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                  Remove mode
                </Button>
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setForm((current) => ({
                ...current,
                modes: [
                  ...current.modes,
                  {
                    key: `mode-${current.modes.length + 1}`,
                    label: "New Mode",
                    description: "",
                    instruction: "Provide style instruction.",
                    sortOrder: current.modes.length + 1,
                  },
                ],
              }))
            }
          >
            <Plus className="h-4 w-4" />
            Add mode
          </Button>
        </div>

        <div className="mt-8 space-y-3">
          <p className="text-sm font-medium text-muted-ink">Example Inputs</p>
          {form.examples.map((exampleItem, index) => (
            <div key={`example-${index}`} className="rounded-xl border border-border bg-muted-surface p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  value={exampleItem.label}
                  onChange={(event) => updateExample(index, { label: event.target.value })}
                  placeholder="Example label"
                  className="h-10 rounded-lg border border-border px-3"
                />
                <input
                  type="number"
                  value={exampleItem.sortOrder}
                  onChange={(event) =>
                    updateExample(index, { sortOrder: Number(event.target.value) || 0 })
                  }
                  className="h-10 rounded-lg border border-border px-3"
                />
                <textarea
                  value={exampleItem.value}
                  onChange={(event) => updateExample(index, { value: event.target.value })}
                  placeholder="Example input"
                  className="min-h-20 rounded-lg border border-border px-3 py-2 md:col-span-2"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      examples: current.examples.filter((_, idx) => idx !== index),
                    }))
                  }
                  disabled={form.examples.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                  Remove example
                </Button>
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setForm((current) => ({
                ...current,
                examples: [
                  ...current.examples,
                  {
                    label: "New Example",
                    value: "Type sample input...",
                    sortOrder: current.examples.length + 1,
                  },
                ],
              }))
            }
          >
            <Plus className="h-4 w-4" />
            Add example
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-white p-6">
        <h2 className="font-display text-2xl font-semibold text-ink">SEO & Visibility</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">SEO Title</span>
            <input
              value={form.seoTitle || ""}
              onChange={(event) => setField("seoTitle", event.target.value)}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-muted-ink">SEO Description</span>
            <textarea
              value={form.seoDescription || ""}
              onChange={(event) => setField("seoDescription", event.target.value)}
              className="min-h-20 w-full rounded-xl border border-border px-3 py-2"
            />
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-medium text-muted-ink">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setField("isActive", event.target.checked)}
            />
            Active
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-medium text-muted-ink">
            <input
              type="checkbox"
              checked={form.isFeatured}
              onChange={(event) => setField("isFeatured", event.target.checked)}
            />
            Featured
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-ink">Sort Order</span>
            <input
              type="number"
              value={form.sortOrder}
              onChange={(event) => setField("sortOrder", Number(event.target.value) || 0)}
              className="h-11 w-full rounded-xl border border-border px-3"
            />
          </label>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => void submit()} disabled={busy}>
          {busy ? "Saving..." : mode === "create" ? "Create Translator" : "Save Changes"}
        </Button>

        {mode === "edit" ? (
          <>
            <Button type="button" variant="outline" onClick={() => void duplicate()} disabled={busy}>
              <Copy className="h-4 w-4" />
              Duplicate
            </Button>
            <Button type="button" variant="outline" onClick={() => void archiveToggle()} disabled={busy}>
              {initial?.archivedAt ? "Unarchive" : "Archive"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-50"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
            >
              <Trash2 className="h-4 w-4" />
              Delete Forever
            </Button>
          </>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Permanently delete translator?"
        description="This action cannot be undone and removes related modes, examples, and logs."
        confirmLabel="Delete forever"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void deleteForever();
        }}
        variant="danger"
      />
    </div>
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
                      <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700">
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
                      <span className="text-slate-400">No</span>
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

## components/providers/toast-provider.tsx

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, CircleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: "success" | "error";
}

interface ToastOptions {
  title: string;
  description?: string;
  variant?: "success" | "error";
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(
    ({ title, description, variant = "success" }: ToastOptions) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { id, title, description, variant }]);

      window.setTimeout(() => removeToast(id), 2600);
    },
    [removeToast],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-2">
        {toasts.map((item) => {
          const isError = item.variant === "error";
          return (
            <div
              key={item.id}
              className={cn(
                "pointer-events-auto animate-toast-in rounded-xl border bg-white p-3 text-sm shadow-lg",
                isError ? "border-red-200 text-red-700" : "border-emerald-200 text-emerald-700",
              )}
              role="status"
              aria-live="polite"
            >
              <div className="flex items-start gap-2">
                {isError ? (
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <div>
                  <p className="font-semibold">{item.title}</p>
                  {item.description ? <p className="text-xs opacity-85">{item.description}</p> : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }

  return context;
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
            : "border-border bg-white text-ink hover:border-brand-300"
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
              : "border-border bg-white text-ink hover:border-brand-300"
          }`}
        >
          {category.name}
        </Link>
      ))}
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
            : "border-border bg-white text-ink hover:border-brand-300"
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
              : "border-border bg-white text-ink hover:border-brand-300"
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
            : "border-border bg-white text-ink hover:border-brand-300"
        }`}
      >
        Next
      </Link>
    </nav>
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
          className="h-12 w-full rounded-xl border border-border bg-white pl-10 pr-24 text-sm text-ink shadow-sm"
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
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-border bg-white shadow-lg">
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
      <div className="rounded-3xl border border-border bg-white p-5 shadow-[0_20px_45px_-35px_rgba(17,24,39,0.25)] sm:p-6">
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
              className="group rounded-2xl border border-border bg-muted-surface p-4 transition hover:border-brand-300 hover:bg-white"
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
      <div className="rounded-2xl border border-border bg-white p-8 text-center text-muted-ink">
        No active translators match your current filters.
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {translators.map((translator) => (
        <article
          key={translator.id}
          className="rounded-2xl border border-border bg-white p-5 shadow-[0_20px_35px_-28px_rgba(17,24,39,0.18)]"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <h2 className="font-display text-2xl font-semibold text-ink">{translator.name}</h2>
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

          <Link
            href={`/translators/${translator.slug}`}
            className="mt-4 inline-flex rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
            Open translator
          </Link>
        </article>
      ))}
    </div>
  );
}
```

## components/sections/faq.tsx

```tsx
const items = [
  {
    q: "How accurate are translations?",
    a: "StylePort aims to preserve meaning while changing tone or style. Always review output before high-stakes use.",
  },
  {
    q: "Can I manage translators myself?",
    a: "Yes. Admin users can create and edit translators, categories, models, and ad placements from the dashboard.",
  },
  {
    q: "Does StylePort support many translation styles?",
    a: "Yes. The platform is built for multiple categories such as professional, funny, historical, social, and more.",
  },
];

export function Faq() {
  return (
    <section className="mx-auto mt-10 w-full max-w-5xl px-4 sm:px-6 lg:px-8">
      <h2 className="font-display text-center text-3xl font-semibold text-ink">FAQ</h2>
      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <article key={item.q} className="rounded-2xl border border-border bg-white p-5">
            <h3 className="font-semibold text-ink">{item.q}</h3>
            <p className="mt-2 text-sm text-muted-ink">{item.a}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
```

## components/sections/footer.tsx

```tsx
interface FooterProps {
  platformName: string;
  disclaimer: string;
}

export function Footer({ platformName, disclaimer }: FooterProps) {
  return (
    <footer className="border-t border-border bg-white/70 py-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 text-center text-sm text-muted-ink sm:px-6 lg:px-8">
        <p>{disclaimer}</p>
        <p>Built for style discovery, experimentation, and high-velocity drafting workflows.</p>
        <p className="text-xs text-muted-ink/80">{platformName} platform admin dashboard enabled.</p>
      </div>
    </footer>
  );
}
```

## components/sections/hero.tsx

```tsx
interface HeroProps {
  title: string;
  subtitle: string;
}

export function Hero({ title, subtitle }: HeroProps) {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 pb-6 pt-10 sm:px-6 lg:px-8">
      <p className="text-sm font-medium text-brand-700">Translator Discovery</p>
      <h1 className="font-display mt-2 text-balance text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
        {title}
      </h1>
      <p className="mt-3 max-w-3xl text-balance text-base text-muted-ink sm:text-lg">{subtitle}</p>
    </section>
  );
}
```

## components/sections/how-it-works.tsx

```tsx
const steps = [
  {
    title: "Find a Translator",
    copy: "Search and filter by category to find the style profile that fits your intent.",
  },
  {
    title: "Enter Your Text",
    copy: "Paste source text and run translation with one tap or Ctrl/Cmd + Enter.",
  },
  {
    title: "Use the Result",
    copy: "Review, refine, and copy the transformed output instantly.",
  },
];

export function HowItWorks() {
  return (
    <section className="mx-auto mt-10 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <h2 className="font-display text-center text-3xl font-semibold text-ink">How It Works</h2>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {steps.map((step, index) => (
          <article key={step.title} className="rounded-2xl border border-border bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Step {index + 1}</p>
            <h3 className="mt-1 text-lg font-semibold text-ink">{step.title}</h3>
            <p className="mt-2 text-sm text-muted-ink">{step.copy}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
```

## components/sections/navbar.tsx

```tsx
import Link from "next/link";
import { LayoutGrid, Shield } from "lucide-react";

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

## components/shared/ad-slot.tsx

```tsx
import type { AdPlacement } from "@prisma/client";

interface AdSlotProps {
  placement: Pick<AdPlacement, "id" | "name" | "providerType" | "adSenseSlot" | "codeSnippet">;
  adSenseClientId: string;
}

export function AdSlot({ placement, adSenseClientId }: AdSlotProps) {
  if (placement.providerType === "CUSTOM_HTML" && placement.codeSnippet) {
    return (
      <div
        className="overflow-hidden rounded-2xl border border-border bg-surface"
        dangerouslySetInnerHTML={{ __html: placement.codeSnippet }}
      />
    );
  }

  if (placement.providerType === "ADSENSE" && placement.adSenseSlot) {
    return (
      <div className="rounded-2xl border border-border bg-muted-surface p-4 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-ink">Ad</p>
        <div className="mt-2 min-h-20 rounded-xl border border-dashed border-border bg-white p-4 text-sm text-muted-ink">
          {adSenseClientId ? (
            <p>AdSense slot: {placement.adSenseSlot}</p>
          ) : (
            <p>Set AdSense client ID in settings to activate this placement.</p>
          )}
        </div>
      </div>
    );
  }

  return null;
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
    <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
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
          className="rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          onClick={() => onSelect(seed.value)}
        >
          {seed.label}
        </Button>
      ))}
    </div>
  );
}
```

## components/translator/translator-card.tsx

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightLeft, Copy, Loader2, RefreshCcw, Sparkles, Trash2 } from "lucide-react";

import { useAutoResizeTextarea } from "@/hooks/use-auto-resize";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { MAX_INPUT_CHARS } from "@/lib/constants";
import type { PublicTranslator, TranslateResponse } from "@/lib/types";
import { ModeSelector } from "@/components/translator/mode-selector";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const LOADING_COPY = "Composing your translation...";

interface TranslatorCardProps {
  translator: PublicTranslator;
}

export function TranslatorCard({ translator }: TranslatorCardProps) {
  const initialMode = translator.modes[0]?.key || "";
  const storagePrefix = useMemo(() => `styleport:${translator.slug}`, [translator.slug]);

  const [inputText, setInputText] = useLocalStorage<string>(`${storagePrefix}:last-input`, "");
  const [outputText, setOutputText] = useLocalStorage<string>(`${storagePrefix}:last-output`, "");
  const [modeKey, setModeKey] = useLocalStorage<string>(`${storagePrefix}:last-mode`, initialMode);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const outputRef = useRef<HTMLTextAreaElement | null>(null);

  const { toast } = useToast();

  useAutoResizeTextarea(inputRef, inputText);
  useAutoResizeTextarea(outputRef, outputText);

  useEffect(() => {
    if (!translator.modes.some((mode) => mode.key === modeKey) && initialMode) {
      setModeKey(initialMode);
    }
  }, [initialMode, modeKey, setModeKey, translator.modes]);

  async function translate() {
    if (!inputText.trim()) {
      setError("Please enter some text first.");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: inputText,
          translatorSlug: translator.slug,
          modeKey: translator.showModeSelector ? modeKey : undefined,
        }),
      });

      const payload = (await response.json()) as TranslateResponse;

      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "We couldn't refine that text just now." : payload.error.message);
        return;
      }

      setOutputText(payload.result);
    } catch {
      setError("We couldn't refine that text just now.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSwap() {
    setInputText(outputText);
    setOutputText(inputText);
    setError(null);
  }

  async function handleCopy(value: string, label: "Input" | "Output") {
    if (!value.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      toast({
        title: `${label} copied`,
        description: `${label} text is now in your clipboard.`,
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Your browser blocked clipboard access.",
        variant: "error",
      });
    }
  }

  function handleClear() {
    setInputText("");
    setOutputText("");
    setError(null);
  }

  return (
    <section className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <Card className="overflow-hidden border-border bg-surface">
        <div className="border-b border-border px-4 py-3 sm:px-6">
          <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
            <div className="flex items-center justify-between gap-2 text-sm font-semibold uppercase tracking-wide text-muted-ink md:justify-start">
              <span>{translator.sourceLabel}</span>
              <span className="text-xs font-medium text-muted-ink md:ml-2">
                {inputText.length} / {MAX_INPUT_CHARS}
              </span>
            </div>

            {translator.showSwap ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleSwap}
                aria-label="Swap input and output"
                disabled={isLoading}
                className="mx-auto"
              >
                <ArrowRightLeft className="h-4 w-4" />
              </Button>
            ) : (
              <div className="mx-auto h-9" />
            )}

            <h2 className="text-left text-sm font-semibold uppercase tracking-wide text-muted-ink md:text-right">
              {translator.targetLabel}
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
          <div className="p-4 sm:p-6">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-ink">Original text</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => void handleCopy(inputText, "Input")}>
                <Copy className="h-4 w-4" />
                Copy
              </Button>
            </div>
            <Textarea
              ref={inputRef}
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void translate();
                }
              }}
              placeholder={`Write your ${translator.sourceLabel.toLowerCase()} text here...`}
              aria-label="Input text"
            />

            {translator.showExamples && translator.examples.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {translator.examples.map((example) => (
                  <button
                    key={example.id}
                    type="button"
                    onClick={() => setInputText(example.value)}
                    className="rounded-full border border-border bg-muted-surface px-3 py-1.5 text-xs font-medium text-muted-ink hover:border-brand-300 hover:text-ink"
                  >
                    {example.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="p-4 sm:p-6">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-ink">Translated result</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void handleCopy(outputText, "Output")}
              >
                <Copy className="h-4 w-4" />
                Copy
              </Button>
            </div>
            <Textarea
              ref={outputRef}
              value={outputText}
              onChange={() => undefined}
              readOnly
              aria-label="Output text"
              placeholder={`Your ${translator.targetLabel.toLowerCase()} text appears here...`}
              className="bg-muted-surface"
            />

            {!outputText.trim() && !isLoading ? (
              <p className="mt-3 text-xs text-muted-ink">
                Translate your text to generate an output in this style.
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border bg-muted-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => void translate()} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Translate
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void translate()}
              disabled={isLoading || !inputText.trim()}
            >
              <RefreshCcw className="h-4 w-4" />
              Regenerate
            </Button>
            <Button type="button" variant="ghost" onClick={handleClear} disabled={isLoading}>
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
          </div>

          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            {translator.showModeSelector ? (
              <ModeSelector value={modeKey} modes={translator.modes} onChange={setModeKey} />
            ) : (
              <p className="text-xs text-muted-ink">Mode selection is locked for this translator.</p>
            )}

            {isLoading ? (
              <p className="text-sm text-brand-700">{LOADING_COPY}</p>
            ) : (
              <p className="text-xs text-muted-ink">Tip: Press Ctrl/Cmd + Enter to translate quickly.</p>
            )}
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
      </Card>

      <div className="sticky bottom-3 z-20 mt-4 md:hidden">
        <Button
          type="button"
          onClick={() => void translate()}
          disabled={isLoading}
          className="h-12 w-full rounded-xl text-base"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Translate
        </Button>
      </div>
    </section>
  );
}
```

## components/translator/upload-image-button.tsx

```tsx
"use client";

import { useRef, type ChangeEvent } from "react";
import { Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";

interface UploadImageButtonProps {
  disabled?: boolean;
  loading?: boolean;
  onExtracted: (text: string) => void;
  onError: (message: string) => void;
  onLoadingChange: (loading: boolean) => void;
}

export function UploadImageButton({
  disabled,
  loading,
  onExtracted,
  onError,
  onLoadingChange,
}: UploadImageButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    onLoadingChange(true);

    const formData = new FormData();
    formData.append("image", file);

    try {
      const response = await fetch("/api/ocr", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json();

      if (!response.ok || !payload?.ok) {
        onError(payload?.error?.message || "OCR could not read this image.");
        return;
      }

      onExtracted(payload.text as string);
    } catch {
      onError("OCR could not read this image.");
    } finally {
      onLoadingChange(false);
      event.target.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        className="hidden"
        onChange={handleChange}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || loading}
        onClick={() => inputRef.current?.click()}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Upload image
      </Button>
    </>
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
        secondary: "bg-ink text-white hover:bg-slate-800",
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
        "rounded-3xl border border-border bg-white/95 shadow-[0_20px_45px_-30px_rgba(17,24,39,0.22)] backdrop-blur",
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
        "h-10 rounded-xl border border-border bg-white px-3 text-sm text-ink shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60",
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
          "flex min-h-[180px] w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm text-ink shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 disabled:cursor-not-allowed disabled:opacity-60",
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

## eslint.config.mjs

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
```

## hooks/use-auto-resize.ts

```ts
"use client";

import { useLayoutEffect, type RefObject } from "react";

export function useAutoResizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    element.style.height = "0px";
    element.style.height = `${Math.max(180, element.scrollHeight)}px`;
  }, [ref, value]);
}
```

## hooks/use-local-storage.ts

```ts
"use client";

import { useEffect, useMemo, useState } from "react";

function readFromStorage<T>(key: string, initialValue: T): T {
  if (typeof window === "undefined") {
    return initialValue;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return initialValue;
    }

    return JSON.parse(raw) as T;
  } catch {
    return initialValue;
  }
}

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const stableInitial = useMemo(() => initialValue, [initialValue]);
  const [value, setValue] = useState<T>(() => readFromStorage(key, stableInitial));

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore storage write errors.
    }
  }, [key, value]);

  return [value, setValue];
}
```

## lib/actions/auth-actions.ts

```ts
"use server";

import { signOut } from "@/auth";

export async function logoutAction() {
  await signOut({
    redirectTo: "/login",
  });
}
```

## lib/api-response.ts

```ts
import { NextResponse } from "next/server";

import type { ApiErrorCode } from "@/lib/types";

export function apiError(status: number, code: ApiErrorCode, message: string) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

export function apiOk<T extends Record<string, unknown>>(payload: T, status = 200) {
  return NextResponse.json({ ok: true, ...payload }, { status });
}
```

## lib/auth.ts

```ts
import { redirect } from "next/navigation";

import { auth } from "@/auth";

export async function requireAdminRoute() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/");
  }

  return session;
}
```

## lib/constants.ts

```ts
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "StylePort";
export const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

export const MAX_INPUT_CHARS = 5000;
export const OCR_MAX_FILE_SIZE_MB = 8;

export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
] as const;

export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_REQUESTS = 20;

export const SEO_DESCRIPTION =
  "StylePort is a discovery platform for style translators, tone converters, and creative text rewrites.";

export const DISCOVERY_DEFAULT_PAGE_SIZE = 12;
export const DISCOVERY_SUGGESTION_LIMIT = 8;

export const APP_SETTING_KEYS = {
  PLATFORM_NAME: "platformName",
  HOMEPAGE_TITLE: "homepageTitle",
  HOMEPAGE_SUBTITLE: "homepageSubtitle",
  FOOTER_DISCLAIMER: "footerDisclaimer",
  DEFAULT_TRANSLATOR_SLUG: "defaultTranslatorSlug",
  FEATURED_TRANSLATORS_ENABLED: "featuredTranslatorsEnabled",
  DEFAULT_MODEL_OVERRIDE: "defaultModelOverride",
  DISCOVERY_PAGE_SIZE: "discoveryPageSize",
  ADS_ENABLED: "adsEnabled",
  ADSENSE_CLIENT_ID: "adSenseClientId",
  CATALOG_INTRO: "catalogIntro",
} as const;

export const DEFAULT_CATEGORY_SLUGS = [
  "fancy",
  "funny",
  "professional",
  "historical",
  "roleplay",
  "casual",
  "social",
  "marketing",
] as const;

export const AD_PLACEMENT_KEYS = [
  "homepage_top",
  "homepage_between_sections",
  "translator_above_tool",
  "translator_below_tool",
  "sidebar_slot",
  "footer_slot",
  "mobile_sticky_slot",
] as const;

export const MODEL_LIST_FALLBACK = [
  "gpt-4.1-mini",
  "gpt-4.1",
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-5-mini",
  "gpt-5",
] as const;
```

## lib/data/ads.ts

```ts
import { AdDeviceType, AdPageType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ensureUniqueSlug } from "@/lib/slug";
import { getAppSettings } from "@/lib/settings";
import type { AdPlacementUpsertInput } from "@/lib/types";

export interface AdRenderContext {
  pageType: AdPageType;
  deviceType: AdDeviceType;
  categorySlug?: string;
}

export async function listAdminAds() {
  const rows = await prisma.adPlacement.findMany({
    where: { archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() || null,
  }));
}

export async function getAdById(id: string) {
  return prisma.adPlacement.findUnique({
    where: { id },
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });
}

export async function createAdPlacement(input: AdPlacementUpsertInput) {
  const key = await ensureUniqueSlug({
    desiredSlug: input.key,
    table: "adPlacement",
    field: "key",
  });

  return prisma.adPlacement.create({
    data: {
      name: input.name,
      key,
      description: input.description || null,
      pageType: input.pageType,
      deviceType: input.deviceType,
      placementType: input.placementType,
      providerType: input.providerType,
      adSenseSlot: input.adSenseSlot || null,
      codeSnippet: input.codeSnippet || null,
      categoryId: input.categoryId || null,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
    },
  });
}

export async function updateAdPlacement(id: string, input: AdPlacementUpsertInput) {
  const key = await ensureUniqueSlug({
    desiredSlug: input.key,
    table: "adPlacement",
    field: "key",
    excludeId: id,
  });

  return prisma.adPlacement.update({
    where: { id },
    data: {
      name: input.name,
      key,
      description: input.description || null,
      pageType: input.pageType,
      deviceType: input.deviceType,
      placementType: input.placementType,
      providerType: input.providerType,
      adSenseSlot: input.adSenseSlot || null,
      codeSnippet: input.codeSnippet || null,
      categoryId: input.categoryId || null,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
      archivedAt: input.isActive ? null : undefined,
    },
  });
}

export async function archiveAdPlacement(id: string) {
  return prisma.adPlacement.update({
    where: { id },
    data: {
      archivedAt: new Date(),
      isActive: false,
    },
  });
}

export async function unarchiveAdPlacement(id: string) {
  return prisma.adPlacement.update({
    where: { id },
    data: {
      archivedAt: null,
      isActive: true,
    },
  });
}

export async function hardDeleteAdPlacement(id: string) {
  return prisma.adPlacement.delete({ where: { id } });
}

export async function getRenderableAdPlacements(context: AdRenderContext) {
  const settings = await getAppSettings();
  if (!settings.adsEnabled) {
    return [];
  }

  const where: Prisma.AdPlacementWhereInput = {
    isActive: true,
    archivedAt: null,
    OR: [
      { pageType: "ALL" },
      { pageType: context.pageType },
      ...(context.categorySlug ? [{ pageType: "CATEGORY" as const }] : []),
    ],
    AND: [
      {
        OR: [{ deviceType: "ALL" }, { deviceType: context.deviceType }],
      },
    ],
  };

  const rows = await prisma.adPlacement.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      category: {
        select: { slug: true },
      },
    },
  });

  return rows.filter((item) => {
    if (item.pageType !== "CATEGORY") return true;
    if (!context.categorySlug) return false;
    return !item.category || item.category.slug === context.categorySlug;
  });
}
```

## lib/data/categories.ts

```ts
import { prisma } from "@/lib/prisma";
import { ensureUniqueSlug } from "@/lib/slug";
import type { CategoryUpsertInput } from "@/lib/types";

export async function listAdminCategories() {
  const rows = await prisma.category.findMany({
    where: { archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: { translators: true, adPlacements: true },
      },
    },
  });

  return rows.map((item) => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    archivedAt: item.archivedAt?.toISOString() || null,
  }));
}

export async function getAdminCategoryById(id: string) {
  return prisma.category.findUnique({
    where: { id },
    include: {
      _count: {
        select: { translators: true, adPlacements: true },
      },
    },
  });
}

export async function createCategory(input: CategoryUpsertInput) {
  const slug = await ensureUniqueSlug({
    desiredSlug: input.slug,
    table: "category",
    field: "slug",
  });

  return prisma.category.create({
    data: {
      name: input.name,
      slug,
      description: input.description || null,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      iconKey: input.iconKey || null,
      seoTitle: input.seoTitle || null,
      seoDescription: input.seoDescription || null,
    },
  });
}

export async function updateCategory(id: string, input: CategoryUpsertInput) {
  const slug = await ensureUniqueSlug({
    desiredSlug: input.slug,
    table: "category",
    field: "slug",
    excludeId: id,
  });

  return prisma.category.update({
    where: { id },
    data: {
      name: input.name,
      slug,
      description: input.description || null,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      iconKey: input.iconKey || null,
      seoTitle: input.seoTitle || null,
      seoDescription: input.seoDescription || null,
      archivedAt: input.isActive ? null : undefined,
    },
  });
}

export async function archiveCategory(id: string) {
  return prisma.category.update({
    where: { id },
    data: {
      archivedAt: new Date(),
      isActive: false,
    },
  });
}

export async function unarchiveCategory(id: string) {
  return prisma.category.update({
    where: { id },
    data: {
      archivedAt: null,
      isActive: true,
    },
  });
}

export async function hardDeleteCategory(id: string) {
  await prisma.translator.updateMany({
    where: { primaryCategoryId: id },
    data: { primaryCategoryId: null },
  });

  return prisma.category.delete({ where: { id } });
}

export async function getCategoryChoices() {
  return prisma.category.findMany({
    where: { isActive: true, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });
}
```

## lib/data/translators.ts

```ts
import { Prisma, TranslationStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ensureUniqueTranslatorSlug } from "@/lib/slug";
import { getAppSettings } from "@/lib/settings";
import type {
  DiscoveryQuery,
  DiscoveryResult,
  PublicTranslator,
  RuntimeTranslator,
  TranslatorListItem,
  TranslatorUpsertInput,
  UsageSeriesPoint,
} from "@/lib/types";

const publicTranslatorInclude = {
  modes: {
    select: {
      id: true,
      key: true,
      label: true,
      description: true,
      sortOrder: true,
    },
    orderBy: { sortOrder: "asc" as const },
  },
  examples: {
    select: {
      id: true,
      label: true,
      value: true,
      sortOrder: true,
    },
    orderBy: { sortOrder: "asc" as const },
  },
  primaryCategory: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  categories: {
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
    orderBy: [{ sortOrder: "asc" as const }, { category: { sortOrder: "asc" as const } }],
  },
};

function mapPublicTranslator(
  translator: Prisma.TranslatorGetPayload<{ include: typeof publicTranslatorInclude }>,
): PublicTranslator {
  return {
    id: translator.id,
    name: translator.name,
    slug: translator.slug,
    title: translator.title,
    subtitle: translator.subtitle,
    shortDescription: translator.shortDescription,
    sourceLabel: translator.sourceLabel,
    targetLabel: translator.targetLabel,
    seoTitle: translator.seoTitle,
    seoDescription: translator.seoDescription,
    isFeatured: translator.isFeatured,
    iconName: translator.iconName,
    showModeSelector: translator.showModeSelector,
    showSwap: translator.showSwap,
    showExamples: translator.showExamples,
    primaryCategory: translator.primaryCategory,
    categories: translator.categories.map((item) => item.category),
    modes: translator.modes,
    examples: translator.examples,
  };
}

function discoveryWhere(query: Pick<DiscoveryQuery, "q" | "category">): Prisma.TranslatorWhereInput {
  const where: Prisma.TranslatorWhereInput = {
    isActive: true,
    archivedAt: null,
  };

  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: "insensitive" } },
      { slug: { contains: query.q, mode: "insensitive" } },
      { shortDescription: { contains: query.q, mode: "insensitive" } },
      {
        categories: {
          some: {
            category: {
              name: { contains: query.q, mode: "insensitive" },
            },
          },
        },
      },
    ];
  }

  if (query.category) {
    where.categories = {
      some: {
        category: {
          slug: query.category,
          isActive: true,
          archivedAt: null,
        },
      },
    };
  }

  return where;
}

export async function getPublicCategories() {
  return prisma.category.findMany({
    where: {
      isActive: true,
      archivedAt: null,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      sortOrder: true,
      iconKey: true,
      seoTitle: true,
      seoDescription: true,
    },
  });
}

export async function getDiscoveryResult(query: DiscoveryQuery): Promise<DiscoveryResult> {
  const where = discoveryWhere(query);

  const [total, translators, categories] = await Promise.all([
    prisma.translator.count({ where }),
    prisma.translator.findMany({
      where,
      include: publicTranslatorInclude,
      orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    getPublicCategories(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

  return {
    translators: translators.map(mapPublicTranslator),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages,
    categories,
    q: query.q,
    category: query.category,
  };
}

export async function getSearchSuggestions(query: string, limit = 8) {
  if (!query.trim()) {
    return [];
  }

  const rows = await prisma.translator.findMany({
    where: {
      isActive: true,
      archivedAt: null,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { slug: { contains: query, mode: "insensitive" } },
        { shortDescription: { contains: query, mode: "insensitive" } },
        {
          categories: {
            some: {
              category: {
                name: { contains: query, mode: "insensitive" },
              },
            },
          },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      shortDescription: true,
      primaryCategory: {
        select: {
          name: true,
          slug: true,
        },
      },
    },
    orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
    take: limit,
  });

  return rows.map((item) => ({
    id: item.id,
    name: item.name,
    slug: item.slug,
    shortDescription: item.shortDescription,
    categoryName: item.primaryCategory?.name || null,
    categorySlug: item.primaryCategory?.slug || null,
  }));
}

export async function getFeaturedPublicTranslators(limit = 6): Promise<PublicTranslator[]> {
  const translators = await prisma.translator.findMany({
    where: {
      isActive: true,
      isFeatured: true,
      archivedAt: null,
    },
    include: publicTranslatorInclude,
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    take: limit,
  });

  return translators.map(mapPublicTranslator);
}

export async function getPublicTranslatorBySlug(slug: string): Promise<PublicTranslator | null> {
  const translator = await prisma.translator.findFirst({
    where: {
      slug,
      archivedAt: null,
      isActive: true,
    },
    include: publicTranslatorInclude,
  });

  return translator ? mapPublicTranslator(translator) : null;
}

export async function getDefaultPublicTranslator(): Promise<PublicTranslator | null> {
  const settings = await getAppSettings();

  const bySlug = await getPublicTranslatorBySlug(settings.defaultTranslatorSlug);
  if (bySlug) {
    return bySlug;
  }

  const fallback = await prisma.translator.findFirst({
    where: {
      isActive: true,
      archivedAt: null,
    },
    include: publicTranslatorInclude,
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
  });

  return fallback ? mapPublicTranslator(fallback) : null;
}

export async function getRuntimeTranslatorBySlug(slug: string): Promise<RuntimeTranslator | null> {
  const translator = await prisma.translator.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      promptSystem: true,
      promptInstructions: true,
      modelOverride: true,
      showModeSelector: true,
      isActive: true,
      archivedAt: true,
      modes: {
        select: {
          key: true,
          label: true,
          instruction: true,
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!translator || !translator.isActive || translator.archivedAt) {
    return null;
  }

  return {
    id: translator.id,
    slug: translator.slug,
    promptSystem: translator.promptSystem,
    promptInstructions: translator.promptInstructions,
    modelOverride: translator.modelOverride,
    showModeSelector: translator.showModeSelector,
    modes: translator.modes,
  };
}

export async function getDefaultRuntimeTranslator(): Promise<RuntimeTranslator | null> {
  const settings = await getAppSettings();
  const preferred = await getRuntimeTranslatorBySlug(settings.defaultTranslatorSlug);
  if (preferred) {
    return preferred;
  }

  const translator = await prisma.translator.findFirst({
    where: {
      isActive: true,
      archivedAt: null,
    },
    select: {
      id: true,
      slug: true,
      promptSystem: true,
      promptInstructions: true,
      modelOverride: true,
      showModeSelector: true,
      modes: {
        select: {
          key: true,
          label: true,
          instruction: true,
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
  });

  if (!translator) {
    return null;
  }

  return translator;
}

export async function getAdminTranslatorById(id: string) {
  return prisma.translator.findUnique({
    where: { id },
    include: {
      modes: {
        orderBy: { sortOrder: "asc" },
      },
      examples: {
        orderBy: { sortOrder: "asc" },
      },
      categories: {
        include: {
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { category: { sortOrder: "asc" } }],
      },
    },
  });
}

export async function listAdminTranslators(filters: {
  q?: string;
  status?: "all" | "active" | "inactive" | "archived";
  featured?: "all" | "featured" | "non-featured";
  category?: string;
}): Promise<TranslatorListItem[]> {
  const where: Prisma.TranslatorWhereInput = {};

  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: "insensitive" } },
      { slug: { contains: filters.q, mode: "insensitive" } },
    ];
  }

  if (filters.status === "archived") {
    where.archivedAt = { not: null };
  } else if (filters.status === "active") {
    where.archivedAt = null;
    where.isActive = true;
  } else if (filters.status === "inactive") {
    where.archivedAt = null;
    where.isActive = false;
  }

  if (filters.featured === "featured") {
    where.isFeatured = true;
  } else if (filters.featured === "non-featured") {
    where.isFeatured = false;
  }

  if (filters.category) {
    where.categories = {
      some: {
        category: {
          slug: filters.category,
        },
      },
    };
  }

  const rows = await prisma.translator.findMany({
    where,
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      isFeatured: true,
      archivedAt: true,
      updatedAt: true,
      sortOrder: true,
      categories: {
        select: {
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { sortOrder: "asc" }],
  });

  return rows.map((row) => ({
    ...row,
    categories: row.categories.map((item) => item.category),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

function normalizeTranslatorInput(input: TranslatorUpsertInput) {
  const modeRows = input.modes || [];
  const exampleRows = input.examples || [];

  const categoryIds = Array.from(new Set(input.categoryIds.filter(Boolean)));
  const primaryCategoryId =
    input.primaryCategoryId && categoryIds.includes(input.primaryCategoryId)
      ? input.primaryCategoryId
      : categoryIds[0] || null;

  return {
    ...input,
    iconName: input.iconName || null,
    seoTitle: input.seoTitle || null,
    seoDescription: input.seoDescription || null,
    modelOverride: input.modelOverride || null,
    primaryCategoryId,
    categoryIds,
    modeRows,
    exampleRows,
  };
}

export async function createTranslator(input: TranslatorUpsertInput) {
  const slug = await ensureUniqueTranslatorSlug(input.slug);
  const normalized = normalizeTranslatorInput(input);

  return prisma.translator.create({
    data: {
      name: normalized.name,
      slug,
      title: normalized.title,
      subtitle: normalized.subtitle,
      shortDescription: normalized.shortDescription,
      sourceLabel: normalized.sourceLabel,
      targetLabel: normalized.targetLabel,
      iconName: normalized.iconName,
      promptSystem: normalized.promptSystem,
      promptInstructions: normalized.promptInstructions,
      seoTitle: normalized.seoTitle,
      seoDescription: normalized.seoDescription,
      modelOverride: normalized.modelOverride,
      isActive: normalized.isActive,
      isFeatured: normalized.isFeatured,
      showModeSelector: normalized.showModeSelector,
      showSwap: normalized.showSwap,
      showExamples: normalized.showExamples,
      sortOrder: normalized.sortOrder,
      primaryCategoryId: normalized.primaryCategoryId,
      modes: {
        createMany: {
          data: normalized.modeRows,
        },
      },
      examples: {
        createMany: {
          data: normalized.exampleRows,
        },
      },
      categories: {
        create: normalized.categoryIds.map((categoryId, index) => ({
          categoryId,
          sortOrder: index + 1,
        })),
      },
    },
    include: {
      modes: { orderBy: { sortOrder: "asc" } },
      examples: { orderBy: { sortOrder: "asc" } },
      categories: {
        include: {
          category: true,
        },
      },
    },
  });
}

export async function updateTranslator(id: string, input: TranslatorUpsertInput) {
  const slug = await ensureUniqueTranslatorSlug(input.slug, { excludeId: id });
  const normalized = normalizeTranslatorInput(input);

  return prisma.$transaction(async (tx) => {
    await tx.translationMode.deleteMany({ where: { translatorId: id } });
    await tx.translatorExample.deleteMany({ where: { translatorId: id } });
    await tx.translatorCategory.deleteMany({ where: { translatorId: id } });

    return tx.translator.update({
      where: { id },
      data: {
        name: normalized.name,
        slug,
        title: normalized.title,
        subtitle: normalized.subtitle,
        shortDescription: normalized.shortDescription,
        sourceLabel: normalized.sourceLabel,
        targetLabel: normalized.targetLabel,
        iconName: normalized.iconName,
        promptSystem: normalized.promptSystem,
        promptInstructions: normalized.promptInstructions,
        seoTitle: normalized.seoTitle,
        seoDescription: normalized.seoDescription,
        modelOverride: normalized.modelOverride,
        isActive: normalized.isActive,
        isFeatured: normalized.isFeatured,
        showModeSelector: normalized.showModeSelector,
        showSwap: normalized.showSwap,
        showExamples: normalized.showExamples,
        sortOrder: normalized.sortOrder,
        archivedAt: normalized.isActive ? null : undefined,
        primaryCategoryId: normalized.primaryCategoryId,
        modes: {
          createMany: {
            data: normalized.modeRows,
          },
        },
        examples: {
          createMany: {
            data: normalized.exampleRows,
          },
        },
        categories: {
          create: normalized.categoryIds.map((categoryId, index) => ({
            categoryId,
            sortOrder: index + 1,
          })),
        },
      },
      include: {
        modes: { orderBy: { sortOrder: "asc" } },
        examples: { orderBy: { sortOrder: "asc" } },
        categories: {
          include: {
            category: true,
          },
        },
      },
    });
  });
}

export async function duplicateTranslator(id: string) {
  const translator = await prisma.translator.findUnique({
    where: { id },
    include: {
      modes: { orderBy: { sortOrder: "asc" } },
      examples: { orderBy: { sortOrder: "asc" } },
      categories: { orderBy: [{ sortOrder: "asc" }] },
    },
  });

  if (!translator) {
    return null;
  }

  const slug = await ensureUniqueTranslatorSlug(`${translator.slug}-copy`);

  return prisma.translator.create({
    data: {
      name: `${translator.name} Copy`,
      slug,
      title: translator.title,
      subtitle: translator.subtitle,
      shortDescription: translator.shortDescription,
      sourceLabel: translator.sourceLabel,
      targetLabel: translator.targetLabel,
      iconName: translator.iconName,
      promptSystem: translator.promptSystem,
      promptInstructions: translator.promptInstructions,
      modelOverride: translator.modelOverride,
      seoTitle: translator.seoTitle,
      seoDescription: translator.seoDescription,
      showModeSelector: translator.showModeSelector,
      showSwap: translator.showSwap,
      showExamples: translator.showExamples,
      isActive: false,
      isFeatured: false,
      sortOrder: translator.sortOrder + 1,
      primaryCategoryId: translator.primaryCategoryId,
      modes: {
        createMany: {
          data: translator.modes.map((mode) => ({
            key: mode.key,
            label: mode.label,
            description: mode.description,
            instruction: mode.instruction,
            sortOrder: mode.sortOrder,
          })),
        },
      },
      examples: {
        createMany: {
          data: translator.examples.map((example) => ({
            label: example.label,
            value: example.value,
            sortOrder: example.sortOrder,
          })),
        },
      },
      categories: {
        create: translator.categories.map((item) => ({
          categoryId: item.categoryId,
          sortOrder: item.sortOrder,
        })),
      },
    },
  });
}

export async function toggleTranslatorActive(id: string, active?: boolean) {
  const current = await prisma.translator.findUnique({ where: { id } });
  if (!current) {
    return null;
  }

  const next = active ?? !current.isActive;

  return prisma.translator.update({
    where: { id },
    data: {
      isActive: next,
      archivedAt: next ? null : current.archivedAt,
    },
  });
}

export async function archiveTranslator(id: string) {
  return prisma.translator.update({
    where: { id },
    data: {
      archivedAt: new Date(),
      isActive: false,
    },
  });
}

export async function unarchiveTranslator(id: string) {
  return prisma.translator.update({
    where: { id },
    data: {
      archivedAt: null,
      isActive: true,
    },
  });
}

export async function hardDeleteTranslator(id: string) {
  return prisma.translator.delete({ where: { id } });
}

export async function createTranslationLog(data: {
  translatorId: string;
  inputText: string;
  outputText?: string;
  modeUsed?: string;
  status: TranslationStatus;
  inputLength: number;
  outputLength: number;
  model?: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  estimatedCost?: number | null;
  errorCode?: string;
  latencyMs?: number;
  ipHash?: string;
  userAgent?: string;
}) {
  return prisma.translationLog.create({
    data: {
      ...data,
      outputText: data.outputText || null,
      modeUsed: data.modeUsed || null,
      model: data.model || null,
      promptTokens: data.promptTokens ?? null,
      completionTokens: data.completionTokens ?? null,
      totalTokens: data.totalTokens ?? null,
      estimatedCost: data.estimatedCost ?? null,
      errorCode: data.errorCode || null,
      latencyMs: data.latencyMs ?? null,
      ipHash: data.ipHash || null,
      userAgent: data.userAgent || null,
    },
  });
}

export async function getRecentTranslationLogs(limit = 100) {
  return prisma.translationLog.findMany({
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      translator: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });
}

export async function getAdminOverviewStats(days = 30) {
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [
    totalTranslators,
    activeTranslators,
    featuredTranslators,
    categoriesCount,
    adsCount,
    totalTranslations,
    sums,
    topTranslators,
    recent,
    groupedUsage,
  ] = await Promise.all([
    prisma.translator.count(),
    prisma.translator.count({ where: { isActive: true, archivedAt: null } }),
    prisma.translator.count({ where: { isFeatured: true, archivedAt: null } }),
    prisma.category.count({ where: { archivedAt: null } }),
    prisma.adPlacement.count({ where: { archivedAt: null } }),
    prisma.translationLog.count({ where: { createdAt: { gte: from } } }),
    prisma.translationLog.aggregate({
      where: { createdAt: { gte: from }, status: TranslationStatus.SUCCESS },
      _sum: {
        totalTokens: true,
        estimatedCost: true,
      },
    }),
    prisma.translationLog.groupBy({
      by: ["translatorId"],
      where: { createdAt: { gte: from } },
      _count: { _all: true },
      _sum: {
        totalTokens: true,
        estimatedCost: true,
      },
      orderBy: {
        _count: {
          translatorId: "desc",
        },
      },
      take: 8,
    }),
    prisma.translationLog.findMany({
      where: { createdAt: { gte: from } },
      take: 12,
      orderBy: { createdAt: "desc" },
      include: {
        translator: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    }),
    prisma.translationLog.groupBy({
      by: ["createdAt"],
      where: { createdAt: { gte: from } },
      _count: { _all: true },
      _sum: { totalTokens: true, estimatedCost: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const translatorIds = topTranslators.map((item) => item.translatorId);
  const translatorMap = new Map(
    (
      await prisma.translator.findMany({
        where: { id: { in: translatorIds } },
        select: { id: true, name: true, slug: true },
      })
    ).map((item) => [item.id, item]),
  );

  const dailyMap = new Map<string, UsageSeriesPoint>();
  for (let i = 0; i < days; i += 1) {
    const date = new Date(from);
    date.setDate(date.getDate() + i);
    const key = date.toISOString().slice(0, 10);
    dailyMap.set(key, {
      date: key,
      translations: 0,
      totalTokens: 0,
      estimatedCost: 0,
    });
  }

  for (const row of groupedUsage) {
    const key = row.createdAt.toISOString().slice(0, 10);
    const current = dailyMap.get(key);
    if (!current) continue;
    current.translations += row._count._all;
    current.totalTokens += row._sum.totalTokens || 0;
    current.estimatedCost += Number(row._sum.estimatedCost || 0);
  }

  return {
    kpis: {
      totalTranslators,
      activeTranslators,
      featuredTranslators,
      categoriesCount,
      adsCount,
      totalTranslations,
      totalTokens: sums._sum.totalTokens || 0,
      estimatedSpend: Number(sums._sum.estimatedCost || 0),
    },
    topTranslators: topTranslators.map((row) => ({
      translatorId: row.translatorId,
      name: translatorMap.get(row.translatorId)?.name || "Unknown translator",
      slug: translatorMap.get(row.translatorId)?.slug || "unknown",
      usageCount: row._count._all,
      totalTokens: row._sum.totalTokens || 0,
      estimatedSpend: Number(row._sum.estimatedCost || 0),
    })),
    series: Array.from(dailyMap.values()),
    recent: recent.map((item) => ({
      id: item.id,
      translator: item.translator,
      status: item.status,
      model: item.model,
      totalTokens: item.totalTokens || 0,
      estimatedCost: Number(item.estimatedCost || 0),
      createdAt: item.createdAt.toISOString(),
    })),
  };
}
```

## lib/model-catalog.ts

```ts
import OpenAI from "openai";

import { DEFAULT_MODEL, MODEL_LIST_FALLBACK } from "@/lib/constants";

const CACHE_TTL_MS = 5 * 60_000;

let cache: {
  expiresAt: number;
  models: string[];
} | null = null;

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  return new OpenAI({ apiKey });
}

function normalizeModelList(models: string[]) {
  return [...new Set(models)].sort((a, b) => a.localeCompare(b));
}

export async function getAvailableModels(forceRefresh = false): Promise<string[]> {
  const now = Date.now();

  if (!forceRefresh && cache && cache.expiresAt > now) {
    return cache.models;
  }

  const client = getClient();
  if (!client) {
    const fallback = normalizeModelList([DEFAULT_MODEL, ...MODEL_LIST_FALLBACK]);
    cache = { models: fallback, expiresAt: now + CACHE_TTL_MS };
    return fallback;
  }

  try {
    const response = await client.models.list();
    const modelIds = response.data
      .map((item) => item.id)
      .filter((id) => id.startsWith("gpt-"));

    const list = normalizeModelList([DEFAULT_MODEL, ...MODEL_LIST_FALLBACK, ...modelIds]);
    cache = { models: list, expiresAt: now + CACHE_TTL_MS };
    return list;
  } catch {
    const fallback = normalizeModelList([DEFAULT_MODEL, ...MODEL_LIST_FALLBACK]);
    cache = { models: fallback, expiresAt: now + CACHE_TTL_MS };
    return fallback;
  }
}
```

## lib/ocr.ts

```ts
import Tesseract from "tesseract.js";

import { normalizeWhitespace } from "@/lib/utils";

export async function extractTextFromImageBuffer(buffer: Buffer): Promise<string> {
  const result = await Tesseract.recognize(buffer, "eng", {
    logger: () => {
      // Keep OCR silent in API route logs.
    },
  });

  return normalizeWhitespace(result.data.text || "");
}
```

## lib/openai.ts

```ts
import OpenAI from "openai";

import { DEFAULT_MODEL } from "@/lib/constants";
import { toPlainText } from "@/lib/utils";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function getClient(): OpenAI {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing. Add it to your environment variables.");
  }

  return new OpenAI({ apiKey: OPENAI_API_KEY });
}

function extractTextFromResponse(response: OpenAI.Responses.Response): string {
  if (response.output_text && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const outputs = response.output ?? [];

  for (const item of outputs) {
    if (item.type !== "message") {
      continue;
    }

    for (const part of item.content ?? []) {
      if (part.type === "output_text" && part.text.trim()) {
        return part.text.trim();
      }
    }
  }

  return "";
}

function extractUsage(response: OpenAI.Responses.Response) {
  const usage = response.usage as
    | {
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
      }
    | undefined;

  return {
    promptTokens: usage?.input_tokens ?? null,
    completionTokens: usage?.output_tokens ?? null,
    totalTokens: usage?.total_tokens ?? null,
  };
}

async function tryGenerate(params: {
  client: OpenAI;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const temperature = attempt === 0 ? 0.7 : 0.45;

    const response = await params.client.responses.create({
      model: params.model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: params.systemPrompt }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: params.userPrompt }],
        },
      ],
      temperature,
      max_output_tokens: 1000,
    });

    const result = toPlainText(extractTextFromResponse(response));
    if (result) {
      return {
        text: result,
        usage: extractUsage(response),
      };
    }
  }

  return null;
}

export async function translateWithOpenAI(params: {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
}): Promise<{
  text: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}> {
  const client = getClient();
  const envModel = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const modelCandidates = Array.from(new Set([params.model, envModel, DEFAULT_MODEL].filter(Boolean))) as string[];

  let lastError: unknown;

  for (const model of modelCandidates) {
    try {
      const generated = await tryGenerate({
        client,
        model,
        systemPrompt: params.systemPrompt,
        userPrompt: params.userPrompt,
      });

      if (!generated) {
        continue;
      }

      return {
        text: generated.text,
        model,
        ...generated.usage,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Translation generation returned an empty response.");
}
```

## lib/permissions.ts

```ts
import { NextResponse } from "next/server";

import { auth } from "@/auth";

export async function getSessionOrNull() {
  return auth();
}

export async function requireUser() {
  const session = await auth();

  if (!session?.user) {
    throw new Error("UNAUTHORIZED");
  }

  return session;
}

export async function requireAdmin() {
  const session = await auth();

  if (!session?.user) {
    throw new Error("UNAUTHORIZED");
  }

  if (session.user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }

  return session;
}

export async function adminRouteGuard() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required.",
        },
      },
      { status: 401 },
    );
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Admin role required.",
        },
      },
      { status: 403 },
    );
  }

  return null;
}
```

## lib/pricing.ts

```ts
export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-4.1": { inputPer1M: 2, outputPer1M: 8 },
  "gpt-4.1-mini": { inputPer1M: 0.4, outputPer1M: 1.6 },
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10 },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "gpt-5": { inputPer1M: 5, outputPer1M: 15 },
  "gpt-5-mini": { inputPer1M: 1, outputPer1M: 3 },
};

export function estimateCost(params: {
  model: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
}): number {
  const pricing = MODEL_PRICING[params.model];
  if (!pricing) {
    return 0;
  }

  const prompt = params.promptTokens || 0;
  const completion = params.completionTokens || 0;

  if (!prompt && !completion && params.totalTokens) {
    return Number(((params.totalTokens * pricing.inputPer1M) / 1_000_000).toFixed(8));
  }

  const inputCost = (prompt * pricing.inputPer1M) / 1_000_000;
  const outputCost = (completion * pricing.outputPer1M) / 1_000_000;

  return Number((inputCost + outputCost).toFixed(8));
}
```

## lib/prisma.ts

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

## lib/prompt-builder.ts

```ts
import type { RuntimeTranslator } from "@/lib/types";

export function buildTranslatorPrompts(params: {
  translator: RuntimeTranslator;
  userText: string;
  modeKey?: string;
}) {
  const { translator, userText, modeKey } = params;

  const fallbackMode = translator.modes[0] || null;
  const selectedMode = translator.showModeSelector
    ? translator.modes.find((mode) => mode.key === modeKey) || fallbackMode
    : fallbackMode;

  const systemPrompt = [
    "You are an expert stylistic English translator.",
    "Preserve names, meaning, facts, and intent while transforming style.",
    "Output plain text only. Do not use markdown, bullets, or quote wrappers.",
    "Avoid invented content and avoid unnecessary expansion.",
    translator.promptSystem,
  ]
    .filter(Boolean)
    .join("\n");

  const userPrompt = [
    translator.promptInstructions,
    selectedMode ? `Mode: ${selectedMode.label}\nInstruction: ${selectedMode.instruction}` : "",
    "Input text:",
    userText,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    systemPrompt,
    userPrompt,
    resolvedModeKey: selectedMode?.key,
  };
}
```

## lib/prompts.ts

```ts
export const GLOBAL_STYLE_GUARDRAILS = [
  "Preserve names, facts, and semantic intent.",
  "Do not invent new content.",
  "Keep output plain text only.",
  "Avoid unnecessary verbosity.",
];

export function buildGlobalSystemPrompt(customSystem: string): string {
  return ["You are an expert stylistic English rewriter.", ...GLOBAL_STYLE_GUARDRAILS, customSystem]
    .filter(Boolean)
    .join("\n");
}
```

## lib/rate-limit.ts

```ts
import { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS } from "@/lib/constants";

interface RateRecord {
  count: number;
  resetAt: number;
}

const globalStore = globalThis as typeof globalThis & {
  __regalRateLimitStore?: Map<string, RateRecord>;
};

const store = globalStore.__regalRateLimitStore ?? new Map<string, RateRecord>();

globalStore.__regalRateLimitStore = store;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(identifier: string): RateLimitResult {
  const now = Date.now();
  const key = identifier || "anonymous";
  const current = store.get(key);

  if (!current || current.resetAt < now) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    store.set(key, { count: 1, resetAt });

    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX_REQUESTS - 1,
      resetAt,
    };
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: current.resetAt,
    };
  }

  current.count += 1;
  store.set(key, current);

  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX_REQUESTS - current.count,
    resetAt: current.resetAt,
  };
}
```

## lib/settings.ts

```ts
import { APP_NAME, APP_SETTING_KEYS, DISCOVERY_DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import type { AppSettings } from "@/lib/types";

const defaultSettings: AppSettings = {
  platformName: APP_NAME,
  homepageTitle: "Discover Translators for Every Style",
  homepageSubtitle:
    "Browse and use specialized AI translators for tone, voice, and creative transformation.",
  catalogIntro:
    "Search by style, category, or intent to find the right translator in seconds.",
  footerDisclaimer:
    "StylePort provides AI-assisted rewriting for drafting purposes. Always review outputs before critical use.",
  defaultTranslatorSlug: "regal-rewrite",
  featuredTranslatorsEnabled: true,
  defaultModelOverride: "",
  discoveryPageSize: DISCOVERY_DEFAULT_PAGE_SIZE,
  adsEnabled: false,
  adSenseClientId: "",
};

export async function getAppSettings(): Promise<AppSettings> {
  const rows = await prisma.appSetting.findMany();
  const map = new Map(rows.map((row) => [row.key, row.value]));

  return {
    platformName: (map.get(APP_SETTING_KEYS.PLATFORM_NAME) as string) || defaultSettings.platformName,
    homepageTitle:
      (map.get(APP_SETTING_KEYS.HOMEPAGE_TITLE) as string) || defaultSettings.homepageTitle,
    homepageSubtitle:
      (map.get(APP_SETTING_KEYS.HOMEPAGE_SUBTITLE) as string) || defaultSettings.homepageSubtitle,
    catalogIntro: (map.get(APP_SETTING_KEYS.CATALOG_INTRO) as string) || defaultSettings.catalogIntro,
    footerDisclaimer:
      (map.get(APP_SETTING_KEYS.FOOTER_DISCLAIMER) as string) || defaultSettings.footerDisclaimer,
    defaultTranslatorSlug:
      (map.get(APP_SETTING_KEYS.DEFAULT_TRANSLATOR_SLUG) as string) ||
      defaultSettings.defaultTranslatorSlug,
    featuredTranslatorsEnabled:
      typeof map.get(APP_SETTING_KEYS.FEATURED_TRANSLATORS_ENABLED) === "boolean"
        ? (map.get(APP_SETTING_KEYS.FEATURED_TRANSLATORS_ENABLED) as boolean)
        : defaultSettings.featuredTranslatorsEnabled,
    defaultModelOverride:
      (map.get(APP_SETTING_KEYS.DEFAULT_MODEL_OVERRIDE) as string) ||
      defaultSettings.defaultModelOverride,
    discoveryPageSize:
      typeof map.get(APP_SETTING_KEYS.DISCOVERY_PAGE_SIZE) === "number"
        ? (map.get(APP_SETTING_KEYS.DISCOVERY_PAGE_SIZE) as number)
        : defaultSettings.discoveryPageSize,
    adsEnabled:
      typeof map.get(APP_SETTING_KEYS.ADS_ENABLED) === "boolean"
        ? (map.get(APP_SETTING_KEYS.ADS_ENABLED) as boolean)
        : defaultSettings.adsEnabled,
    adSenseClientId:
      (map.get(APP_SETTING_KEYS.ADSENSE_CLIENT_ID) as string) || defaultSettings.adSenseClientId,
  };
}

export async function updateAppSettings(settings: AppSettings): Promise<void> {
  const entries = [
    [APP_SETTING_KEYS.PLATFORM_NAME, settings.platformName],
    [APP_SETTING_KEYS.HOMEPAGE_TITLE, settings.homepageTitle],
    [APP_SETTING_KEYS.HOMEPAGE_SUBTITLE, settings.homepageSubtitle],
    [APP_SETTING_KEYS.CATALOG_INTRO, settings.catalogIntro],
    [APP_SETTING_KEYS.FOOTER_DISCLAIMER, settings.footerDisclaimer],
    [APP_SETTING_KEYS.DEFAULT_TRANSLATOR_SLUG, settings.defaultTranslatorSlug],
    [APP_SETTING_KEYS.FEATURED_TRANSLATORS_ENABLED, settings.featuredTranslatorsEnabled],
    [APP_SETTING_KEYS.DEFAULT_MODEL_OVERRIDE, settings.defaultModelOverride],
    [APP_SETTING_KEYS.DISCOVERY_PAGE_SIZE, settings.discoveryPageSize],
    [APP_SETTING_KEYS.ADS_ENABLED, settings.adsEnabled],
    [APP_SETTING_KEYS.ADSENSE_CLIENT_ID, settings.adSenseClientId],
  ] as const;

  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.appSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      }),
    ),
  );
}
```

## lib/slug.ts

```ts
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slugify";

export { slugify };

export async function ensureUniqueTranslatorSlug(
  input: string,
  options?: { excludeId?: string },
): Promise<string> {
  const base = slugify(input) || "translator";
  let candidate = base;
  let counter = 2;

  while (true) {
    const existing = await prisma.translator.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!existing || existing.id === options?.excludeId) {
      return candidate;
    }

    candidate = `${base}-${counter}`;
    counter += 1;
  }
}

export async function ensureUniqueSlug(params: {
  desiredSlug: string;
  table: "category" | "adPlacement";
  field: "slug" | "key";
  excludeId?: string;
}) {
  const base =
    params.field === "key"
      ? params.desiredSlug
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9_\s-]/g, "")
          .replace(/\s+/g, "_")
          .replace(/_+/g, "_")
          .replace(/^_+|_+$/g, "")
          .slice(0, 120) || "placement"
      : slugify(params.desiredSlug) || params.field;
  let candidate = base;
  let counter = 2;

  while (true) {
    const existing =
      params.table === "category"
        ? await prisma.category.findFirst({
            where: { slug: candidate },
            select: { id: true },
          })
        : await prisma.adPlacement.findFirst({
            where: { key: candidate },
            select: { id: true },
          });

    if (!existing || existing.id === params.excludeId) {
      return candidate;
    }

    candidate = `${base}-${counter}`;
    counter += 1;
  }
}
```

## lib/slugify.ts

```ts
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}
```

## lib/types.ts

```ts
import type { Role } from "@prisma/client";

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
```

## lib/utils.ts

```ts
import crypto from "node:crypto";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function safeTrim(value: string): string {
  return value.replace(/\u0000/g, "").trim();
}

export function extractClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip") || "unknown";
}

export function toPlainText(text: string): string {
  return text
    .replace(/^```[\s\S]*?\n/gm, "")
    .replace(/```$/gm, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

export function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 24);
}

export function formatDateTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
```

## lib/validators.ts

```ts
import { z } from "zod";

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
```

## middleware.ts

```ts
import { NextResponse } from "next/server";

import { auth } from "@/auth";

export default auth((request) => {
  const pathname = request.nextUrl.pathname;
  const session = request.auth;

  if (pathname.startsWith("/admin")) {
    if (!session?.user) {
      const callbackUrl = encodeURIComponent(pathname + request.nextUrl.search);
      return NextResponse.redirect(new URL(`/login?callbackUrl=${callbackUrl}`, request.url));
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  if (pathname === "/login" && session?.user?.role === "ADMIN") {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/login"],
};
```

## next-env.d.ts

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/types/routes.d.ts";

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
```

## next.config.ts

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
```

## package.json

```json
{
  "name": "styleport-platform",
  "version": "2.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:deploy": "prisma migrate deploy",
    "prisma:seed": "prisma db seed",
    "prisma:studio": "prisma studio"
  },
  "dependencies": {
    "@auth/prisma-adapter": "^2.11.0",
    "@prisma/client": "^6.17.1",
    "bcryptjs": "^3.0.3",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^1.8.0",
    "next": "16.2.4",
    "next-auth": "^5.0.0-beta.30",
    "openai": "^6.34.0",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "tailwind-merge": "^3.5.0",
    "tesseract.js": "^7.0.0",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@types/node": "^20.19.39",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitest/coverage-v8": "^4.1.4",
    "eslint": "^9",
    "eslint-config-next": "16.2.4",
    "jsdom": "^29.0.2",
    "prettier": "^3.8.3",
    "prettier-plugin-tailwindcss": "^0.7.2",
    "prisma": "^6.17.1",
    "tailwindcss": "^4",
    "tsx": "^4.20.6",
    "typescript": "^5",
    "vitest": "^4.1.4"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

## postcss.config.mjs

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

## prisma/migrations/20260419233000_init/migration.sql

```sql
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'EDITOR', 'USER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "Session" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("sessionToken")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "Translator" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "targetLabel" TEXT NOT NULL,
    "category" TEXT,
    "iconName" TEXT,
    "promptSystem" TEXT NOT NULL,
    "promptInstructions" TEXT NOT NULL,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Translator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslationMode" (
    "id" TEXT NOT NULL,
    "translatorId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "instruction" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranslationMode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslatorExample" (
    "id" TEXT NOT NULL,
    "translatorId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranslatorExample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslationLog" (
    "id" TEXT NOT NULL,
    "translatorId" TEXT NOT NULL,
    "inputText" TEXT NOT NULL,
    "outputText" TEXT NOT NULL,
    "modeUsed" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranslationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "Translator_slug_key" ON "Translator"("slug");

-- CreateIndex
CREATE INDEX "Translator_isActive_isFeatured_sortOrder_idx" ON "Translator"("isActive", "isFeatured", "sortOrder");

-- CreateIndex
CREATE INDEX "Translator_updatedAt_idx" ON "Translator"("updatedAt");

-- CreateIndex
CREATE INDEX "TranslationMode_translatorId_sortOrder_idx" ON "TranslationMode"("translatorId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationMode_translatorId_key_key" ON "TranslationMode"("translatorId", "key");

-- CreateIndex
CREATE INDEX "TranslatorExample_translatorId_sortOrder_idx" ON "TranslatorExample"("translatorId", "sortOrder");

-- CreateIndex
CREATE INDEX "TranslationLog_translatorId_createdAt_idx" ON "TranslationLog"("translatorId", "createdAt");

-- CreateIndex
CREATE INDEX "TranslationLog_createdAt_idx" ON "TranslationLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationMode" ADD CONSTRAINT "TranslationMode_translatorId_fkey" FOREIGN KEY ("translatorId") REFERENCES "Translator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslatorExample" ADD CONSTRAINT "TranslatorExample_translatorId_fkey" FOREIGN KEY ("translatorId") REFERENCES "Translator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationLog" ADD CONSTRAINT "TranslationLog_translatorId_fkey" FOREIGN KEY ("translatorId") REFERENCES "Translator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

```

## prisma/migrations/20260420010000_styleport_upgrade/migration.sql

```sql
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
```

## prisma/migrations/migration_lock.toml

```toml
provider = "postgresql"
```

## prisma/schema.prisma

```prisma
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

## prisma/seed.ts

```ts
import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

const adminEmail = process.env.ADMIN_SEED_EMAIL || "admin@example.com";
const adminPassword = process.env.ADMIN_SEED_PASSWORD || "ChangeMe123!";

const categories = [
  {
    name: "Fancy",
    slug: "fancy",
    description: "Elegant and ornate writing transformations.",
    sortOrder: 1,
    iconKey: "sparkles",
  },
  {
    name: "Funny",
    slug: "funny",
    description: "Humorous rewrites and playful tone shifts.",
    sortOrder: 2,
    iconKey: "laugh",
  },
  {
    name: "Professional",
    slug: "professional",
    description: "Work-ready, polished, and concise language.",
    sortOrder: 3,
    iconKey: "briefcase",
  },
  {
    name: "Historical",
    slug: "historical",
    description: "Text styles inspired by historical eras.",
    sortOrder: 4,
    iconKey: "landmark",
  },
  {
    name: "Roleplay",
    slug: "roleplay",
    description: "Character and worldbuilding style conversions.",
    sortOrder: 5,
    iconKey: "masks",
  },
  {
    name: "Casual",
    slug: "casual",
    description: "Relaxed everyday language transformations.",
    sortOrder: 6,
    iconKey: "message-circle",
  },
  {
    name: "Social",
    slug: "social",
    description: "Social post and chat friendly rewrites.",
    sortOrder: 7,
    iconKey: "at-sign",
  },
  {
    name: "Marketing",
    slug: "marketing",
    description: "Promotional and conversion-focused copy styles.",
    sortOrder: 8,
    iconKey: "megaphone",
  },
];

async function seedAdmin() {
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { email: adminEmail.toLowerCase() },
    update: {
      role: Role.ADMIN,
      passwordHash,
      name: "Platform Admin",
    },
    create: {
      email: adminEmail.toLowerCase(),
      name: "Platform Admin",
      role: Role.ADMIN,
      passwordHash,
    },
  });
}

async function seedCategories() {
  for (const item of categories) {
    await prisma.category.upsert({
      where: { slug: item.slug },
      update: {
        name: item.name,
        description: item.description,
        sortOrder: item.sortOrder,
        isActive: true,
        iconKey: item.iconKey,
        archivedAt: null,
      },
      create: {
        ...item,
        isActive: true,
      },
    });
  }
}

async function upsertTranslators() {
  const categoryMap = new Map(
    (
      await prisma.category.findMany({
        select: { id: true, slug: true },
      })
    ).map((c) => [c.slug, c.id]),
  );

  const translators = [
    {
      slug: "regal-rewrite",
      name: "Regal Rewrite",
      title: "Make Everyday English Sound Utterly Refined",
      subtitle:
        "Transform plain wording into elegant, old-world prose without losing meaning.",
      shortDescription: "Turn straightforward text into polished fancy English in seconds.",
      sourceLabel: "Plain English",
      targetLabel: "Refined Output",
      iconName: "sparkles",
      promptSystem: "You are Regal Rewrite, an expert stylistic English rewriter.",
      promptInstructions:
        "Rewrite modern plain English into refined fancy English while preserving semantic intent, names, and facts. Keep output plain text only.",
      seoTitle: "Regal Rewrite Fancy English Translator",
      seoDescription:
        "Convert ordinary English into elegant fancy prose using configurable tones.",
      modelOverride: "",
      isActive: true,
      isFeatured: true,
      showModeSelector: false,
      showSwap: false,
      showExamples: false,
      sortOrder: 1,
      categorySlugs: ["fancy", "historical"],
    },
    {
      slug: "boardroom-brief",
      name: "Boardroom Brief",
      title: "Convert Draft Notes into Professional Messaging",
      subtitle: "Craft clearer executive-ready communication in one pass.",
      shortDescription:
        "Ideal for updates, stakeholder emails, and internal leadership communication.",
      sourceLabel: "Draft Text",
      targetLabel: "Professional Version",
      iconName: "briefcase",
      promptSystem:
        "You are a senior communications editor for business and enterprise writing.",
      promptInstructions:
        "Rewrite text to be concise, clear, professional, and actionable while preserving intent and key details.",
      seoTitle: "Boardroom Brief Professional Translator",
      seoDescription: "Turn rough drafts into polished professional communication.",
      modelOverride: "",
      isActive: true,
      isFeatured: true,
      showModeSelector: false,
      showSwap: true,
      showExamples: false,
      sortOrder: 2,
      categorySlugs: ["professional", "marketing"],
    },
    {
      slug: "comedy-bender",
      name: "Comedy Bender",
      title: "Rewrite Messages with Comic Flair",
      subtitle: "Inject humor without changing your core message.",
      shortDescription: "Great for playful captions, witty replies, and fun intros.",
      sourceLabel: "Original Text",
      targetLabel: "Funny Rewrite",
      iconName: "laugh",
      promptSystem: "You are a humor-focused copywriter.",
      promptInstructions:
        "Rewrite text with tasteful humor, clear punch, and readable flow. Keep core meaning intact.",
      seoTitle: "Comedy Bender Funny Translator",
      seoDescription: "Add humor and wit to your writing while preserving meaning.",
      modelOverride: "",
      isActive: true,
      isFeatured: false,
      showModeSelector: false,
      showSwap: true,
      showExamples: false,
      sortOrder: 3,
      categorySlugs: ["funny", "social", "casual"],
    },
  ];

  for (const item of translators) {
    const primaryCategorySlug = item.categorySlugs[0];
    const primaryCategoryId = primaryCategorySlug
      ? categoryMap.get(primaryCategorySlug) || null
      : null;

    const translator = await prisma.translator.upsert({
      where: { slug: item.slug },
      update: {
        name: item.name,
        title: item.title,
        subtitle: item.subtitle,
        shortDescription: item.shortDescription,
        sourceLabel: item.sourceLabel,
        targetLabel: item.targetLabel,
        iconName: item.iconName,
        promptSystem: item.promptSystem,
        promptInstructions: item.promptInstructions,
        seoTitle: item.seoTitle,
        seoDescription: item.seoDescription,
        modelOverride: item.modelOverride || null,
        isActive: item.isActive,
        isFeatured: item.isFeatured,
        showModeSelector: item.showModeSelector,
        showSwap: item.showSwap,
        showExamples: item.showExamples,
        sortOrder: item.sortOrder,
        archivedAt: null,
        primaryCategoryId,
      },
      create: {
        slug: item.slug,
        name: item.name,
        title: item.title,
        subtitle: item.subtitle,
        shortDescription: item.shortDescription,
        sourceLabel: item.sourceLabel,
        targetLabel: item.targetLabel,
        iconName: item.iconName,
        promptSystem: item.promptSystem,
        promptInstructions: item.promptInstructions,
        seoTitle: item.seoTitle,
        seoDescription: item.seoDescription,
        modelOverride: item.modelOverride || null,
        isActive: item.isActive,
        isFeatured: item.isFeatured,
        showModeSelector: item.showModeSelector,
        showSwap: item.showSwap,
        showExamples: item.showExamples,
        sortOrder: item.sortOrder,
        primaryCategoryId,
      },
    });

    await prisma.translationMode.deleteMany({ where: { translatorId: translator.id } });
    await prisma.translatorExample.deleteMany({ where: { translatorId: translator.id } });
    await prisma.translatorCategory.deleteMany({ where: { translatorId: translator.id } });

    await prisma.translationMode.createMany({
      data: [
        {
          translatorId: translator.id,
          key: "classic",
          label: "Classic",
          description: "Balanced default style",
          instruction: "Use balanced tone and readability.",
          sortOrder: 1,
        },
      ],
    });

    await prisma.translatorExample.createMany({
      data: [
        {
          translatorId: translator.id,
          label: "Starter",
          value: "Rewrite this sentence in a different style.",
          sortOrder: 1,
        },
      ],
    });

    for (const [index, slug] of item.categorySlugs.entries()) {
      const categoryId = categoryMap.get(slug);
      if (!categoryId) continue;
      await prisma.translatorCategory.create({
        data: {
          translatorId: translator.id,
          categoryId,
          sortOrder: index + 1,
        },
      });
    }
  }
}

async function seedAdPlacements() {
  const placements = [
    {
      key: "homepage_top",
      name: "Homepage Top",
      description: "Top banner on discovery home page.",
      pageType: "HOMEPAGE" as const,
      deviceType: "ALL" as const,
      placementType: "HOMEPAGE_TOP" as const,
    },
    {
      key: "homepage_between_sections",
      name: "Homepage Between Sections",
      description: "Inline slot between featured and listing sections.",
      pageType: "HOMEPAGE" as const,
      deviceType: "ALL" as const,
      placementType: "HOMEPAGE_BETWEEN_SECTIONS" as const,
    },
    {
      key: "translator_above_tool",
      name: "Translator Above Tool",
      description: "Placement above translator card.",
      pageType: "TRANSLATOR" as const,
      deviceType: "ALL" as const,
      placementType: "TRANSLATOR_ABOVE_TOOL" as const,
    },
    {
      key: "translator_below_tool",
      name: "Translator Below Tool",
      description: "Placement below translator card.",
      pageType: "TRANSLATOR" as const,
      deviceType: "ALL" as const,
      placementType: "TRANSLATOR_BELOW_TOOL" as const,
    },
    {
      key: "sidebar_slot",
      name: "Sidebar Slot",
      description: "Sidebar ad slot.",
      pageType: "ALL" as const,
      deviceType: "DESKTOP" as const,
      placementType: "SIDEBAR_SLOT" as const,
    },
    {
      key: "footer_slot",
      name: "Footer Slot",
      description: "Footer placement across pages.",
      pageType: "ALL" as const,
      deviceType: "ALL" as const,
      placementType: "FOOTER_SLOT" as const,
    },
    {
      key: "mobile_sticky_slot",
      name: "Mobile Sticky Slot",
      description: "Sticky bottom mobile ad slot.",
      pageType: "ALL" as const,
      deviceType: "MOBILE" as const,
      placementType: "MOBILE_STICKY_SLOT" as const,
    },
  ];

  for (const [index, item] of placements.entries()) {
    await prisma.adPlacement.upsert({
      where: { key: item.key },
      update: {
        name: item.name,
        description: item.description,
        pageType: item.pageType,
        deviceType: item.deviceType,
        placementType: item.placementType,
        providerType: "ADSENSE",
        isActive: false,
        sortOrder: index + 1,
        archivedAt: null,
      },
      create: {
        ...item,
        providerType: "ADSENSE",
        isActive: false,
        sortOrder: index + 1,
      },
    });
  }
}

async function seedSettings() {
  const settings = [
    { key: "platformName", value: "StylePort" },
    {
      key: "homepageTitle",
      value: "Discover Translators for Every Style",
    },
    {
      key: "homepageSubtitle",
      value:
        "Browse, filter, and use specialized translators for tone, style, and creative intent.",
    },
    {
      key: "catalogIntro",
      value:
        "Find the right translator by category, compare styles, and launch instantly.",
    },
    {
      key: "footerDisclaimer",
      value:
        "StylePort provides AI-assisted rewriting for drafting purposes. Always review outputs before critical use.",
    },
    { key: "defaultTranslatorSlug", value: "regal-rewrite" },
    { key: "featuredTranslatorsEnabled", value: true },
    { key: "defaultModelOverride", value: "" },
    { key: "discoveryPageSize", value: 12 },
    { key: "adsEnabled", value: false },
    { key: "adSenseClientId", value: "" },
  ];

  for (const setting of settings) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: setting,
    });
  }
}

async function main() {
  await seedAdmin();
  await seedCategories();
  await upsertTranslators();
  await seedAdPlacements();
  await seedSettings();

  console.log("Database seeded successfully.");
  console.log(`Admin user: ${adminEmail}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

## public/og-image.svg

```svg
<svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="120" y1="40" x2="1050" y2="590" gradientUnits="userSpaceOnUse">
      <stop stop-color="#f0f1ff"/>
      <stop offset="1" stop-color="#f7f8fc"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="90" y="90" width="1020" height="450" rx="28" fill="white" stroke="#E5E7EB"/>
  <text x="150" y="245" fill="#111827" font-size="72" font-family="Georgia, serif" font-weight="600">StylePort</text>
  <text x="150" y="315" fill="#6B7280" font-size="34" font-family="Inter, sans-serif">Discover and run translators for any tone or style.</text>
  <rect x="150" y="380" width="330" height="62" rx="12" fill="#5B5BF6"/>
  <text x="192" y="420" fill="white" font-size="30" font-family="Inter, sans-serif">Explore Translators</text>
</svg>
```

## tests/prompts.test.ts

```ts
import { describe, expect, it } from "vitest";

import { buildTranslatorPrompts } from "@/lib/prompt-builder";

describe("buildTranslatorPrompts", () => {
  const translator = {
    id: "tr_1",
    slug: "regal-rewrite",
    promptSystem: "Custom system prompt",
    promptInstructions: "Rewrite elegantly.",
    modelOverride: null,
    showModeSelector: true,
    modes: [
      {
        key: "classic-fancy",
        label: "Classic",
        instruction: "Use classic ornate style.",
      },
      {
        key: "formal",
        label: "Formal",
        instruction: "Be formal.",
      },
    ],
  };

  it("combines translator prompt layers", () => {
    const prompt = buildTranslatorPrompts({
      translator,
      userText: "hello there",
      modeKey: "formal",
    });

    expect(prompt.systemPrompt).toContain("Custom system prompt");
    expect(prompt.userPrompt).toContain("Rewrite elegantly.");
    expect(prompt.userPrompt).toContain("Mode: Formal");
    expect(prompt.userPrompt).toContain("hello there");
    expect(prompt.resolvedModeKey).toBe("formal");
  });

  it("falls back to first mode", () => {
    const prompt = buildTranslatorPrompts({
      translator,
      userText: "test",
      modeKey: "missing",
    });

    expect(prompt.resolvedModeKey).toBe("classic-fancy");
  });

  it("locks mode when selector disabled", () => {
    const prompt = buildTranslatorPrompts({
      translator: { ...translator, showModeSelector: false },
      userText: "test",
      modeKey: "formal",
    });

    expect(prompt.resolvedModeKey).toBe("classic-fancy");
  });
});
```

## tests/slug.test.ts

```ts
import { describe, expect, it } from "vitest";

import { slugify } from "@/lib/slugify";

describe("slugify", () => {
  it("normalizes labels to URL-safe slugs", () => {
    expect(slugify("Regal Rewrite 2026!")).toBe("regal-rewrite-2026");
  });

  it("trims extra separators", () => {
    expect(slugify("  --Hello   World-- ")).toBe("hello-world");
  });
});
```

## tests/translate-route.test.ts

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTranslate = vi.fn();
const mockRateLimit = vi.fn();
const mockGetRuntime = vi.fn();
const mockGetDefaultRuntime = vi.fn();
const mockCreateLog = vi.fn();
const mockSettings = vi.fn();

vi.mock("@/lib/openai", () => ({
  translateWithOpenAI: (...args: unknown[]) => mockTranslate(...args),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockRateLimit(...args),
}));

vi.mock("@/lib/data/translators", () => ({
  getRuntimeTranslatorBySlug: (...args: unknown[]) => mockGetRuntime(...args),
  getDefaultRuntimeTranslator: (...args: unknown[]) => mockGetDefaultRuntime(...args),
  createTranslationLog: (...args: unknown[]) => mockCreateLog(...args),
}));

vi.mock("@/lib/settings", () => ({
  getAppSettings: (...args: unknown[]) => mockSettings(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    translator: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

import { POST } from "@/app/api/translate/route";

describe("POST /api/translate", () => {
  beforeEach(() => {
    mockTranslate.mockReset();
    mockRateLimit.mockReset();
    mockGetRuntime.mockReset();
    mockGetDefaultRuntime.mockReset();
    mockCreateLog.mockReset();
    mockSettings.mockReset();

    mockRateLimit.mockReturnValue({ allowed: true, remaining: 19, resetAt: Date.now() + 60000 });
    mockSettings.mockResolvedValue({ defaultModelOverride: "" });
    mockCreateLog.mockResolvedValue(undefined);
  });

  it("returns 400 for empty text", async () => {
    const request = new Request("http://localhost/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "   " }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 429 when rate limited", async () => {
    mockRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 });

    const request = new Request("http://localhost/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error.code).toBe("RATE_LIMITED");
  });

  it("returns translated text on success", async () => {
    mockGetRuntime.mockResolvedValue({
      id: "tr_1",
      slug: "regal-rewrite",
      promptSystem: "System",
      promptInstructions: "Instructions",
      modelOverride: null,
      showModeSelector: false,
      modes: [
        {
          key: "classic-fancy",
          label: "Classic",
          instruction: "Use ornate style",
        },
      ],
    });

    mockTranslate.mockResolvedValue({
      text: "Pray tell, how fare you?",
      model: "gpt-4.1-mini",
      promptTokens: 20,
      completionTokens: 16,
      totalTokens: 36,
    });

    const request = new Request("http://localhost/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "how are you", translatorSlug: "regal-rewrite" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result).toContain("Pray tell");
  });

  it("returns 404 when translator missing", async () => {
    mockGetRuntime.mockResolvedValue(null);

    const request = new Request("http://localhost/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hello", translatorSlug: "missing" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
```

## tests/translator-card.test.tsx

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/providers/toast-provider";
import { TranslatorCard } from "@/components/translator/translator-card";
import type { PublicTranslator } from "@/lib/types";

const fetchMock = vi.fn();

const translator: PublicTranslator = {
  id: "tr_1",
  name: "Regal Rewrite",
  slug: "regal-rewrite",
  title: "Make Everyday English Sound Refined",
  subtitle: "Subtitle",
  shortDescription: "Description",
  sourceLabel: "Plain English",
  targetLabel: "Fancy English",
  seoTitle: null,
  seoDescription: null,
  isFeatured: true,
  iconName: "",
  showModeSelector: false,
  showSwap: true,
  showExamples: false,
  primaryCategory: null,
  categories: [],
  modes: [
    {
      id: "m1",
      key: "classic-fancy",
      label: "Classic Fancy",
      description: "desc",
      sortOrder: 1,
    },
  ],
  examples: [],
};

function renderCard() {
  return render(
    <ToastProvider>
      <TranslatorCard translator={translator} />
    </ToastProvider>,
  );
}

describe("TranslatorCard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("translates text and renders output", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: "Good morrow to you." }),
    });

    renderCard();

    const input = screen.getByLabelText("Input text");
    await userEvent.type(input, "hello there");

    await userEvent.click(screen.getAllByRole("button", { name: /^translate$/i })[0]);

    await waitFor(() => {
      expect(screen.getByLabelText("Output text")).toHaveValue("Good morrow to you.");
    });
  });

  it("supports keyboard shortcut ctrl/cmd + enter", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: "A refined line." }),
    });

    renderCard();

    const input = screen.getByLabelText("Input text");
    await userEvent.type(input, "quick line");
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it("clears persisted input and output", async () => {
    localStorage.setItem("styleport:regal-rewrite:last-input", JSON.stringify("hello"));
    localStorage.setItem("styleport:regal-rewrite:last-output", JSON.stringify("refined"));

    renderCard();

    expect(screen.getByLabelText("Input text")).toHaveValue("hello");
    expect(screen.getByLabelText("Output text")).toHaveValue("refined");

    await userEvent.click(screen.getByRole("button", { name: /clear/i }));

    expect(screen.getByLabelText("Input text")).toHaveValue("");
    expect(screen.getByLabelText("Output text")).toHaveValue("");
  });
});
```

## tests/validators.test.ts

```ts
import { describe, expect, it } from "vitest";

import { MAX_INPUT_CHARS } from "@/lib/constants";
import { translatorUpsertSchema, validateTranslateInput } from "@/lib/validators";

describe("validateTranslateInput", () => {
  it("accepts valid input", () => {
    const result = validateTranslateInput({
      text: "Hello there",
      modeKey: "classic-fancy",
      translatorSlug: "regal-rewrite",
    });

    expect(result.ok).toBe(true);
  });

  it("rejects whitespace-only input", () => {
    const result = validateTranslateInput({ text: "   " });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("rejects passage beyond max length", () => {
    const result = validateTranslateInput({ text: "a".repeat(MAX_INPUT_CHARS + 1) });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(413);
      expect(result.error.code).toBe("TOO_LONG");
    }
  });
});

describe("translatorUpsertSchema", () => {
  it("accepts robust translator payload", () => {
    const parsed = translatorUpsertSchema.safeParse({
      name: "Regal Rewrite",
      slug: "regal-rewrite",
      title: "Regal",
      subtitle: "Sub",
      shortDescription: "Desc",
      sourceLabel: "Plain",
      targetLabel: "Fancy",
      iconName: "",
      promptSystem: "System prompt with enough length",
      promptInstructions: "Instruction prompt with enough length",
      seoTitle: "",
      seoDescription: "",
      modelOverride: "",
      isActive: true,
      isFeatured: false,
      showModeSelector: false,
      showSwap: true,
      showExamples: false,
      sortOrder: 1,
      primaryCategoryId: "",
      categoryIds: ["cat_1"],
      modes: [
        {
          key: "classic-fancy",
          label: "Classic",
          description: "desc",
          instruction: "Use refined style for output",
          sortOrder: 1,
        },
      ],
      examples: [
        {
          label: "Greeting",
          value: "Hello there",
          sortOrder: 1,
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });
});
```

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2018",
    "lib": [
      "dom",
      "dom.iterable",
      "esnext"
    ],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": [
        "./*"
      ]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": [
    "node_modules"
  ]
}
```

## types/next-auth.d.ts

```ts
import { Role } from "@prisma/client";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    role: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
  }
}
```

## vitest.config.ts

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.ts", "app/api/**/*.ts", "components/**/*.tsx"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

## vitest.setup.ts

```ts
import "@testing-library/jest-dom/vitest";
```

## package-lock.json

Machine-generated and present at `/Users/zakariabelhaoua/Documents/translate/package-lock.json`.
