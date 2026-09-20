import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import type { TranslatorEditorialDraft } from "@/lib/types";
import { createAndProcessEditorialDraft, createEditorialJob, getEditorialDraft, publishEditorialDraft, runEditorialWorker, setEditorialDraftStatus } from "@/lib/translator-editorial-jobs";

const runDatabaseTests = process.env.RUN_EDITORIAL_DB_TESTS === "1";
const databaseDescribe = runDatabaseTests ? describe : describe.skip;
const marker = `editorial-integration-${Date.now()}`;
const createdTranslatorIds: string[] = [];
const createdJobIds: string[] = [];
const createdUserIds: string[] = [];

const complete: TranslatorEditorialDraft = {
  about: "This translator provides a detailed, practical description written specifically for the controlled persistence test.",
  whatItDoes: "It rewrites source text in a distinct style while retaining the original meaning, facts, and useful context.",
  differenceDescription: "Unlike generic rewriting, this transformation follows the configured voice and keeps the result grounded in the supplied text.",
  bestUses: ["Creating polished social media captions", "Rewriting concise public announcements"],
  howToUse: ["Paste a complete source draft first", "Review the transformed result carefully"],
  tips: ["Use clear and specific source language", "Keep every important factual detail visible"],
  examples: [
    { contextTitle: "Greeting", originalText: "Hello, thanks for joining us today.", transformedText: "Welcome—we are delighted you could join us today." },
    { contextTitle: "Request", originalText: "Please send the report this afternoon.", transformedText: "Could you share the report with us this afternoon?" },
    { contextTitle: "Update", originalText: "The launch date moved to Friday.", transformedText: "A quick update: the launch is now scheduled for Friday." },
  ],
  faq: [
    { question: "Does this preserve the original meaning?", answer: "Yes. The generated rewrite keeps the source meaning and factual details intact." },
    { question: "Can an editor revise the generated result?", answer: "Yes. Every generated result is intended to be reviewed and edited before use." },
    { question: "What kind of source text works best?", answer: "Complete, specific sentences provide the strongest context for a useful transformation." },
  ],
};

async function createTranslator(suffix: string) {
  const translator = await prisma.translator.create({ data: {
    name: `Editorial Integration ${suffix}`, slug: `${marker}-${suffix}`, title: "Controlled editorial test",
    subtitle: "Deterministic fixture only", shortDescription: "A local-only translator used to verify editorial persistence.",
    sourceLabel: "Input", targetLabel: "Output", promptSystem: "Rewrite the supplied text while preserving its meaning and facts.",
    promptInstructions: "Use the configured voice and return a clear, useful transformation.",
  } });
  createdTranslatorIds.push(translator.id);
  return translator;
}

afterAll(async () => {
  if (createdJobIds.length) await prisma.translatorEditorialJob.deleteMany({ where: { id: { in: createdJobIds } } });
  if (createdTranslatorIds.length) await prisma.translator.deleteMany({ where: { id: { in: createdTranslatorIds } } });
  if (createdUserIds.length) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

databaseDescribe("editorial persistence integration", () => {
  it("persists, reads back, reviews, and publishes an individual full draft", async () => {
    const translator = await createTranslator("full");
    const result = await createAndProcessEditorialDraft({ translatorId: translator.id, operation: "REGENERATE_FULL", generate: async () => complete });
    createdJobIds.push(result.jobId);
    expect((await getEditorialDraft(result.draftId))?.payload).toMatchObject({ about: complete.about, faq: complete.faq });
    expect(await prisma.translatorEditorialContent.findUnique({ where: { translatorId: translator.id } })).toBeNull();
    const reviewer = await prisma.user.create({ data: { email: `${marker}@example.test`, passwordHash: "not-used", role: "ADMIN" } });
    createdUserIds.push(reviewer.id);
    await setEditorialDraftStatus(result.draftId, "APPROVED", reviewer.id);
    await publishEditorialDraft(result.draftId, reviewer.id);
    const published = await prisma.translatorEditorialContent.findUnique({ where: { translatorId: translator.id } });
    expect(published?.about).toBe(complete.about);
    expect(await prisma.translatorEditorialFaq.count({ where: { translatorId: translator.id } })).toBe(3);
    const pending = await createEditorialJob({ operation: "GENERATE_MISSING", translatorIds: [translator.id] });
    createdJobIds.push(pending.id);
    await runEditorialWorker({ once: true });
    expect((await prisma.translatorEditorialJob.findUnique({ where: { id: pending.id } }))?.status).toBe("COMPLETED");
    expect((await prisma.translatorEditorialJobItem.findFirst({ where: { jobId: pending.id } }))?.status).toBe("SKIPPED");
  });

  it("preserves complete sections and fills only missing FAQ and tips", async () => {
    const translator = await createTranslator("missing");
    await prisma.translatorEditorialContent.create({ data: { translatorId: translator.id, about: complete.about, whatItDoes: complete.whatItDoes, differenceDescription: complete.differenceDescription } });
    await prisma.translatorEditorialList.createMany({ data: [...complete.bestUses.map((content, index) => ({ translatorId: translator.id, kind: "BEST_USE" as const, content, sortOrder: index })), ...complete.howToUse.map((content, index) => ({ translatorId: translator.id, kind: "HOW_TO_USE" as const, content, sortOrder: index }))] });
    await prisma.translatorEditorialExample.createMany({ data: complete.examples.map((item, index) => ({ translatorId: translator.id, ...item, sortOrder: index })) });
    const generated = { ...complete, about: `${complete.about} This replacement must not win.`, bestUses: ["A replacement best use long enough", "Another replacement best use"] };
    const result = await createAndProcessEditorialDraft({ translatorId: translator.id, operation: "GENERATE_MISSING", generate: async () => generated });
    createdJobIds.push(result.jobId);
    expect(result.editorial.about).toBe(complete.about);
    expect(result.editorial.bestUses).toEqual(complete.bestUses);
    expect(result.editorial.tips).toEqual(complete.tips);
    expect(result.editorial.faq).toEqual(complete.faq);
  });

  it("marks an item failed instead of succeeding with empty expected content", async () => {
    const translator = await createTranslator("empty");
    const empty = { about: "", whatItDoes: "", differenceDescription: "", bestUses: [], howToUse: [], tips: [], examples: [], faq: [] } as TranslatorEditorialDraft;
    await expect(createAndProcessEditorialDraft({ translatorId: translator.id, operation: "REGENERATE_ABOUT", generate: async () => empty })).rejects.toThrow("contained no content");
    const job = await prisma.translatorEditorialJob.findFirst({ where: { items: { some: { translatorId: translator.id } } }, include: { items: true }, orderBy: { createdAt: "desc" } });
    if (job) createdJobIds.push(job.id);
    expect(job?.items[0]?.status).toBe("FAILED");
    expect(await prisma.translatorEditorialDraft.count({ where: { translatorId: translator.id } })).toBe(0);
  });
});
