import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { EM_DASH_CHARACTER, sanitizeGeneratedString } from "@/lib/text-sanitizer";

const apply = process.argv.includes("--apply");
const changedRecords = new Set<string>();
let changedFields = 0;

function sanitizeFields<T extends Record<string, unknown>>(record: T, fields: Array<keyof T>) {
  const data: Partial<T> = {};
  let count = 0;
  for (const field of fields) {
    const value = record[field];
    if (typeof value !== "string" || !value.includes(EM_DASH_CHARACTER)) continue;
    data[field] = sanitizeGeneratedString(value) as T[keyof T];
    count += 1;
  }
  return { data, count };
}

const protectedJsonKeys = new Set([
  "id", "key", "slug", "token", "url", "verificationToken", "verificationTokenHash",
  "modelOverride", "logoUrl", "faviconUrl", "shareImagePath",
]);

function sanitizeCopyJson(value: unknown): { value: unknown; changed: number } {
  if (typeof value === "string") {
    const sanitized = sanitizeGeneratedString(value);
    return { value: sanitized, changed: sanitized === value ? 0 : 1 };
  }
  if (Array.isArray(value)) {
    let changed = 0;
    const result = value.map((item) => {
      const next = sanitizeCopyJson(item);
      changed += next.changed;
      return next.value;
    });
    return { value: result, changed };
  }
  if (value && typeof value === "object") {
    let changed = 0;
    const result = Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (protectedJsonKeys.has(key)) return [key, item];
      const next = sanitizeCopyJson(item);
      changed += next.changed;
      return [key, next.value];
    }));
    return { value: result, changed };
  }
  return { value, changed: 0 };
}

async function updateStringRows<T extends Record<string, unknown>>(params: {
  label: string;
  rows: T[];
  fields: Array<keyof T>;
  update: (id: string, data: Partial<T>) => Promise<unknown>;
}) {
  for (const row of params.rows) {
    const id = String(row.id);
    const sanitized = sanitizeFields(row, params.fields);
    if (!sanitized.count) continue;
    changedRecords.add(`${params.label}:${id}`);
    changedFields += sanitized.count;
    if (apply) await params.update(id, sanitized.data);
  }
}

async function main() {
  await updateStringRows({
    label: "Translator",
    rows: await prisma.translator.findMany(),
    fields: ["name", "title", "subtitle", "shortDescription", "sourceLabel", "targetLabel", "category", "promptSystem", "promptInstructions", "seoTitle", "seoDescription"],
    update: (id, data) => prisma.translator.update({ where: { id }, data }),
  });
  await updateStringRows({
    label: "TranslationMode",
    rows: await prisma.translationMode.findMany(),
    fields: ["label", "description", "instruction"],
    update: (id, data) => prisma.translationMode.update({ where: { id }, data }),
  });
  await updateStringRows({
    label: "TranslatorExample",
    rows: await prisma.translatorExample.findMany(),
    fields: ["label", "value"],
    update: (id, data) => prisma.translatorExample.update({ where: { id }, data }),
  });
  await updateStringRows({
    label: "TranslatorEditorialContent",
    rows: await prisma.translatorEditorialContent.findMany(),
    fields: ["about", "whatItDoes", "differenceDescription"],
    update: (id, data) => prisma.translatorEditorialContent.update({ where: { id }, data }),
  });
  await updateStringRows({
    label: "TranslatorEditorialList",
    rows: await prisma.translatorEditorialList.findMany(),
    fields: ["content"],
    update: (id, data) => prisma.translatorEditorialList.update({ where: { id }, data }),
  });
  await updateStringRows({
    label: "TranslatorEditorialExample",
    rows: await prisma.translatorEditorialExample.findMany(),
    fields: ["contextTitle", "originalText", "transformedText"],
    update: (id, data) => prisma.translatorEditorialExample.update({ where: { id }, data }),
  });
  await updateStringRows({
    label: "TranslatorEditorialFaq",
    rows: await prisma.translatorEditorialFaq.findMany(),
    fields: ["question", "answer"],
    update: (id, data) => prisma.translatorEditorialFaq.update({ where: { id }, data }),
  });
  await updateStringRows({
    label: "Category",
    rows: await prisma.category.findMany(),
    fields: ["name", "description", "seoTitle", "seoDescription"],
    update: (id, data) => prisma.category.update({ where: { id }, data }),
  });
  await updateStringRows({
    label: "AdPlacement",
    rows: await prisma.adPlacement.findMany(),
    fields: ["name", "description"],
    update: (id, data) => prisma.adPlacement.update({ where: { id }, data }),
  });
  await updateStringRows({
    label: "TranslationLog",
    rows: await prisma.translationLog.findMany({ where: { outputText: { contains: EM_DASH_CHARACTER } } }),
    fields: ["outputText"],
    update: (id, data) => prisma.translationLog.update({ where: { id }, data }),
  });

  const publicSettingKeys = ["platformName", "homepageTitle", "homepageSubtitle", "catalogIntro", "footerDisclaimer"];
  const settings = await prisma.appSetting.findMany({ where: { key: { in: publicSettingKeys } } });
  for (const row of settings) {
    if (typeof row.value !== "string" || !row.value.includes(EM_DASH_CHARACTER)) continue;
    changedRecords.add(`AppSetting:${row.id}`);
    changedFields += 1;
    if (apply) await prisma.appSetting.update({ where: { id: row.id }, data: { value: sanitizeGeneratedString(row.value) } });
  }

  const drafts = await prisma.translatorEditorialDraft.findMany({ select: { id: true, payload: true } });
  for (const row of drafts) {
    const sanitized = sanitizeCopyJson(row.payload);
    if (!sanitized.changed) continue;
    changedRecords.add(`TranslatorEditorialDraft:${row.id}`);
    changedFields += sanitized.changed;
    if (apply) await prisma.translatorEditorialDraft.update({ where: { id: row.id }, data: { payload: sanitized.value as Prisma.InputJsonValue } });
  }

  const requestDrafts = await prisma.translatorRequest.findMany({ where: { aiDraftJson: { not: Prisma.JsonNull } }, select: { id: true, aiDraftJson: true } });
  for (const row of requestDrafts) {
    const sanitized = sanitizeCopyJson(row.aiDraftJson);
    if (!sanitized.changed) continue;
    changedRecords.add(`TranslatorRequest:${row.id}`);
    changedFields += sanitized.changed;
    if (apply) await prisma.translatorRequest.update({ where: { id: row.id }, data: { aiDraftJson: sanitized.value as Prisma.InputJsonValue } });
  }

  console.log(`${apply ? "Applied" : "Dry run"}: ${changedRecords.size} records and ${changedFields} fields would be changed.`.replace("would be changed", apply ? "were changed" : "would be changed"));
  if (!apply) console.log("Run with --apply to persist these changes.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
